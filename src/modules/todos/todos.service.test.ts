import { describe, expect, it, mock } from 'bun:test';
import { TodosService } from './todos.service';

function setup() {
  const todo = {
    findMany: mock(async () => []),
    findFirst: mock(async () => ({ id: 'todo-1', userId: 'user-1' })),
    create: mock(async ({ data }) => ({ id: 'todo-1', ...data })),
    update: mock(async ({ where, data }) => ({ id: where.id, userId: 'user-1', ...data })),
  };
  const mcpMutation = {
    findUnique: mock(async () => null as any),
    create: mock(async () => ({ id: 'mutation-1' })),
    update: mock(async () => ({})),
  };
  const prisma = {
    todo,
    mcpMutation,
    $transaction: (callback: (tx: any) => unknown) => callback({ todo, mcpMutation }),
  } as any;
  return { prisma, todo, mcpMutation, service: new TodosService(prisma) };
}

describe('TodosService', () => {
  it('scopes reads to the authenticated user', async () => {
    const { service, todo } = setup();
    await service.findAll('user-1', 'active');
    expect(todo.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'active' },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  });

  it('trims a lightweight todo on create', async () => {
    const { service } = setup();
    expect(await service.create('user-1', { title: '  Dusting  ', notes: '  shelves  ' })).toMatchObject({
      userId: 'user-1', title: 'Dusting', notes: 'shelves',
    });
  });

  it('creates an MCP todo once and records the result', async () => {
    const { service, todo, mcpMutation } = setup();
    const result = await service.createFromMcp('user-1', { title: 'Dusting' }, 'request-1');
    expect(result).toMatchObject({ applied: true, todo: { title: 'Dusting' } });
    expect(todo.create).toHaveBeenCalledTimes(1);
    expect(mcpMutation.update).toHaveBeenCalledTimes(1);
  });

  it('archives instead of deleting', async () => {
    const { service, todo } = setup();
    await service.archive('user-1', 'todo-1');
    expect(todo.update).toHaveBeenCalledWith({ where: { id: 'todo-1' }, data: { title: undefined, notes: undefined, status: 'archived' } });
  });
});
