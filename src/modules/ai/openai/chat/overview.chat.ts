import { Injectable, Logger, Optional } from '@nestjs/common';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import { ConfigService } from '@nestjs/config';
import { BaseChatService, ChatResponse, StreamChunk } from './base-chat.service';
import { ThreadService } from '../thread/thread.service';
import { CommandParserService } from '../parsing/command-parser.service';
import { PromptsService } from '../prompts/prompts.service';
import { AgentRoutingService } from '../../agent-routing.service';
import { ThreadHistory } from '../thread/thread.types';

/**
 * Service for handling overview chat conversations.
 *
 * The overview chat provides a unified interface that:
 * - Has context of all user goals
 * - Can route to specialists for finance/items questions
 * - Can create new goals via structured commands
 */
@Injectable()
export class OverviewChat extends BaseChatService {
  protected override readonly logger = new Logger(OverviewChat.name);
  private openai: OpenAI;
  private readonly apiKey: string;

  /** In-memory cache of thread histories for overview chats */
  private threadHistories = new Map<string, ThreadHistory>();

  constructor(
    private configService: ConfigService,
    threadService: ThreadService,
    promptsService: PromptsService,
    commandParserService: CommandParserService,
    @Optional() private agentRoutingService?: AgentRoutingService,
  ) {
    super(threadService, promptsService, commandParserService);
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.openai = new OpenAI({ apiKey: this.apiKey });
  }

  /**
   * Handle an overview chat message (non-streaming).
   *
   * Routes to specialists for domain-specific queries, otherwise
   * handles directly with full goal context.
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
    // Route finance questions to the wealth advisor
    if (this.detectFinanceIntent(message, goals)) {
      return this.handleSpecialistRouting(userId, message, goals, chatId, 'finances');
    }

    // Route item-related queries (URLs, product links) to the items specialist
    if (this.detectItemsIntent(message, goals)) {
      return this.handleSpecialistRouting(userId, message, goals, chatId, 'items');
    }

    // Use a special thread ID for overview chat
    const threadId = `overview_${userId}`;

    // Check if we need to summarize before processing this message
    const shouldSummarize = await this.threadService.shouldSummarize(chatId);
    if (shouldSummarize) {
      this.logger.log(`Triggering summarization for chat ${chatId}`);
      await this.threadService.summarizeChat(chatId);
      // Clear the in-memory history to force reload with summaries
      this.threadHistories.delete(threadId);
    }

    // Load conversation history (includes summaries if available)
    let history = this.threadHistories.get(threadId);
    if (!history) {
      const messages = await this.threadService.loadThreadHistory(threadId, userId, chatId);
      history = { messages };
      this.threadHistories.set(threadId, history);
    }

    try {
      // Add user message
      history.messages.push({ role: 'user', content: message });

      // Create messages with goal context in system prompt
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: this.promptsService.getOverviewSystemPrompt(goals) },
        ...history.messages,
      ];

      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-nano',
        messages,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Add assistant response to history
      history.messages.push({ role: 'assistant', content });

      // Parse structured commands BEFORE saving to include metadata
      const commands = this.commandParserService.sanitizeCommands(
        this.commandParserService.parseCommands(content),
      );

      // Build metadata for assistant message if proposal detected
      let assistantMetadata: any = undefined;
      if (commands.length > 0) {
        assistantMetadata = {
          goalPreview: this.commandParserService.generateGoalPreview(commands),
          awaitingConfirmation: true,
          proposalType: this.commandParserService.getProposalTypeForCommand(commands[0].type),
          commands,
        };
      }

      // Save messages to database with chatId and metadata
      await this.threadService.saveMessages(threadId, userId, [
        { role: 'user', content: message },
        { role: 'assistant', content, metadata: assistantMetadata },
      ], chatId);

      const apiResponse: ChatResponse = {
        content: this.commandParserService.cleanCommandsFromContent(content),
        commands,
      };

      // Add confirmation data if commands exist
      if (commands.length > 0) {
        apiResponse.goalPreview = assistantMetadata.goalPreview;
        apiResponse.awaitingConfirmation = true;
        apiResponse.proposalType = assistantMetadata.proposalType;
      }

      return apiResponse;
    } catch (error) {
      this.logger.error('Overview chat error:', error);
      throw error;
    }
  }

  /**
   * Handle an overview chat message with streaming.
   *
   * Routes to specialists for domain-specific queries (non-streaming fallback),
   * otherwise streams the response with full goal context.
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
    // Route finance questions to the wealth advisor (non-streaming fallback)
    if (this.detectFinanceIntent(message, goals)) {
      yield { content: '*Consulting your Wealth Advisor...*\n\n', done: false };
      try {
        const result = await this.handleSpecialistRouting(userId, message, goals, chatId, 'finances');
        // Strip the routing indicator since we already yielded it
        const specialistContent = result.content.replace('*Consulting your Wealth Advisor...*\n\n', '');
        yield { content: specialistContent, done: false };
        const finalChunk: StreamChunk = { content: '', done: true };
        if (result.commands?.length) {
          finalChunk.commands = result.commands;
        }
        yield finalChunk;
      } catch (error) {
        yield { content: 'I tried consulting the Wealth Advisor but encountered an issue. Please try the Finance Specialist chat directly.', done: false };
        yield { content: '', done: true };
      }
      return;
    }

    // Route item-related queries to the items specialist
    if (this.detectItemsIntent(message, goals)) {
      yield { content: '*Consulting your Items Specialist...*\n\n', done: false };
      try {
        const result = await this.handleSpecialistRouting(userId, message, goals, chatId, 'items');
        // Strip the routing indicator since we already yielded it
        const specialistContent = result.content.replace('*Consulting your Items Specialist...*\n\n', '');
        yield { content: specialistContent, done: false };
        const finalChunk: StreamChunk = {
          content: '',
          done: true,
          routed: true,
          specialist: 'items',
        };
        if (result.commands?.length) {
          finalChunk.commands = result.commands;
        }
        if (result.extraction) {
          finalChunk.extraction = result.extraction;
        }
        yield finalChunk;
      } catch (error) {
        yield { content: 'I tried consulting the Items Specialist but encountered an issue. Please try the Items Specialist chat directly.', done: false };
        yield { content: '', done: true };
      }
      return;
    }

    const threadId = `overview_${userId}`;
    const streamKey = `overview_${userId}_${Date.now()}`;

    // Check if we need to summarize before processing this message
    const shouldSummarize = await this.threadService.shouldSummarize(chatId);
    if (shouldSummarize) {
      this.logger.log(`Triggering summarization for chat ${chatId}`);
      await this.threadService.summarizeChat(chatId);
      // Clear the in-memory history to force reload with summaries
      this.threadHistories.delete(threadId);
    }

    // Load conversation history (includes summaries if available)
    let history = this.threadHistories.get(threadId);
    if (!history) {
      const messages = await this.threadService.loadThreadHistory(threadId, userId, chatId);
      history = { messages };
      this.threadHistories.set(threadId, history);
    }

    // Create abort controller for this stream
    const controller = this.registerStream(streamKey);

    try {
      // Add user message
      history.messages.push({ role: 'user', content: message });

      // Create messages with goal context
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: this.promptsService.getOverviewSystemPrompt(goals) },
        ...history.messages,
      ];

      const stream = await this.openai.chat.completions.create({
        model: 'gpt-5-nano',
        messages,
        stream: true,
      }, {
        signal: controller.signal,
      });

      let fullContent = '';

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullContent += delta;
          yield { content: delta, done: false };
        }
      }

      // Parse commands from the full response
      const commands = this.commandParserService.sanitizeCommands(
        this.commandParserService.parseCommands(fullContent),
      );

      // Prepare final chunk
      const finalChunk: StreamChunk = {
        content: '',
        done: true,
      };

      // Build metadata for assistant message if proposal detected
      let assistantMetadata: any = undefined;
      // If commands were detected, add confirmation data
      if (commands.length > 0) {
        finalChunk.goalPreview = this.commandParserService.generateGoalPreview(commands);
        finalChunk.awaitingConfirmation = true;
        finalChunk.commands = commands;
        // Use proposalType from command data if present, otherwise derive from command type
        finalChunk.proposalType = commands[0]?.data?.proposalType ||
          this.commandParserService.getProposalTypeForCommand(commands[0].type);
        assistantMetadata = {
          goalPreview: finalChunk.goalPreview,
          awaitingConfirmation: true,
          proposalType: finalChunk.proposalType,
          commands,
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
        this.logger.log('Stream aborted by user');
        yield { content: '', done: true };
        return;
      }
      this.logger.error('Overview chat stream error:', error);
      throw error;
    } finally {
      // Clean up abort controller
      this.unregisterStream(streamKey);
    }
  }

  /**
   * Route a message to a specialist and return the combined response.
   * Saves messages to the overview chat history.
   *
   * @param userId - The user ID
   * @param message - The user's message
   * @param goals - Array of user's goals for context
   * @param chatId - The chat ID for persistence
   * @param specialist - The specialist to route to ('finances' or 'items')
   * @returns Response with content and optional commands
   */
  private async handleSpecialistRouting(
    userId: string,
    message: string,
    goals: any[],
    chatId: string,
    specialist: string,
  ): Promise<ChatResponse> {
    if (!this.agentRoutingService) {
      this.logger.warn('AgentRoutingService not available, falling back to direct response');
      return {
        content: 'I\'d love to help with that question, but the specialist is currently unavailable. Please try the specialist chat directly.',
      };
    }

    const threadId = `overview_${userId}`;

    // Load recent overview history for context (last 3 exchanges = 6 messages)
    let history = this.threadHistories.get(threadId);
    if (!history) {
      const messages = await this.threadService.loadThreadHistory(threadId, userId, chatId);
      history = { messages };
      this.threadHistories.set(threadId, history);
    }

    const recentMessages = history.messages.slice(-6);
    const contextSummary = recentMessages
      .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.substring(0, 200) : ''}`)
      .join('\n');

    // Specialist-specific configuration
    const specialistConfig: Record<string, { name: string; indicator: string; fallbackChat: string }> = {
      finances: { name: 'Wealth Advisor', indicator: 'Consulting your Wealth Advisor...', fallbackChat: 'Finance Specialist' },
      items: { name: 'Items Specialist', indicator: 'Consulting your Items Specialist...', fallbackChat: 'Items Specialist' },
      actions: { name: 'Actions Specialist', indicator: 'Consulting your Actions Specialist...', fallbackChat: 'Actions Specialist' },
    };
    const config = specialistConfig[specialist] || specialistConfig.items;

    try {
      // Route to specialist
      const result = await this.agentRoutingService.routeToSpecialist(
        userId,
        specialist,
        message,
        contextSummary,
      );

      // Prepend routing indicator to response
      const content = `*${config.indicator}*\n\n${result.content}`;

      // Add to overview history
      history.messages.push({ role: 'user', content: message });
      history.messages.push({ role: 'assistant', content });

      // Save to overview chat
      await this.threadService.saveMessages(threadId, userId, [
        { role: 'user', content: message },
        { role: 'assistant', content },
      ], chatId);

      const response: ChatResponse = {
        content: this.commandParserService.cleanCommandsFromContent(content),
        commands: result.commands,
        routed: true,
        specialist,
      };

      // Pass through extraction info if present (for items specialist)
      if (result.extraction) {
        response.extraction = result.extraction;
      }

      return response;
    } catch (error: any) {
      this.logger.error(`Specialist routing failed: ${error.message}`);
      return {
        content: `I tried consulting the ${config.name} but encountered an issue. You can ask your question directly in the ${config.fallbackChat} chat for the best response.`,
      };
    }
  }

  /**
   * Detect if user is asking a finance-related question.
   */
  private detectFinanceIntent(message: string, goals: any[]): boolean {
    const lower = message.toLowerCase();

    // Keyword matching
    const financeKeywords = [
      'budget', 'spending', 'savings', 'saving', 'invest', 'investment',
      'debt', 'transaction', 'transactions', 'bank', 'account balance',
      'income', 'expense', 'expenses', 'net worth', 'credit',
      'retirement', 'mortgage', 'loan', 'interest rate',
      'financial', 'money', 'afford',
    ];
    const hasKeyword = financeKeywords.some(kw => lower.includes(kw));

    // Pattern matching for finance questions
    const financePatterns = [
      /how much have i (spent|saved|earned)/,
      /can i afford/,
      /break\s*down\s*(my\s+)?spending/,
      /where('s| is| does) my money/,
      /what('s| is| are) my (balance|finances|accounts)/,
      /am i on track.*(saving|budget|financial)/,
      /spending (habits|patterns|breakdown)/,
    ];
    const matchesPattern = financePatterns.some(p => p.test(lower));

    // Finance goal title matching
    const financeGoals = goals.filter(g => g.type === 'finance');
    const referencesFinanceGoal = financeGoals.some(g =>
      lower.includes(g.title.toLowerCase()),
    );

    return hasKeyword || matchesPattern || referencesFinanceGoal;
  }

  /**
   * Detect if user is asking an item-related question.
   */
  private detectItemsIntent(message: string, goals: any[]): boolean {
    // Check for URLs (product links)
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    const hasUrls = urlRegex.test(message);

    if (hasUrls) {
      return true;
    }

    const lower = message.toLowerCase();

    // Pattern matching for item-related queries
    const itemsPatterns = [
      /i want to (buy|get|purchase)/,
      /looking (for|to buy)/,
      /find(ing)? (a |an )?(new |used )?(car|truck|vehicle|product|item)/,
      /compare.*(price|product|item)/,
      /how much (is|does|for) (this|the|a|an)/,
      /(product|item) link/,
      /extract.*(product|item|price)/,
    ];
    const matchesPattern = itemsPatterns.some(p => p.test(lower));

    // Item goal title matching
    const itemGoals = goals.filter(g => g.type === 'item');
    const referencesItemGoal = itemGoals.some(g =>
      lower.includes(g.title.toLowerCase()),
    );

    return matchesPattern || referencesItemGoal;
  }
}
