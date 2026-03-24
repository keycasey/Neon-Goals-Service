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
});
