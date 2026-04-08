# DSPy Specialist Migration Design

## Goal

Migrate specialist chats from the current OpenAI function-calling path to a DSPy-to-DSPy handoff architecture, while preserving the existing Overview DSPy agent as the top-level router and coordinator.

This migration does not use feature flags. Each specialist is cut over directly once its DSPy replacement is ready, and the replaced OpenAI specialist path is removed as part of the migration.

## Current State

Today the system has two different orchestration models:

- `Overview` chat can go through DSPy routing and structured response generation.
- `Category` specialist chat (`items`, `finances`, `actions`) uses the OpenAI chat path in [`src/modules/ai/openai/chat/category.chat.ts`](../../../src/modules/ai/openai/chat/category.chat.ts), with tool calling handled there.

That split creates several problems:

- specialist tool use is model-driven rather than policy-driven
- debugging is harder because handoff and tool execution happen in different orchestration systems
- specialist behavior is inconsistent with the DSPy handoff model already used elsewhere
- finance recommendations can over-rely on prompt-injected transaction summaries instead of structured, tool-derived truth

## Desired Architecture

The target architecture is:

- `Overview DSPy agent`
  - keeps its current job
  - decides whether to answer directly or hand off
  - emits a structured handoff to a specialist DSPy agent

- `Specialist DSPy agents`
  - one per specialist domain:
    - `finances`
    - `items`
    - `actions`
    - later `goal_view` if needed
  - each has:
    - its own DSPy signature/program
    - its own context builder
    - its own tool registry
    - its own response policy

- `Service-side orchestration layer`
  - receives overview handoff decisions
  - invokes the target specialist DSPy agent directly
  - executes specialist tool calls server-side
  - returns the specialist response to the existing chat pipeline

This means handoff becomes:

`Overview DSPy -> Specialist DSPy`

and not:

`Overview DSPy -> OpenAI CategoryChat`

## Core Principles

### 1. Overview DSPy Stays Intact

The existing Overview DSPy agent remains the entry point for high-level guidance, routing, and cross-goal reasoning. This migration is not a rewrite of overview behavior.

### 2. Specialists Get Isolated Responsibilities

Each specialist DSPy agent should own only its domain:

- `finances`: linked accounts, transactions, recurring income/expenses, savings analysis, financial recommendations
- `items`: extraction, product search, candidate comparison, budget-aware item planning
- `actions`: action planning, task decomposition, sequencing, dependency reasoning

### 3. Tools Are Explicit and Deterministic

Tool execution must move out of model-managed OpenAI function-calling loops and into server-side orchestration. The specialist DSPy program should decide *which* tool to call and *why*, but the service should execute the tool and feed the result back.

### 4. No Feature Flags

This migration uses direct replacement. For each specialist:

1. implement DSPy specialist
2. verify parity and correctness
3. switch overview handoff target to that DSPy specialist
4. remove the old OpenAI specialist path for that specialist

## Target Handoff Contract

Overview should hand specialists a normalized payload with enough context to act, but without leaking unrelated chat concerns.

Recommended handoff payload:

```json
{
  "sourceAgent": "overview",
  "targetAgent": "finances",
  "userMessage": "Help me understand my spending and savings rate",
  "handoffReason": "user asked for account-specific finance analysis",
  "conversationSummary": "User wants spending review tied to emergency fund and savings goals.",
  "relevantGoals": [],
  "matchedGoalIds": [],
  "toolScope": ["overview", "finances"]
}
```

Required semantics:

- `targetAgent`: the DSPy specialist program to invoke
- `handoffReason`: short structured explanation for observability and replay
- `conversationSummary`: summary of the current interaction state, not the whole transcript
- `relevantGoals`: minimal goal context needed by the specialist
- `toolScope`: explicit indication of which tools the specialist may use

## Specialist DSPy Interface

Each specialist DSPy program should have a constrained output contract. It should not directly fabricate raw UI responses without structure.

Recommended output fields:

- `content`
- `commands`
- `metadata`
- `toolRequests`
- `followUpQuestion`
- `handoffComplete`

Example:

```json
{
  "content": "I analyzed your linked financial context. Your recurring income currently exceeds recurring expenses by about $1,050/month.",
  "commands": [],
  "metadata": {
    "usedTools": ["get_financial_context"],
    "linkedAccountsConsidered": ["Capital One - 360 Checking", "Capital One - VentureOne"]
  },
  "toolRequests": [],
  "followUpQuestion": "I found several larger non-recurring charges. Do you want me to separate one-off expenses from your baseline spending?",
  "handoffComplete": true
}
```

## Tool Execution Model

### Current Problem

The current OpenAI specialist path exposes tool schemas and lets the model choose whether to call them. This is flexible but difficult to enforce and debug.

### New Model

The specialist DSPy loop should be iterative:

1. DSPy receives specialist context
2. DSPy either:
   - answers directly
   - requests a tool call
   - asks a clarifying question
   - emits commands
3. Service executes requested tool if present
4. Tool result is appended to specialist context
5. DSPy runs again
6. Loop continues until `handoffComplete`

This loop must have:

- bounded tool iterations
- structured error propagation
- replayable traces
- explicit tool names and arguments in logs

## Finance Specialist Design

Finance should be migrated first because it currently has the largest gap between available system truth and the behavior users are seeing.

### Finance Specialist Tool Set

Initial finance DSPy tool registry:

- `get_financial_context`
- `get_live_balance`
- `get_live_transactions`
- `analyze_all_spending_and_savings`

### Finance Specialist Policy

The finance specialist should follow these rules:

- use `get_financial_context` before making account-specific or cashflow-specific recommendations
- never claim the user pasted transaction data unless the user actually pasted it in the current chat
- never say it cannot access linked accounts if tool/context data is available
- cite which linked accounts were considered when giving concrete financial analysis
- treat recurring income/expense outputs as the primary truth over raw category labels when both are available
- treat large unmatched transactions as potential one-offs and ask before using them as baseline assumptions

### Finance Context Shape

The new `get_financial_context` tool should provide:

- linked account inventory
- current net worth
- recurring income
- recurring expenses
- net monthly cashflow
- recent transactions
- likely one-off transactions
- accounts without stored transactions
- assumptions used to derive recurring cashflow

This gives the specialist both:

- high-level financial truth
- transaction-level drilldown when needed

## Item and Action Specialists

After finance, migrate `items` and `actions` using the same pattern.

### Items

Expected tool families:

- extraction
- item search
- candidate refresh
- price/budget support

### Actions

Expected tool families:

- task planning
- sequencing
- dependency reasoning
- action-goal modification commands

The same orchestration contract should apply:

- DSPy decides
- service executes tools
- DSPy finalizes response

## Current Code Areas To Replace

### Keep

- [`worker/dspy_pipeline/live_chat.py`](../../../worker/dspy_pipeline/live_chat.py)
- existing overview DSPy routing and chat-response contract
- service-side thread/history integration

### Replace or Bypass

- OpenAI specialist orchestration in [`src/modules/ai/openai/chat/category.chat.ts`](../../../src/modules/ai/openai/chat/category.chat.ts)
- OpenAI specialist tool schema definitions
- OpenAI specialist tool-call execution loop

### Reuse

- [`src/modules/ai/ai-tools.service.ts`](../../../src/modules/ai/ai-tools.service.ts)
- specialist prompts only where their language is still useful as DSPy instruction input
- current command parsing and metadata shaping

## Migration Sequence

### Phase 1: Introduce DSPy Specialist Abstractions

- define specialist handoff payload
- define DSPy specialist output contract
- add specialist tool-request/result loop in DSPy worker-service boundary

### Phase 2: Finance Specialist Cutover

- implement finance DSPy specialist
- wire finance-specific context builder
- route overview finance handoffs to finance DSPy specialist
- remove OpenAI finance specialist path

### Phase 3: Item Specialist Cutover

- implement item DSPy specialist
- route overview item handoffs to item DSPy specialist
- remove OpenAI item specialist path

### Phase 4: Action Specialist Cutover

- implement action DSPy specialist
- route overview action handoffs to action DSPy specialist
- remove OpenAI action specialist path

### Phase 5: Goal View Specialist Evaluation

- decide whether `goal_view` needs its own DSPy specialist or can remain separate
- if yes, migrate it with the same contract

## Observability and Debugging

The migration only improves reliability if it also improves traceability.

For every specialist run, log:

- source chat type
- selected specialist
- handoff reason
- tool requests
- tool arguments
- tool results summary
- final response metadata
- commands emitted

Store enough information to answer:

- why did overview hand off?
- why did specialist use this tool?
- which accounts did finance actually consider?
- was the bad output caused by tool input, tool result, or final synthesis?

## Testing Strategy

### Unit Tests

- handoff payload normalization
- specialist tool loop behavior
- finance context builder correctness
- specialist output parsing
- error handling for failed tool requests

### Integration Tests

- overview DSPy -> finance DSPy handoff
- finance DSPy calling `get_financial_context`
- finance DSPy returning grounded account-aware analysis
- finance DSPy asking clarifying questions for likely one-offs
- command generation parity with existing UI expectations

### Regression Tests

Add tests for the exact failure modes already observed:

- no false claim that user pasted 60-day data
- no false claim of duplicate 360 Checking accounts when only checking + savings exist
- no unsupported “I can’t access your accounts” language when linked data is available
- no unsupported “loan payment” conclusions unless the cited transactions justify it

## Non-Goals

This migration does not:

- rewrite overview DSPy behavior
- add feature flags
- redesign the UI chat surfaces
- change proposal/command semantics unless required for specialist parity

## Recommendation

Proceed with a direct specialist-by-specialist replacement, starting with `finances`.

Finance has the strongest need for:

- structured tool use
- grounded system truth
- transparent account coverage
- explicit one-off vs recurring reasoning

Once finance is stable under DSPy-to-DSPy handoff, apply the same pattern to `items` and `actions`.
