#!/usr/bin/env python3
"""
Test LLM-based filter mapping for all retailers.

This script tests the approach of having the LLM map a user query
directly to retailer-specific filter formats using each retailer's
filter JSON as context.
"""
import asyncio
import json
import sys
import os
from pathlib import Path
from typing import Dict, Any

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from openai import AsyncOpenAI
except ImportError:
    print("Error: openai not installed. Run: pip install openai")
    sys.exit(1)


def load_all_filter_jsons() -> Dict[str, dict]:
    """Load all retailer filter JSON files."""
    data_dir = Path(__file__).parent / 'data'
    retailers = {
        'autotrader': 'autotrader-filters.json',
        'cargurus': 'cargurus-filters.json',
        'carmax': 'carmax-filters.json',
        'carvana': 'carvana-filters.json',
        'truecar': 'truecar-filters.json'
    }

    filters = {}
    for retailer, filename in retailers.items():
        filepath = data_dir / filename
        if filepath.exists():
            with open(filepath, 'r') as f:
                filters[retailer] = json.load(f)
        else:
            print(f"Warning: {filepath} not found")

    return filters


def build_system_prompt(filters: Dict[str, dict]) -> str:
    """Build system prompt with all filter JSONs as context."""

    # Extract key info from each retailer's filters
    retailer_context = []

    for retailer, data in filters.items():
        retailer_name = data.get('retailer', retailer.capitalize())
        base_url = data.get('base_url', '')
        url_format = data.get('url_format', {})

        # Build filter options summary
        filter_summary = []

        for filter_group in data.get('filters', []):
            filter_name = filter_group.get('name', '')
            filter_type = filter_group.get('type', '')

            # Get options if available
            options = filter_group.get('options', [])
            if options and isinstance(options, list):
                option_sample = options[:5]  # First 5 options
                option_labels = []
                for opt in option_sample:
                    if isinstance(opt, dict):
                        label = opt.get('label', opt.get('value', str(opt)))
                    elif isinstance(opt, str):
                        label = opt
                    else:
                        label = str(opt)
                    option_labels.append(label)
                option_str = ', '.join(option_labels)
                if len(options) > 5:
                    option_str += f", ... ({len(options)} total)"
                filter_summary.append(f"  - {filter_name} ({filter_type}): {option_str}")
            else:
                # Range/slider type
                if filter_type == 'dual-slider':
                    range_info = filter_group.get('range', {})
                    filter_summary.append(f"  - {filter_name} ({filter_type}): {range_info.get('min', '')}-{range_info.get('max', '')}")
                elif filter_type == 'dual-select':
                    range_info = filter_group.get('range', {})
                    filter_summary.append(f"  - {filter_name} ({filter_type}): {range_info.get('min', '')}-{range_info.get('max', '')}")
                else:
                    filter_summary.append(f"  - {filter_name} ({filter_type})")

        # URL format info
        url_info = []
        if url_format.get('pattern'):
            url_info.append(f"URL pattern: {url_format['pattern']}")
        if url_format.get('example'):
            url_info.append(f"Example: {base_url}{url_format['example']}")

        # Query params
        if url_format.get('query_params'):
            params = url_format['query_params']
            param_str = ', '.join([f"{k}={v}" for k, v in list(params.items())[:5]])
            url_info.append(f"Query params: {param_str}")

        retailer_context.append(f"""
**{retailer_name}**
Base URL: {base_url}
{chr(10).join(url_info)}

Available filters:
{chr(10).join(filter_summary)}
""")

    return f"""You are a vehicle search filter mapper. Convert natural language queries into retailer-specific filter formats.

Available retailers and their filter options:

{''.join(retailer_context)}

**Important Rules:**

1. Map the user's query to EACH retailer's specific filter format
2. Use the exact filter values shown above for each retailer
3. Handle retailer differences:
   - Different param names (e.g., priceMax vs maxPrice vs priceMax)
   - Different value formats (e.g., "awd" vs "AWD" vs "Four Wheel Drive")
   - URL structure differences (path-based vs query params)
4. If a retailer doesn't support a filter, omit it for that retailer
5. For year ranges, use the appropriate format per retailer
6. For models/trims, use the exact format the retailer expects

**Output Format:**

Return ONLY a JSON object with this exact structure:

{{
  "query": "original query string",
  "retailers": {{
    "autotrader": {{
      "url": "full URL or path with query parameters",
      "filters": {{
        "url_params": {{"param": "value"}},
        "path_components": {{"make": "...", "model": "..."}},
        "body_params": {{"for POST requests if applicable"}}
      }},
      "selector_info": {{"filter_selector": "css selector if needed"}}
    }},
    "cargurus": {{ ... }},
    "carmax": {{ ... }},
    "carvana": {{ ... }},
    "truecar": {{ ... }}
  }}
}}

For URL construction:
- AutoTrader: /cars-for-sale/{{make}}/{{model}}/{{location}}?{{params}}
- CarGurus: /search?{{params}}
- CarMax: /cars/{{make}}/{{bodyType}}?{{params}}
- Carvana: /cars/{{make}}-{{model}} (uses interactive selection)
- TrueCar: /used-cars-for-sale/listings/?{{params}}
"""


async def map_query_to_all_retailers(query: str, filters: Dict[str, dict]) -> Dict[str, Any]:
    """Map a query to retailer-specific filters using LLM."""

    system_prompt = build_system_prompt(filters)

    user_prompt = f"""Map this vehicle search query to retailer-specific filters:

Query: "{query}"

Provide the filter mapping for all 5 retailers."""

    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        # Try GLM API
        api_key = os.environ.get('GLM_API_KEY') or os.environ.get('ZHIPU_API_KEY')
        base_url = os.environ.get('GLM_BASE_URL', 'https://open.bigmodel.cn/api/paas/v4')
        model = os.environ.get('GLM_MODEL', 'glm-4-plus')
    else:
        base_url = None
        model = "gpt-4o-mini"

    if not api_key:
        return {"error": "No API key found. Set OPENAI_API_KEY or GLM_API_KEY environment variable."}

    try:
        if base_url:
            client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        else:
            client = AsyncOpenAI(api_key=api_key)

        print(f"Using model: {model}")
        print(f"Base URL: {base_url or 'OpenAI'}")

        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0,
            max_tokens=2000
        )

        content = response.choices[0].message.content.strip()

        # Remove markdown code blocks if present
        if content.startswith('```'):
            content = content.split('\n', 1)[-1].rsplit('\n', 1)[0]

        result = json.loads(content)
        result["query"] = query

        return result

    except Exception as e:
        return {"error": f"LLM call failed: {str(e)}"}


def verify_with_scraper_adapters(result: Dict[str, Any]) -> Dict[str, Any]:
    """Verify the LLM output works with each scraper's adapter function."""

    verification_results = {}

    # Import scraper adapters
    import importlib.util

    scrapers = {
        'autotrader': ('scrape-autotrader.py', 'adapt_structured_to_autotrader'),
        'cargurus': ('scrape-cars-camoufox.py', 'adapt_structured_to_cargurus_camoufox'),
        'carmax': ('scrape-carmax.py', 'adapt_structured_to_carmax'),
        'carvana': ('scrape-carvana-interactive.py', 'adapt_structured_to_carvana_interactive'),
        'truecar': ('scrape-truecar.py', 'adapt_structured_to_truecar')
    }

    for retailer, (scraper_file, adapt_func_name) in scrapers.items():
        # Load the scraper module
        spec = importlib.util.spec_from_file_location(
            retailer.capitalize(),
            Path(__file__).parent / scraper_file
        )
        module = importlib.util.module_from_spec(spec)

        try:
            spec.loader.exec_module(module)

            # Check if adapt function exists
            adapt_func = getattr(module, adapt_func_name, None)

            if adapt_func and retailer in result.get('retailers', {}):
                # Get the filters for this retailer
                retailer_filters = result['retailers'][retailer]

                # Convert to structured format (reverse mapping)
                structured = {}

                # Extract from url_params
                if 'url_params' in retailer_filters:
                    params = retailer_filters['url_params']
                    # Map common params to structured format
                    if 'priceMax' in params or 'maxPrice' in params or 'priceMax' in params:
                        structured['maxPrice'] = int(params.get('priceMax') or params.get('maxPrice', 0))
                    if 'startYear' in params or 'yearMin' in params:
                        structured['yearMin'] = int(params.get('startYear') or params.get('yearMin', 0))
                    if 'endYear' in params or 'yearMax' in params:
                        structured['yearMax'] = int(params.get('endYear') or params.get('yearMax', 0))
                    if 'driveGroup' in params or 'drivetrain' in params:
                        structured['drivetrain'] = params.get('driveGroup') or params.get('drivetrain', '')
                    if 'extColor' in params or 'exteriorColor' in params:
                        structured['exteriorColor'] = params.get('extColor') or params.get('exteriorColor', '')

                # Extract from path_components
                if 'path_components' in retailer_filters:
                    path = retailer_filters['path_components']
                    if 'make' in path:
                        structured['makes'] = [path['make']]
                    if 'model' in path:
                        structured['models'] = [path['model']]
                    if 'trim' in path:
                        structured['trims'] = [path['trim']]

                # Test the adapter
                try:
                    adapted = adapt_func(structured)
                    verification_results[retailer] = {
                        "status": "success",
                        "adapter_output": adapted
                    }
                except Exception as e:
                    verification_results[retailer] = {
                        "status": "adapter_error",
                        "error": str(e)
                    }
            else:
                verification_results[retailer] = {
                    "status": "skipped",
                    "reason": "No adapter function or no filters in result"
                }

        except Exception as e:
            verification_results[retailer] = {
                "status": "import_error",
                "error": str(e)
            }

    return verification_results


def main():
    """Run the LLM filter mapping test."""

    print("=" * 60)
    print("LLM Filter Mapping Test")
    print("=" * 60)

    # Test query
    query = "2023-2024 GMC Sierra 3500HD Denali Ultimate black color"
    print(f"\nQuery: {query}")

    # Load all filter JSONs
    print("\nLoading filter JSONs...")
    filters = load_all_filter_jsons()
    print(f"Loaded {len(filters)} retailer filter files")

    total_size = sum(len(json.dumps(f)) for f in filters.values())
    print(f"Total filter JSON size: {total_size:,} bytes")

    # Make LLM call
    print("\nCalling LLM to map filters...")
    result = asyncio.run(map_query_to_all_retailers(query, filters))

    if 'error' in result:
        print(f"\n❌ Error: {result['error']}")
        return

    print("\n✅ LLM Response received!")

    # Pretty print the result
    print("\n" + "=" * 60)
    print("RETAILER-SPECIFIC FILTERS")
    print("=" * 60)

    for retailer, data in result.get('retailers', {}).items():
        print(f"\n【 {retailer.upper()} 】")
        print(json.dumps(data, indent=2))

    # Verify with scraper adapters
    print("\n" + "=" * 60)
    print("VERIFICATION WITH SCRAPER ADAPTERS")
    print("=" * 60)

    verification = verify_with_scraper_adapters(result)

    for retailer, status in verification.items():
        status_icon = "✅" if status['status'] == 'success' else "⚠️"
        print(f"\n{status_icon} {retailer.upper()}: {status['status']}")
        if status.get('error'):
            print(f"   Error: {status['error']}")
        elif status.get('adapter_output'):
            print(f"   Adapter output: {json.dumps(status['adapter_output'], indent=2)[:200]}...")

    # Save full result to file
    output_file = Path(__file__).parent / 'test_llm_filter_output.json'
    with open(output_file, 'w') as f:
        json.dump({
            "query": query,
            "llm_result": result,
            "verification": verification
        }, f, indent=2)

    print(f"\n\nFull results saved to: {output_file}")

    # Summary
    success_count = sum(1 for v in verification.values() if v['status'] == 'success')
    print(f"\nSummary: {success_count}/{len(verification)} scrapers verified successfully")


if __name__ == '__main__':
    main()
