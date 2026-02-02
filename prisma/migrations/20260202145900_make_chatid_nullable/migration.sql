-- Make chatId nullable for backward compatibility during migration
ALTER TABLE "Message" ALTER COLUMN "chatId" DROP NOT NULL;
