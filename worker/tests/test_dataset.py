from __future__ import annotations

import unittest

from dspy_pipeline.dataset import build_examples_from_rows


class BuildExamplesFromRowsTests(unittest.TestCase):
    def test_includes_metadata_and_followup_feedback(self) -> None:
        rows = [
            {
                "message_id": "msg_user",
                "chat_id": "chat_1",
                "role": "user",
                "content": "Can you move this to the finance helper?",
                "thread_id": "thread_1",
                "created_at": "2026-03-22T10:00:00Z",
                "chat_type": "overview",
                "category_id": None,
                "goal_id": None,
                "metadata": None,
                "visible": True,
                "source": "user",
            },
            {
                "message_id": "msg_assistant",
                "chat_id": "chat_1",
                "role": "assistant",
                "content": "Sure, I can route that.",
                "thread_id": "thread_1",
                "created_at": "2026-03-22T10:00:01Z",
                "chat_type": "overview",
                "category_id": None,
                "goal_id": None,
                "metadata": {
                    "commands": [
                        {
                            "type": "REDIRECT_TO_GOAL",
                            "data": {
                                "goalId": "goal_7",
                                "goalTitle": "Emergency Fund",
                                "message": "I will take you there.",
                            },
                        }
                    ],
                    "redirectProposal": {
                        "target": "goal",
                        "goalId": "goal_7",
                        "goalTitle": "Emergency Fund",
                        "message": "I will take you there.",
                    },
                    "goalIntent": "route_to_goal",
                    "matchedGoalId": "goal_7",
                    "matchedGoalTitle": "Emergency Fund",
                    "targetCategory": "finances",
                    "toolScope": ["overview", "goal"],
                },
                "visible": True,
                "source": "assistant",
            },
            {
                "message_id": "msg_feedback",
                "chat_id": "chat_1",
                "role": "system",
                "content": "Redirect feedback captured.",
                "thread_id": "thread_1",
                "created_at": "2026-03-22T10:00:02Z",
                "chat_type": "overview",
                "category_id": None,
                "goal_id": None,
                "metadata": {
                    "feedback": {
                        "accepted": True,
                        "note": "User confirmed the redirect",
                    }
                },
                "visible": False,
                "source": "system",
            },
        ]

        examples = build_examples_from_rows(rows)

        self.assertEqual(len(examples), 1)
        example = examples[0]
        self.assertEqual(example.commands[0]["type"], "REDIRECT_TO_GOAL")
        self.assertEqual(example.redirect_target, "goal:goal_7")
        self.assertEqual(example.goal_intent, "route_to_goal")
        self.assertEqual(example.matched_goal_id, "goal_7")
        self.assertEqual(example.matched_goal_title, "Emergency Fund")
        self.assertEqual(example.target_category, "finances")
        self.assertEqual(example.tool_scope, ["overview", "goal"])
        self.assertEqual(
            example.feedback,
            {"accepted": True, "note": "User confirmed the redirect"},
        )


if __name__ == "__main__":
    unittest.main()
