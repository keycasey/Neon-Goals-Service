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
      {} as any,
    ),
    prisma,
  };
};

describe('ProductExtractionService extraction completion persistence', () => {
  it('stores all-failed extraction completion as agent-owned assistant output with a visible group-mode result event', async () => {
    const { service, prisma } = createService();

    await (service as any).sendGroupCompletionMessage('user_1', 'group_1', [
      { success: false, url: 'https://example.com/one' },
      { success: false, url: 'https://example.com/two' },
    ]);

    expect(prisma.chatState.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        type: 'category',
        categoryId: 'items',
      },
      select: { id: true },
    });
    expect(prisma.chatState.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();

    const messageData = prisma.message.create.mock.calls[0][0].data;
    expect(messageData).toMatchObject({
      userId: 'user_1',
      chatId: 'items_chat',
      role: 'assistant',
      source: 'agent',
      metadata: {
        extraction: {
          groupId: 'group_1',
          successfulCount: 0,
          failedCount: 2,
        },
        suggestion: {
          action: 'create_group_item_goal',
          groupId: 'group_1',
        },
      },
    });
    expect(messageData.content).toContain('I could not read any items from those links');
    expect(messageData.source).not.toBe('user');

    expect(prisma.agentRun.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        chatId: 'items_chat',
        userMessageId: 'message_1',
        status: 'completed',
        completedAt: expect.any(Date),
      },
    });
    expect(prisma.agentEvent.create).toHaveBeenCalledWith({
      data: {
        runId: 'run_1',
        chatId: 'items_chat',
        userId: 'user_1',
        agent: 'items',
        eventType: 'result',
        content: messageData.content,
        visibility: 'visible_in_group_mode',
      },
    });
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
});
