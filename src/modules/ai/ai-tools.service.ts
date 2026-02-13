import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PlaidService } from '../plaid/plaid.service';

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

      return await this.plaidService.getAccountBalance(plaidAccountId);
    }

    // Return all user accounts with live balances
    const accounts = await this.prisma.plaidAccount.findMany({
      where: { userId, isActive: true },
    });

    const balances = await Promise.all(
      accounts.map((account) =>
        this.plaidService.getAccountBalance(account.id),
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
  }> { {
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
}
}
