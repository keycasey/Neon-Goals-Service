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
    $transaction: undefined as any,
  };
  prisma.$transaction = mock(async (callback: any) => callback(prisma));

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

  it('rejects work item insertion failures through a transaction', async () => {
    const insertionError = new Error('work item insert failed');
    const prisma = {
      agentRun: {
        create: mock(async (args: any) => ({ id: 'run_1', ...args.data })),
        update: mock(async (args: any) => ({ id: args.where.id, ...args.data })),
      },
      agentWorkItem: {
        createMany: mock(async () => {
          throw insertionError;
        }),
      },
      agentEvent: {
        create: mock(async (args: any) => ({ id: 'event_1', ...args.data })),
      },
      $transaction: undefined as any,
    };
    prisma.$transaction = mock(async (callback: any) => callback(prisma));
    const service = new AgentOrchestratorService(prisma as any);

    await expect(
      service.createRun({
        userId: 'user_1',
        chatId: 'chat_1',
        userMessageId: 'message_1',
        workItems: [
          {
            kind: 'answer_question',
            assignedAgent: 'finances',
            input: { question: 'Can I afford this?' },
          },
        ],
      }),
    ).rejects.toThrow('work item insert failed');
    expect(prisma.$transaction).toHaveBeenCalled();
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
