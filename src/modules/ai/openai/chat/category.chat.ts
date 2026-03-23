import { Injectable, Logger, Optional } from '@nestjs/common';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import { ConfigService } from '@nestjs/config';
import { BaseChatService, ChatResponse, StreamChunk } from './base-chat.service';
import { ThreadService } from '../thread/thread.service';
import { CommandParserService } from '../parsing/command-parser.service';
import { ProposalType } from '../parsing/command-parser.types';
import { PromptsService } from '../prompts/prompts.service';
import { PlaidService } from '../../../plaid/plaid.service';
import { AiToolsService } from '../../ai-tools.service';
import { getSpecialistPrompt } from '../../specialist-prompts';
import { AiModelsService } from '../../ai-models.service';
import { ThreadHistory } from '../thread/thread.types';
import { DspyWorkerService } from '../dspy-worker.service';
import { buildDspyChatResponse, DspyWorkerChatResponse } from './dspy-chat-contract';
import { buildAssistantResponseMetadata } from './chat-response-metadata';

/**
 * Context for agent-routed messages
 */
export interface AgentContext {
  /** Whether this message is from an agent */
  isAgent: boolean;
  /** Source of the agent message */
  agentSource?: string;
}

/**
 * Service for handling category-specific chat conversations.
 *
 * Provides specialized chat for each goal category (items, finances, actions)
 * with category-specific prompts and tool integrations (e.g., Plaid for finances).
 */
@Injectable()
export class CategoryChat extends BaseChatService {
  protected override readonly logger = new Logger(CategoryChat.name);
  private openai: OpenAI;
  private readonly apiKey: string;

  /** In-memory cache of thread histories for category chats */
  private threadHistories = new Map<string, ThreadHistory>();

  constructor(
    private configService: ConfigService,
    threadService: ThreadService,
    promptsService: PromptsService,
    commandParserService: CommandParserService,
    private aiModelsService: AiModelsService,
    @Optional() private dspyWorkerService?: DspyWorkerService,
    @Optional() private plaidService?: PlaidService,
    @Optional() private aiToolsService?: AiToolsService,
  ) {
    super(threadService, promptsService, commandParserService);
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.openai = new OpenAI({ apiKey: this.apiKey });
  }

  /**
   * Handle a category chat message (non-streaming).
   *
   * Provides category-specific prompts and tool integrations:
   * - Finances: Includes Plaid transaction data and live balance tools
   * - Items: Includes product extraction and search capabilities
   * - Actions: Standard action goal coaching
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
    const dspyResponse = await this.tryDspyCategoryChat(
      userId,
      categoryId,
      message,
      categoryGoals,
      chatId,
    );
    if (dspyResponse) {
      return dspyResponse;
    }

    const threadId = `category_${categoryId}_${userId}`;

    // Check if we need to summarize before processing this message
    const shouldSummarize = await this.threadService.shouldSummarize(chatId);
    if (shouldSummarize) {
      this.logger.log(`Triggering summarization for chat ${chatId}`);
      await this.threadService.summarizeChat(chatId);
      this.threadHistories.delete(threadId);
    }

    // Load conversation history
    let history = this.threadHistories.get(threadId);
    if (!history) {
      const messages = await this.threadService.loadThreadHistory(threadId, userId, chatId);
      history = { messages };
      this.threadHistories.set(threadId, history);
    }

    try {
      const model = await this.aiModelsService.getModelForUser(userId);
      // Add user message
      history.messages.push({ role: 'user', content: message });

      // Get specialist prompt and build system prompt
      const systemPrompt = await this.buildSystemPrompt(userId, categoryId, categoryGoals, model.id);

      // Create messages
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history.messages,
      ];

      // Define tools for function calling (only for finances category)
      const tools = this.buildFunctionTools(categoryId);

      let response = await this.openai.chat.completions.create({
        model: model.apiModel,
        messages,
        tools,
        tool_choice: tools ? 'auto' : undefined,
      });

      // Handle tool calls if present
      let assistantMessage = response.choices[0]?.message;
      let finalContent = assistantMessage?.content || '';

      if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        const toolResult = await this.handleToolCalls(
          userId,
          history,
          assistantMessage,
          finalContent,
        );
        finalContent = toolResult.finalContent;

        // Make follow-up request with tool results
        const followUpMessages: ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...history.messages,
        ];

        const followUpResponse = await this.openai.chat.completions.create({
          model: model.apiModel,
          messages: followUpMessages,
        });

        finalContent = followUpResponse.choices[0]?.message?.content || '';
      }

      if (!finalContent) {
        throw new Error('No response from OpenAI');
      }

      // Add assistant response to history
      history.messages.push({ role: 'assistant', content: finalContent });

      // Parse structured commands BEFORE saving to include metadata
      const commands = this.commandParserService.sanitizeCommands(
        this.commandParserService.parseCommands(finalContent),
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

      // Save messages to database with chatId and metadata
      // Agent-routed messages are hidden from the chat UI
      const messageOptions = agentContext?.isAgent
        ? { source: 'agent', visible: false }
        : undefined;

      await this.threadService.saveMessages(threadId, userId, [
        { role: 'user', content: message },
        { role: 'assistant', content: finalContent, metadata: assistantMetadata },
      ], chatId, messageOptions);

      const apiResponse: ChatResponse = {
        content: this.commandParserService.cleanCommandsFromContent(finalContent),
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
      this.logger.error(`Category chat error (${categoryId}):`, error);
      throw error;
    }
  }

  /**
   * Handle a category chat message with streaming.
   *
   * Provides the same functionality as categoryChat but with real-time
   * streaming of response content.
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
    if (this.dspyWorkerService?.isAvailable()) {
      const dspyStreamKey = `category_${categoryId}_${userId}_${Date.now()}`;
      const dspyController = this.registerStream(dspyStreamKey);
      try {
        const dspyStream = await this.tryDspyCategoryChatStream(
          userId,
          categoryId,
          message,
          categoryGoals,
          chatId,
          dspyController.signal,
        );
        if (dspyStream) {
          yield* dspyStream;
          return;
        }
      } catch (error) {
        if (this.isAbortError(error)) {
          this.logger.log(`DSPy category stream aborted by user (${categoryId})`);
          yield { content: '', done: true };
          return;
        }
        this.logger.warn(`DSPy category stream failed, falling back (${categoryId}): ${error instanceof Error ? error.message : error}`);
      } finally {
        this.unregisterStream(dspyStreamKey);
      }
    }

    const threadId = `category_${categoryId}_${userId}`;
    const streamKey = `category_${categoryId}_${userId}_${Date.now()}`;

    // Check if we need to summarize before processing this message
    const shouldSummarize = await this.threadService.shouldSummarize(chatId);
    if (shouldSummarize) {
      this.logger.log(`Triggering summarization for chat ${chatId}`);
      await this.threadService.summarizeChat(chatId);
      this.threadHistories.delete(threadId);
    }

    // Load conversation history
    let history = this.threadHistories.get(threadId);
    if (!history) {
      const messages = await this.threadService.loadThreadHistory(threadId, userId, chatId);
      history = { messages };
      this.threadHistories.set(threadId, history);
    }

    // Create abort controller for this stream
    const controller = this.registerStream(streamKey);

    try {
      const model = await this.aiModelsService.getModelForUser(userId);
      // Add user message
      history.messages.push({ role: 'user', content: message });

      // Get specialist prompt and build system prompt
      const systemPrompt = await this.buildSystemPrompt(userId, categoryId, categoryGoals, model.id);

      // Create messages
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history.messages,
      ];

      // Define tools for function calling (only for finances category)
      const tools = this.buildFunctionTools(categoryId);

      const stream = await this.openai.chat.completions.create({
        model: model.apiModel,
        messages,
        tools,
        tool_choice: tools ? 'auto' : undefined,
        stream: true,
      }, {
        signal: controller.signal,
      });

      let fullContent = '';
      let toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        // Handle content
        if (delta?.content) {
          fullContent += delta.content;
          yield { content: delta.content, done: false };
        }

        // Handle tool calls (accumulate deltas)
        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;
            if (!toolCalls[index]) {
              toolCalls[index] = { id: '', name: '', arguments: '' };
            }
            if (toolCallDelta.id) {
              toolCalls[index].id = toolCallDelta.id;
            }
            if (toolCallDelta.function?.name) {
              toolCalls[index].name = toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              toolCalls[index].arguments += toolCallDelta.function.arguments;
            }
          }
        }
      }

      // Handle tool calls if present
      if (toolCalls.length > 0 && this.aiToolsService) {
        this.logger.log(`Processing ${toolCalls.length} tool calls in category chat`);

        // Add assistant message with tool calls to history
        history.messages.push({
          role: 'assistant',
          content: fullContent,
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });

        // Execute each tool call and collect results
        const toolResults = await this.executeToolCalls(userId, toolCalls);

        // Add tool results to messages
        for (const result of toolResults) {
          history.messages.push({
            role: 'tool' as const,
            tool_call_id: result.tool_call_id,
            content: result.content,
          });
        }

        // Make follow-up request with tool results (non-streaming for simplicity)
        const followUpMessages: ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...history.messages,
        ];

        const followUpResponse = await this.openai.chat.completions.create({
          model: model.apiModel,
          messages: followUpMessages,
        });

        const followUpContent = followUpResponse.choices[0]?.message?.content || '';
        fullContent = followUpContent;
        yield { content: followUpContent, done: false };
      }

      // Parse commands from the full response
      const commands = this.commandParserService.sanitizeCommands(
        this.commandParserService.parseCommands(fullContent),
      );
      const confirmableCommands =
        this.commandParserService.getCommandsRequiringConfirmation(commands);

      // Prepare final chunk
      const finalChunk: StreamChunk = {
        content: '',
        done: true,
      };

      // Build metadata for assistant message if proposal detected
      let assistantMetadata: any = undefined;
      if (commands.length > 0) {
        finalChunk.commands = commands;
        assistantMetadata = { commands };
      }
      if (confirmableCommands.length > 0) {
        finalChunk.goalPreview = this.commandParserService.generateGoalPreview(confirmableCommands);
        finalChunk.awaitingConfirmation = true;
        finalChunk.proposalType = this.commandParserService.getProposalTypeForCommand(confirmableCommands[0].type);
        assistantMetadata = {
          ...assistantMetadata,
          goalPreview: finalChunk.goalPreview,
          awaitingConfirmation: true,
          proposalType: finalChunk.proposalType,
        };
      }

      // Add assistant response to history
      history.messages.push({ role: 'assistant', content: fullContent });

      // Save messages to database with chatId and metadata
      await this.threadService.saveMessages(threadId, userId, [
        { role: 'user', content: message },
        { role: 'assistant', content: fullContent, metadata: assistantMetadata },
      ], chatId);

      yield finalChunk;
    } catch (error) {
      if (this.isAbortError(error)) {
        this.logger.log('Category stream aborted by user');
        yield { content: '', done: true };
        return;
      }
      this.logger.error(`Category stream error (${categoryId}):`, error);
      throw error;
    } finally {
      this.unregisterStream(streamKey);
    }
  }

  private async tryDspyCategoryChat(
    userId: string,
    categoryId: string,
    message: string,
    categoryGoals: any[],
    chatId: string,
  ): Promise<ChatResponse | null> {
    if (!this.dspyWorkerService?.isAvailable()) {
      return null;
    }

    const workerResponse = await this.getDspyCategoryWorkerResponse(
      userId,
      categoryId,
      message,
      categoryGoals,
      chatId,
    );
    if (!workerResponse) {
      return null;
    }

    const chatResponse = buildDspyChatResponse(workerResponse);
    return this.persistDspyCategoryResponse(userId, message, chatId, chatResponse, categoryId);
  }

  private async tryDspyCategoryChatStream(
    userId: string,
    categoryId: string,
    message: string,
    categoryGoals: any[],
    chatId: string,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<StreamChunk, void, unknown> | null> {
    if (!this.dspyWorkerService?.isAvailable()) {
      return null;
    }
    const persistedMessages = await this.buildDspyCategoryRecentMessages(
      userId,
      categoryId,
      message,
      chatId,
    );
    const request = {
      chatType: categoryId as 'items' | 'finances' | 'actions',
      userMessage: message,
      goals: categoryGoals,
      recentMessages: persistedMessages,
      userId,
      chatId,
      currentChatType: 'category',
    };

    const self = this;
    return (async function* () {
      let fullContent = '';
      let finalChunk: StreamChunk | null = null;

      for await (const chunk of self.dspyWorkerService.buildStreamChunks(request, signal)) {
        if (chunk.content) {
          fullContent += chunk.content;
        }

        if (chunk.done) {
          finalChunk = chunk;
          const persistedResponse = await self.persistDspyCategoryResponse(
            userId,
            message,
            chatId,
            {
              content: fullContent,
              commands: chunk.commands,
              redirectProposal: chunk.redirectProposal,
              goalIntent: chunk.goalIntent,
              matchedGoalId: chunk.matchedGoalId,
              matchedGoalTitle: chunk.matchedGoalTitle,
              targetCategory: chunk.targetCategory,
              toolScope: chunk.toolScope,
              goalPreview: chunk.goalPreview,
              awaitingConfirmation: chunk.awaitingConfirmation,
              proposalType: chunk.proposalType,
            },
            categoryId,
          );

          if (persistedResponse) {
            yield {
              ...chunk,
              content: '',
            };
          }
          continue;
        }

        yield chunk;
      }

      if (!finalChunk) {
        throw new Error(`DSPy worker stream completed without a terminal chunk (${categoryId})`);
      }
    })();
  }

  private async buildDspyCategoryRecentMessages(
    userId: string,
    categoryId: string,
    message: string,
    chatId: string,
  ): Promise<any[]> {
    const threadId = `category_${categoryId}_${userId}`;

    const shouldSummarize = await this.threadService.shouldSummarize(chatId);
    if (shouldSummarize) {
      this.logger.log(`Triggering summarization for chat ${chatId}`);
      await this.threadService.summarizeChat(chatId);
      this.threadHistories.delete(threadId);
    }

    let history = this.threadHistories.get(threadId);
    if (!history) {
      const messages = await this.threadService.loadThreadHistory(threadId, userId, chatId);
      history = { messages };
      this.threadHistories.set(threadId, history);
    }

    const persistedMessages = await this.threadService.loadChatHistoryWithMetadata(chatId, userId, 20);
    return [...persistedMessages, { role: 'user', content: message }];
  }

  private async getDspyCategoryWorkerResponse(
    userId: string,
    categoryId: string,
    message: string,
    categoryGoals: any[],
    chatId: string,
  ): Promise<DspyWorkerChatResponse | null> {
    const recentMessages = await this.buildDspyCategoryRecentMessages(
      userId,
      categoryId,
      message,
      chatId,
    );

    return this.dspyWorkerService.tryGenerateChat({
      chatType: categoryId as 'items' | 'finances' | 'actions',
      userMessage: message,
      goals: categoryGoals,
      recentMessages,
      userId,
      chatId,
      currentChatType: 'category',
    });
  }

  private async persistDspyCategoryResponse(
    userId: string,
    message: string,
    chatId: string,
    chatResponse: ChatResponse,
    categoryId: string,
  ): Promise<ChatResponse | null> {
    const threadId = `category_${categoryId}_${userId}`;
    let history = this.threadHistories.get(threadId);
    if (!history) {
      const messages = await this.threadService.loadThreadHistory(threadId, userId, chatId);
      history = { messages };
      this.threadHistories.set(threadId, history);
    }

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
    const cleanedContent = this.commandParserService.cleanCommandsFromContent(chatResponse.content);
    const assistantMetadata = buildAssistantResponseMetadata({
      commands,
      dspyMetadata: chatResponse,
      goalPreview,
      awaitingConfirmation:
        chatResponse.awaitingConfirmation || confirmableCommands.length > 0 || undefined,
      proposalType,
    });

    history.messages.push({ role: 'user', content: message });
    history.messages.push({ role: 'assistant', content: chatResponse.content });

    await this.threadService.saveMessages(threadId, userId, [
      { role: 'user', content: message },
      { role: 'assistant', content: chatResponse.content, metadata: assistantMetadata },
    ], chatId);

    const response: ChatResponse = {
      content: cleanedContent,
      commands,
      ...assistantMetadata,
      proposalType,
    };

    if (chatResponse.redirectProposal?.target === 'category' && chatResponse.targetCategory) {
      response.routed = true;
      response.specialist = chatResponse.targetCategory;
    }

    return response;
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  /**
   * Build the system prompt for a category chat.
   */
  private async buildSystemPrompt(
    userId: string,
    categoryId: string,
    categoryGoals: any[],
    modelId?: string,
  ): Promise<string> {
    const specialistPrompt = ['items', 'finances', 'actions'].includes(categoryId)
      ? getSpecialistPrompt(categoryId as 'items' | 'finances' | 'actions', modelId)
      : getSpecialistPrompt('items', modelId);

    let systemPrompt = `${specialistPrompt}

## User's ${categoryId.toUpperCase()} Goals

${this.promptsService.formatGoalList(categoryGoals)}

You can reference and modify these goals through conversational commands. Reference them by title when discussing.`;

    // Add transaction data for finances category
    if (categoryId === 'finances' && this.plaidService) {
      try {
        const transactionSummary = await this.plaidService.getTransactionSummaryForAI(userId);
        if (transactionSummary.totalTransactions > 0) {
          systemPrompt += `

## Recent Transaction Data

${transactionSummary.totalTransactions} transactions found across ${transactionSummary.accounts.length} accounts:

${transactionSummary.accounts.map(acc => `
**${acc.institutionName} - ${acc.accountName}** (${acc.transactionCount} transactions)
${acc.recentTransactions.map(t =>
  `- ${t.date}: ${t.merchantName} - $${t.amount} (${t.category})`
).join('\n')}
`).join('\n')}`;
        }
      } catch (error) {
        this.logger.warn('Failed to fetch transaction summary for AI context:', error);
        // Continue without transaction data on error
      }
    }

    return systemPrompt;
  }

  /**
   * Build function tools for OpenAI function calling.
   */
  private buildFunctionTools(categoryId: string): any[] | undefined {
    if (categoryId !== 'finances' || !this.aiToolsService) {
      return undefined;
    }

    return [
      {
        type: 'function' as const,
        function: {
          name: 'get_live_balance',
          description: 'Get current account balance from Plaid (live data)',
          parameters: {
            type: 'object',
            properties: {
              plaidAccountId: {
                type: 'string',
                description: 'Optional: specific account ID. If omitted, returns all accounts.',
              },
            },
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'get_live_transactions',
          description: 'Get recent transactions from Plaid (live data)',
          parameters: {
            type: 'object',
            properties: {
              plaidAccountId: {
                type: 'string',
                description: 'Optional: specific account ID. If omitted, returns all accounts.',
              },
              startDate: {
                type: 'string',
                description: 'Optional: start date (YYYY-MM-DD). Defaults to 30 days ago.',
              },
              endDate: {
                type: 'string',
                description: 'Optional: end date (YYYY-MM-DD). Defaults to today.',
              },
            },
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'analyze_all_spending_and_savings',
          description: 'Analyze spending and savings across all accounts. Provides personalized recommendations for improving savings rate.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
    ];
  }

  /**
   * Handle tool calls from the OpenAI response.
   */
  private async handleToolCalls(
    userId: string,
    history: ThreadHistory,
    assistantMessage: any,
    initialContent: string,
  ): Promise<{ finalContent: string }> {
    // Add assistant message with tool calls to history
    history.messages.push({
      role: 'assistant',
      content: initialContent,
      tool_calls: assistantMessage.tool_calls,
    });

    // Execute each tool call
    const toolMessages = await Promise.all(
      assistantMessage.tool_calls.map(async (toolCall: any) => {
        // Only handle function type tool calls
        if (toolCall.type !== 'function') {
          return {
            role: 'tool' as const,
            content: JSON.stringify({ error: 'Unknown tool type' }),
            tool_call_id: toolCall.id,
          };
        }

        const toolName = toolCall.function.name;
        let toolResult;

        try {
          const args = JSON.parse(toolCall.function.arguments || '{}');

          if (toolName === 'get_live_balance') {
            const result = await this.aiToolsService!.getLiveBalance(userId, args.plaidAccountId);
            toolResult = JSON.stringify(result);
          } else if (toolName === 'get_live_transactions') {
            const result = await this.aiToolsService!.getLiveTransactions(
              userId,
              args.plaidAccountId,
              args.startDate,
              args.endDate,
            );
            toolResult = JSON.stringify(result);
          } else if (toolName === 'analyze_all_spending_and_savings') {
            const result = await this.aiToolsService!.analyzeAllSpendingAndSavings(userId);
            toolResult = JSON.stringify(result);
          } else {
            toolResult = JSON.stringify({ error: 'Unknown tool' });
          }
        } catch (error: any) {
          toolResult = JSON.stringify({ error: error.message });
        }

        return {
          role: 'tool' as const,
          content: toolResult,
          tool_call_id: toolCall.id,
        };
      }),
    );

    // Add tool response messages to history
    for (const tm of toolMessages) {
      history.messages.push(tm);
    }

    return { finalContent: initialContent };
  }

  /**
   * Execute tool calls and return results.
   */
  private async executeToolCalls(
    userId: string,
    toolCalls: Array<{ id: string; name: string; arguments: string }>,
  ): Promise<Array<{ tool_call_id: string; content: string }>> {
    const toolResults: Array<{ tool_call_id: string; content: string }> = [];

    for (const toolCall of toolCalls) {
      try {
        let result: any;
        const args = JSON.parse(toolCall.arguments || '{}');

        if (toolCall.name === 'get_live_balance') {
          result = await this.aiToolsService!.getLiveBalance(userId, args.plaidAccountId);
        } else if (toolCall.name === 'get_live_transactions') {
          result = await this.aiToolsService!.getLiveTransactions(
            userId,
            args.plaidAccountId,
            args.startDate,
            args.endDate,
          );
        } else if (toolCall.name === 'analyze_all_spending_and_savings') {
          result = await this.aiToolsService!.analyzeAllSpendingAndSavings(userId);
        } else {
          result = { error: `Unknown tool: ${toolCall.name}` };
        }

        toolResults.push({
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
        this.logger.log(`Tool ${toolCall.name} executed successfully`);
      } catch (err: any) {
        this.logger.error(`Tool ${toolCall.name} failed:`, err);
        toolResults.push({
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: err.message || 'Tool execution failed' }),
        });
      }
    }

    return toolResults;
  }
}
