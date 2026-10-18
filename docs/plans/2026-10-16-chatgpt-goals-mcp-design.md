# ChatGPT Goals MCP Design

**Date:** 2026-10-16
**Status:** Phases 1–2 implemented for private proof; OAuth release work remains

## Decision

Build a remote MCP server for ChatGPT whose primary job is to persist and manage Neon Goals data on behalf of the authenticated user.

ChatGPT owns the conversation and any user-confirmation behavior. The MCP server does not create drafts, require a second confirmation inside Neon Goals, or attempt to decide whether the conversation sufficiently confirmed a change. When ChatGPT calls an authorized mutation tool, Neon Goals applies it immediately and returns the canonical saved record.

The MCP must make mistakes easy to correct:

- every created goal can be read back and updated
- every mutation returns the resulting canonical goal
- archive is reversible
- permanent deletion is not exposed in v1
- retries cannot create duplicate goals or repeat a mutation
- optional optimistic concurrency prevents silent overwrites of newer edits

Neon's read-only finance data remains useful, especially when the user is using Neon Goals directly or ChatGPT does not have equivalent financial context. It is a secondary phase and is not a prerequisite for the goal-management MCP.

## Product Boundary

```text
User conversation
  -> ChatGPT decides when to call a tool and handles conversational confirmation
  -> Neon Goals MCP authenticates the user, validates the operation, and persists it
  -> Neon Goals app displays the same canonical goal records

Optional finance context
  -> ChatGPT may use its own connected-finance source
  -> or later read cached financial context from Neon Goals
  -> the model combines that context and calls Neon Goals goal tools
```

The Neon Goals MCP cannot access another ChatGPT connector directly. ChatGPT is the orchestrator between connected finance data and Neon Goals. The MCP only receives the explicit, validated fields supplied in its tool call.

## Goal MCP v1

Expose tools only. Do not add prompts or resources until a demonstrated client need exists.

### Read tools

#### `list_goals`

List the user's goals with optional filters:

- `type`: `item`, `finance`, `action`, or `group`
- `status`: `active`, `completed`, or `archived`
- `updatedAfter`
- bounded `limit` and opaque `cursor`

Return compact summaries suitable for choosing a goal ID. Do not include large item-search result payloads.

#### `get_goal`

Return one complete user-owned goal by opaque goal ID, including its type-specific data, tasks, parent, and compact subgoal summaries.

### Mutation tools

#### `create_goal`

Create one goal immediately. Input is a discriminated union keyed by `type` and supports all existing goal types:

- common: `title`, `description`, `deadline`, optional `parentGoalId`
- action: `motivation`, initial tasks
- finance: target, current amount, currency, and optional display/source label
- item: search term, category, target amount, and user-supplied preferences
- group: icon, color, layout, and progress calculation mode

The client supplies `clientRequestId`. The server stores it in a user-scoped idempotency record and returns the original result if ChatGPT retries the same call.

Creation does not require a Neon Goals draft or approval state.

#### `update_goal`

Patch common or type-specific fields on an existing goal. This is the primary correction path when ChatGPT or the user notices an incorrect title, amount, deadline, description, task, preference, or relationship.

Inputs:

- `goalId`
- only the fields to change
- `clientRequestId`
- optional `expectedUpdatedAt`

If `expectedUpdatedAt` is supplied and no longer matches, return a conflict containing the current canonical goal so ChatGPT can explain the conflict or issue a deliberate follow-up update. Never silently replace the goal's type.

#### `set_goal_status`

Set a goal to `active`, `completed`, or `archived`. This makes completion, soft deletion, and restoration explicit while remaining reversible. It accepts `clientRequestId` and optional `expectedUpdatedAt`.

#### `add_goal_task`

Add a task to an action goal and return the updated canonical goal. Accept `clientRequestId`.

#### `update_goal_task`

Correct a task title or set its completion state explicitly. Do not expose toggle semantics to MCP because repeating a toggle after a timeout can undo the intended state. Accept `clientRequestId` and optional `expectedUpdatedAt`.

#### `remove_goal_task`

Remove a task from an action goal and return the updated canonical goal. Accept `clientRequestId`. This is the only destructive v1 tool; annotate it as destructive and retain enough audit metadata to investigate accidental removal.

### Deliberately excluded from v1

- hard deletion of goals
- generic REST, Prisma, GraphQL, or SQL access
- bulk mutation
- live Plaid sync or institution linking
- purchases, transfers, trades, or payments
- internal chat/thread identifiers
- raw item-scrape payloads and provider credentials

## Canonical Goal Contract

All tools use one versioned public representation rather than returning Prisma models directly:

```ts
type GoalResult = {
  schemaVersion: '1';
  goal: {
    id: string;
    type: 'item' | 'finance' | 'action' | 'group';
    title: string;
    description: string | null;
    status: 'active' | 'completed' | 'archived';
    deadline: string | null;
    parentGoalId: string | null;
    createdAt: string;
    updatedAt: string;
    details: ItemDetails | FinanceDetails | ActionDetails | GroupDetails;
  };
};
```

Money inputs and outputs use `{ amountMinor, currency }`; do not create a new protocol contract around binary floating-point values. Tool schemas are strict and reject unknown fields.

Every mutation response includes:

- the canonical updated goal
- whether the result was newly applied or replayed from idempotency storage
- a concise human-readable summary

Stored titles, descriptions, task names, merchant labels, and notes are untrusted data. The server returns them as data and never interprets them as instructions.

## Confirmation and Safety

Confirmation is client behavior, not an MCP protocol state in Neon Goals.

- ChatGPT may confirm a material write in conversation according to its own product behavior.
- Once it calls the tool, the server executes without a second Neon-specific confirmation.
- Tool descriptions must clearly state their effect so ChatGPT can apply its normal confirmation policy.
- The server still enforces authentication, ownership, schema validation, rate limits, idempotency, and conflict checks.
- Corrections use `update_goal`; removals use reversible `set_goal_status(status: "archived")` wherever possible.

## Authentication and Authorization

Use OAuth 2.1 authorization-code flow with PKCE for ChatGPT. Publish Protected Resource Metadata and authorization-server discovery, validate resource indicators/audience, support revocation, and return correct 401 versus 403 responses.

Initial scopes:

- `goals:read`
- `goals:write`
- later `finance:summary`
- later `finance:transactions`

Do not use browser JWTs, `AGENT_API_KEY`, or provider tokens as MCP credentials. Every handler receives an explicit authenticated `userId`, and every database query includes that user boundary.

For a Casey-only local proof before OAuth is complete, a revocable, hashed, expiring personal grant may be used behind a feature flag. It is not the public ChatGPT release auth design.

## Runtime Architecture

```text
ChatGPT
  -> POST /api/mcp (Streamable HTTP)
  -> OAuth/resource-server guard resolves user and scopes
  -> request-scoped MCP transport/server context
  -> thin goal tool handler
  -> GoalApplicationService
  -> PostgreSQL
```

Add a provider-neutral `GoalApplicationService` used by both REST and MCP. It owns public DTO mapping, transactions, ownership checks, idempotency, and optimistic concurrency. MCP handlers must not call Prisma directly or scrape REST controllers.

Do not share one connected MCP server instance or authorization context across unrelated users or transports.

Suggested files:

```text
src/modules/goals/application/
  goal-application.service.ts
  goal-contract.types.ts
  goal-contract.mapper.ts
src/modules/mcp/
  mcp.module.ts
  mcp.controller.ts
  mcp-server.factory.ts
  mcp-auth.guard.ts
  tools/
    list-goals.tool.ts
    get-goal.tool.ts
    create-goal.tool.ts
    update-goal.tool.ts
    set-goal-status.tool.ts
    goal-task.tools.ts
```

Remove the obsolete root `mcp-proxy-server.ts` placeholder once the real module exists.

## Idempotency and Concurrency

Add a durable record keyed by `(userId, toolName, clientRequestId)` containing a normalized input hash, status, and serialized result reference.

- same key and same input: return the original result
- same key and different input: reject as an idempotency conflict
- concurrent duplicate calls: exactly one operation applies
- failed validation/auth calls: do not reserve the key
- unknown outcome after a server failure: resolve against the durable record before retrying

Use `expectedUpdatedAt` initially for optimistic concurrency. A dedicated integer revision can replace it later if timestamp precision proves awkward.

## Secondary Read-Only Finance Phase

Finance reads are useful but not on the goal MCP critical path. Add them only after goal CRUD is proven:

- `get_financial_snapshot`
- `list_financial_accounts`
- `search_transactions`
- `get_recurring_cashflow`
- `run_projection_scenario` (calculation only; never saves)

These tools read Neon-cached, user-owned data and never expose provider credentials or trigger live Plaid calls. They return freshness, `asOf`, confidence, assumptions, and warnings. Transaction access uses a separate scope.

Before those finance tools ship, persist process-local manual finance data, finish goal forecasts, and extract the provider-neutral finance read boundary. None of that blocks the goal tools.

## Implementation Sequence

### Phase 1 — Goal domain boundary

1. Define strict, versioned goal input/output contracts.
2. Extract `GoalApplicationService` from controller- and AI-specific paths.
3. Replace toggle-only task mutation with explicit completion state.
4. Add durable mutation idempotency and optimistic concurrency.
5. Add two-user ownership and concurrent-retry integration tests.

### Phase 2 — MCP private proof

1. Add the official TypeScript MCP SDK and authenticated `/api/mcp` Streamable HTTP endpoint behind a feature flag.
2. Implement the eight goal tools as thin application-service adapters.
3. Add strict schemas, read/write/destructive annotations, response-size caps, rate limits, and redacted telemetry.
4. Run protocol tests using the official client SDK.
5. Connect a private client, create a goal, intentionally correct it, archive it, restore it, and revoke access.

### Phase 3 — ChatGPT release

1. Add OAuth 2.1/PKCE, discovery metadata, consent, and grant management.
2. Verify the connector flow in ChatGPT end to end.
3. Test duplicate delivery, timeouts, stale updates, scope denial, hostile stored text, and cross-user isolation.
4. Document connection, revocation, and incident response.

### Phase 4 — Optional finance reads

1. Finish the provider-neutral finance read boundary.
2. Implement scoped read-only finance tools.
3. Verify freshness, privacy, pagination, and response-size behavior.

## Acceptance Criteria

The goal MCP is ready when:

- ChatGPT can list, read, create, correct, complete, archive, and restore the authenticated user's goals
- no confirmation inside Neon Goals is required
- a retried create or mutation applies exactly once
- every mutation returns the canonical resulting goal
- stale concurrent updates are rejected instead of silently overwriting newer data
- no goal hard-delete tool exists
- user A cannot infer or retrieve user B identifiers or values
- OAuth scopes distinguish reads from writes
- tool outputs contain no auth secrets, provider credentials, internal thread IDs, or unnecessary PII
- protocol, auth, isolation, idempotency, conflict, and regression suites pass in CI
- revoking access prevents the next tool call

## Open Questions That Do Not Block Phase 1

- Whether item-goal creation should immediately queue product search or require a separate explicit search tool.
- Whether task removal should become reversible through archived tasks in a later schema revision.
- Which Neon financial summaries are still additive once real ChatGPT connected-finance behavior is tested.
