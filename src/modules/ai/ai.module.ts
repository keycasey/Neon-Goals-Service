import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiGoalChatController, AiOverviewController } from './ai-goal-creation.controller';
import { SpecialistController } from './specialist.controller';
import { GoalCommandService } from './goal-command.service';
import { GoalModificationService } from './goal-modification.service';
import { OpenAIModule } from './openai/openai.module';
import { ConversationSummaryService } from './conversation-summary.service';
import { AgentRoutingModule } from './agent-routing.module';
import { GreetingSummaryService } from './greeting-summary.service';
import { AiToolsService } from './ai-tools.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../config/prisma.module';
import { ScraperModule } from '../scraper/scraper.module';
import { ChatsModule } from '../chats/chats.module';
import { AuthModule } from '../auth/auth.module';
import { PlaidModule } from '../plaid/plaid.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { ProjectionsModule } from '../projections/projections.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ScraperModule,
    forwardRef(() => ChatsModule),
    AuthModule,
    PlaidModule,
    ProjectionsModule,
    HttpModule,
    ExtractionModule,
    AgentRoutingModule,
    OpenAIModule,
  ],
  controllers: [AiController, AiGoalChatController, AiOverviewController, SpecialistController],
  providers: [
    AiService,
    GoalCommandService,
    GoalModificationService,
    ConversationSummaryService,
    GreetingSummaryService,
    AiToolsService,
    RateLimitService,
  ],
  exports: [
    AiService,
    GoalCommandService,
    GoalModificationService,
    ConversationSummaryService,
    GreetingSummaryService,
    AiToolsService,
    RateLimitService,
    // OpenAIService is exported by OpenAIModule which we import
    // Consumers get it through the module import chain
  ],
})
export class AiModule {}
