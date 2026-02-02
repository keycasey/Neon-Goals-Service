-- Step 1: Create ConversationSummary table
CREATE TABLE IF NOT EXISTS "ConversationSummary" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("id")
);

-- Step 2: Create index on ConversationSummary
CREATE INDEX IF NOT EXISTS "ConversationSummary_chatId_createdAt_idx" ON "ConversationSummary"("chatId", "createdAt");

-- Step 3: Add new columns to ChatState
ALTER TABLE "ChatState" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "ChatState" ADD COLUMN IF NOT EXISTS "lastSummaryId" TEXT;
ALTER TABLE "ChatState" ADD COLUMN IF NOT EXISTS "summaryCursor" INTEGER;

-- Step 4: Add unique constraint on ChatState for (userId, type, categoryId, goalId)
CREATE UNIQUE INDEX IF NOT EXISTS "ChatState_userId_type_categoryId_goalId_key" ON "ChatState"("userId", "type", "categoryId", "goalId");

-- Step 5: For orphaned messages, create ChatStates based on their goalId
-- Insert into ChatState for messages that have goalId but no matching ChatState
INSERT INTO "ChatState" ("id", "userId", "type", "goalId", "isLoading", "createdAt", "updatedAt")
SELECT DISTINCT
    'chat_' || md5(random()::text || clock_timestamp()::text),
    m."userId",
    'goal',
    m."goalId",
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Message" m
WHERE m."chatId" IS NULL
  AND m."goalId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ChatState" cs WHERE cs."goalId" = m."goalId"
  );

-- Step 6: Update orphaned messages to use the newly created ChatStates
UPDATE "Message" m
SET "chatId" = (
    SELECT cs."id" FROM "ChatState" cs WHERE cs."goalId" = m."goalId" LIMIT 1
)
WHERE m."chatId" IS NULL AND m."goalId" IS NOT NULL;

-- Step 7: Delete any remaining messages without chatId (truly orphaned)
DELETE FROM "Message" WHERE "chatId" IS NULL;

-- Step 8: Now make chatId NOT NULL
ALTER TABLE "Message" ALTER COLUMN "chatId" SET NOT NULL;

-- Step 9: Drop the old goalId column
ALTER TABLE "Message" DROP COLUMN IF EXISTS "goalId";

-- Step 10: Drop old index
DROP INDEX IF EXISTS "Message_goalId_idx";

-- Step 11: Ensure indexes exist
CREATE INDEX IF NOT EXISTS "Message_chatId_idx" ON "Message"("chatId");
CREATE INDEX IF NOT EXISTS "Message_userId_idx" ON "Message"("userId");
CREATE INDEX IF NOT EXISTS "Message_threadId_idx" ON "Message"("threadId");

-- Step 12: Add foreign key from ConversationSummary to ChatState
ALTER TABLE "ConversationSummary" ADD CONSTRAINT "ConversationSummary_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ChatState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 13: Add comments for documentation
COMMENT ON COLUMN "ChatState"."categoryId" IS 'For type="category": "items" | "finances" | "actions"';
COMMENT ON COLUMN "ChatState"."lastSummaryId" IS 'Points to most recent summary';
COMMENT ON COLUMN "ChatState"."summaryCursor" IS 'How many messages are summarized (offset)';
