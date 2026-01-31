import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiGoalCreationController, AiGoalChatController, AiOverviewController } from './ai-goal-creation.controller';
import { AiGoalCreationService } from './ai-goal-creation.service';
import { OpenAIService } from './openai.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AiController, AiGoalCreationController, AiGoalChatController, AiOverviewController],
  providers: [AiService, AiGoalCreationService, OpenAIService],
  exports: [AiService, AiGoalCreationService, OpenAIService],
})
export class AiModule {}
