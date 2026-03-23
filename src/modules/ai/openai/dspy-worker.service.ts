import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildDspyChatResponse,
  DspyWorkerChatResponse,
  DspyWorkerStreamEvent,
  normalizeDspyStreamChunk,
} from './chat/dspy-chat-contract';
import { ChatResponse, StreamChunk } from './chat/base-chat.service';

export interface DspyChatRequest {
  chatType: 'overview' | 'items' | 'finances' | 'actions' | 'goal_view' | 'proposal' | 'redirect_judge';
  userMessage: string;
  conversationContext?: string;
  goals?: any[];
  recentMessages?: any[];
  currentGoal?: any;
  currentChatType?: string;
  userId?: string;
  chatId?: string;
  modelId?: string;
}

@Injectable()
export class DspyWorkerService {
  private readonly logger = new Logger(DspyWorkerService.name);
  private readonly workerUrl: string;
  private readonly timeoutMs: number;

  constructor(private configService: ConfigService) {
    this.workerUrl =
      this.configService.get<string>('DSPY_WORKER_URL') ||
      this.configService.get<string>('WORKER_URL') ||
      '';
    this.timeoutMs = this.configService.get<number>('DSPY_WORKER_TIMEOUT_MS', 30000);
  }

  isAvailable(): boolean {
    return !!this.workerUrl;
  }

  async generateChat(request: DspyChatRequest): Promise<DspyWorkerChatResponse> {
    if (!this.isAvailable()) {
      throw new Error('DSPy worker URL is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.workerUrl.replace(/\/$/, '')}/dspy/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`DSPy worker returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }

      return (await response.json()) as DspyWorkerChatResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  async tryGenerateChat(request: DspyChatRequest): Promise<DspyWorkerChatResponse | null> {
    try {
      return await this.generateChat(request);
    } catch (error) {
      this.logger.warn(`DSPy worker unavailable, using fallback: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  async buildChatResponse(request: DspyChatRequest): Promise<ChatResponse | null> {
    const workerResponse = await this.tryGenerateChat(request);
    if (!workerResponse) {
      return null;
    }
    return buildDspyChatResponse(workerResponse);
  }

  async *buildStreamChunks(
    request: DspyChatRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    if (!this.isAvailable()) {
      return;
    }

    const response = await fetch(`${this.workerUrl.replace(/\/$/, '')}/dspy/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(`DSPy worker stream returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) {
            continue;
          }

          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) {
            continue;
          }

          const event = JSON.parse(jsonStr) as DspyWorkerStreamEvent;
          yield normalizeDspyStreamChunk(event);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
