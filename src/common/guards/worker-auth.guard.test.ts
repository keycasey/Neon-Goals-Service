import { describe, expect, it } from 'bun:test';
import { WorkerAuthGuard } from './worker-auth.guard';

function context(headers: Record<string, string>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as any;
}

describe('WorkerAuthGuard', () => {
  it('accepts only the configured worker key', () => {
    const guard = new WorkerAuthGuard({
      get: () => 'worker-secret',
    } as any);

    expect(guard.canActivate(context({ 'x-worker-key': 'worker-secret' }))).toBe(true);
    expect(() => guard.canActivate(context({ 'x-worker-key': 'wrong-secret' }))).toThrow();
  });

  it('fails closed when worker authentication is not configured', () => {
    const guard = new WorkerAuthGuard({ get: () => undefined } as any);
    expect(() => guard.canActivate(context({}))).toThrow(
      'Worker authentication is not configured',
    );
  });
});
