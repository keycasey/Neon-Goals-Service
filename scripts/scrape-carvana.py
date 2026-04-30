#!/usr/bin/env python3
"""
Carvana scraper using Camoufox (VISIBLE MODE - headless doesn't work)
Uses exact selectors found via chrome-devtools analysis
"""
import asyncio
import base64
import json
import os
import sys
import tempfile
import logging
import re
from pathlib import Path

logging.basicConfig(level=logging.ERROR, format='%(message)s', stream=sys.stderr)

from camoufox.async_api import AsyncCamoufox
from dotenv import load_dotenv
from vehicle_listing_details import extract_exterior_color

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


def build_cvnaid_filter(make: str = None, model: str = None, max_price: int = None, mileage_max: int = None) -> str:
    filters = {}

    if max_price:
        filters['price'] = {'max': int(max_price)}
    if mileage_max:
        filters['mileage'] = {'max': int(mileage_max)}
    if make:
        make_filter = {'name': make}
        if model:
            make_filter['parentModels'] = [{'name': model}]
        filters['makes'] = [make_filter]

    if not filters:
        return ''

    payload = json.dumps({'filters': filters}, separators=(',', ':')).encode('utf-8')
    return base64.urlsafe_b64encode(payload).decode('ascii').rstrip('=')


def adapt_structured_to_carvana(structured: dict) -> str:
    """
    Convert structured query format to Carvana search query string.

    The structured format is the universal format output by parse_vehicle_query.py.
    Each scraper has its own adapter to convert this to scraper-specific params.

    Carvana specifics:
    - Uses text-based search query (like "GMC Sierra Denali black")
    - URL format: /cars/make-model-slug
    - For advanced filtering, use scrape-carvana-interactive.py instead

    Args:
        structured: The structured query dict with keys like makes, models, trims, etc.

    Returns:
        Carvana search query string
    """
    if 'url_params' in structured or 'path_components' in structured:
        path_components = structured.get('path_components', {})
        url_params = structured.get('url_params', {})
        make = path_components.get('make') or url_params.get('make') or structured.get('make')
        model = path_components.get('model') or url_params.get('model') or structured.get('model')
        color = path_components.get('exteriorColor') or url_params.get('exteriorColor') or structured.get('exteriorColor')
        max_price = url_params.get('maxPrice') or url_params.get('priceMax') or structured.get('maxPrice') or structured.get('priceMax')
        mileage_max = url_params.get('mileageMax') or url_params.get('maxMileage') or structured.get('mileageMax') or structured.get('maxMileage')
    else:
        make = structured.get('make')
        model = structured.get('model')
        color = structured.get('exteriorColor')
        max_price = structured.get('maxPrice') or structured.get('priceMax')
        mileage_max = structured.get('mileageMax') or structured.get('maxMileage')

    makes = structured.get('makes') or ([make] if make else [])
    models = structured.get('models') or ([model] if model else [])

    if makes and models:
        make_slug = str(makes[0]).lower().replace(' ', '-')
        model_slug = str(models[0]).lower().replace(' ', '-')
        has_encoded_filters = bool(max_price or mileage_max)
        url = "https://www.carvana.com/cars/filters" if has_encoded_filters else f"https://www.carvana.com/cars/{make_slug}-{model_slug}"
        query_params = []
        if color:
            color_slug = str(color).lower().replace(' ', '-')
            query_params.append("email-capture=")
            query_params.append(f"color={color_slug}")
        if has_encoded_filters:
            query_params.append(
                f"cvnaid={build_cvnaid_filter(str(makes[0]), str(models[0]), max_price, mileage_max)}"
            )
        if query_params:
            url = f"{url}?{'&'.join(query_params)}"
        return url

    parts = []

    # Add make/model/trim
    if makes:
        parts.extend(makes)

    if models:
        parts.extend(models)

    if structured.get('trims'):
        parts.extend(structured['trims'])

    # Add color
    if color:
        parts.append(color)

    # Build query
    query = ' '.join(parts)

    return query


async def scrape_carvana(query: str, max_results: int = 10):
    results = []

    # IMPORTANT: headless=False because camoufox crashes in headless mode
    browser = await AsyncCamoufox(headless=False, humanize=True).__aenter__()

    try:
        page = await browser.new_page()

        # Check if query is a URL or text search
        if query.startswith('http'):
            # Structured URL provided (with filters via cvnaid)
            search_url = query
        else:
            # Build simple make-model URL from text query
            # Carvana URL format: /cars/make-model
            query_lower = query.lower()
            search_slug = query_lower.replace(' ', '-')
            search_url = f"https://www.carvana.com/cars/{search_slug}"

        logging.error(f"[Carvana] Searching: {search_url}")
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
            logging.error(f"[Carvana] No results found - returning empty")
            return []

        # Carvana listings are links to /vehicle/ pages
        listings = await page.query_selector_all('a[href*="/vehicle/"]')
        logging.error(f"[Carvana] Found {len(listings)} listing links")

        for i, listing in enumerate(listings[:max_results]):
            try:
                # Get all text from listing for pattern matching
                all_text = await listing.inner_text()
                exterior_color = extract_exterior_color(all_text)

                # Get URL
                url = await listing.get_attribute('href') or ''
                if url and not url.startswith('http'):
                    url = f"https://www.carvana.com{url}"

                # Extract title (year + make + model + trim)
                # Format from chrome-devtools: "2023 GMC Sierra 3500 HD Crew Cab Pro 6 1/2 ft"
                # Extract year first
                year_match = re.search(r'\b(\d{4})\b', all_text)
                year = year_match.group(1) if year_match else ''

                # Build title from all text - it's typically the first meaningful text
                # Skip common labels and extract the vehicle description
                lines = [line.strip() for line in all_text.split('\n') if line.strip()]

                # Find the vehicle name (make + model + trim)
                title = ''
                for line in lines:
                    # Skip lines that are price, mileage, buttons, or labels
                    if re.search(r'^\$\d+', line):  # Price
                        continue
                    if re.search(r'\d+k?\s*miles$', line, re.IGNORECASE):  # Mileage
                        continue
                    if re.search(r'^(Estimated|Get it|Free shipping|Cash down|mo|Purchase|Recent|Price Drop|Great Deal|Favorite|On hold)', line, re.IGNORECASE):
                        continue
                    if line in ['Audi', 'BMW', 'Chevrolet', 'Ford', 'GMC', 'Honda', 'Toyota', 'Mercedes-Benz', 'Ram', 'Jeep']:
                        # Just the make name, continue to get full model line
                        continue

                    # This should be the vehicle description line
                    # Skip if it's just the year
                    if line == year:
                        continue

                    # If line looks like vehicle description (contains model words)
                    if len(line) > 10 and not line.startswith('$'):
                        title = line
                        break

                # If no title found, use query
                if not title:
                    title = query

                # Extract price (pattern: "$25,990")
                price_match = re.search(r'\$\s*([\d,]+)', all_text)
                price = 0
                if price_match:
                    price = extract_number(price_match.group(1))

                # Extract mileage (pattern: "54k miles" or "16,000 miles")
                mileage_match = re.search(r'(\d+[,\d]*)\s*(k|k)?\s*miles', all_text, re.IGNORECASE)
                mileage = 0
                if mileage_match:
                    mileage = extract_number(mileage_match.group(1))
                    if mileage_match.group(2) and 'k' in mileage_match.group(2).lower():
                        mileage = mileage * 1000

                # Get image
                img_elem = await listing.query_selector('img')
                image = ''
                if img_elem:
                    image = await img_elem.get_attribute('src') or ''

                # Carvana delivers nationally, so location is just "Carvana"
                location = 'Carvana'

                if price > 0:
                    results.append({
                        'name': title,
                        'price': price,
                        'mileage': mileage,
                        'image': image,
                        'retailer': 'Carvana',
                        'url': url,
                        'location': location,
                        'exteriorColor': exterior_color
                    })
                    logging.error(f"[Carvana] {title[:40]} - ${price:,} - {mileage:,} mi")

            except Exception as e:
                logging.error(f"[Carvana] Error extracting listing {i}: {e}")
                import traceback
                traceback.print_exc()
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
        print(json.dumps({
            "error": "Usage: scrape-carvana.py <query/URL/structured> [max_results]",
            "examples": [
                "scrape-carvana.py 'GMC Sierra Denali'",
                "scrape-carvana.py 'https://www.carvana.com/cars/gmc-sierra-3500'",
                "scrape-carvana.py '{\"structured\": {...}}'  # From parse_vehicle_query.py"
            ]
        }))
        sys.exit(1)

    query_input = sys.argv[1]
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    # Parse input to determine if it's URL, structured JSON, or plain query
    query = query_input

    if query_input.strip().startswith('{'):
        # JSON format - either old {"structured": {...}} or new direct format
        try:
            structured_data = json.loads(query_input)
            if 'structured' in structured_data:
                # Old format: Use adapter to convert structured to Carvana query
                query = adapt_structured_to_carvana(structured_data['structured'])
            else:
                # New format: Direct Carvana-specific keys from LLM.
                query = adapt_structured_to_carvana(structured_data)
        except json.JSONDecodeError:
            query = query_input
    elif not query_input.startswith('http'):
        # Plain text query - use as-is
        query = query_input

    try:
        result = await scrape_carvana(query, max_results)

        if not result:
            print(json.dumps({"error": f"No Carvana listings found for '{query}'"}))
            sys.stdout.flush()
        else:
            output = json.dumps(result, indent=2)
            print(output)
            sys.stdout.flush()
            # Also write to temp file as backup
            with open(f"/tmp/scraper_output_{os.getpid()}.json", "w") as f:
                f.write(output)
                f.flush()
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
