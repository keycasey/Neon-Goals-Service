from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class SignatureField:
    name: str
    description: str


@dataclass(frozen=True, slots=True)
class SignatureSpec:
    name: str
    instructions: str
    inputs: tuple[SignatureField, ...]
    outputs: tuple[SignatureField, ...]


SIGNATURE_SPECS: dict[str, SignatureSpec] = {
    "GoalCreationSignature": SignatureSpec(
        name="GoalCreationSignature",
        instructions="Coach the user toward a well-formed EXTRACT_DATA response while only asking for missing information.",
        inputs=(
            SignatureField("conversation_context", "Recent goal-creation chat context."),
            SignatureField("user_message", "The latest user message."),
        ),
        outputs=(
            SignatureField("assistant_reply", "Natural language guidance and clarifying questions."),
            SignatureField("extract_data", "Single EXTRACT_DATA line or empty string when not ready."),
        ),
    ),
    "OverviewSignature": SignatureSpec(
        name="OverviewSignature",
        instructions="Prioritize across active goals and emit commands only when an explicit change or redirect is appropriate.",
        inputs=(
            SignatureField("current_date", "Current local date context."),
            SignatureField("goals_list", "Rendered active goal summary."),
            SignatureField("user_message", "The latest user message."),
        ),
        outputs=(
            SignatureField("assistant_reply", "Helpful overview response."),
            SignatureField("commands", "Optional command lines appended to the reply."),
        ),
    ),
    "ItemsSignature": SignatureSpec(
        name="ItemsSignature",
        instructions="Handle item and vehicle conversations with strong search-term hygiene and valid commands.",
        inputs=(
            SignatureField("goal_context", "Visible item goals and recent category chat context."),
            SignatureField("user_message", "The latest user message."),
        ),
        outputs=(
            SignatureField("assistant_reply", "Helpful item specialist response."),
            SignatureField("commands", "Optional item-management commands."),
        ),
    ),
    "FinancesSignature": SignatureSpec(
        name="FinancesSignature",
        instructions="Provide realistic financial coaching and emit valid finance commands when needed.",
        inputs=(
            SignatureField("goal_context", "Visible finance goals and recent category chat context."),
            SignatureField("user_message", "The latest user message."),
        ),
        outputs=(
            SignatureField("assistant_reply", "Helpful finance specialist response."),
            SignatureField("commands", "Optional finance-management commands."),
        ),
    ),
    "ActionsSignature": SignatureSpec(
        name="ActionsSignature",
        instructions="Turn the user's intent into actionable next steps and task-level changes.",
        inputs=(
            SignatureField("goal_context", "Visible action goals and recent category chat context."),
            SignatureField("user_message", "The latest user message."),
        ),
        outputs=(
            SignatureField("assistant_reply", "Helpful action specialist response."),
            SignatureField("commands", "Optional task-management or redirect commands."),
        ),
    ),
    "GoalViewItemSignature": SignatureSpec(
        name="GoalViewItemSignature",
        instructions="Stay scoped to a single item goal and generate precise search or title updates.",
        inputs=(
            SignatureField("goal_context", "Single item goal context."),
            SignatureField("user_message", "The latest user message."),
        ),
        outputs=(
            SignatureField("assistant_reply", "Helpful item-goal response."),
            SignatureField("commands", "Optional goal-view commands."),
        ),
    ),
    "GoalViewDefaultSignature": SignatureSpec(
        name="GoalViewDefaultSignature",
        instructions="Support one finance or action goal with clear progress, subgoal, and redirect behaviors.",
        inputs=(
            SignatureField("goal_context", "Single finance or action goal context."),
            SignatureField("user_message", "The latest user message."),
        ),
        outputs=(
            SignatureField("assistant_reply", "Helpful goal-view response."),
            SignatureField("commands", "Optional subgoal, update, or redirect commands."),
        ),
    ),
}


def serialize_signature_specs() -> dict[str, Any]:
    return {
        name: {
            "name": spec.name,
            "instructions": spec.instructions,
            "inputs": [
                {"name": field.name, "description": field.description}
                for field in spec.inputs
            ],
            "outputs": [
                {"name": field.name, "description": field.description}
                for field in spec.outputs
            ],
        }
        for name, spec in SIGNATURE_SPECS.items()
    }


def build_dspy_signatures(dspy: Any) -> dict[str, type]:
    class GoalCreationSignature(dspy.Signature):
        """Coach the user toward a well-formed EXTRACT_DATA response while only asking for missing information."""

        conversation_context = dspy.InputField(desc="Recent goal-creation chat context.")
        user_message = dspy.InputField(desc="The latest user message.")
        assistant_reply = dspy.OutputField(desc="Natural language guidance and clarifying questions.")
        extract_data = dspy.OutputField(desc="Single EXTRACT_DATA line or empty string when not ready.")

    class OverviewSignature(dspy.Signature):
        """Prioritize across active goals and emit commands only when an explicit change or redirect is appropriate."""

        current_date = dspy.InputField(desc="Current local date context.")
        goals_list = dspy.InputField(desc="Rendered active goal summary.")
        user_message = dspy.InputField(desc="The latest user message.")
        assistant_reply = dspy.OutputField(desc="Helpful overview response.")
        commands = dspy.OutputField(desc="Optional command lines appended to the reply.")

    class ItemsSignature(dspy.Signature):
        """Handle item and vehicle conversations with strong search-term hygiene and valid commands."""

        goal_context = dspy.InputField(desc="Visible item goals and recent category chat context.")
        user_message = dspy.InputField(desc="The latest user message.")
        assistant_reply = dspy.OutputField(desc="Helpful item specialist response.")
        commands = dspy.OutputField(desc="Optional item-management commands.")

    class FinancesSignature(dspy.Signature):
        """Provide realistic financial coaching and emit valid finance commands when needed."""

        goal_context = dspy.InputField(desc="Visible finance goals and recent category chat context.")
        user_message = dspy.InputField(desc="The latest user message.")
        assistant_reply = dspy.OutputField(desc="Helpful finance specialist response.")
        commands = dspy.OutputField(desc="Optional finance-management commands.")

    class ActionsSignature(dspy.Signature):
        """Turn the user's intent into actionable next steps and task-level changes."""

        goal_context = dspy.InputField(desc="Visible action goals and recent category chat context.")
        user_message = dspy.InputField(desc="The latest user message.")
        assistant_reply = dspy.OutputField(desc="Helpful action specialist response.")
        commands = dspy.OutputField(desc="Optional task-management or redirect commands.")

    class GoalViewItemSignature(dspy.Signature):
        """Stay scoped to a single item goal and generate precise search or title updates."""

        goal_context = dspy.InputField(desc="Single item goal context.")
        user_message = dspy.InputField(desc="The latest user message.")
        assistant_reply = dspy.OutputField(desc="Helpful item-goal response.")
        commands = dspy.OutputField(desc="Optional goal-view commands.")

    class GoalViewDefaultSignature(dspy.Signature):
        """Support one finance or action goal with clear progress, subgoal, and redirect behaviors."""

        goal_context = dspy.InputField(desc="Single finance or action goal context.")
        user_message = dspy.InputField(desc="The latest user message.")
        assistant_reply = dspy.OutputField(desc="Helpful goal-view response.")
        commands = dspy.OutputField(desc="Optional subgoal, update, or redirect commands.")

    return {
        "goalCreation": GoalCreationSignature,
        "overview": OverviewSignature,
        "items": ItemsSignature,
        "finances": FinancesSignature,
        "actions": ActionsSignature,
        "goalViewItem": GoalViewItemSignature,
        "goalViewDefault": GoalViewDefaultSignature,
    }
