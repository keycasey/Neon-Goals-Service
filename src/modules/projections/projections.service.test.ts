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
});
