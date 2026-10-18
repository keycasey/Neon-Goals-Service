export type GoalKind = 'item' | 'finance' | 'action' | 'group';
export type PublicGoalStatus = 'active' | 'completed' | 'archived';

export type Money = {
  amountMinor: number;
  currency: string;
};

export type GoalSummary = {
  id: string;
  type: GoalKind;
  title: string;
  status: PublicGoalStatus;
  deadline: string | null;
  updatedAt: string;
};

export type CanonicalGoal = GoalSummary & {
  schemaVersion: '1';
  description: string | null;
  parentGoalId: string | null;
  createdAt: string;
  details: Record<string, unknown>;
  parent: GoalSummary | null;
  subgoals: GoalSummary[];
};

export type GoalResult = {
  schemaVersion: '1';
  goal: CanonicalGoal;
};

export type MutationResult = GoalResult & {
  applied: boolean;
  summary: string;
};

export type CreateGoalInput = {
  type: GoalKind;
  title: string;
  description?: string | null;
  deadline?: string | null;
  parentGoalId?: string | null;
  details: Record<string, unknown>;
  clientRequestId: string;
};

export type UpdateGoalInput = {
  goalId: string;
  title?: string;
  description?: string | null;
  deadline?: string | null;
  parentGoalId?: string | null;
  details?: Record<string, unknown>;
  clientRequestId: string;
  expectedUpdatedAt?: string;
};
