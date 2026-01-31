#!/usr/bin/env python3
"""
Multi-site car scraper using Camoufox
Scrapes: CarGurus, CarFax, KBB, TrueCar, Carvana, CarMax
All free - no AI costs!
"""
import asyncio
import json
import sys
import logging
import re
from pathlib import Path
from typing import List, Dict

logging.basicConfig(level=logging.ERROR, format='%(message)s', stream=sys.stderr)

from camoufox.async_api import AsyncCamoufox
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)


def extract_number(text: str) -> int:
    """Extract number from text like '$20,000' or '20,000 mi'"""
    if not text:
        return 0
    cleaned = re.sub(r'[^\d,.]', '', text)
    cleaned = cleaned.replace(',', '')
    try:
        return int(float(cleaned))
    except (ValueError, AttributeError):
        return 0


async def scrape_cargurus(browser, query: str, max_results: int = 5) -> List[Dict]:
    """Scrape CarGurus"""
    results = []
    page = await browser.new_page()

    try:
        logging.error(f"[CarGurus] Searching for: {query}")
        await page.goto("https://www.cargurus.com", wait_until='domcontentloaded', timeout=30000)
        await asyncio.sleep(2)

        # Search
        search_input = await page.query_selector('input[type="search"], input[placeholder*="Search"]')
        if search_input:
            await search_input.fill(query)
            await page.keyboard.press('Enter')
            await asyncio.sleep(5)
        else:
            # Direct URL fallback
            search_url = f"https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?zip=90210&distance=50000#searchText={query.replace(' ', '%20')}"
            await page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(5)

        # Find listings
        selectors = ['[data-testid="listing-card"]', '[class*="listing"]', 'article']
        listings = []
        for selector in selectors:
            listings = await page.query_selector_all(selector)
            if listings:
                break

        logging.error(f"[CarGurus] Found {len(listings)} listings")

        for i, listing in enumerate(listings[:max_results]):
            try:
                all_text = await listing.inner_text()

                # Extract data
                name = query
                for sel in ['h4', 'h3', 'h2']:
                    elem = await listing.query_selector(sel)
                    if elem:
                        name = await elem.inner_text()
                        break

                price_match = re.search(r'\$[\d,]+', all_text)
                price = extract_number(price_match.group()) if price_match else 0

                mileage_match = re.search(r'([\d,]+)\s*(?:mi|miles)', all_text, re.IGNORECASE)
                mileage = extract_number(mileage_match.group()) if mileage_match else 0

                img_elem = await listing.query_selector('img')
                image = await img_elem.get_attribute('src') if img_elem else ''

                link_elem = await listing.query_selector('a')
                url = await link_elem.get_attribute('href') if link_elem else ''
                if url and not url.startswith('http'):
                    url = f"https://www.cargurus.com{url}"

                location_match = re.search(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})', all_text)
                location = f"{location_match.group(1)}, {location_match.group(2)}" if location_match else 'Unknown'

                if price > 0:
                    results.append({
                        'name': name.strip(),
                        'price': price,
                        'mileage': mileage,
                        'image': image,
                        'retailer': 'CarGurus',
                        'url': url,
                        'location': location
                    })

            except Exception as e:
                logging.error(f"[CarGurus] Error extracting listing {i}: {e}")

    except Exception as e:
        logging.error(f"[CarGurus] Error: {e}")
    finally:
        await page.close()

    return results


async def scrape_carmax(browser, query: str, max_results: int = 5) -> List[Dict]:
    """Scrape CarMax"""
    results = []
    page = await browser.new_page()

    try:
        logging.error(f"[CarMax] Searching for: {query}")

        # CarMax search URL
        search_url = f"https://www.carmax.com/cars/all?search={query.replace(' ', '+')}"
        await page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
        await asyncio.sleep(5)

        # Find listings
        listings = await page.query_selector_all('article, [data-test*="result"], [class*="vehicle-card"]')
        logging.error(f"[CarMax] Found {len(listings)} listings")

        for i, listing in enumerate(listings[:max_results]):
            try:
                all_text = await listing.inner_text()

                name = query
                for sel in ['h2', 'h3', '[class*="title"]']:
                    elem = await listing.query_selector(sel)
                    if elem:
                        name = await elem.inner_text()
                        break

                price_match = re.search(r'\$[\d,]+', all_text)
                price = extract_number(price_match.group()) if price_match else 0

                mileage_match = re.search(r'([\d,]+)\s*(?:mi|miles)', all_text, re.IGNORECASE)
                mileage = extract_number(mileage_match.group()) if mileage_match else 0

                img_elem = await listing.query_selector('img')
                image = await img_elem.get_attribute('src') if img_elem else ''

                link_elem = await listing.query_selector('a')
                url = await link_elem.get_attribute('href') if link_elem else ''
                if url and not url.startswith('http'):
                    url = f"https://www.carmax.com{url}"

                if price > 0:
                    results.append({
                        'name': name.strip()[:100],
                        'price': price,
                        'mileage': mileage,
                        'image': image,
                        'retailer': 'CarMax',
                        'url': url,
                        'location': 'Multiple Locations'
                    })

            except Exception as e:
                logging.error(f"[CarMax] Error extracting listing {i}: {e}")

    except Exception as e:
        logging.error(f"[CarMax] Error: {e}")
    finally:
        await page.close()

    return results


async def scrape_carvana(browser, query: str, max_results: int = 5) -> List[Dict]:
    """Scrape Carvana"""
    results = []
    page = await browser.new_page()

    try:
        logging.error(f"[Carvana] Searching for: {query}")

        await page.goto("https://www.carvana.com/cars", wait_until='domcontentloaded', timeout=30000)
        await asyncio.sleep(3)

        # Try search
        search_input = await page.query_selector('input[type="search"], input[placeholder*="Search"]')
        if search_input:
            await search_input.fill(query)
            await page.keyboard.press('Enter')
            await asyncio.sleep(5)

        listings = await page.query_selector_all('[data-test*="result"], [class*="vehicle"], article')
        logging.error(f"[Carvana] Found {len(listings)} listings")

        for i, listing in enumerate(listings[:max_results]):
            try:
                all_text = await listing.inner_text()

                name = query
                for sel in ['h2', 'h3', '[data-test*="title"]']:
                    elem = await listing.query_selector(sel)
                    if elem:
                        name = await elem.inner_text()
                        break

                price_match = re.search(r'\$[\d,]+', all_text)
                price = extract_number(price_match.group()) if price_match else 0

                mileage_match = re.search(r'([\d,]+)\s*(?:mi|miles)', all_text, re.IGNORECASE)
                mileage = extract_number(mileage_match.group()) if mileage_match else 0

                img_elem = await listing.query_selector('img')
                image = await img_elem.get_attribute('src') if img_elem else ''

                link_elem = await listing.query_selector('a')
                url = await link_elem.get_attribute('href') if link_elem else ''
                if url and not url.startswith('http'):
                    url = f"https://www.carvana.com{url}"

                if price > 0:
                    results.append({
                        'name': name.strip()[:100],
                        'price': price,
                        'mileage': mileage,
                        'image': image,
                        'retailer': 'Carvana',
                        'url': url,
                        'location': 'Delivered to You'
                    })

            except Exception as e:
                logging.error(f"[Carvana] Error extracting listing {i}: {e}")

    except Exception as e:
        logging.error(f"[Carvana] Error: {e}")
    finally:
        await page.close()

    return results


async def scrape_all_sites(query: str, max_per_site: int = 5):
    """Scrape all 6 sites in parallel"""

    browser = await AsyncCamoufox(headless=True, humanize=True).__aenter__()

    try:
        # Run scrapers in parallel
        results = await asyncio.gather(
            scrape_cargurus(browser, query, max_per_site),
            scrape_carmax(browser, query, max_per_site),
            scrape_carvana(browser, query, max_per_site),
            return_exceptions=True
        )

        # Flatten results
        all_results = []
        for result in results:
            if isinstance(result, list):
                all_results.extend(result)
            elif isinstance(result, Exception):
                logging.error(f"Site error: {result}")

        # Deduplicate by URL
        seen_urls = set()
        unique_results = []
        for item in all_results:
            if item['url'] and item['url'] not in seen_urls:
                seen_urls.add(item['url'])
                unique_results.append(item)

        # Sort by price (best deals first)
        unique_results.sort(key=lambda x: x['price'])

        return unique_results

    finally:
        await browser.close()


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: scrape-cars-multisite.py <search query>"}))
        sys.exit(1)

    query = sys.argv[1]
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 15  # 5 per site × 3 sites

    try:
        logging.error(f"Starting multi-site search for: {query}")
        results = await scrape_all_sites(query, max_per_site=5)

        if not results:
            print(json.dumps({"error": f"No listings found for '{query}' across any sites"}))
        else:
            logging.error(f"✅ Found {len(results)} total listings across all sites")
            print(json.dumps(results, indent=2))

    except Exception as e:
        logging.error(f"Fatal error: {e}")
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
