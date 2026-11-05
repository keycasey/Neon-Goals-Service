import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, mock } from 'bun:test';
import { WishlistService } from './wishlist.service';

const createService = () => {
  const mcpMutation = {
    findUnique: mock(async () => null as any),
    create: mock(async () => ({ id: 'mutation_1' })),
    update: mock(async () => ({})),
  };
  const prisma = {
    wishlistItem: {
      findMany: mock(async () => []),
      findFirst: mock(async () => ({ id: 'wish_1', userId: 'user_1' })),
      create: mock(async (args: any) => ({ id: 'wish_1', ...args.data })),
      update: mock(async (args: any) => ({ id: args.where.id, ...args.data })),
      delete: mock(async () => ({})),
    },
    mcpMutation,
    $transaction: mock(async (operation: (tx: any) => Promise<unknown>) => operation({
      wishlistItem: prisma.wishlistItem,
      mcpMutation,
    })),
  };
  return { service: new WishlistService(prisma as any), prisma };
};

describe('WishlistService', () => {
  it('scopes list reads to the authenticated user', async () => {
    const { service, prisma } = createService();
    await service.findAll('user_1');
    expect(prisma.wishlistItem.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      orderBy: [{ stage: 'asc' }, { updatedAt: 'desc' }],
    });
  });

  it('creates a low-commitment idea without invoking goal or scraper data', async () => {
    const { service, prisma } = createService();
    await service.create('user_1', {
      title: '  Bidet  ',
      notes: '  Warm water preferred  ',
      priority: 'interested',
    });
    expect(prisma.wishlistItem.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        title: 'Bidet',
        notes: 'Warm water preferred',
        targetBudget: undefined,
        currency: 'USD',
        priority: 'interested',
        stage: 'idea',
        earliestPurchaseDate: null,
      },
    });
  });

  it('does not reveal or mutate another user’s item', async () => {
    const { service, prisma } = createService();
    prisma.wishlistItem.findFirst.mockResolvedValueOnce(null as any);
    await expect(service.update('user_1', 'wish_other', { stage: 'ready' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.wishlistItem.update).not.toHaveBeenCalled();
  });

  it('creates an MCP wishlist item once and records the idempotent result', async () => {
    const { service, prisma } = createService();
    const result = await service.createFromMcp(
      'user_1',
      { title: '  Bidet  ', notes: '  Warm water  ' },
      'sticky-note-1',
    );
    expect(prisma.wishlistItem.create).toHaveBeenCalledTimes(1);
    expect(prisma.mcpMutation.create).toHaveBeenCalledTimes(1);
    expect(prisma.mcpMutation.update).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ applied: true, item: { id: 'wish_1', title: 'Bidet' } });
  });

  it('replays a completed MCP wishlist mutation without creating a duplicate', async () => {
    const { service, prisma } = createService();
    const first = await service.createFromMcp('user_1', { title: 'Bidet' }, 'sticky-note-1');
    const mutationWrite = prisma.mcpMutation.create.mock.calls[0][0];
    prisma.mcpMutation.findUnique.mockResolvedValueOnce({
      inputHash: mutationWrite.data.inputHash,
      status: 'applied',
      result: { schemaVersion: '1', item: first.item },
    });
    const replay = await service.createFromMcp('user_1', { title: 'Bidet' }, 'sticky-note-1');
    expect(prisma.wishlistItem.create).toHaveBeenCalledTimes(1);
    expect(replay).toMatchObject({ applied: false, item: { title: 'Bidet' } });
  });
});
