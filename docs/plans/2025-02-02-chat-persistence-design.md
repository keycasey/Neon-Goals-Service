# Chat Persistence & Specialist System Design

**Date:** 2025-02-02
**Status:** Design Complete, Pending Implementation

## Overview

This document describes the architecture for persistent, multi-specialist chat system in the Neon Goals Service. The design enables:

1. **Persistent chats** that survive page refreshes
2. **Context window management** through automatic summarization
3. **Specialist personas** (Items, Finances, Actions) with context awareness
4. **Goal-specific advisors** that focus on individual goals while maintaining global awareness
5. **API accessibility** for agent-to-agent communication
6. **Conversational goal modification** through natural language commands

---

## Section 1: Architecture Overview

### Three-Tier Chat System

```
┌─────────────────────────────────────────────────────────────┐
│                      Overview Chat                           │
│                  (Default view, all context)                 │
└───────────────────────────┬─────────────────────────────────┘
                            │ Category filter click
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Items     │    │  Finances   │    │   Actions   │
│ Specialist  │    │ Specialist  │    │ Specialist  │
│             │    │             │    │             │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │ Goal view         │ Goal view         │ Goal view
       ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Goal      │    │   Goal      │    │   Goal      │
│  Advisor    │    │  Advisor    │    │  Advisor    │
│(Specialist  │    │(Specialist  │    │(Specialist  │
│ + Focus)    │    │ + Focus)    │    │ + Focus)    │
└─────────────┘    └─────────────┘    └─────────────┘
```

### Key Components

| Component | Responsibility |
|-----------|----------------|
| **Overview Chat** | General assistant, coordinates across all goals and categories |
| **Category Specialist** | Expert in one category (Items/Finances/Actions), can modify goals in that category |
| **Goal Advisor** | Same as category specialist but focused on a single goal |
| **Chat Service** | Manages message persistence, context building, SSE streaming |
| **Summary Service** | Handles automatic summarization when approaching context limits |
| **OpenAI Service** | Manages threads, function calling for goal commands |

### Chat Persistence

All three chat types persist independently:
- **Overview Chat**: Always available, shows full conversation history
- **Category Specialist Chats**: One per category, persists separately
- **Goal Advisor Chats**: One per goal, persists separately

After page refresh, user always starts in Overview. Category/goal chats restore when navigated to.

---

## Section 2: Database Schema

### Revised Models

#### Message
```prisma
model Message {
  id        String   @id @default(cuid())
  role      String   // "user" | "assistant" | "system"
  content   String   @db.Text
  threadId  String?  // OpenAI thread ID for conversation continuity
  createdAt DateTime @default(now())

  userId    String
  chatId    String!  // Always has a ChatState

  chat      ChatState @relation(fields: [chatId], references: [id])

  @@index([chatId])
}
```

**Key change:** Removed `goalId` and `categoryId` (redundant - can be derived from ChatState).

#### ChatState
```prisma
model ChatState {
  id        String   @id @default(cuid())
  type      String   // "overview" | "category" | "goal"
  categoryId String?  // For type="category": "items" | "finances" | "actions"
  goalId    String?  // For type="goal"
  isLoading Boolean  @default(false)

  lastSummaryId String?  // Points to most recent summary (for quick lookup)
  summaryCursor  Int?     // How many messages are summarized (offset)

  userId    String
  messages  Message[]

  @@unique([userId, type, categoryId, goalId])
}
```

**Key additions:** `categoryId`, `lastSummaryId`, `summaryCursor` for context management.

#### ConversationSummary (New)
```prisma
model ConversationSummary {
  id          String   @id @default(cuid())
  chatId      String
  summary     String   @db.Text
  messageCount Int     // How many messages this summary covers
  createdAt   DateTime @default(now())

  chat        ChatState @relation(fields: [chatId], references: [id])

  @@index([chatId, createdAt])
}
```

Stores compact representations of conversation segments for context window management.

---

## Section 3: Context Window Strategy

### Trigger Mechanism

Track token count using heuristic: ~100 tokens per message average. When approaching 80% of LLM context window (e.g., ~100K for GPT-4.1), trigger automatic summarization.

```typescript
const shouldSummarize = (messageCount: number, summaryCursor: number) => {
  const activeMessages = messageCount - (summaryCursor || 0);
  const estimatedTokens = activeMessages * 100;
  return estimatedTokens >= CONTEXT_THRESHOLD;
};
```

**Admin-configurable** via Settings page (default: 100K tokens).

### Summarization Process

1. Take all messages since `lastSummaryId`
2. Send to LLM with prompt: "Summarize this conversation segment concisely, preserving key decisions and user preferences"
3. Store result in `ConversationSummary` table
4. Update `ChatState.summaryCursor` = current message count
5. Update `ChatState.lastSummaryId` = new summary ID

### LLM Context Building

Every LLM call includes:
- **All summaries** (chronological, as system messages)
- **Recent messages** (everything after `summaryCursor`)

```javascript
[
  { role: 'system', content: 'You are the Items Specialist...' },
  { role: 'system', content: 'Summary 1: User discussed GMC Sierra, focused on Denali trim...' },
  { role: 'system', content: 'Summary 2: User evaluated financing options...' },
  { role: 'user', content: 'What about waiting for end of year sales?' },
  { role: 'assistant', content: 'Good question...' }
]
```

### Long-Term Summary Accumulation

**YAGNI for now.** Summaries accumulate slowly (~1 per 1000 messages). If summaries eventually become too large, implement **summary-of-summaries** pass: merge older summaries into a single "early conversation" summary. Revisit when real usage patterns emerge.

---

## Section 4: Goal Modification Commands

### Command Format

Users modify goals through natural conversation. LLM parses intent and returns structured commands.

```
User: "Change the title to 'GMC Sierra Denali Ultimate'"
→ Command: UPDATE_TITLE
→ Payload: { title: "GMC Sierra Denali Ultimate" }
→ Confirmation: "I'll update the goal title to 'GMC Sierra Denali Ultimate'. Confirm?"

User: "Add a task to check my credit score"
→ Command: ADD_TASK
→ Payload: { task: { title: "Check credit score", priority: "medium" } }
→ Confirmation: "I'll add 'Check credit score' as a medium priority task. Confirm?"

User: "Remove the insurance shopping task"
→ Command: REMOVE_TASK
→ Payload: { taskId: "task-123" }
→ Confirmation: "I'll remove 'Shop for insurance'. Confirm?"

User: "Add under 50k miles to filters"
→ Command: UPDATE_FILTERS
→ Payload: { filters: { maxMileage: 50000 } }
→ Confirmation: "I'll add a filter for under 50,000 miles. Confirm?"
```

### Command Flow

1. **Parse:** LLM extracts command + payload from user message
2. **Validate:** Backend validates payload (task exists, filter is valid)
3. **Confirm:** Agent asks user to confirm (shows what will change)
4. **Execute:** On confirmation, apply changes to database
5. **Acknowledge:** Agent confirms completion and continues conversation

### Permissions by Chat Type

| Chat Type | Can Modify Goals? | Which Goals? |
|-----------|------------------|--------------|
| Overview | Yes | Any goal (with confirmation) |
| Category Specialist | Yes | Any goals **in their category** (ensures compatibility) |
| Goal Advisor | Yes | Only the goal being viewed |

**Rationale:** Category specialists ensure goals within their category are compatible (e.g., Finance Specialist validates that "Save $10K for car" and "Save $20K for house" fit within the user's budget).

### OpenAI Tool Schema

Commands exposed as OpenAI Functions/Tools:

```typescript
{
  name: "update_goal_title",
  description: "Update the title of a goal",
  parameters: {
    type: "object",
    properties: {
      goalId: { type: "string" },
      title: { type: "string", minLength: 1, maxLength: 100 }
    },
    required: ["goalId", "title"]
  }
}
```

These tools call the same underlying service methods used by HTTP API endpoints.

---

## Section 5: API Specification

### Chat Endpoints

#### GET /api/chats/overview
Fetch or create the Overview Chat for the current user.

**Response:**
```json
{
  "id": "chat-overview-123",
  "type": "overview",
  "isLoading": false,
  "lastSummaryId": "summary-abc",
  "summaryCursor": 47,
  "messages": [
    { "id": "msg-1", "role": "user", "content": "...", "createdAt": "2025-02-01T..." }
  ]
}
```

#### GET /api/chats/category/:categoryId
Fetch or create a Category Specialist Chat.
- `categoryId`: `items` | `finances` | `actions`

**Response:**
```json
{
  "id": "chat-cat-123",
  "type": "category",
  "categoryId": "items",
  "isLoading": false,
  "lastSummaryId": "summary-456",
  "summaryCursor": 12,
  "messages": [...]
}
```

#### GET /api/chats/goal/:goalId
Fetch or create a Goal Advisor Chat.

**Response:**
```json
{
  "id": "chat-goal-789",
  "type": "goal",
  "goalId": "goal-gmc-sierra",
  "isLoading": false,
  "messages": [...]
}
```

#### POST /api/chats/:chatId/messages
Send a message and stream the response via SSE.

**Request:**
```json
{ "content": "Should I buy the Sierra or wait?" }
```

**Response:** SSE stream
```
data: {"type":"token","content":"Based"}
data: {"type":"token","content":" on"}
...
data: {"type":"done","messageId":"msg-123"}
```

#### GET /api/chats
List all chats for the current user (for agent discovery).

**Response:**
```json
{
  "overview": { "id": "chat-overview-123", "messageCount": 47 },
  "categories": {
    "items": { "id": "cat-items", "messageCount": 12 },
    "finances": { "id": "cat-finances", "messageCount": 8 },
    "actions": { "id": "cat-actions", "messageCount": 5 }
  },
  "goals": [
    { "goalId": "goal-123", "chatId": "chat-goal-123", "messageCount": 5 }
  ]
}
```

### Goal Endpoints (for agent-to-agent)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/goals | List all goals for current user |
| POST | /api/goals | Create a new goal |
| GET | /api/goals/:id | Get a single goal with candidates |
| PATCH | /api/goals/:id | Update a goal (title, filters, tasks) |
| DELETE | /api/goals/:id | Archive a goal |

### Stream Control

#### POST /api/chats/:chatId/messages/stop
Cancel an in-flight stream response.

**Response:** `204 No Content`

### Message Editing

#### PUT /api/chats/:chatId/messages/:messageId
Edit a message and resend. Deletes all messages after the edited one, then sends new version.

**Request:**
```json
{ "content": "Revised message content" }
```

**Response:** The new message with cascade-deleted messages

---

## Section 6: Implementation Phases

### Phase 1: Schema & Persistence (Foundation)
**Milestone:** Chats persist and restore correctly

- [ ] Update Prisma schema (Message relation to ChatState, remove redundant fields, add ConversationSummary)
- [ ] Create database migration
- [ ] Update ChatState model to include `categoryId`, `lastSummaryId`, `summaryCursor`
- [ ] Implement `GET /api/chats/*` endpoints (overview, category, goal)
- [ ] Test: Refresh page, verify messages still appear

### Phase 2: Stream Control & Message Editing
**Milestone:** Users can interrupt responses and edit messages

- [x] SSE streaming (already works)
- [ ] Add stop button to interrupt in-flight streams
  - Frontend: `EventSource.close()` on stop button click
  - Backend: `AbortController` to cancel OpenAI call
- [ ] Implement message edit UI (tap/click to edit)
- [ ] On edit resend: Delete original + subsequent messages, then send new version
- [ ] Test: Start long response → click stop → edit earlier message → resend

### Phase 3: Context Window & Summarization
**Milestone:** Long conversations don't exceed context

- [ ] Implement token counting heuristic (~100 tokens/message)
- [ ] Create summarization trigger logic (check after each new message)
- [ ] Build ConversationSummary service
- [ ] Test: Send 1000+ messages, verify summarization kicks in
- [ ] Add configurable threshold to Settings (admin-only field)

### Phase 4: Specialist Personas
**Milestone:** Category and goal advisors with distinct personas

- [ ] Create specialist system prompts (Items, Finances, Actions)
- [ ] Implement specialist context handoff logic
- [ ] Update Overview Chat to route to specialists on filter click
- [ ] Test: Switch between specialists, verify they acknowledge context

### Phase 5: Goal Modification Commands
**Milestone:** Agents can modify goals through conversation

- [ ] Define OpenAI Function schemas for goal commands
  - UPDATE_TITLE, UPDATE_FILTERS, ADD_TASK, REMOVE_TASK, ARCHIVE_GOAL
- [ ] Implement command parsing and validation
- [ ] Add confirmation flow
- [ ] Enforce permissions (Overview=all, Category=within category, Goal=only viewed)
- [ ] Test: "Change the title to X" → confirms → updates

### Phase 6: Agent API Access
**Milestone:** External agents can chat with specialists

- [ ] Add `GET /api/chats` (list all chats for discovery)
- [ ] Ensure `GET/POST/PATCH/DELETE /api/goals` work correctly
- [ ] Add authentication for agent-to-agent calls (API key or JWT)
- [ ] Test: Python script can query goals and send messages to Finance Specialist

---

## Appendix: Specialist System Prompts

### Overview Assistant
Generalist coordinator. Knows about all goals and categories. Helps with high-level planning and routes to specialists when appropriate.

### Items Specialist
Expert on physical goods and purchase decisions. Understands:
- Product comparison and features
- Pricing across retailers
- Quality and reliability factors
- Timing purchases (sales, end-of-year clearances)

### Finance Specialist
Expert on budgeting, saving, and financial planning. Understands:
- Goal compatibility and budget allocation
- Savings strategies and timelines
- Financing options and trade-offs
- Risk assessment and emergency funds

### Actions Specialist
Expert on tasks, commitments, and personal development. Understands:
- Task prioritization and dependencies
- Timeline estimation and milestone tracking
- Habit formation and consistency
- Resource allocation for personal goals

---

**Document Status:** Ready for implementation. Questions or clarifications should be addressed before Phase 1 begins.
