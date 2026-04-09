import { describe, expect, it } from 'bun:test';

import { buildCategoryDspyContext } from './category-dspy-context';

describe('buildCategoryDspyContext', () => {
  it('builds a finance handoff payload with tool scope', () => {
    const result = buildCategoryDspyContext({
      categoryId: 'finances',
      message: 'How much am I saving each month?',
      goals: [{ id: 'goal-1', title: 'Emergency Fund', type: 'finance' }],
      recentMessages: [{ role: 'user', content: 'Help me budget better' }],
    });

    expect(result.specialistContext).toEqual({
      handoffReason: 'user asked for finance specialist help',
      conversationSummary: expect.stringContaining('Help me budget better'),
      toolScope: ['finances'],
    });
  });
});
