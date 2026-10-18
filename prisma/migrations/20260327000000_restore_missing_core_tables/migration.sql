-- Restore models that were present in the application schema but never
-- captured in migration history. Every operation is safe on environments
-- where these tables were created manually or by an earlier db push.

ALTER TYPE "GoalType" ADD VALUE IF NOT EXISTS 'group';

DO $$ BEGIN
  CREATE TYPE "GroupLayout" AS ENUM ('grid', 'list', 'kanban');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProgressType" AS ENUM ('average', 'sum', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "GroupGoalData" (
  "id" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "icon" TEXT,
  "color" TEXT,
  "layout" "GroupLayout" NOT NULL DEFAULT 'grid',
  "progressType" "ProgressType" NOT NULL DEFAULT 'average',
  "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupGoalData_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GroupGoalData_goalId_key" ON "GroupGoalData"("goalId");

CREATE TABLE IF NOT EXISTS "PlaidAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "plaidAccountId" TEXT NOT NULL,
  "institutionName" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "accountMask" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "accountSubtype" TEXT NOT NULL,
  "currentBalance" DOUBLE PRECISION NOT NULL,
  "availableBalance" DOUBLE PRECISION,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "financeGoalId" TEXT,
  "lastSync" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlaidAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlaidAccount_plaidAccountId_key" ON "PlaidAccount"("plaidAccountId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlaidAccount_financeGoalId_key" ON "PlaidAccount"("financeGoalId");
CREATE INDEX IF NOT EXISTS "PlaidAccount_userId_idx" ON "PlaidAccount"("userId");
CREATE INDEX IF NOT EXISTS "PlaidAccount_itemId_idx" ON "PlaidAccount"("itemId");
CREATE INDEX IF NOT EXISTS "PlaidAccount_plaidAccountId_idx" ON "PlaidAccount"("plaidAccountId");
CREATE INDEX IF NOT EXISTS "PlaidAccount_financeGoalId_idx" ON "PlaidAccount"("financeGoalId");

CREATE TABLE IF NOT EXISTS "PlaidTransaction" (
  "id" TEXT NOT NULL,
  "plaidAccountId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "date" TIMESTAMP(3) NOT NULL,
  "name" TEXT NOT NULL,
  "merchantName" TEXT,
  "category" TEXT,
  "categories" TEXT[],
  "paymentChannel" TEXT,
  "pending" BOOLEAN NOT NULL DEFAULT false,
  "authorizedDate" TIMESTAMP(3),
  "locationData" JSONB,
  "transactionType" TEXT,
  "lastSync" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlaidTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlaidTransaction_plaidAccountId_transactionId_key" ON "PlaidTransaction"("plaidAccountId", "transactionId");
CREATE INDEX IF NOT EXISTS "PlaidTransaction_plaidAccountId_date_idx" ON "PlaidTransaction"("plaidAccountId", "date");
CREATE INDEX IF NOT EXISTS "PlaidTransaction_date_idx" ON "PlaidTransaction"("date");
CREATE INDEX IF NOT EXISTS "PlaidTransaction_plaidAccountId_idx" ON "PlaidTransaction"("plaidAccountId");

CREATE TABLE IF NOT EXISTS "ExtractionJob" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "result" JSONB,
  "error" TEXT,
  "groupId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "ExtractionJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExtractionJob_userId_idx" ON "ExtractionJob"("userId");
CREATE INDEX IF NOT EXISTS "ExtractionJob_groupId_idx" ON "ExtractionJob"("groupId");
CREATE INDEX IF NOT EXISTS "ExtractionJob_status_idx" ON "ExtractionJob"("status");

DO $$ BEGIN
  ALTER TABLE "GroupGoalData" ADD CONSTRAINT "GroupGoalData_goalId_fkey"
    FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PlaidAccount" ADD CONSTRAINT "PlaidAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PlaidAccount" ADD CONSTRAINT "PlaidAccount_financeGoalId_fkey"
    FOREIGN KEY ("financeGoalId") REFERENCES "FinanceGoalData"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PlaidTransaction" ADD CONSTRAINT "PlaidTransaction_plaidAccountId_fkey"
    FOREIGN KEY ("plaidAccountId") REFERENCES "PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ExtractionJob" ADD CONSTRAINT "ExtractionJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
