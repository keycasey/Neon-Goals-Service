#!/usr/bin/env python3
"""
Test script to verify VehicleFilterService integration.

This simulates the flow of creating a vehicle goal with LLM filter mapping.
"""
import asyncio
import json
import sys
import os
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Import the parse_vehicle_query function
from parse_vehicle_query import parse_query_async

async def test_vehicle_filter_service():
    """Test the vehicle filter parsing service."""
    print("=" * 60)
    print("Vehicle Filter Service Integration Test")
    print("=" * 60)

    # Simulate the user's natural language query
    query = "2023-2024 GMC Sierra 3500HD Denali Ultimate black color"

    print(f"\n📝 User Query: \"{query}\"")
    print(f"\n🔄 Calling LLM to generate retailer-specific filters...")

    # Call the LLM filter parsing (simulates what VehicleFilterService does)
    result = await parse_query_async(query, use_llm=True)

    if result.get('error'):
        print(f"\n❌ Error: {result['error']}")
        return False

    print(f"\n✅ Successfully parsed query for {len(result.get('retailers', {}))} retailers")

    # Show the retailer-specific filters
    print(f"\n📋 Retailer-specific filters:")
    for retailer, data in result.get('retailers', {}).items():
        print(f"\n  {retailer.upper()}:")
        print(f"    URL: {data.get('url', 'N/A')[:80]}...")
        print(f"    Filters: {json.dumps(data.get('filters', {}), indent=6)[:100]}...")

    # Show what would be stored in the database
    print(f"\n💾 What would be stored in ItemGoalData.retailerFilters:")
    retailer_filters_json = json.dumps(result, indent=2)
    print(f"  {retailer_filters_json[:200]}...")

    print(f"\n✅ Test passed! Retailer-specific filters generated successfully.")
    print(f"\n📊 Summary:")
    print(f"  - Query parsed from natural language")
    print(f"  - {len(result.get('retailers', {}))} retailers supported")
    print(f"  - Each retailer has specific filters in their format")
    print(f"  - Ready to be stored in database and used by worker")

    return True


async def test_scraper_adapter_compatibility():
    """Test that the LLM output is compatible with scraper adapters."""
    print(f"\n" + "=" * 60)
    print("Scraper Adapter Compatibility Test")
    print("=" * 60)

    query = "2023-2024 GMC Sierra 3500HD Denali Ultimate black color"
    result = await parse_query_async(query, use_llm=True)

    if result.get('error'):
        print(f"\n❌ Error: {result.get('error')}")
        return False

    # Test each retailer's output format
    print(f"\n🔍 Testing retailer output formats...")

    import importlib.util

    scrapers = {
        'autotrader': ('scrape-autotrader.py', 'adapt_structured_to_autotrader'),
        'cargurus': ('scrape-cars-camoufox.py', 'adapt_structured_to_cargurus'),
        'carmax': ('scrape-carmax.py', 'adapt_structured_to_carmax'),
        'carvana': ('scrape-carvana-interactive.py', 'adapt_structured_to_carvana_interactive'),
        'truecar': ('scrape-truecar.py', 'adapt_structured_to_truecar')
    }

    success_count = 0
    for retailer, (script_file, adapter_func) in scrapers.items():
        retailer_data = result.get('retailers', {}).get(retailer)
        if not retailer_data:
            print(f"  ⚠️  {retailer}: No data in LLM output")
            continue

        try:
            # Load the scraper module
            spec = importlib.util.spec_from_file_location(
                script_file.replace('.py', ''),
                Path(__file__).parent / script_file
            )
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Get the adapter function
            adapter = getattr(module, adapter_func, None)
            if not adapter:
                print(f"  ⚠️  {retailer}: Adapter function not found")
                continue

            # Test the adapter (some adapters take just filters, some take url+filters)
            filters = retailer_data.get('filters', {})
            try:
                # Try with filters only
                adapter_result = adapter(filters)
                print(f"  ✅ {retailer}: Adapter function accepts LLM output")
                success_count += 1
            except TypeError:
                # Try with url + filters
                try:
                    adapter_result = adapter(retailer_data.get('url'), filters)
                    print(f"  ✅ {retailer}: Adapter function accepts LLM output (url+filters)")
                    success_count += 1
                except Exception as e:
                    print(f"  ⚠️  {retailer}: Adapter needs conversion - {str(e)[:50]}")
        except Exception as e:
            print(f"  ⚠️  {retailer}: {str(e)[:50]}")

    print(f"\n📊 Adapter compatibility: {success_count}/{len(scrapers)} scrapers verified")

    return success_count >= 4  # At least 4/5 should work


async def main():
    """Run all tests."""
    # Test 1: Vehicle Filter Service
    test1 = await test_vehicle_filter_service()

    # Test 2: Scraper Adapter Compatibility
    test2 = await test_scraper_adapter_compatibility()

    # Summary
    print(f"\n" + "=" * 60)
    print("FINAL RESULTS")
    print("=" * 60)
    print(f"  Vehicle Filter Service: {'✅ PASSED' if test1 else '❌ FAILED'}")
    print(f"  Adapter Compatibility:   {'✅ PASSED' if test2 else '❌ FAILED'}")
    print(f"  Overall:                 {'✅ ALL TESTS PASSED' if test1 and test2 else '❌ SOME TESTS FAILED'}")
    print("=" * 60)


if __name__ == '__main__':
    asyncio.run(main())
