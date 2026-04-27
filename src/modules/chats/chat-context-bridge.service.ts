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

    const [sourceChat, targetChat] = await Promise.all([
      this.prisma.chatState.findFirstOrThrow({
        where: { id: input.fromChatId, userId: input.userId },
      }),
      this.prisma.chatState.findFirstOrThrow({
        where: { id: input.toChatId, userId: input.userId },
      }),
    ]);

    await this.clearBridgesForReturnedChat(input.userId, input.toChatId);

    const content = await this.buildCompactSummary({
      userId: input.userId,
      sourceChatId: input.fromChatId,
      sourceChat,
      targetChat,
    });

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
    return this.prisma.chatContextBridge.updateMany({
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
  }

  private async buildCompactSummary(input: {
    userId: string;
    sourceChatId: string;
    sourceChat: { type: string; categoryId?: string | null; goalId?: string | null };
    targetChat: { type: string; categoryId?: string | null; goalId?: string | null };
  }): Promise<string> {
    const recentMessages = await this.prisma.message.findMany({
      where: {
        userId: input.userId,
        chatId: input.sourceChatId,
        visible: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    const lines = [...recentMessages]
      .reverse()
      .map((message) => `${message.role}: ${this.compactContent(message.content)}`)
      .join('\n');

    return [
      `Context from ${this.describeChat(input.sourceChat)} for ${this.describeChat(
        input.targetChat,
      )}.`,
      'Use this as compact cross-chat context; direct messages in the current chat are higher priority.',
      lines,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private describeChat(chat: { type: string; categoryId?: string | null; goalId?: string | null }) {
    if (chat.type === 'overview') {
      return 'overview chat';
    }

    if (chat.type === 'category') {
      return chat.categoryId ? `${chat.categoryId} chat` : 'category chat';
    }

    if (chat.type === 'goal') {
      return 'goal chat';
    }

    return 'chat';
  }

  private compactContent(content: string) {
    const compacted = content.replace(/\s+/g, ' ').trim();
    return compacted.length > 500 ? `${compacted.slice(0, 497)}...` : compacted;
  }
}
