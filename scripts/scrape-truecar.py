#!/usr/bin/env python3
"""
TrueCar scraper using Camoufox (VISIBLE MODE - headless doesn't work)
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


async def scrape_truecar(query: str, max_results: int = 10):
    results = []

    # IMPORTANT: headless=False because camoufox crashes in headless mode
    browser = await AsyncCamoufox(headless=False, humanize=True).__aenter__()

    try:
        page = await browser.new_page()
        logging.error(f"[TrueCar] Searching for: {query}")

        # Navigate to search results
        # Parse query to extract make and model for URL construction
        query_lower = query.lower()
        make = ''
        model = ''

        # Common makes
        makes = ['honda', 'toyota', 'ford', 'chevrolet', 'nissan', 'hyundai', 'kia']
        for m in makes:
            if m in query_lower:
                make = m
                # Extract model (everything after make)
                model = query_lower.replace(make, '').strip()
                break

        if make and model:
            search_url = f"https://www.truecar.com/used-cars-for-sale/listings/{make}/{model}/"
        else:
            # Fallback to search by keyword
            search_url = f"https://www.truecar.com/used-cars-for-sale/listings/?searchText={query.replace(' ', '%20')}"

        await page.goto(search_url, wait_until='domcontentloaded', timeout=60000)

        # Wait for listings to load
        await asyncio.sleep(5)

        # Find all car listings using the selector we discovered
        listings = await page.query_selector_all('[data-test="vehicleListingCard"]')
        logging.error(f"[TrueCar] Found {len(listings)} listings")

        for i, listing in enumerate(listings[:max_results]):
            try:
                # Get all text from listing for pattern matching
                all_text = await listing.inner_text()

                # Extract title (year + make + model)
                title_elem = await listing.query_selector('h3, h2')
                if title_elem:
                    title = await title_elem.inner_text()
                    title = title.strip()
                else:
                    # Fallback: extract from text
                    year_match = re.search(r'\b(19|20)\d{2}\b', all_text)
                    if year_match:
                        title = all_text.split('\n')[1] if '\n' in all_text else query
                    else:
                        title = query

                # Extract price
                price_elem = await listing.query_selector('[data-test="vehicleCardPricingPrice"]')
                price = 0
                if price_elem:
                    price_text = await price_elem.inner_text()
                    price = extract_number(price_text)

                # Extract mileage from text (format: "11,396 mi")
                mileage_match = re.search(r'(\d+[,\d]*)\s*mi', all_text, re.IGNORECASE)
                mileage = 0
                if mileage_match:
                    mileage = extract_number(mileage_match.group(1))

                # Get image
                img_elem = await listing.query_selector('img')
                image = ''
                if img_elem:
                    image = await img_elem.get_attribute('src') or ''

                # Get URL
                link_elem = await listing.query_selector('a[href*="/listing/"]')
                url = ''
                if link_elem:
                    url = await link_elem.get_attribute('href') or ''

                # Extract location (format: "14 mi away")
                location = 'TrueCar'
                location_match = re.search(r'(\d+)\s*mi\.?\s*away', all_text)
                if location_match:
                    location = f"TrueCar ({location_match.group(1)} mi away)"

                if price > 0:
                    results.append({
                        'name': title,
                        'price': price,
                        'mileage': mileage,
                        'image': image,
                        'retailer': 'TrueCar',
                        'url': url if url.startswith('http') else f"https://www.truecar.com{url}",
                        'location': location
                    })
                    logging.error(f"[TrueCar] {title[:30]} - ${price:,} - {mileage:,} mi")

            except Exception as e:
                logging.error(f"[TrueCar] Error extracting listing {i}: {e}")
                continue

    except Exception as e:
        logging.error(f"[TrueCar] Scraping error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        await browser.close()

    return results


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: scrape-truecar.py <search query>"}))
        sys.exit(1)

    query = sys.argv[1]
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    try:
        result = await scrape_truecar(query, max_results)

        if not result:
            print(json.dumps({"error": f"No TrueCar listings found for '{query}'"}))
        else:
            print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
