import { describe, expect, it, mock } from 'bun:test';

import { ProjectionsController } from './projections.controller';

describe('ProjectionsController', () => {
  it('passes the authenticated user id to overview projections', async () => {
    const getOverview = mock((userId: string, horizon: number) => ({ userId, horizon }));
    const controller = new ProjectionsController({
      getOverview,
    } as any);

    const result = await controller.getOverview(
      { user: { userId: 'user_1' } } as any,
      '6' as any,
    );

    expect(getOverview).toHaveBeenCalledWith('user_1', 6);
    expect(result).toEqual({ userId: 'user_1', horizon: 6 });
  });

  it('passes merge requests through with the authenticated user id', async () => {
    const mergeRecurringItems = mock((userId: string, targetItemId: string, sourceItemId: string, direction: string) => ({
      userId,
      targetItemId,
      sourceItemId,
      direction,
    }));
    const controller = new ProjectionsController({
      getOverview: mock(() => ({})),
      mergeRecurringItems,
    } as any);

    const result = await controller.mergeRecurringItems(
      { user: { userId: 'user_1' } } as any,
      {
        targetItemId: 'target',
        sourceItemId: 'source',
        direction: 'expense',
      } as any,
    );

    expect(mergeRecurringItems).toHaveBeenCalledWith('user_1', 'target', 'source', 'expense');
    expect(result).toEqual({
      userId: 'user_1',
      targetItemId: 'target',
      sourceItemId: 'source',
      direction: 'expense',
    });
  });

  it('passes unmerge requests through with the authenticated user id', async () => {
    const unmergeRecurringItems = mock((userId: string, targetItemId: string, sourceItemId: string, direction: string) => ({
      userId,
      targetItemId,
      sourceItemId,
      direction,
    }));
    const controller = new ProjectionsController({
      getOverview: mock(() => ({})),
      unmergeRecurringItems,
    } as any);

    const result = await controller.unmergeRecurringItems(
      { user: { userId: 'user_1' } } as any,
      {
        targetItemId: 'target',
        sourceItemId: 'source',
        direction: 'expense',
      } as any,
    );

    expect(unmergeRecurringItems).toHaveBeenCalledWith('user_1', 'target', 'source', 'expense');
    expect(result).toEqual({
      userId: 'user_1',
      targetItemId: 'target',
      sourceItemId: 'source',
      direction: 'expense',
    });
  });
});
