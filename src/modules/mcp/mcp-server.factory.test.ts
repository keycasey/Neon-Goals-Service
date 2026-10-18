import { describe, expect, it, mock } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServerFactory } from './mcp-server.factory';

async function connectedFactory(scopes: string[], overrides: Record<string, unknown> = {}) {
  const goals = {
    listGoals: mock(async () => ({ schemaVersion: '1', goals: [], nextCursor: null })),
    getGoal: mock(async () => ({ schemaVersion: '1', goal: { id: 'goal-1' } })),
    createGoal: mock(async () => ({ schemaVersion: '1', goal: { id: 'goal-1' }, applied: true, summary: 'created' })),
    updateGoal: mock(async () => ({})),
    setGoalStatus: mock(async () => ({})),
    addGoalTask: mock(async () => ({})),
    updateGoalTask: mock(async () => ({})),
    removeGoalTask: mock(async () => ({})),
    ...overrides,
  } as any;
  const server = new McpServerFactory(goals).create({ userId: 'user-1', grantId: 'grant-1', scopes });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server, goals };
}

describe('McpServerFactory', () => {
  it('only exposes read tools to a read-only grant', async () => {
    const { client, server } = await connectedFactory(['goals:read']);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(['get_goal', 'list_goals']);
    await client.close();
    await server.close();
  });

  it('exposes all eight v1 tools to a write grant', async () => {
    const { client, server } = await connectedFactory(['goals:write']);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      'add_goal_task',
      'create_goal',
      'get_goal',
      'list_goals',
      'remove_goal_task',
      'set_goal_status',
      'update_goal',
      'update_goal_task',
    ]);
    const createGoal = tools.tools.find((tool) => tool.name === 'create_goal');
    expect(createGoal?.inputSchema.type).toBe('object');
    expect(createGoal?.inputSchema.properties).toHaveProperty('type');
    expect(createGoal?.inputSchema.properties).toHaveProperty('title');
    expect(createGoal?.inputSchema.properties).toHaveProperty('details');
    expect(createGoal?.inputSchema.properties).toHaveProperty('clientRequestId');
    await client.close();
    await server.close();
  });

  it('passes the authenticated user boundary to tool handlers', async () => {
    const { client, server, goals } = await connectedFactory(['goals:read']);
    const result = await client.callTool({ name: 'get_goal', arguments: { goalId: 'goal-1' } });
    expect(goals.getGoal).toHaveBeenCalledWith('user-1', 'goal-1');
    expect(result.structuredContent).toEqual({ schemaVersion: '1', goal: { id: 'goal-1' } });
    await client.close();
    await server.close();
  });

  it('rejects unknown fields before calling the application service', async () => {
    const { client, server, goals } = await connectedFactory(['goals:write']);
    const result = await client.callTool({
      name: 'create_goal',
      arguments: {
        type: 'action',
        title: 'Ship it',
        details: {},
        clientRequestId: 'req-1',
        surprise: true,
      },
    });
    expect(result.isError).toBe(true);
    expect(goals.createGoal).not.toHaveBeenCalled();
    await client.close();
    await server.close();
  });
});
