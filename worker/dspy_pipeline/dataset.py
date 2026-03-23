from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .commands import extract_commands, extract_redirect_target, strip_command_lines


@dataclass(slots=True)
class ChatTurnExample:
    example_id: str
    chat_id: str
    chat_type: str
    category_id: str | None
    goal_id: str | None
    user_message: str
    assistant_message: str
    assistant_text: str
    assistant_metadata: dict[str, Any] | None = None
    feedback: Any = None
    goal_intent: str | None = None
    redirect_proposal: dict[str, Any] | None = None
    matched_goal_id: str | None = None
    matched_goal_title: str | None = None
    target_category: str | None = None
    tool_scope: list[str] | None = None
    commands: list[dict[str, Any]] = field(default_factory=list)
    redirect_target: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _normalize_metadata(row: dict[str, Any]) -> dict[str, Any]:
    metadata = row.get("metadata")
    if isinstance(metadata, dict):
        return metadata
    return {}


def _extract_commands_from_metadata(metadata: dict[str, Any]) -> list[dict[str, Any]]:
    commands = metadata.get("commands")
    if not isinstance(commands, list):
        return []

    normalized: list[dict[str, Any]] = []
    for command in commands:
        if isinstance(command, dict) and "type" in command and "data" in command:
            normalized.append(command)
    return normalized


def _extract_feedback(messages: list[dict[str, Any]], start_index: int) -> Any:
    for row in messages[start_index:]:
        metadata = _normalize_metadata(row)
        if not metadata:
            continue
        if "feedback" in metadata:
            return metadata["feedback"]
        if "responseFeedback" in metadata:
            return metadata["responseFeedback"]
    return None


def _extract_redirect_target_from_metadata(metadata: dict[str, Any]) -> str | None:
    redirect_proposal = metadata.get("redirectProposal")
    if not isinstance(redirect_proposal, dict):
        return None

    target = redirect_proposal.get("target")
    if target == "category":
        category_id = redirect_proposal.get("categoryId", "")
        return f"category:{category_id}" if category_id else "category:"
    if target == "goal":
        goal_id = redirect_proposal.get("goalId", "")
        return f"goal:{goal_id}" if goal_id else "goal:"
    if target == "overview":
        return "overview"
    return None


def build_examples_from_rows(rows: Iterable[dict[str, Any]]) -> list[ChatTurnExample]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row["chat_id"], []).append(row)

    examples: list[ChatTurnExample] = []
    for chat_id, messages in grouped.items():
        ordered = sorted(messages, key=lambda item: item["created_at"])
        for index in range(len(ordered) - 1):
            current_message = ordered[index]
            next_message = ordered[index + 1]
            if current_message["role"] != "user" or next_message["role"] != "assistant":
                continue

            assistant_message = next_message["content"].strip()
            user_message = current_message["content"].strip()
            if not user_message or not assistant_message:
                continue

            assistant_metadata = _normalize_metadata(next_message)
            commands = extract_commands(assistant_message)
            commands.extend(_extract_commands_from_metadata(assistant_metadata))
            redirect_target = extract_redirect_target(commands) or _extract_redirect_target_from_metadata(assistant_metadata)
            feedback = _extract_feedback(ordered, index + 2)
            redirect_proposal = assistant_metadata.get("redirectProposal")
            goal_intent = assistant_metadata.get("goalIntent")
            matched_goal_id = assistant_metadata.get("matchedGoalId")
            matched_goal_title = assistant_metadata.get("matchedGoalTitle")
            target_category = assistant_metadata.get("targetCategory")
            tool_scope = assistant_metadata.get("toolScope")
            example_hash = hashlib.sha256(
                f"{chat_id}:{index}:{user_message}:{assistant_message}:{json.dumps(assistant_metadata, sort_keys=True, default=str)}".encode("utf-8")
            ).hexdigest()[:16]

            examples.append(
                ChatTurnExample(
                    example_id=example_hash,
                    chat_id=chat_id,
                    chat_type=current_message["chat_type"],
                    category_id=current_message.get("category_id"),
                    goal_id=current_message.get("goal_id"),
                    user_message=user_message,
                    assistant_message=assistant_message,
                    assistant_text=strip_command_lines(assistant_message),
                    assistant_metadata=assistant_metadata or None,
                    feedback=feedback,
                    goal_intent=goal_intent,
                    redirect_proposal=redirect_proposal if isinstance(redirect_proposal, dict) else None,
                    matched_goal_id=matched_goal_id,
                    matched_goal_title=matched_goal_title,
                    target_category=target_category,
                    tool_scope=tool_scope if isinstance(tool_scope, list) else None,
                    commands=commands,
                    redirect_target=redirect_target,
                )
            )

    return examples


def deterministic_split(
    examples: list[ChatTurnExample],
    train_ratio: float,
) -> tuple[list[ChatTurnExample], list[ChatTurnExample]]:
    train: list[ChatTurnExample] = []
    dev: list[ChatTurnExample] = []

    for example in examples:
        bucket = int(hashlib.sha256(example.example_id.encode("utf-8")).hexdigest()[:8], 16)
        if (bucket % 10_000) / 10_000 < train_ratio:
            train.append(example)
        else:
            dev.append(example)

    if not dev and train:
        dev.append(train.pop())

    return train, dev


def write_jsonl(path: Path, examples: Iterable[ChatTurnExample | dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for example in examples:
            payload = example.to_dict() if isinstance(example, ChatTurnExample) else example
            handle.write(json.dumps(payload, sort_keys=True) + "\n")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if not path.exists():
        return records
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                records.append(json.loads(line))
    return records
