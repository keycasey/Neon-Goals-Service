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
        logging.error(f"[KBB] Searching for: {query}")

        # Navigate to search results
        # KBB uses different URL structure - need to construct proper search URL
        search_terms = query.replace(' ', '%20')
        search_url = f"https://www.kbb.com/cars-for-sale/all?searchRadius=75&city=San%20Mateo&state=CA&zip=94401&allListingType=all&keywords={search_terms}"
        await page.goto(search_url, wait_until='domcontentloaded', timeout=60000)

        # Wait for listings to load
        await asyncio.sleep(5)

        # Find all car listings using the selector we discovered
        listings = await page.query_selector_all('.inventory-listing')
        logging.error(f"[KBB] Found {len(listings)} listings")

        for i, listing in enumerate(listings[:max_results]):
            try:
                # Get all text from listing for pattern matching
                all_text = await listing.inner_text()

                # Extract title (year + make + model)
                title_elem = await listing.query_selector('.text-bold')
                if title_elem:
                    title = await title_elem.inner_text()
                    title = title.strip()
                else:
                    title = query

                # Extract price
                price_elem = await listing.query_selector('[class*="price"]')
                price = 0
                if price_elem:
                    price_text = await price_elem.inner_text()
                    price = extract_number(price_text)

                # Extract mileage from text (format: "60K mi" or "3 mi")
                mileage_match = re.search(r'(\d+[,\d]*)\s*(K|k)?\s*mi', all_text, re.IGNORECASE)
                mileage = 0
                if mileage_match:
                    mileage = extract_number(mileage_match.group(1))
                    # If has K suffix, multiply by 1000
                    if mileage_match.group(2):
                        mileage = mileage * 1000

                # Get image
                img_elem = await listing.query_selector('img')
                image = ''
                if img_elem:
                    image = await img_elem.get_attribute('src') or ''

                # Get URL
                link_elem = await listing.query_selector('a[href*="/cars-for-sale/"]')
                url = ''
                if link_elem:
                    url = await link_elem.get_attribute('href') or ''

                # Extract dealer name (appears before phone number in format "(XXX) XXX-XXXX")
                dealer = 'KBB'
                dealer_match = re.search(r'([\w\s&]+?)\n\(?\d{3}\)?', all_text)
                if dealer_match:
                    dealer = dealer_match.group(1).strip()
                    # Clean up common prefixes
                    dealer = re.sub(r'^(Sponsored by|at)\s+', '', dealer)

                # Also try to get distance
                distance_match = re.search(r'(\d+\.?\d*)\s*mi\.\s*away', all_text)
                if distance_match:
                    distance = distance_match.group(1)
                    dealer = f"{dealer} ({distance} mi away)"

                if price > 0:
                    results.append({
                        'name': title,
                        'price': price,
                        'mileage': mileage,
                        'image': image,
                        'retailer': 'KBB',
                        'url': url if url.startswith('http') else f"https://www.kbb.com{url}",
                        'location': dealer
                    })
                    logging.error(f"[KBB] {title[:30]} - ${price:,} - {mileage:,} mi - {dealer[:20]}")

            except Exception as e:
                logging.error(f"[KBB] Error extracting listing {i}: {e}")
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
