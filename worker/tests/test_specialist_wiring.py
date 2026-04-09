from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from dspy_pipeline.live_chat import run_live_chat
from dspy_pipeline.signatures import build_programs


class _FakeDspy:
    class Signature:
        pass

    class Module:
        def __call__(self, *args, **kwargs):
            return self.forward(*args, **kwargs)

    @staticmethod
    def InputField(*, desc: str):
        return {"kind": "input", "desc": desc}

    @staticmethod
    def OutputField(*, desc: str):
        return {"kind": "output", "desc": desc}

    class Predict:
        def __init__(self, signature):
            self.signature = signature
            self.calls = []

        def __call__(self, **kwargs):
            self.calls.append(kwargs)
            return kwargs


def test_finances_program_forwards_tool_results_to_predictor() -> None:
    signatures = {
        "overview": object(),
        "items": object(),
        "finances": object(),
        "actions": object(),
        "goal_view": object(),
        "proposal": object(),
        "redirect_judge": object(),
    }
    programs = build_programs(_FakeDspy, signatures)

    result = programs["finances"](
        goal_context="ctx",
        user_message="msg",
        tool_results="[]",
    )

    assert result["tool_results"] == "[]"
    assert programs["finances"].predict.calls[0]["tool_results"] == "[]"
    assert programs["finances"].predict.calls[0]["goal_context"] == "ctx"
    assert programs["finances"].predict.calls[0]["user_message"] == "msg"

    programs["items"](goal_context="ctx", user_message="msg")
    assert "tool_results" not in programs["items"].predict.calls[0]


def test_live_chat_finance_path_passes_empty_tool_results() -> None:
    class _Program:
        def __init__(self) -> None:
            self.calls = []

        def __call__(self, **kwargs):
            self.calls.append(kwargs)
            return {"assistant_reply": "ok"}

    finance_program = _Program()

    with (
        patch("dspy_pipeline.live_chat.DSPyConfig.from_env", return_value=SimpleNamespace()),
        patch("dspy_pipeline.live_chat.configure_dspy_models", return_value=SimpleNamespace()),
        patch("dspy_pipeline.live_chat.build_signatures", return_value={"finances": SimpleNamespace()}),
        patch(
            "dspy_pipeline.live_chat.build_programs",
            return_value={
                "finances": finance_program,
            },
        ),
    ):
        run_live_chat(
            {
                "chatType": "finances",
                "userMessage": "What should I do next?",
            }
        )

    assert finance_program.calls[0]["goal_context"] == ""
    assert finance_program.calls[0]["user_message"] == "What should I do next?"
    assert finance_program.calls[0]["tool_results"] == "[]"


def test_live_chat_finance_path_uses_follow_up_question_and_normalizes_metadata() -> None:
    class _Program:
        def __init__(self) -> None:
            self.calls = 0

        def __call__(self, **kwargs):
            self.calls += 1
            if self.calls == 1:
                return {
                    "assistant_reply": "",
                    "explanation": "This explanation should not win.",
                    "follow_up_question": "What dates should I use?",
                    "handoff_complete": "false",
                    "tool_requests": [
                        {"name": "get_financial_context", "arguments": {"includeRecentTransactions": True}},
                        {"name": "", "arguments": {}},
                        "not-a-request",
                    ],
                }
            return {
                "assistant_reply": "",
                "follow_up_question": "What dates should I use?",
                "handoff_complete": "true",
                "tool_requests": [],
            }

    with (
        patch("dspy_pipeline.live_chat.DSPyConfig.from_env", return_value=SimpleNamespace()),
        patch("dspy_pipeline.live_chat.configure_dspy_models", return_value=SimpleNamespace()),
        patch("dspy_pipeline.live_chat.build_signatures", return_value={"finances": SimpleNamespace()}),
        patch(
            "dspy_pipeline.live_chat.build_programs",
            return_value={
                "finances": _Program(),
            },
        ),
    ):
        result = run_live_chat(
            {
                "chatType": "finances",
                "userMessage": "What should I do next?",
            }
        )

    assert result.content == "What dates should I use?"
    assert result.metadata["followUpQuestion"] == "What dates should I use?"
    assert result.metadata["handoffComplete"] is True
    assert result.metadata["toolRequests"] == []
    assert result.metadata["usedTools"] == ["get_financial_context"]


def test_live_chat_non_finance_specialists_skip_specialist_loop() -> None:
    class _Program:
        def __init__(self) -> None:
            self.calls = []

        def __call__(self, **kwargs):
            self.calls.append(kwargs)
            return {"assistant_reply": "ok"}

    items_program = _Program()
    actions_program = _Program()

    with (
        patch("dspy_pipeline.live_chat.DSPyConfig.from_env", return_value=SimpleNamespace()),
        patch("dspy_pipeline.live_chat.configure_dspy_models", return_value=SimpleNamespace()),
        patch(
            "dspy_pipeline.live_chat.build_signatures",
            return_value={"items": SimpleNamespace(), "actions": SimpleNamespace()},
        ),
        patch(
            "dspy_pipeline.live_chat.build_programs",
            return_value={
                "items": items_program,
                "actions": actions_program,
            },
        ),
        patch("dspy_pipeline.live_chat.run_specialist_loop") as run_loop,
    ):
        run_live_chat({"chatType": "items", "userMessage": "What should I do next?"})
        run_live_chat({"chatType": "actions", "userMessage": "What should I do next?"})

    assert run_loop.call_count == 0
    assert "tool_results" not in items_program.calls[0]
    assert "tool_results" not in actions_program.calls[0]
