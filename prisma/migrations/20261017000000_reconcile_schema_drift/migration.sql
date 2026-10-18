-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ItemStatusBadge" ADD VALUE IF NOT EXISTS 'candidates_found';
ALTER TYPE "ItemStatusBadge" ADD VALUE IF NOT EXISTS 'not_found';
ALTER TYPE "ItemStatusBadge" ADD VALUE IF NOT EXISTS 'not_supported';

-- AlterTable
ALTER TABLE "ChatState" ADD COLUMN IF NOT EXISTS "lastGreetingSummaryAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastUserVisit" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ItemGoalData" ADD COLUMN IF NOT EXISTS "retailerFilters" JSONB,
ADD COLUMN IF NOT EXISTS "searchFilters" JSONB,
ADD COLUMN IF NOT EXISTS "shortlistedCandidates" JSONB,
ALTER COLUMN "productImage" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'user',
ADD COLUMN IF NOT EXISTS "visible" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_chatId_visible_idx" ON "Message"("chatId", "visible");

-- RenameIndex
DO $$ BEGIN
  ALTER INDEX "PlaidInvestmentTransaction_plaidAccountId_investmentTransaction"
    RENAME TO "PlaidInvestmentTransaction_plaidAccountId_investmentTransac_key";
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
