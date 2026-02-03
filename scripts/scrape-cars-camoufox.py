#!/usr/bin/env python3
"""
Car scraping script using Camoufox (stealth Firefox)
Zero cost per scrape - uses direct Playwright API without AI
"""
import asyncio
import json
import sys
import logging
import re
from pathlib import Path

# Suppress logs to stderr
logging.basicConfig(
    level=logging.ERROR,
    format='%(message)s',
    stream=sys.stderr
)

from camoufox.async_api import AsyncCamoufox
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)


def extract_number(text: str) -> int:
    """Extract number from text like '$20,000' or '20,000 mi'"""
    if not text:
        return 0
    # Remove all non-digit characters except commas and periods
    cleaned = re.sub(r'[^\d,.]', '', text)
    # Remove commas
    cleaned = cleaned.replace(',', '')
    try:
        return int(float(cleaned))
    except (ValueError, AttributeError):
        return 0


async def scrape_cars(search_filters: dict, max_results: int = 3):
    """Scrape car listings from CarGurus using Camoufox

    Args:
        search_filters: Dict with make, model, zip, etc.
        max_results: Maximum number of results to return
    """

    results = []
    browser = None

    # Extract filters with defaults
    make = search_filters.get('make', '')
    model = search_filters.get('model', '')
    zip_code = search_filters.get('zip', '94002')  # Default to user's area
    distance = search_filters.get('distance', 100)
    year_min = search_filters.get('yearMin', '')
    year_max = search_filters.get('yearMax', '')
    price_max = search_filters.get('maxPrice', '')

    try:
        # Launch Camoufox - headless=False to avoid crashes
        logging.error(f"Launching Camoufox for: {make} {model}")
        browser = await AsyncCamoufox(
            headless=False,   # VISIBLE mode - headless crashes on CarGurus
            humanize=True,   # Human-like mouse movements
        ).__aenter__()

        page = await browser.new_page()
        logging.error("Browser launched, navigating to CarGurus homepage first")

        # STEP 1: Visit homepage first to build session/trust
        await page.goto("https://www.cargurus.com", wait_until='domcontentloaded', timeout=30000)
        logging.error("Homepage loaded, waiting to simulate human behavior...")
        await asyncio.sleep(3)

        # Scroll a bit to look more human
        try:
            await page.evaluate("window.scrollBy(0, 300)")
            await asyncio.sleep(1)
            await page.evaluate("window.scrollBy(0, -200)")
            await asyncio.sleep(1)
        except:
            pass

        # STEP 2: Build searchFilters URL parameter
        # Format: make|Toyota--model|Camry--yearMin|2020
        filter_parts = []
        if make:
            filter_parts.append(f"make|{make}")
        if model:
            filter_parts.append(f"model|{model}")
        if year_min:
            filter_parts.append(f"yearMin|{year_min}")
        if year_max:
            filter_parts.append(f"yearMax|{year_max}")
        if price_max:
            filter_parts.append(f"maxPrice|{price_max}")

        searchFilters = '--'.join(filter_parts) if filter_parts else ''

        # Build URL with searchFilters
        if searchFilters:
            search_url = f"https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?zip={zip_code}&distance={distance}&searchFilters={searchFilters}"
        else:
            # Fallback to simple search
            search_url = f"https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?zip={zip_code}&distance={distance}&searchQuery={make}+{model}"

        logging.error(f"Navigating to: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
        logging.error("Search page loaded, waiting for content...")

        # Wait longer for page to fully load
        await asyncio.sleep(5)

        # Wait for network to settle
        try:
            await page.wait_for_load_state('networkidle', timeout=10000)
        except:
            pass  # Continue if network never settles

        # Get page content for debugging
        content = await page.content()
        logging.error(f"Page loaded, content length: {len(content)}")

        # Check for "No results found" condition
        page_text = await page.inner_text('body')

        # Check for access restriction/bot detection
        restricted_indicators = [
            'access is temporarily restricted',
            'Access restricted',
            'suspicious activity',
            'bot detection',
            'please verify you are human',
            'we need to make sure you are not a robot'
        ]
        if any(indicator in page_text.lower() for indicator in restricted_indicators):
            logging.error(f"[CarGurus] Access restricted by bot detection!")
            # Take screenshot for debugging
            try:
                await page.screenshot(path='/tmp/cargurus-restricted.png')
                logging.error("Screenshot saved to /tmp/cargurus-restricted.png")
            except:
                pass
            return [{"error": "Access restricted - bot detection"}]

        no_results_indicators = [
            'No matching vehicles',
            'No results found',
            '0 results',
            'No cars found',
            'Try changing your search'
        ]
        if any(indicator in page_text for indicator in no_results_indicators):
            logging.error(f"[CarGurus] No results found - returning empty")
            return []

        # Try multiple selectors for listings
        selectors = [
            '[data-testid="listing-card"]',
            '[data-cg-ft="srp-listing-blade"]',
            '[class*="listing"]',
            'article',
            '.car-blade',
            '[class*="car-listing"]',
        ]

        listings = []
        for selector in selectors:
            listings = await page.query_selector_all(selector)
            if listings:
                logging.error(f"Found {len(listings)} listings with selector: {selector}")
                break

        if not listings:
            logging.error("No listings found with any selector")
            # Try to get any visible text to debug
            body = await page.query_selector('body')
            if body:
                text = await body.inner_text()
                logging.error(f"Page text preview: {text[:500]}")
            # Take screenshot for debugging
            try:
                await page.screenshot(path='/tmp/cargurus-debug.png')
                logging.error("Screenshot saved to /tmp/cargurus-debug.png")
            except:
                pass

        # Extract data from listings
        for i, listing in enumerate(listings[:max_results]):
            try:
                # Get all text for debugging
                all_text = await listing.inner_text()

                # Extract name
                name = query  # Default to query
                for name_selector in ['h4', 'h3', 'h2', '[class*="title"]', '[data-testid*="title"]']:
                    name_elem = await listing.query_selector(name_selector)
                    if name_elem:
                        name = await name_elem.inner_text()
                        break

                # Extract price - find $ in text
                price = 0
                price_match = re.search(r'\$[\d,]+', all_text)
                if price_match:
                    price = extract_number(price_match.group())

                # Extract mileage - find numbers followed by mi/miles
                mileage = 0
                mileage_match = re.search(r'([\d,]+)\s*(?:mi|miles)', all_text, re.IGNORECASE)
                if mileage_match:
                    mileage = extract_number(mileage_match.group())

                # Extract image
                image = ''
                img_elem = await listing.query_selector('img')
                if img_elem:
                    image = await img_elem.get_attribute('src') or await img_elem.get_attribute('data-src') or ''

                # Extract URL
                url = ''
                link_elem = await listing.query_selector('a')
                if link_elem:
                    url = await link_elem.get_attribute('href') or ''
                    if url and not url.startswith('http'):
                        url = f"https://www.cargurus.com{url}"

                # Extract location - city, state pattern
                location = 'Unknown'
                location_match = re.search(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})', all_text)
                if location_match:
                    location = f"{location_match.group(1)}, {location_match.group(2)}"

                if price > 0 or mileage > 0:  # Only add if we got some data
                    results.append({
                        'name': name.strip(),
                        'price': price,
                        'mileage': mileage,
                        'image': image,
                        'retailer': 'CarGurus',
                        'url': url,
                        'location': location
                    })
                    logging.error(f"Extracted: {name[:40]} - ${price} - {mileage} mi")

            except Exception as e:
                logging.error(f"Error extracting listing {i}: {e}")
                continue

    except Exception as e:
        logging.error(f"Scraping error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        # Wait before closing so we can see what happened
        # CarGurus may run bot detection that takes time to complete
        logging.error("Scraping complete, waiting 60 seconds before closing...")
        await asyncio.sleep(60)

        # Close browser
        if browser:
            try:
                await browser.close()
            except:
                pass

    return results


async def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: scrape-cars-camoufox.py <JSON filters> [max_results]"}))
        print(json.dumps({"example": '{"make": "GMC", "model": "Yukon Denali", "zip": "94002"}'}))
        sys.exit(1)

    arg = sys.argv[1]
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    try:
        # Parse JSON filters
        filters = json.loads(arg) if isinstance(arg, str) else arg
        result = await scrape_cars(filters, max_results)

        if not result:
            # Return descriptive error if no results
            print(json.dumps({"error": f"No car listings found for {filters}. The website may have blocked the request or changed its structure."}))
        else:
            print(json.dumps(result, indent=2))
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON filters"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
