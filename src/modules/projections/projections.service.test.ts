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
      amount: 3000,
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
      amount: 3000,
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
  return {
    plaidAccount: {
      findMany: async () => accounts,
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
});
