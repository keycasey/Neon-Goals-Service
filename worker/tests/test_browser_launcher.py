from __future__ import annotations

import unittest
import asyncio
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main as worker_main


class ScraperOutputParsingTests(unittest.TestCase):
    def test_parses_json_with_null_values(self) -> None:
        data = worker_main.parse_scraper_output('[{"title":"Passport","price":null}]')

        self.assertEqual(data, [{"title": "Passport", "price": None}])

    def test_uses_explicit_extraction_progress_url(self) -> None:
        self.assertEqual(
            worker_main.resolve_progress_url(
                "https://api.example/api/extraction/callback",
                "https://api.example/api/extraction/progress",
            ),
            "https://api.example/api/extraction/progress",
        )

    def test_rejects_ambiguous_progress_url_fallback(self) -> None:
        with self.assertRaises(ValueError):
            worker_main.resolve_progress_url("https://api.example/custom-result")


class WorkerAuthenticationTests(unittest.TestCase):
    def test_rejects_worker_route_without_key(self) -> None:
        request = SimpleNamespace(
            url=SimpleNamespace(path="/extract"),
            headers={},
        )

        async def call_next(_request):
            raise AssertionError("unauthenticated request reached handler")

        with patch.object(worker_main, "WORKER_API_KEY", "expected-key"):
            response = asyncio.run(worker_main.require_worker_auth(request, call_next))

        self.assertEqual(response.status_code, 401)

    def test_accepts_matching_worker_key(self) -> None:
        request = SimpleNamespace(
            url=SimpleNamespace(path="/extract"),
            headers={"x-worker-key": "expected-key"},
        )

        async def call_next(_request):
            return "accepted"

        with patch.object(worker_main, "WORKER_API_KEY", "expected-key"):
            response = asyncio.run(worker_main.require_worker_auth(request, call_next))

        self.assertEqual(response, "accepted")

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
