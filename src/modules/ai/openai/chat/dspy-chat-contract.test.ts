import { describe, expect, it } from 'bun:test';

import {
  buildDspyChatResponse,
  buildDspyStreamChunks,
} from './dspy-chat-contract';

describe('dspy chat contract', () => {
  it('maps worker metadata onto the chat response and final stream chunk', () => {
    const workerResponse = {
      content: 'I can route this for you.',
      commands: [
        {
          type: 'REDIRECT_TO_GOAL',
          data: {
            goalId: 'goal_7',
            goalTitle: 'Emergency Fund',
            message: 'I will take you there.',
          },
        },
      ],
      metadata: {
        redirectProposal: {
          target: 'goal',
          goalId: 'goal_7',
          goalTitle: 'Emergency Fund',
          message: 'I will take you there.',
        },
        goalIntent: 'route_to_goal',
        matchedGoalId: 'goal_7',
        matchedGoalTitle: 'Emergency Fund',
        targetCategory: 'finances',
        toolScope: ['overview', 'goal'],
      },
    };

    const response = buildDspyChatResponse(workerResponse);
    expect(response.redirectProposal).toEqual(workerResponse.metadata.redirectProposal);
    expect(response.goalIntent).toBe('route_to_goal');
    expect(response.matchedGoalId).toBe('goal_7');
    expect(response.matchedGoalTitle).toBe('Emergency Fund');
    expect(response.targetCategory).toBe('finances');
    expect(response.toolScope).toEqual(['overview', 'goal']);
    expect(response.awaitingConfirmation).toBe(true);
    expect(response.proposalType).toBe('accept_decline');

    const chunks = buildDspyStreamChunks(workerResponse);
    const finalChunk = chunks[chunks.length - 1];

    expect(finalChunk.done).toBe(true);
    expect(finalChunk.redirectProposal).toEqual(workerResponse.metadata.redirectProposal);
    expect(finalChunk.goalIntent).toBe('route_to_goal');
    expect(finalChunk.matchedGoalId).toBe('goal_7');
    expect(finalChunk.targetCategory).toBe('finances');
    expect(finalChunk.toolScope).toEqual(['overview', 'goal']);
    expect(finalChunk.commands).toEqual(workerResponse.commands);
  });
});
