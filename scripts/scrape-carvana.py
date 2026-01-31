#!/usr/bin/env python3
"""
Carvana scraper using Camoufox (VISIBLE MODE - headless doesn't work)
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


async def scrape_carvana(query: str, max_results: int = 10):
    results = []

    # IMPORTANT: headless=False because camoufox crashes in headless mode
    browser = await AsyncCamoufox(headless=False, humanize=True).__aenter__()

    try:
        page = await browser.new_page()
        logging.error(f"[Carvana] Searching for: {query}")

        # Navigate to search results
        # Parse query to extract make and model for URL construction
        query_lower = query.lower()

        # Carvana URL format: /cars/make-model
        # Convert "honda civic" to "honda-civic"
        search_slug = query_lower.replace(' ', '-')
        search_url = f"https://www.carvana.com/cars/{search_slug}"

        await page.goto(search_url, wait_until='domcontentloaded', timeout=60000)

        # Wait for listings to load
        await asyncio.sleep(5)

        # Find all car listings using the selector we discovered
        listings = await page.query_selector_all('a[href*="/vehicle/"]')
        logging.error(f"[Carvana] Found {len(listings)} listings")

        for i, listing in enumerate(listings[:max_results]):
            try:
                # Get all text from listing for pattern matching
                all_text = await listing.inner_text()

                # Extract title (year + make + model)
                title_match = re.search(r'(\d{4})\s+(\w+)\s+(\w+)', all_text)
                if title_match:
                    title = f"{title_match.group(1)} {title_match.group(2)} {title_match.group(3)}"
                else:
                    title = query

                # Extract price (pattern: "$25,990")
                price_match = re.search(r'\$(\d+[,\d]*)', all_text)
                price = 0
                if price_match:
                    price = extract_number(price_match.group(1))

                # Extract mileage (pattern: "14k miles")
                mileage_match = re.search(r'(\d+)k\s*miles', all_text, re.IGNORECASE)
                mileage = 0
                if mileage_match:
                    mileage = extract_number(mileage_match.group(1)) * 1000

                # Get image
                img_elem = await listing.query_selector('img')
                image = ''
                if img_elem:
                    image = await img_elem.get_attribute('src') or ''

                # Get URL
                url = await listing.get_attribute('href') or ''

                # Carvana delivers nationally, so location is just "Carvana"
                location = 'Carvana'

                if price > 0:
                    results.append({
                        'name': title,
                        'price': price,
                        'mileage': mileage,
                        'image': image,
                        'retailer': 'Carvana',
                        'url': url if url.startswith('http') else f"https://www.carvana.com{url}",
                        'location': location
                    })
                    logging.error(f"[Carvana] {title[:30]} - ${price:,} - {mileage:,} mi")

            except Exception as e:
                logging.error(f"[Carvana] Error extracting listing {i}: {e}")
                continue

    except Exception as e:
        logging.error(f"[Carvana] Scraping error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        await browser.close()

    return results


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: scrape-carvana.py <search query>"}))
        sys.exit(1)

    query = sys.argv[1]
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    try:
        result = await scrape_carvana(query, max_results)

        if not result:
            print(json.dumps({"error": f"No Carvana listings found for '{query}'"}))
        else:
            print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
