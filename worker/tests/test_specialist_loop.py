from dspy_pipeline.specialist_loop import normalize_tool_request, should_continue_loop


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
