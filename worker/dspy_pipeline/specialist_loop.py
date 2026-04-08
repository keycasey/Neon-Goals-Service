from __future__ import annotations

import json
from typing import Any


def _coerce_dspy_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y", "on"}:
            return True
        if normalized in {"false", "0", "no", "n", "off", ""}:
            return False
    return bool(value)


def normalize_tool_request(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    name = str(value.get("name") or "").strip()
    arguments = value.get("arguments")

    if not name or not isinstance(arguments, dict):
        return None

    return {"name": name, "arguments": arguments}


def _extract_prediction_field(prediction: Any, name: str) -> Any:
    value = getattr(prediction, name, None)
    if value is None and isinstance(prediction, dict):
        value = prediction.get(name)
    return value


def _coerce_jsonish(value: Any) -> Any:
    if value in (None, ""):
        return None
    if isinstance(value, (dict, list, bool, int, float)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def normalize_specialist_prediction(prediction: Any) -> dict[str, Any]:
    tool_requests_value = _coerce_jsonish(_extract_prediction_field(prediction, "tool_requests"))
    tool_requests: list[dict[str, Any]] = []
    if isinstance(tool_requests_value, list):
        tool_requests = [
            request
            for request in (normalize_tool_request(item) for item in tool_requests_value)
            if request is not None
        ]

    commands_value = _coerce_jsonish(_extract_prediction_field(prediction, "commands"))
    commands: list[dict[str, Any]] = []
    if isinstance(commands_value, list):
        commands = [command for command in commands_value if isinstance(command, dict)]

    metadata_value = _coerce_jsonish(_extract_prediction_field(prediction, "metadata"))
    metadata = metadata_value if isinstance(metadata_value, dict) else {}

    assistant_reply = str(_extract_prediction_field(prediction, "assistant_reply") or "").strip()
    if not assistant_reply:
        follow_up_question = str(_extract_prediction_field(prediction, "follow_up_question") or "").strip()
        if follow_up_question:
            assistant_reply = follow_up_question
    if not assistant_reply:
        explanation = str(_extract_prediction_field(prediction, "explanation") or "").strip()
        if explanation:
            assistant_reply = explanation

    return {
        "content": assistant_reply,
        "commands": commands,
        "toolRequests": tool_requests,
        "followUpQuestion": str(_extract_prediction_field(prediction, "follow_up_question") or "").strip(),
        "handoffComplete": _coerce_dspy_bool(_extract_prediction_field(prediction, "handoff_complete")),
        "metadata": metadata,
    }


def should_continue_loop(result: dict[str, Any]) -> bool:
    tool_requests = result.get("toolRequests") or []
    handoff_complete = _coerce_dspy_bool(result.get("handoffComplete"))
    return bool(tool_requests) and not handoff_complete


def run_specialist_loop(
    *,
    program,
    goal_context: str,
    user_message: str,
    tool_runner,
    max_iterations: int = 4,
):
    tool_results: list[dict[str, Any]] = []
    used_tools: list[str] = []

    for _ in range(max_iterations):
        prediction = program(
            goal_context=goal_context,
            user_message=user_message,
            tool_results=json.dumps(tool_results),
        )
        result = normalize_specialist_prediction(prediction)
        if not should_continue_loop(result):
            metadata = dict(result.get("metadata") or {})
            metadata["usedTools"] = used_tools
            result["metadata"] = metadata
            return result

        next_requests = [normalize_tool_request(item) for item in result["toolRequests"]]
        next_requests = [item for item in next_requests if item]
        for request in next_requests:
            used_tools.append(request["name"])
            tool_results.append(
                {
                    "request": request,
                    "response": tool_runner(request),
                }
            )

    raise RuntimeError("DSPy specialist loop exceeded max iterations")
