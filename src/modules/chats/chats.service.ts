import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

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
}
