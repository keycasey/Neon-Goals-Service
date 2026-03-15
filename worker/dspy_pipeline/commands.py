from __future__ import annotations

import json
import re
from typing import Any

COMMAND_LINE_RE = re.compile(r"^\s*`?([A-Z_]+):\s*(\{.*\})`?\s*$")

REDIRECT_TYPES = {
    "REDIRECT_TO_CATEGORY",
    "REDIRECT_TO_GOAL",
    "REDIRECT_TO_OVERVIEW",
}


def extract_commands(text: str) -> list[dict[str, Any]]:
    commands: list[dict[str, Any]] = []
    for line in text.splitlines():
        match = COMMAND_LINE_RE.match(line.strip())
        if not match:
            continue
        command_type, payload = match.groups()
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        commands.append({"type": command_type, "data": data})
    return commands


def strip_command_lines(text: str) -> str:
    lines = [line for line in text.splitlines() if not COMMAND_LINE_RE.match(line.strip())]
    return "\n".join(lines).strip()


def extract_redirect_target(commands: list[dict[str, Any]]) -> str | None:
    for command in commands:
        command_type = command["type"]
        data = command["data"]
        if command_type == "REDIRECT_TO_CATEGORY":
            return f"category:{data.get('categoryId', '')}"
        if command_type == "REDIRECT_TO_GOAL":
            return f"goal:{data.get('goalId', '')}"
        if command_type == "REDIRECT_TO_OVERVIEW":
            return "overview"
    return None

