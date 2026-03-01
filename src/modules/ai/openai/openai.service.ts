import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Types from original service
export interface CreateThreadResponse {
  threadId: string;
}

export interface SendMessageResponse {
  content: string;
  shouldEnterGoalCreation?: boolean;
  goalData?: {
    goalType?: 'item' | 'finance' | 'action';
    title?: string;
    budget?: number;
    targetBalance?: number;
    currentBalance?: number;
    description?: string;
    targetDate?: string;
    tasks?: Array<{ title: string }>;
  };
  awaitingConfirmation?: boolean;
  goalPreview?: string;
}

export interface ExpertAnalysis {
  strengths: string[];
  considerations: string[];
  suggestedImprovements: string[];
  potentialPitfalls: string[];
  isReadyToCreate: boolean;
}

// Import extracted services
import { ThreadService } from './thread/thread.service';
import { PromptsService } from './prompts/prompts.service';
import { CommandParserService } from './parsing/command-parser.service';
import {
  GoalCreationChat,
  SendMessageResponse as GoalCreationSendMessageResponse,
} from './chat/goal-creation.chat';
import { OverviewChat as OverviewChatService } from './chat/overview.chat';
import { CategoryChat as CategoryChatService, AgentContext } from './chat/category.chat';
import { BaseChatService, ChatResponse, StreamChunk } from './chat/base-chat.service';

/**
 * Root orchestrator service for OpenAI-powered chat functionality.
 *
 * This service provides a unified API that delegates to specialized child services:
 * - ThreadService: Thread management and message persistence
 * - PromptsService: System prompt generation
 * - CommandParserService: Structured command parsing
 * - GoalCreationChat: Interactive goal creation conversations
 * - OverviewChat: Overview chat with goal context and specialist routing
 * - CategoryChat: Category-specific conversations (items, finances, actions)
 *
 * The service maintains backward compatibility with the original OpenAIService API
 * while internally delegating to the appropriate child services.
 */
@Injectable()
export class OpenAIService implements OnModuleInit {
  private readonly logger = new Logger(OpenAIService.name);

  constructor(
    private configService: ConfigService,
    private threadService: ThreadService,
    private promptsService: PromptsService,
    private commandParserService: CommandParserService,
    private goalCreationChat: GoalCreationChat,
    private overviewChatService: OverviewChatService,
    private categoryChatService: CategoryChatService,
    private baseChatService: BaseChatService,
  ) {}

  onModuleInit() {
    this.logger.log('OpenAI service initialized (orchestrator mode)');
  }

  // ===========================================================================
  // Thread Management - Delegates to ThreadService
  // ===========================================================================

  /**
   * Create a new thread for goal creation conversation.
   * @returns Object containing the new thread ID
   */
  async createThread(): Promise<CreateThreadResponse> {
    return this.threadService.createThread();
  }

  /**
   * Delete a thread (cleanup when goal creation is cancelled).
   * @param threadId - The thread identifier to delete
   */
  async deleteThread(threadId: string): Promise<void> {
    // Delegate to both thread service and goal creation chat
    await this.threadService.deleteThread(threadId);
    await this.goalCreationChat.deleteThread(threadId);
  }

  // ===========================================================================
  // Goal Creation Chat - Delegates to GoalCreationChat
  // ===========================================================================

  /**
   * Send a message in the goal creation conversation.
   *
   * @param threadId - The conversation thread ID
   * @param userId - The user ID for authorization
   * @param message - The user's message
   * @param existingGoalData - Any existing goal data to merge
   * @returns Response with content and optional extracted goal data
   */
  async sendMessage(
    threadId: string,
    userId: string,
    message: string,
    existingGoalData: any = {},
  ): Promise<SendMessageResponse> {
    const response = await this.goalCreationChat.sendMessage(
      threadId,
      userId,
      message,
      existingGoalData,
    );

    // Map the response to maintain backward compatibility
    return {
      content: response.content,
      shouldEnterGoalCreation: response.shouldEnterGoalCreation,
      goalData: response.goalData,
      awaitingConfirmation: response.awaitingConfirmation,
      goalPreview: response.goalPreview,
    };
  }

  /**
   * Continue conversation for an existing goal.
   *
   * @param threadId - The conversation thread ID
   * @param userId - The user ID for authorization
   * @param message - The user's message
   * @param goalContext - Context about the existing goal
   * @returns Response with content and optional commands
   */
  async continueGoalConversation(
    threadId: string,
    userId: string,
    message: string,
    goalContext: any,
  ): Promise<{
    content: string;
    commands?: any[];
    goalPreview?: string;
    awaitingConfirmation?: boolean;
    proposalType?: string;
  }> {
    return this.goalCreationChat.continueGoalConversation(
      threadId,
      userId,
      message,
      goalContext,
    );
  }

  // ===========================================================================
  // Overview Chat - Delegates to OverviewChat
  // ===========================================================================

  /**
   * Handle an overview chat message (non-streaming).
   *
   * @param userId - The user ID
   * @param message - The user's message
   * @param goals - Array of user's goals for context
   * @param chatId - The chat ID for persistence
   * @returns Response with content and optional commands
   */
  async overviewChat(
    userId: string,
    message: string,
    goals: any[],
    chatId: string,
  ): Promise<ChatResponse> {
    return this.overviewChatService.overviewChat(userId, message, goals, chatId);
  }

  /**
   * Handle an overview chat message with streaming.
   *
   * @param userId - The user ID
   * @param message - The user's message
   * @param goals - Array of user's goals for context
   * @param chatId - The chat ID for persistence
   * @returns AsyncGenerator yielding stream chunks
   */
  async *overviewChatStream(
    userId: string,
    message: string,
    goals: any[],
    chatId: string,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    yield* this.overviewChatService.overviewChatStream(userId, message, goals, chatId);
  }

  // ===========================================================================
  // Category Chat - Delegates to CategoryChat
  // ===========================================================================

  /**
   * Handle a category chat message (non-streaming).
   *
   * @param userId - The user ID
   * @param categoryId - The category ID ('items', 'finances', 'actions')
   * @param message - The user's message
   * @param categoryGoals - Array of user's goals in this category
   * @param chatId - The chat ID for persistence
   * @param agentContext - Optional context for agent-routed messages
   * @returns Response with content and optional commands
   */
  async categoryChat(
    userId: string,
    categoryId: string,
    message: string,
    categoryGoals: any[],
    chatId: string,
    agentContext?: AgentContext,
  ): Promise<ChatResponse> {
    return this.categoryChatService.categoryChat(
      userId,
      categoryId,
      message,
      categoryGoals,
      chatId,
      agentContext,
    );
  }

  /**
   * Handle a category chat message with streaming.
   *
   * @param userId - The user ID
   * @param categoryId - The category ID ('items', 'finances', 'actions')
   * @param message - The user's message
   * @param categoryGoals - Array of user's goals in this category
   * @param chatId - The chat ID for persistence
   * @returns AsyncGenerator yielding stream chunks
   */
  async *categoryChatStream(
    userId: string,
    categoryId: string,
    message: string,
    categoryGoals: any[],
    chatId: string,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    yield* this.categoryChatService.categoryChatStream(
      userId,
      categoryId,
      message,
      categoryGoals,
      chatId,
    );
  }

  // ===========================================================================
  // Stream Management - Delegates to BaseChatService
  // ===========================================================================

  /**
   * Abort an active stream by stream key.
   *
   * @param streamKey - The unique stream identifier
   * @returns True if the stream was found and aborted, false otherwise
   */
  abortStream(streamKey: string): boolean {
    return this.baseChatService.abortStream(streamKey);
  }

  /**
   * Abort all active streams for a user.
   *
   * @param userId - The user identifier
   */
  abortUserStreams(userId: string): void {
    this.baseChatService.abortUserStreams(userId);
  }

  // ===========================================================================
  // Utility Methods - Exposed for backward compatibility
  // ===========================================================================

  /**
   * Validate that goal data has all required fields.
   * Exposed for backward compatibility.
   *
   * @param data - The goal data to validate
   * @returns True if all required fields are present
   */
  validateGoalData(data: any): boolean {
    return this.goalCreationChat.validateGoalData(data);
  }
}
