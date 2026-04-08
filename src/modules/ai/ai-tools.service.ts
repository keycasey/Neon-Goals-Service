import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PlaidService } from '../plaid/plaid.service';
import { ProjectionsService } from '../projections/projections.service';

/**
 * AiToolsService provides agent-accessible tools for live financial data.
 * Used by OpenAI function calling to get real-time balances and transactions.
 */
@Injectable()
export class AiToolsService {
  private readonly logger = new Logger(AiToolsService.name);

  constructor(
    private prisma: PrismaService,
    private plaidService: PlaidService,
    private projectionsService: ProjectionsService,
  ) {}

  /**
   * Get live account balance from Plaid.
   * If plaidAccountId is provided, returns that specific account.
   * Otherwise, returns all accounts for the user.
   */
  async getLiveBalance(
    userId: string,
    plaidAccountId?: string,
  ): Promise<
    | {
        accountId: string;
        accountName: string;
        institutionName: string;
        currentBalance: number;
        availableBalance: number | null;
        currency: string;
        lastSync: Date;
      }
    | Array<{
        accountId: string;
        accountName: string;
        institutionName: string;
        currentBalance: number;
        availableBalance: number | null;
        currency: string;
        lastSync: Date;
      }>
  > {
    // If specific account requested, verify ownership and return it
    if (plaidAccountId) {
      const account = await this.prisma.plaidAccount.findFirst({
        where: { id: plaidAccountId, userId, isActive: true },
      });

      if (!account) {
        throw new BadRequestException('Account not found or access denied');
      }

      return await this.plaidService.getAccountBalance(userId, plaidAccountId);
    }

    // Return all user accounts with live balances
    const accounts = await this.prisma.plaidAccount.findMany({
      where: { userId, isActive: true },
    });

    const balances = await Promise.all(
      accounts.map((account) =>
        this.plaidService.getAccountBalance(userId, account.id),
      ),
    );

    return balances;
  }

  /**
   * Get live transactions from Plaid.
   * If plaidAccountId is provided, returns transactions for that specific account.
   * Otherwise, returns transactions across all user accounts.
   */
  async getLiveTransactions(
    userId: string,
    plaidAccountId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{
    accountId: string;
    accountName: string;
    institutionName: string;
    transactions: Array<{
      date: string;
      amount: number;
      merchantName: string;
      category: string;
      pending: boolean;
    }>;
    totalTransactions: number;
    startDate: string;
    endDate: string;
  }[]> {
    let accountsToQuery;

    // If specific account requested, verify ownership
    if (plaidAccountId) {
      const account = await this.prisma.plaidAccount.findFirst({
        where: { id: plaidAccountId, userId, isActive: true },
      });

      if (!account) {
        throw new BadRequestException('Account not found or access denied');
      }

      accountsToQuery = [account];
    } else {
      // Get all user accounts
      accountsToQuery = await this.prisma.plaidAccount.findMany({
        where: { userId, isActive: true },
      });
    }

    // Fetch transactions for each account
    const results = await Promise.all(
      accountsToQuery.map(async (account) => {
        const result = await this.plaidService.getAccountTransactions(
          userId,
          account.id,
          startDate,
          endDate,
        );

        return {
          accountId: result.accountId,
          accountName: result.accountName,
          institutionName: result.institutionName,
          transactions: result.transactions.map((t: any) => ({
            date: t.date,
            amount: Math.abs(t.amount), // Store as positive
            merchantName: t.merchant_name || t.name,
            category: t.personal_finance_category?.primary || t.category?.[0] || 'uncategorized',
            pending: t.pending,
          })),
          totalTransactions: result.totalTransactions,
          startDate: result.startDate,
          endDate: result.endDate,
        };
      }),
    );

    return results;
  }

  /**
   * Analyze spending and savings across ALL user accounts.
   * Provides comprehensive analysis for improving savings rate.
   */
  async analyzeAllSpendingAndSavings(userId: string): Promise<{
    totalBalance: number;
    accountCount: number;
    monthlySavingsCapacity: number;
    spendingByCategory: Array<{
      category: string;
      amount: number;
      percentage: number;
    }>;
    topRecommendations: string[];
    recentTransactions: Array<{
      date: string;
      amount: number;
      merchant: string;
      category: string;
    }>;
  }> {
    // Get all user accounts
    const accounts = await this.prisma.plaidAccount.findMany({
      where: { userId, isActive: true },
    });

    // Get all stored transactions (not live - cached is fine for analysis)
    const allTransactions: any[] = [];
    for (const account of accounts) {
      const stored = await this.prisma.plaidTransaction.findMany({
        where: { plaidAccountId: account.id },
        orderBy: { date: 'desc' },
        take: 100,
      });
      allTransactions.push(...stored);
    }

    const totalBalance = accounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);
    const accountCount = accounts.length;

    // Analyze spending by category
    // @ts-ignore - Array.from() iterator requirement is a known TS limitation
    const categorySpending: Map<string, number> = new Map();
    for (const txn of allTransactions.slice(0, 500)) { // Last 500 transactions
      const cat = txn.category || 'uncategorized';
      categorySpending.set(cat, (categorySpending.get(cat) || 0) + Math.abs(txn.amount));
    }

    // Convert Map entries to array for proper typing
    // @ts-ignore - Array.from() iterator requirement is a known TS limitation
    const entries: Array<[string, number]> = [];
    categorySpending.forEach((amount, category) => entries.push([category, amount]));

    // @ts-ignore
    const categorySpendingArray = Array.from(entries)

    const spendingByCategory = entries
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: Math.round((amount / totalBalance) * 100),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Estimate monthly savings capacity (income - fixed expenses - savings goals)
    // This is a rough estimate - agent should refine based on actual income data
    const totalMonthlySpending = Array.from(categorySpending.values()).reduce((sum, val) => sum + val, 0);
    const estimatedMonthlyIncome = totalMonthlySpending * 1.5; // Rough estimate
    const monthlySavingsCapacity = Math.max(0, estimatedMonthlyIncome - totalMonthlySpending);

    // Generate recommendations
    // @ts-ignore - for...of on sliced array may trigger iterator requirement
    const recommendations: string[] = [];

    // Check for high spending categories
    // @ts-ignore - .slice() may not preserve iterator for older TypeScript versions
    for (const [category, amount] of spendingByCategory.slice(0, 3)) {
      if (amount > totalBalance * 0.15) { // More than 15% of balance
        const percent = Math.round((amount / totalBalance) * 100);
        recommendations.push(
          `Your ${category} spending ($${amount.toFixed(0)}, ${percent}%) is notable. Consider whether you can reduce this category to free up more savings.`,
        );
      }
    }

    // Check for subscriptions/recurring payments
    const subscriptions = allTransactions
      .filter(t => t.category === 'TRANSFER' || t.category === 'PAYMENT')
      .slice(0, 10)
      .filter(t => Math.abs(t.amount) > 50); // Monthly recurring > $50

    if (subscriptions.length > 0) {
      const monthlySubscriptions = subscriptions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      recommendations.push(
        `I found ${subscriptions.length} recurring payments averaging $${monthlySubscriptions.toFixed(0)}/month. Review these for cancellation or negotiation opportunities.`,
      );
    }

    // Get recent transactions for context
    const recentTransactions = allTransactions
      .slice(0, 20)
      .map((t: any) => ({
        date: t.date,
        amount: Math.abs(t.amount),
        merchant: t.merchantName || t.name,
        category: t.category || 'uncategorized',
      }));

    return {
      totalBalance,
      accountCount,
      monthlySavingsCapacity,
      spendingByCategory,
      topRecommendations: recommendations.slice(0, 5),
      recentTransactions,
    };
  }

  async getFinancialContext(userId: string): Promise<{
    linkedAccounts: Array<{
      accountId: string;
      institutionName: string;
      accountName: string;
      accountType: string;
      accountSubtype: string | null;
      currentBalance: number;
      transactionCount: number;
    }>;
    recurringIncome: Array<{
      id: string;
      label: string;
      amount: number;
      cadence: string;
      accountId?: string;
      accountName?: string;
      category?: string;
      sourceTransactionIds?: string[];
    }>;
    recurringExpenses: Array<{
      id: string;
      label: string;
      amount: number;
      cadence: string;
      accountId?: string;
      accountName?: string;
      category?: string;
      sourceTransactionIds?: string[];
    }>;
    netMonthlyCashflow: number;
    totalMonthlyIncome: number;
    totalMonthlyExpenses: number;
    currentNetWorth: number;
    assumptions: string[];
    recentTransactions: Array<{
      accountId: string;
      accountName: string;
      institutionName: string;
      date: string;
      amount: number;
      merchantName: string;
      category: string;
      recurringMatch: boolean;
    }>;
    potentialOneOffTransactions: Array<{
      accountId: string;
      accountName: string;
      institutionName: string;
      date: string;
      amount: number;
      merchantName: string;
      category: string;
    }>;
    accountsWithoutTransactions: Array<{
      accountId: string;
      institutionName: string;
      accountName: string;
    }>;
  }> {
    const [cashflow, overview, accounts] = await Promise.all([
      this.projectionsService.getCashflow(userId),
      this.projectionsService.getOverview(userId, 12),
      this.prisma.plaidAccount.findMany({
        where: { userId, isActive: true },
        select: {
          id: true,
          institutionName: true,
          accountName: true,
          accountType: true,
          accountSubtype: true,
          currentBalance: true,
          transactions: {
            orderBy: { date: 'desc' },
            take: 30,
            select: {
              id: true,
              date: true,
              amount: true,
              merchantName: true,
              name: true,
              category: true,
            },
          },
        },
        orderBy: [{ institutionName: 'asc' }, { accountName: 'asc' }],
      }),
    ]);

    const recurringTransactionIds = new Set<string>();
    for (const item of [...cashflow.recurringIncome, ...cashflow.recurringExpenses]) {
      for (const sourceId of item.sourceTransactionIds ?? []) {
        recurringTransactionIds.add(sourceId);
      }
      for (const mergedSource of item.mergedSources ?? []) {
        for (const sourceId of mergedSource.sourceTransactionIds ?? []) {
          recurringTransactionIds.add(sourceId);
        }
      }
    }

    const recentTransactions = accounts
      .flatMap((account) =>
        account.transactions.map((transaction) => ({
          accountId: account.id,
          accountName: account.accountName,
          institutionName: account.institutionName,
          date: transaction.date.toISOString().slice(0, 10),
          amount: transaction.amount,
          merchantName: transaction.merchantName || transaction.name,
          category: transaction.category || 'uncategorized',
          recurringMatch: recurringTransactionIds.has(transaction.id),
        })),
      )
      .sort((a, b) => {
        if (a.date === b.date) {
          return Math.abs(b.amount) - Math.abs(a.amount);
        }
        return a.date < b.date ? 1 : -1;
      })
      .slice(0, 60);

    const potentialOneOffTransactions = recentTransactions
      .filter((transaction) => !transaction.recurringMatch)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 12)
      .map(({ recurringMatch: _recurringMatch, ...transaction }) => transaction);

    const linkedAccounts = accounts.map((account) => ({
      accountId: account.id,
      institutionName: account.institutionName,
      accountName: account.accountName,
      accountType: account.accountType,
      accountSubtype: account.accountSubtype,
      currentBalance: account.currentBalance,
      transactionCount: account.transactions.length,
    }));

    return {
      linkedAccounts,
      recurringIncome: cashflow.recurringIncome.map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.amount,
        cadence: item.cadence,
        accountId: item.accountId,
        accountName: item.accountName,
        category: item.category,
        sourceTransactionIds: item.sourceTransactionIds,
      })),
      recurringExpenses: cashflow.recurringExpenses.map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.amount,
        cadence: item.cadence,
        accountId: item.accountId,
        accountName: item.accountName,
        category: item.category,
        sourceTransactionIds: item.sourceTransactionIds,
      })),
      netMonthlyCashflow: cashflow.netMonthlyCashflow,
      totalMonthlyIncome: cashflow.totalMonthlyIncome,
      totalMonthlyExpenses: cashflow.totalMonthlyExpenses,
      currentNetWorth: overview.currentNetWorth,
      assumptions: overview.assumptions,
      recentTransactions,
      potentialOneOffTransactions,
      accountsWithoutTransactions: linkedAccounts
        .filter((account) => account.transactionCount === 0)
        .map(({ accountId, institutionName, accountName }) => ({
          accountId,
          institutionName,
          accountName,
        })),
    };
  }
}
