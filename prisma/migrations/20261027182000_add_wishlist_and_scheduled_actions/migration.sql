-- CreateEnum
CREATE TYPE "WishlistPriority" AS ENUM ('someday', 'interested', 'soon');

-- CreateEnum
CREATE TYPE "WishlistStage" AS ENUM ('idea', 'researching', 'saving', 'ready', 'purchased', 'dropped');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "scheduledFor" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "targetBudget" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "priority" "WishlistPriority" NOT NULL DEFAULT 'interested',
    "stage" "WishlistStage" NOT NULL DEFAULT 'idea',
    "earliestPurchaseDate" TIMESTAMP(3),
    "linkedGoalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishlistItem_userId_stage_idx" ON "WishlistItem"("userId", "stage");

-- CreateIndex
CREATE INDEX "WishlistItem_userId_priority_idx" ON "WishlistItem"("userId", "priority");

-- CreateIndex
CREATE INDEX "WishlistItem_userId_updatedAt_idx" ON "WishlistItem"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Task_scheduledFor_completed_idx" ON "Task"("scheduledFor", "completed");

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
