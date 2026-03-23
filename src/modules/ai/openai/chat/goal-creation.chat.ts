import { Injectable, Logger, Optional } from '@nestjs/common';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import { ConfigService } from '@nestjs/config';
import { BaseChatService, ChatResponse } from './base-chat.service';
import { ThreadService } from '../thread/thread.service';
import { CommandParserService } from '../parsing/command-parser.service';
import { ProposalType } from '../parsing/command-parser.types';
import { PromptsService } from '../prompts/prompts.service';
import { AiModelsService } from '../../ai-models.service';
import { ThreadHistory } from '../thread/thread.types';
import { DspyWorkerService } from '../dspy-worker.service';
import {
  buildDspyChatResponse,
  DspyWorkerChatResponse,
} from './dspy-chat-contract';
import { buildAssistantResponseMetadata } from './chat-response-metadata';

/**
 * Response from sendMessage includes content and optional goal data
 */
export interface SendMessageResponse extends ChatResponse {
  /** Whether this should enter goal creation mode */
  shouldEnterGoalCreation?: boolean;
  /** Extracted goal data from the conversation */
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
}

/**
 * Service for handling goal creation conversations.
 *
 * Manages the interactive goal creation flow where users provide
 * information and the AI guides them through creating a goal with
 * structured data extraction.
 */
@Injectable()
export class GoalCreationChat extends BaseChatService {
  protected override readonly logger = new Logger(GoalCreationChat.name);
  private openai: OpenAI;
  private readonly apiKey: string;

  /** In-memory cache of thread histories for goal creation */
  private threadHistories = new Map<string, ThreadHistory>();

  constructor(
    private configService: ConfigService,
    threadService: ThreadService,
    promptsService: PromptsService,
    commandParserService: CommandParserService,
    private aiModelsService: AiModelsService,
    @Optional() private dspyWorkerService?: DspyWorkerService,
  ) {
    super(threadService, promptsService, commandParserService);
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.openai = new OpenAI({ apiKey: this.apiKey });
  }

  /**
   * Send a message in the goal creation conversation.
   *
   * Handles the interactive goal creation flow:
   * 1. Adds user message to history
   * 2. Calls OpenAI with expert system prompt
   * 3. Extracts structured goal data if present (EXTRACT_DATA pattern)
   * 4. Saves messages to database
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
    // Load history from database if not in cache
    let history = this.threadHistories.get(threadId);
    if (!history) {
      const messages = await this.threadService.loadThreadHistory(threadId, userId);
      history = { messages };
      this.threadHistories.set(threadId, history);
    }

    try {
      const model = await this.aiModelsService.getModelForUser(userId);
      // Add user message to history
      history.messages.push({ role: 'user', content: message });

      // Create messages array with system prompt
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: this.promptsService.getExpertSystemPrompt(model.id) },
        ...history.messages,
      ];

      // Call OpenAI Chat Completion
      const response = await this.openai.chat.completions.create({
        model: model.apiModel,
        messages,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Add assistant response to history
      history.messages.push({ role: 'assistant', content });

      // Save both user and assistant messages to database
      await this.threadService.saveMessages(threadId, userId, [
        { role: 'user', content: message },
        { role: 'assistant', content },
      ]);

      // Check for structured data extraction (handles nested objects/arrays)
      const extractIndex = content.indexOf('EXTRACT_DATA:');
      if (extractIndex !== -1) {
        const extractionResult = this.extractGoalData(content, extractIndex);
        if (extractionResult) {
          const { goalData, cleanContent } = extractionResult;

          // Check if all required fields are present
          const hasRequiredFields = this.validateGoalData(goalData);

          if (hasRequiredFields) {
            const preview = this.commandParserService.generateGoalPreview(goalData);
            return {
              content: cleanContent || 'Does this look good?',
              goalData,
              awaitingConfirmation: true,
              goalPreview: preview,
            };
          }
        }
      }

      // Check if this should enter goal creation mode
      const shouldEnterGoalCreation = this.detectGoalCreationIntent(message, content);

      return {
        content,
        shouldEnterGoalCreation,
      };
    } catch (error) {
      this.logger.error('OpenAI API error:', error);
      throw error;
    }
  }

  /**
   * Continue conversation for an existing goal.
   *
   * Used when viewing/modifying an existing goal. Provides context
   * about the goal and enables commands for updates.
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
  ): Promise<ChatResponse> {
    const dspyResponse = await this.tryDspyGoalViewConversation(
      threadId,
      userId,
      message,
      goalContext,
    );
    if (dspyResponse) {
      return dspyResponse;
    }

    // Load history from database if not in cache
    let history = this.threadHistories.get(threadId);
    if (!history) {
      const messages = await this.threadService.loadThreadHistory(threadId, userId);
      history = { messages };
      this.threadHistories.set(threadId, history);
    }

    try {
      const model = await this.aiModelsService.getModelForUser(userId);
      // Add context about the goal
      const contextMessage = `[Goal Context: ${JSON.stringify(goalContext)}]

${message}`;

      history.messages.push({ role: 'user', content: contextMessage });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: this.promptsService.getGoalViewSystemPrompt(goalContext, model.id) },
        ...history.messages,
      ];

      const response = await this.openai.chat.completions.create({
        model: model.apiModel,
        messages,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      history.messages.push({ role: 'assistant', content });

      // Parse structured commands BEFORE saving to include metadata
      const commands = this.commandParserService.sanitizeCommands(
        this.commandParserService.parseCommands(content),
      );
      const confirmableCommands =
        this.commandParserService.getCommandsRequiringConfirmation(commands);

      // Build metadata for assistant message if proposal detected
      let assistantMetadata: any = undefined;
      if (commands.length > 0) {
        assistantMetadata = { commands };
      }
      if (confirmableCommands.length > 0) {
        assistantMetadata = {
          ...assistantMetadata,
          goalPreview: this.commandParserService.generateGoalPreview(confirmableCommands),
          awaitingConfirmation: true,
          proposalType: this.commandParserService.getProposalTypeForCommand(confirmableCommands[0].type),
        };
      }

      // Save messages to database with metadata
      await this.threadService.saveMessages(threadId, userId, [
        { role: 'user', content: contextMessage },
        { role: 'assistant', content, metadata: assistantMetadata },
      ]);

      const apiResponse: ChatResponse = {
        content: this.commandParserService.cleanCommandsFromContent(content),
        commands,
      };

      // Add confirmation data if commands exist
      if (confirmableCommands.length > 0) {
        apiResponse.goalPreview = assistantMetadata.goalPreview;
        apiResponse.awaitingConfirmation = true;
        apiResponse.proposalType = assistantMetadata.proposalType;
      }

      return apiResponse;
    } catch (error) {
      this.logger.error('OpenAI API error:', error);
      throw error;
    }
  }

  private async tryDspyGoalViewConversation(
    threadId: string,
    userId: string,
    message: string,
    goalContext: any,
  ): Promise<ChatResponse | null> {
    if (!this.dspyWorkerService?.isAvailable()) {
      return null;
    }

    let history = this.threadHistories.get(threadId);
    if (!history) {
      const messages = await this.threadService.loadThreadHistory(threadId, userId);
      history = { messages };
      this.threadHistories.set(threadId, history);
    }

    const contextMessage = `[Goal Context: ${JSON.stringify(goalContext)}]

${message}`;
    const recentMessages = [
      ...(await this.threadService.loadThreadHistoryWithMetadata(threadId, userId, 20)),
      { role: 'user', content: contextMessage },
    ];

    const workerResponse = await this.dspyWorkerService.tryGenerateChat({
      chatType: 'goal_view',
      userMessage: message,
      currentGoal: goalContext,
      recentMessages,
      userId,
      chatId: threadId,
    });

    if (!workerResponse) {
      return null;
    }

    const chatResponse = buildDspyChatResponse(workerResponse);
    const commands = this.commandParserService.sanitizeCommands(chatResponse.commands || []);
    const confirmableCommands = this.commandParserService.getCommandsRequiringConfirmation(commands);
    const goalPreview =
      confirmableCommands.length > 0
        ? this.commandParserService.generateGoalPreview(confirmableCommands)
        : chatResponse.goalPreview;
    const proposalType: ProposalType | undefined =
      chatResponse.proposalType ||
      (confirmableCommands.length > 0
        ? this.commandParserService.getProposalTypeForCommand(confirmableCommands[0].type)
        : undefined);
    const assistantMetadata = buildAssistantResponseMetadata({
      commands,
      dspyMetadata: chatResponse,
      goalPreview,
      awaitingConfirmation:
        chatResponse.awaitingConfirmation || confirmableCommands.length > 0 || undefined,
      proposalType,
    });

    history.messages.push({ role: 'user', content: contextMessage });
    history.messages.push({ role: 'assistant', content: chatResponse.content });

    await this.threadService.saveMessages(threadId, userId, [
      { role: 'user', content: contextMessage },
      { role: 'assistant', content: chatResponse.content, metadata: assistantMetadata },
    ]);

    return {
      content: this.commandParserService.cleanCommandsFromContent(chatResponse.content),
      commands,
      ...assistantMetadata,
      proposalType,
    };
  }

  /**
   * Validate that goal data has all required fields.
   *
   * @param data - The goal data to validate
   * @returns True if all required fields are present
   */
  validateGoalData(data: any): boolean {
    if (!data.goalType) return false;

    const requiredFields = {
      item: ['title', 'budget'],
      finance: ['title', 'targetBalance'],
      action: ['title', 'tasks'],
    };

    const required = requiredFields[data.goalType as keyof typeof requiredFields];
    if (!required) return false;

    return required.every(field => {
      const value = data[field];
      if (value === undefined || value === null) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'string') return value.trim().length > 0;
      return true;
    });
  }

  /**
   * Delete a thread (cleanup when goal creation is cancelled).
   *
   * @param threadId - The thread ID to delete
   */
  async deleteThread(threadId: string): Promise<void> {
    this.threadHistories.delete(threadId);
    this.logger.log(`Deleted thread ${threadId}`);
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  /**
   * Extract goal data from EXTRACT_DATA pattern in content.
   */
  private extractGoalData(
    content: string,
    extractIndex: number,
  ): { goalData: any; cleanContent: string } | null {
    try {
      // Find the JSON object by counting brace depth
      let startIndex = content.indexOf('{', extractIndex);
      if (startIndex === -1) return null;

      let depth = 0;
      let inString = false;
      let escapeNext = false;
      let endIndex = startIndex;

      for (let i = startIndex; i < content.length; i++) {
        const char = content[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') depth++;
          if (char === '}') depth--;

          if (depth === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }

      if (endIndex > startIndex) {
        const jsonStr = content.substring(startIndex, endIndex);
        const goalData = JSON.parse(jsonStr);
        const cleanContent = content.substring(0, extractIndex).trim() +
          content.substring(endIndex).trim();

        return { goalData, cleanContent };
      }
    } catch (e) {
      this.logger.error('Failed to parse extracted data:', e);
    }

    return null;
  }

  /**
   * Detect if user wants to create a goal from their message.
   */
  private detectGoalCreationIntent(message: string, aiResponse: string): boolean {
    const lowerMessage = message.toLowerCase();

    const goalCreationPhrases = [
      'create a goal',
      'create goal',
      'new goal',
      'add goal',
      'track a goal',
      'start a goal',
      'i want to',
      'i need to',
      'save for',
      'buy a',
      'learn to',
      'goal to',
    ];

    return goalCreationPhrases.some(phrase => lowerMessage.includes(phrase));
  }
}
