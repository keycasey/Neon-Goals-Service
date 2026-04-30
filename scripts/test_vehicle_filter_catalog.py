#!/usr/bin/env python3
"""Regression tests for vehicle site filter catalogs and adapters."""
import importlib.util
import base64
import json
import unittest
from urllib.parse import parse_qs, urlparse
from pathlib import Path


SCRIPTS_DIR = Path(__file__).parent
DATA_DIR = SCRIPTS_DIR / "data"


def load_json(name: str) -> dict:
    with open(DATA_DIR / name, "r") as f:
        return json.load(f)


def load_script(name: str):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), SCRIPTS_DIR / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class VehicleFilterCatalogTests(unittest.TestCase):
    def test_extracts_exterior_color_from_listing_text(self):
        details = load_script("vehicle_listing_details.py")

        self.assertEqual(
            details.extract_exterior_color("Exterior Color White\nInterior Black"),
            "White",
        )
        self.assertEqual(
            details.extract_exterior_color("Ext. Color: Sonic Gray Pearl\nMileage 42,000 mi"),
            "Sonic Gray Pearl",
        )
        self.assertEqual(
            details.extract_exterior_color("Color: Crystal Black Pearl\nStock #123"),
            "Crystal Black Pearl",
        )
        self.assertIsNone(details.extract_exterior_color("75,000 mi\nAWD\n$28,998"))

    def test_llm_prompt_requests_positive_color_post_filter(self):
        parser = load_script("parse_vehicle_query.py")

        prompt = parser.build_system_prompt({})

        self.assertIn("postFilters.includeExteriorColors", prompt)

    def test_catalogs_include_honda_passport_site_values(self):
        autotrader = load_json("autotrader-filters.json")
        carmax = load_json("carmax-filters.json")
        carvana = load_json("carvana-filters.json")
        cargurus = load_json("cargurus-filters.json")
        truecar = load_json("truecar-filters.json")

        self.assertEqual(
            autotrader["model_examples"]["Honda"]["Passport"]["path_value"],
            "passport",
        )
        self.assertEqual(
            carmax["model_examples"]["Honda"]["Passport"]["path_value"],
            "passport",
        )
        self.assertIn(
            {"label": "Passport"},
            carvana["honda_models"]["models"],
        )
        self.assertEqual(
            cargurus["model_examples"]["Honda"]["Passport"]["value"],
            "m6/d593",
        )
        self.assertEqual(
            truecar["model_examples"]["Honda"]["Passport"]["path_value"],
            "passport",
        )

    def test_cargurus_adapter_preserves_llm_honda_passport_filters(self):
        cargurus = load_script("scrape-cargurus.py")

        filters = cargurus.adapt_structured_to_cargurus(
            {
                "url_params": {
                    "make": "Honda",
                    "model": "Passport",
                    "zip": "94002",
                    "distance": 500,
                    "drivetrain": "ALL_WHEEL_DRIVE",
                    "mileageMax": 80000,
                }
            }
        )

        self.assertEqual(filters["make"], "Honda")
        self.assertEqual(filters["model"], "Passport")
        self.assertEqual(filters["zip"], "94002")
        self.assertEqual(filters["distance"], 500)
        self.assertEqual(filters["drivetrain"], "ALL_WHEEL_DRIVE")
        self.assertEqual(filters["mileageMax"], 80000)

    def test_carmax_adapter_and_url_preserve_mileage_and_drivetrain(self):
        carmax = load_script("scrape-carmax.py")

        params = carmax.adapt_structured_to_carmax(
            {
                "makes": ["Honda"],
                "models": ["Passport"],
                "drivetrain": "All Wheel Drive",
                "mileageMax": 80000,
            }
        )
        url = carmax.build_carmax_url(**params)

        self.assertEqual(params["makes"], ["Honda"])
        self.assertEqual(params["models"], ["Passport"])
        self.assertEqual(params["drivetrain"], "All Wheel Drive")
        self.assertEqual(params["mileage_max"], 80000)
        self.assertIn("/cars/honda/passport/all-wheel-drive", url)
        self.assertIn("mileageMax=80000", url)

    def test_truecar_adapter_preserves_mileage_location_and_awd(self):
        truecar = load_script("scrape-truecar.py")

        params = truecar.adapt_structured_to_truecar(
            {
                "make": "Honda",
                "model": "Passport",
                "mileageMax": 80000,
                "postalCode": "94002",
                "searchRadius": 500,
                "drivetrain": "AWD",
            }
        )

        self.assertEqual(params["make"], "Honda")
        self.assertEqual(params["model"], "Passport")
        self.assertEqual(params["mileageMax"], 80000)
        self.assertEqual(params["postalCode"], "94002")
        self.assertEqual(params["searchRadius"], 500)
        self.assertEqual(params["drivetrain"], "AWD")

    def test_site_filter_urls_include_positive_exterior_color(self):
        autotrader = load_script("scrape-autotrader.py")
        carmax = load_script("scrape-carmax.py")
        carvana = load_script("scrape-carvana.py")
        carvana_interactive = load_script("scrape-carvana-interactive.py")
        cargurus = load_script("scrape-cargurus.py")
        truecar = load_script("scrape-truecar.py")

        autotrader_url = autotrader.adapt_structured_to_autotrader(
            {"make": "Honda", "model": "Passport", "exteriorColor": "Gray", "zip": "94002"}
        )
        carmax_url = carmax.build_carmax_url(
            **carmax.adapt_structured_to_carmax(
                {"makes": ["Honda"], "models": ["Passport"], "exteriorColor": "Gray"}
            )
        )
        carvana_query = carvana.adapt_structured_to_carvana(
            {"make": "Honda", "model": "Passport", "exteriorColor": "Gray"}
        )
        carvana_interactive_params = carvana_interactive.adapt_structured_to_carvana_interactive(
            {"makes": ["Honda"], "models": ["Passport"], "exteriorColor": "Gray"}
        )
        cargurus_url = cargurus.build_search_url(
            "m6",
            "d593",
            "94002",
            500,
            exteriorColor="GRAY",
        )
        truecar_params = truecar.adapt_structured_to_truecar(
            {"make": "Honda", "model": "Passport", "exteriorColor": "Gray"}
        )
        truecar_url = truecar.build_truecar_url(truecar_params)

        self.assertIn("/cars-for-sale/gray/honda/passport", autotrader_url)
        self.assertIn("/cars/honda/passport/gray", carmax_url)
        self.assertIn("/cars/honda-passport", carvana_query)
        self.assertIn("color=gray", carvana_query)
        self.assertEqual(carvana_interactive_params["exteriorColor"], "Gray")
        self.assertIn("colors=GRAY", cargurus_url)
        self.assertIn("exteriorColor[]=gray", truecar_url)

    def test_site_filter_urls_include_price_and_mileage_limits(self):
        autotrader = load_script("scrape-autotrader.py")
        carmax = load_script("scrape-carmax.py")
        carvana = load_script("scrape-carvana.py")
        carvana_interactive = load_script("scrape-carvana-interactive.py")
        cargurus = load_script("scrape-cargurus.py")
        truecar = load_script("scrape-truecar.py")

        structured = {
            "make": "Honda",
            "model": "Passport",
            "makes": ["Honda"],
            "models": ["Passport"],
            "maxPrice": 30000,
            "mileageMax": 80000,
            "zip": "94002",
            "postalCode": "94002",
        }

        autotrader_url = autotrader.adapt_structured_to_autotrader(structured)
        carmax_url = carmax.build_carmax_url(
            **carmax.adapt_structured_to_carmax(structured)
        )
        carvana_query = carvana.adapt_structured_to_carvana(structured)
        carvana_interactive_params = carvana_interactive.adapt_structured_to_carvana_interactive(structured)
        cargurus_params = cargurus.adapt_structured_to_cargurus(structured)
        cargurus_url = cargurus.build_search_url(
            "m6",
            "d593",
            "94002",
            500,
            maxPrice=cargurus_params.get("maxPrice"),
            mileageMax=cargurus_params.get("mileageMax"),
        )
        truecar_url = truecar.build_truecar_url(
            truecar.adapt_structured_to_truecar(structured)
        )

        self.assertIn("maxPrice=30000", autotrader_url)
        self.assertIn("maxMileage=80000", autotrader_url)
        self.assertIn("price=30000", carmax_url)
        self.assertIn("mileageMax=80000", carmax_url)
        carvana_query_params = parse_qs(urlparse(carvana_query).query)
        carvana_payload = json.loads(
            base64.urlsafe_b64decode(carvana_query_params["cvnaid"][0] + "==").decode("utf-8")
        )
        self.assertEqual(carvana_payload["filters"]["price"]["max"], 30000)
        self.assertEqual(carvana_payload["filters"]["mileage"]["max"], 80000)
        self.assertEqual(carvana_interactive_params["maxPrice"], 30000)
        self.assertEqual(carvana_interactive_params["mileageMax"], 80000)
        self.assertIn("maxPrice=30000", cargurus_url)
        self.assertIn("maxMileage=80000", cargurus_url)
        self.assertIn("price_high=30000", truecar_url)
        self.assertIn("mileageMax=80000", truecar_url)


if __name__ == "__main__":
    unittest.main()
