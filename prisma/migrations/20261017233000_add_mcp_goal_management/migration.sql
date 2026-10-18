-- CreateEnum
CREATE TYPE "McpMutationStatus" AS ENUM ('processing', 'applied');

-- CreateTable
CREATE TABLE "McpPersonalGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpPersonalGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpMutation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "status" "McpMutationStatus" NOT NULL DEFAULT 'processing',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpPersonalGrant_tokenHash_key" ON "McpPersonalGrant"("tokenHash");
CREATE INDEX "McpPersonalGrant_userId_revokedAt_idx" ON "McpPersonalGrant"("userId", "revokedAt");
CREATE INDEX "McpPersonalGrant_expiresAt_idx" ON "McpPersonalGrant"("expiresAt");
CREATE UNIQUE INDEX "McpMutation_userId_toolName_clientRequestId_key" ON "McpMutation"("userId", "toolName", "clientRequestId");
CREATE INDEX "McpMutation_userId_createdAt_idx" ON "McpMutation"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "McpPersonalGrant" ADD CONSTRAINT "McpPersonalGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpMutation" ADD CONSTRAINT "McpMutation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
