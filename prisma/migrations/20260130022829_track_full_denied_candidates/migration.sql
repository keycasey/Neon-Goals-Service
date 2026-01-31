/*
  Warnings:

  - You are about to drop the column `deniedCandidateUrls` on the `ItemGoalData` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ItemGoalData" DROP COLUMN "deniedCandidateUrls",
ADD COLUMN     "deniedCandidates" JSONB;
