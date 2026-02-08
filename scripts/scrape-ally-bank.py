#!/usr/bin/env python3
"""
Ally Bank scraper - Download savings account transactions as CSV.

Usage:
    # Set password as environment variable
    export ALLY_PASSWORD="your_password"
    python scripts/scrape-ally-bank.py

    # Or enter password when prompted (before browser opens)
    python scripts/scrape-ally-bank.py
"""
import asyncio
import sys
import os
import logging
from pathlib import Path
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

try:
    from playwright.async_api import async_playwright, Browser, Page
except ImportError:
    logger.error("Playwright is not installed. Run: pip install playwright")
    sys.exit(1)


# Download directory for CSV files
DOWNLOAD_DIR = Path.home() / "Downloads"
ALLY_URL = "https://www.ally.com/"


def get_password():
    """Get password from environment variable or prompt user."""
    password = os.environ.get("ALLY_PASSWORD")
    if not password:
        password = input("Enter Ally Bank password: ")
    return password


async def main():
    """Main entry point."""
    logger.info("=" * 60)
    logger.info("Ally Bank Scraper - Download Savings CSV")
    logger.info("=" * 60)

    # Get password BEFORE opening browser (for better terminal interaction)
    password = get_password()

    browser = None

    try:
        async with async_playwright() as p:
            logger.info(f"Launching Firefox...")
            browser = await p.firefox.launch(
                headless=False,
                slow_mo=100,
            )

            context = await browser.new_context(
                viewport={"width": 1430, "height": 1033},
                accept_downloads=True,
            )

            page = await context.new_page()

            # Go to Ally home page
            logger.info(f"Navigating to {ALLY_URL}")
            await page.goto(ALLY_URL)
            await asyncio.sleep(2)

            # Click "Log In" button
            logger.info("Clicking 'Log In' button...")
            try:
                await page.click('button:has-text("Log In")', timeout=5000)
            except:
                await page.click('section.styles_topNavWrapper__2daVv ul button', timeout=5000)
            await asyncio.sleep(1)

            # Fill in username
            logger.info("Entering username...")
            await page.fill('#uname', 'caseykey')
            await asyncio.sleep(0.5)

            # Tab to password field
            await page.keyboard.press('Tab')
            await asyncio.sleep(0.5)

            # Fill in password
            logger.info("Entering password...")
            await page.fill('#pword', password)
            await asyncio.sleep(0.5)

            # Click Login button and wait for navigation
            logger.info("Clicking 'Log In' button...")
            async with page.expect_navigation():
                await page.click('div.Login_buttonContainer__NMVbF > button')

            logger.info("Waiting for post-login page...")
            await asyncio.sleep(3)

            # Click on savings account link
            logger.info("Clicking on savings account...")
            try:
                async with page.expect_navigation():
                    await page.click("[data-testid='account-link']", timeout=5000)
            except:
                logger.warning("Could not click account link, trying alternative...")
                await page.click("a:has-text('Savings')", timeout=5000)

            await asyncio.sleep(2)
            logger.info(f"Current URL: {page.url}")

            # Click Download Transactions button
            logger.info("Clicking 'Download Transactions' button...")
            await page.click("[data-testid='download-button'] span:has-text('Download')", timeout=5000)
            await asyncio.sleep(1)

            # Select CSV format
            logger.info("Selecting CSV format...")
            await page.click("[data-testid='file-format']", timeout=5000)
            await asyncio.sleep(0.5)
            await page.fill("[data-testid='file-format']", 'csv')
            await asyncio.sleep(0.5)

            # Set date range to 30 days
            logger.info("Setting date range to 30 days...")
            await page.click("[data-testid='date-picker']", timeout=5000)
            await asyncio.sleep(0.5)
            await page.fill("[data-testid='date-picker']", '30')
            await asyncio.sleep(0.5)

            # Click Download button
            logger.info("Clicking Download button...")
            logger.info("CSV will be downloaded to: " + str(DOWNLOAD_DIR))

            # Set up download handler before clicking
            download_event = asyncio.Event()
            download_path = None

            async def handle_download(download):
                nonlocal download_path
                download_path = DOWNLOAD_DIR / download.suggested_filename
                await download.save_as(download_path)
                logger.info(f"Download saved to: {download_path}")
                download_event.set()

            page.on("download", handle_download)

            # Click the download button
            await page.click("[data-testid='download-submit-button'] span", timeout=5000)

            # Wait for download to complete (up to 30 seconds)
            try:
                await asyncio.wait_for(download_event.wait(), timeout=30)
                logger.info("Download completed successfully!")
            except asyncio.TimeoutError:
                logger.warning("Download timeout - check if download started")

            # Keep browser open for a bit to verify
            logger.info("")
            logger.info("Browser will remain open for 10 seconds for verification...")
            await asyncio.sleep(10)

    except KeyboardInterrupt:
        logger.info("\nInterrupted by user")
    except Exception as e:
        logger.error(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if browser:
            await browser.close()
        logger.info("Done")


if __name__ == "__main__":
    asyncio.run(main())
