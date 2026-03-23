from __future__ import annotations

import unittest

from dspy_pipeline.live_chat import build_stream_completion_event


class BuildStreamCompletionEventTests(unittest.TestCase):
    def test_merges_streamed_text_with_metadata_result(self) -> None:
        result = build_stream_completion_event(
            streamed_text="Need to move this to your finance chat.",
            metadata_result={
                "commands": [
                    {
                        "type": "REDIRECT_TO_CATEGORY",
                        "data": {"categoryId": "finances"},
                    }
                ],
                "metadata": {
                    "redirectProposal": {
                        "target": "category",
                        "categoryId": "finances",
                    },
                    "goalIntent": "route_to_category",
                },
            },
        )

        self.assertEqual(result["content"], "")
        self.assertTrue(result["done"])
        self.assertEqual(result["commands"][0]["type"], "REDIRECT_TO_CATEGORY")
        self.assertEqual(result["metadata"]["goalIntent"], "route_to_category")


if __name__ == "__main__":
    unittest.main()
