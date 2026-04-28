import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, mock } from 'bun:test';
import { ChatContextBridgeService } from './chat-context-bridge.service';
import { ChatsController } from './chats.controller';

const createService = () => {
  const prisma = {
    chatContextBridge: {
      findMany: mock(async () => [
        {
          id: 'old_bridge_1',
          summaryMessageId: 'old_summary_1',
          summaryMessage: {
            metadata: {
              source: 'context_bridge',
              sourceChatId: 'items_chat',
              targetChatId: 'overview_chat',
              expiresOnReturnToChatId: 'items_chat',
            },
          },
        },
        {
          id: 'old_bridge_2',
          summaryMessageId: 'old_summary_2',
          summaryMessage: {
            metadata: {
              source: 'context_bridge',
              bridgeId: 'old_bridge_2',
              sourceChatId: 'actions_chat',
              targetChatId: 'overview_chat',
              expiresOnReturnToChatId: 'items_chat',
            },
          },
        },
      ]),
      updateMany: mock(async (args: any) => ({ count: 1, args })),
      create: mock(async (args: any) => ({ id: 'bridge_1', ...args.data })),
    },
    message: {
      update: mock(async (args: any) => ({ id: args.where.id, ...args.data })),
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
      findFirst: mock(async ({ where }: any) => ({
        id: where.id,
        userId: where.userId,
        type: where.id === 'overview_chat' ? 'overview' : 'category',
        categoryId: where.id === 'items_chat' ? 'items' : null,
        goalId: null,
      })),
    },
    $transaction: undefined as any,
  };
  prisma.$transaction = mock(async (callback: any) => callback(prisma));

  return { service: new ChatContextBridgeService(prisma as any), prisma };
};

describe('ChatContextBridgeService', () => {
  it('rejects missing or empty chat ids without DB writes', async () => {
    const { service, prisma } = createService();

    await expect(
      service.switchContext({
        userId: 'user_1',
        fromChatId: undefined as any,
        toChatId: undefined as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.switchContext({
        userId: 'user_1',
        fromChatId: '   ',
        toChatId: 'items_chat',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.switchContext({
        userId: 'user_1',
        fromChatId: 'overview_chat',
        toChatId: 42 as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.chatState.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.chatContextBridge.create).not.toHaveBeenCalled();
  });

  it('controller passes an absent body to service validation instead of treating it as same-chat', async () => {
    const contextBridgeService = {
      switchContext: mock(async () => null),
    };
    const controller = new ChatsController(
      {} as any,
      contextBridgeService as any,
      {} as any,
    );

    await controller.switchContext('user_1', undefined as any);

    expect(contextBridgeService.switchContext).toHaveBeenCalledWith({
      userId: 'user_1',
      fromChatId: undefined,
      toChatId: undefined,
    });
  });

  it('verifies same-chat ownership before returning null without bridge writes', async () => {
    const { service, prisma } = createService();

    const result = await service.switchContext({
      userId: 'user_1',
      fromChatId: 'overview_chat',
      toChatId: 'overview_chat',
    });

    expect(result).toBeNull();
    expect(prisma.chatState.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.chatState.findFirst).toHaveBeenCalledWith({
      where: { id: 'overview_chat', userId: 'user_1' },
    });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.chatContextBridge.updateMany).not.toHaveBeenCalled();
    expect(prisma.chatContextBridge.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for missing or cross-user same-chat ids', async () => {
    const { service, prisma } = createService();
    prisma.chatState.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.switchContext({
        userId: 'user_1',
        fromChatId: 'missing_chat',
        toChatId: 'missing_chat',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.chatContextBridge.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when source or target chat is not owned by the user', async () => {
    const { service, prisma } = createService();
    prisma.chatState.findFirst.mockImplementation(async ({ where }: any) =>
      where.id === 'missing_chat'
        ? null
        : {
            id: where.id,
            userId: where.userId,
            type: 'overview',
            categoryId: null,
            goalId: null,
          },
    );

    await expect(
      service.switchContext({
        userId: 'user_1',
        fromChatId: 'missing_chat',
        toChatId: 'items_chat',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.switchContext({
        userId: 'user_1',
        fromChatId: 'overview_chat',
        toChatId: 'missing_chat',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.chatContextBridge.updateMany).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.chatContextBridge.create).not.toHaveBeenCalled();
  });

  it('clears active bridge summaries that expire when returning to the target chat', async () => {
    const { service, prisma } = createService();

    await service.switchContext({
      userId: 'user_1',
      fromChatId: 'overview_chat',
      toChatId: 'items_chat',
    });

    expect(prisma.chatContextBridge.findMany).toHaveBeenCalledWith({
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
      select: {
        id: true,
        summaryMessageId: true,
        summaryMessage: {
          select: {
            metadata: true,
          },
        },
      },
    });
    expect(prisma.chatContextBridge.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['old_bridge_1', 'old_bridge_2'],
        },
      },
      data: {
        status: 'cleared',
        clearedAt: expect.any(Date),
      },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'old_summary_1' },
      data: {
        content: '[Cleared context bridge summary]',
        metadata: {
          source: 'context_bridge',
          sourceChatId: 'items_chat',
          targetChatId: 'overview_chat',
          expiresOnReturnToChatId: 'items_chat',
          cleared: true,
          clearedAt: expect.any(String),
        },
      },
    });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'old_summary_2' },
      data: {
        content: '[Cleared context bridge summary]',
        metadata: {
          source: 'context_bridge',
          bridgeId: 'old_bridge_2',
          sourceChatId: 'actions_chat',
          targetChatId: 'overview_chat',
          expiresOnReturnToChatId: 'items_chat',
          cleared: true,
          clearedAt: expect.any(String),
        },
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
          bridgeId: 'pending',
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
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'message_summary_1' },
      data: {
        metadata: {
          source: 'context_bridge',
          bridgeId: 'bridge_1',
          sourceChatId: 'overview_chat',
          targetChatId: 'items_chat',
          expiresOnReturnToChatId: 'overview_chat',
        },
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

    expect(prisma.chatState.findFirst).toHaveBeenCalledWith({
      where: { id: 'overview_chat', userId: 'user_1' },
    });
    expect(prisma.chatState.findFirst).toHaveBeenCalledWith({
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
