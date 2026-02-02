#!/usr/bin/env python3
"""
KBB (Kelley Blue Book) scraper using Camoufox (VISIBLE MODE - headless doesn't work)
Uses exact selectors found via chrome-devtools analysis
"""
import asyncio
import json
import sys
import logging
import re
from pathlib import Path

logging.basicConfig(level=logging.ERROR, format='%(message)s', stream=sys.stderr)

from camoufox.async_api import AsyncCamoufox
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)


def extract_number(text: str) -> int:
    if not text:
        return 0
    cleaned = re.sub(r'[^\d,.]', '', str(text))
    cleaned = cleaned.replace(',', '')
    try:
        return int(float(cleaned))
    except:
        return 0


async def scrape_kbb(query: str, max_results: int = 10):
    results = []

    # IMPORTANT: headless=False because camoufox crashes in headless mode
    browser = await AsyncCamoufox(headless=False, humanize=True).__aenter__()

    try:
        page = await browser.new_page()

        # Check if query is a URL or text search
        if query.startswith('http'):
            # Structured URL provided (with filters)
            search_url = query
        else:
            # Fallback to text search with nationwide radius
            search_terms = query.replace(' ', '%20')
            search_url = f"https://www.kbb.com/cars-for-sale/all?searchRadius=500&city=San%20Mateo&state=CA&zip=94401&allListingType=all&keywords={search_terms}"

        logging.error(f"[KBB] Searching: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=60000)

        # Wait for listings to load - KBB can take longer to load
        await asyncio.sleep(8)

        # Wait for at least one listing link to appear
        try:
            await page.wait_for_selector('a[href*="/cars-for-sale/vehicle/"]', timeout=10000)
        except:
            logging.error(f"[KBB] Timeout waiting for listing links")
            pass

        # Check for "No results found" condition
        page_text = await page.inner_text('body')
        no_results_indicators = [
            'No matching vehicles',
            'No results found',
            '0 results',
            'No cars found',
            'Try changing your search',
            'No exact matches'
        ]
        if any(indicator in page_text for indicator in no_results_indicators):
            logging.error(f"[KBB] No results found - returning empty")
            return []

        # KBB listings are links containing vehicle details
        # URL pattern: /cars-for-sale/vehicle/{id}
        listings = await page.query_selector_all('a[href*="/cars-for-sale/vehicle/"]')
        logging.error(f"[KBB] Found {len(listings)} listing links")

        for i, listing in enumerate(listings[:max_results]):
            try:
                # Get URL
                url = await listing.get_attribute('href') or ''
                if not url.startswith('http'):
                    url = f"https://www.kbb.com{url}"

                # Skip non-vehicle links (like "No Accidents" badge links)
                if 'purchaseConfidence' in url or 'clickType=ncb' in url:
                    continue

                # Extract basic info from the link text itself
                link_text = await listing.inner_text()

                # Skip if link text doesn't start with a year (indicates it's not a main vehicle link)
                if not re.search(r'^20\d{2}', link_text.strip()):
                    continue

                # Extract year from link text (e.g., "2022 GMC Sierra 3500")
                year_match = re.search(r'\b(20\d{2})\b', link_text)
                year = int(year_match.group(1)) if year_match else 0

                # Vehicle name from link text
                title = link_text.strip()

                # Get image - the image is in an ancestor element, not a sibling
                image = ''
                try:
                    # Try to find the image by going up the ancestor tree
                    img_src = await listing.evaluate('''
                        el => {
                            // Go up the tree and look for vehicle images in ancestors
                            for (let level = 1; level <= 8; level++) {
                                let ancestor = el;
                                for (let i = 0; i < level; i++) {
                                    if (ancestor) ancestor = ancestor.parentElement;
                                }

                                if (!ancestor) continue;

                                // Look for images in this ancestor
                                const images = ancestor.querySelectorAll('img');
                                for (const img of images) {
                                    // Check if this is a vehicle image (kbb.com domain and reasonable size)
                                    if (img.src && img.src.includes('http') && img.src.includes('kbb.com')) {
                                        // Skip ad images and small images
                                        if (!img.src.includes('116x49') && !img.src.includes('favicon')) {
                                            // Check image size if available
                                            if (img.width > 200 || img.naturalWidth > 200 || !img.width) {
                                                return img.src;
                                            }
                                        }
                                    }
                                }
                            }
                            return '';
                        }
                    ''')
                    if img_src:
                        image = img_src
                except:
                    pass

                # Now get the price and mileage from sibling elements
                # The listing card structure has the link and price as separate elements
                # We need to get the full listing card text
                price = 0
                mileage = 0

                # Try to get the listing card container (go up several levels)
                try:
                    # The link is inside a card, we need to get the card's parent
                    card_text = ''
                    for ancestor_level in range(1, 6):
                        try:
                            ancestor = await listing.evaluate(f'el => {{ let p = el; for(let i=0; i<{ancestor_level}; i++) p = p?.parentElement; return p?.innerText; }}')
                            if ancestor and len(ancestor) > 50:
                                card_text = ancestor
                                break
                        except:
                            continue

                    if card_text:
                        logging.error(f"[KBB] Card text (first 300 chars): {card_text[:300]}")

                        # Find price - KBB often has price as just a number with commas
                        # Look for patterns like: "55,778" after mileage, before "See payment"
                        # First try with $ sign
                        price_match = re.search(r'\$\s*([\d,]+)', card_text)
                        if not price_match:
                            # Try without $ sign - look for number with commas (e.g., "55,778")
                            # It's typically after mileage and before "See payment" or "Great Price"
                            price_match = re.search(r'\n\s*([\d,]+)\s*\n\s*(?:See payment|Great Price|Good Price)', card_text)
                        if not price_match:
                            # Fallback: just find a large number with commas that looks like a price
                            # Prices are typically 5-6 digits (10,000 to 999,999)
                            price_match = re.search(r'\b([\d,]{5,})\b', card_text)

                        if price_match:
                            price = extract_number(price_match.group(1))

                        # Find mileage pattern like "70K mi" or "34,000 mi"
                        mileage_match = re.search(r'(\d+[Kk]?\s*mi|[\d,]+\s*mi)', card_text, re.IGNORECASE)
                        if mileage_match:
                            mileage_text = mileage_match.group(1)
                            # Handle K notation (70K = 70000)
                            if 'K' in mileage_text.upper():
                                mileage = extract_number(mileage_text) * 1000
                            else:
                                mileage = extract_number(mileage_text)

                        logging.error(f"[KBB] Extracted: price=${price}, mileage={mileage}")
                except Exception as e:
                    logging.error(f"[KBB] Error extracting price/mileage: {e}")
                    import traceback
                    traceback.print_exc()
                    pass

                # Get location/dealer name from the card text
                location = 'KBB'
                try:
                    # Look for dealer names in card text (typically appears after price/mileage)
                    # Common patterns: "Kendall Ford of Bend", "Covina Volkswagen", etc.
                    for ancestor_level in range(1, 5):
                        try:
                            ancestor_text = await listing.evaluate(f'''
                                el => {{
                                    let p = el;
                                    for(let i=0; i<{ancestor_level}; i++) p = p?.parentElement;
                                    return p?.innerText || '';
                                }}
                            ''')
                            if ancestor_text and len(ancestor_text) > 100:
                                # Look for dealer names (multi-word, often contains brand names)
                                # Skip lines with "mi." (distance) or "delivery"
                                lines = ancestor_text.split('\n')
                                for line in lines:
                                    line = line.strip()
                                    # Look for dealer names with brand names
                                    if re.search(r'(GMC|Buick|Ford|Toyota|Honda|Volkswagen|Chevrolet|Dealer|Motors)', line, re.IGNORECASE):
                                        # Skip if it's a distance line or contains "mi." or "delivery"
                                        if not any(x in line.lower() for x in ['mi.', 'away', 'delivery', 'request info', 'more actions']):
                                            if len(line) > 5 and len(line) < 50:
                                                location = line
                                                break
                                if location != 'KBB':
                                    break
                        except:
                            continue
                except:
                    pass

                if price > 0:
                    results.append({
                        'name': title,
                        'price': price,
                        'mileage': mileage,
                        'image': image,
                        'retailer': 'KBB',
                        'url': url,
                        'location': location
                    })
                    logging.error(f"[KBB] {title[:40]} - ${price:,} - {mileage:,} mi")

            except Exception as e:
                logging.error(f"[KBB] Error extracting listing {i}: {e}")
                import traceback
                traceback.print_exc()
                continue

    except Exception as e:
        logging.error(f"[KBB] Scraping error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        await browser.close()

    return results


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: scrape-kbb.py <search query>"}))
        sys.exit(1)

    query = sys.argv[1]
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    try:
        result = await scrape_kbb(query, max_results)

        if not result:
            print(json.dumps({"error": f"No KBB listings found for '{query}'"}))
        else:
            print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
