from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Iterable

from .commands import extract_commands, extract_redirect_target
from .config import DSPyConfig
from .optimization import configure_dspy_models
from .signatures import build_programs, build_signatures


@dataclass(slots=True)
class LiveChatResult:
    content: str
    commands: list[dict[str, Any]]
    metadata: dict[str, Any]
    chat_type: str
    used_dspy: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "content": self.content,
            "commands": self.commands,
            "metadata": self.metadata,
            "chatType": self.chat_type,
            "usedDspy": self.used_dspy,
        }


def _normalize_metadata(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


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


def _command_to_redirect_proposal(command: dict[str, Any]) -> dict[str, Any] | None:
    command_type = command.get("type")
    data = command.get("data") or {}
    if command_type == "REDIRECT_TO_CATEGORY":
        return {
            "target": "category",
            "categoryId": data.get("categoryId"),
            "message": data.get("message"),
            "reason": data.get("reason"),
        }
    if command_type == "REDIRECT_TO_GOAL":
        return {
            "target": "goal",
            "goalId": data.get("goalId"),
            "goalTitle": data.get("goalTitle"),
            "message": data.get("message"),
            "reason": data.get("reason"),
        }
    if command_type == "REDIRECT_TO_OVERVIEW":
        return {
            "target": "overview",
            "message": data.get("message"),
            "reason": data.get("reason"),
        }
    return None


def _derive_redirect_proposal(commands: list[dict[str, Any]], metadata: dict[str, Any]) -> dict[str, Any] | None:
    proposal = _coerce_jsonish(metadata.get("redirect_proposal") or metadata.get("redirectProposal"))
    if isinstance(proposal, dict) and proposal:
        return proposal

    for command in commands:
        proposal = _command_to_redirect_proposal(command)
        if proposal:
            return proposal
    return None


def _derive_goal_intent(redirect_proposal: dict[str, Any] | None, metadata: dict[str, Any]) -> str | None:
    intent = metadata.get("goal_intent") or metadata.get("goalIntent")
    if isinstance(intent, str) and intent.strip():
        return intent.strip()
    if not redirect_proposal:
        return None
    target = redirect_proposal.get("target")
    if target == "goal":
        return "route_to_goal"
    if target == "category":
        return "route_to_category"
    if target == "overview":
        return "route_to_overview"
    return None


def _derive_tool_scope(redirect_proposal: dict[str, Any] | None, metadata: dict[str, Any]) -> list[str] | None:
    scope = _coerce_jsonish(metadata.get("tool_scope") or metadata.get("toolScope"))
    if isinstance(scope, list):
        normalized = [str(item) for item in scope if str(item).strip()]
        return normalized or None

    if not redirect_proposal:
        return None

    target = redirect_proposal.get("target")
    if target == "goal":
        return ["goal"]
    if target == "category":
        category_id = redirect_proposal.get("categoryId")
        return ["overview", str(category_id or "category")]
    if target == "overview":
        return ["overview"]
    return None


def _extract_feedback(messages: Iterable[dict[str, Any]]) -> Any:
    for message in messages:
        metadata = _normalize_metadata(message.get("metadata"))
        if not metadata:
            continue
        if "feedback" in metadata:
            return metadata["feedback"]
        if "responseFeedback" in metadata:
            return metadata["responseFeedback"]
    return None


def _serialize_message(message: dict[str, Any]) -> str:
    role = message.get("role", "assistant")
    content = str(message.get("content", "")).strip()
    metadata = _normalize_metadata(message.get("metadata"))
    source = message.get("source")
    visible = message.get("visible")

    parts = [f"{role}: {content}"]
    extras: list[str] = []
    if metadata:
        extras.append(f"metadata={json.dumps(metadata, sort_keys=True, default=str)}")
    if source:
        extras.append(f"source={source}")
    if visible is False:
        extras.append("visible=false")
    if extras:
        parts.append(f"[{'; '.join(extras)}]")
    return "\n".join(parts)


def _render_goal_summary(goal: dict[str, Any]) -> str:
    payload = {
        "id": goal.get("id"),
        "type": goal.get("type"),
        "title": goal.get("title"),
        "description": goal.get("description"),
    }
    if goal.get("itemData"):
        payload["itemData"] = goal["itemData"]
    if goal.get("financeData"):
        payload["financeData"] = goal["financeData"]
    if goal.get("actionData"):
        payload["actionData"] = goal["actionData"]
    if goal.get("subgoals"):
        payload["subgoals"] = goal["subgoals"]
    return json.dumps(payload, sort_keys=True, default=str)


def build_live_context(payload: dict[str, Any]) -> tuple[str, str]:
    chat_type = payload.get("chatType", "overview")
    conversation_context = str(payload.get("conversationContext") or "").strip()
    recent_messages = payload.get("recentMessages") or []
    goals = payload.get("goals") or []
    current_goal = payload.get("currentGoal")

    serialized_messages = "\n\n".join(
        _serialize_message(message) for message in recent_messages if isinstance(message, dict)
    )

    sections: list[str] = []
    if conversation_context:
        sections.append(f"[Conversation context]\n{conversation_context}")
    if serialized_messages:
        sections.append(f"[Recent messages]\n{serialized_messages}")

    if chat_type == "overview":
        if goals:
            sections.append("[Goals]\n" + "\n".join(_render_goal_summary(goal) for goal in goals if isinstance(goal, dict)))
        return "conversation_context", "\n\n".join(sections).strip()

    if chat_type in {"items", "finances", "actions"}:
        if goals:
            sections.append("[Category goals]\n" + "\n".join(_render_goal_summary(goal) for goal in goals if isinstance(goal, dict)))
        return "goal_context", "\n\n".join(sections).strip()

    if chat_type == "goal_view":
        if isinstance(current_goal, dict):
            sections.append("[Goal]\n" + _render_goal_summary(current_goal))
        return "goal_context", "\n\n".join(sections).strip()

    if chat_type in {"proposal", "redirect_judge"}:
        if isinstance(current_goal, dict):
            sections.append("[Goal]\n" + _render_goal_summary(current_goal))
        if goals:
            sections.append("[Goals]\n" + "\n".join(_render_goal_summary(goal) for goal in goals if isinstance(goal, dict)))
        return "goal_context", "\n\n".join(sections).strip()

    raise ValueError(f"Unsupported chatType: {chat_type}")


def _build_program_key(chat_type: str) -> str:
    if chat_type == "goal_view":
        return "goal_view"
    if chat_type in {"overview", "items", "finances", "actions", "proposal", "redirect_judge"}:
        return chat_type if chat_type != "goal_view" else "goal_view"
    raise ValueError(f"Unsupported chatType: {chat_type}")


def _extract_prediction_field(prediction: Any, name: str) -> Any:
    value = getattr(prediction, name, None)
    if value is None and isinstance(prediction, dict):
        value = prediction.get(name)
    return value


def _build_commands(prediction: Any) -> list[dict[str, Any]]:
    commands_value = _extract_prediction_field(prediction, "commands")
    parsed_commands = _coerce_jsonish(commands_value) or []
    if isinstance(parsed_commands, list):
        return [command for command in parsed_commands if isinstance(command, dict)]
    return []


def _build_metadata(
    prediction: Any,
    commands: list[dict[str, Any]],
    recent_messages: Iterable[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    metadata = _normalize_metadata(_coerce_jsonish(_extract_prediction_field(prediction, "metadata")))

    redirect_proposal = _derive_redirect_proposal(commands, metadata)
    goal_intent = _derive_goal_intent(redirect_proposal, metadata)
    tool_scope = _derive_tool_scope(redirect_proposal, metadata)
    feedback = _extract_feedback(recent_messages or [])

    matched_goal_id = (
        metadata.get("matched_goal_id")
        or metadata.get("matchedGoalId")
        or (redirect_proposal or {}).get("goalId")
    )
    matched_goal_title = (
        metadata.get("matched_goal_title")
        or metadata.get("matchedGoalTitle")
        or (redirect_proposal or {}).get("goalTitle")
    )
    target_category = (
        metadata.get("target_category")
        or metadata.get("targetCategory")
        or (redirect_proposal or {}).get("categoryId")
    )

    output = {
        "redirectProposal": redirect_proposal,
        "goalIntent": goal_intent,
        "matchedGoalId": matched_goal_id,
        "matchedGoalTitle": matched_goal_title,
        "targetCategory": target_category,
        "toolScope": tool_scope,
        "feedback": feedback,
    }

    if commands:
        output["commands"] = commands

    if goal_intent or redirect_proposal:
        output["awaitingConfirmation"] = True
        output["proposalType"] = "accept_decline" if redirect_proposal else "confirm_edit_cancel"

    return {key: value for key, value in output.items() if value is not None}


def run_live_chat(payload: dict[str, Any]) -> LiveChatResult:
    config = DSPyConfig.from_env()
    dspy = configure_dspy_models(config)
    signatures = build_signatures(dspy)
    programs = build_programs(dspy, signatures)

    chat_type = payload.get("chatType", "overview")
    input_name, context = build_live_context(payload)
    user_message = str(payload.get("userMessage") or payload.get("message") or "").strip()
    if not user_message:
        raise ValueError("userMessage is required for live DSPy chat")

    program_key = _build_program_key(chat_type)
    if program_key == "overview":
        prediction = programs[program_key](
            conversation_context=context,
            user_message=user_message,
        )
    elif program_key in {"items", "finances", "actions", "goal_view", "proposal"}:
        prediction = programs[program_key](
            goal_context=context,
            user_message=user_message,
        )
    elif program_key == "redirect_judge":
        prediction = programs[program_key](
            conversation_context=context,
            user_message=user_message,
            current_chat_type=str(payload.get("currentChatType") or chat_type),
        )
    else:
        raise ValueError(f"Unsupported chatType: {chat_type}")

    assistant_reply = _extract_prediction_field(prediction, "assistant_reply") or _extract_prediction_field(
        prediction, "explanation"
    ) or ""
    content = str(assistant_reply).strip()
    commands = _build_commands(prediction)
    metadata = _build_metadata(prediction, commands, payload.get("recentMessages") or [])

    if not content:
        content = str(_extract_prediction_field(prediction, "explanation") or "").strip()

    if not content and commands:
        content = "I found a structured response for you."

    return LiveChatResult(
        content=content,
        commands=commands,
        metadata=metadata,
        chat_type=chat_type,
        used_dspy=True,
    )


def chunk_text(text: str, max_chars: int = 180) -> list[str]:
    text = text.strip()
    if not text:
        return []

    chunks: list[str] = []
    current = []
    current_len = 0

    for paragraph in text.split("\n"):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if current_len + len(paragraph) + 1 <= max_chars:
            current.append(paragraph)
            current_len += len(paragraph) + 1
        else:
            if current:
                chunks.append("\n".join(current))
            current = [paragraph]
            current_len = len(paragraph)

    if current:
        chunks.append("\n".join(current))

    return chunks or [text]


def build_stream_events(result: LiveChatResult) -> list[dict[str, Any]]:
    events = [{"content": chunk, "done": False} for chunk in chunk_text(result.content)]
    events.append(
        {
            "content": "",
            "done": True,
            "commands": result.commands,
            "metadata": result.metadata,
        }
    )
    return events


def build_stream_system_prompt(chat_type: str) -> str:
    persona = {
        "overview": "the overview assistant",
        "items": "the product specialist",
        "finances": "the finance specialist",
        "actions": "the action coach",
        "goal_view": "the goal-specific assistant",
    }.get(chat_type, "the assistant")

    return (
        f"You are {persona} for Neon Goals. "
        "Reply in plain natural language only. "
        "Do not output JSON, XML, markdown code fences, or command syntax. "
        "If the user seems to belong in another category or goal, explain that conversationally and ask before redirecting. "
        "Keep the reply concise and user-facing."
    )


def build_stream_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    chat_type = str(payload.get("chatType", "overview"))
    _, context = build_live_context(payload)
    user_message = str(payload.get("userMessage") or payload.get("message") or "").strip()
    if not user_message:
        raise ValueError("userMessage is required for live DSPy chat")

    system_prompt = build_stream_system_prompt(chat_type)
    if context:
        system_prompt = f"{system_prompt}\n\nContext:\n{context}"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def build_stream_completion_event(
    streamed_text: str,
    metadata_result: dict[str, Any] | LiveChatResult,
) -> dict[str, Any]:
    if isinstance(metadata_result, LiveChatResult):
        normalized = metadata_result.to_dict()
    else:
        normalized = metadata_result

    commands = normalized.get("commands") or []
    metadata = normalized.get("metadata") or {}

    return {
        "content": "",
        "done": True,
        "commands": commands,
        "metadata": metadata,
    }
