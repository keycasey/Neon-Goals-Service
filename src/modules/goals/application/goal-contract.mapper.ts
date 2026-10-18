import { CanonicalGoal, GoalSummary } from './goal-contract.types';

const minor = (value: number | null | undefined) =>
  Math.round((value ?? 0) * 100);

export function mapGoalSummary(goal: any): GoalSummary {
  return {
    id: goal.id,
    type: goal.type,
    title: goal.title,
    status: goal.status,
    deadline: goal.deadline?.toISOString?.() ?? null,
    updatedAt: goal.updatedAt.toISOString(),
  };
}

export function mapCanonicalGoal(goal: any): CanonicalGoal {
  let details: Record<string, unknown>;

  switch (goal.type) {
    case 'item':
      details = {
        searchTerm: goal.itemData?.searchTerm ?? null,
        category: goal.itemData?.category ?? null,
        target: {
          amountMinor: minor(goal.itemData?.bestPrice),
          currency: goal.itemData?.currency ?? 'USD',
        },
        preferences: goal.itemData?.searchFilters ?? null,
        statusBadge: goal.itemData?.statusBadge ?? 'pending_search',
      };
      break;
    case 'finance':
      details = {
        current: {
          amountMinor: minor(goal.financeData?.currentBalance),
          currency: goal.financeData?.currency ?? 'USD',
        },
        target: {
          amountMinor: minor(goal.financeData?.targetBalance),
          currency: goal.financeData?.currency ?? 'USD',
        },
        sourceLabel: goal.financeData?.accountName ?? null,
      };
      break;
    case 'action':
      details = {
        motivation: goal.actionData?.motivation ?? null,
        completionPercentage: goal.actionData?.completionPercentage ?? 0,
        tasks: (goal.actionData?.tasks ?? []).map((task: any) => ({
          id: task.id,
          title: task.title,
          completed: task.completed,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
        })),
      };
      break;
    case 'group':
      details = {
        icon: goal.groupData?.icon ?? null,
        color: goal.groupData?.color ?? null,
        layout: goal.groupData?.layout ?? 'grid',
        progressType: goal.groupData?.progressType ?? 'average',
        progress: goal.groupData?.progress ?? 0,
      };
      break;
    default:
      details = {};
  }

  return {
    schemaVersion: '1',
    ...mapGoalSummary(goal),
    description: goal.description ?? null,
    parentGoalId: goal.parentGoalId ?? null,
    createdAt: goal.createdAt.toISOString(),
    details,
    parent: goal.parentGoal ? mapGoalSummary(goal.parentGoal) : null,
    subgoals: (goal.subgoals ?? []).map(mapGoalSummary),
  };
}
