import { Injectable } from '@nestjs/common';

/**
 * Service for detecting user intents from chat messages.
 * Provides pure functions to analyze message content and determine
 * routing to appropriate specialists or workflows.
 */
@Injectable()
export class IntentDetectorService {
  /**
   * Detect if the user wants to create a goal based on their message.
   * Analyzes the message for common phrases indicating goal creation intent.
   *
   * @param message - The user's message
   * @param aiResponse - The AI's response (currently unused but kept for future enhancement)
   * @returns True if goal creation intent is detected
   */
  detectGoalCreationIntent(message: string, aiResponse: string): boolean {
    const lowerMessage = message.toLowerCase();

    const goalCreationPhrases = [
      'create a goal',
      'create goal',
      'new goal',
      'add goal',
      'track a goal',
      'start a goal',
      'i want to',
      'i need to',
      'save for',
      'buy a',
      'learn to',
      'goal to',
    ];

    return goalCreationPhrases.some(phrase => lowerMessage.includes(phrase));
  }

  /**
   * Detect if the user is asking a finance-related question that should route to the wealth advisor.
   * Uses keyword matching, pattern matching, and finance goal references.
   *
   * @param message - The user's message
   * @param goals - Array of user's goals to check for finance goal references
   * @returns True if finance intent is detected
   */
  detectFinanceIntent(message: string, goals: any[]): boolean {
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
   * Detect if the user is asking an item-related question that should route to the items specialist.
   * This includes URLs, product links, and buying intentions.
   *
   * @param message - The user's message
   * @param goals - Array of user's goals to check for item goal references
   * @returns True if items intent is detected
   */
  detectItemsIntent(message: string, goals: any[]): boolean {
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
