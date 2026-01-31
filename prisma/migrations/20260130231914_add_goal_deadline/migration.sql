-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "deadline" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Goal_deadline_idx" ON "Goal"("deadline");
