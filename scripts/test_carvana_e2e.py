#!/usr/bin/env python3
"""
End-to-end test for Carvana scraper using LLM filter output.

Tests if the LLM-generated filters work correctly with the Carvana scraper.
"""
import asyncio
import json
import sys
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Import the scraper (hyphenated module name requires special handling)
import importlib.util
spec = importlib.util.spec_from_file_location(
    "scrape_carvana_interactive",
    Path(__file__).parent / "scrape-carvana-interactive.py"
)
carvana_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(carvana_module)
scrape_carvana_interactive = carvana_module.scrape_carvana_interactive


def llm_output_to_carvana_params(llm_output: dict) -> dict:
    """
    Convert LLM output format to Carvana scraper parameters.

    LLM output format:
    {
      "url": "...",
      "filters": {
        "path_components": {"make": "...", "model": "..."}
      }
    }

    Carvana scraper expects: make, model, series, trims, year
    """
    path = llm_output.get('filters', {}).get('path_components', {})

    params = {}

    # Extract make - need UPPERCASE for Carvana
    make = path.get('make', '')
    if make:
        params['make'] = make.upper()

    # Extract and normalize model
    model = path.get('model', '')
    if model:
        # Convert "sierra-3500hd" to "Sierra 3500HD"
        model_parts = model.split('-')
        model_normalized = ' '.join([p.capitalize() for p in model_parts])
        # Fix common suffixes
        model_normalized = model_normalized.replace('Hd', 'HD').replace('Lt', 'LT')
        params['model'] = model_normalized

    # Extract URL params
    url_params = llm_output.get('filters', {}).get('url_params', {})
    if url_params.get('year') or url_params.get('yearMin') or url_params.get('yearMax'):
        # Use the max year if range provided
        year = url_params.get('year') or url_params.get('yearMax') or url_params.get('yearMin')
        if year:
            params['year'] = int(year)

    return params


async def test_carvana():
    """Test Carvana scraper with LLM-generated filters."""

    print("=" * 60)
    print("Carvana End-to-End Test")
    print("=" * 60)

    # Simulated LLM output for "2023-2024 GMC Sierra 3500HD Denali Ultimate black color"
    llm_output = {
        "url": "https://www.carvana.com/cars/gmc-sierra-3500hd",
        "filters": {
            "url_params": {},
            "path_components": {
                "make": "gmc",
                "model": "sierra-3500hd"
            },
            "body_params": {}
        },
        "selector_info": {}
    }

    print(f"\n📥 LLM Output for Carvana:")
    print(json.dumps(llm_output, indent=2))

    # Convert to scraper format
    scraper_params = llm_output_to_carvana_params(llm_output)

    print(f"\n🔄 Converted to scraper parameters:")
    print(json.dumps(scraper_params, indent=2))

    # Run the scraper
    print(f"\n🚗 Running Carvana scraper...")
    print(f"   Make: {scraper_params.get('make')}")
    print(f"   Model: {scraper_params.get('model')}")
    print(f"   Year: {scraper_params.get('year')}")

    try:
        results = await scrape_carvana_interactive(
            make=scraper_params.get('make'),
            model=scraper_params.get('model'),
            year=scraper_params.get('year'),
            max_results=5
        )

        print(f"\n✅ Scraper completed successfully!")
        print(f"   Results returned: {len(results) if results else 0}")

        if results:
            print(f"\n📋 Sample results:")
            for i, item in enumerate(results[:3], 1):
                print(f"\n   [{i}] {item.get('name', 'Unknown')}")
                print(f"       Price: {item.get('price', 'N/A')}")
                print(f"       Year: {item.get('year', 'N/A')}")
                print(f"       URL: {item.get('url', 'N/A')[:60]}...")

            # Save full results
            output_file = Path(__file__).parent / 'test_carvana_results.json'
            with open(output_file, 'w') as f:
                json.dump(results, f, indent=2)
            print(f"\n💾 Full results saved to: {output_file}")

            return True
        else:
            print(f"\n⚠️  No results returned (but scraper didn't error)")
            return False

    except Exception as e:
        print(f"\n❌ Scraper error: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run the test."""
    success = asyncio.run(test_carvana())

    print(f"\n{'=' * 60}")
    if success:
        print("TEST PASSED ✅")
    else:
        print("TEST FAILED ❌")
    print(f"{'=' * 60}")

    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
