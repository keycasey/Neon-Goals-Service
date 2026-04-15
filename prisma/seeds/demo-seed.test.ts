import { describe, expect, it } from 'bun:test';

import {
  demoPlaidAccountSeeds,
  demoPlaidTransactionSeeds,
  groupGoalSeeds,
  itemGoalSeeds,
} from './demo-seed';

describe('demoPlaidTransactionSeeds', () => {
  it('uses Plaid sign conventions for seeded demo transactions', () => {
    const payroll = demoPlaidTransactionSeeds.filter((txn) =>
      txn.transactionId.startsWith('demo-payroll-'),
    );
    const rent = demoPlaidTransactionSeeds.filter((txn) =>
      txn.transactionId.startsWith('demo-rent-'),
    );
    const utilities = demoPlaidTransactionSeeds.filter((txn) =>
      txn.transactionId.startsWith('demo-utilities-'),
    );
    const groceries = demoPlaidTransactionSeeds.filter((txn) =>
      txn.transactionId.startsWith('demo-grocery-'),
    );

    expect(payroll.every((txn) => txn.amount < 0)).toBe(true);
    expect(rent.every((txn) => txn.amount > 0)).toBe(true);
    expect(utilities.every((txn) => txn.amount > 0)).toBe(true);
    expect(groceries.every((txn) => txn.amount > 0)).toBe(true);
  });

  it('includes a baseline credit card and duplicate restaurant examples across accounts', () => {
    expect(
      demoPlaidAccountSeeds.some(
        (account) =>
          account.plaidAccountId === 'demo-credit-account' &&
          account.accountType === 'credit',
      ),
    ).toBe(true);

    const korianderTransactions = demoPlaidTransactionSeeds.filter((txn) =>
      txn.transactionId.startsWith('demo-restaurant-'),
    );

    expect(korianderTransactions).toHaveLength(4);
    expect(
      korianderTransactions.filter((txn) => txn.plaidAccountId === 'demo-checking-account'),
    ).toHaveLength(2);
    expect(
      korianderTransactions.filter((txn) => txn.plaidAccountId === 'demo-credit-account'),
    ).toHaveLength(2);
    expect(korianderTransactions.map((txn) => txn.merchantName)).toEqual([
      'Koriander Indian Kitchen',
      'Koriander Indian Kitchen',
      'Koriander Indian Cuis',
      'Koriander Indian Cuis',
    ]);
  });

  it('includes enough recurring and ignored patterns to demo projections well', () => {
    expect(demoPlaidTransactionSeeds.length).toBeGreaterThanOrEqual(24);

    const restaurantVariants = demoPlaidTransactionSeeds.filter((txn) =>
      txn.transactionId.startsWith('demo-restaurant-'),
    );
    const cardPayments = demoPlaidTransactionSeeds.filter((txn) =>
      txn.transactionId.startsWith('demo-credit-payment-'),
    );
    const savingsInterest = demoPlaidTransactionSeeds.filter((txn) =>
      txn.transactionId.startsWith('demo-savings-interest-'),
    );

    expect(restaurantVariants).toHaveLength(4);
    expect(cardPayments).toHaveLength(2);
    expect(cardPayments.every((txn) => txn.amount > 0)).toBe(true);
    expect(savingsInterest).toHaveLength(3);
    expect(savingsInterest.every((txn) => txn.amount < 0)).toBe(true);
  });
});

describe('demo goal seeds', () => {
  it('includes the current demo group goals and nested children', () => {
    expect(groupGoalSeeds.map((goal) => goal.id)).toEqual([
      'group-1',
      'group-2',
      'group-3',
      'group-4',
    ]);

    expect(groupGoalSeeds.map((goal) => goal.title)).toEqual([
      'Custom Longboard Build',
      'Home Office Setup',
      'Japan Trip 2026',
      'Investment Portfolio 2026',
    ]);

    expect(groupGoalSeeds[0]?.subgoals.map((goal) => goal.id)).toEqual([
      'item-longboard-1',
      'item-longboard-2',
      'item-longboard-3',
      'item-longboard-4',
    ]);

    expect(groupGoalSeeds[2]?.subgoals.map((goal) => goal.id)).toEqual([
      'finance-travel-1',
      'action-travel-1',
      'group-3-1',
    ]);
  });

  it('matches the item selection/completion story used by the current demo view', () => {
    const sony = itemGoalSeeds.find((goal) => goal.id === 'item-1');
    const macbook = itemGoalSeeds.find((goal) => goal.id === 'item-2');
    const longboardDeck = itemGoalSeeds.find((goal) => goal.id === 'item-5');
    const homeOfficeChair = groupGoalSeeds[1]?.subgoals.find((goal) => goal.id === 'item-office-1');

    expect(sony?.selectedCandidateId).toBe('sony-1');
    expect(macbook?.selectedCandidateId).toBe('mac-1');
    expect(longboardDeck?.selectedCandidateId).toBeUndefined();
    expect(homeOfficeChair).toMatchObject({
      status: 'completed',
      selectedCandidateId: 'chair-2',
    });
  });
});
