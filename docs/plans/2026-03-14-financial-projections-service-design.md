# Financial Projections Service Design

**Date:** 2026-03-14
**Status:** Draft

## Overview

Translate the app-level financial projections plan into a backend implementation plan for `neon-goals-service`.

The service already has:

- Plaid account linking and balance sync
- stored Plaid transactions
- finance goals with `currentBalance`, `targetBalance`, and optional Plaid account linkage
- AI tooling that can inspect balances and transactions

The service does not yet have:

- a normalized cashflow model
- recurring income/expense detection
- a reusable projection engine
- projection/scenario endpoints for the UI
- support for manual financial assets or RSU vesting schedules

This document scopes the backend work required to support the UI’s future landing-page projection experience. The UI should render projections, but the service should own ingestion, forecasting, and scenario calculation.

## Product Translation

The app plan mixes product goals, UI goals, and provider investigations. For the service repo, split the work into four tracks:

1. Improve financial data coverage and fallback ingestion paths.
2. Build transaction normalization and recurring cashflow detection.
3. Build a projection engine that can forecast baseline and goal-aware trajectories.
4. Expose stable APIs that the UI can consume for overview and scenario views.

## Current Backend Baseline

### Existing modules to extend

- `src/modules/plaid/plaid.service.ts`
- `src/modules/plaid/plaid.controller.ts`
- `src/modules/goals/goals.service.ts`
- `src/modules/ai/ai-tools.service.ts`
- `src/modules/ai/openai/chat/category.chat.ts`

### Existing data we can reuse

- `PlaidAccount`
- `PlaidTransaction`
- `FinanceGoalData`
- `Goal`

### Constraint

The existing service is Plaid-centric. The app-level plan mentions Schwab, Fidelity, E-Trade, and Finicity, but we should not block projection v1 on adding a second aggregator. Projection v1 should work with:

- linked Plaid accounts
- manually entered balances/assets
- manually entered recurring cashflow adjustments

That keeps projections shippable even while provider coverage is incomplete.

## Requirements

### v1 Requirements

1. Aggregate a user’s current financial position across linked and manual accounts.
2. Detect recurring income and recurring expenses from stored transactions.
3. Produce a baseline 3, 6, and 12 month projection assuming current patterns continue.
4. Adjust projections using active finance goals.
5. Return enough metadata for the UI to explain the forecast, not just the final numbers.

### v2 Requirements

1. Scenario modeling such as increased savings or reduced category spend.
2. Projection snapshots persisted for caching and auditability.
3. Manual RSU vesting schedule support.
4. Optional second aggregator integration if Plaid coverage remains insufficient.

### Non-goals for v1

- Monte Carlo simulation
- investment return modeling beyond simple configurable assumptions
- payroll tax modeling
- brokerage-grade performance analytics

## Proposed Architecture

## Section 1: Data Coverage and Manual Inputs

### Problem

Plaid account coverage is incomplete, and some assets or future inflows will never arrive cleanly from Plaid.

### Plan

Add first-party manual financial records so projections are not blocked by provider gaps.

### Proposed schema additions

```prisma
model ManualFinancialAccount {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name            String
  accountType     String   // brokerage, retirement, cash, debt, rsu, other
  institutionName String?
  currentValue    Float
  currency        String   @default("USD")
  isAsset         Boolean  @default(true)
  includeInNetWorth Boolean @default(true)
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model ManualCashflow {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  label           String
  amount          Float
  direction       String   // income | expense
  cadence         String   // weekly | biweekly | monthly | quarterly | annual
  startDate       DateTime?
  endDate         DateTime?
  category        String?
  isActive        Boolean  @default(true)
  source          String   @default("manual")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### Why this should come first

- Handles Fidelity/manual account import without waiting for Finicity
- Handles E-Trade RSU fallback via manual entries
- Gives the projection engine a complete enough balance sheet to launch

## Section 2: Recurring Transaction Detection

### Problem

`PlaidTransaction` exists, but the service does not compute durable recurring cashflow profiles from it.

### New module

Create `src/modules/projections/` with a `CashflowAnalysisService`.

### Responsibilities

- normalize transactions into signed cashflow events
- exclude transfers, duplicates, and noise where possible
- group by merchant/name/category
- detect cadence using date-spacing heuristics
- compute confidence for each recurring stream
- distinguish likely income vs likely expense

### Detection heuristics for v1

- require at least 3 matching occurrences within a rolling window
- support weekly, biweekly, semimonthly, monthly cadence buckets
- use name similarity + category + amount tolerance
- mark salary/payroll patterns separately from subscriptions/utilities

### Output shape

```ts
type RecurringCashflowProfile = {
  id: string;
  label: string;
  direction: 'income' | 'expense';
  cadence: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  averageAmount: number;
  confidence: number;
  source: 'plaid' | 'manual';
  lastObservedAt: string;
  nextEstimatedAt?: string;
  transactionCount: number;
  categories: string[];
};
```

### Persistence choice

For v1, recomputing on demand is acceptable if limited to recent transactions. If performance becomes an issue, add a cached table later:

```prisma
model RecurringCashflowProfile {
  id              String   @id @default(cuid())
  userId          String
  label           String
  direction       String
  cadence         String
  averageAmount   Float
  confidence      Float
  source          String
  metadata        Json?
  lastObservedAt  DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

Recommendation: implement computation first, persistence second.

## Section 3: Projection Engine

### New service

`ProjectionEngineService` in `src/modules/projections/`.

### Inputs

- linked Plaid account balances
- manual financial accounts
- recurring income profiles
- recurring expense profiles
- active finance goals
- optional scenario overrides

### Baseline projection algorithm

1. Compute current net worth from included assets and liabilities.
2. Compute monthly net cashflow from recurring income minus recurring expenses.
3. Step forward month by month for a fixed horizon.
4. Apply simple growth assumptions only where explicitly configured.
5. Return time-series points and summary milestones.

### Goal-aware projection algorithm

For each active finance goal:

- compare `currentBalance` vs `targetBalance`
- infer monthly contribution from recurring surplus and linked account data
- estimate time-to-target
- include goal milestones in projection output

If the user has multiple finance goals, the engine should not pretend it knows exact allocation. For v1, use one of these explicit strategies:

- equal split across active finance goals, or
- proportional split by remaining gap to target

Recommendation: use proportional split by remaining gap and surface that assumption in the response metadata.

### Output shape

```ts
type ProjectionResponse = {
  asOf: string;
  horizonMonths: number;
  currentNetWorth: number;
  projectedNetWorth: number;
  monthlyNetCashflow: number;
  assumptions: string[];
  series: Array<{
    date: string;
    netWorth: number;
    liquidSavings?: number;
  }>;
  goals: Array<{
    goalId: string;
    title: string;
    targetBalance: number;
    currentBalance: number;
    projectedCompletionDate?: string;
    monthlyAllocation: number;
  }>;
  recurringIncome: RecurringCashflowProfile[];
  recurringExpenses: RecurringCashflowProfile[];
};
```

## Section 4: Scenario Modeling

### v1 scope

Support lightweight overrides at request time instead of persisting scenarios first.

### Example overrides

- `monthlySavingsDelta`
- `expenseReductionsByCategory`
- `manualIncomeAdjustment`
- `excludeGoalIds`

### Endpoint behavior

The UI can request:

- baseline
- one-off scenario variants

without the service storing those scenarios yet.

## Section 5: API Surface

### New module

`src/modules/projections/projections.module.ts`

### New controller

`src/modules/projections/projections.controller.ts`

### Proposed endpoints

```text
GET  /projections/overview
GET  /projections/cashflow
POST /projections/forecast
POST /projections/scenario

GET  /manual-financial-accounts
POST /manual-financial-accounts
PATCH /manual-financial-accounts/:id
DELETE /manual-financial-accounts/:id

GET  /manual-cashflows
POST /manual-cashflows
PATCH /manual-cashflows/:id
DELETE /manual-cashflows/:id
```

### Endpoint responsibilities

- `GET /projections/overview`: fast summary for the landing page
- `GET /projections/cashflow`: detailed recurring income/expense breakdown
- `POST /projections/forecast`: baseline projection with optional horizon
- `POST /projections/scenario`: forecast with request-time overrides

## Section 6: Provider Strategy

### Schwab via Plaid

This is primarily an integration verification task, not a new architecture track. Add test coverage and operational logging around existing OAuth/link flows before expanding scope.

### Fidelity and non-Plaid institutions

Do not hard-wire Finicity into projection v1. Instead:

1. ship manual financial accounts first
2. measure how often users still lack critical coverage
3. only then decide whether a second aggregator is worth the maintenance burden

### E-Trade RSU tracking

Treat RSUs as a manual-account/manual-cashflow problem first:

- current vested holdings as `ManualFinancialAccount`
- scheduled vesting as `ManualCashflow` income entries

If later needed, add a dedicated `ManualVestingSchedule` model.

## Section 7: AI Integration

Once projections exist, extend AI finance tooling so the finance specialist can reference them.

### Affected files

- `src/modules/ai/ai-tools.service.ts`
- `src/modules/ai/openai/chat/category.chat.ts`
- `src/modules/ai/specialist-prompts.ts`

### New AI tools

- `get_financial_projection`
- `get_recurring_cashflow_summary`
- `run_projection_scenario`

This should happen after the core projection APIs are stable, not before.

## Implementation Plan

## Phase 1: Backend Foundations

1. Add `ProjectionsModule` with controller and service skeletons.
2. Add schema for `ManualFinancialAccount` and `ManualCashflow`.
3. Create Prisma migration.
4. Add CRUD endpoints for manual accounts and manual cashflows.

## Phase 2: Cashflow Detection

1. Implement transaction normalization helpers.
2. Implement recurring detection heuristics over stored `PlaidTransaction` data.
3. Merge manual cashflows with detected cashflows into one analysis result.
4. Add `GET /projections/cashflow`.

## Phase 3: Forecast Engine

1. Implement baseline projection engine.
2. Implement goal-aware allocation logic for active finance goals.
3. Add `GET /projections/overview` and `POST /projections/forecast`.
4. Return assumptions and confidence metadata explicitly.

## Phase 4: Scenarios and AI

1. Add `POST /projections/scenario`.
2. Add finance AI tools for projections.
3. Update finance specialist prompts to reference projection data safely.

## Phase 5: Coverage Improvements

1. Verify Schwab Plaid OAuth end-to-end.
2. Assess need for second aggregator after manual coverage ships.
3. Add RSU-specific manual UX support only if generic manual models prove insufficient.

## Files Likely Added

```text
src/modules/projections/projections.module.ts
src/modules/projections/projections.controller.ts
src/modules/projections/projections.service.ts
src/modules/projections/cashflow-analysis.service.ts
src/modules/projections/projection-engine.service.ts
src/modules/projections/dto/
src/modules/manual-finance/manual-finance.controller.ts
src/modules/manual-finance/manual-finance.service.ts
```

## Files Likely Modified

- `prisma/schema.prisma`
- `src/app.module.ts`
- `src/modules/ai/ai-tools.service.ts`
- `src/modules/ai/openai/chat/category.chat.ts`
- `src/modules/plaid/plaid.service.ts`

## Testing Plan

### Unit tests

- recurring detection cadence classification
- merchant grouping tolerance
- projection math across positive and negative cashflow
- goal allocation logic

### Integration tests

- manual account CRUD
- manual cashflow CRUD
- projection overview endpoint
- scenario endpoint with overrides

### Seed/test fixtures

Add deterministic transaction fixtures for:

- biweekly payroll
- monthly rent
- streaming subscription
- volatile dining spend
- one-off large purchase

## Open Questions

1. Should account balances from `FinanceGoalData` be treated as separate assets, or only as goal metadata when a Plaid/manual account already exists?
2. Do we want to project net worth only, or also liquid cash separately for the landing page?
3. Should debt accounts be modeled now as negative-value manual accounts, or deferred until after savings projections ship?

## Recommendation

Start with a narrow but shippable backend slice:

1. manual financial accounts
2. manual cashflows
3. recurring detection from stored Plaid transactions
4. baseline + goal-aware forecast endpoints

That gives the UI a real projection API without waiting on Finicity, Monte Carlo work, or RSU-specific integrations.
