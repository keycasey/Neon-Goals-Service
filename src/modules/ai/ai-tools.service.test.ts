import { describe, expect, it } from 'bun:test';

import { AiToolsService } from './ai-tools.service';

describe('AiToolsService', () => {
  it('builds structured financial context from linked accounts and projections', async () => {
    const prisma = {
      plaidAccount: {
        findMany: async () => [
          {
            id: 'acct_checking',
            institutionName: 'Capital One',
            accountName: '360 Checking',
            accountType: 'depository',
            accountSubtype: 'checking',
            currentBalance: 4200,
            transactions: [
              {
                id: 'txn_payroll',
                date: new Date('2026-04-01T00:00:00.000Z'),
                amount: -2500,
                merchantName: 'SFDC Payroll',
                name: 'Payroll',
                category: 'INCOME',
              },
              {
                id: 'txn_trip',
                date: new Date('2026-04-03T00:00:00.000Z'),
                amount: 799,
                merchantName: 'Airline',
                name: 'Airline',
                category: 'TRAVEL',
              },
            ],
          },
          {
            id: 'acct_savings',
            institutionName: 'Capital One',
            accountName: '360 Performance Savings',
            accountType: 'depository',
            accountSubtype: 'savings',
            currentBalance: 10000,
            transactions: [],
          },
        ],
      },
    } as any;

    const plaidService = {} as any;
    const projectionsService = {
      getCashflow: async () => ({
        totalMonthlyIncome: 2500,
        totalMonthlyExpenses: 1450,
        netMonthlyCashflow: 1050,
        recurringIncome: [
          {
            id: 'income:acct_checking:sfdc payroll',
            label: 'SFDC Payroll',
            amount: 2500,
            cadence: 'monthly',
            accountId: 'acct_checking',
            accountName: '360 Checking',
            sourceTransactionIds: ['txn_payroll'],
          },
        ],
        recurringExpenses: [],
      }),
      getOverview: async () => ({
        currentNetWorth: 14200,
        projectedNetWorth: 26800,
        monthlyNetCashflow: 1050,
        horizonMonths: 12,
        projectedDate: '2027-04-01T00:00:00.000Z',
        confidence: 'medium',
        assumptions: ['Cached Plaid transactions were used to estimate recurring cashflow.'],
        dataPoints: [],
        goalMilestones: [],
      }),
    } as any;

    const service = new AiToolsService(prisma, plaidService, projectionsService);

    const result = await service.getFinancialContext('user_1');

    expect(result.linkedAccounts).toHaveLength(2);
    expect(result.recurringIncome[0]).toMatchObject({
      label: 'SFDC Payroll',
      amount: 2500,
      accountId: 'acct_checking',
    });
    expect(result.accountsWithoutTransactions).toEqual([
      {
        accountId: 'acct_savings',
        institutionName: 'Capital One',
        accountName: '360 Performance Savings',
      },
    ]);
    expect(result.recentTransactions[0]).toMatchObject({
      merchantName: 'Airline',
      recurringMatch: false,
    });
    expect(result.potentialOneOffTransactions[0]).toMatchObject({
      merchantName: 'Airline',
      amount: 799,
    });
  });
});
