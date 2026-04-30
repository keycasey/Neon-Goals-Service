from __future__ import annotations

import unittest
from unittest.mock import patch
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main as worker_main


class ScraperOutputParsingTests(unittest.TestCase):
    def test_parses_json_with_null_values(self) -> None:
        data = worker_main.parse_scraper_output('[{"title":"Passport","price":null}]')

        self.assertEqual(data, [{"title": "Passport", "price": None}])

    def test_parses_legacy_python_literal_output(self) -> None:
        data = worker_main.parse_scraper_output("[{'title': 'Passport', 'price': None}]")

        self.assertEqual(data, [{"title": "Passport", "price": None}])


class BrowserLauncherTests(unittest.TestCase):
    def test_defaults_to_xvfb_run_when_prime_run_is_available(self) -> None:
        with patch.dict(worker_main.os.environ, {}, clear=True), patch.object(
            worker_main.shutil,
            "which",
            return_value="/usr/bin/prime-run",
        ):
            self.assertEqual(
                worker_main.get_browser_launcher_prefix(),
                [
                    "xvfb-run",
                    "--auto-servernum",
                    "--server-args=-screen 0 1920x1080x24",
                ],
            )

    def test_falls_back_to_xvfb_when_prime_run_is_missing(self) -> None:
        with patch.dict(worker_main.os.environ, {}, clear=True), patch.object(
            worker_main.shutil,
            "which",
            return_value=None,
        ):
            self.assertEqual(
                worker_main.get_browser_launcher_prefix(),
                [
                    "xvfb-run",
                    "--auto-servernum",
                    "--server-args=-screen 0 1920x1080x24",
                ],
            )

    def test_can_force_xvfb_run_even_when_prime_run_is_present(self) -> None:
        with patch.dict(
            worker_main.os.environ,
            {"SCRAPER_BROWSER_LAUNCHER": "xvfb-run"},
            clear=True,
        ), patch.object(worker_main.shutil, "which", return_value="/usr/bin/prime-run"):
            self.assertEqual(
                worker_main.get_browser_launcher_prefix(),
                [
                    "xvfb-run",
                    "--auto-servernum",
                    "--server-args=-screen 0 1920x1080x24",
                ],
            )

    def test_can_force_prime_run_when_available(self) -> None:
        with patch.dict(
            worker_main.os.environ,
            {"SCRAPER_BROWSER_LAUNCHER": "prime-run"},
            clear=True,
        ), patch.object(worker_main.shutil, "which", return_value="/usr/bin/prime-run"):
            self.assertEqual(
                worker_main.get_browser_launcher_prefix(),
                [
                    "prime-run",
                    "xvfb-run",
                    "--auto-servernum",
                    "--server-args=-screen 0 1920x1080x24",
                ],
            )


if __name__ == "__main__":
    unittest.main()
