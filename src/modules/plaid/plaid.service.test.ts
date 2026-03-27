import { describe, expect, it } from 'bun:test';

import { PlaidService } from './plaid.service';

function createService({
  findFirstImpl = async () => null,
  findUniqueImpl = async () => null,
}: {
  findFirstImpl?: (args: any) => Promise<any>;
  findUniqueImpl?: (args: any) => Promise<any>;
}) {
  const prisma = {
    plaidAccount: {
      findFirst: findFirstImpl,
      findUnique: findUniqueImpl,
      update: async () => ({ currentBalance: 0, lastSync: new Date() }),
    },
    plaidTransaction: {
      findMany: async () => [],
      upsert: async () => null,
    },
    financeGoalData: {
      update: async () => null,
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
    const service = createService({ findFirstImpl: async (args) => {
      calls.push(args);
      return {
        accountName: 'Checking',
        institutionName: 'Capital One',
      };
    }});

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

  it('queries only the plaid account fields needed for balance sync', async () => {
    const calls: any[] = [];
    const service = createService({
      findUniqueImpl: async (args) => {
        calls.push(args);
        return {
          id: 'acct_1',
          accessToken: 'token',
          plaidAccountId: 'plaid_1',
          lastSync: new Date('2026-03-01T00:00:00.000Z'),
          financeGoalId: null,
        };
      },
    });

    (service as any).plaidClient = {
      accountsBalanceGet: async () => ({
        data: {
          accounts: [
            {
              account_id: 'plaid_1',
              balances: {
                current: 100,
                available: 100,
              },
            },
          ],
        },
      }),
    };

    await service.syncAccountBalance('acct_1');

    expect(calls[0]).toEqual({
      where: { id: 'acct_1' },
      select: {
        id: true,
        accessToken: true,
        plaidAccountId: true,
        lastSync: true,
        financeGoalId: true,
      },
    });
  });

  it('queries only the plaid account fields needed for transaction sync', async () => {
    const calls: any[] = [];
    const service = createService({
      findUniqueImpl: async (args) => {
        calls.push(args);
        return {
          id: 'acct_1',
          accessToken: 'token',
          plaidAccountId: 'plaid_1',
          accountName: 'Checking',
        };
      },
    });

    (service as any).plaidClient = {
      transactionsGet: async () => ({
        data: {
          transactions: [],
        },
      }),
    };

    await service.fetchAndStoreTransactions('acct_1', '2026-01-01', '2026-03-01');

    expect(calls[0]).toEqual({
      where: { id: 'acct_1' },
      select: {
        id: true,
        accessToken: true,
        plaidAccountId: true,
        accountName: true,
      },
    });
  });
});
