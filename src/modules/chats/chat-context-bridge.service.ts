import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

interface SwitchContextInput {
  userId: string;
  fromChatId: unknown;
  toChatId: unknown;
}

@Injectable()
export class ChatContextBridgeService {
  constructor(private prisma: PrismaService) {}

  async switchContext(input: SwitchContextInput) {
    const fromChatId = this.requireChatId(input.fromChatId, 'fromChatId');
    const toChatId = this.requireChatId(input.toChatId, 'toChatId');

    if (fromChatId === toChatId) {
      const chat = await this.prisma.chatState.findFirst({
        where: { id: fromChatId, userId: input.userId },
      });

      if (!chat) {
        throw new NotFoundException('Chat not found');
      }

      return null;
    }

    const [sourceChat, targetChat] = await Promise.all([
      this.prisma.chatState.findFirst({
        where: { id: fromChatId, userId: input.userId },
      }),
      this.prisma.chatState.findFirst({
        where: { id: toChatId, userId: input.userId },
      }),
    ]);

    if (!sourceChat) {
      throw new NotFoundException('Source chat not found');
    }

    if (!targetChat) {
      throw new NotFoundException('Target chat not found');
    }

    const content = await this.buildCompactSummary({
      userId: input.userId,
      sourceChatId: fromChatId,
      sourceChat,
      targetChat,
    });

    return this.prisma.$transaction(async (tx) => {
      await this.clearBridgesForReturnedChat(tx, input.userId, toChatId);

      const summaryMessage = await tx.message.create({
        data: {
          userId: input.userId,
          chatId: toChatId,
          role: 'system',
          source: 'context_bridge',
          visible: false,
          content,
          metadata: {
            source: 'context_bridge',
            bridgeId: 'pending',
            sourceChatId: fromChatId,
            targetChatId: toChatId,
            expiresOnReturnToChatId: fromChatId,
          },
        },
      });

      const bridge = await tx.chatContextBridge.create({
        data: {
          userId: input.userId,
          sourceChatId: fromChatId,
          targetChatId: toChatId,
          summaryMessageId: summaryMessage.id,
          status: 'active',
        },
      });

      await tx.message.update({
        where: { id: summaryMessage.id },
        data: {
          metadata: this.contextBridgeMetadata({
            bridgeId: bridge.id,
            sourceChatId: fromChatId,
            targetChatId: toChatId,
            expiresOnReturnToChatId: fromChatId,
          }),
        },
      });

      return bridge;
    });
  }

  private async clearBridgesForReturnedChat(
    tx: Prisma.TransactionClient,
    userId: string,
    returnedChatId: string,
  ) {
    const summariesToClear = await tx.chatContextBridge.findMany({
      where: this.activeBridgeWhere(userId, returnedChatId),
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
    const bridgeIds = summariesToClear.map((bridge) => bridge.id);

    if (bridgeIds.length === 0) {
      return;
    }

    const clearedAt = new Date();
    const clearedAtIso = clearedAt.toISOString();

    for (const bridge of summariesToClear) {
      await tx.message.update({
        where: { id: bridge.summaryMessageId },
        data: {
          content: '[Cleared context bridge summary]',
          metadata: this.mergeClearedMetadata(bridge.summaryMessage.metadata, clearedAtIso),
        },
      });
    }

    await tx.chatContextBridge.updateMany({
      where: {
        id: {
          in: bridgeIds,
        },
      },
      data: {
        status: 'cleared',
        clearedAt,
      },
    });
  }

  private activeBridgeWhere(userId: string, returnedChatId: string) {
    return {
      userId,
      status: 'active',
      summaryMessage: {
        metadata: {
          path: ['expiresOnReturnToChatId'],
          equals: returnedChatId,
        },
      },
    };
  }

  private mergeClearedMetadata(metadata: unknown, clearedAt: string) {
    return {
      ...(this.isRecord(metadata) ? metadata : {}),
      cleared: true,
      clearedAt,
    };
  }

  private contextBridgeMetadata(input: {
    bridgeId: string;
    sourceChatId: string;
    targetChatId: string;
    expiresOnReturnToChatId: string;
  }) {
    return {
      source: 'context_bridge',
      bridgeId: input.bridgeId,
      sourceChatId: input.sourceChatId,
      targetChatId: input.targetChatId,
      expiresOnReturnToChatId: input.expiresOnReturnToChatId,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private requireChatId(value: unknown, fieldName: 'fromChatId' | 'toChatId') {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${fieldName} must be a non-empty string`);
    }

    return value.trim();
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
