import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { GoalApplicationService } from '../goals/application/goal-application.service';
import { McpPrincipal } from './mcp-auth.guard';

const id = z.string().min(1).max(200);
const dateTime = z.string().datetime({ offset: true });
const money = z
  .object({
    amountMinor: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
const commonCreate = {
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  deadline: dateTime.nullable().optional(),
  parentGoalId: id.nullable().optional(),
  clientRequestId: id,
};

const itemCreateDetails = z.object({
  target: money,
  searchTerm: z.string().min(1).max(500).optional(),
  category: z.enum(['vehicle', 'vehicle_parts', 'technology', 'electronics', 'sporting_goods', 'clothing', 'apparel', 'pets', 'furniture', 'general']).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
}).strict();
const financeCreateDetails = z.object({
  target: money,
  current: money.optional(),
  sourceLabel: z.string().max(200).optional(),
}).strict();
const actionCreateDetails = z.object({
  motivation: z.string().max(5000).nullable().optional(),
  tasks: z.array(z.object({
    title: z.string().min(1).max(500),
    completed: z.boolean().optional(),
  }).strict()).max(100).optional(),
}).strict();
const groupCreateDetails = z.object({
  icon: z.string().max(100).nullable().optional(),
  color: z.string().max(100).nullable().optional(),
  layout: z.enum(['grid', 'list', 'kanban']).optional(),
  progressType: z.enum(['average', 'sum', 'manual']).optional(),
  progress: z.number().min(0).max(100).optional(),
}).strict();

// MCP tool input schemas must have an object root. Keep the type/details
// relationship as a refinement instead of a root discriminated union so
// clients receive a useful JSON Schema rather than `{ properties: {} }`.
const createGoalSchema = z.object({
  ...commonCreate,
  type: z.enum(['item', 'finance', 'action', 'group']),
  details: z.union([
    itemCreateDetails,
    financeCreateDetails,
    actionCreateDetails,
    groupCreateDetails,
  ]),
}).strict().superRefine((value, context) => {
  const schema = {
    item: itemCreateDetails,
    finance: financeCreateDetails,
    action: actionCreateDetails,
    group: groupCreateDetails,
  }[value.type];
  const result = schema.safeParse(value.details);
  if (!result.success) {
    context.addIssue({
      code: 'custom',
      path: ['details'],
      message: `details do not match ${value.type} goal fields`,
    });
  }
});

const updateDetailsSchema = z.object({
  searchTerm: z.string().min(1).max(500).optional(),
  category: z.enum(['vehicle', 'vehicle_parts', 'technology', 'electronics', 'sporting_goods', 'clothing', 'apparel', 'pets', 'furniture', 'general']).optional(),
  preferences: z.record(z.string(), z.unknown()).nullable().optional(),
  target: money.optional(),
  current: money.optional(),
  sourceLabel: z.string().max(200).optional(),
  motivation: z.string().max(5000).nullable().optional(),
  icon: z.string().max(100).nullable().optional(),
  color: z.string().max(100).nullable().optional(),
  layout: z.enum(['grid', 'list', 'kanban']).optional(),
  progressType: z.enum(['average', 'sum', 'manual']).optional(),
  progress: z.number().min(0).max(100).optional(),
}).strict();

function toolResult(value: unknown) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > 128 * 1024) {
    throw new Error('Tool response exceeds the 128 KiB MCP response limit');
  }
  return {
    content: [{ type: 'text' as const, text: serialized }],
    structuredContent: value as Record<string, unknown>,
  };
}

@Injectable()
export class McpServerFactory {
  constructor(private readonly goals: GoalApplicationService) {}

  create(principal: McpPrincipal) {
    const server = new McpServer(
      { name: 'neon-goals', version: '1.0.0' },
      { maxToolInputElements: 500 },
    );
    const canRead = principal.scopes.includes('goals:read') || principal.scopes.includes('goals:write');
    const canWrite = principal.scopes.includes('goals:write');

    if (canRead) {
      server.registerTool('list_goals', {
        title: 'List goals',
        description: 'List compact summaries of goals owned by the authenticated Neon Goals user.',
        inputSchema: z.object({
          type: z.enum(['item', 'finance', 'action', 'group']).optional(),
          status: z.enum(['active', 'completed', 'archived']).optional(),
          updatedAfter: dateTime.optional(),
          limit: z.number().int().min(1).max(50).optional(),
          cursor: z.string().max(2000).optional(),
        }).strict(),
        annotations: { readOnlyHint: true, openWorldHint: false },
      }, async (input) => toolResult(await this.goals.listGoals(principal.userId, input as any)));

      server.registerTool('get_goal', {
        title: 'Get goal',
        description: 'Read one complete goal owned by the authenticated Neon Goals user.',
        inputSchema: z.object({ goalId: id }).strict(),
        annotations: { readOnlyHint: true, openWorldHint: false },
      }, async ({ goalId }) => toolResult(await this.goals.getGoal(principal.userId, goalId)));
    }

    if (canWrite) {
      server.registerTool('create_goal', {
        title: 'Create goal',
        description: 'Immediately create a Neon Goals goal. The client handles any conversational confirmation. clientRequestId makes retries safe.',
        inputSchema: createGoalSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }, async (input) => toolResult(await this.goals.createGoal(principal.userId, input as any)));

      server.registerTool('update_goal', {
        title: 'Update goal',
        description: 'Correct common or type-specific fields on an existing goal. The goal type cannot be changed.',
        inputSchema: z.object({
          goalId: id,
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(5000).nullable().optional(),
          deadline: dateTime.nullable().optional(),
          parentGoalId: id.nullable().optional(),
          details: updateDetailsSchema.optional(),
          clientRequestId: id,
          expectedUpdatedAt: dateTime.optional(),
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }, async (input) => toolResult(await this.goals.updateGoal(principal.userId, input)));

      server.registerTool('set_goal_status', {
        title: 'Set goal status',
        description: 'Set a goal to active, completed, or archived. Archiving is reversible.',
        inputSchema: z.object({
          goalId: id,
          status: z.enum(['active', 'completed', 'archived']),
          clientRequestId: id,
          expectedUpdatedAt: dateTime.optional(),
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }, async (input) => toolResult(await this.goals.setGoalStatus(principal.userId, input)));

      server.registerTool('add_goal_task', {
        title: 'Add goal task',
        description: 'Add a task to an action goal and return the updated goal.',
        inputSchema: z.object({ goalId: id, title: z.string().min(1).max(500), clientRequestId: id }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }, async (input) => toolResult(await this.goals.addGoalTask(principal.userId, input)));

      server.registerTool('update_goal_task', {
        title: 'Update goal task',
        description: 'Set a task title or completion state explicitly. This never toggles state.',
        inputSchema: z.object({
          goalId: id,
          taskId: id,
          title: z.string().min(1).max(500).optional(),
          completed: z.boolean().optional(),
          clientRequestId: id,
          expectedUpdatedAt: dateTime.optional(),
        }).strict().refine((value) => value.title !== undefined || value.completed !== undefined, {
          message: 'title or completed is required',
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }, async (input) => toolResult(await this.goals.updateGoalTask(principal.userId, input)));

      server.registerTool('remove_goal_task', {
        title: 'Remove goal task',
        description: 'Permanently remove one task from an action goal. Prefer updating it unless removal is intended.',
        inputSchema: z.object({ goalId: id, taskId: id, clientRequestId: id }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      }, async (input) => toolResult(await this.goals.removeGoalTask(principal.userId, input)));
    }

    return server;
  }
}
