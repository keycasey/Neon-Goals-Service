import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import OpenAI from 'openai';

/**
 * GreetingSummaryService generates summaries of agent-to-agent conversations
 * for when users visit specialist chats after routing has occurred.
 *
 * This service lives in AiModule to avoid circular dependency with ChatsModule.
 */
@Injectable()
export class GreetingSummaryService {
  private readonly logger = new Logger(GreetingSummaryService.name);
  private openai: OpenAI;
  private readonly apiKey: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.openai = new OpenAI({ apiKey: this.apiKey });
  }

  /**
   * Generate a greeting summary if there are new agent messages since the last visit.
   * Returns the summary text if generated, null if no new agent messages.
   */
  async generateGreetingSummaryIfNeeded(
    chatId: string,
    userId: string,
  ): Promise<string | null> {
    // Load ChatState to check last greeting summary time
    const chatState = await this.prisma.chatState.findUnique({
      where: { id: chatId },
    });

    if (!chatState) {
      this.logger.warn(`ChatState not found: ${chatId}`);
      return null;
    }

    const sinceDate = chatState.lastGreetingSummaryAt || chatState.createdAt;

    // Query for hidden agent messages since last summary
    const agentMessages = await this.prisma.message.findMany({
      where: {
        chatId,
        source: 'agent',
        visible: false,
        createdAt: { gt: sinceDate },
      },
      orderBy: { createdAt: 'asc' },
      take: 50, // Limit to prevent overly long summaries
    });

    if (agentMessages.length === 0) {
      this.logger.log(`No new agent messages for chat ${chatId}`);
      return null;
    }

    this.logger.log(
      `Found ${agentMessages.length} agent messages for chat ${chatId}, generating summary`,
    );

    // Format conversation for summary
    const conversationText = agentMessages
      .map((m) => `${m.role === 'user' ? 'You (via Overview)' : 'Wealth Advisor'}: ${m.content}`)
      .join('\n\n');

    try {
      // Generate greeting summary
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-nano',
        messages: [
          {
            role: 'system',
            content: `You are a financial assistant providing a brief greeting summary.

The user was chatting with the Overview AI, which routed questions to you (the Finance/Wealth Specialist).
Generate a natural, friendly 2-3 sentence greeting that summarizes what was discussed.

Guidelines:
- Start with "While you were away..." or similar natural phrasing
- Mention the key topics discussed (spending, savings, goals, etc.)
- Keep it brief and conversational
- Don't repeat the full conversation - just summarize the key points
- End with an open question to continue the conversation

Example:
"While you were away, we looked at your spending patterns and discussed your emergency fund progress. You've saved $750 so far toward your $10,000 goal. Would you like to review your spending by category, or focus on ramping up your savings rate?"`,
          },
          {
            role: 'user',
            content: `Here's the conversation that happened while the user was away:\n\n${conversationText}\n\nGenerate a brief greeting summary for when they return.`,
          },
        ],
        max_tokens: 300,
      });

      const summary = response.choices[0]?.message?.content?.trim();

      if (!summary) {
        this.logger.warn('Empty summary returned from OpenAI');
        return null;
      }

      // Save the summary as a visible system message
      await this.prisma.message.create({
        data: {
          userId,
          chatId,
          role: 'assistant',
          source: 'system',
          visible: true,
          content: summary,
        },
      });

      // Update lastGreetingSummaryAt
      await this.prisma.chatState.update({
        where: { id: chatId },
        data: { lastGreetingSummaryAt: new Date() },
      });

      this.logger.log(`Greeting summary generated for chat ${chatId}`);

      return summary;
    } catch (error) {
      this.logger.error(`Failed to generate greeting summary: ${error.message}`);
      // Don't throw - continue without summary on error
      return null;
    }
  }
}
