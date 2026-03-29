CREATE TABLE "RecurringMergeOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetItemId" TEXT NOT NULL,
    "sourceItemIds" TEXT[] NOT NULL,
    "direction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringMergeOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecurringMergeOverride_userId_targetItemId_direction_key"
ON "RecurringMergeOverride"("userId", "targetItemId", "direction");

CREATE INDEX "RecurringMergeOverride_userId_direction_idx"
ON "RecurringMergeOverride"("userId", "direction");

ALTER TABLE "RecurringMergeOverride"
ADD CONSTRAINT "RecurringMergeOverride_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
