-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('vehicle', 'electronics', 'furniture', 'apparel', 'general');

-- AlterTable
ALTER TABLE "ItemGoalData" ADD COLUMN     "category" "ItemCategory",
ADD COLUMN     "searchTerm" TEXT;

-- CreateIndex
CREATE INDEX "ItemGoalData_category_idx" ON "ItemGoalData"("category");
