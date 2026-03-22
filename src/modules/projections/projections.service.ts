import { Injectable } from '@nestjs/common';

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

@Injectable()
export class ProjectionsService {
  private readonly manualAccountsByUser = new Map<string, ManualFinancialAccount[]>();
  private readonly manualCashflowsByUser = new Map<string, ManualCashflow[]>();

  getOverview(horizon: number): ProjectionOverview {
    const months = this.normalizeHorizon(horizon);
    const now = new Date();
    const dataPoints: ProjectionDataPoint[] = [];
    const currentNetWorth = 0;
    const monthlyNetCashflow = 0;

    for (let i = 0; i <= months; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      dataPoints.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        value: currentNetWorth + monthlyNetCashflow * i,
        isProjected: i > 0,
      });
    }

    const projectedDate = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
    return {
      currentNetWorth,
      projectedNetWorth: currentNetWorth + monthlyNetCashflow * months,
      monthlyNetCashflow,
      horizonMonths: months,
      projectedDate: projectedDate.toISOString(),
      confidence: 'insufficient',
      assumptions: ['Projection engine is not configured yet; showing placeholder values.'],
      dataPoints,
      goalMilestones: [],
    };
  }

  getCashflow(userId: string): CashflowSummary {
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

  getForecast(_userId: string, _horizon: number): GoalForecast[] {
    return [];
  }

  runScenario(userId: string, horizon: number, inputs: {
    monthlySavingsIncrease?: number;
    diningReduction?: number;
    subscriptionReduction?: number;
    incomeAdjustment?: number;
  }): ProjectionScenarioResult {
    const months = this.normalizeHorizon(horizon);
    const base = this.getOverview(months);
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
      goalForecasts: this.getForecast(userId, months),
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
