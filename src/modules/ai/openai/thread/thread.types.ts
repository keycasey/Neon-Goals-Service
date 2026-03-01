import { ChatCompletionMessageParam } from 'openai/resources';

/**
 * Represents the conversation history for a thread
 */
export interface ThreadHistory {
  messages: ChatCompletionMessageParam[];
}

/**
 * Response from creating a new thread
 */
export interface CreateThreadResponse {
  threadId: string;
}

/**
 * Message data for saving to the database
 */
export interface MessageData {
  role: string;
  content: string;
  metadata?: any;
}

/**
 * Options for saving messages
 */
export interface SaveMessagesOptions {
  source?: string;
  visible?: boolean;
}
