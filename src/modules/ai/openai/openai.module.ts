import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../config/prisma.module';

// OpenAI sub-services
import { ThreadService } from './thread/thread.service';
import { PromptsService } from './prompts/prompts.service';
import { CommandParserService } from './parsing/command-parser.service';
import { BaseChatService } from './chat/base-chat.service';
import { GoalCreationChat } from './chat/goal-creation.chat';
import { OverviewChat } from './chat/overview.chat';
import { CategoryChat } from './chat/category.chat';
import { AiModelsService } from '../ai-models.service';

// Root orchestrator
import { OpenAIService } from './openai.service';

/**
 * OpenAI Module
 *
 * Provides all OpenAI-powered chat functionality through a modular architecture:
 *
 * **Core Services:**
 * - ThreadService: Thread management and message persistence
 * - PromptsService: System prompt generation for various contexts
 * - CommandParserService: Structured command parsing from AI responses
 *
 * **Chat Handlers:**
 * - BaseChatService: Shared utilities for abort management and response processing
 * - GoalCreationChat: Interactive goal creation with structured data extraction
 * - OverviewChat: Unified interface with goal context and specialist routing
 * - CategoryChat: Category-specific conversations with tool integrations
 *
 * **Root Orchestrator:**
 * - OpenAIService: Thin orchestrator that exposes the unified public API
 *
 * **Dependencies (injected from parent AiModule):**
 * - PrismaService: Database access for message persistence (via PrismaModule)
 * - ConversationSummaryService: Summary-aware context building
 * - AgentRoutingService: Optional specialist routing
 * - AiToolsService: Optional tool calling for finance data
 * - PlaidService: Optional financial data access
 *
 * Note: This module imports ConfigModule for ConfigService and PrismaModule
 * for database access. The optional services (AgentRoutingService, AiToolsService,
 * PlaidService, ConversationSummaryService) are provided by the parent AiModule
 * and injected via @Optional() decorators in the child services.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
  ],
  providers: [
    // Core services (no external dependencies except Prisma)
    ThreadService,
    PromptsService,
    CommandParserService,
    AiModelsService,

    // Base chat service
    BaseChatService,

    // Chat handlers
    GoalCreationChat,
    OverviewChat,
    CategoryChat,

    // Root orchestrator
    OpenAIService,
  ],
  exports: [
    // Export the root orchestrator for external use
    OpenAIService,
    // Also export sub-services for direct access if needed
    ThreadService,
    PromptsService,
    CommandParserService,
    AiModelsService,
    GoalCreationChat,
    OverviewChat,
    CategoryChat,
  ],
})
export class OpenAIModule {}
