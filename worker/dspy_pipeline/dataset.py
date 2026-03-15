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
    commands: list[dict[str, Any]] = field(default_factory=list)
    redirect_target: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


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

            commands = extract_commands(assistant_message)
            redirect_target = extract_redirect_target(commands)
            example_hash = hashlib.sha256(
                f"{chat_id}:{index}:{user_message}:{assistant_message}".encode("utf-8")
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

