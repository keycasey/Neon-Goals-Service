#!/usr/bin/env python3
"""
Car scraping script using browser-use
Scrapes CarGurus for car listings and outputs JSON
"""
import asyncio
import json
import sys
import os
import logging
from pathlib import Path

# Suppress browser-use logging to stderr so only JSON goes to stdout
logging.basicConfig(
    level=logging.ERROR,
    format='%(message)s',
    stream=sys.stderr
)

# Add browser-use to path
sys.path.insert(0, os.path.expanduser('~/Development/browser-use'))

from browser_use import Agent
from browser_use.llm import ChatBrowserUse

# Load environment variables from neon-goals-service .env
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)


async def scrape_cars(query: str, max_results: int = 3):
    """Scrape car listings from CarGurus AND AutoTrader - optimized for minimal credit usage"""

    # Ultra-concise task to minimize tokens/credits
    # Search BOTH sites and combine results
    task = f"""
    Search for "{query}" on BOTH CarGurus.com AND AutoTrader.com. Get {max_results} total results.

    For EACH listing extract:
    - name: Full vehicle title
    - price: Number only (no $)
    - mileage: Number only (no "mi")
    - image: Image URL
    - retailer: Dealer name OR site name (CarGurus/AutoTrader)
    - url: Full listing URL
    - location: City, State

    Return JSON: [{{"name":"2020 Honda Civic","price":18000,"mileage":45000,"image":"https://...jpg","retailer":"Dealer","url":"https://...","location":"LA, CA"}}]

    Fast. Solve CAPTCHA. Return ONLY JSON array.
    """

    # Use ChatBrowserUse cloud - fastest, most accurate, optimized for browser tasks
    # Uses cached tokens to reduce costs
    llm = ChatBrowserUse(
        model='bu-2-0',  # Optimized for speed and cost
    )

    agent = Agent(
        task=task,
        llm=llm,
    )

    try:
        result = await agent.run()

        # The agent returns an AgentHistoryList - extract the final result
        # Try to get extracted content from the last successful action
        if hasattr(result, 'final_result'):
            result_str = str(result.final_result())
        elif hasattr(result, 'history'):
            # Get last message from history
            result_str = str(result.history[-1]) if result.history else str(result)
        else:
            result_str = str(result)

        # Try to extract JSON from the result string
        # Look for JSON array pattern (handle escaped quotes)
        import re

        # Try escaped JSON first (common in agent responses)
        escaped_match = re.search(r'\[\{\\\".*?\\\"\}\]', result_str, re.DOTALL)
        if escaped_match:
            try:
                # Unescape the JSON
                json_str = escaped_match.group().replace('\\"', '"').replace('\\\\', '\\')
                return json.loads(json_str)
            except:
                pass

        # Try regular JSON
        json_match = re.search(r'\[{.*?}\]', result_str, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except:
                pass

        # If no JSON found, try to parse the whole thing
        try:
            return json.loads(result_str)
        except:
            # Return error with the raw result for debugging
            return {"error": "Could not extract JSON from agent result", "raw": result_str[:500]}

    except Exception as e:
        return {"error": str(e)}


async def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: scrape-cars.py <search query>"}))
        sys.exit(1)

    query = sys.argv[1]
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    result = await scrape_cars(query, max_results)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    asyncio.run(main())
