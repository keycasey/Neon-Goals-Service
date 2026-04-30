import { describe, expect, it, mock } from 'bun:test';
import { ProductExtractionService } from './product-extraction.service';

const createService = (itemsChat: { id: string } | null = { id: 'items_chat' }) => {
  const prisma = {
    chatState: {
      findFirst: mock(async () => itemsChat),
      create: mock(async (args: any) => ({ id: 'created_items_chat', ...args.data })),
    },
    message: {
      create: mock(async (args: any) => ({ id: 'message_1', ...args.data })),
    },
    agentRun: {
      create: mock(async (args: any) => ({ id: 'run_1', ...args.data })),
    },
    agentEvent: {
      create: mock(async (args: any) => ({ id: 'event_1', ...args.data })),
    },
    $transaction: undefined as any,
  };
  prisma.$transaction = mock(async (callback: any) => callback(prisma));

  const configService = {
    get: mock((_key: string, fallback: string) => fallback),
  };

  return {
    service: new ProductExtractionService(
      prisma as any,
      {} as any,
      configService as any,
      { emit: mock(() => undefined) } as any,
    ),
    prisma,
  };
};

describe('ProductExtractionService extraction completion persistence', () => {
  it('does not persist a goal-creation prompt when all extraction jobs failed', async () => {
    const { service, prisma } = createService();

    await (service as any).sendGroupCompletionMessage('user_1', 'group_1', [
      { success: false, url: 'https://example.com/one' },
      { success: false, url: 'https://example.com/two' },
    ]);

    expect(prisma.chatState.findFirst).not.toHaveBeenCalled();
    expect(prisma.chatState.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
    expect(prisma.agentEvent.create).not.toHaveBeenCalled();
  });

  it('creates the Items category chat when absent before persisting the agent output records', async () => {
    const { service, prisma } = createService(null);

    await (service as any).sendGroupCompletionMessage('user_1', 'group_2', [
      {
        success: true,
        name: 'Cordless trimmer',
        price: 39.99,
        currency: 'USD',
        url: 'https://example.com/trimmer',
      },
    ]);

    expect(prisma.chatState.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        type: 'category',
        categoryId: 'items',
        isLoading: false,
      },
      select: { id: true },
    });

    const messageData = prisma.message.create.mock.calls[0][0].data;
    expect(messageData).toMatchObject({
      userId: 'user_1',
      chatId: 'created_items_chat',
      role: 'assistant',
      source: 'agent',
    });
    expect(messageData.content).toContain('1. Cordless trimmer (USD 39.99)');
    expect(prisma.agentRun.create.mock.calls[0][0].data.userMessageId).toBe('message_1');
    expect(prisma.agentEvent.create.mock.calls[0][0].data).toMatchObject({
      runId: 'run_1',
      chatId: 'created_items_chat',
      userId: 'user_1',
      agent: 'items',
      eventType: 'result',
      visibility: 'visible_in_group_mode',
    });
  });

  it('does not re-emit group completion when a terminal job receives a duplicate callback', async () => {
    const { service, prisma } = createService();
    prisma.extractionJob = {
      findUnique: mock(async () => ({
        id: 'job_1',
        userId: 'user_1',
        groupId: 'group_1',
        status: 'failed',
        url: 'https://example.com/failed',
      })),
      update: mock(async () => undefined),
    };

    await service.handleCallback('job_1', { success: false, error: 'duplicate failure' });

    expect(prisma.extractionJob.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});
