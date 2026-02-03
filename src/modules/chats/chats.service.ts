import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

const VALID_CATEGORIES = ['items', 'finances', 'actions'] as const;
type CategoryId = typeof VALID_CATEGORIES[number];

@Injectable()
export class ChatsService {
  constructor(private prisma: PrismaService) {}

  async getOrCreateCreationChat(userId: string) {
    let chat = await this.prisma.chatState.findFirst({
      where: {
        userId,
        type: 'creation',
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!chat) {
      // Create with welcome message
      chat = await this.prisma.chatState.create({
        data: {
          userId,
          type: 'creation',
          isLoading: false,
          messages: {
            create: {
              userId,
              role: 'assistant',
              content: "Hey there! 🌴 I'm your Goals-AF assistant. Ready to help you crush some goals?\n\nWhat would you like to work on today? I can help you with:\n\n• **Items** - Products you want to purchase\n• **Finances** - Money goals and tracking\n• **Actions** - Skills to learn or habits to build",
            },
          },
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    }

    return chat;
  }

  async getGoalChat(userId: string, goalId: string) {
    let chat = await this.prisma.chatState.findFirst({
      where: {
        userId,
        type: 'goal',
        goalId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!chat) {
      chat = await this.prisma.chatState.create({
        data: {
          userId,
          type: 'goal',
          goalId,
          isLoading: false,
          messages: {
            create: [
              {
                userId,
                role: 'assistant',
                content: `I'm here to help you with this goal! What would you like to know or do?`,
              },
            ],
          },
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    }

    return chat;
  }

  async addMessage(chatId: string, userId: string, role: string, content: string) {
    const message = await this.prisma.message.create({
      data: {
        userId,
        chatId,
        role,
        content,
      },
    });

    return message;
  }

  async setChatLoading(chatId: string, isLoading: boolean) {
    return this.prisma.chatState.update({
      where: { id: chatId },
      data: { isLoading },
    });
  }

  async getChats(userId: string) {
    return this.prisma.chatState.findMany({
      where: { userId },
      include: {
        goal: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Get or create the Overview Chat for a user
   * Overview chat is unique per user (no categoryId, no goalId)
   */
  async getOrCreateOverviewChat(userId: string) {
    // Agent users (API key auth) get a mock response without database operations
    if (userId === 'agent') {
      return {
        id: 'agent-mock-overview',
        type: 'overview',
        categoryId: null,
        goalId: null,
        isLoading: false,
        lastSummaryId: null,
        summaryCursor: null,
        userId: 'agent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [{
          id: 'agent-mock-message',
          role: 'assistant',
          content: 'Agent mode active. Use JWT authentication for user-specific chat features.',
          threadId: null,
          createdAt: new Date().toISOString(),
          userId: 'agent',
          chatId: 'agent-mock-overview',
        }],
      };
    }

    let chat = await this.prisma.chatState.findFirst({
      where: {
        userId,
        type: 'overview',
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!chat) {
      chat = await this.prisma.chatState.create({
        data: {
          userId,
          type: 'overview',
          isLoading: false,
          messages: {
            create: {
              userId,
              role: 'assistant',
              content: "Welcome to your Overview! 🌟 I can see all your goals and help you prioritize what to work on.\n\nWhat would you like to focus on today?",
            },
          },
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    }

    return chat;
  }

  /**
   * Get or create a Category Specialist Chat
   * categoryId must be 'items', 'finances', or 'actions'
   */
  async getOrCreateCategoryChat(userId: string, categoryId: string) {
    // Agent users (API key auth) get a mock response without database operations
    if (userId === 'agent') {
      const welcomeMessages = {
        items: "Agent mode active. Use JWT authentication for user-specific Items Specialist chat.",
        finances: "Agent mode active. Use JWT authentication for user-specific Finance Specialist chat.",
        actions: "Agent mode active. Use JWT authentication for user-specific Actions Specialist chat.",
      };

      return {
        id: `agent-mock-${categoryId}`,
        type: 'category',
        categoryId,
        goalId: null,
        isLoading: false,
        lastSummaryId: null,
        summaryCursor: null,
        userId: 'agent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [{
          id: `agent-mock-${categoryId}-message`,
          role: 'assistant',
          content: welcomeMessages[categoryId as keyof typeof welcomeMessages],
          threadId: null,
          createdAt: new Date().toISOString(),
          userId: 'agent',
          chatId: `agent-mock-${categoryId}`,
        }],
      };
    }

    // Validate categoryId
    if (!VALID_CATEGORIES.includes(categoryId as CategoryId)) {
      throw new NotFoundException(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    let chat = await this.prisma.chatState.findFirst({
      where: {
        userId,
        type: 'category',
        categoryId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!chat) {
      const welcomeMessages = {
        items: "Hey! I'm your Items Specialist. 🛍️ I can help you find the best products, compare prices, and time your purchases perfectly.\n\nWhat item are you looking for?",
        finances: "Hello! I'm your Finance Specialist. 💰 I'll help you manage your money goals, create savings plans, and make sure everything fits your budget.\n\nWhat financial goal can I help with?",
        actions: "Hi there! I'm your Actions Specialist. 🎯 I help you break down skills into learnable steps and build lasting habits.\n\nWhat action or skill are you working on?",
      };

      chat = await this.prisma.chatState.create({
        data: {
          userId,
          type: 'category',
          categoryId,
          isLoading: false,
          messages: {
            create: {
              userId,
              role: 'assistant',
              content: welcomeMessages[categoryId as CategoryId],
            },
          },
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    }

    return chat;
  }

  /**
   * Get all chats in structured format for agent discovery
   */
  async getChatsStructured(userId: string) {
    const chats = await this.prisma.chatState.findMany({
      where: { userId },
      include: {
        messages: {
          select: { id: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const overview = chats.find(c => c.type === 'overview');
    const categoryChats = chats.filter(c => c.type === 'category');
    const goalChats = chats.filter(c => c.type === 'goal');

    return {
      overview: overview ? {
        id: overview.id,
        type: overview.type,
        isLoading: overview.isLoading,
        lastSummaryId: overview.lastSummaryId,
        summaryCursor: overview.summaryCursor,
        messageCount: overview.messages.length,
      } : null,
      categories: {
        items: categoryChats.find(c => c.categoryId === 'items')?.id || null,
        finances: categoryChats.find(c => c.categoryId === 'finances')?.id || null,
        actions: categoryChats.find(c => c.categoryId === 'actions')?.id || null,
      },
      goals: goalChats.map(c => ({
        goalId: c.goalId,
        chatId: c.id,
        messageCount: c.messages.length,
      })),
    };
  }

  /**
   * Edit a message and delete all subsequent messages
   * When user edits a message, all messages after it become invalid
   */
  async editMessage(messageId: string, userId: string, newContent: string) {
    // Fetch the message to verify ownership and get createdAt
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.userId !== userId) {
      throw new Error('You can only edit your own messages');
    }

    // Get the message's chatId
    const chatId = message.chatId;
    if (!chatId) {
      throw new Error('Cannot edit message without associated chat');
    }

    // Delete all messages after this one in the same chat
    await this.deleteMessagesAfter(chatId, message.createdAt);

    // Update the message content
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: newContent },
    });

    return updated;
  }

  /**
   * Delete all messages in a chat after a specific timestamp
   * Used when editing a message to invalidate subsequent messages
   */
  async deleteMessagesAfter(chatId: string, createdAt: Date) {
    return this.prisma.message.deleteMany({
      where: {
        chatId,
        createdAt: {
          gt: createdAt,
        },
      },
    });
  }
}
