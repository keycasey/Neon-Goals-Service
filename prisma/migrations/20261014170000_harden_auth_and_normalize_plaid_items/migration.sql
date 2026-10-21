-- Complete schema drift repair, add dedicated email verification credentials,
-- and normalize Plaid access tokens into one encrypted credential per Item.

ALTER TYPE "ItemStatusBadge" ADD VALUE IF NOT EXISTS 'candidates_found';
ALTER TYPE "ItemStatusBadge" ADD VALUE IF NOT EXISTS 'not_found';
ALTER TYPE "ItemStatusBadge" ADD VALUE IF NOT EXISTS 'not_supported';

ALTER TABLE "ChatState"
  ADD COLUMN IF NOT EXISTS "lastGreetingSummaryAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastUserVisit" TIMESTAMP(3);

ALTER TABLE "ItemGoalData"
  ADD COLUMN IF NOT EXISTS "retailerFilters" JSONB,
  ADD COLUMN IF NOT EXISTS "searchFilters" JSONB,
  ADD COLUMN IF NOT EXISTS "shortlistedCandidates" JSONB,
  ALTER COLUMN "productImage" DROP NOT NULL;

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS "visible" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "Message_chatId_visible_idx" ON "Message"("chatId", "visible");

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerificationExpires" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_emailVerificationToken_key"
  ON "User"("emailVerificationToken");

CREATE TABLE "PlaidItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "encryptedAccessToken" TEXT NOT NULL,
  "tokenVersion" INTEGER NOT NULL DEFAULT 1,
  "institutionName" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlaidItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlaidItem_itemId_key" ON "PlaidItem"("itemId");
CREATE INDEX "PlaidItem_userId_idx" ON "PlaidItem"("userId");

ALTER TABLE "PlaidItem" ADD CONSTRAINT "PlaidItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing tokens are marked version 0. PlaidService encrypts every legacy
-- row with PLAID_TOKEN_ENCRYPTION_KEY during application startup.
INSERT INTO "PlaidItem" (
  "id", "userId", "itemId", "encryptedAccessToken", "tokenVersion",
  "institutionName", "institutionId", "isDemo", "createdAt", "updatedAt"
)
SELECT DISTINCT ON ("itemId")
  'legacy_' || md5("userId" || ':' || "itemId"),
  "userId",
  "itemId",
  "accessToken",
  0,
  "institutionName",
  "institutionId",
  "isDemo",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PlaidAccount"
ORDER BY "itemId", "updatedAt" DESC;

ALTER TABLE "PlaidAccount" ADD COLUMN "plaidItemId" TEXT;

UPDATE "PlaidAccount" account
SET "plaidItemId" = item."id"
FROM "PlaidItem" item
WHERE item."itemId" = account."itemId";

ALTER TABLE "PlaidAccount" ALTER COLUMN "plaidItemId" SET NOT NULL;
-- Keep the former credential columns nullable for one backward-compatible
-- rollout. The deploy clears their values only after the new service is healthy;
-- a later migration can drop the empty columns.
ALTER TABLE "PlaidAccount" ALTER COLUMN "accessToken" DROP NOT NULL;
ALTER TABLE "PlaidAccount" ALTER COLUMN "itemId" DROP NOT NULL;

CREATE INDEX "PlaidAccount_plaidItemId_idx" ON "PlaidAccount"("plaidItemId");
ALTER TABLE "PlaidAccount" ADD CONSTRAINT "PlaidAccount_plaidItemId_fkey"
  FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$ BEGIN
  ALTER INDEX "PlaidInvestmentTransaction_plaidAccountId_investmentTransaction"
    RENAME TO "PlaidInvestmentTransaction_plaidAccountId_investmentTransac_key";
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
