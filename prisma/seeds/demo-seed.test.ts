import { describe, expect, it } from 'bun:test';

import { demoPlaidAccountSeeds, demoPlaidTransactionSeeds } from './demo-seed';

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
