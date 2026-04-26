# Unified Agent Context Bridges Design

Date: 2026-04-25
Status: Draft for review
Related specs:
- `2026-04-04-group-goal-agent-backend-design.md`
- `2026-04-08-dspy-specialist-migration-design.md`

## Summary

The user should experience Neon as one coherent assistant, even when the backend uses multiple specialist agents and tools.

This design keeps the existing unique chats for overview, categories, and goal views, but changes how context and delegation are presented:

- the visible assistant is the orchestrator
- specialists remain backend participants with isolated context and tools
- specialist progress can optionally appear in a group-chat style transcript
- chat switching injects compacted source-chat context into the target chat
- returning to a source chat clears the bridge summary that represented it elsewhere

The result is a single coherent user experience without losing specialist reasoning, specialized tools, or per-view chat history.

## Goals

- Avoid bouncing the user between visible specialist chats.
- Preserve overview, category, and goal chats as distinct surfaces.
- Let agents use compacted context from other chats when the user switches views.
- Support both simple and transparent presentation modes from the same backend run.
- Keep clarification centralized through the orchestrator.
- Make agent delegation durable, replayable, and debuggable.

## Non-Goals

- Replacing DSPy specialists with one large prompt.
- Making specialists directly ask the user separate questions.
- Duplicating messages across chats as visible transcript entries.
- Using OpenClaw or Pi for normal Neon goal creation or finance Q&A.
- Removing category or goal-specific chat state.

## User-Facing Model

### Simple Mode

Default mode. The user sees one assistant.

Specialist calls, tool use, and intermediate opinions are stored as hidden events. The orchestrator merges results into one visible response.

Example:

```text
User: I want a Wahl trimmer and can I afford a Honda Passport?

Assistant: I split that into an item goal and a finance check. I created the trimmer goal. Based on current cash flow, the Passport looks tight unless you adjust monthly savings or delay purchase timing.
```

### Group Chat Mode

Optional transparency mode. The user sees orchestrator and specialist progress in one transcript.

Example:

```text
User: I want a Wahl trimmer and can I afford a Honda Passport?

Orchestrator: I will split this into item planning and affordability analysis.

Items Specialist: I am preparing the trimmer item goal and checking whether product details are needed.

Finance Specialist: I am reviewing recurring cash flow and projected monthly surplus.

Orchestrator: I created the trimmer goal. The Passport looks risky unless you reduce other monthly commitments or extend the target date.
```

Group chat mode is a rendering choice. It must not change the underlying orchestration behavior.

## Settings

Add a user preference:

```ts
type AgentConversationMode = "single_agent" | "group_chat";
```

Suggested UI copy:

```text
Agent Transparency
Simple: Show one assistant
Detailed: Show orchestrator and specialist updates
```

Default: `single_agent`.

## Orchestration Model

### AgentRun

Each user message that may require work creates an `AgentRun`.

```ts
type AgentRun = {
  id: string;
  userId: string;
  chatId: string;
  userMessageId: string;
  status: "running" | "completed" | "blocked_for_clarification" | "failed";
  createdAt: Date;
  completedAt?: Date;
};
```

### WorkItem

The orchestrator decomposes the user message into work items.

```ts
type WorkItem = {
  id: string;
  runId: string;
  kind:
    | "answer_question"
    | "create_goal"
    | "update_goal"
    | "extract_product"
    | "external_task"
    | "clarification";
  assignedAgent: "orchestrator" | "items" | "finances" | "actions" | "goal_view" | "openclaw";
  status: "pending" | "running" | "completed" | "blocked" | "failed";
  input: unknown;
  result?: unknown;
  error?: string;
};
```

The run continues until every work item is terminal:

- `completed`
- `failed`
- `blocked`

If any work item needs user input, the orchestrator asks one consolidated clarification question.

### AgentEvent

All agent progress is stored as structured events.

```ts
type AgentEvent = {
  id: string;
  runId: string;
  workItemId?: string;
  chatId: string;
  agent: "orchestrator" | "items" | "finances" | "actions" | "goal_view" | "openclaw";
  eventType: "thought" | "progress" | "question" | "result" | "error";
  content: string;
  visibility: "hidden" | "visible_in_group_mode" | "visible";
  createdAt: Date;
};
```

Rendering rules:

- `single_agent`: show user messages and visible orchestrator messages.
- `group_chat`: show user messages, visible orchestrator messages, and `visible_in_group_mode` specialist events.
- hidden events are available for context, debugging, and replay but are not rendered.

Specialists may report `question` events, but those questions are not sent directly to the user. The orchestrator aggregates them.

## Context Bridge Model

The system keeps unique chats, but view switches carry compacted context forward.

### ChatContextBridge

```ts
type ChatContextBridge = {
  id: string;
  userId: string;
  sourceChatId: string;
  targetChatId: string;
  summaryMessageId: string;
  status: "active" | "cleared";
  createdAt: Date;
  clearedAt?: Date;
};
```

The bridge summary is stored as a hidden system message:

```ts
type ContextBridgeMessageMetadata = {
  source: "context_bridge";
  bridgeId: string;
  sourceChatId: string;
  targetChatId: string;
  expiresOnReturnToChatId: string;
};
```

Bridge message semantics:

- `visible: false`
- `role: "system"`
- `source: "context_bridge"`
- content is a compact summary of the source chat relevant to the target chat
- the summary is active only while the user is in the target chat

## Chat Switching

Add a backend endpoint:

```http
POST /chats/context/switch
```

Request:

```json
{
  "fromChatId": "overview",
  "toChatId": "items"
}
```

Behavior:

1. Clear active bridge messages whose `expiresOnReturnToChatId` equals `toChatId`.
2. Summarize `fromChatId` into a compact target-specific summary.
3. Store the summary as a hidden system message in `toChatId`.
4. Create an active `ChatContextBridge` record linking source and target.

Returning to a chat removes bridge summaries that represented that chat elsewhere.

Example:

```text
Overview -> Items
  create hidden summary of Overview in Items

Items -> Overview
  clear hidden summary of Overview from Items
  create hidden summary of Items in Overview
```

This avoids a chat consuming a compacted version of itself.

## Context Builder

When building agent context for a target chat, include:

1. target chat recent visible messages
2. target chat long-term summaries
3. active context bridge summaries into the target chat
4. hidden agent events relevant to the current run
5. current user message

Priority rules:

- direct target-chat messages outrank bridge summaries
- fresh bridge summaries outrank stale long-term summaries from other chats
- compacted context must identify its source chat and timestamp
- bridge summaries should be short enough to avoid crowding out target-chat context

## Specialist Delegation

The orchestrator decides whether to answer directly or delegate.

Delegation examples:

- item purchase, product URL, product comparison -> Items Specialist
- cash flow, affordability, transaction analysis -> Finance Specialist
- skills, habits, tasks, setup plans -> Actions Specialist
- current goal-specific edits or questions -> Goal View Specialist
- external machine actions -> OpenClaw adapter when available

Specialists return structured results to the orchestrator:

```ts
type SpecialistResult = {
  status: "completed" | "blocked" | "failed";
  content: string;
  commands?: unknown[];
  clarificationNeed?: string;
  events?: AgentEvent[];
};
```

The orchestrator owns final user-visible synthesis.

## Clarification Policy

Specialists must not independently ask visible user questions.

If multiple work items are blocked, the orchestrator asks one concise grouped question.

Example:

```text
I can handle most of this now. I need one clarification: for the Wahl trimmer, do you want a beard trimmer, hair clipper, or all-in-one grooming kit?
```

Completed work should still be summarized alongside the clarification so the user sees forward progress.

## Persistence Policy

Do not rely on local-only frontend messages for orchestration.

All of the following must be persisted server-side:

- user messages
- orchestrator visible replies
- hidden specialist events
- context bridge summaries
- agent run state
- work item state

Frontend state may optimistically render pending messages, but server state is the source of truth.

## Failure Handling

If one specialist fails, the run should continue for unrelated work items.

The final orchestrator response should distinguish:

- completed work
- failed work
- blocked work
- next question or recovery action

Example:

```text
I created the action goals and checked affordability. Product extraction failed for the vape links, so I did not create those item goals yet. Do you want me to create manual item goals from the link titles instead?
```

## Migration Plan

1. Add the `agentConversationMode` setting with no behavior change.
2. Add `AgentRun`, `WorkItem`, `AgentEvent`, and `ChatContextBridge` persistence.
3. Add context bridge creation and cleanup on chat switch.
4. Move extraction completion follow-ups out of frontend local user-message sends and into persisted backend agent events/messages.
5. Add orchestrator decomposition for mixed user messages.
6. Route work items to existing specialist services.
7. Render group-chat mode from `AgentEvent.visibility`.
8. Make the orchestrator synthesize final visible responses in both modes.

## Open Questions

- Should group-chat mode be available to all users or only behind an experimental setting?
- Should specialist progress events stream live, or should they appear after each work item completes?
- How aggressively should bridge summaries be refreshed when the user sends multiple messages in the target chat?
- Should context bridges be physically deleted on cleanup or marked `cleared` for audit/replay?

