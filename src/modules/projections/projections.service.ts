import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

type ProjectionHorizon = 3 | 6 | 12;

type ProjectionDataPoint = {
  month: string;
  value: number;
  isProjected: boolean;
};

type GoalForecast = {
  goalId: string;
  goalTitle: string;
  currentBalance: number;
  targetBalance: number;
  projectedCompletionDate: string | null;
  monthlyAllocation: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
};

type ProjectionOverview = {
  currentNetWorth: number;
  projectedNetWorth: number;
  monthlyNetCashflow: number;
  horizonMonths: number;
  projectedDate: string;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  assumptions: string[];
  dataPoints: ProjectionDataPoint[];
  goalMilestones: Array<{
    goalId: string;
    goalTitle: string;
    month: string;
    projectedValue: number;
    targetValue: number;
  }>;
};

type RecurringItem = {
  id: string;
  label: string;
  amount: number;
  cadence: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
  confidence: 'high' | 'medium' | 'low';
  source: 'linked' | 'manual';
  category?: string;
  accountId?: string;
  accountName?: string;
  sourceTransactionIds?: string[];
  mergedSources?: Array<{
    id: string;
    label: string;
    accountName?: string;
    sourceTransactionIds: string[];
  }>;
};

type CashflowSummary = {
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  netMonthlyCashflow: number;
  recurringIncome: RecurringItem[];
  recurringExpenses: RecurringItem[];
};

type ProjectionScenarioResult = {
  baselineNetWorth: number;
  scenarioNetWorth: number;
  delta: number;
  horizonMonths: number;
  dataPoints: ProjectionDataPoint[];
  goalForecasts: GoalForecast[];
};

type ManualFinancialAccount = {
  id: string;
  name: string;
  type: 'cash' | 'investment' | 'retirement' | 'property' | 'other';
  balance: number;
  isDebt: boolean;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

type ManualCashflow = {
  id: string;
  label: string;
  amount: number;
  type: 'income' | 'expense';
  cadence: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
  category?: string;
  createdAt: string;
  updatedAt: string;
};

type PlaidTransactionRecord = {
  transactionId: string;
  amount: number;
  date: Date;
  name: string;
  merchantName: string | null;
  category: string | null;
  categories: string[];
  paymentChannel: string | null;
  pending: boolean;
  transactionType: string | null;
};

type PlaidAccountRecord = {
  id: string;
  accountName: string;
  accountType: string;
  accountSubtype: string;
  currentBalance: number;
  availableBalance: number | null;
  currency: string;
  transactions?: PlaidTransactionRecord[];
};

type ClassifiedTransaction = PlaidTransactionRecord & {
  accountId: string;
  accountName: string;
  direction: 'income' | 'expense' | 'ignore';
  normalizedLabel: string;
  monthlyEquivalent: number;
};

type PlaidCashflowAnalysis = {
  currentNetWorth: number;
  recurringIncome: RecurringItem[];
  recurringExpenses: RecurringItem[];
  monthlyNetCashflow: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  assumptions: string[];
  transactionCount: number;
  accountCount: number;
};

type RecurringMergeOverride = {
  targetItemId: string;
  sourceItemIds: string[];
  direction: 'income' | 'expense';
};

type MergedRecurringSource = NonNullable<RecurringItem['mergedSources']>[number];

type AppliedRecurringGroups = {
  groups: Map<string, ClassifiedTransaction[]>;
  mergedSourcesByTarget: Map<string, MergedRecurringSource[]>;
};

@Injectable()
export class ProjectionsService {
  private readonly manualAccountsByUser = new Map<string, ManualFinancialAccount[]>();
  private readonly manualCashflowsByUser = new Map<string, ManualCashflow[]>();

  constructor(private readonly prisma: PrismaService) {}

  async getOverview(userId: string, horizon: number): Promise<ProjectionOverview> {
    const months = this.normalizeHorizon(horizon);
    const plaidAnalysis = await this.analyzePlaidCashflow(userId);
    const manualCashflow = this.getManualCashflowSummary(userId);
    const totalMonthlyIncome = plaidAnalysis.recurringIncome
      .reduce((sum, item) => sum + this.toMonthly(item.amount, item.cadence), 0)
      + manualCashflow.totalMonthlyIncome;
    const totalMonthlyExpenses = plaidAnalysis.recurringExpenses
      .reduce((sum, item) => sum + this.toMonthly(item.amount, item.cadence), 0)
      + manualCashflow.totalMonthlyExpenses;
    const monthlyNetCashflow = totalMonthlyIncome - totalMonthlyExpenses;
    const assumptions = [
      ...plaidAnalysis.assumptions,
      ...(manualCashflow.recurringIncome.length + manualCashflow.recurringExpenses.length > 0
        ? ['Manual cashflows are included in the projection.']
        : []),
    ];
    const confidence = this.combineConfidence([
      plaidAnalysis.confidence,
      manualCashflow.recurringIncome.length || manualCashflow.recurringExpenses.length
        ? 'medium'
        : 'insufficient',
    ]);

    const currentNetWorth = plaidAnalysis.currentNetWorth;
    const now = new Date();
    const dataPoints = this.buildDataPoints(currentNetWorth, monthlyNetCashflow, months, now);
    const projectedNetWorth = dataPoints[dataPoints.length - 1]?.value ?? currentNetWorth;
    const projectedDate = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());

    return {
      currentNetWorth,
      projectedNetWorth,
      monthlyNetCashflow,
      horizonMonths: months,
      projectedDate: projectedDate.toISOString(),
      confidence,
      assumptions,
      dataPoints,
      goalMilestones: [],
    };
  }

  async getCashflow(userId: string): Promise<CashflowSummary> {
    const plaidAnalysis = await this.analyzePlaidCashflow(userId);
    const manual = this.getManualCashflowSummary(userId);

    return {
      totalMonthlyIncome:
        plaidAnalysis.recurringIncome.reduce((sum, item) => sum + this.toMonthly(item.amount, item.cadence), 0) +
        manual.totalMonthlyIncome,
      totalMonthlyExpenses:
        plaidAnalysis.recurringExpenses.reduce((sum, item) => sum + this.toMonthly(item.amount, item.cadence), 0) +
        manual.totalMonthlyExpenses,
      netMonthlyCashflow:
        plaidAnalysis.monthlyNetCashflow + manual.totalMonthlyIncome - manual.totalMonthlyExpenses,
      recurringIncome: [...plaidAnalysis.recurringIncome, ...manual.recurringIncome],
      recurringExpenses: [...plaidAnalysis.recurringExpenses, ...manual.recurringExpenses],
    };
  }

  async getForecast(_userId: string, _horizon: number): Promise<GoalForecast[]> {
    return [];
  }

  async runScenario(
    userId: string,
    horizon: number,
    inputs: {
      monthlySavingsIncrease?: number;
      diningReduction?: number;
      subscriptionReduction?: number;
      incomeAdjustment?: number;
    },
  ): Promise<ProjectionScenarioResult> {
    const months = this.normalizeHorizon(horizon);
    const base = await this.getOverview(userId, months);
    const monthlyDelta =
      (inputs.monthlySavingsIncrease ?? 0) +
      (inputs.diningReduction ?? 0) +
      (inputs.subscriptionReduction ?? 0) +
      (inputs.incomeAdjustment ?? 0);
    const scenarioNetWorth = base.projectedNetWorth + monthlyDelta * months;
    const dataPoints = base.dataPoints.map((point, idx) => ({
      ...point,
      value: point.value + monthlyDelta * idx,
    }));

    return {
      baselineNetWorth: base.projectedNetWorth,
      scenarioNetWorth,
      delta: scenarioNetWorth - base.projectedNetWorth,
      horizonMonths: months,
      dataPoints,
      goalForecasts: await this.getForecast(userId, months),
    };
  }

  getManualAccounts(userId: string): ManualFinancialAccount[] {
    return this.manualAccountsByUser.get(userId) ?? [];
  }

  createManualAccount(userId: string, data: Omit<ManualFinancialAccount, 'id' | 'createdAt' | 'updatedAt'>): ManualFinancialAccount {
    const now = new Date().toISOString();
    const account: ManualFinancialAccount = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    const list = this.manualAccountsByUser.get(userId) ?? [];
    this.manualAccountsByUser.set(userId, [...list, account]);
    return account;
  }

  deleteManualAccount(userId: string, id: string): { deleted: boolean } {
    const list = this.manualAccountsByUser.get(userId) ?? [];
    const next = list.filter((a) => a.id !== id);
    this.manualAccountsByUser.set(userId, next);
    return { deleted: next.length !== list.length };
  }

  getManualCashflows(userId: string): ManualCashflow[] {
    return this.manualCashflowsByUser.get(userId) ?? [];
  }

  createManualCashflow(userId: string, data: Omit<ManualCashflow, 'id' | 'createdAt' | 'updatedAt'>): ManualCashflow {
    const now = new Date().toISOString();
    const cashflow: ManualCashflow = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    const list = this.manualCashflowsByUser.get(userId) ?? [];
    this.manualCashflowsByUser.set(userId, [...list, cashflow]);
    return cashflow;
  }

  deleteManualCashflow(userId: string, id: string): { deleted: boolean } {
    const list = this.manualCashflowsByUser.get(userId) ?? [];
    const next = list.filter((c) => c.id !== id);
    this.manualCashflowsByUser.set(userId, next);
    return { deleted: next.length !== list.length };
  }

  async mergeRecurringItems(
    userId: string,
    targetItemId: string,
    sourceItemId: string,
    direction: 'income' | 'expense',
  ) {
    if (targetItemId === sourceItemId) {
      return { merged: false };
    }

    const existing = await this.prisma.recurringMergeOverride.findUnique({
      where: {
        userId_targetItemId_direction: {
          userId,
          targetItemId,
          direction,
        },
      },
      select: {
        sourceItemIds: true,
      },
    });

    const nextSources = Array.from(
      new Set([...(existing?.sourceItemIds ?? []), sourceItemId]),
    ).filter((id) => id !== targetItemId);

    await this.prisma.recurringMergeOverride.upsert({
      where: {
        userId_targetItemId_direction: {
          userId,
          targetItemId,
          direction,
        },
      },
      update: {
        sourceItemIds: nextSources,
      },
      create: {
        userId,
        targetItemId,
        direction,
        sourceItemIds: nextSources,
      },
    });
    return { merged: true };
  }

  async unmergeRecurringItems(
    userId: string,
    targetItemId: string,
    sourceItemId: string,
    direction: 'income' | 'expense',
  ) {
    const existing = await this.prisma.recurringMergeOverride.findUnique({
      where: {
        userId_targetItemId_direction: {
          userId,
          targetItemId,
          direction,
        },
      },
      select: {
        sourceItemIds: true,
      },
    });

    if (!existing) {
      return { merged: false };
    }

    const nextSources = existing.sourceItemIds.filter((id) => id !== sourceItemId);
    if (nextSources.length === 0) {
      await this.prisma.recurringMergeOverride.deleteMany({
        where: {
          userId,
          targetItemId,
          direction,
        },
      });
    } else {
      await this.prisma.recurringMergeOverride.update({
        where: {
          userId_targetItemId_direction: {
            userId,
            targetItemId,
            direction,
          },
        },
        data: {
          sourceItemIds: nextSources,
        },
      });
    }
    return { merged: false };
  }

  private async analyzePlaidCashflow(userId: string): Promise<PlaidCashflowAnalysis> {
    const accounts = (await this.prisma.plaidAccount.findMany({
      where: { userId, isActive: true },
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
    })) as PlaidAccountRecord[];

    const currentNetWorth = accounts.reduce((sum, account) => {
      if (this.isDebtAccount(account.accountType, account.accountSubtype)) {
        return sum - Math.abs(account.currentBalance ?? 0);
      }
      return sum + (account.currentBalance ?? 0);
    }, 0);

    const transactions = accounts.flatMap((account) =>
      (account.transactions ?? [])
        .filter((transaction) => !transaction.pending)
        .map((transaction) => this.classifyTransaction(account, transaction)),
    );

    const recurringIncome = this.buildRecurringItems(
      await this.applyRecurringMerges(
        userId,
        'income',
        this.groupRecurringTransactions(transactions, 'income'),
      ),
    );
    const recurringExpenses = this.buildRecurringItems(
      await this.applyRecurringMerges(
        userId,
        'expense',
        this.groupRecurringTransactions(transactions, 'expense'),
      ),
    );
    const recurringNetCashflow =
      recurringIncome.reduce((sum, item) => sum + this.toMonthly(item.amount, item.cadence), 0) -
      recurringExpenses.reduce((sum, item) => sum + this.toMonthly(item.amount, item.cadence), 0);
    const fallbackMonthlyCashflow = this.estimateMonthlyCashflowFromTransactions(transactions);

    const monthlyNetCashflow = transactions.length > 0 && recurringNetCashflow === 0
      ? fallbackMonthlyCashflow
      : recurringNetCashflow || fallbackMonthlyCashflow;

    const confidence = this.estimateConfidence(accounts.length, transactions, recurringIncome, recurringExpenses);
    const assumptions = this.buildAssumptions(accounts, transactions);

    return {
      currentNetWorth,
      recurringIncome,
      recurringExpenses,
      monthlyNetCashflow,
      confidence,
      assumptions,
      transactionCount: transactions.length,
      accountCount: accounts.length,
    };
  }

  private buildAssumptions(accounts: PlaidAccountRecord[], transactions: ClassifiedTransaction[]): string[] {
    if (accounts.length === 0) {
      return ['No linked Plaid accounts found.'];
    }

    const assumptions = ['Current net worth is derived from linked Plaid balances.'];
    if (transactions.length > 0) {
      assumptions.push('Cached Plaid transactions were used to estimate recurring cashflow.');
    } else {
      assumptions.push('No cached Plaid transactions were available, so cashflow projections use balance-only fallback.');
    }
    return assumptions;
  }

  private estimateConfidence(
    accountCount: number,
    transactions: ClassifiedTransaction[],
    recurringIncome: RecurringItem[],
    recurringExpenses: RecurringItem[],
  ): 'high' | 'medium' | 'low' | 'insufficient' {
    if (accountCount === 0) {
      return 'insufficient';
    }
    if (transactions.length === 0) {
      return 'low';
    }

    const recurringCount = recurringIncome.length + recurringExpenses.length;
    const spanDays = this.getTransactionSpanDays(transactions);

    if (recurringCount >= 3 && spanDays >= 60) {
      return 'high';
    }
    if (recurringCount >= 1 || transactions.length >= 6) {
      return 'medium';
    }
    return 'low';
  }

  private combineConfidence(values: Array<'high' | 'medium' | 'low' | 'insufficient'>): 'high' | 'medium' | 'low' | 'insufficient' {
    if (values.includes('high')) return 'high';
    if (values.includes('medium')) return 'medium';
    if (values.includes('low')) return 'low';
    return 'insufficient';
  }

  private buildDataPoints(currentNetWorth: number, monthlyNetCashflow: number, months: number, startDate: Date): ProjectionDataPoint[] {
    const points: ProjectionDataPoint[] = [];
    for (let i = 0; i <= months; i += 1) {
      const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
      points.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        value: currentNetWorth + monthlyNetCashflow * i,
        isProjected: i > 0,
      });
    }
    return points;
  }

  private classifyTransaction(account: PlaidAccountRecord, transaction: PlaidTransactionRecord): ClassifiedTransaction {
    const label = this.normalizeLabel(transaction.merchantName || transaction.name || transaction.category || 'uncategorized');
    const categoryText = this.normalizeLabel([
      transaction.category,
      ...(transaction.categories ?? []),
      transaction.transactionType,
      transaction.paymentChannel,
    ]
      .filter(Boolean)
      .join(' '));
    const direction = this.inferDirection(transaction.amount, label, categoryText);
    return {
      ...transaction,
      accountId: account.id,
      accountName: account.accountName,
      direction,
      normalizedLabel: label,
      monthlyEquivalent: Math.abs(transaction.amount),
    };
  }

  private groupRecurringTransactions(
    transactions: ClassifiedTransaction[],
    direction: 'income' | 'expense',
  ): Map<string, ClassifiedTransaction[]> {
    const groups = new Map<string, ClassifiedTransaction[]>();

    for (const transaction of transactions) {
      if (transaction.direction !== direction) {
        continue;
      }
      if (transaction.normalizedLabel === 'uncategorized') {
        continue;
      }
      const key = `${transaction.accountId}:${transaction.normalizedLabel}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(transaction);
      groups.set(key, bucket);
    }

    return groups;
  }

  private async applyRecurringMerges(
    userId: string,
    direction: 'income' | 'expense',
    groups: Map<string, ClassifiedTransaction[]>,
  ): Promise<AppliedRecurringGroups> {
    const overrides = ((await this.prisma.recurringMergeOverride.findMany({
      where: {
        userId,
        direction,
      },
      select: {
        targetItemId: true,
        sourceItemIds: true,
        direction: true,
      },
    })) as RecurringMergeOverride[]);
    if (overrides.length === 0) {
      return { groups, mergedSourcesByTarget: new Map() };
    }

    const merged = new Map(groups);
    const mergedSourcesByTarget = new Map<string, MergedRecurringSource[]>();
    for (const override of overrides) {
      const targetKey = override.targetItemId.replace(/^(income|expense):/, '');
      const targetGroup = merged.get(targetKey);
      if (!targetGroup) {
        continue;
      }

      const combined = [...targetGroup];
      for (const sourceItemId of override.sourceItemIds) {
        const sourceKey = sourceItemId.replace(/^(income|expense):/, '');
        const sourceGroup = merged.get(sourceKey);
        if (!sourceGroup) {
          continue;
        }
        combined.push(...sourceGroup);
        merged.delete(sourceKey);
        const sourceFirst = sourceGroup[0];
        if (sourceFirst) {
          const current = mergedSourcesByTarget.get(override.targetItemId) ?? [];
          current.push({
            id: sourceItemId,
            label: this.titleCase(sourceFirst.normalizedLabel),
            accountName: sourceFirst.accountName,
            sourceTransactionIds: sourceGroup.map((item) => item.transactionId),
          });
          mergedSourcesByTarget.set(override.targetItemId, current);
        }
      }

      merged.set(targetKey, combined);
    }

    return { groups: merged, mergedSourcesByTarget };
  }

  private buildRecurringItems({ groups, mergedSourcesByTarget }: AppliedRecurringGroups): RecurringItem[] {
    const itemMeta = new Map<string, RecurringItem>();
    for (const [key, group] of groups.entries()) {
      const first = group[0];
      if (!first) {
        continue;
      }
      itemMeta.set(key, {
        id: `${first.direction}:${key}`,
        label: this.titleCase(first.normalizedLabel),
        amount: 0,
        cadence: 'monthly',
        confidence: 'low',
        source: 'linked',
        category: first.category ?? undefined,
        accountId: first.accountId,
        accountName: first.accountName,
        sourceTransactionIds: group.map((item) => item.transactionId),
      });
    }

    const recurringItems: RecurringItem[] = [];
    for (const [key, group] of groups.entries()) {
      const cadence = this.inferCadence(group.map((item) => item.date));
      if (!cadence) {
        continue;
      }

      const amounts = group.map((item) => Math.abs(item.amount));
      const averageAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
      const first = group[0];
      const meta = itemMeta.get(key);
      const mergedSources = mergedSourcesByTarget.get(meta?.id ?? '') ?? [];
      recurringItems.push({
        id: meta?.id ?? key,
        label: meta?.label ?? this.titleCase(first?.normalizedLabel ?? key),
        amount: averageAmount,
        cadence,
        confidence: this.recurringConfidence(group.length, group),
        source: 'linked',
        category: first?.category ?? undefined,
        accountId: first?.accountId,
        accountName: first?.accountName,
        sourceTransactionIds: group.map((item) => item.transactionId),
        mergedSources: mergedSources.length > 0 ? mergedSources : undefined,
      });
    }

    return recurringItems.sort((a, b) => b.amount - a.amount);
  }

  private recurringConfidence(count: number, group: ClassifiedTransaction[]): 'high' | 'medium' | 'low' {
    if (count >= 4 || this.getTransactionSpanDays(group) >= 90) {
      return 'high';
    }
    if (count >= 2) {
      return 'medium';
    }
    return 'low';
  }

  private estimateMonthlyCashflowFromTransactions(transactions: ClassifiedTransaction[]): number {
    if (transactions.length === 0) {
      return 0;
    }

    const spanDays = Math.max(this.getTransactionSpanDays(transactions), 30);
    const spanMonths = spanDays / 30;
    const net = transactions.reduce((sum, transaction) => {
      if (transaction.direction === 'income') {
        return sum + Math.abs(transaction.amount);
      }
      if (transaction.direction === 'expense') {
        return sum - Math.abs(transaction.amount);
      }
      return sum;
    }, 0);

    return net / spanMonths;
  }

  private getTransactionSpanDays(transactions: ClassifiedTransaction[]): number {
    if (transactions.length < 2) {
      return 0;
    }

    const dates = transactions.map((transaction) => transaction.date.getTime()).sort((a, b) => a - b);
    const first = dates[0];
    const last = dates[dates.length - 1];
    return Math.max(0, Math.round((last - first) / (1000 * 60 * 60 * 24)));
  }

  private inferCadence(dates: Date[]): RecurringItem['cadence'] | null {
    if (dates.length < 2) {
      return null;
    }

    const sorted = dates
      .map((date) => date.getTime())
      .sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      intervals.push((sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24));
    }
    const medianInterval = this.median(intervals);

    if (medianInterval >= 5 && medianInterval <= 9) return 'weekly';
    if (medianInterval >= 10 && medianInterval <= 18) return 'biweekly';
    if (medianInterval >= 24 && medianInterval <= 40) return 'monthly';
    if (medianInterval >= 75 && medianInterval <= 110) return 'quarterly';
    if (medianInterval >= 320 && medianInterval <= 390) return 'annual';
    return null;
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
  }

  private inferDirection(amount: number, label: string, categoryText: string): 'income' | 'expense' | 'ignore' {
    if (
      this.matchesAny(label, [
        'transfer',
        'venmo',
        'zelle',
        'cash app',
        'paypal transfer',
        'credit card payment',
        'card payment',
        'payment thank you',
        'autopay payment',
        'online payment',
      ]) ||
      this.matchesAny(categoryText, ['transfer', 'credit card payment', 'loan payment'])
    ) {
      return 'ignore';
    }

    if (amount < 0) {
      return 'income';
    }

    if (amount > 0) {
      return 'expense';
    }

    if (
      this.matchesAny(label, ['payroll', 'salary', 'paycheck', 'direct deposit', 'income', 'bonus', 'refund', 'reimbursement']) ||
      this.matchesAny(categoryText, ['income', 'deposit', 'payroll', 'salary'])
    ) {
      return 'income';
    }

    if (
      this.matchesAny(label, [
        'rent',
        'mortgage',
        'subscription',
        'utility',
        'electric',
        'water',
        'internet',
        'spotify',
        'netflix',
        'gym',
        'insurance',
        'phone',
        'bill',
        'dining',
        'restaurant',
        'groceries',
        'coffee',
        'amazon',
      ]) ||
      this.matchesAny(categoryText, ['rent', 'mortgage', 'subscription', 'utility', 'restaurant', 'dining', 'groceries', 'shopping'])
    ) {
      return 'expense';
    }

    return 'expense';
  }

  private matchesAny(value: string, needles: string[]): boolean {
    return needles.some((needle) => value.includes(needle));
  }

  private normalizeLabel(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'uncategorized';
  }

  private titleCase(value: string): string {
    return value
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private isDebtAccount(accountType: string, accountSubtype: string): boolean {
    const type = accountType.toLowerCase();
    const subtype = accountSubtype.toLowerCase();
    return (
      ['credit', 'loan'].includes(type) ||
      ['credit_card', 'auto', 'mortgage', 'student', 'loan'].includes(subtype)
    );
  }

  private getManualCashflowSummary(userId: string): CashflowSummary {
    const manual = this.manualCashflowsByUser.get(userId) ?? [];
    const recurringIncome: RecurringItem[] = manual
      .filter((c) => c.type === 'income')
      .map((c) => ({
        id: c.id,
        label: c.label,
        amount: c.amount,
        cadence: c.cadence,
        confidence: 'high',
        source: 'manual',
        category: c.category,
      }));
    const recurringExpenses: RecurringItem[] = manual
      .filter((c) => c.type === 'expense')
      .map((c) => ({
        id: c.id,
        label: c.label,
        amount: c.amount,
        cadence: c.cadence,
        confidence: 'high',
        source: 'manual',
        category: c.category,
      }));

    const totalMonthlyIncome = recurringIncome.reduce((sum, item) => sum + this.toMonthly(item.amount, item.cadence), 0);
    const totalMonthlyExpenses = recurringExpenses.reduce((sum, item) => sum + this.toMonthly(item.amount, item.cadence), 0);

    return {
      totalMonthlyIncome,
      totalMonthlyExpenses,
      netMonthlyCashflow: totalMonthlyIncome - totalMonthlyExpenses,
      recurringIncome,
      recurringExpenses,
    };
  }

  private normalizeHorizon(horizon?: number): ProjectionHorizon {
    if (horizon === 3 || horizon === 6 || horizon === 12) {
      return horizon;
    }
    return 12;
  }

  private toMonthly(amount: number, cadence: RecurringItem['cadence']): number {
    switch (cadence) {
      case 'weekly':
        return (amount * 52) / 12;
      case 'biweekly':
        return (amount * 26) / 12;
      case 'monthly':
        return amount;
      case 'quarterly':
        return amount / 3;
      case 'annual':
        return amount / 12;
      default:
        return amount;
    }
  }
}
