from __future__ import annotations

from typing import Any


def normalize_tool_request(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    name = str(value.get("name") or "").strip()
    arguments = value.get("arguments") or {}

    if not name or not isinstance(arguments, dict):
        return None

    return {"name": name, "arguments": arguments}


def should_continue_loop(result: dict[str, Any]) -> bool:
    tool_requests = result.get("toolRequests") or []
    handoff_complete = bool(result.get("handoffComplete"))
    return bool(tool_requests) and not handoff_complete
