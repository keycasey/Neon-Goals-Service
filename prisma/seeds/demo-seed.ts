/**
 * Demo user seed data
 *
 * This data mirrors the frontend's mockGoals.ts to provide
 * consistent demo experience between frontend mock mode and backend demo user.
 *
 * Used by DemoResetService to reset demo user data every 30 minutes.
 */

import { PrismaClient, GoalType, GoalStatus, ItemStatusBadge, ItemCategory } from '@prisma/client';

const prisma = new PrismaClient();

// Demo user email (must match DEMO_USER_EMAIL env var)
export const DEMO_USER_EMAIL = 'demo@goals-af.com';

// Types for seed data
interface TaskSeed {
  title: string;
  completed: boolean;
}

interface ItemGoalSeed {
  title: string;
  description: string;
  productImage: string | null;
  bestPrice: number;
  currency: string;
  retailerUrl: string;
  retailerName: string;
  statusBadge: ItemStatusBadge;
  category: ItemCategory;
}

interface FinanceGoalSeed {
  title: string;
  description: string;
  institutionIcon: string;
  accountName: string;
  currentBalance: number;
  targetBalance: number;
  currency: string;
  progressHistory: number[];
}

interface ActionGoalSeed {
  title: string;
  description: string;
  completionPercentage: number;
  tasks: TaskSeed[];
}

interface DemoPlaidAccountSeed {
  plaidAccountId: string;
  institutionName: string;
  institutionId: string;
  accountName: string;
  accountMask: string;
  accountType: string;
  accountSubtype: string;
  currentBalance: number;
  availableBalance: number;
  currency: string;
}

interface DemoPlaidTransactionSeed {
  plaidAccountId: string;
  transactionId: string;
  amount: number;
  date: string;
  name: string;
  merchantName?: string;
  category: string;
  categories?: string[];
  pending?: boolean;
}

// Item goals seed data
export const itemGoalSeeds: ItemGoalSeed[] = [
  {
    title: 'Sony WH-1000XM5 Headphones',
    description: 'Premium noise-canceling wireless headphones for work and travel',
    productImage: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400',
    bestPrice: 299.00,
    currency: 'USD',
    retailerUrl: 'https://amazon.com/dp/B0C4HYX144',
    retailerName: 'Amazon',
    statusBadge: ItemStatusBadge.price_drop,
    category: ItemCategory.technology,
  },
  {
    title: 'MacBook Pro 16" M3 Max',
    description: 'Ultimate powerhouse for creative work and development',
    productImage: 'https://images.unsplash.com/photo-1517336714731-489679fd1ca8?w=400',
    bestPrice: 2499.00,
    currency: 'USD',
    retailerUrl: 'https://apple.com/macbook-pro',
    retailerName: 'Apple',
    statusBadge: ItemStatusBadge.in_stock,
    category: ItemCategory.technology,
  },
  {
    title: 'Herman Miller Aeron Chair',
    description: 'Ergonomic office chair for long work sessions',
    productImage: 'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=400',
    bestPrice: 895.00,
    currency: 'USD',
    retailerUrl: 'https://amazon.com/herman-miller-aeron',
    retailerName: 'Amazon',
    statusBadge: ItemStatusBadge.pending_search,
    category: ItemCategory.furniture,
  },
  {
    title: 'DJI Mini 4 Pro Drone',
    description: 'Compact drone for aerial photography and videography',
    productImage: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400',
    bestPrice: 759.00,
    currency: 'USD',
    retailerUrl: 'https://djistore.com/mini-4-pro',
    retailerName: 'DJI Store',
    statusBadge: ItemStatusBadge.in_stock,
    category: ItemCategory.technology,
  },
  {
    title: 'Longboard Deck',
    description: 'Loaded Tan Tien flex 2 deck - smooth carving bamboo',
    productImage: 'https://images.unsplash.com/photo-1547447134-cd3f5c716030?w=400',
    bestPrice: 189.00,
    currency: 'USD',
    retailerUrl: 'https://loadedboards.com/tan-tien',
    retailerName: 'Loaded Boards',
    statusBadge: ItemStatusBadge.in_stock,
    category: ItemCategory.sporting_goods,
  },
  {
    title: 'Longboard Wheels',
    description: 'Orangatang Stimulus 70mm 86a - grippy urethane',
    productImage: 'https://images.unsplash.com/photo-1604754742629-3e5728249d73?w=400',
    bestPrice: 56.00,
    currency: 'USD',
    retailerUrl: 'https://orangatangwheels.com/stimulus',
    retailerName: 'Orangatang',
    statusBadge: ItemStatusBadge.price_drop,
    category: ItemCategory.sporting_goods,
  },
  {
    title: 'Longboard Trucks',
    description: 'Paris V3 180mm 50° - precision cast trucks',
    productImage: 'https://images.unsplash.com/photo-1531565637446-32307b194362?w=400',
    bestPrice: 64.95,
    currency: 'USD',
    retailerUrl: 'https://paristruckco.com/v3-180mm',
    retailerName: 'Paris Truck Co',
    statusBadge: ItemStatusBadge.in_stock,
    category: ItemCategory.sporting_goods,
  },
];

// Finance goals seed data
export const financeGoalSeeds: FinanceGoalSeed[] = [
  {
    title: 'Emergency Fund',
    description: '6 months of expenses for financial security',
    institutionIcon: '🏦',
    accountName: 'Chase Savings',
    currentBalance: 18500.00,
    targetBalance: 30000.00,
    currency: 'USD',
    progressHistory: [5000, 7500, 10000, 12000, 14000, 16000, 17500, 18500],
  },
  {
    title: 'Down Payment on House',
    description: 'Save $100,000 for a down payment on first home',
    institutionIcon: '🏠',
    accountName: 'Ally High-Yield Savings',
    currentBalance: 45250.00,
    targetBalance: 100000.00,
    currency: 'USD',
    progressHistory: [10000, 15000, 20000, 25000, 30000, 35000, 40000, 45250],
  },
  {
    title: 'Investment Portfolio',
    description: 'Build a diversified stock portfolio for long-term growth',
    institutionIcon: '📈',
    accountName: 'Fidelity IRA',
    currentBalance: 28750.00,
    targetBalance: 50000.00,
    currency: 'USD',
    progressHistory: [5000, 8000, 12000, 15000, 18000, 21000, 25000, 28750],
  },
  {
    title: 'Travel Fund - Japan Trip',
    description: 'Save up for an amazing 2-week trip to Japan',
    institutionIcon: '✈️',
    accountName: 'Capital One 360',
    currentBalance: 4200.00,
    targetBalance: 8000.00,
    currency: 'USD',
    progressHistory: [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4200],
  },
];

// Action goals seed data
export const actionGoalSeeds: ActionGoalSeed[] = [
  {
    title: 'Learn Japanese',
    description: 'Reach conversational fluency in Japanese (N3 level)',
    completionPercentage: 35,
    tasks: [
      { title: 'Master Hiragana and Katakana', completed: true },
      { title: 'Complete Genki I textbook', completed: true },
      { title: 'Learn 500 kanji characters', completed: false },
      { title: 'Practice daily conversation with language partner', completed: false },
      { title: 'Watch Japanese media without subtitles', completed: false },
    ],
  },
  {
    title: 'Build Morning Exercise Routine',
    description: 'Establish a consistent 30-minute morning workout habit',
    completionPercentage: 60,
    tasks: [
      { title: 'Wake up at 6am daily for 30 days', completed: true },
      { title: 'Create workout playlist', completed: true },
      { title: 'Week 1-2: Light stretching and yoga', completed: true },
      { title: 'Week 3-4: Add bodyweight exercises', completed: true },
      { title: 'Week 5-6: Incorporate resistance training', completed: false },
      { title: 'Week 7-8: Full HIIT workouts', completed: false },
    ],
  },
  {
    title: 'Read 24 Books This Year',
    description: 'Read 2 books per month to foster learning and growth',
    completionPercentage: 50,
    tasks: [
      { title: 'Create reading list of 24 books', completed: true },
      { title: 'Set up reading nook at home', completed: true },
      { title: 'January: Atomic Habits', completed: true },
      { title: 'January: Deep Work', completed: true },
      { title: 'February: The Psychology of Money', completed: true },
      { title: 'February: Thinking, Fast and Slow', completed: true },
      { title: 'March: The Lean Startup', completed: true },
      { title: 'March: Zero to One', completed: true },
      { title: 'April: Good Strategy Bad Strategy', completed: true },
      { title: 'April: The Mom Test', completed: true },
      { title: 'May: Start with Why', completed: false },
      { title: 'May: Built to Last', completed: false },
    ],
  },
  {
    title: 'Launch Side Project',
    description: 'Build and launch a SaaS product to generate passive income',
    completionPercentage: 20,
    tasks: [
      { title: 'Brainstorm product ideas', completed: true },
      { title: 'Validate idea with potential users', completed: true },
      { title: 'Create MVP roadmap', completed: false },
      { title: 'Build landing page', completed: false },
      { title: 'Develop core features', completed: false },
      { title: 'Beta testing with early users', completed: false },
      { title: 'Launch on Product Hunt', completed: false },
      { title: 'Get first 10 paying customers', completed: false },
    ],
  },
];

export const demoPlaidAccountSeeds: DemoPlaidAccountSeed[] = [
  {
    plaidAccountId: 'demo-checking-account',
    institutionName: 'Demo Bank',
    institutionId: 'ins_demo',
    accountName: 'Everyday Checking',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    currentBalance: 4823.47,
    availableBalance: 4623.47,
    currency: 'USD',
  },
  {
    plaidAccountId: 'demo-savings-account',
    institutionName: 'Demo Bank',
    institutionId: 'ins_demo',
    accountName: 'High Yield Savings',
    accountMask: '5678',
    accountType: 'depository',
    accountSubtype: 'savings',
    currentBalance: 18250.0,
    availableBalance: 18250.0,
    currency: 'USD',
  },
  {
    plaidAccountId: 'demo-credit-account',
    institutionName: 'Demo Bank',
    institutionId: 'ins_demo',
    accountName: 'Rewards Credit Card',
    accountMask: '9012',
    accountType: 'credit',
    accountSubtype: 'credit card',
    currentBalance: 642.18,
    availableBalance: 4357.82,
    currency: 'USD',
  },
];

export const demoPlaidTransactionSeeds: DemoPlaidTransactionSeed[] = [
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-payroll-2026-02',
    amount: -2500.0,
    date: '2026-02-01T00:00:00.000Z',
    name: 'Payroll',
    merchantName: 'Employer Inc',
    category: 'Income',
    categories: ['Income'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-payroll-2026-03',
    amount: -2500.0,
    date: '2026-03-01T00:00:00.000Z',
    name: 'Payroll',
    merchantName: 'Employer Inc',
    category: 'Income',
    categories: ['Income'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-payroll-2026-04',
    amount: -2500.0,
    date: '2026-04-01T00:00:00.000Z',
    name: 'Payroll',
    merchantName: 'Employer Inc',
    category: 'Income',
    categories: ['Income'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-rent-2026-02',
    amount: 1450.0,
    date: '2026-02-03T00:00:00.000Z',
    name: 'Monthly Rent',
    merchantName: 'Parkside Apartments',
    category: 'Rent',
    categories: ['Rent', 'Housing'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-rent-2026-03',
    amount: 1450.0,
    date: '2026-03-03T00:00:00.000Z',
    name: 'Monthly Rent',
    merchantName: 'Parkside Apartments',
    category: 'Rent',
    categories: ['Rent', 'Housing'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-rent-2026-04',
    amount: 1450.0,
    date: '2026-04-03T00:00:00.000Z',
    name: 'Monthly Rent',
    merchantName: 'Parkside Apartments',
    category: 'Rent',
    categories: ['Rent', 'Housing'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-utilities-2026-02',
    amount: 152.34,
    date: '2026-02-08T00:00:00.000Z',
    name: 'Utility Bill',
    merchantName: 'Electric Company',
    category: 'Utilities',
    categories: ['Utilities'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-utilities-2026-03',
    amount: 149.86,
    date: '2026-03-08T00:00:00.000Z',
    name: 'Utility Bill',
    merchantName: 'Electric Company',
    category: 'Utilities',
    categories: ['Utilities'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-utilities-2026-04',
    amount: 154.12,
    date: '2026-04-08T00:00:00.000Z',
    name: 'Utility Bill',
    merchantName: 'Electric Company',
    category: 'Utilities',
    categories: ['Utilities'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-streaming-2026-02',
    amount: 18.99,
    date: '2026-02-11T00:00:00.000Z',
    name: 'Streaming Services',
    merchantName: 'Netflix',
    category: 'Entertainment',
    categories: ['Entertainment'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-streaming-2026-03',
    amount: 18.99,
    date: '2026-03-11T00:00:00.000Z',
    name: 'Streaming Services',
    merchantName: 'Netflix',
    category: 'Entertainment',
    categories: ['Entertainment'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-streaming-2026-04',
    amount: 18.99,
    date: '2026-04-11T00:00:00.000Z',
    name: 'Streaming Services',
    merchantName: 'Netflix',
    category: 'Entertainment',
    categories: ['Entertainment'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-grocery-2026-04-02',
    amount: 96.42,
    date: '2026-04-02T00:00:00.000Z',
    name: 'Grocery Store',
    merchantName: 'Whole Foods',
    category: 'Food and Drink',
    categories: ['Food and Drink', 'Groceries'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-grocery-2026-04-05',
    amount: 84.17,
    date: '2026-04-05T00:00:00.000Z',
    name: 'Grocery Store',
    merchantName: 'Trader Joe\'s',
    category: 'Food and Drink',
    categories: ['Food and Drink', 'Groceries'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-credit-payment-2026-03',
    amount: 615.42,
    date: '2026-03-18T00:00:00.000Z',
    name: 'Credit Card Payment Thank You',
    merchantName: 'Rewards Credit Card',
    category: 'Transfer',
    categories: ['Transfer', 'Credit Card Payment'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-credit-payment-2026-04',
    amount: 642.18,
    date: '2026-04-18T00:00:00.000Z',
    name: 'Credit Card Payment Thank You',
    merchantName: 'Rewards Credit Card',
    category: 'Transfer',
    categories: ['Transfer', 'Credit Card Payment'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-restaurant-debit-2026-02',
    amount: 26.14,
    date: '2026-02-14T00:00:00.000Z',
    name: 'Koriander Indian Kitchen',
    merchantName: 'Koriander Indian Kitchen',
    category: 'Food and Drink',
    categories: ['Food and Drink', 'Restaurants'],
  },
  {
    plaidAccountId: 'demo-checking-account',
    transactionId: 'demo-restaurant-debit-2026-03',
    amount: 27.48,
    date: '2026-03-14T00:00:00.000Z',
    name: 'Koriander Indian Kitchen',
    merchantName: 'Koriander Indian Kitchen',
    category: 'Food and Drink',
    categories: ['Food and Drink', 'Restaurants'],
  },
  {
    plaidAccountId: 'demo-savings-account',
    transactionId: 'demo-savings-transfer-2026-02',
    amount: -800.0,
    date: '2026-02-05T00:00:00.000Z',
    name: 'Savings Transfer',
    merchantName: 'Internal Transfer',
    category: 'Transfer',
    categories: ['Transfer', 'Savings'],
  },
  {
    plaidAccountId: 'demo-savings-account',
    transactionId: 'demo-savings-transfer-2026-03',
    amount: -800.0,
    date: '2026-03-05T00:00:00.000Z',
    name: 'Savings Transfer',
    merchantName: 'Internal Transfer',
    category: 'Transfer',
    categories: ['Transfer', 'Savings'],
  },
  {
    plaidAccountId: 'demo-savings-account',
    transactionId: 'demo-savings-transfer-2026-04',
    amount: -800.0,
    date: '2026-04-05T00:00:00.000Z',
    name: 'Savings Transfer',
    merchantName: 'Internal Transfer',
    category: 'Transfer',
    categories: ['Transfer', 'Savings'],
  },
  {
    plaidAccountId: 'demo-savings-account',
    transactionId: 'demo-savings-interest-2026-02',
    amount: -18.25,
    date: '2026-02-28T00:00:00.000Z',
    name: 'Interest Payment',
    merchantName: 'Demo Bank Interest',
    category: 'Income',
    categories: ['Income', 'Interest'],
  },
  {
    plaidAccountId: 'demo-savings-account',
    transactionId: 'demo-savings-interest-2026-03',
    amount: -19.10,
    date: '2026-03-31T00:00:00.000Z',
    name: 'Interest Payment',
    merchantName: 'Demo Bank Interest',
    category: 'Income',
    categories: ['Income', 'Interest'],
  },
  {
    plaidAccountId: 'demo-savings-account',
    transactionId: 'demo-savings-interest-2026-04',
    amount: -19.84,
    date: '2026-04-30T00:00:00.000Z',
    name: 'Interest Payment',
    merchantName: 'Demo Bank Interest',
    category: 'Income',
    categories: ['Income', 'Interest'],
  },
  {
    plaidAccountId: 'demo-credit-account',
    transactionId: 'demo-restaurant-credit-2026-02',
    amount: 31.08,
    date: '2026-02-15T00:00:00.000Z',
    name: 'Koriander Indian Cuis',
    merchantName: 'Koriander Indian Cuis',
    category: 'Food and Drink',
    categories: ['Food and Drink', 'Restaurants'],
  },
  {
    plaidAccountId: 'demo-credit-account',
    transactionId: 'demo-restaurant-credit-2026-03',
    amount: 29.12,
    date: '2026-03-15T00:00:00.000Z',
    name: 'Koriander Indian Cuis',
    merchantName: 'Koriander Indian Cuis',
    category: 'Food and Drink',
    categories: ['Food and Drink', 'Restaurants'],
  },
];

/**
 * Seed demo user data
 * Creates all goals, goal-specific data, and demo Plaid account
 */
export async function seedDemoUser(userId: string): Promise<void> {
  // Create item goals
  for (const seed of itemGoalSeeds) {
    const goal = await prisma.goal.create({
      data: {
        userId,
        type: GoalType.item,
        title: seed.title,
        description: seed.description,
        status: GoalStatus.active,
        itemData: {
          create: {
            productImage: seed.productImage,
            bestPrice: seed.bestPrice,
            currency: seed.currency,
            retailerUrl: seed.retailerUrl,
            retailerName: seed.retailerName,
            statusBadge: seed.statusBadge,
            category: seed.category,
          },
        },
      },
    });
  }

  // Create finance goals
  for (const seed of financeGoalSeeds) {
    await prisma.goal.create({
      data: {
        userId,
        type: GoalType.finance,
        title: seed.title,
        description: seed.description,
        status: GoalStatus.active,
        financeData: {
          create: {
            institutionIcon: seed.institutionIcon,
            accountName: seed.accountName,
            currentBalance: seed.currentBalance,
            targetBalance: seed.targetBalance,
            currency: seed.currency,
            progressHistory: seed.progressHistory,
            lastSync: new Date(),
          },
        },
      },
    });
  }

  // Create action goals
  for (const seed of actionGoalSeeds) {
    await prisma.goal.create({
      data: {
        userId,
        type: GoalType.action,
        title: seed.title,
        description: seed.description,
        status: GoalStatus.active,
        actionData: {
          create: {
            completionPercentage: seed.completionPercentage,
            tasks: {
              create: seed.tasks.map((task) => ({
                title: task.title,
                completed: task.completed,
              })),
            },
          },
        },
      },
    });
  }

  const createdAccounts = new Map<string, string>();

  for (const seed of demoPlaidAccountSeeds) {
    const account = await prisma.plaidAccount.create({
      data: {
        userId,
        accessToken: 'demo-sandbox-token',
        itemId: `demo-item-${seed.plaidAccountId}`,
        plaidAccountId: seed.plaidAccountId,
        institutionName: seed.institutionName,
        institutionId: seed.institutionId,
        accountName: seed.accountName,
        accountMask: seed.accountMask,
        accountType: seed.accountType,
        accountSubtype: seed.accountSubtype,
        currentBalance: seed.currentBalance,
        availableBalance: seed.availableBalance,
        currency: seed.currency,
        isDemo: true,
        isActive: true,
      },
    });

    createdAccounts.set(seed.plaidAccountId, account.id);
  }

  for (const tx of demoPlaidTransactionSeeds) {
    const accountId = createdAccounts.get(tx.plaidAccountId);
    if (!accountId) continue;

    await prisma.plaidTransaction.create({
      data: {
        plaidAccountId: accountId,
        transactionId: tx.transactionId,
        amount: tx.amount,
        currency: 'USD',
        date: new Date(tx.date),
        name: tx.name,
        merchantName: tx.merchantName,
        category: tx.category,
        categories: tx.categories ?? [tx.category],
        pending: tx.pending ?? false,
      },
    });
  }

  // Create user usage record for rate limiting
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0); // Next UTC midnight

  await prisma.userUsage.create({
    data: {
      userId,
      messageCount: 0,
      resetAt: tomorrow,
    },
  });
}

/**
 * Clear all demo user data
 * Used before reseeding
 */
export async function clearDemoUserData(userId: string): Promise<void> {
  // Delete in order to respect foreign key constraints
  // Goals will cascade to itemData, financeData, actionData, tasks, scrapeJobs

  // Delete Plaid transactions first
  await prisma.plaidTransaction.deleteMany({
    where: {
      account: { userId },
    },
  });

  // Delete Plaid accounts
  await prisma.plaidAccount.deleteMany({
    where: { userId },
  });

  // Delete messages
  await prisma.message.deleteMany({
    where: { userId },
  });

  // Delete conversation summaries
  await prisma.conversationSummary.deleteMany({
    where: {
      chat: { userId },
    },
  });

  // Delete chat states
  await prisma.chatState.deleteMany({
    where: { userId },
  });

  // Delete goals (cascades to goal-specific data)
  await prisma.goal.deleteMany({
    where: { userId },
  });

  // Delete usage record
  await prisma.userUsage.deleteMany({
    where: { userId },
  });
}

/**
 * Full demo user reset
 * Clears existing data and reseeds
 */
export async function resetDemoUser(userId: string): Promise<void> {
  await clearDemoUserData(userId);
  await seedDemoUser(userId);
}

// Run if called directly
if (require.main === module) {
  const run = async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { email: DEMO_USER_EMAIL },
      });

      if (!user) {
        console.error(`Demo user not found: ${DEMO_USER_EMAIL}`);
        process.exit(1);
      }

      console.log(`Resetting demo user: ${user.id}`);
      await resetDemoUser(user.id);
      console.log('Demo user reset complete');
    } catch (error) {
      console.error('Error resetting demo user:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  };

  run();
}
