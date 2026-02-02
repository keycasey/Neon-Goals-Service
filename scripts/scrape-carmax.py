#!/usr/bin/env python3
"""
CarMax scraper using Camoufox (VISIBLE MODE - headless doesn't work)
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


def parse_data_clickprops(props_str: str) -> dict:
    """Parse CarMax data-clickprops attribute
    Format: 'Element type: Car Tile,StockNumber: 27818903,YMM: 2018 Honda Civic,Price: 14998,...'
    """
    data = {}
    pairs = props_str.split(',')
    for pair in pairs:
        if ':' in pair:
            key, value = pair.split(':', 1)
            data[key.strip()] = value.strip()
    return data


def vehicle_matches_filters(name: str, expected_model: str, expected_series: str) -> bool:
    """
    Check if a vehicle name matches the expected model and series.
    Examples:
    - "2024 GMC Sierra 3500 Denali Ultimate" with model="Sierra 3500", series="HD" -> True
    - "2024 GMC Sierra 2500 Denali Ultimate" with model="Sierra 3500", series="HD" -> False
    - "2024 GMC Yukon Denali Ultimate" with model="Sierra 3500", series="HD" -> False

    Note: CarMax doesn't include "HD" in vehicle names (e.g., "Sierra 3500 HD" appears as "Sierra 3500")
    So if the model matches and we're looking for HD, we accept it even without HD in the name.
    """
    if not expected_model and not expected_series:
        return True  # No filtering if no criteria specified

    name_lower = name.lower()

    # Check model match (e.g., "Sierra 3500")
    if expected_model:
        # Model should be present in the name
        # Normalize both for comparison: "sierra-3500" vs "Sierra 3500"
        normalized_expected = expected_model.replace('-', ' ').replace('_', ' ')
        if normalized_expected not in name_lower:
            return False

        # Model matched - now check if series requires additional filtering
        # For Sierra trucks, if we're looking for a specific series number, exclude others
        if 'sierra' in normalized_expected:
            # Extract the series number from expected model (e.g., "3500" from "sierra 3500")
            expected_number = None
            for num in ['1500', '2500', '3500']:
                if num in normalized_expected:
                    expected_number = num
                    break

            if expected_number:
                # Reject other Sierra series
                for other_num in ['1500', '2500', '3500']:
                    if other_num != expected_number and f'sierra {other_num}' in name_lower:
                        return False  # Wrong Sierra series

    # Check series match (e.g., "HD" for Sierra 3500HD)
    # IMPORTANT: CarMax names don't include "HD" - they show "Sierra 3500" for HD trucks
    # So if the model already matched above, we don't need to check for "HD" in the name
    # Just accept the model match as sufficient for HD series
    if expected_series:
        if expected_series == 'hd':
            # Already validated model above, CarMax doesn't put "HD" in names
            # Model match (e.g., "Sierra 3500") is sufficient
            pass  # Accept the vehicle
        elif expected_series.lower() not in name_lower:
            return False

    return True


async def scrape_carmax(search_arg: str, max_results: int = 10, search_filters: dict = None):
    results = []

    # Extract expected model/series for filtering
    expected_model = None
    expected_series = None
    if search_filters:
        expected_model = search_filters.get('model', '').lower()
        expected_series = search_filters.get('series', '').lower()

    logging.error(f"[CarMax] Expected model: {expected_model}, series: {expected_series}")

    # IMPORTANT: headless=False because camoufox crashes in headless mode
    browser = await AsyncCamoufox(headless=False, humanize=True).__aenter__()

    try:
        page = await browser.new_page()

        # Check if search_arg is a URL or a query
        if search_arg.startswith('http'):
            # Direct URL provided (structured URL from vehicle fields)
            search_url = search_arg
            logging.error(f"[CarMax] Using structured URL: {search_url}")
        else:
            # Fallback to text search
            search_url = f"https://www.carmax.com/cars/all?search={search_arg.replace(' ', '+')}"
            logging.error(f"[CarMax] Searching for: {search_arg}")

        await page.goto(search_url, wait_until='domcontentloaded', timeout=60000)

        # Wait for listings to load
        await asyncio.sleep(5)

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
            logging.error(f"[CarMax] No results found - returning empty")
            return []

        # Find all car tiles using the selector we discovered
        tiles = await page.query_selector_all('.kmx-car-tile')
        logging.error(f"[CarMax] Found {len(tiles)} listings")

        # When filtering by model/series, we need to process more tiles since many will be filtered out
        # Process up to 50 tiles to find matches, then limit results at the end
        process_limit = max(50, max_results * 10) if search_filters else max_results

        for i, tile in enumerate(tiles[:process_limit]):
            try:
                # Method 1: Extract from data-clickprops (most reliable for price/stock)
                clickprops = await tile.get_attribute('data-clickprops')
                if clickprops:
                    data = parse_data_clickprops(clickprops)
                    name = data.get('YMM', search_arg)  # Year Make Model (without trim)
                    price = extract_number(data.get('Price', '0'))
                    stock_number = data.get('StockNumber', '')
                else:
                    # Fallback: parse from page elements
                    link_elem = await tile.query_selector('a[href*="/car/"]')
                    name = await link_elem.inner_text() if link_elem else search_arg
                    price = 0
                    stock_number = ''

                # Get the full vehicle name from the tile text
                # The link element has the full name with trim (e.g., "2024 GMC Sierra 3500 Denali Ultimate")
                # But inner_text() might return split text, so we need to clean it up
                all_text = await tile.inner_text()

                # Try to extract the full vehicle name from all_text
                # Look for pattern like "2024 GMC Sierra 3500 Denali Ultimate"
                # This is typically the first meaningful line before the price
                name_match = re.search(r'(20\d{2}\s+gmc\s+sierra\s+\d{4}.+?)(?=\n|$)', all_text, re.IGNORECASE)
                if name_match:
                    full_name = name_match.group(1).strip()
                    # Clean up the name (remove extra whitespace)
                    full_name = ' '.join(full_name.split())
                    # Use this if it's longer than what we had
                    if len(full_name) > len(name):
                        name = full_name

                # Get mileage (appears in the price/mileage combo element)
                price_elem = await tile.query_selector('[class*="price"]')
                if price_elem:
                    text = await price_elem.inner_text()
                    # Text contains both price and mileage, e.g. "$14,998*\n113K mi"
                    mileage_match = re.search(r'(\d+K?)\s*mi', text, re.IGNORECASE)
                    mileage = extract_number(mileage_match.group(1)) if mileage_match else 0
                    # If mileage has K, multiply by 1000
                    if mileage_match and 'K' in mileage_match.group(1):
                        mileage = mileage * 1000
                else:
                    mileage = 0

                # Get image
                img_elem = await tile.query_selector('img')
                image = ''
                if img_elem:
                    image = await img_elem.get_attribute('src') or ''

                # Construct URL from stock number
                url = f"https://www.carmax.com/car/{stock_number}" if stock_number else ''

                # Get location (try multiple approaches)
                location = 'CarMax'
                # Look for text patterns like "CarMax Serramonte, CA"
                all_text = await tile.inner_text()
                location_match = re.search(r'CarMax\s+([^,]+),\s*([A-Z]{2})', all_text)
                if location_match:
                    location = f"CarMax {location_match.group(1)}, {location_match.group(2)}"

                # Validate that this result matches our search filters
                # Only add results that match the expected model and series
                # Debug: log the full name being checked
                if not vehicle_matches_filters(name, expected_model, expected_series):
                    logging.error(f"[CarMax] SKIP (doesn't match filters): '{name}' (looking for: '{expected_model}' series: '{expected_series}')")
                    continue

                if price > 0:
                    results.append({
                        'name': name.strip(),
                        'price': price,
                        'mileage': mileage,
                        'image': image,
                        'retailer': 'CarMax',
                        'url': url,
                        'location': location.strip()
                    })
                    logging.error(f"[CarMax] {name[:30]} - ${price:,} - {mileage:,} mi")

            except Exception as e:
                logging.error(f"[CarMax] Error extracting listing {i}: {e}")
                continue

    except Exception as e:
        logging.error(f"[CarMax] Scraping error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        await browser.close()

    # Limit results to max_results after filtering
    logging.error(f"[CarMax] Returning {len(results)} results (limited to {max_results})")
    return results[:max_results]


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: scrape-carmax.py <search query or URL> [max_results] [search_filters_json]"}))
        sys.exit(1)

    query = sys.argv[1]
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    search_filters = json.loads(sys.argv[3]) if len(sys.argv) > 3 else None

    try:
        result = await scrape_carmax(query, max_results, search_filters)

        if not result:
            print(json.dumps({"error": f"No CarMax listings found for '{query}'"}))
        else:
            print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
