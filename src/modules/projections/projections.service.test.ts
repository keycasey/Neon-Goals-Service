import { describe, expect, it } from 'bun:test';

import { ProjectionsService } from './projections.service';

const checkingAccount = {
  id: 'acct_checking',
  userId: 'user_1',
  isActive: true,
  accountName: 'Everyday Checking',
  accountType: 'depository',
  accountSubtype: 'checking',
  currentBalance: 1500,
  availableBalance: 1500,
  currency: 'USD',
  transactions: [
    {
      id: 'txn_salary_1',
      transactionId: 'txn_salary_1',
      amount: -3000,
      currency: 'USD',
      date: new Date('2026-01-01T00:00:00.000Z'),
      name: 'Payroll Deposit',
      merchantName: 'Acme Payroll',
      category: 'income',
      categories: ['income'],
      paymentChannel: 'ach',
      pending: false,
      authorizedDate: null,
      locationData: null,
      transactionType: 'special',
    },
    {
      id: 'txn_salary_2',
      transactionId: 'txn_salary_2',
      amount: -3000,
      currency: 'USD',
      date: new Date('2026-02-01T00:00:00.000Z'),
      name: 'Payroll Deposit',
      merchantName: 'Acme Payroll',
      category: 'income',
      categories: ['income'],
      paymentChannel: 'ach',
      pending: false,
      authorizedDate: null,
      locationData: null,
      transactionType: 'special',
    },
    {
      id: 'txn_rent_1',
      transactionId: 'txn_rent_1',
      amount: 1200,
      currency: 'USD',
      date: new Date('2026-01-03T00:00:00.000Z'),
      name: 'Rent Payment',
      merchantName: 'Sunset Apartments',
      category: 'rent',
      categories: ['rent'],
      paymentChannel: 'ach',
      pending: false,
      authorizedDate: null,
      locationData: null,
      transactionType: 'special',
    },
    {
      id: 'txn_rent_2',
      transactionId: 'txn_rent_2',
      amount: 1200,
      currency: 'USD',
      date: new Date('2026-02-03T00:00:00.000Z'),
      name: 'Rent Payment',
      merchantName: 'Sunset Apartments',
      category: 'rent',
      categories: ['rent'],
      paymentChannel: 'ach',
      pending: false,
      authorizedDate: null,
      locationData: null,
      transactionType: 'special',
    },
    {
      id: 'txn_sub_1',
      transactionId: 'txn_sub_1',
      amount: 15,
      currency: 'USD',
      date: new Date('2026-01-05T00:00:00.000Z'),
      name: 'Spotify',
      merchantName: 'Spotify',
      category: 'subscriptions',
      categories: ['subscriptions'],
      paymentChannel: 'online',
      pending: false,
      authorizedDate: null,
      locationData: null,
      transactionType: 'special',
    },
    {
      id: 'txn_sub_2',
      transactionId: 'txn_sub_2',
      amount: 15,
      currency: 'USD',
      date: new Date('2026-02-05T00:00:00.000Z'),
      name: 'Spotify',
      merchantName: 'Spotify',
      category: 'subscriptions',
      categories: ['subscriptions'],
      paymentChannel: 'online',
      pending: false,
      authorizedDate: null,
      locationData: null,
      transactionType: 'special',
    },
  ],
};

const creditAccount = {
  id: 'acct_credit',
  userId: 'user_1',
  isActive: true,
  accountName: 'Rewards Card',
  accountType: 'credit',
  accountSubtype: 'credit_card',
  currentBalance: 300,
  availableBalance: null,
  currency: 'USD',
  transactions: [],
};

function createPrismaMock(accounts: any[]) {
  const overrides: any[] = [];
  return {
    plaidAccount: {
      findMany: async () => accounts,
    },
    recurringMergeOverride: {
      findUnique: async ({ where }: any) =>
        overrides.find(
          (override) =>
            override.userId === where.userId_targetItemId_direction.userId &&
            override.targetItemId === where.userId_targetItemId_direction.targetItemId &&
            override.direction === where.userId_targetItemId_direction.direction,
        ) ?? null,
      findMany: async ({ where }: any = {}) =>
        overrides.filter((override) => {
          if (where?.userId && override.userId !== where.userId) return false;
          if (where?.direction && override.direction !== where.direction) return false;
          return true;
        }),
      upsert: async ({ where, create, update }: any) => {
        const index = overrides.findIndex(
          (override) =>
            override.userId === where.userId_targetItemId_direction.userId &&
            override.targetItemId === where.userId_targetItemId_direction.targetItemId &&
            override.direction === where.userId_targetItemId_direction.direction,
        );
        if (index >= 0) {
          overrides[index] = {
            ...overrides[index],
            ...update,
          };
          return overrides[index];
        }
        const record = {
          id: `merge_${overrides.length + 1}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...create,
        };
        overrides.push(record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const index = overrides.findIndex(
          (override) =>
            override.userId === where.userId_targetItemId_direction.userId &&
            override.targetItemId === where.userId_targetItemId_direction.targetItemId &&
            override.direction === where.userId_targetItemId_direction.direction,
        );
        if (index === -1) {
          throw new Error('Override not found');
        }
        overrides[index] = {
          ...overrides[index],
          ...data,
        };
        return overrides[index];
      },
      deleteMany: async ({ where }: any) => {
        const before = overrides.length;
        for (let i = overrides.length - 1; i >= 0; i -= 1) {
          const override = overrides[i];
          const matchesUser = !where?.userId || override.userId === where.userId;
          const matchesTarget = !where?.targetItemId || override.targetItemId === where.targetItemId;
          const matchesDirection = !where?.direction || override.direction === where.direction;
          if (matchesUser && matchesTarget && matchesDirection) {
            overrides.splice(i, 1);
          }
        }
        return { count: before - overrides.length };
      },
    },
  } as any;
}

function createCapturingPrismaMock(accounts: any[]) {
  const calls: any[] = [];
  return {
    prisma: {
      plaidAccount: {
        findMany: async (args: any) => {
          calls.push(args);
          return accounts;
        },
      },
      recurringMergeOverride: {
        findMany: async () => [],
      },
    } as any,
    calls,
  };
}

describe('ProjectionsService', () => {
  it('projects net worth from cached transactions and balances', async () => {
    const service = new ProjectionsService(createPrismaMock([checkingAccount, creditAccount]));

    const overview = await service.getOverview('user_1', 12);

    expect(overview.currentNetWorth).toBe(1200);
    expect(overview.monthlyNetCashflow).toBe(1785);
    expect(overview.projectedNetWorth).toBe(1200 + 1785 * 12);
    expect(overview.dataPoints[0]?.value).toBe(1200);
    expect(overview.dataPoints[overview.dataPoints.length - 1]?.value).toBe(overview.projectedNetWorth);
    expect(overview.confidence).not.toBe('insufficient');
  });

  it('keeps recurring items scoped to an account and exposes source transaction ids', async () => {
    const service = new ProjectionsService(
      createPrismaMock([
        checkingAccount,
        {
          ...checkingAccount,
          id: 'acct_savings',
          accountName: 'High Yield Savings',
          transactions: [
            {
              id: 'txn_sub_3',
              transactionId: 'txn_sub_3',
              amount: 15,
              currency: 'USD',
              date: new Date('2026-01-06T00:00:00.000Z'),
              name: 'Spotify',
              merchantName: 'Spotify',
              category: 'subscriptions',
              categories: ['subscriptions'],
              paymentChannel: 'online',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
            {
              id: 'txn_sub_4',
              transactionId: 'txn_sub_4',
              amount: 15,
              currency: 'USD',
              date: new Date('2026-02-06T00:00:00.000Z'),
              name: 'Spotify',
              merchantName: 'Spotify',
              category: 'subscriptions',
              categories: ['subscriptions'],
              paymentChannel: 'online',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
          ],
        },
      ]),
    );

    const cashflow = await service.getCashflow('user_1');
    const spotifyExpenses = cashflow.recurringExpenses.filter((item) => item.label === 'Spotify');

    expect(spotifyExpenses).toHaveLength(2);
    expect(spotifyExpenses.map((item) => item.accountName).sort()).toEqual([
      'Everyday Checking',
      'High Yield Savings',
    ]);
    expect(spotifyExpenses[0]?.sourceTransactionIds?.length).toBe(2);
    expect(spotifyExpenses[1]?.sourceTransactionIds?.length).toBe(2);
  });

  it('ignores recurring credit card payments when estimating cashflow', async () => {
    const service = new ProjectionsService(
      createPrismaMock([
        {
          ...checkingAccount,
          transactions: [
            ...checkingAccount.transactions,
            {
              id: 'txn_payment_1',
              transactionId: 'txn_payment_1',
              amount: 400,
              currency: 'USD',
              date: new Date('2026-01-10T00:00:00.000Z'),
              name: 'Credit Card Payment Thank You',
              merchantName: null,
              category: 'payment',
              categories: ['payment'],
              paymentChannel: 'online',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
            {
              id: 'txn_payment_2',
              transactionId: 'txn_payment_2',
              amount: 400,
              currency: 'USD',
              date: new Date('2026-02-10T00:00:00.000Z'),
              name: 'Credit Card Payment Thank You',
              merchantName: null,
              category: 'payment',
              categories: ['payment'],
              paymentChannel: 'online',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
          ],
        },
      ]),
    );

    const cashflow = await service.getCashflow('user_1');

    expect(cashflow.netMonthlyCashflow).toBe(1785);
    expect(cashflow.recurringExpenses.some((item) => item.label === 'Credit Card Payment Thank You')).toBe(false);
  });

  it('treats negative signed amounts as income even when labels are ambiguous', async () => {
    const service = new ProjectionsService(
      createPrismaMock([
        {
          ...checkingAccount,
          transactions: [
            {
              id: 'txn_pay_1',
              transactionId: 'txn_pay_1',
              amount: -3047.02,
              currency: 'USD',
              date: new Date('2026-02-10T00:00:00.000Z'),
              name: '100-SFDC INC',
              merchantName: '100-SFDC INC',
              category: 'OTHER',
              categories: ['OTHER'],
              paymentChannel: 'other',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
            {
              id: 'txn_pay_2',
              transactionId: 'txn_pay_2',
              amount: -3047.02,
              currency: 'USD',
              date: new Date('2026-02-24T00:00:00.000Z'),
              name: '100-SFDC INC',
              merchantName: '100-SFDC INC',
              category: 'OTHER',
              categories: ['OTHER'],
              paymentChannel: 'other',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
          ],
        },
      ]),
    );

    const cashflow = await service.getCashflow('user_1');

    expect(cashflow.recurringIncome.some((item) => item.label === '100 Sfdc Inc')).toBe(true);
    expect(cashflow.recurringExpenses.some((item) => item.label === '100 Sfdc Inc')).toBe(false);
  });

  it('falls back to balances when no cached transactions exist', async () => {
    const service = new ProjectionsService(
      createPrismaMock([
        {
          ...checkingAccount,
          transactions: [],
        },
      ]),
    );

    const cashflow = await service.getCashflow('user_1');

    expect(cashflow.totalMonthlyIncome).toBe(0);
    expect(cashflow.totalMonthlyExpenses).toBe(0);
    expect(cashflow.netMonthlyCashflow).toBe(0);
    expect(cashflow.recurringIncome).toHaveLength(0);
    expect(cashflow.recurringExpenses).toHaveLength(0);
  });

  it('queries only the plaid account fields needed for projections', async () => {
    const { prisma, calls } = createCapturingPrismaMock([checkingAccount]);
    const service = new ProjectionsService(prisma);

    await service.getOverview('user_1', 12);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      where: { userId: 'user_1', isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        accountName: true,
        accountType: true,
        accountSubtype: true,
        currentBalance: true,
        availableBalance: true,
        currency: true,
        transactions: {
          orderBy: { date: 'desc' },
          take: 180,
          select: {
            transactionId: true,
            amount: true,
            date: true,
            name: true,
            merchantName: true,
            category: true,
            categories: true,
            paymentChannel: true,
            pending: true,
            transactionType: true,
          },
        },
      },
    });
  });

  it('merges recurring items and includes source transactions in the target item', async () => {
    const service = new ProjectionsService(
      createPrismaMock([
        {
          ...checkingAccount,
          transactions: [
            {
              id: 'txn_koriander_debit_1',
              transactionId: 'txn_koriander_debit_1',
              amount: 28,
              currency: 'USD',
              date: new Date('2026-01-07T00:00:00.000Z'),
              name: 'Koriander Indian',
              merchantName: 'Koriander Indian',
              category: 'restaurants',
              categories: ['restaurants'],
              paymentChannel: 'in_store',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
            {
              id: 'txn_koriander_debit_2',
              transactionId: 'txn_koriander_debit_2',
              amount: 31,
              currency: 'USD',
              date: new Date('2026-01-14T00:00:00.000Z'),
              name: 'Koriander Indian',
              merchantName: 'Koriander Indian',
              category: 'restaurants',
              categories: ['restaurants'],
              paymentChannel: 'in_store',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
            {
              id: 'txn_koriander_debit_3',
              transactionId: 'txn_koriander_debit_3',
              amount: 29,
              currency: 'USD',
              date: new Date('2026-01-21T00:00:00.000Z'),
              name: 'Koriander Indian',
              merchantName: 'Koriander Indian',
              category: 'restaurants',
              categories: ['restaurants'],
              paymentChannel: 'in_store',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
          ],
        },
        {
          ...creditAccount,
          accountName: 'Rewards Card',
          transactions: [
            {
              id: 'txn_koriander_credit_1',
              transactionId: 'txn_koriander_credit_1',
              amount: 32,
              currency: 'USD',
              date: new Date('2026-01-06T00:00:00.000Z'),
              name: 'Koriander Indian Cuis',
              merchantName: 'Koriander Indian Cuis',
              category: 'restaurants',
              categories: ['restaurants'],
              paymentChannel: 'in_store',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
            {
              id: 'txn_koriander_credit_2',
              transactionId: 'txn_koriander_credit_2',
              amount: 30,
              currency: 'USD',
              date: new Date('2026-02-06T00:00:00.000Z'),
              name: 'Koriander Indian Cuis',
              merchantName: 'Koriander Indian Cuis',
              category: 'restaurants',
              categories: ['restaurants'],
              paymentChannel: 'in_store',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
          ],
        },
      ]),
    );

    await service.mergeRecurringItems(
      'user_1',
      'expense:acct_checking:koriander indian',
      'expense:acct_credit:koriander indian cuis',
      'expense',
    );

    const cashflow = await service.getCashflow('user_1');
    const merged = cashflow.recurringExpenses.find((item) => item.id === 'expense:acct_checking:koriander indian');

    expect(merged?.sourceTransactionIds).toEqual([
      'txn_koriander_debit_1',
      'txn_koriander_debit_2',
      'txn_koriander_debit_3',
      'txn_koriander_credit_1',
      'txn_koriander_credit_2',
    ]);
    expect(merged?.mergedSources).toEqual([
      {
        id: 'expense:acct_credit:koriander indian cuis',
        label: 'Koriander Indian Cuis',
        accountName: 'Rewards Card',
        sourceTransactionIds: ['txn_koriander_credit_1', 'txn_koriander_credit_2'],
      },
    ]);
    expect(cashflow.recurringExpenses.some((item) => item.id === 'expense:acct_credit:koriander indian cuis')).toBe(false);
  });

  it('undoes a recurring merge and restores the source item', async () => {
    const service = new ProjectionsService(
      createPrismaMock([
        {
          ...checkingAccount,
          transactions: [
            {
              id: 'txn_clipper_1',
              transactionId: 'txn_clipper_1',
              amount: 14,
              currency: 'USD',
              date: new Date('2026-01-01T00:00:00.000Z'),
              name: 'Clipper',
              merchantName: 'Clipper',
              category: 'transport',
              categories: ['transport'],
              paymentChannel: 'online',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
            {
              id: 'txn_clipper_2',
              transactionId: 'txn_clipper_2',
              amount: 14,
              currency: 'USD',
              date: new Date('2026-02-01T00:00:00.000Z'),
              name: 'Clipper',
              merchantName: 'Clipper',
              category: 'transport',
              categories: ['transport'],
              paymentChannel: 'online',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
            {
              id: 'txn_clipper_mobile_1',
              transactionId: 'txn_clipper_mobile_1',
              amount: 14,
              currency: 'USD',
              date: new Date('2026-01-02T00:00:00.000Z'),
              name: 'Clipper Systems Mobile 1',
              merchantName: 'Clipper Systems Mobile 1',
              category: 'transport',
              categories: ['transport'],
              paymentChannel: 'online',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
            {
              id: 'txn_clipper_mobile_2',
              transactionId: 'txn_clipper_mobile_2',
              amount: 14,
              currency: 'USD',
              date: new Date('2026-02-02T00:00:00.000Z'),
              name: 'Clipper Systems Mobile 1',
              merchantName: 'Clipper Systems Mobile 1',
              category: 'transport',
              categories: ['transport'],
              paymentChannel: 'online',
              pending: false,
              authorizedDate: null,
              locationData: null,
              transactionType: 'special',
            },
          ],
        },
      ]),
    );

    await service.mergeRecurringItems(
      'user_1',
      'expense:acct_checking:clipper',
      'expense:acct_checking:clipper systems mobile 1',
      'expense',
    );
    await service.unmergeRecurringItems(
      'user_1',
      'expense:acct_checking:clipper',
      'expense:acct_checking:clipper systems mobile 1',
      'expense',
    );

    const cashflow = await service.getCashflow('user_1');

    expect(cashflow.recurringExpenses.some((item) => item.id === 'expense:acct_checking:clipper')).toBe(true);
    expect(cashflow.recurringExpenses.some((item) => item.id === 'expense:acct_checking:clipper systems mobile 1')).toBe(true);
  });

  it('persists merge overrides outside process memory', async () => {
    const prisma = createPrismaMock([
      {
        ...checkingAccount,
        transactions: [
          {
            id: 'txn_koriander_debit_1',
            transactionId: 'txn_koriander_debit_1',
            amount: 28,
            currency: 'USD',
            date: new Date('2026-01-07T00:00:00.000Z'),
            name: 'Koriander Indian',
            merchantName: 'Koriander Indian',
            category: 'restaurants',
            categories: ['restaurants'],
            paymentChannel: 'in_store',
            pending: false,
            authorizedDate: null,
            locationData: null,
            transactionType: 'special',
          },
          {
            id: 'txn_koriander_debit_2',
            transactionId: 'txn_koriander_debit_2',
            amount: 31,
            currency: 'USD',
            date: new Date('2026-01-14T00:00:00.000Z'),
            name: 'Koriander Indian',
            merchantName: 'Koriander Indian',
            category: 'restaurants',
            categories: ['restaurants'],
            paymentChannel: 'in_store',
            pending: false,
            authorizedDate: null,
            locationData: null,
            transactionType: 'special',
          },
          {
            id: 'txn_koriander_debit_3',
            transactionId: 'txn_koriander_debit_3',
            amount: 29,
            currency: 'USD',
            date: new Date('2026-01-21T00:00:00.000Z'),
            name: 'Koriander Indian',
            merchantName: 'Koriander Indian',
            category: 'restaurants',
            categories: ['restaurants'],
            paymentChannel: 'in_store',
            pending: false,
            authorizedDate: null,
            locationData: null,
            transactionType: 'special',
          },
        ],
      },
      {
        ...creditAccount,
        accountName: 'Rewards Card',
        transactions: [
          {
            id: 'txn_koriander_credit_1',
            transactionId: 'txn_koriander_credit_1',
            amount: 32,
            currency: 'USD',
            date: new Date('2026-01-06T00:00:00.000Z'),
            name: 'Koriander Indian Cuis',
            merchantName: 'Koriander Indian Cuis',
            category: 'restaurants',
            categories: ['restaurants'],
            paymentChannel: 'in_store',
            pending: false,
            authorizedDate: null,
            locationData: null,
            transactionType: 'special',
          },
          {
            id: 'txn_koriander_credit_2',
            transactionId: 'txn_koriander_credit_2',
            amount: 30,
            currency: 'USD',
            date: new Date('2026-02-06T00:00:00.000Z'),
            name: 'Koriander Indian Cuis',
            merchantName: 'Koriander Indian Cuis',
            category: 'restaurants',
            categories: ['restaurants'],
            paymentChannel: 'in_store',
            pending: false,
            authorizedDate: null,
            locationData: null,
            transactionType: 'special',
          },
        ],
      },
    ]);
    const writerService = new ProjectionsService(prisma);
    const readerService = new ProjectionsService(prisma);

    await writerService.mergeRecurringItems(
      'user_1',
      'expense:acct_checking:koriander indian',
      'expense:acct_credit:koriander indian cuis',
      'expense',
    );

    const cashflow = await readerService.getCashflow('user_1');
    const merged = cashflow.recurringExpenses.find((item) => item.id === 'expense:acct_checking:koriander indian');

    expect(merged?.sourceTransactionIds).toEqual([
      'txn_koriander_debit_1',
      'txn_koriander_debit_2',
      'txn_koriander_debit_3',
      'txn_koriander_credit_1',
      'txn_koriander_credit_2',
    ]);
    expect(cashflow.recurringExpenses.some((item) => item.id === 'expense:acct_credit:koriander indian cuis')).toBe(false);
  });
});
