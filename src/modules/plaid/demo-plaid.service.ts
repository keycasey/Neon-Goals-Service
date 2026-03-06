import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';

/**
 * Mock transaction data for demo user
 */
const DEMO_TRANSACTIONS = [
  {
    transactionId: 'demo-tx-1',
    amount: -45.00,
    name: 'Grocery Store',
    merchantName: 'Whole Foods',
    category: 'Food and Drink',
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    pending: false,
  },
  {
    transactionId: 'demo-tx-2',
    amount: -12.50,
    name: 'Coffee Shop',
    merchantName: 'Starbucks',
    category: 'Food and Drink',
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    pending: false,
  },
  {
    transactionId: 'demo-tx-3',
    amount: 2500.00,
    name: 'Payroll',
    merchantName: 'Employer Inc',
    category: 'Income',
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    pending: false,
  },
  {
    transactionId: 'demo-tx-4',
    amount: -89.99,
    name: 'Streaming Services',
    merchantName: 'Netflix',
    category: 'Entertainment',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    pending: false,
  },
  {
    transactionId: 'demo-tx-5',
    amount: -150.00,
    name: 'Utility Bill',
    merchantName: 'Electric Company',
    category: 'Utilities',
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    pending: false,
  },
];

/**
 * Service for handling demo user Plaid operations.
 *
 * Demo users get mock Plaid data and cannot link real accounts.
 * All operations return synthetic data for demo purposes.
 */
@Injectable()
export class DemoPlaidService {
  private readonly logger = new Logger(DemoPlaidService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Check if a user is a demo user.
   */
  async isDemoUser(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isDemo: true },
    });
    return user?.isDemo ?? false;
  }

  /**
   * Block real Plaid operations for demo users.
   * Call this before any real Plaid API operations.
   *
   * @throws ForbiddenException if user is a demo user
   */
  async assertNotDemoUser(userId: string): Promise<void> {
    if (await this.isDemoUser(userId)) {
      throw new ForbiddenException(
        'Demo users cannot link real bank accounts. Try the demo finance goals instead!',
      );
    }
  }

  /**
   * Get mock Plaid link token for demo user.
   * Returns a placeholder - demo users can't actually link accounts.
   */
  getDemoLinkToken(): { link_token: string; expiration: string; request_id: string; message: string } {
    // Return a mock response that matches Plaid's LinkTokenResponse format
    const expiration = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours from now
    return {
      link_token: 'demo-link-token-not-usable',
      expiration,
      request_id: 'demo-request-id',
      message: 'Demo mode: You cannot link real bank accounts. The demo account is pre-configured for you.',
    };
  }

  /**
   * Get demo accounts for a user.
   * Returns the pre-configured demo Plaid account.
   */
  async getDemoAccounts(userId: string) {
    const accounts = await this.prisma.plaidAccount.findMany({
      where: {
        userId,
        isDemo: true,
        isActive: true,
      },
    });

    return accounts.map((account) => ({
      id: account.id,
      institutionName: account.institutionName,
      accountName: account.accountName,
      accountMask: account.accountMask,
      accountType: account.accountType,
      accountSubtype: account.accountSubtype,
      currentBalance: account.currentBalance,
      availableBalance: account.availableBalance,
      currency: account.currency,
      lastSync: account.lastSync,
      isDemo: true,
    }));
  }

  /**
   * Sync demo account - updates balance slightly for realism.
   */
  async syncDemoAccount(accountId: string, userId: string) {
    const account = await this.prisma.plaidAccount.findFirst({
      where: {
        id: accountId,
        userId,
        isDemo: true,
      },
    });

    if (!account) {
      return null;
    }

    // Slightly vary the balance for realism (+/- $50)
    const variance = (Math.random() - 0.5) * 100;
    const newBalance = Math.max(0, account.currentBalance + variance);

    const updated = await this.prisma.plaidAccount.update({
      where: { id: accountId },
      data: {
        currentBalance: newBalance,
        availableBalance: newBalance - 200, // Keep $200 buffer
        lastSync: new Date(),
      },
    });

    this.logger.log(`Synced demo account ${accountId}`);

    return {
      id: updated.id,
      currentBalance: updated.currentBalance,
      availableBalance: updated.availableBalance,
      lastSync: updated.lastSync,
    };
  }

  /**
   * Get demo transactions.
   * Returns mock transaction data.
   */
  async getDemoTransactions(accountId: string, userId: string) {
    const account = await this.prisma.plaidAccount.findFirst({
      where: {
        id: accountId,
        userId,
        isDemo: true,
      },
    });

    if (!account) {
      return [];
    }

    // Return mock transactions
    return DEMO_TRANSACTIONS.map((tx) => ({
      transactionId: tx.transactionId,
      accountId: account.plaidAccountId,
      amount: tx.amount,
      name: tx.name,
      merchantName: tx.merchantName,
      category: tx.category,
      date: tx.date,
      pending: tx.pending,
      currency: 'USD',
    }));
  }

  /**
   * Create mock transactions in database for demo account.
   * Called during demo user reset.
   */
  async seedDemoTransactions(plaidAccountId: string): Promise<void> {
    for (const tx of DEMO_TRANSACTIONS) {
      await this.prisma.plaidTransaction.create({
        data: {
          plaidAccountId,
          transactionId: tx.transactionId,
          amount: tx.amount,
          currency: 'USD',
          date: tx.date,
          name: tx.name,
          merchantName: tx.merchantName,
          category: tx.category,
          categories: [tx.category],
          pending: tx.pending,
        },
      });
    }

    this.logger.log(
      `Seeded ${DEMO_TRANSACTIONS.length} demo transactions for account ${plaidAccountId}`,
    );
  }
}
