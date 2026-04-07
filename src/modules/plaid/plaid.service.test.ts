import { describe, expect, it } from 'bun:test';

import { PlaidService } from './plaid.service';

function createService({
  findFirstImpl = async () => null,
  findUniqueImpl = async () => null,
  upsertImpl = async () => ({
    id: 'acct_1',
    plaidAccountId: 'plaid_1',
    accountName: 'Checking',
    institutionName: 'Capital One',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    currentBalance: 100,
  }),
  updateImpl = async () => ({ currentBalance: 0, lastSync: new Date(), id: 'acct_1' }),
}: {
  findFirstImpl?: (args: any) => Promise<any>;
  findUniqueImpl?: (args: any) => Promise<any>;
  upsertImpl?: (args: any) => Promise<any>;
  updateImpl?: (args: any) => Promise<any>;
} = {}) {
  const prisma = {
    plaidAccount: {
      findFirst: findFirstImpl,
      findUnique: findUniqueImpl,
      upsert: upsertImpl,
      update: updateImpl,
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
    assertNotDemoUser: async () => undefined,
  } as any;

  return new PlaidService(configService, prisma, demoPlaidService);
}

describe('PlaidService', () => {
  it('selects only the plaid account fields needed after account link upsert', async () => {
    const calls: any[] = [];
    const service = createService({
      upsertImpl: async (args) => {
        calls.push(args);
        return {
          id: 'acct_1',
          plaidAccountId: 'plaid_1',
          accountName: 'Robinhood individual',
          institutionName: 'Robinhood',
          accountMask: '1234',
          accountType: 'investment',
          accountSubtype: 'brokerage',
          currentBalance: 2500,
        };
      },
    });

    (service as any).plaidClient = {
      itemPublicTokenExchange: async () => ({
        data: {
          access_token: 'access-token',
          item_id: 'item_1',
        },
      }),
      itemGet: async () => ({
        data: {
          item: {
            institution_id: 'ins_1',
          },
        },
      }),
      institutionsGetById: async () => ({
        data: {
          institution: {
            name: 'Robinhood',
            logo: '',
          },
        },
      }),
      accountsBalanceGet: async () => ({
        data: {
          accounts: [
            {
              account_id: 'plaid_1',
              name: 'Robinhood individual',
              mask: '1234',
              type: 'investment',
              subtype: ['brokerage'],
              balances: {
                current: 2500,
                available: null,
                iso_currency_code: 'USD',
              },
            },
          ],
        },
      }),
      transactionsGet: async () => ({
        data: {
          transactions: [],
        },
      }),
    };

    await service.linkPlaidAccount('user_1', 'public-token');

    expect(calls[0].select).toEqual({
      id: true,
      plaidAccountId: true,
      accountName: true,
      institutionName: true,
      accountMask: true,
      accountType: true,
      accountSubtype: true,
      currentBalance: true,
    });
  });

  it('creates a real link token for demo users with the demo plaid client', async () => {
    const service = createService();
    const demoCalls: any[] = [];

    (service as any).demoPlaidService = {
      isDemoUser: async () => true,
      assertNotDemoUser: async () => undefined,
    };
    (service as any).demoPlaidClient = {
      linkTokenCreate: async (request: any) => {
        demoCalls.push(request);
        return {
          data: {
            link_token: 'demo-link-token',
            expiration: '2026-04-08T00:00:00.000Z',
            request_id: 'demo-req',
          },
        };
      },
    };

    const result = await service.createLinkToken('user_1');

    expect(result.link_token).toBe('demo-link-token');
    expect(demoCalls).toHaveLength(1);
    expect(demoCalls[0].user.client_user_id).toBe('user_1');
  });

  it('marks newly linked accounts as demo when a demo user links plaid', async () => {
    const calls: any[] = [];
    const service = createService({
      upsertImpl: async (args) => {
        calls.push(args);
        return {
          id: 'acct_1',
          plaidAccountId: 'plaid_1',
          accountName: 'Checking',
          institutionName: 'Demo Bank',
          accountMask: '1234',
          accountType: 'depository',
          accountSubtype: 'checking',
          currentBalance: 100,
        };
      },
    });

    (service as any).demoPlaidService = {
      isDemoUser: async () => true,
      assertNotDemoUser: async () => undefined,
    };
    (service as any).demoPlaidClient = {
      itemPublicTokenExchange: async () => ({
        data: {
          access_token: 'demo-access-token',
          item_id: 'demo-item-1',
        },
      }),
      itemGet: async () => ({
        data: {
          item: {
            institution_id: 'ins_1',
          },
        },
      }),
      institutionsGetById: async () => ({
        data: {
          institution: {
            name: 'Demo Bank',
            logo: '',
          },
        },
      }),
      accountsBalanceGet: async () => ({
        data: {
          accounts: [
            {
              account_id: 'plaid_1',
              name: 'Checking',
              mask: '1234',
              type: 'depository',
              subtype: ['checking'],
              balances: {
                current: 100,
                available: 90,
                iso_currency_code: 'USD',
              },
            },
          ],
        },
      }),
      transactionsGet: async () => ({
        data: { transactions: [] },
      }),
    };

    await service.linkPlaidAccount('user_1', 'public-token');

    expect(calls[0].create.isDemo).toBe(true);
    expect(calls[0].update.isDemo).toBe(true);
  });

  it('retries account balance fetch without min_last_updated_datetime when plaid rejects the timestamp', async () => {
    const service = createService({
      upsertImpl: async () => ({
        id: 'acct_1',
        plaidAccountId: 'plaid_1',
        accountName: 'Checking',
        institutionName: 'Demo Bank',
        accountMask: '1234',
        accountType: 'depository',
        accountSubtype: 'checking',
        currentBalance: 100,
      }),
    });
    const balanceCalls: any[] = [];

    (service as any).demoPlaidService = {
      isDemoUser: async () => true,
      assertNotDemoUser: async () => undefined,
    };
    (service as any).demoPlaidClient = {
      itemPublicTokenExchange: async () => ({
        data: {
          access_token: 'demo-access-token',
          item_id: 'demo-item-1',
        },
      }),
      itemGet: async () => ({
        data: {
          item: {
            institution_id: 'ins_1',
          },
        },
      }),
      institutionsGetById: async () => ({
        data: {
          institution: {
            name: 'Demo Bank',
            logo: '',
          },
        },
      }),
      accountsBalanceGet: async (request: any) => {
        balanceCalls.push(request);
        if (balanceCalls.length === 1) {
          const error: any = new Error('requested datetime out of range');
          error.response = {
            data: {
              error_message: 'requested datetime out of range, most recently updated balance 2026-04-06T23:33:57Z',
            },
          };
          throw error;
        }
        return {
          data: {
            accounts: [
              {
                account_id: 'plaid_1',
                name: 'Checking',
                mask: '1234',
                type: 'depository',
                subtype: ['checking'],
                balances: {
                  current: 100,
                  available: 90,
                  iso_currency_code: 'USD',
                },
              },
            ],
          },
        };
      },
      transactionsGet: async () => ({
        data: { transactions: [] },
      }),
    };

    await service.linkPlaidAccount('user_1', 'public-token');

    expect(balanceCalls).toHaveLength(2);
    expect(balanceCalls[0].options.min_last_updated_datetime).toBeDefined();
    expect(balanceCalls[1].options).toBeUndefined();
  });

  it('queries only the plaid account fields needed for fresh balance reads', async () => {
    const calls: any[] = [];
    const service = createService({
      findUniqueImpl: async (args) => {
        calls.push(args);
        return {
          id: 'acct_1',
          accessToken: 'token',
          plaidAccountId: 'plaid_1',
          lastSync: new Date('2026-03-01T00:00:00.000Z'),
          accountName: 'Brokerage',
          institutionName: 'Robinhood',
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
                current: 1500,
                available: null,
                iso_currency_code: 'USD',
              },
            },
          ],
        },
      }),
    };

    await service.getAccountBalance('user_1', 'acct_1');

    expect(calls[0]).toEqual({
      where: { id: 'acct_1' },
      select: {
        id: true,
        accessToken: true,
        plaidAccountId: true,
        lastSync: true,
        accountName: true,
        institutionName: true,
      },
    });
  });

  it('queries only the plaid account fields needed for fresh transaction reads', async () => {
    const calls: any[] = [];
    const service = createService({
      findUniqueImpl: async (args) => {
        calls.push(args);
        return {
          id: 'acct_1',
          accessToken: 'token',
          plaidAccountId: 'plaid_1',
          accountName: 'Brokerage',
          institutionName: 'Robinhood',
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

    await service.getAccountTransactions('user_1', 'acct_1');

    expect(calls[0]).toEqual({
      where: { id: 'acct_1' },
      select: {
        id: true,
        accessToken: true,
        plaidAccountId: true,
        accountName: true,
        institutionName: true,
      },
    });
  });

  it('returns demo balance without calling Plaid for demo users', async () => {
    const calls: any[] = [];
    const service = createService({
      findFirstImpl: async (args) => {
        calls.push(args);
        return {
          id: 'acct_1',
          currentBalance: 4823.47,
          availableBalance: 4623.47,
          currency: 'USD',
          lastSync: new Date('2026-04-01T00:00:00.000Z'),
        };
      },
      findUniqueImpl: async () => {
        throw new Error('should not read direct plaid account for demo balance');
      },
    });

    (service as any).demoPlaidService = {
      isDemoUser: async () => true,
      assertNotDemoUser: async () => undefined,
    };

    const balance = await service.getAccountBalance('user_1', 'acct_1');

    expect(balance).toMatchObject({
      accountId: 'acct_1',
      currentBalance: 4823.47,
      availableBalance: 4623.47,
      currency: 'USD',
    });
    expect(calls[0]).toEqual({
      where: {
        id: 'acct_1',
        userId: 'user_1',
        isDemo: true,
      },
      select: {
        id: true,
        accountName: true,
        institutionName: true,
        currentBalance: true,
        availableBalance: true,
        currency: true,
        lastSync: true,
      },
    });
  });

  it('returns demo transactions without calling Plaid for demo users', async () => {
    const service = createService({
      findFirstImpl: async () => ({
        id: 'acct_1',
        accountName: 'Everyday Checking',
        institutionName: 'Demo Bank',
      }),
    });

    (service as any).demoPlaidService = {
      isDemoUser: async () => true,
      assertNotDemoUser: async () => undefined,
      getDemoTransactions: async (accountId: string, userId: string) => {
        expect(accountId).toBe('acct_1');
        expect(userId).toBe('user_1');
        return [
          {
            transactionId: 'demo-tx-1',
            accountId: 'demo-account-id',
            amount: -45,
            name: 'Grocery Store',
            category: 'Food and Drink',
            date: new Date('2026-04-01T00:00:00.000Z'),
            pending: false,
            currency: 'USD',
          },
        ];
      },
    };

    const transactions = await service.getAccountTransactions('user_1', 'acct_1');

    expect(transactions).toMatchObject({
      accountId: 'acct_1',
      totalTransactions: 1,
    });
    expect(transactions.transactions[0]).toMatchObject({
      transactionId: 'demo-tx-1',
      amount: -45,
      name: 'Grocery Store',
    });
  });

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
      updateImpl: async (args) => {
        calls.push(args);
        return { currentBalance: 100, lastSync: new Date('2026-03-27T00:00:00.000Z') };
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
        isDemo: true,
      },
    });
    expect(calls[1]).toEqual({
      where: { id: 'acct_1' },
      data: {
        currentBalance: 100,
        availableBalance: 100,
        lastSync: expect.any(Date),
      },
      select: {
        currentBalance: true,
        lastSync: true,
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
      updateImpl: async (args) => {
        calls.push(args);
        return { id: 'acct_1' };
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
        isDemo: true,
      },
    });
    expect(calls[1]).toEqual({
      where: { id: 'acct_1' },
      data: { lastSync: expect.any(Date) },
      select: { id: true },
    });
  });
});
