import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { GoalStatus, GoalType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { mapCanonicalGoal, mapGoalSummary } from './goal-contract.mapper';
import {
  CreateGoalInput,
  GoalResult,
  MutationResult,
  PublicGoalStatus,
  UpdateGoalInput,
} from './goal-contract.types';

const goalInclude = {
  itemData: true,
  financeData: true,
  actionData: { include: { tasks: { orderBy: { createdAt: 'asc' as const } } } },
  groupData: true,
  parentGoal: true,
  subgoals: { orderBy: { updatedAt: 'desc' as const } },
} satisfies Prisma.GoalInclude;

type Tx = Prisma.TransactionClient;
type MutationPayload = Omit<MutationResult, 'applied'>;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

export function hashMutationInput(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function money(value: unknown, name: string) {
  if (!value || typeof value !== 'object') {
    throw new BadRequestException(`${name} is required`);
  }
  const amountMinor = (value as any).amountMinor;
  const currency = (value as any).currency;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new BadRequestException(`${name}.amountMinor must be a non-negative integer`);
  }
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    throw new BadRequestException(`${name}.currency must be a three-letter uppercase code`);
  }
  return { amount: amountMinor / 100, currency };
}

@Injectable()
export class GoalApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  async listGoals(
    userId: string,
    filters: {
      type?: GoalType;
      status?: GoalStatus;
      updatedAfter?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 50);
    const where: Prisma.GoalWhereInput = { userId };
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.updatedAfter) where.updatedAt = { gt: new Date(filters.updatedAfter) };

    let cursor: { updatedAt: string; id: string } | undefined;
    if (filters.cursor) {
      try {
        cursor = JSON.parse(Buffer.from(filters.cursor, 'base64url').toString('utf8'));
      } catch {
        throw new BadRequestException('Invalid cursor');
      }
      if (
        !cursor ||
        typeof cursor.updatedAt !== 'string' ||
        typeof cursor.id !== 'string' ||
        !cursor.id ||
        Number.isNaN(Date.parse(cursor.updatedAt))
      ) {
        throw new BadRequestException('Invalid cursor');
      }
      const before = new Date(cursor.updatedAt);
      where.AND = [
        {
          OR: [
            { updatedAt: { lt: before } },
            { updatedAt: before, id: { lt: cursor.id } },
          ],
        },
      ];
    }

    const rows = await this.prisma.goal.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const last = selected[selected.length - 1];

    return {
      schemaVersion: '1' as const,
      goals: selected.map(mapGoalSummary),
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({ updatedAt: last.updatedAt.toISOString(), id: last.id }),
            ).toString('base64url')
          : null,
    };
  }

  async getGoal(userId: string, goalId: string): Promise<GoalResult> {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
      include: goalInclude,
    });
    if (!goal) throw new NotFoundException('Goal not found');
    return { schemaVersion: '1', goal: mapCanonicalGoal(goal) };
  }

  async createGoal(userId: string, input: CreateGoalInput): Promise<MutationResult> {
    return this.withIdempotency(userId, 'create_goal', input.clientRequestId, input, async (tx) => {
      await this.validateParent(tx, userId, input.parentGoalId);
      const common = {
        userId,
        type: input.type as GoalType,
        title: input.title,
        description: input.description ?? '',
        deadline: input.deadline ? new Date(input.deadline) : null,
        parentGoalId: input.parentGoalId ?? null,
      };
      const details = input.details ?? {};
      let goal: any;

      if (input.type === 'item') {
        const target = money((details as any).target, 'details.target');
        goal = await tx.goal.create({
          data: {
            ...common,
            itemData: {
              create: {
                productImage: null,
                bestPrice: target.amount,
                currency: target.currency,
                retailerUrl: '',
                retailerName: 'Search',
                statusBadge: 'pending_search',
                searchTerm: (details as any).searchTerm ?? input.title,
                category: (details as any).category ?? 'general',
                searchFilters: ((details as any).preferences ?? undefined) as Prisma.InputJsonValue,
              },
            },
          },
          include: goalInclude,
        });
      } else if (input.type === 'finance') {
        const target = money((details as any).target, 'details.target');
        const current = money(
          (details as any).current ?? { amountMinor: 0, currency: target.currency },
          'details.current',
        );
        if (target.currency !== current.currency) {
          throw new BadRequestException('Current and target currencies must match');
        }
        goal = await tx.goal.create({
          data: {
            ...common,
            financeData: {
              create: {
                institutionIcon: '',
                accountName: (details as any).sourceLabel ?? input.title,
                currentBalance: current.amount,
                targetBalance: target.amount,
                currency: target.currency,
                progressHistory: [current.amount],
              },
            },
          },
          include: goalInclude,
        });
      } else if (input.type === 'action') {
        const tasks = Array.isArray((details as any).tasks) ? (details as any).tasks : [];
        goal = await tx.goal.create({
          data: {
            ...common,
            actionData: {
              create: {
                motivation: (details as any).motivation ?? null,
                completionPercentage: this.taskPercentage(tasks),
                tasks: {
                  create: tasks.map((task: any) => ({
                    title: task.title,
                    completed: task.completed ?? false,
                  })),
                },
              },
            },
          },
          include: goalInclude,
        });
      } else {
        goal = await tx.goal.create({
          data: {
            ...common,
            groupData: {
              create: {
                icon: (details as any).icon ?? null,
                color: (details as any).color ?? null,
                layout: (details as any).layout ?? 'grid',
                progressType: (details as any).progressType ?? 'average',
                progress: (details as any).progress ?? 0,
              },
            },
          },
          include: goalInclude,
        });
      }

      return this.payload(goal, `Created ${input.type} goal “${input.title}”.`);
    });
  }

  async updateGoal(userId: string, input: UpdateGoalInput): Promise<MutationResult> {
    return this.withIdempotency(userId, 'update_goal', input.clientRequestId, input, async (tx) => {
      const goal = await this.ownedGoal(tx, userId, input.goalId);
      await this.validateParent(tx, userId, input.parentGoalId, goal.id);

      const hasCommonChange = ['title', 'description', 'deadline', 'parentGoalId'].some(
        (key) => input[key as keyof UpdateGoalInput] !== undefined,
      );
      if (!hasCommonChange && (!input.details || !Object.keys(input.details).length)) {
        throw new BadRequestException('No goal changes supplied');
      }

      const base: Record<string, unknown> = {};
      for (const key of ['title', 'description', 'parentGoalId'] as const) {
        if (input[key] !== undefined) base[key] = input[key];
      }
      if (input.deadline !== undefined) {
        base.deadline = input.deadline ? new Date(input.deadline) : null;
      }
      await this.updateGoalRow(tx, userId, goal, input.expectedUpdatedAt, base);

      const details = input.details;
      if (details && Object.keys(details).length) {
        await this.updateDetails(tx, goal, details);
      }
      const updated = await this.ownedGoal(tx, userId, goal.id);
      return this.payload(updated, `Updated goal “${updated.title}”.`);
    });
  }

  async setGoalStatus(
    userId: string,
    input: {
      goalId: string;
      status: PublicGoalStatus;
      clientRequestId: string;
      expectedUpdatedAt?: string;
    },
  ): Promise<MutationResult> {
    return this.withIdempotency(userId, 'set_goal_status', input.clientRequestId, input, async (tx) => {
      const goal = await this.ownedGoal(tx, userId, input.goalId);
      await this.updateGoalRow(tx, userId, goal, input.expectedUpdatedAt, { status: input.status });
      const updated = await this.ownedGoal(tx, userId, goal.id);
      return this.payload(updated, `Set “${updated.title}” to ${input.status}.`);
    });
  }

  async addGoalTask(
    userId: string,
    input: { goalId: string; title: string; clientRequestId: string },
  ): Promise<MutationResult> {
    return this.withIdempotency(userId, 'add_goal_task', input.clientRequestId, input, async (tx) => {
      const goal = await this.ownedActionGoal(tx, userId, input.goalId);
      await tx.task.create({ data: { actionGoalId: goal.actionData.id, title: input.title } });
      await this.recalculateTasks(tx, goal.actionData.id);
      await tx.goal.update({ where: { id: goal.id }, data: { updatedAt: new Date() } });
      const updated = await this.ownedGoal(tx, userId, goal.id);
      return this.payload(updated, `Added task “${input.title}”.`);
    });
  }

  async updateGoalTask(
    userId: string,
    input: {
      goalId: string;
      taskId: string;
      title?: string;
      completed?: boolean;
      clientRequestId: string;
      expectedUpdatedAt?: string;
    },
  ): Promise<MutationResult> {
    return this.withIdempotency(userId, 'update_goal_task', input.clientRequestId, input, async (tx) => {
      const goal = await this.ownedActionGoal(tx, userId, input.goalId);
      await this.updateGoalRow(tx, userId, goal, input.expectedUpdatedAt, {});
      const task = goal.actionData.tasks.find((candidate: any) => candidate.id === input.taskId);
      if (!task) throw new NotFoundException('Task not found');
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.completed !== undefined) data.completed = input.completed;
      if (!Object.keys(data).length) throw new BadRequestException('No task changes supplied');
      await tx.task.update({ where: { id: task.id }, data });
      await this.recalculateTasks(tx, goal.actionData.id);
      const updated = await this.ownedGoal(tx, userId, goal.id);
      return this.payload(updated, `Updated task “${input.title ?? task.title}”.`);
    });
  }

  async removeGoalTask(
    userId: string,
    input: { goalId: string; taskId: string; clientRequestId: string },
  ): Promise<MutationResult> {
    return this.withIdempotency(userId, 'remove_goal_task', input.clientRequestId, input, async (tx) => {
      const goal = await this.ownedActionGoal(tx, userId, input.goalId);
      const task = goal.actionData.tasks.find((candidate: any) => candidate.id === input.taskId);
      if (!task) throw new NotFoundException('Task not found');
      await tx.task.delete({ where: { id: task.id } });
      await this.recalculateTasks(tx, goal.actionData.id);
      await tx.goal.update({ where: { id: goal.id }, data: { updatedAt: new Date() } });
      const updated = await this.ownedGoal(tx, userId, goal.id);
      return this.payload(updated, `Removed task “${task.title}”.`);
    });
  }

  private async updateDetails(tx: Tx, goal: any, details: Record<string, unknown>) {
    const allowed: Record<string, string[]> = {
      item: ['searchTerm', 'category', 'preferences', 'target'],
      finance: ['sourceLabel', 'current', 'target'],
      action: ['motivation'],
      group: ['icon', 'color', 'layout', 'progressType', 'progress'],
    };
    const invalid = Object.keys(details).filter((key) => !allowed[goal.type].includes(key));
    if (invalid.length) {
      throw new BadRequestException(
        `Fields ${invalid.join(', ')} do not apply to ${goal.type} goals`,
      );
    }

    if (goal.type === 'item') {
      const data: Record<string, unknown> = {};
      if (details.searchTerm !== undefined) data.searchTerm = details.searchTerm;
      if (details.category !== undefined) data.category = details.category;
      if (details.preferences !== undefined) data.searchFilters = details.preferences as Prisma.InputJsonValue;
      if (details.target !== undefined) {
        const target = money(details.target, 'details.target');
        data.bestPrice = target.amount;
        data.currency = target.currency;
      }
      await tx.itemGoalData.update({ where: { goalId: goal.id }, data });
    } else if (goal.type === 'finance') {
      const data: Record<string, unknown> = {};
      if (details.sourceLabel !== undefined) data.accountName = details.sourceLabel;
      const current = details.current !== undefined
        ? money(details.current, 'details.current')
        : undefined;
      const target = details.target !== undefined
        ? money(details.target, 'details.target')
        : undefined;
      if (current && target && current.currency !== target.currency) {
        throw new BadRequestException('Current and target currencies must match');
      }
      const requestedCurrency = current?.currency ?? target?.currency;
      if (
        requestedCurrency &&
        requestedCurrency !== goal.financeData.currency &&
        (!current || !target)
      ) {
        throw new BadRequestException(
          'Changing a finance goal currency requires both current and target amounts',
        );
      }
      if (details.current !== undefined) {
        data.currentBalance = current!.amount;
        data.currency = current!.currency;
      }
      if (details.target !== undefined) {
        data.targetBalance = target!.amount;
        data.currency = target!.currency;
      }
      await tx.financeGoalData.update({ where: { goalId: goal.id }, data });
    } else if (goal.type === 'action') {
      const data: Record<string, unknown> = {};
      if (details.motivation !== undefined) data.motivation = details.motivation;
      await tx.actionGoalData.update({ where: { goalId: goal.id }, data });
    } else {
      const data: Record<string, unknown> = {};
      for (const key of ['icon', 'color', 'layout', 'progressType', 'progress']) {
        if (details[key] !== undefined) data[key] = details[key];
      }
      await tx.groupGoalData.update({ where: { goalId: goal.id }, data });
    }
  }

  private async withIdempotency(
    userId: string,
    toolName: string,
    clientRequestId: string,
    input: unknown,
    operation: (tx: Tx) => Promise<MutationPayload>,
  ): Promise<MutationResult> {
    const inputHash = hashMutationInput(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.mcpMutation.findUnique({
          where: { userId_toolName_clientRequestId: { userId, toolName, clientRequestId } },
        });
        if (existing) return this.replay(existing, inputHash);

        const record = await tx.mcpMutation.create({
          data: {
            userId,
            toolName,
            clientRequestId,
            inputHash,
            input: stable(input) as Prisma.InputJsonValue,
          },
        });
        const payload = await operation(tx);
        await tx.mcpMutation.update({
          where: { id: record.id },
          data: { status: 'applied', result: payload as unknown as Prisma.InputJsonValue },
        });
        return { ...payload, applied: true };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.mcpMutation.findUnique({
          where: { userId_toolName_clientRequestId: { userId, toolName, clientRequestId } },
        });
        if (existing) return this.replay(existing, inputHash);
      }
      throw error;
    }
  }

  private replay(record: any, inputHash: string): MutationResult {
    if (record.inputHash !== inputHash) {
      throw new ConflictException('clientRequestId was already used with different input');
    }
    if (record.status !== 'applied' || !record.result) {
      throw new ConflictException('The original mutation is still being resolved; retry shortly');
    }
    return { ...(record.result as MutationPayload), applied: false };
  }

  private async ownedGoal(tx: Tx, userId: string, goalId: string) {
    const goal = await tx.goal.findFirst({ where: { id: goalId, userId }, include: goalInclude });
    if (!goal) throw new NotFoundException('Goal not found');
    return goal as any;
  }

  private async ownedActionGoal(tx: Tx, userId: string, goalId: string) {
    const goal = await this.ownedGoal(tx, userId, goalId);
    if (goal.type !== 'action' || !goal.actionData) {
      throw new BadRequestException('Goal is not an action goal');
    }
    return goal;
  }

  private async validateParent(tx: Tx, userId: string, parentGoalId?: string | null, goalId?: string) {
    if (parentGoalId === undefined || parentGoalId === null) return;
    if (parentGoalId === goalId) throw new BadRequestException('A goal cannot parent itself');
    const parent = await tx.goal.findFirst({ where: { id: parentGoalId, userId } });
    if (!parent) throw new NotFoundException('Parent goal not found');
    if (parent.type !== 'group') throw new BadRequestException('Parent goal must be a group goal');
    let ancestor = parent;
    for (let depth = 0; ancestor.parentGoalId && depth < 100; depth += 1) {
      if (ancestor.parentGoalId === goalId) {
        throw new BadRequestException('A goal cannot be moved beneath one of its descendants');
      }
      const next = await tx.goal.findFirst({
        where: { id: ancestor.parentGoalId, userId },
      });
      if (!next) break;
      ancestor = next;
    }
  }

  private async updateGoalRow(
    tx: Tx,
    userId: string,
    goal: any,
    expected: string | undefined,
    data: Record<string, unknown>,
  ) {
    const where: Prisma.GoalWhereInput = { id: goal.id, userId };
    if (expected) where.updatedAt = new Date(expected);
    const updated = await tx.goal.updateMany({
      where,
      data: { ...data, updatedAt: new Date() },
    });
    if (updated.count === 0) {
      const current = await this.ownedGoal(tx, userId, goal.id);
      throw new ConflictException({
        message: 'Goal changed since it was read',
        current: { schemaVersion: '1', goal: mapCanonicalGoal(current) },
      });
    }
  }

  private async recalculateTasks(tx: Tx, actionGoalId: string) {
    const tasks = await tx.task.findMany({ where: { actionGoalId } });
    await tx.actionGoalData.update({
      where: { id: actionGoalId },
      data: { completionPercentage: this.taskPercentage(tasks) },
    });
  }

  private taskPercentage(tasks: Array<{ completed?: boolean }>) {
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((task) => task.completed).length / tasks.length) * 100);
  }

  private payload(goal: any, summary: string): MutationPayload {
    return { schemaVersion: '1', goal: mapCanonicalGoal(goal), summary };
  }
}
