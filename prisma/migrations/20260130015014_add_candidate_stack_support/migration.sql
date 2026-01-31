-- AlterTable
ALTER TABLE "ItemGoalData" ADD COLUMN     "candidates" JSONB,
ADD COLUMN     "selectedCandidateId" TEXT,
ADD COLUMN     "stackId" TEXT,
ADD COLUMN     "stackOrder" INTEGER;

-- CreateIndex
CREATE INDEX "ItemGoalData_stackId_idx" ON "ItemGoalData"("stackId");
