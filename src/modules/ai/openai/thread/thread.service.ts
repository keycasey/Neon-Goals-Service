import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../../config/prisma.service';
import { ConversationSummaryService } from '../../conversation-summary.service';
import { ChatCompletionMessageParam } from 'openai/resources';
import {
  ThreadHistory,
  CreateThreadResponse,
  MessageData,
  SaveMessagesOptions,
} from './thread.types';

/**
 * Service for managing conversation thread history.
 *
 * Provides in-memory caching of thread histories with database persistence.
 * Supports summary-aware context building for efficient token usage.
 */
@Injectable()
export class ThreadService {
  private readonly logger = new Logger(ThreadService.name);

  /** In-memory cache of thread histories */
  private threadHistories = new Map<string, ThreadHistory>();

  constructor(
    private prisma: PrismaService,
    @Optional() private summaryService?: ConversationSummaryService,
  ) {}

  /**
   * Load conversation history from database for a thread.
   * If chatId is provided, uses summary-aware context building.
   *
   * @param threadId - The thread identifier
   * @param userId - The user identifier for authorization
   * @param chatId - Optional chat ID for summary-aware context building
   * @returns Array of chat completion message parameters
   */
  async loadThreadHistory(
    threadId: string,
    userId: string,
    chatId?: string,
  ): Promise<ChatCompletionMessageParam[]> {
    // Check in-memory cache first
    const cached = this.threadHistories.get(threadId);
    if (cached) {
      return cached.messages;
    }

    // If we have a chatId and summary service, use summary-aware context building
    if (chatId && this.summaryService) {
      try {
        const context = await this.summaryService.buildContext(chatId);
        // Cache in memory
        this.threadHistories.set(threadId, { messages: context });
        return context;
      } catch (error) {
        this.logger.warn(
          `Failed to load context for chat ${chatId}, falling back to threadId loading:`,
          error,
        );
        // Fall through to old approach
      }
    }

    // Legacy approach: Load all messages by threadId
    const messages = await this.prisma.message.findMany({
      where: { threadId, userId },
      orderBy: { createdAt: 'asc' },
    });

    const history: ChatCompletionMessageParam[] = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    // Cache in memory
    this.threadHistories.set(threadId, { messages: history });

    return history;
  }

  /**
   * Load persisted chat messages with metadata for DSPy/live-routing contexts.
   *
   * Unlike loadThreadHistory, this preserves metadata, visibility, and source.
   * Use this when building worker requests or datasets that need the full record.
   */
  async loadChatHistoryWithMetadata(
    chatId: string,
    userId: string,
    limit = 20,
  ): Promise<Array<{
    role: string;
    content: string;
    metadata: any;
    source: string;
    visible: boolean;
    threadId: string | null;
    createdAt: Date;
  }>> {
    const messages = await this.prisma.message.findMany({
      where: { chatId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        role: true,
        content: true,
        metadata: true,
        source: true,
        visible: true,
        threadId: true,
        createdAt: true,
      },
    });

    return [...messages].reverse().map((message) => ({
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      source: message.source,
      visible: message.visible,
      threadId: message.threadId,
      createdAt: message.createdAt,
    }));
  }

  /**
   * Load persisted thread messages with metadata for goal-view and thread-based contexts.
   */
  async loadThreadHistoryWithMetadata(
    threadId: string,
    userId: string,
    limit = 20,
  ): Promise<Array<{
    role: string;
    content: string;
    metadata: any;
    source: string;
    visible: boolean;
    threadId: string | null;
    createdAt: Date;
  }>> {
    const messages = await this.prisma.message.findMany({
      where: { threadId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        role: true,
        content: true,
        metadata: true,
        source: true,
        visible: true,
        threadId: true,
        createdAt: true,
      },
    });

    return [...messages].reverse().map((message) => ({
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      source: message.source,
      visible: message.visible,
      threadId: message.threadId,
      createdAt: message.createdAt,
    }));
  }

  /**
   * Save conversation messages to database.
   * Note: This is a legacy method for messages saved via threadId only.
   * New code should save messages through ChatsService.
   *
   * @param threadId - The thread identifier
   * @param userId - The user identifier
   * @param messages - Array of message data to save
   * @param chatId - Optional chat ID to associate messages with
   * @param options - Optional save options (source, visibility)
   */
  async saveMessages(
    threadId: string,
    userId: string,
    messages: MessageData[],
    chatId?: string,
    options?: SaveMessagesOptions,
  ): Promise<void> {
    await this.prisma.message.createMany({
      data: messages.map(msg => {
        const data: any = {
          threadId,
          userId,
          role: msg.role,
          content: msg.content,
        };
        if (chatId) {
          data.chatId = chatId;
        }
        if (options?.source !== undefined) {
          data.source = options.source;
        }
        if (options?.visible !== undefined) {
          data.visible = options.visible;
        }
        if (msg.metadata) {
          data.metadata = msg.metadata;
        }
        return data;
      }),
    });
  }

  /**
   * Create a new thread for goal creation conversation.
   *
   * @returns Object containing the new thread ID
   */
  async createThread(): Promise<CreateThreadResponse> {
    const threadId = `thread_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.threadHistories.set(threadId, { messages: [] });
    return { threadId };
  }

  /**
   * Delete a thread (cleanup when goal creation is cancelled).
   *
   * @param threadId - The thread identifier to delete
   */
  async deleteThread(threadId: string): Promise<void> {
    this.threadHistories.delete(threadId);
    this.logger.log(`Deleted thread ${threadId}`);
  }

  /**
   * Get cached thread history if available.
   *
   * @param threadId - The thread identifier
   * @returns The thread history or undefined if not cached
   */
  getCachedHistory(threadId: string): ThreadHistory | undefined {
    return this.threadHistories.get(threadId);
  }

  /**
   * Set cached thread history.
   *
   * @param threadId - The thread identifier
   * @param history - The thread history to cache
   */
  setCachedHistory(threadId: string, history: ThreadHistory): void {
    this.threadHistories.set(threadId, history);
  }

  /**
   * Clear cached thread history for a specific thread.
   *
   * @param threadId - The thread identifier
   */
  clearCachedHistory(threadId: string): void {
    this.threadHistories.delete(threadId);
  }

  /**
   * Check if a chat should be summarized based on message count.
   * Delegates to ConversationSummaryService if available.
   *
   * @param chatId - The chat ID to check
   * @returns True if summarization should be triggered
   */
  async shouldSummarize(chatId: string): Promise<boolean> {
    if (!this.summaryService) {
      return false;
    }
    return this.summaryService.shouldSummarize(chatId);
  }

  /**
   * Summarize messages since the last summary and store the result.
   * Delegates to ConversationSummaryService if available.
   *
   * @param chatId - The chat ID to summarize
   */
  async summarizeChat(chatId: string): Promise<void> {
    if (!this.summaryService) {
      return;
    }
    return this.summaryService.summarizeChat(chatId);
  }
}
