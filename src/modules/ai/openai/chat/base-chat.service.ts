import { Injectable, Logger } from '@nestjs/common';
import { ChatCompletionMessageParam } from 'openai/resources';
import { ThreadService } from '../thread/thread.service';
import { CommandParserService } from '../parsing/command-parser.service';
import { PromptsService } from '../prompts/prompts.service';
import OpenAI from 'openai';
import { ProposalType } from '../parsing/command-parser.types';
import { RedirectProposalMetadata } from './chat-response-metadata';

/**
 * Types for streaming responses
 */
export interface StreamChunk {
  /** Content delta for streaming */
  content: string;
  /** Whether this is the final chunk */
  done: boolean;
  /** Goal preview for confirmation UI */
  goalPreview?: string;
  /** Whether awaiting user confirmation */
  awaitingConfirmation?: boolean;
  /** Type of proposal for UI rendering */
  proposalType?: ProposalType;
  /** Parsed commands from the response */
  commands?: any[];
  /** DSPy redirect proposal metadata */
  redirectProposal?: RedirectProposalMetadata;
  /** DSPy goal intent classification */
  goalIntent?: string;
  /** Matched goal ID from routing metadata */
  matchedGoalId?: string;
  /** Matched goal title from routing metadata */
  matchedGoalTitle?: string;
  /** Target category for redirects/routing */
  targetCategory?: string;
  /** Tool scope that should remain visible to the model */
  toolScope?: string[];
  /** Whether this was routed to a specialist */
  routed?: boolean;
  /** Which specialist handled this */
  specialist?: string;
  /** Extraction data for items specialist */
  extraction?: any;
}

/**
 * Response type for non-streaming chat methods
 */
export interface ChatResponse {
  /** The response content */
  content: string;
  /** Parsed commands from the response */
  commands?: any[];
  /** DSPy redirect proposal metadata */
  redirectProposal?: RedirectProposalMetadata;
  /** DSPy goal intent classification */
  goalIntent?: string;
  /** Matched goal ID from routing metadata */
  matchedGoalId?: string;
  /** Matched goal title from routing metadata */
  matchedGoalTitle?: string;
  /** Target category for redirects/routing */
  targetCategory?: string;
  /** Tool scope that should remain visible to the model */
  toolScope?: string[];
  /** Goal preview for confirmation UI */
  goalPreview?: string;
  /** Whether awaiting user confirmation */
  awaitingConfirmation?: boolean;
  /** Type of proposal for UI rendering */
  proposalType?: ProposalType;
  /** Whether this was routed to a specialist */
  routed?: boolean;
  /** Which specialist handled this */
  specialist?: string;
  /** Extraction data for items specialist */
  extraction?: any;
}

/**
 * Base service providing shared utilities for chat handlers.
 *
 * Provides:
 * - Abort controller management for stream cancellation
 * - Thread history management helpers
 * - OpenAI client configuration
 */
@Injectable()
export class BaseChatService {
  protected readonly logger = new Logger(BaseChatService.name);

  /** Track active streams for abort capability */
  protected activeStreams = new Map<string, AbortController>();

  constructor(
    protected threadService: ThreadService,
    protected promptsService: PromptsService,
    protected commandParserService: CommandParserService,
  ) {}

  /**
   * Abort an active stream by stream key.
   *
   * @param streamKey - The unique stream identifier
   * @returns True if the stream was found and aborted, false otherwise
   */
  abortStream(streamKey: string): boolean {
    const controller = this.activeStreams.get(streamKey);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(streamKey);
      return true;
    }
    return false;
  }

  /**
   * Abort all active streams for a user.
   *
   * @param userId - The user identifier
   */
  abortUserStreams(userId: string): void {
    for (const [streamKey, controller] of this.activeStreams.entries()) {
      if (streamKey.includes(userId)) {
        controller.abort();
        this.activeStreams.delete(streamKey);
      }
    }
  }

  /**
   * Register an abort controller for a stream.
   *
   * @param streamKey - The unique stream identifier
   * @returns The created abort controller
   */
  protected registerStream(streamKey: string): AbortController {
    const controller = new AbortController();
    this.activeStreams.set(streamKey, controller);
    return controller;
  }

  /**
   * Unregister an abort controller after stream completion.
   *
   * @param streamKey - The unique stream identifier
   */
  protected unregisterStream(streamKey: string): void {
    this.activeStreams.delete(streamKey);
  }

  /**
   * Build messages array for OpenAI API call.
   *
   * @param systemPrompt - The system prompt to use
   * @param history - Conversation history messages
   * @returns Complete messages array for API call
   */
  protected buildMessages(
    systemPrompt: string,
    history: ChatCompletionMessageParam[],
  ): ChatCompletionMessageParam[] {
    return [
      { role: 'system', content: systemPrompt },
      ...history,
    ];
  }

  /**
   * Process response content and extract commands.
   *
   * @param content - The raw response content
   * @returns Object with cleaned content and parsed commands
   */
  protected processResponse(content: string): {
    cleanedContent: string;
    commands: any[];
    goalPreview?: string;
    awaitingConfirmation: boolean;
    proposalType?: string;
  } {
    const commands = this.commandParserService.sanitizeCommands(
      this.commandParserService.parseCommands(content),
    );
    const confirmableCommands =
      this.commandParserService.getCommandsRequiringConfirmation(commands);

    const cleanedContent = this.commandParserService.cleanCommandsFromContent(content);

    if (confirmableCommands.length > 0) {
      const goalPreview = this.commandParserService.generateGoalPreview(confirmableCommands);
      const proposalType = this.commandParserService.getProposalTypeForCommand(confirmableCommands[0].type);

      return {
        cleanedContent,
        commands,
        goalPreview,
        awaitingConfirmation: true,
        proposalType,
      };
    }

    return {
      cleanedContent,
      commands,
      awaitingConfirmation: false,
    };
  }

  /**
   * Check if an error is an abort error from stream cancellation.
   *
   * @param error - The error to check
   * @returns True if this is an abort error
   */
  protected isAbortError(error: any): boolean {
    return error.name === 'AbortError';
  }
}
