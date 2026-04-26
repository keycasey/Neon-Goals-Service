# Unified Agent Context Bridges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one visible orchestrator experience with optional group-chat specialist transparency, persisted agent runs/work items/events, and compact context bridges across overview/category/goal chats.

**Architecture:** Add durable backend orchestration primitives first, then context bridge switching, then frontend settings/rendering. Keep existing overview/category/goal chat surfaces and use hidden persisted messages/events for cross-chat context; do not rely on local-only frontend messages for agent follow-ups.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Bun/Vitest, React, Zustand, TypeScript, Tailwind, `expect-cli`.

---

## File Structure

Backend files:

- Modify: `neon-goals-service/prisma/schema.prisma`
  Add `agentConversationMode` to `Settings`, relations from `User`/`ChatState`/`Message`, and new models `AgentRun`, `AgentWorkItem`, `AgentEvent`, `ChatContextBridge`.
- Create: `neon-goals-service/src/modules/ai/agent-orchestrator.types.ts`
  Shared TypeScript string unions and DTO-ish interfaces for run/event/work item behavior.
- Create: `neon-goals-service/src/modules/ai/agent-orchestrator.service.ts`
  Small first implementation for creating runs/events/work items and completing runs. Later tasks route specialists through it.
- Create: `neon-goals-service/src/modules/ai/agent-orchestrator.service.test.ts`
  Unit tests with mocked Prisma for run/event/work item persistence.
- Modify: `neon-goals-service/src/modules/ai/ai.module.ts`
  Register/export `AgentOrchestratorService`.
- Modify: `neon-goals-service/src/modules/users/users.service.ts`
  Validate `agentConversationMode`.
- Create: `neon-goals-service/src/modules/users/users.service.test.ts`
  Unit tests for settings validation.
- Create: `neon-goals-service/src/modules/chats/chat-context-bridge.service.ts`
  Owns summarize/switch/clear bridge behavior.
- Create: `neon-goals-service/src/modules/chats/chat-context-bridge.service.test.ts`
  Unit tests for bridge creation and cleanup semantics.
- Modify: `neon-goals-service/src/modules/chats/chats.controller.ts`
  Add `POST /chats/context/switch`.
- Modify: `neon-goals-service/src/modules/chats/chats.module.ts`
  Register `ChatContextBridgeService`.
- Modify: `neon-goals-service/src/modules/ai/openai/thread/thread.service.ts`
  Include active bridge summaries in metadata-preserving chat context.
- Create: `neon-goals-service/src/modules/ai/openai/thread/thread.service.context-bridges.test.ts`
  Unit tests for context ordering.
- Modify: `neon-goals-service/src/modules/extraction/product-extraction.service.ts`
  Ensure extraction completion creates persisted assistant/group-mode events and does not require frontend local user follow-up.

Frontend files:

- Modify: `neon-goals-ui/src/types/goals.ts`
  Add `agentConversationMode` to `Settings`, add `AgentEvent` client type.
- Modify: `neon-goals-ui/src/store/useAuthStore.ts`
  Add default `agentConversationMode: "single_agent"`.
- Modify: `neon-goals-ui/src/pages/Settings.tsx`
  Add Agent Transparency setting under AI Chat.
- Create: `neon-goals-ui/src/services/chatContextService.ts`
  Client wrapper for `POST /chats/context/switch`.
- Modify: `neon-goals-ui/src/services/chatsService.ts`
  Include chat IDs if not already present in fetched chat responses.
- Modify: `neon-goals-ui/src/store/useChatStore.ts`
  Add `switchChatContext(fromChatId, toChatId)` and remove extraction completion auto-send path.
- Modify: `neon-goals-ui/src/components/chat/ChatPanel.tsx`
  Render specialist events only in group-chat mode; remove frontend extraction follow-up sends.
- Create: `neon-goals-ui/src/components/chat/AgentEventMessage.tsx`
  Compact group-chat event bubble with agent label.
- Create: `neon-goals-ui/src/components/chat/AgentEventMessage.test.tsx`
  Rendering tests for labels and hidden-vs-visible behavior.
- Modify: `neon-goals-ui/src/store/useViewStore.ts`
  Track current chat surface and call context switch via UI integration points, without putting async side effects directly inside Zustand setters.
- Create: `neon-goals-ui/src/components/chat/ChatPanel.agentEvents.test.tsx`
  Verify specialist events render only when `agentConversationMode` is `group_chat`.

---

## Task 1: Backend Prisma Schema for Agent Runs and Bridges

**Files:**
- Modify: `neon-goals-service/prisma/schema.prisma`
- Create migration via Prisma after schema edit

- [ ] **Step 1: Add the schema models**

Edit `prisma/schema.prisma` with these additions.

Add relations on `User`:

```prisma
  agentRuns     AgentRun[]
  agentEvents   AgentEvent[]
  agentWorkItems AgentWorkItem[]
  contextBridges ChatContextBridge[]
```

Add setting:

```prisma
  agentConversationMode String @default("single_agent")
```

Add relations on `ChatState`:

```prisma
  agentRuns AgentRun[]
  agentEvents AgentEvent[]
  sourceContextBridges ChatContextBridge[] @relation("ContextBridgeSource")
  targetContextBridges ChatContextBridge[] @relation("ContextBridgeTarget")
```

Add relation on `Message`:

```prisma
  agentRunsForUserMessage AgentRun[]
  contextBridgeSummary ChatContextBridge? @relation("ContextBridgeSummary")
```

Append models:

```prisma
model AgentRun {
  id            String   @id @default(cuid())
  userId        String
  chatId        String
  userMessageId String
  status        String   @default("running")
  createdAt     DateTime @default(now())
  completedAt   DateTime?

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  chat        ChatState @relation(fields: [chatId], references: [id], onDelete: Cascade)
  userMessage Message   @relation(fields: [userMessageId], references: [id], onDelete: Cascade)
  workItems   AgentWorkItem[]
  events      AgentEvent[]

  @@index([userId, status])
  @@index([chatId, createdAt])
  @@index([userMessageId])
}

model AgentWorkItem {
  id            String   @id @default(cuid())
  runId         String
  userId        String
  kind          String
  assignedAgent String
  status        String   @default("pending")
  input         Json
  result        Json?
  error         String?  @db.Text
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  run  AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  user User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  events AgentEvent[]

  @@index([runId, status])
  @@index([userId, assignedAgent])
}

model AgentEvent {
  id          String   @id @default(cuid())
  runId       String
  workItemId  String?
  chatId      String
  userId      String
  agent       String
  eventType   String
  content     String   @db.Text
  visibility  String   @default("hidden")
  createdAt   DateTime @default(now())

  run      AgentRun       @relation(fields: [runId], references: [id], onDelete: Cascade)
  workItem AgentWorkItem? @relation(fields: [workItemId], references: [id], onDelete: SetNull)
  chat     ChatState      @relation(fields: [chatId], references: [id], onDelete: Cascade)
  user     User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([runId, createdAt])
  @@index([chatId, visibility, createdAt])
  @@index([userId, agent])
}

model ChatContextBridge {
  id               String   @id @default(cuid())
  userId           String
  sourceChatId     String
  targetChatId     String
  summaryMessageId String   @unique
  status           String   @default("active")
  createdAt        DateTime @default(now())
  clearedAt        DateTime?

  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  sourceChat     ChatState @relation("ContextBridgeSource", fields: [sourceChatId], references: [id], onDelete: Cascade)
  targetChat     ChatState @relation("ContextBridgeTarget", fields: [targetChatId], references: [id], onDelete: Cascade)
  summaryMessage Message   @relation("ContextBridgeSummary", fields: [summaryMessageId], references: [id], onDelete: Cascade)

  @@index([userId, status])
  @@index([sourceChatId, status])
  @@index([targetChatId, status])
}
```

- [ ] **Step 2: Run Prisma format**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bunx prisma format
```

Expected: schema formats successfully.

- [ ] **Step 3: Generate migration**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bunx prisma migrate dev --name unified_agent_context_bridges
```

Expected: a new migration directory is created and Prisma Client regenerates.

- [ ] **Step 4: Verify TypeScript schema integration**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
./node_modules/.bin/tsc --noEmit --pretty false
```

Expected: no TypeScript errors from Prisma schema changes.

- [ ] **Step 5: Commit**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add agent run and context bridge schema"
```

---

## Task 2: Backend Orchestrator Persistence Service

**Files:**
- Create: `neon-goals-service/src/modules/ai/agent-orchestrator.types.ts`
- Create: `neon-goals-service/src/modules/ai/agent-orchestrator.service.ts`
- Create: `neon-goals-service/src/modules/ai/agent-orchestrator.service.test.ts`
- Modify: `neon-goals-service/src/modules/ai/ai.module.ts`

- [ ] **Step 1: Write failing tests**

Create `src/modules/ai/agent-orchestrator.service.test.ts`:

```ts
import { describe, expect, it, mock } from 'bun:test';
import { AgentOrchestratorService } from './agent-orchestrator.service';

const createService = () => {
  const prisma = {
    agentRun: {
      create: mock(async (args: any) => ({ id: 'run_1', ...args.data })),
      update: mock(async (args: any) => ({ id: args.where.id, ...args.data })),
    },
    agentWorkItem: {
      createMany: mock(async (args: any) => ({ count: args.data.length })),
    },
    agentEvent: {
      create: mock(async (args: any) => ({ id: 'event_1', ...args.data })),
    },
  };

  return { service: new AgentOrchestratorService(prisma as any), prisma };
};

describe('AgentOrchestratorService', () => {
  it('creates a run with pending work items', async () => {
    const { service, prisma } = createService();

    const run = await service.createRun({
      userId: 'user_1',
      chatId: 'chat_1',
      userMessageId: 'message_1',
      workItems: [
        {
          kind: 'answer_question',
          assignedAgent: 'finances',
          input: { question: 'Can I afford this?' },
        },
        {
          kind: 'create_goal',
          assignedAgent: 'items',
          input: { title: 'Wahl trimmer' },
        },
      ],
    });

    expect(run.id).toBe('run_1');
    expect(prisma.agentRun.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        chatId: 'chat_1',
        userMessageId: 'message_1',
        status: 'running',
      },
    });
    expect(prisma.agentWorkItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          runId: 'run_1',
          userId: 'user_1',
          kind: 'answer_question',
          assignedAgent: 'finances',
          status: 'pending',
          input: { question: 'Can I afford this?' },
        },
        {
          runId: 'run_1',
          userId: 'user_1',
          kind: 'create_goal',
          assignedAgent: 'items',
          status: 'pending',
          input: { title: 'Wahl trimmer' },
        },
      ],
    });
  });

  it('records group-mode specialist progress events as visible only in group mode', async () => {
    const { service, prisma } = createService();

    await service.recordEvent({
      runId: 'run_1',
      chatId: 'chat_1',
      userId: 'user_1',
      agent: 'items',
      eventType: 'progress',
      content: 'Checking product details.',
      visibility: 'visible_in_group_mode',
    });

    expect(prisma.agentEvent.create).toHaveBeenCalledWith({
      data: {
        runId: 'run_1',
        workItemId: undefined,
        chatId: 'chat_1',
        userId: 'user_1',
        agent: 'items',
        eventType: 'progress',
        content: 'Checking product details.',
        visibility: 'visible_in_group_mode',
      },
    });
  });

  it('marks a run completed with completedAt timestamp', async () => {
    const { service, prisma } = createService();

    await service.completeRun('run_1', 'completed');

    expect(prisma.agentRun.update).toHaveBeenCalledWith({
      where: { id: 'run_1' },
      data: {
        status: 'completed',
        completedAt: expect.any(Date),
      },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/ai/agent-orchestrator.service.test.ts
```

Expected: FAIL because `agent-orchestrator.service.ts` does not exist.

- [ ] **Step 3: Add types**

Create `src/modules/ai/agent-orchestrator.types.ts`:

```ts
export type AgentConversationMode = 'single_agent' | 'group_chat';

export type AgentRunStatus = 'running' | 'completed' | 'blocked_for_clarification' | 'failed';

export type WorkItemKind =
  | 'answer_question'
  | 'create_goal'
  | 'update_goal'
  | 'extract_product'
  | 'external_task'
  | 'clarification';

export type AssignedAgent = 'orchestrator' | 'items' | 'finances' | 'actions' | 'goal_view' | 'openclaw';

export type WorkItemStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'failed';

export type AgentEventType = 'thought' | 'progress' | 'question' | 'result' | 'error';

export type AgentEventVisibility = 'hidden' | 'visible_in_group_mode' | 'visible';

export interface CreateWorkItemInput {
  kind: WorkItemKind;
  assignedAgent: AssignedAgent;
  input: unknown;
}

export interface CreateRunInput {
  userId: string;
  chatId: string;
  userMessageId: string;
  workItems: CreateWorkItemInput[];
}

export interface RecordAgentEventInput {
  runId: string;
  workItemId?: string;
  chatId: string;
  userId: string;
  agent: AssignedAgent;
  eventType: AgentEventType;
  content: string;
  visibility?: AgentEventVisibility;
}
```

- [ ] **Step 4: Add service**

Create `src/modules/ai/agent-orchestrator.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import {
  AgentRunStatus,
  CreateRunInput,
  RecordAgentEventInput,
} from './agent-orchestrator.types';

@Injectable()
export class AgentOrchestratorService {
  constructor(private prisma: PrismaService) {}

  async createRun(input: CreateRunInput) {
    const run = await this.prisma.agentRun.create({
      data: {
        userId: input.userId,
        chatId: input.chatId,
        userMessageId: input.userMessageId,
        status: 'running',
      },
    });

    if (input.workItems.length > 0) {
      await this.prisma.agentWorkItem.createMany({
        data: input.workItems.map((item) => ({
          runId: run.id,
          userId: input.userId,
          kind: item.kind,
          assignedAgent: item.assignedAgent,
          status: 'pending',
          input: item.input as any,
        })),
      });
    }

    return run;
  }

  async recordEvent(input: RecordAgentEventInput) {
    return this.prisma.agentEvent.create({
      data: {
        runId: input.runId,
        workItemId: input.workItemId,
        chatId: input.chatId,
        userId: input.userId,
        agent: input.agent,
        eventType: input.eventType,
        content: input.content,
        visibility: input.visibility ?? 'hidden',
      },
    });
  }

  async completeRun(runId: string, status: Exclude<AgentRunStatus, 'running'>) {
    return this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        status,
        completedAt: new Date(),
      },
    });
  }
}
```

- [ ] **Step 5: Register service**

Modify `src/modules/ai/ai.module.ts` to add `AgentOrchestratorService` to providers and exports.

```ts
import { AgentOrchestratorService } from './agent-orchestrator.service';
```

Add it in `providers` and `exports` arrays.

- [ ] **Step 6: Run tests**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/ai/agent-orchestrator.service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add src/modules/ai/agent-orchestrator.types.ts src/modules/ai/agent-orchestrator.service.ts src/modules/ai/agent-orchestrator.service.test.ts src/modules/ai/ai.module.ts
git commit -m "feat: add agent orchestrator persistence service"
```

---

## Task 3: Backend Settings Validation for Agent Transparency Mode

**Files:**
- Modify: `neon-goals-service/src/modules/users/users.service.ts`
- Create: `neon-goals-service/src/modules/users/users.service.test.ts`
- Modify seeds that create `settings` only if TypeScript requires it
- Frontend companion changes are in Task 7

- [ ] **Step 1: Write failing tests**

Create `src/modules/users/users.service.test.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, mock } from 'bun:test';
import { UsersService } from './users.service';

const createService = () => {
  const prisma = {
    settings: {
      upsert: mock(async (args: any) => args),
    },
  };
  const aiModelsService = {
    isSupportedModelId: mock((modelId: string) => modelId === 'gpt-5-nano'),
    toClientSchema: mock(() => ({ models: [] })),
  };

  return { service: new UsersService(prisma as any, aiModelsService as any), prisma };
};

describe('UsersService settings validation', () => {
  it('accepts single agent conversation mode', async () => {
    const { service, prisma } = createService();

    await service.updateSettings('user_1', { agentConversationMode: 'single_agent' });

    expect(prisma.settings.upsert).toHaveBeenCalled();
  });

  it('accepts group chat conversation mode', async () => {
    const { service, prisma } = createService();

    await service.updateSettings('user_1', { agentConversationMode: 'group_chat' });

    expect(prisma.settings.upsert).toHaveBeenCalled();
  });

  it('rejects unknown conversation modes', async () => {
    const { service } = createService();

    await expect(
      service.updateSettings('user_1', { agentConversationMode: 'raw_specialists' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/users/users.service.test.ts
```

Expected: FAIL because unknown `agentConversationMode` is not rejected.

- [ ] **Step 3: Add validation**

Modify `src/modules/users/users.service.ts`:

```ts
const VALID_AGENT_CONVERSATION_MODES = new Set(['single_agent', 'group_chat']);
```

Inside `updateSettings`, after `chatModel` validation:

```ts
    if (
      Object.prototype.hasOwnProperty.call(settings, 'agentConversationMode') &&
      !VALID_AGENT_CONVERSATION_MODES.has(settings.agentConversationMode)
    ) {
      throw new BadRequestException(`Unsupported agent conversation mode: ${settings.agentConversationMode}`);
    }
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/users/users.service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add src/modules/users/users.service.ts src/modules/users/users.service.test.ts
git commit -m "feat: validate agent conversation mode setting"
```

---

## Task 4: Backend Context Bridge Switching

**Files:**
- Create: `neon-goals-service/src/modules/chats/chat-context-bridge.service.ts`
- Create: `neon-goals-service/src/modules/chats/chat-context-bridge.service.test.ts`
- Modify: `neon-goals-service/src/modules/chats/chats.controller.ts`
- Modify: `neon-goals-service/src/modules/chats/chats.module.ts`

- [ ] **Step 1: Write failing tests**

Create `src/modules/chats/chat-context-bridge.service.test.ts`:

```ts
import { describe, expect, it, mock } from 'bun:test';
import { ChatContextBridgeService } from './chat-context-bridge.service';

const createService = () => {
  const prisma = {
    chatContextBridge: {
      updateMany: mock(async (args: any) => ({ count: 1, args })),
      create: mock(async (args: any) => ({ id: 'bridge_1', ...args.data })),
    },
    message: {
      updateMany: mock(async (args: any) => ({ count: 1, args })),
      create: mock(async (args: any) => ({ id: 'message_summary_1', ...args.data })),
      findMany: mock(async () => [
        { role: 'user', content: 'I want to buy a trimmer.', createdAt: new Date('2026-04-26T10:00:00Z') },
        { role: 'assistant', content: 'I can help with that.', createdAt: new Date('2026-04-26T10:01:00Z') },
      ]),
    },
    chatState: {
      findFirstOrThrow: mock(async ({ where }: any) => ({
        id: where.id,
        userId: where.userId,
        type: where.id === 'overview_chat' ? 'overview' : 'category',
        categoryId: where.id === 'items_chat' ? 'items' : null,
        goalId: null,
      })),
    },
  };

  return { service: new ChatContextBridgeService(prisma as any), prisma };
};

describe('ChatContextBridgeService', () => {
  it('clears bridge summaries that expire when returning to the target chat', async () => {
    const { service, prisma } = createService();

    await service.switchContext({
      userId: 'user_1',
      fromChatId: 'overview_chat',
      toChatId: 'items_chat',
    });

    expect(prisma.chatContextBridge.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        status: 'active',
        summaryMessage: {
          metadata: {
            path: ['expiresOnReturnToChatId'],
            equals: 'items_chat',
          },
        },
      },
      data: {
        status: 'cleared',
        clearedAt: expect.any(Date),
      },
    });
  });

  it('creates a hidden context bridge message in the target chat', async () => {
    const { service, prisma } = createService();

    await service.switchContext({
      userId: 'user_1',
      fromChatId: 'overview_chat',
      toChatId: 'items_chat',
    });

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        chatId: 'items_chat',
        role: 'system',
        source: 'context_bridge',
        visible: false,
        content: expect.stringContaining('Context from overview chat'),
        metadata: {
          source: 'context_bridge',
          sourceChatId: 'overview_chat',
          targetChatId: 'items_chat',
          expiresOnReturnToChatId: 'overview_chat',
        },
      },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/chats/chat-context-bridge.service.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement service**

Create `src/modules/chats/chat-context-bridge.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

interface SwitchContextInput {
  userId: string;
  fromChatId: string;
  toChatId: string;
}

@Injectable()
export class ChatContextBridgeService {
  constructor(private prisma: PrismaService) {}

  async switchContext(input: SwitchContextInput) {
    if (input.fromChatId === input.toChatId) {
      return null;
    }

    await this.clearBridgesForReturnedChat(input.userId, input.toChatId);

    const [sourceChat, targetChat] = await Promise.all([
      this.prisma.chatState.findFirstOrThrow({
        where: { id: input.fromChatId, userId: input.userId },
      }),
      this.prisma.chatState.findFirstOrThrow({
        where: { id: input.toChatId, userId: input.userId },
      }),
    ]);

    const content = await this.buildCompactSummary(input.userId, input.fromChatId, sourceChat, targetChat);

    const summaryMessage = await this.prisma.message.create({
      data: {
        userId: input.userId,
        chatId: input.toChatId,
        role: 'system',
        source: 'context_bridge',
        visible: false,
        content,
        metadata: {
          source: 'context_bridge',
          sourceChatId: input.fromChatId,
          targetChatId: input.toChatId,
          expiresOnReturnToChatId: input.fromChatId,
        },
      },
    });

    return this.prisma.chatContextBridge.create({
      data: {
        userId: input.userId,
        sourceChatId: input.fromChatId,
        targetChatId: input.toChatId,
        summaryMessageId: summaryMessage.id,
        status: 'active',
      },
    });
  }

  private async clearBridgesForReturnedChat(userId: string, returnedChatId: string) {
    await this.prisma.chatContextBridge.updateMany({
      where: {
        userId,
        status: 'active',
        summaryMessage: {
          metadata: {
            path: ['expiresOnReturnToChatId'],
            equals: returnedChatId,
          },
        },
      },
      data: {
        status: 'cleared',
        clearedAt: new Date(),
      },
    });

    await this.prisma.message.updateMany({
      where: {
        userId,
        source: 'context_bridge',
        visible: false,
        metadata: {
          path: ['expiresOnReturnToChatId'],
          equals: returnedChatId,
        },
      },
      data: {
        visible: false,
        metadata: {
          source: 'context_bridge',
          cleared: true,
          expiresOnReturnToChatId: returnedChatId,
        },
      },
    });
  }

  private async buildCompactSummary(userId: string, sourceChatId: string, sourceChat: any, targetChat: any): Promise<string> {
    const recent = await this.prisma.message.findMany({
      where: {
        userId,
        chatId: sourceChatId,
        visible: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    const sourceLabel = this.describeChat(sourceChat);
    const targetLabel = this.describeChat(targetChat);
    const lines = [...recent]
      .reverse()
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n');

    return [
      `Context from ${sourceLabel} for ${targetLabel}.`,
      'Use this only as compact cross-chat context; direct target-chat messages are higher priority.',
      lines,
    ].filter(Boolean).join('\n\n');
  }

  private describeChat(chat: any): string {
    if (chat.type === 'overview') return 'overview chat';
    if (chat.type === 'category') return `${chat.categoryId} chat`;
    if (chat.type === 'goal') return 'goal chat';
    return 'chat';
  }
}
```

- [ ] **Step 4: Add controller endpoint**

Modify `src/modules/chats/chats.controller.ts` constructor:

```ts
private contextBridgeService: ChatContextBridgeService,
```

Add import:

```ts
import { ChatContextBridgeService } from './chat-context-bridge.service';
```

Add endpoint:

```ts
  @Post('context/switch')
  async switchContext(
    @CurrentUser('userId') userId: string,
    @Body() body: { fromChatId: string; toChatId: string },
  ) {
    return this.contextBridgeService.switchContext({
      userId,
      fromChatId: body.fromChatId,
      toChatId: body.toChatId,
    });
  }
```

- [ ] **Step 5: Register service**

Modify `src/modules/chats/chats.module.ts`:

```ts
import { ChatContextBridgeService } from './chat-context-bridge.service';
```

Add to providers and exports:

```ts
providers: [ChatsService, ChatContextBridgeService],
exports: [ChatsService, ChatContextBridgeService],
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/chats/chat-context-bridge.service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add src/modules/chats/chat-context-bridge.service.ts src/modules/chats/chat-context-bridge.service.test.ts src/modules/chats/chats.controller.ts src/modules/chats/chats.module.ts
git commit -m "feat: add chat context bridge switching"
```

---

## Task 5: Include Bridge Summaries in Agent Context

**Files:**
- Modify: `neon-goals-service/src/modules/ai/openai/thread/thread.service.ts`
- Create: `neon-goals-service/src/modules/ai/openai/thread/thread.service.context-bridges.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/modules/ai/openai/thread/thread.service.context-bridges.test.ts`:

```ts
import { describe, expect, it, mock } from 'bun:test';
import { ThreadService } from './thread.service';

describe('ThreadService bridge context', () => {
  it('includes active context bridge system messages with metadata history', async () => {
    const prisma = {
      message: {
        findMany: mock(async ({ where }: any) => {
          if (where.source === 'context_bridge') {
            return [
              {
                id: 'bridge_msg',
                role: 'system',
                content: 'Context from overview chat for items chat.',
                metadata: { source: 'context_bridge' },
                source: 'context_bridge',
                visible: false,
                createdAt: new Date('2026-04-26T10:00:00Z'),
              },
            ];
          }

          return [
            {
              id: 'visible_msg',
              role: 'user',
              content: 'Find me a trimmer.',
              metadata: null,
              source: 'user',
              visible: true,
              createdAt: new Date('2026-04-26T10:01:00Z'),
            },
          ];
        }),
      },
      chatState: { findUnique: mock(async () => ({ summaryCursor: 0, messages: [] })) },
      conversationSummary: { findMany: mock(async () => []) },
    };
    const service = new ThreadService(prisma as any, {} as any);

    const messages = await service.loadChatHistoryWithMetadata('items_chat', 'user_1', 20);

    expect(messages.map((message) => message.content)).toEqual([
      'Context from overview chat for items chat.',
      'Find me a trimmer.',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/ai/openai/thread/thread.service.context-bridges.test.ts
```

Expected: FAIL because `loadChatHistoryWithMetadata` only loads normal chat messages.

- [ ] **Step 3: Modify context loader**

In `src/modules/ai/openai/thread/thread.service.ts`, update `loadChatHistoryWithMetadata(chatId, userId, limit)` to also load active bridge messages:

```ts
    const bridgeMessages = await this.prisma.message.findMany({
      where: {
        userId,
        chatId,
        source: 'context_bridge',
        visible: false,
        metadata: {
          path: ['cleared'],
          not: true,
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 4,
      select: {
        role: true,
        content: true,
        metadata: true,
        source: true,
        visible: true,
        createdAt: true,
      },
    });
```

Return bridge messages before visible recent messages:

```ts
    return [...bridgeMessages, ...messages].map((message) => ({
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      source: message.source,
      visible: message.visible,
    }));
```

Keep direct target-chat messages after bridge messages so the model sees source summaries first and the current local thread last.

- [ ] **Step 4: Run test**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/ai/openai/thread/thread.service.context-bridges.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run existing thread tests**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/ai/openai/thread
```

Expected: PASS or no matching tests except the new test.

- [ ] **Step 6: Commit**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add src/modules/ai/openai/thread/thread.service.ts src/modules/ai/openai/thread/thread.service.context-bridges.test.ts
git commit -m "feat: include context bridges in agent history"
```

---

## Task 6: Backend Extraction Completion as Persisted Agent Events

**Files:**
- Modify: `neon-goals-service/src/modules/extraction/product-extraction.service.ts`
- Create or modify: `neon-goals-service/src/modules/extraction/product-extraction.service.test.ts`

- [ ] **Step 1: Write failing test**

Add a test asserting extraction completion creates no user-role follow-up and persists assistant/system-owned output. If no existing test harness exists, create `src/modules/extraction/product-extraction.service.test.ts` with a focused private-method access test:

```ts
import { describe, expect, it, mock } from 'bun:test';
import { ProductExtractionService } from './product-extraction.service';

describe('ProductExtractionService extraction completion persistence', () => {
  it('stores extraction completion as assistant/system output, not a user message', async () => {
    const prisma = {
      chatState: {
        findFirst: mock(async () => ({ id: 'items_chat' })),
        create: mock(),
      },
      message: {
        create: mock(async (args: any) => ({ id: 'message_1', ...args.data })),
      },
      agentRun: {
        create: mock(async () => ({ id: 'run_1' })),
      },
      agentEvent: {
        create: mock(async (args: any) => ({ id: 'event_1', ...args.data })),
      },
    };
    const service = new ProductExtractionService(prisma as any, {} as any, {} as any, {} as any);

    await (service as any).sendGroupCompletionMessage('user_1', 'group_1', [
      { success: false, url: 'https://example.com/one' },
      { success: false, url: 'https://example.com/two' },
    ]);

    expect(prisma.message.create.mock.calls[0][0].data.role).toBe('assistant');
    expect(prisma.message.create.mock.calls[0][0].data.source).not.toBe('user');
    expect(prisma.agentEvent.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/extraction/product-extraction.service.test.ts
```

Expected: FAIL because `agentEvent.create` is not called or constructor mocks need alignment.

- [ ] **Step 3: Inject orchestrator service if constructor supports it, or write directly through Prisma**

In `sendGroupCompletionMessage`, after the assistant message is created, create an `AgentRun` and `AgentEvent`:

```ts
    const assistantMessage = await this.prisma.message.create({
      data: {
        userId,
        chatId,
        role: 'assistant',
        source: 'agent',
        content,
        metadata: {
          extraction: {
            groupId,
            successfulCount: successful.length,
            failedCount,
          },
          suggestion: {
            action: 'create_group_item_goal',
            groupId,
          },
        },
      },
    });

    const run = await this.prisma.agentRun.create({
      data: {
        userId,
        chatId,
        userMessageId: assistantMessage.id,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    await this.prisma.agentEvent.create({
      data: {
        runId: run.id,
        chatId,
        userId,
        agent: 'items',
        eventType: 'result',
        content,
        visibility: 'visible_in_group_mode',
      },
    });
```

This is intentionally a small bridge toward the event model: extraction completion is persisted as agent-owned output immediately, while Task 11 introduces the originating user-message run model for new orchestrated messages.

- [ ] **Step 4: Run test**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/extraction/product-extraction.service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add src/modules/extraction/product-extraction.service.ts src/modules/extraction/product-extraction.service.test.ts
git commit -m "feat: persist extraction completion as agent output"
```

---

## Task 7: Frontend Agent Transparency Setting

**Files:**
- Modify: `neon-goals-ui/src/types/goals.ts`
- Modify: `neon-goals-ui/src/store/useAuthStore.ts`
- Modify: `neon-goals-ui/src/pages/Settings.tsx`
- Create or modify: `neon-goals-ui/src/pages/Settings.test.tsx`

- [ ] **Step 1: Write failing Settings test**

If `Settings.test.tsx` does not exist, create `src/pages/Settings.test.tsx` with necessary mocks:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Settings from './Settings';
import { useAuthStore } from '@/store/useAuthStore';

vi.mock('@/store/useBillingStore', () => ({
  useBillingStore: () => ({
    subscription: null,
    usage: null,
    openCustomerPortal: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/services/usersService', () => ({
  usersService: {
    getSettingsOptions: vi.fn(async () => ({ models: [] })),
  },
}));

describe('Settings agent transparency', () => {
  it('persists group chat mode from AI Chat settings', async () => {
    const saveSettings = vi.fn(async () => undefined);
    useAuthStore.setState({
      user: { id: 'user_1', name: 'Casey', email: 'casey@example.com' } as any,
      settings: {
        theme: 'miami-vice',
        chatModel: 'gpt-5-nano',
        displayName: 'Casey',
        agentConversationMode: 'single_agent',
      },
      saveSettings,
    } as any);

    render(
      <MemoryRouter initialEntries={['/settings?tab=chat']}>
        <Settings />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('radio', { name: /detailed/i }));

    expect(saveSettings).toHaveBeenCalledWith({ agentConversationMode: 'group_chat' });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-ui
bun run test src/pages/Settings.test.tsx
```

Expected: FAIL because setting controls do not exist and/or type does not include `agentConversationMode`.

- [ ] **Step 3: Add type**

Modify `src/types/goals.ts` `Settings` type:

```ts
export interface Settings {
  theme: string;
  chatModel: string;
  displayName: string;
  agentConversationMode?: 'single_agent' | 'group_chat';
}
```

- [ ] **Step 4: Add default setting**

Modify `src/store/useAuthStore.ts`:

```ts
const defaultSettings: Settings = {
  theme: 'miami-vice',
  chatModel: 'gpt-5-nano',
  displayName: 'User',
  agentConversationMode: 'single_agent',
};
```

- [ ] **Step 5: Add Settings UI**

In `src/pages/Settings.tsx`, inside the AI Chat tab content near model selection, add:

```tsx
<div className="glass-card rounded-2xl p-5">
  <h3 className="font-heading font-semibold text-foreground mb-2">Agent Transparency</h3>
  <p className="text-sm text-muted-foreground mb-4">
    Choose whether Neon appears as one assistant or shows orchestrator and specialist progress.
  </p>
  <div className="grid gap-3">
    {[
      {
        value: 'single_agent',
        label: 'Simple',
        description: 'Show one assistant.',
      },
      {
        value: 'group_chat',
        label: 'Detailed',
        description: 'Show orchestrator and specialist updates.',
      },
    ].map((option) => (
      <label
        key={option.value}
        className={cn(
          'flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors',
          (settings.agentConversationMode ?? 'single_agent') === option.value
            ? 'border-primary/60 bg-primary/10'
            : 'border-border/50 bg-muted/20 hover:bg-muted/30',
        )}
      >
        <input
          type="radio"
          name="agentConversationMode"
          value={option.value}
          checked={(settings.agentConversationMode ?? 'single_agent') === option.value}
          onChange={() => void persistSetting({ agentConversationMode: option.value as 'single_agent' | 'group_chat' })}
          className="mt-1"
        />
        <span>
          <span className="block font-medium text-foreground">{option.label}</span>
          <span className="block text-sm text-muted-foreground">{option.description}</span>
        </span>
      </label>
    ))}
  </div>
</div>
```

- [ ] **Step 6: Run test**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-ui
bun run test src/pages/Settings.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/trill/Development/neon/neon-goals-ui
git add src/types/goals.ts src/store/useAuthStore.ts src/pages/Settings.tsx src/pages/Settings.test.tsx
git commit -m "feat: add agent transparency setting"
```

---

## Task 8: Frontend Chat Context Switch Client

**Files:**
- Create: `neon-goals-ui/src/services/chatContextService.ts`
- Modify: `neon-goals-ui/src/store/useChatStore.ts`
- Create or modify: `neon-goals-ui/src/store/useChatStore.contextSwitch.test.ts`

- [ ] **Step 1: Write failing store test**

Create `src/store/useChatStore.contextSwitch.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  switchContext: vi.fn(),
}));

vi.mock('@/services/chatContextService', () => ({
  chatContextService: {
    switchContext: mocks.switchContext,
  },
}));

import { useChatStore } from './useChatStore';

describe('useChatStore context switching', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.switchContext.mockReset();
    useChatStore.getState().resetStore();
  });

  it('calls backend context switch when from and to chat ids differ', async () => {
    mocks.switchContext.mockResolvedValue({ id: 'bridge_1' });

    await useChatStore.getState().switchChatContext('overview_chat', 'items_chat');

    expect(mocks.switchContext).toHaveBeenCalledWith({
      fromChatId: 'overview_chat',
      toChatId: 'items_chat',
    });
  });

  it('does not call backend when switching to same chat', async () => {
    await useChatStore.getState().switchChatContext('overview_chat', 'overview_chat');

    expect(mocks.switchContext).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-ui
bun run test src/store/useChatStore.contextSwitch.test.ts
```

Expected: FAIL because `switchChatContext` and service do not exist.

- [ ] **Step 3: Add service**

Create `src/services/chatContextService.ts`:

```ts
import { apiClient } from './apiClient';

export interface SwitchChatContextRequest {
  fromChatId: string;
  toChatId: string;
}

export const chatContextService = {
  async switchContext(request: SwitchChatContextRequest) {
    return apiClient.post('/chats/context/switch', request);
  },
};
```

- [ ] **Step 4: Add store method**

Modify `src/store/useChatStore.ts` interface:

```ts
  switchChatContext: (fromChatId: string, toChatId: string) => Promise<void>;
```

Import service:

```ts
import { chatContextService } from '@/services/chatContextService';
```

Add implementation near utility actions:

```ts
  switchChatContext: async (fromChatId: string, toChatId: string) => {
    if (!fromChatId || !toChatId || fromChatId === toChatId) return;
    try {
      await chatContextService.switchContext({ fromChatId, toChatId });
    } catch (error) {
      console.error('Failed to switch chat context:', error);
    }
  },
```

- [ ] **Step 5: Run test**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-ui
bun run test src/store/useChatStore.contextSwitch.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/trill/Development/neon/neon-goals-ui
git add src/services/chatContextService.ts src/store/useChatStore.ts src/store/useChatStore.contextSwitch.test.ts
git commit -m "feat: add chat context switch client"
```

---

## Task 9: Frontend Group-Chat Event Rendering

**Files:**
- Create: `neon-goals-ui/src/components/chat/AgentEventMessage.tsx`
- Create: `neon-goals-ui/src/components/chat/AgentEventMessage.test.tsx`
- Modify: `neon-goals-ui/src/types/goals.ts`
- Modify: `neon-goals-ui/src/components/chat/ChatPanel.tsx`

- [ ] **Step 1: Write component test**

Create `src/components/chat/AgentEventMessage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentEventMessage } from './AgentEventMessage';

describe('AgentEventMessage', () => {
  it('renders specialist label and progress content', () => {
    render(
      <AgentEventMessage
        event={{
          id: 'event_1',
          agent: 'items',
          eventType: 'progress',
          content: 'Checking product details.',
          visibility: 'visible_in_group_mode',
          createdAt: '2026-04-26T10:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText('Items Specialist')).toBeInTheDocument();
    expect(screen.getByText('Checking product details.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-ui
bun run test src/components/chat/AgentEventMessage.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Add AgentEvent type**

Modify `src/types/goals.ts`:

```ts
export interface AgentEvent {
  id: string;
  runId?: string;
  workItemId?: string;
  chatId?: string;
  agent: 'orchestrator' | 'items' | 'finances' | 'actions' | 'goal_view' | 'openclaw';
  eventType: 'thought' | 'progress' | 'question' | 'result' | 'error';
  content: string;
  visibility: 'hidden' | 'visible_in_group_mode' | 'visible';
  createdAt: string | Date;
}
```

- [ ] **Step 4: Add component**

Create `src/components/chat/AgentEventMessage.tsx`:

```tsx
import { Bot, Boxes, CircleDollarSign, Dumbbell, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentEvent } from '@/types/goals';

const AGENT_LABELS: Record<AgentEvent['agent'], string> = {
  orchestrator: 'Orchestrator',
  items: 'Items Specialist',
  finances: 'Finance Specialist',
  actions: 'Actions Specialist',
  goal_view: 'Goal Specialist',
  openclaw: 'External Task Agent',
};

const AGENT_ICONS: Record<AgentEvent['agent'], typeof Bot> = {
  orchestrator: Bot,
  items: Boxes,
  finances: CircleDollarSign,
  actions: Dumbbell,
  goal_view: Bot,
  openclaw: Wrench,
};

export const AgentEventMessage = ({ event }: { event: AgentEvent }) => {
  const Icon = AGENT_ICONS[event.agent] ?? Bot;

  return (
    <div className="w-full rounded-2xl border border-border/40 bg-muted/25 px-4 py-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className={cn('flex size-6 items-center justify-center rounded-full bg-background/70 text-primary')}>
          <Icon className="size-3.5" />
        </span>
        <span>{AGENT_LABELS[event.agent] ?? event.agent}</span>
        <span className="rounded-full bg-background/60 px-2 py-0.5 normal-case">{event.eventType}</span>
      </div>
      <p className="text-sm leading-relaxed text-foreground">{event.content}</p>
    </div>
  );
};
```

- [ ] **Step 5: Run component test**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-ui
bun run test src/components/chat/AgentEventMessage.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Wire ChatPanel rendering**

Update `ChatPanel` only after backend events are returned in chat payloads. If `Message.metadata.agentEvents` is used initially, render them after assistant messages when `settings.agentConversationMode === 'group_chat'`.

Import:

```ts
import { AgentEventMessage } from '@/components/chat/AgentEventMessage';
import { useAuthStore } from '@/store/useAuthStore';
```

Inside `ChatPanel`, read:

```ts
const agentConversationMode = useAuthStore((state) => state.settings.agentConversationMode ?? 'single_agent');
```

Pass `agentConversationMode` to `MessageBubble` and render:

```tsx
{agentConversationMode === 'group_chat' && Array.isArray(message.metadata?.agentEvents) && (
  <div className="mt-2 space-y-2">
    {message.metadata.agentEvents
      .filter((event: any) => event.visibility === 'visible_in_group_mode' || event.visibility === 'visible')
      .map((event: any) => (
        <AgentEventMessage key={event.id} event={event} />
      ))}
  </div>
)}
```

- [ ] **Step 7: Add ChatPanel event rendering test**

Create `src/components/chat/ChatPanel.agentEvents.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from './ChatPanel';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';

vi.mock('@/store/useGoalsStore', () => ({
  useGoalsStore: () => ({ goals: [] }),
}));

vi.mock('@/store/useBillingStore', () => ({
  useBillingStore: () => ({
    usage: null,
    openUpgrade: vi.fn(),
  }),
}));

describe('ChatPanel specialist event rendering', () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.getState().resetStore();
    useChatStore.setState({
      overviewChat: {
        isLoading: false,
        messages: [
          {
            id: 'assistant_1',
            role: 'assistant',
            content: 'I am coordinating this.',
            timestamp: new Date('2026-04-26T10:00:00.000Z'),
            metadata: {
              agentEvents: [
                {
                  id: 'event_1',
                  agent: 'items',
                  eventType: 'progress',
                  content: 'Checking product details.',
                  visibility: 'visible_in_group_mode',
                  createdAt: '2026-04-26T10:00:00.000Z',
                },
              ],
            } as any,
          },
        ],
      },
    } as any);
  });

  it('hides specialist events in single agent mode', () => {
    useAuthStore.setState({
      settings: {
        theme: 'miami-vice',
        chatModel: 'gpt-5-nano',
        displayName: 'Casey',
        agentConversationMode: 'single_agent',
      },
    } as any);

    render(
      <MemoryRouter>
        <ChatPanel mode="creation" activeCategory="all" />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Items Specialist')).not.toBeInTheDocument();
  });

  it('shows specialist events in group chat mode', () => {
    useAuthStore.setState({
      settings: {
        theme: 'miami-vice',
        chatModel: 'gpt-5-nano',
        displayName: 'Casey',
        agentConversationMode: 'group_chat',
      },
    } as any);

    render(
      <MemoryRouter>
        <ChatPanel mode="creation" activeCategory="all" />
      </MemoryRouter>,
    );

    expect(screen.getByText('Items Specialist')).toBeInTheDocument();
    expect(screen.getByText('Checking product details.')).toBeInTheDocument();
  });
});
```

Run:

```bash
cd /home/trill/Development/neon/neon-goals-ui
bun run test src/components/chat/ChatPanel.agentEvents.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /home/trill/Development/neon/neon-goals-ui
git add src/components/chat/AgentEventMessage.tsx src/components/chat/AgentEventMessage.test.tsx src/types/goals.ts src/components/chat/ChatPanel.tsx
git commit -m "feat: render specialist events in group chat mode"
```

---

## Task 10: Remove Frontend Extraction Auto-Follow-Up as User Message

**Files:**
- Modify: `neon-goals-ui/src/components/chat/ChatPanel.tsx`
- Modify or delete: `neon-goals-ui/src/lib/extractionFollowup.ts`
- Modify or delete: `neon-goals-ui/src/lib/extractionFollowup.test.ts`
- Modify: `neon-goals-ui/src/hooks/useExtraction.ts` if `formatExtractionResultsForAI` becomes unused

- [ ] **Step 1: Write failing test for no auto-send**

Create a focused helper test if ChatPanel test setup is too heavy. Add `src/lib/extractionFollowup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldAutoSendExtractionFollowUp } from './extractionFollowup';

describe('shouldAutoSendExtractionFollowUp', () => {
  it('never auto-sends extraction results as a user message', () => {
    expect(shouldAutoSendExtractionFollowUp()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-ui
bun run test src/lib/extractionFollowup.test.ts
```

Expected: FAIL if helper is not changed.

- [ ] **Step 3: Replace helper**

Modify `src/lib/extractionFollowup.ts`:

```ts
export const shouldAutoSendExtractionFollowUp = (): boolean => false;
```

- [ ] **Step 4: Remove auto-send in ChatPanel**

In `src/components/chat/ChatPanel.tsx`, remove imports:

```ts
import { formatExtractionResultsForAI } from '@/hooks/useExtraction';
import { shouldSendExtractionFollowUp } from '@/lib/extractionFollowup';
```

Replace `handleExtractionComplete` body with:

```ts
  const handleExtractionComplete = useCallback((groupId: string) => {
    if (followupsSent.current.has(groupId)) return;
    followupsSent.current.add(groupId);
    setExtractionActive(groupId, false);
  }, [setExtractionActive]);
```

This keeps live extraction state correct and lets backend persisted assistant completion messages become the source of truth.

- [ ] **Step 5: Run tests**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-ui
bun run test src/lib/extractionFollowup.test.ts
```

Expected: PASS.

- [ ] **Step 6: Search for stale helper usage**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-ui
rg -n "formatExtractionResultsForAI|shouldSendExtractionFollowUp|shouldAutoSendExtractionFollowUp" src
```

Expected: no `formatExtractionResultsForAI` usage from `ChatPanel`; only helper test or no usages remain.

- [ ] **Step 7: Commit**

```bash
cd /home/trill/Development/neon/neon-goals-ui
git add src/components/chat/ChatPanel.tsx src/lib/extractionFollowup.ts src/lib/extractionFollowup.test.ts src/hooks/useExtraction.ts
git commit -m "fix: stop sending extraction completion as user message"
```

---

## Task 11: Initial Orchestrator Decomposition Skeleton

**Files:**
- Create: `neon-goals-service/src/modules/ai/orchestrator/message-decomposer.ts`
- Create: `neon-goals-service/src/modules/ai/orchestrator/message-decomposer.test.ts`
- Later integration into chat controllers is intentionally a follow-up; this task creates deterministic decomposition behavior first.

- [ ] **Step 1: Write failing tests**

Create `src/modules/ai/orchestrator/message-decomposer.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { decomposeUserMessage } from './message-decomposer';

describe('decomposeUserMessage', () => {
  it('classifies pure questions as answer work only', () => {
    expect(decomposeUserMessage('Can I afford a Honda Passport?')).toEqual([
      {
        kind: 'answer_question',
        assignedAgent: 'finances',
        input: { text: 'Can I afford a Honda Passport?' },
      },
    ]);
  });

  it('splits mixed item, action, and finance requests', () => {
    expect(
      decomposeUserMessage('I want a Wahl trimmer, add voice transcription to this site, and can I afford a Passport?'),
    ).toEqual([
      {
        kind: 'create_goal',
        assignedAgent: 'items',
        input: { text: 'I want a Wahl trimmer' },
      },
      {
        kind: 'create_goal',
        assignedAgent: 'actions',
        input: { text: 'add voice transcription to this site' },
      },
      {
        kind: 'answer_question',
        assignedAgent: 'finances',
        input: { text: 'can I afford a Passport?' },
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/ai/orchestrator/message-decomposer.test.ts
```

Expected: FAIL because file does not exist.

- [ ] **Step 3: Implement deterministic skeleton**

Create `src/modules/ai/orchestrator/message-decomposer.ts`:

```ts
import { AssignedAgent, CreateWorkItemInput } from '../agent-orchestrator.types';

const splitRequests = (message: string): string[] =>
  message
    .split(/\s*,\s*|\s+and\s+|\.\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

const classifyAgent = (text: string): AssignedAgent => {
  const lower = text.toLowerCase();
  if (/(afford|budget|net worth|cash flow|spending|saving|passport|forester)/.test(lower)) return 'finances';
  if (/(buy|trimmer|vape|product|price|link|setup)/.test(lower)) return 'items';
  if (/(add|setup|fix|test drive|learn|habit|skill|site|autohotkey)/.test(lower)) return 'actions';
  return 'orchestrator';
};

const classifyKind = (text: string, agent: AssignedAgent): CreateWorkItemInput['kind'] => {
  const lower = text.toLowerCase();
  if (/\?$|^(can|how|what|why|should|do)\b/.test(lower)) return 'answer_question';
  if (agent === 'finances' && /(afford|budget|net worth|cash flow|spending|saving)/.test(lower)) return 'answer_question';
  return 'create_goal';
};

export const decomposeUserMessage = (message: string): CreateWorkItemInput[] =>
  splitRequests(message).map((text) => {
    const assignedAgent = classifyAgent(text);
    return {
      kind: classifyKind(text, assignedAgent),
      assignedAgent,
      input: { text },
    };
  });
```

- [ ] **Step 4: Run test**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test src/modules/ai/orchestrator/message-decomposer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add src/modules/ai/orchestrator/message-decomposer.ts src/modules/ai/orchestrator/message-decomposer.test.ts
git commit -m "feat: add initial message decomposition skeleton"
```

---

## Task 12: Verification

**Files:**
- No source changes expected unless verification reveals defects.

- [ ] **Step 1: Run service tests**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-service
bun test
./node_modules/.bin/tsc --noEmit --pretty false
```

Expected: all tests pass and TypeScript has no errors.

- [ ] **Step 2: Run UI tests**

Run:

```bash
cd /home/trill/Development/neon/neon-goals-ui
bun run test src/pages/Settings.test.tsx src/components/chat/AgentEventMessage.test.tsx src/store/useChatStore.contextSwitch.test.ts src/lib/extractionFollowup.test.ts
bun run build
```

Expected: all tests pass and build succeeds.

- [ ] **Step 3: Browser verification with expect-cli**

Start the local app if needed:

```bash
cd /home/trill/Development/neon/neon-goals-ui
bun run dev --host 0.0.0.0
```

Run:

```bash
expect-cli tui -u http://localhost:5173 -m "Open Settings, switch to AI Chat, toggle Agent Transparency from Simple to Detailed and back, refresh the page, and verify the setting persists without console errors. Then open the main chat and confirm normal chat still shows one assistant by default." -y --browser-mode headless
```

Expected: exit 0 with no reported regressions. If expect reports unrelated pre-existing accessibility/touch-target issues, record them separately and do not mix those fixes into this branch.

- [ ] **Step 4: Final git status check**

Run in both repos:

```bash
cd /home/trill/Development/neon/neon-goals-service && git status --short
cd /home/trill/Development/neon/neon-goals-ui && git status --short
```

Expected: only intentional changes remain, or clean if all commits were made.
