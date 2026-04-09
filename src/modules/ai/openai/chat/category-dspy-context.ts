export type CategoryDspyChatType = 'items' | 'finances' | 'actions';

export interface CategoryDspyContextInput {
  categoryId: CategoryDspyChatType;
  message: string;
  goals: any[];
  recentMessages: Array<{ role: string; content: string }>;
}

export interface CategoryDspyContext {
  chatType: CategoryDspyChatType;
  userMessage: string;
  goals: any[];
  recentMessages: Array<{ role: string; content: string }>;
  specialistContext?: {
    handoffReason: string;
    conversationSummary: string;
    toolScope: string[];
  };
}

export function buildCategoryDspyContext(input: CategoryDspyContextInput): CategoryDspyContext {
  const specialistContext =
    input.categoryId === 'finances'
      ? {
          handoffReason: 'user asked for finance specialist help',
          conversationSummary: input.recentMessages
            .map((entry) => `${entry.role}: ${entry.content}`)
            .join('\n'),
          toolScope: [input.categoryId],
        }
      : undefined;

  return {
    chatType: input.categoryId,
    userMessage: input.message,
    goals: input.goals,
    recentMessages: input.recentMessages,
    specialistContext,
  };
}
