import { describe, expect, it, mock } from 'bun:test';
import { ChatContextBridgeService } from './chat-context-bridge.service';

const createService = () => {
  const prisma = {
    chatContextBridge: {
      updateMany: mock(async (args: any) => ({ count: 1, args })),
      create: mock(async (args: any) => ({ id: 'bridge_1', ...args.data })),
    },
    message: {
      create: mock(async (args: any) => ({ id: 'message_summary_1', ...args.data })),
      findMany: mock(async () => [
        {
          role: 'assistant',
          content: 'I can help compare the options.',
          createdAt: new Date('2026-04-26T10:02:00Z'),
        },
        {
          role: 'user',
          content: 'I want to buy a trimmer.',
          createdAt: new Date('2026-04-26T10:01:00Z'),
        },
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
  it('returns null and does no DB writes when switching to the same chat', async () => {
    const { service, prisma } = createService();

    const result = await service.switchContext({
      userId: 'user_1',
      fromChatId: 'overview_chat',
      toChatId: 'overview_chat',
    });

    expect(result).toBeNull();
    expect(prisma.chatState.findFirstOrThrow).not.toHaveBeenCalled();
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.chatContextBridge.updateMany).not.toHaveBeenCalled();
    expect(prisma.chatContextBridge.create).not.toHaveBeenCalled();
  });

  it('clears active bridge summaries that expire when returning to the target chat', async () => {
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

  it('creates a hidden context bridge system message in the target chat', async () => {
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

  it('creates an active ChatContextBridge linked to the summary message', async () => {
    const { service, prisma } = createService();

    const result = await service.switchContext({
      userId: 'user_1',
      fromChatId: 'overview_chat',
      toChatId: 'items_chat',
    });

    expect(result.id).toBe('bridge_1');
    expect(prisma.chatContextBridge.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        sourceChatId: 'overview_chat',
        targetChatId: 'items_chat',
        summaryMessageId: 'message_summary_1',
        status: 'active',
      },
    });
  });

  it('summarizes recent visible source messages in chronological compact role lines', async () => {
    const { service, prisma } = createService();

    await service.switchContext({
      userId: 'user_1',
      fromChatId: 'overview_chat',
      toChatId: 'items_chat',
    });

    expect(prisma.chatState.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'overview_chat', userId: 'user_1' },
    });
    expect(prisma.chatState.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'items_chat', userId: 'user_1' },
    });
    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        chatId: 'overview_chat',
        visible: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    const content = prisma.message.create.mock.calls[0][0].data.content;
    expect(content).toContain('user: I want to buy a trimmer.');
    expect(content).toContain('assistant: I can help compare the options.');
    expect(content.indexOf('user: I want')).toBeLessThan(
      content.indexOf('assistant: I can help'),
    );
  });
});
