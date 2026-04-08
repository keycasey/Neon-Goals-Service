from dspy_pipeline.specialist_loop import normalize_tool_request, run_specialist_loop, should_continue_loop


def test_normalize_tool_request_accepts_valid_request():
    request = normalize_tool_request(
        {
            "name": "get_financial_context",
            "arguments": {"includeRecentTransactions": True},
        }
    )

    assert request == {
        "name": "get_financial_context",
        "arguments": {"includeRecentTransactions": True},
    }


def test_normalize_tool_request_rejects_invalid_payload():
    assert normalize_tool_request("not-json") is None
    assert normalize_tool_request({"name": "", "arguments": {}}) is None
    assert normalize_tool_request({"name": "get_financial_context", "arguments": []}) is None


def test_should_continue_loop_requires_pending_tool_requests():
    assert should_continue_loop({"toolRequests": [{"name": "get_financial_context", "arguments": {}}]}) is True
    assert should_continue_loop({"toolRequests": [], "handoffComplete": True}) is False


def test_should_continue_loop_treats_string_false_as_false():
    assert should_continue_loop(
        {"toolRequests": [{"name": "get_financial_context", "arguments": {}}], "handoffComplete": "false"}
    ) is True


def test_run_specialist_loop_reinjects_tool_results():
    class FakeProgram:
        def __init__(self):
            self.calls = 0

        def __call__(self, *, goal_context: str, user_message: str, tool_results: str):
            self.calls += 1
            if self.calls == 1:
                return {
                    "assistant_reply": "",
                    "commands": "[]",
                    "tool_requests": '[{"name":"get_financial_context","arguments":{}}]',
                    "follow_up_question": "",
                    "handoff_complete": "false",
                }
            return {
                "assistant_reply": "Your recurring expenses are lower than your recurring income.",
                "commands": "[]",
                "tool_requests": "[]",
                "follow_up_question": "",
                "handoff_complete": "true",
            }

    observed = []

    def tool_runner(request):
        observed.append(request)
        return {"ok": True, "result": {"netMonthlyCashflow": 1050}}

    result = run_specialist_loop(
        program=FakeProgram(),
        goal_context="finance context",
        user_message="How am I doing?",
        tool_runner=tool_runner,
        max_iterations=3,
    )

    assert observed == [{"name": "get_financial_context", "arguments": {}}]
    assert result["content"] == "Your recurring expenses are lower than your recurring income."
    assert result["metadata"]["usedTools"] == ["get_financial_context"]
