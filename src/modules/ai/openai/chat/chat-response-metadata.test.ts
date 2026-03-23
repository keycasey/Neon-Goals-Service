import { describe, expect, it } from 'bun:test';

import { buildAssistantResponseMetadata } from './chat-response-metadata';

describe('buildAssistantResponseMetadata', () => {
  it('preserves redirect proposal metadata and confirmation state', () => {
    const result = buildAssistantResponseMetadata({
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
      dspyMetadata: {
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
    });

    expect(result).toEqual({
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
      awaitingConfirmation: true,
      proposalType: 'accept_decline',
    });
  });
});
