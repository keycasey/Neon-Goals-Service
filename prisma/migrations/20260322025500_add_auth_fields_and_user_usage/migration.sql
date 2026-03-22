-- Add auth/demo fields expected by current Prisma schema.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerified" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resetPasswordToken" TEXT,
  ADD COLUMN IF NOT EXISTS "resetPasswordExpires" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- Match Prisma unique constraint for password reset token.
CREATE UNIQUE INDEX IF NOT EXISTS "User_resetPasswordToken_key"
  ON "User"("resetPasswordToken");

-- Add usage tracking table used by demo seeding and billing limits.
CREATE TABLE IF NOT EXISTS "UserUsage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserUsage_userId_key" ON "UserUsage"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'UserUsage_userId_fkey'
      AND table_name = 'UserUsage'
  ) THEN
    ALTER TABLE "UserUsage"
      ADD CONSTRAINT "UserUsage_userId_fkey"
      FOREIGN KEY ("userId")
      REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
