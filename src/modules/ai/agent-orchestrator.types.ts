export type AgentConversationMode = 'single_agent' | 'group_chat';

export type AgentRunStatus = 'running' | 'completed' | 'blocked_for_clarification' | 'failed';

export type WorkItemKind =
  | 'answer_question'
  | 'create_goal'
  | 'update_goal'
  | 'extract_product'
  | 'external_task'
  | 'clarification';

export type AssignedAgent = 'orchestrator' | 'items' | 'finances' | 'actions' | 'goal_view' | 'openclaw';

export type WorkItemStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'failed';

export type AgentEventType = 'thought' | 'progress' | 'question' | 'result' | 'error';

export type AgentEventVisibility = 'hidden' | 'visible_in_group_mode' | 'visible';

export interface CreateWorkItemInput {
  kind: WorkItemKind;
  assignedAgent: AssignedAgent;
  input: unknown;
}

export interface CreateRunInput {
  userId: string;
  chatId: string;
  userMessageId: string;
  workItems: CreateWorkItemInput[];
}

export interface RecordAgentEventInput {
  runId: string;
  workItemId?: string;
  chatId: string;
  userId: string;
  agent: AssignedAgent;
  eventType: AgentEventType;
  content: string;
  visibility?: AgentEventVisibility;
}
