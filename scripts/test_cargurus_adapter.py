#!/usr/bin/env python3
"""Test CarGurus adapter with LLM output."""
import asyncio
import json
import sys
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

from parse_vehicle_query import parse_query_async

# Import the adapter
import importlib.util
spec = importlib.util.spec_from_file_location(
    "scrape_cars_camoufox",
    Path(__file__).parent / "scrape-cars-camoufox.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
adapt_to_cargurus = module.adapt_structured_to_cargurus


async def test_cargurus():
    print("=" * 60)
    print("CarGurus Adapter Verification")
    print("=" * 60)

    # Simulate LLM output for CarGurus
    llm_output = {
        "url": "https://www.cargurus.com/search?make=GMC&model=Sierra%203500HD&trim=Denali%20Ultimate",
        "filters": {
            "url_params": {
                "make": "GMC",
                "model": "Sierra 3500HD",
                "trim": "Denali Ultimate"
            },
            "path_components": {}
        }
    }

    print(f"\n📥 LLM Output for CarGurus:")
    print(json.dumps(llm_output, indent=2))

    # Test the adapter
    print(f"\n🔄 Testing adapter...")

    try:
        # The adapter expects the filters object, not the full LLM output
        result = adapt_to_cargurus(llm_output["filters"])
        print(f"\n✅ Adapter works! Result:")
        print(json.dumps(result, indent=2))

        # Also test with real LLM call
        print(f"\n" + "=" * 60)
        print("Testing with real LLM call...")
        print("=" * 60)

        query = "2023-2024 GMC Sierra 3500HD Denali Ultimate black color"
        print(f"\nQuery: {query}")

        llm_result = await parse_query_async(query)
        cargurus_data = llm_result.get("retailers", {}).get("cargurus")

        if cargurus_data:
            print(f"\n📥 Real LLM CarGurus output:")
            print(json.dumps(cargurus_data, indent=2))

            # Test adapter with real output
            adapter_result = adapt_to_cargurus(cargurus_data["filters"])
            print(f"\n✅ Adapter accepts real LLM output:")
            print(json.dumps(adapter_result, indent=2))

            return True
        else:
            print(f"\n⚠️ No CarGurus data in LLM output")
            return False

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == '__main__':
    success = asyncio.run(test_cargurus())
    print(f"\n{'=' * 60}")
    print(f"{'✅ PASSED' if success else '❌ FAILED'}")
    print(f"{'=' * 60}")
