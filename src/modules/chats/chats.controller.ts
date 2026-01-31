import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ChatsService } from './chats.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private chatsService: ChatsService) {}

  @Get('creation')
  async getCreationChat(@CurrentUser('userId') userId: string) {
    return this.chatsService.getOrCreateCreationChat(userId);
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
    return this.chatsService.getChats(userId);
  }
}
