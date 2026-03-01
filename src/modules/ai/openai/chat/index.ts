/**
 * Chat Services Module
 *
 * Provides specialized chat handlers for different conversation contexts:
 * - BaseChatService: Shared utilities for abort management and response processing
 * - GoalCreationChat: Interactive goal creation with structured data extraction
 * - OverviewChat: Unified interface with goal context and specialist routing
 * - CategoryChat: Category-specific conversations with tool integrations
 */

export { BaseChatService, StreamChunk, ChatResponse } from './base-chat.service';
export { GoalCreationChat, SendMessageResponse } from './goal-creation.chat';
export { OverviewChat } from './overview.chat';
export { CategoryChat, AgentContext } from './category.chat';
