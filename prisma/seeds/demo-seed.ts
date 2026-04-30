/**
 * Demo user seed data
 *
 * This data mirrors the shared demo seed dataset to provide
 * consistent demo experience between frontend demo mode and backend demo user.
 *
 * Used by DemoResetService to reset demo user data every 30 minutes.
 */

import { PrismaClient, GoalType, GoalStatus, ItemStatusBadge, ItemCategory } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  mockActionGoals,
  mockFinanceGoals,
  mockGoals,
  mockItemGoals,
} from './demo-data/goals';

const prisma = new PrismaClient();

// Demo user email (must match DEMO_USER_EMAIL env var)
export const DEMO_USER_EMAIL = 'demo@goals-af.com';

// Types for seed data
interface TaskSeed {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
}

interface ItemGoalSeed {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  productImage: string | null;
  bestPrice: number;
  currency: string;
  retailerUrl: string;
  retailerName: string;
  statusBadge: ItemStatusBadge;
  category: ItemCategory;
  searchResults?: Prisma.InputJsonValue;
  candidates?: Prisma.InputJsonValue;
  selectedCandidateId?: string;
  shortlistedCandidates?: Prisma.InputJsonValue;
  deniedCandidates?: Prisma.InputJsonValue;
  stackId?: string;
  stackOrder?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FinanceGoalSeed {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  institutionIcon: string;
  accountName: string;
  currentBalance: number;
  targetBalance: number;
  currency: string;
  progressHistory: number[];
  createdAt: Date;
  updatedAt: Date;
}

interface ActionGoalSeed {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  completionPercentage: number;
  tasks: TaskSeed[];
  createdAt: Date;
  updatedAt: Date;
}

interface GroupGoalSeed {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  icon?: string;
  color?: string;
  layout: 'grid' | 'list' | 'kanban';
  progressType: 'average' | 'sum' | 'manual';
  createdAt: Date;
  updatedAt: Date;
  subgoals: GoalSeed[];
}

type GoalSeed = ItemGoalSeed | FinanceGoalSeed | ActionGoalSeed | GroupGoalSeed;

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

const STATUS_BADGE_MAP: Record<string, ItemStatusBadge> = {
  'in-stock': ItemStatusBadge.in_stock,
  in_stock: ItemStatusBadge.in_stock,
  'price-drop': ItemStatusBadge.price_drop,
  price_drop: ItemStatusBadge.price_drop,
  'pending-search': ItemStatusBadge.pending_search,
  pending_search: ItemStatusBadge.pending_search,
  candidates_found: ItemStatusBadge.candidates_found,
  not_found: ItemStatusBadge.not_found,
  not_supported: ItemStatusBadge.not_supported,
};

const CATEGORY_BY_TITLE: Record<string, ItemCategory> = {
  'Sony WH-1000XM5 Headphones': ItemCategory.technology,
  'MacBook Pro 16" M3 Max': ItemCategory.technology,
  'Herman Miller Aeron Chair': ItemCategory.furniture,
  'DJI Mini 4 Pro Drone': ItemCategory.technology,
  'Longboard Deck': ItemCategory.sporting_goods,
  'Longboard Wheels': ItemCategory.sporting_goods,
  'Longboard Trucks': ItemCategory.sporting_goods,
  'Longboard Deck - 42"': ItemCategory.sporting_goods,
  'Longboard Trucks - Paris V3': ItemCategory.sporting_goods,
  'Longboard Wheels - 70mm': ItemCategory.sporting_goods,
  'Bearings - Bones Reds': ItemCategory.sporting_goods,
  'Herman Miller Aeron Chair::group': ItemCategory.furniture,
  'Sony A7 IV Camera': ItemCategory.technology,
  'Travel Tripod': ItemCategory.technology,
};

const normalizeItemSeed = (goal: any, categoryKey = goal.title): ItemGoalSeed => ({
  id: goal.id,
  title: goal.title,
  description: goal.description,
  status: goal.status === 'completed' ? GoalStatus.completed : GoalStatus.active,
  productImage: goal.productImage,
  bestPrice: goal.bestPrice,
  currency: goal.currency,
  retailerUrl: goal.retailerUrl,
  retailerName: goal.retailerName,
  statusBadge: STATUS_BADGE_MAP[goal.statusBadge] ?? ItemStatusBadge.pending_search,
  category: CATEGORY_BY_TITLE[categoryKey] ?? ItemCategory.general,
  searchResults: goal.searchResults,
  candidates: goal.candidates,
  selectedCandidateId: goal.selectedCandidateId,
  shortlistedCandidates: goal.shortlistedCandidates,
  deniedCandidates: goal.deniedCandidates,
  stackId: goal.stackId,
  stackOrder: goal.stackOrder,
  createdAt: goal.createdAt,
  updatedAt: goal.updatedAt,
});

const normalizeFinanceSeed = (goal: any): FinanceGoalSeed => ({
  id: goal.id,
  title: goal.title,
  description: goal.description,
  status: goal.status === 'completed' ? GoalStatus.completed : GoalStatus.active,
  institutionIcon: goal.institutionIcon,
  accountName: goal.accountName,
  currentBalance: goal.currentBalance,
  targetBalance: goal.targetBalance,
  currency: goal.currency,
  progressHistory: goal.progressHistory,
  createdAt: goal.createdAt,
  updatedAt: goal.updatedAt,
});

const normalizeActionSeed = (goal: any): ActionGoalSeed => ({
  id: goal.id,
  title: goal.title,
  description: goal.description,
  status: goal.status === 'completed' ? GoalStatus.completed : GoalStatus.active,
  completionPercentage: goal.completionPercentage,
  tasks: goal.tasks.map((task: any) => ({
    id: task.id,
    title: task.title,
    completed: task.completed,
    createdAt: task.createdAt,
  })),
  createdAt: goal.createdAt,
  updatedAt: goal.updatedAt,
});

const normalizeGoalSeed = (goal: any): GoalSeed => {
  if (goal.type === 'item') return normalizeItemSeed(goal);
  if (goal.type === 'finance') return normalizeFinanceSeed(goal);
  if (goal.type === 'action') return normalizeActionSeed(goal);

  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    status: goal.status === 'completed' ? GoalStatus.completed : GoalStatus.active,
    icon: goal.icon,
    color: goal.color,
    layout: goal.layout,
    progressType: goal.progressType,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
    subgoals: goal.subgoals.map((subgoal: any) =>
      subgoal.id === 'item-office-1'
        ? normalizeItemSeed({ ...subgoal, selectedCandidateId: 'chair-2' }, `${subgoal.title}::group`)
        : normalizeGoalSeed(subgoal),
    ),
  } satisfies GroupGoalSeed;
};

export const itemGoalSeeds: ItemGoalSeed[] = mockItemGoals.map((goal) => normalizeItemSeed(goal));
export const financeGoalSeeds: FinanceGoalSeed[] = mockFinanceGoals.map((goal) => normalizeFinanceSeed(goal));
export const actionGoalSeeds: ActionGoalSeed[] = mockActionGoals.map((goal) => normalizeActionSeed(goal));
export const groupGoalSeeds: GroupGoalSeed[] = mockGoals
  .filter((goal) => goal.type === 'group')
  .map((goal) => normalizeGoalSeed(goal) as GroupGoalSeed);

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
  const seedGoal = async (seed: GoalSeed, parentGoalId?: string): Promise<void> => {
    if ('subgoals' in seed) {
      await prisma.goal.create({
        data: {
          id: seed.id,
          userId,
          type: GoalType.group,
          title: seed.title,
          description: seed.description,
          status: seed.status,
          parentGoalId,
          createdAt: seed.createdAt,
          updatedAt: seed.updatedAt,
          groupData: {
            create: {
              icon: seed.icon,
              color: seed.color,
              layout: seed.layout,
              progressType: seed.progressType,
              progress: 0,
              createdAt: seed.createdAt,
              updatedAt: seed.updatedAt,
            },
          },
        },
      });

      for (const subgoal of seed.subgoals) {
        await seedGoal(subgoal, seed.id);
      }

      return;
    }

    if ('productImage' in seed) {
      await prisma.goal.create({
        data: {
          id: seed.id,
          userId,
          type: GoalType.item,
          title: seed.title,
          description: seed.description,
          status: seed.status,
          parentGoalId,
          createdAt: seed.createdAt,
          updatedAt: seed.updatedAt,
          itemData: {
            create: {
              productImage: seed.productImage,
              bestPrice: seed.bestPrice,
              currency: seed.currency,
              retailerUrl: seed.retailerUrl,
              retailerName: seed.retailerName,
              statusBadge: seed.statusBadge,
              searchResults: seed.searchResults ?? null,
              candidates: seed.candidates ?? null,
              selectedCandidateId: seed.selectedCandidateId ?? null,
              shortlistedCandidates: seed.shortlistedCandidates ?? null,
              deniedCandidates: seed.deniedCandidates ?? null,
              stackId: seed.stackId ?? null,
              stackOrder: seed.stackOrder ?? null,
              category: seed.category,
              createdAt: seed.createdAt,
              updatedAt: seed.updatedAt,
            },
          },
        },
      });
      return;
    }

    if ('institutionIcon' in seed) {
      await prisma.goal.create({
        data: {
          id: seed.id,
          userId,
          type: GoalType.finance,
          title: seed.title,
          description: seed.description,
          status: seed.status,
          parentGoalId,
          createdAt: seed.createdAt,
          updatedAt: seed.updatedAt,
          financeData: {
            create: {
              institutionIcon: seed.institutionIcon,
              accountName: seed.accountName,
              currentBalance: seed.currentBalance,
              targetBalance: seed.targetBalance,
              currency: seed.currency,
              progressHistory: seed.progressHistory,
              lastSync: seed.updatedAt,
              createdAt: seed.createdAt,
              updatedAt: seed.updatedAt,
            },
          },
        },
      });
      return;
    }

    await prisma.goal.create({
      data: {
        id: seed.id,
        userId,
        type: GoalType.action,
        title: seed.title,
        description: seed.description,
        status: seed.status,
        parentGoalId,
        createdAt: seed.createdAt,
        updatedAt: seed.updatedAt,
        actionData: {
          create: {
            completionPercentage: seed.completionPercentage,
            createdAt: seed.createdAt,
            updatedAt: seed.updatedAt,
            tasks: {
              create: seed.tasks.map((task) => ({
                id: task.id,
                title: task.title,
                completed: task.completed,
                createdAt: task.createdAt,
                updatedAt: seed.updatedAt,
              })),
            },
          },
        },
      },
    });
  };

  for (const seed of itemGoalSeeds) {
    await seedGoal(seed);
  }

  for (const seed of financeGoalSeeds) {
    await seedGoal(seed);
  }

  for (const seed of actionGoalSeeds) {
    await seedGoal(seed);
  }

  for (const seed of groupGoalSeeds) {
    await seedGoal(seed);
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
