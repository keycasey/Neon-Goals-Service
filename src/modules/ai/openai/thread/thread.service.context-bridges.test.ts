import { describe, expect, it, mock } from 'bun:test';
import { ThreadService } from './thread.service';

const messageShape = {
  role: true,
  content: true,
  metadata: true,
  source: true,
  visible: true,
  threadId: true,
  createdAt: true,
};

const createService = (input?: {
  bridgeMessages?: any[];
  chatMessages?: any[];
}) => {
  const prisma = {
    chatContextBridge: {
      findMany: mock(async () =>
        (input?.bridgeMessages ?? []).map((summaryMessage) => ({
          id: summaryMessage.metadata?.bridgeId ?? 'bridge_1',
          summaryMessage,
        })),
      ),
    },
    message: {
      findMany: mock(async () => input?.chatMessages ?? []),
    },
  };

  return { service: new ThreadService(prisma as any), prisma };
};

describe('ThreadService bridge context', () => {
  it('includes active context bridge summaries before visible local chat messages', async () => {
    const bridgeCreatedAt = new Date('2026-04-26T10:00:00Z');
    const localCreatedAt = new Date('2026-04-26T10:01:00Z');
    const { service, prisma } = createService({
      bridgeMessages: [
        {
          role: 'system',
          content: 'Context from overview chat for items chat.',
          metadata: {
            source: 'context_bridge',
            bridgeId: 'bridge_1',
            sourceChatId: 'overview_chat',
            targetChatId: 'items_chat',
          },
          source: 'context_bridge',
          visible: false,
          threadId: null,
          createdAt: bridgeCreatedAt,
        },
      ],
      chatMessages: [
        {
          role: 'user',
          content: 'Find me a trimmer.',
          metadata: null,
          source: 'user',
          visible: true,
          threadId: 'thread_items',
          createdAt: localCreatedAt,
        },
      ],
    });

    const messages = await service.loadChatHistoryWithMetadata('items_chat', 'user_1', 20);

    expect(prisma.chatContextBridge.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        targetChatId: 'items_chat',
        status: 'active',
      },
      orderBy: { createdAt: 'asc' },
      take: 4,
      select: {
        id: true,
        summaryMessage: {
          select: messageShape,
        },
      },
    });
    expect(messages.map((message) => message.content)).toEqual([
      'Context from overview chat for items chat.',
      'Find me a trimmer.',
    ]);
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'Context from overview chat for items chat.',
      metadata: {
        source: 'context_bridge',
        bridgeId: 'bridge_1',
        sourceChatId: 'overview_chat',
        targetChatId: 'items_chat',
      },
      source: 'context_bridge',
      visible: false,
      threadId: null,
      createdAt: bridgeCreatedAt,
    });
  });

  it('excludes cleared context bridge summaries', async () => {
    const { service } = createService({
      bridgeMessages: [
        {
          role: 'system',
          content: '[Cleared context bridge summary]',
          metadata: {
            source: 'context_bridge',
            bridgeId: 'bridge_1',
            cleared: true,
            clearedAt: '2026-04-26T10:02:00.000Z',
          },
          source: 'context_bridge',
          visible: false,
          threadId: null,
          createdAt: new Date('2026-04-26T10:00:00Z'),
        },
      ],
      chatMessages: [
        {
          role: 'assistant',
          content: 'Current chat answer.',
          metadata: null,
          source: 'agent',
          visible: true,
          threadId: 'thread_items',
          createdAt: new Date('2026-04-26T10:03:00Z'),
        },
      ],
    });

    const messages = await service.loadChatHistoryWithMetadata('items_chat', 'user_1', 20);

    expect(messages.map((message) => message.content)).toEqual(['Current chat answer.']);
  });

  it('preserves threadId and createdAt for normal returned messages', async () => {
    const createdAt = new Date('2026-04-26T11:00:00Z');
    const { service } = createService({
      chatMessages: [
        {
          role: 'assistant',
          content: 'The local message keeps metadata fields.',
          metadata: { proposalType: 'item' },
          source: 'agent',
          visible: true,
          threadId: 'thread_items',
          createdAt,
        },
      ],
    });

    const messages = await service.loadChatHistoryWithMetadata('items_chat', 'user_1', 20);

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: 'The local message keeps metadata fields.',
        metadata: { proposalType: 'item' },
        source: 'agent',
        visible: true,
        threadId: 'thread_items',
        createdAt,
      },
    ]);
  });
});
