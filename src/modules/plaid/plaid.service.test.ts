import { describe, expect, it } from 'bun:test';

import { PlaidService } from './plaid.service';

function createService(findFirstImpl: (args: any) => Promise<any>) {
  const prisma = {
    plaidAccount: {
      findFirst: findFirstImpl,
    },
    plaidTransaction: {
      findMany: async () => [],
    },
  } as any;

  const configService = {
    get: (key: string, fallback?: string) => {
      if (key === 'PLAID_CLIENT_ID') return 'client-id';
      if (key === 'PLAID_SECRET') return 'secret';
      if (key === 'PLAID_ENV') return fallback ?? 'sandbox';
      return fallback;
    },
  } as any;

  const demoPlaidService = {
    isDemoUser: async () => false,
  } as any;

  return new PlaidService(configService, prisma, demoPlaidService);
}

describe('PlaidService', () => {
  it('queries only the plaid account fields needed for stored transactions', async () => {
    const calls: any[] = [];
    const service = createService(async (args) => {
      calls.push(args);
      return {
        accountName: 'Checking',
        institutionName: 'Capital One',
      };
    });

    await service.getStoredTransactions('user_1', 'acct_1');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      where: { id: 'acct_1', userId: 'user_1' },
      select: {
        accountName: true,
        institutionName: true,
      },
    });
  });
});
