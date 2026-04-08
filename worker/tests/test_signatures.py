from __future__ import annotations

from dspy_pipeline.signatures import build_signatures


class _FakeDspy:
    class Signature:
        pass

    class Module:
        pass

    @staticmethod
    def InputField(*, desc: str):
        return {"kind": "input", "desc": desc}

    @staticmethod
    def OutputField(*, desc: str):
        return {"kind": "output", "desc": desc}


def test_finances_signature_uses_the_specialist_tool_contract() -> None:
    signatures = build_signatures(_FakeDspy)
    finances = signatures["finances"]

    assert set(vars(finances)) >= {
        "goal_context",
        "user_message",
        "tool_results",
        "assistant_reply",
        "commands",
        "tool_requests",
        "follow_up_question",
        "handoff_complete",
    }
    assert "redirect_proposal" not in vars(finances)
    assert "goal_intent" not in vars(finances)
    assert "matched_goal_id" not in vars(finances)
    assert "matched_goal_title" not in vars(finances)
    assert "target_category" not in vars(finances)
    assert "tool_scope" not in vars(finances)
