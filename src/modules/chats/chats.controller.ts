import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ChatsService } from './chats.service';
import { GreetingSummaryService } from '../ai/greeting-summary.service';
import { JwtOrApiKeyGuard } from '../../common/guards/jwt-or-api-key.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('chats')
@UseGuards(JwtOrApiKeyGuard)  // Allow either JWT or API key auth
export class ChatsController {
  constructor(
    private chatsService: ChatsService,
    private greetingSummaryService: GreetingSummaryService,
  ) {}

  @Get('creation')
  async getCreationChat(@CurrentUser('userId') userId: string) {
    return this.chatsService.getOrCreateCreationChat(userId);
  }

  @Get('overview')
  async getOverviewChat(@CurrentUser('userId') userId: string) {
    return this.chatsService.getOrCreateOverviewChat(userId);
  }

  @Get('category/:categoryId')
  async getCategoryChat(
    @Param('categoryId') categoryId: string,
    @CurrentUser('userId') userId: string,
  ) {
    const chat = await this.chatsService.getOrCreateCategoryChat(userId, categoryId);

    // Generate greeting summary if there are new agent messages since last visit
    const summary = await this.greetingSummaryService.generateGreetingSummaryIfNeeded(
      chat.id,
      userId,
    );

    // Mark chat as visited
    await this.chatsService.markChatVisited(chat.id);

    // If greeting was generated, re-fetch chat to include the new message
    if (summary) {
      return this.chatsService.getOrCreateCategoryChat(userId, categoryId);
    }

    return chat;
  }

  @Get('goal/:goalId')
  async getGoalChat(
    @Param('goalId') goalId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.chatsService.getGoalChat(userId, goalId);
  }

  @Post(':id/messages')
  async addMessage(
    @Param('id') chatId: string,
    @CurrentUser('userId') userId: string,
    @Body() data: { role: string; content: string },
  ) {
    const message = await this.chatsService.addMessage(
      chatId,
      userId,
      data.role,
      data.content,
    );

    // Update chat updatedAt
    await this.chatsService.setChatLoading(chatId, false);

    return message;
  }

  @Get()
  async getAllChats(@CurrentUser('userId') userId: string) {
    return this.chatsService.getChatsStructured(userId);
  }

  @Put(':chatId/messages/:messageId')
  async editMessage(
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
    @CurrentUser('userId') userId: string,
    @Body() data: { content: string },
  ) {
    // Note: chatId is validated in the service method
    const updatedMessage = await this.chatsService.editMessage(messageId, userId, data.content);
    return updatedMessage;
  }
}
