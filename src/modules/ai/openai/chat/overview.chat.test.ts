import { describe, expect, it } from 'bun:test';
import { ConfigService } from '@nestjs/config';

import { OverviewChat } from './overview.chat';

const createOverviewChat = (options?: {
  agentRoutingService?: {
    routeToSpecialist: (...args: any[]) => Promise<any>;
  };
  openaiCreate?: (...args: any[]) => Promise<any>;
}) => {
  const threadService = {
    shouldSummarize: async () => false,
    summarizeChat: async () => undefined,
    loadThreadHistory: async () => [],
    saveMessages: async () => undefined,
  } as any;

  const promptsService = {
    getOverviewSystemPrompt: () => 'overview prompt',
  } as any;

  const commandParserService = {
    sanitizeCommands: (commands: any[]) => commands,
    parseCommands: () => [],
    getCommandsRequiringConfirmation: () => [],
    cleanCommandsFromContent: (content: string) => content,
    getProposalTypeForCommand: () => 'accept_decline',
    generateGoalPreview: () => 'preview',
  } as any;

  const aiModelsService = {
    getModelForUser: async () => ({ id: 'test-model', apiModel: 'gpt-test' }),
  } as any;

  const chat = new OverviewChat(
    { get: () => 'test-key' } as ConfigService,
    threadService,
    promptsService,
    commandParserService,
    aiModelsService,
    undefined,
    options?.agentRoutingService as any,
  );

  (chat as any).openai = {
    chat: {
      completions: {
        create: options?.openaiCreate ?? (async () => ({
          choices: [{ message: { content: 'overview fallback response' } }],
        })),
      },
    },
  };

  return chat;
};

describe('OverviewChat item routing', () => {
  it('falls back to the overview agent when item routing is unavailable', async () => {
    const chat = createOverviewChat();

    const response = await chat.overviewChat(
      'user-1',
      'I want to buy https://www.amazon.com/gp/product/B0FCS37JQ4',
      [],
      'chat-1',
    );

    expect(response.content).toBe('overview fallback response');
  });

  it('streams a best-effort overview response when item routing is unavailable', async () => {
    const chat = createOverviewChat({
      openaiCreate: async () => ({
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'overview ' } }] };
          yield { choices: [{ delta: { content: 'fallback' } }] };
        },
      }),
    });

    const chunks = [];
    for await (const chunk of chat.overviewChatStream(
      'user-1',
      'I want to buy https://www.amazon.com/gp/product/B0FCS37JQ4',
      [],
      'chat-1',
    )) {
      chunks.push(chunk);
    }

    expect(chunks.map((chunk: any) => chunk.content).join('')).toBe('overview fallback');
    expect(chunks.some((chunk: any) => chunk.content.includes('specialist is currently unavailable'))).toBe(false);
    expect(chunks.some((chunk: any) => chunk.content.includes('Consulting your Items Specialist'))).toBe(false);
  });

  it('routes to the items specialist when routing is available', async () => {
    const routeToSpecialist = async () => ({
      content: 'specialist response',
      routed: true,
      specialist: 'items',
    });
    const chat = createOverviewChat({
      agentRoutingService: { routeToSpecialist },
    });

    const response = await chat.overviewChat(
      'user-1',
      'I want to buy https://www.amazon.com/gp/product/B0FCS37JQ4',
      [],
      'chat-1',
    );

    expect(response.content).toContain('specialist response');
    expect(response.routed).toBe(true);
    expect(response.specialist).toBe('items');
  });
});
