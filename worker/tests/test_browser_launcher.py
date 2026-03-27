from __future__ import annotations

import unittest
from unittest.mock import patch
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main as worker_main


class BrowserLauncherTests(unittest.TestCase):
    def test_prefers_prime_run_when_available(self) -> None:
        with patch.dict(worker_main.os.environ, {}, clear=True), patch.object(
            worker_main.shutil,
            "which",
            return_value="/usr/bin/prime-run",
        ):
            self.assertEqual(
                worker_main.get_browser_launcher_prefix(),
                [
                    "prime-run",
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


if __name__ == "__main__":
    unittest.main()
