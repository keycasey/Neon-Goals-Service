import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiGoalChatController, AiOverviewController } from './ai-goal-creation.controller';
import { GoalCommandService } from './goal-command.service';
import { OpenAIService } from './openai.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../config/prisma.module';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [ConfigModule, PrismaModule, ScraperModule],
  controllers: [AiController, AiGoalChatController, AiOverviewController],
  providers: [AiService, GoalCommandService, OpenAIService],
  exports: [AiService, GoalCommandService, OpenAIService],
})
export class AiModule {}
