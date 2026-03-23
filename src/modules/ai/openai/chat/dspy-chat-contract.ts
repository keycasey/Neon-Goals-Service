import { buildAssistantResponseMetadata, DspyResponseMetadata } from './chat-response-metadata';
import { ChatResponse, StreamChunk } from './base-chat.service';
import { ParsedCommand, ProposalType } from '../parsing/command-parser.types';

export interface DspyWorkerChatResponse {
  content?: string;
  commands?: ParsedCommand[];
  metadata?: DspyResponseMetadata & {
    awaitingConfirmation?: boolean;
    proposalType?: ProposalType;
    goalPreview?: string;
  };
}

export interface DspyWorkerStreamEvent {
  content?: string;
  done: boolean;
  commands?: ParsedCommand[];
  metadata?: DspyWorkerChatResponse['metadata'];
  goalPreview?: string;
  awaitingConfirmation?: boolean;
  proposalType?: ProposalType;
}

function chunkText(text: string, maxChars = 180): string[] {
  const cleaned = text.trim();
  if (!cleaned) {
    return [];
  }

  const chunks: string[] = [];
  let buffer = '';

  for (const paragraph of cleaned.split('\n')) {
    const segment = paragraph.trim();
    if (!segment) {
      continue;
    }
    const candidate = buffer ? `${buffer}\n${segment}` : segment;
    if (candidate.length <= maxChars) {
      buffer = candidate;
      continue;
    }
    if (buffer) {
      chunks.push(buffer);
    }
    buffer = segment;
  }

  if (buffer) {
    chunks.push(buffer);
  }

  return chunks.length > 0 ? chunks : [cleaned];
}

export function buildDspyChatResponse(
  workerResponse: DspyWorkerChatResponse,
): ChatResponse {
  const commands = workerResponse.commands || [];
  const metadata = workerResponse.metadata || {};
  const assistantMetadata = buildAssistantResponseMetadata({
    commands,
    dspyMetadata: metadata,
    goalPreview: metadata.goalPreview,
    awaitingConfirmation: metadata.awaitingConfirmation,
    proposalType: metadata.proposalType,
  });

  return {
    content: workerResponse.content || '',
    commands,
    ...assistantMetadata,
  };
}

export function buildDspyStreamChunks(
  workerResponse: DspyWorkerChatResponse,
): StreamChunk[] {
  const response = buildDspyChatResponse(workerResponse);
  const chunks = chunkText(response.content);

  const streamChunks: StreamChunk[] = chunks.map((content) => ({
    content,
    done: false,
  }));

  streamChunks.push({
    content: '',
    done: true,
    commands: response.commands,
    redirectProposal: response.redirectProposal,
    goalIntent: response.goalIntent,
    matchedGoalId: response.matchedGoalId,
    matchedGoalTitle: response.matchedGoalTitle,
    targetCategory: response.targetCategory,
    toolScope: response.toolScope,
    goalPreview: response.goalPreview,
    awaitingConfirmation: response.awaitingConfirmation,
    proposalType: response.proposalType,
  });

  return streamChunks;
}

export function normalizeDspyStreamChunk(
  streamEvent: DspyWorkerStreamEvent,
): StreamChunk {
  if (!streamEvent.done) {
    return {
      content: streamEvent.content || '',
      done: false,
    };
  }

  const assistantMetadata = buildAssistantResponseMetadata({
    commands: streamEvent.commands || [],
    dspyMetadata: streamEvent.metadata || {},
    goalPreview: streamEvent.goalPreview,
    awaitingConfirmation: streamEvent.awaitingConfirmation,
    proposalType: streamEvent.proposalType,
  });

  return {
    content: streamEvent.content || '',
    done: true,
    ...assistantMetadata,
  };
}
