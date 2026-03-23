from __future__ import annotations

from typing import Any


def build_signatures(dspy: Any) -> dict[str, type]:
    class OverviewSignature(dspy.Signature):
        """Route overview messages, propose commands, and suggest redirects when needed."""

        conversation_context = dspy.InputField(desc="Summarized overview chat context.")
        user_message = dspy.InputField(desc="The latest user message.")
        assistant_reply = dspy.OutputField(desc="Helpful reply for the user.")
        commands = dspy.OutputField(desc="JSON array of structured commands or [].")
        redirect_proposal = dspy.OutputField(
            desc='Optional JSON object like {"target":"category","categoryId":"items","message":"..."} or empty string.'
        )
        goal_intent = dspy.OutputField(
            desc='Short label like "route_to_goal", "route_to_category", or "answer_question".'
        )
        matched_goal_id = dspy.OutputField(desc="Matched goal ID, if one was referenced.")
        matched_goal_title = dspy.OutputField(desc="Matched goal title, if one was referenced.")
        target_category = dspy.OutputField(desc='Target category like "items", "finances", or "actions".')
        tool_scope = dspy.OutputField(
            desc='JSON array of tool scopes to keep in mind, or empty string.'
        )

    class ItemsSignature(dspy.Signature):
        """Handle item specialist messages, commands, and redirects."""

        goal_context = dspy.InputField(desc="Visible item goals plus recent chat context.")
        user_message = dspy.InputField(desc="The latest user message.")
        assistant_reply = dspy.OutputField(desc="Helpful items-specialist reply.")
        commands = dspy.OutputField(desc="JSON array of structured commands or [].")
        redirect_proposal = dspy.OutputField(
            desc='Optional JSON object like {"target":"overview","message":"..."} or empty string.'
        )
        goal_intent = dspy.OutputField(
            desc='Short label like "route_to_goal", "route_to_overview", or "answer_question".'
        )
        matched_goal_id = dspy.OutputField(desc="Matched goal ID, if one was referenced.")
        matched_goal_title = dspy.OutputField(desc="Matched goal title, if one was referenced.")
        target_category = dspy.OutputField(desc='Target category like "items", "finances", or "actions".')
        tool_scope = dspy.OutputField(
            desc='JSON array of tool scopes to keep in mind, or empty string.'
        )

    class FinancesSignature(dspy.Signature):
        """Handle finance specialist messages, commands, and redirects."""

        goal_context = dspy.InputField(desc="Visible finance goals plus recent chat context.")
        user_message = dspy.InputField(desc="The latest user message.")
        assistant_reply = dspy.OutputField(desc="Helpful finance-specialist reply.")
        commands = dspy.OutputField(desc="JSON array of structured commands or [].")
        redirect_proposal = dspy.OutputField(
            desc='Optional JSON object like {"target":"overview","message":"..."} or empty string.'
        )
        goal_intent = dspy.OutputField(
            desc='Short label like "route_to_goal", "route_to_overview", or "answer_question".'
        )
        matched_goal_id = dspy.OutputField(desc="Matched goal ID, if one was referenced.")
        matched_goal_title = dspy.OutputField(desc="Matched goal title, if one was referenced.")
        target_category = dspy.OutputField(desc='Target category like "items", "finances", or "actions".')
        tool_scope = dspy.OutputField(
            desc='JSON array of tool scopes to keep in mind, or empty string.'
        )

    class ActionsSignature(dspy.Signature):
        """Handle action specialist messages, commands, and redirects."""

        goal_context = dspy.InputField(desc="Visible action goals plus recent chat context.")
        user_message = dspy.InputField(desc="The latest user message.")
        assistant_reply = dspy.OutputField(desc="Helpful actions-specialist reply.")
        commands = dspy.OutputField(desc="JSON array of structured commands or [].")
        redirect_proposal = dspy.OutputField(
            desc='Optional JSON object like {"target":"overview","message":"..."} or empty string.'
        )
        goal_intent = dspy.OutputField(
            desc='Short label like "route_to_goal", "route_to_overview", or "answer_question".'
        )
        matched_goal_id = dspy.OutputField(desc="Matched goal ID, if one was referenced.")
        matched_goal_title = dspy.OutputField(desc="Matched goal title, if one was referenced.")
        target_category = dspy.OutputField(desc='Target category like "items", "finances", or "actions".')
        tool_scope = dspy.OutputField(
            desc='JSON array of tool scopes to keep in mind, or empty string.'
        )

    class GoalViewSignature(dspy.Signature):
        """Handle goal-view messages, commands, and handoffs."""

        goal_context = dspy.InputField(desc="Single-goal context plus recent chat context.")
        user_message = dspy.InputField(desc="The latest user message.")
        assistant_reply = dspy.OutputField(desc="Helpful goal-view reply.")
        commands = dspy.OutputField(desc="JSON array of structured commands or [].")
        redirect_proposal = dspy.OutputField(
            desc='Optional JSON object like {"target":"overview","message":"..."} or empty string.'
        )
        goal_intent = dspy.OutputField(
            desc='Short label like "route_to_goal", "route_to_category", "route_to_overview", or "answer_question".'
        )
        matched_goal_id = dspy.OutputField(desc="Matched goal ID, if one was referenced.")
        matched_goal_title = dspy.OutputField(desc="Matched goal title, if one was referenced.")
        target_category = dspy.OutputField(desc='Target category like "items", "finances", or "actions".')
        tool_scope = dspy.OutputField(
            desc='JSON array of tool scopes to keep in mind, or empty string.'
        )

    class ProposalSignature(dspy.Signature):
        """Generate structured command proposals that conform to backend expectations."""

        goal_context = dspy.InputField(desc="Relevant goal context and user intent.")
        user_message = dspy.InputField(desc="The latest user message.")
        command_json = dspy.OutputField(desc="Single JSON command payload or [] if no command.")
        explanation = dspy.OutputField(desc="Short user-facing explanation for the proposal.")
        redirect_proposal = dspy.OutputField(
            desc='Optional JSON object like {"target":"goal","goalId":"..."} or empty string.'
        )
        goal_intent = dspy.OutputField(
            desc='Short label like "route_to_goal", "route_to_category", or "answer_question".'
        )
        matched_goal_id = dspy.OutputField(desc="Matched goal ID, if one was referenced.")
        matched_goal_title = dspy.OutputField(desc="Matched goal title, if one was referenced.")
        target_category = dspy.OutputField(desc='Target category like "items", "finances", or "actions".')
        tool_scope = dspy.OutputField(
            desc='JSON array of tool scopes to keep in mind, or empty string.'
        )

    class RedirectJudgeSignature(dspy.Signature):
        """Judge whether a redirect is appropriate and where it should go."""

        conversation_context = dspy.InputField(desc="Recent conversation context.")
        user_message = dspy.InputField(desc="The latest user message.")
        current_chat_type = dspy.InputField(desc="overview, category, or goal.")
        target = dspy.OutputField(
            desc="overview, category:items, category:finances, category:actions, goal:<id>, or stay."
        )
        rationale = dspy.OutputField(desc="Short reasoning for the routing decision.")
        redirect_proposal = dspy.OutputField(
            desc='Optional JSON object like {"target":"goal","goalId":"..."} or empty string.'
        )
        goal_intent = dspy.OutputField(
            desc='Short label like "route_to_goal", "route_to_category", "route_to_overview", or "stay".'
        )
        matched_goal_id = dspy.OutputField(desc="Matched goal ID, if one was referenced.")
        matched_goal_title = dspy.OutputField(desc="Matched goal title, if one was referenced.")
        target_category = dspy.OutputField(desc='Target category like "items", "finances", or "actions".')
        tool_scope = dspy.OutputField(
            desc='JSON array of tool scopes to keep in mind, or empty string.'
        )

    return {
        "overview": OverviewSignature,
        "items": ItemsSignature,
        "finances": FinancesSignature,
        "actions": ActionsSignature,
        "goal_view": GoalViewSignature,
        "proposal": ProposalSignature,
        "redirect_judge": RedirectJudgeSignature,
    }


def build_programs(dspy: Any, signatures: dict[str, type]) -> dict[str, Any]:
    class OverviewProgram(dspy.Module):
        def __init__(self) -> None:
            super().__init__()
            self.predict = dspy.Predict(signatures["overview"])

        def forward(self, conversation_context: str, user_message: str) -> Any:
            return self.predict(
                conversation_context=conversation_context,
                user_message=user_message,
            )

    class SpecialistProgram(dspy.Module):
        def __init__(self, key: str) -> None:
            super().__init__()
            self.predict = dspy.Predict(signatures[key])

        def forward(self, goal_context: str, user_message: str) -> Any:
            return self.predict(goal_context=goal_context, user_message=user_message)

    class GoalViewProgram(dspy.Module):
        def __init__(self) -> None:
            super().__init__()
            self.predict = dspy.Predict(signatures["goal_view"])

        def forward(self, goal_context: str, user_message: str) -> Any:
            return self.predict(goal_context=goal_context, user_message=user_message)

    class ProposalProgram(dspy.Module):
        def __init__(self) -> None:
            super().__init__()
            self.predict = dspy.Predict(signatures["proposal"])

        def forward(self, goal_context: str, user_message: str) -> Any:
            return self.predict(goal_context=goal_context, user_message=user_message)

    class RedirectJudgeProgram(dspy.Module):
        def __init__(self) -> None:
            super().__init__()
            self.predict = dspy.Predict(signatures["redirect_judge"])

        def forward(
            self,
            conversation_context: str,
            user_message: str,
            current_chat_type: str,
        ) -> Any:
            return self.predict(
                conversation_context=conversation_context,
                user_message=user_message,
                current_chat_type=current_chat_type,
            )

    return {
        "overview": OverviewProgram(),
        "items": SpecialistProgram("items"),
        "finances": SpecialistProgram("finances"),
        "actions": SpecialistProgram("actions"),
        "goal_view": GoalViewProgram(),
        "proposal": ProposalProgram(),
        "redirect_judge": RedirectJudgeProgram(),
    }
