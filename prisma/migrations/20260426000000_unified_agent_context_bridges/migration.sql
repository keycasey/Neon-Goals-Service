-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "agentConversationMode" TEXT NOT NULL DEFAULT 'single_agent';

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userMessageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWorkItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "assignedAgent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "workItemId" TEXT,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'hidden',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatContextBridge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceChatId" TEXT NOT NULL,
    "targetChatId" TEXT NOT NULL,
    "summaryMessageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "ChatContextBridge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_userId_status_idx" ON "AgentRun"("userId", "status");

-- CreateIndex
CREATE INDEX "AgentRun_chatId_createdAt_idx" ON "AgentRun"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_userMessageId_idx" ON "AgentRun"("userMessageId");

-- CreateIndex
CREATE INDEX "AgentWorkItem_runId_status_idx" ON "AgentWorkItem"("runId", "status");

-- CreateIndex
CREATE INDEX "AgentWorkItem_userId_assignedAgent_idx" ON "AgentWorkItem"("userId", "assignedAgent");

-- CreateIndex
CREATE INDEX "AgentEvent_runId_createdAt_idx" ON "AgentEvent"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentEvent_chatId_visibility_createdAt_idx" ON "AgentEvent"("chatId", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "AgentEvent_userId_agent_idx" ON "AgentEvent"("userId", "agent");

-- CreateIndex
CREATE UNIQUE INDEX "ChatContextBridge_summaryMessageId_key" ON "ChatContextBridge"("summaryMessageId");

-- CreateIndex
CREATE INDEX "ChatContextBridge_userId_status_idx" ON "ChatContextBridge"("userId", "status");

-- CreateIndex
CREATE INDEX "ChatContextBridge_sourceChatId_status_idx" ON "ChatContextBridge"("sourceChatId", "status");

-- CreateIndex
CREATE INDEX "ChatContextBridge_targetChatId_status_idx" ON "ChatContextBridge"("targetChatId", "status");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ChatState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userMessageId_fkey" FOREIGN KEY ("userMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWorkItem" ADD CONSTRAINT "AgentWorkItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWorkItem" ADD CONSTRAINT "AgentWorkItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "AgentWorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ChatState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatContextBridge" ADD CONSTRAINT "ChatContextBridge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatContextBridge" ADD CONSTRAINT "ChatContextBridge_sourceChatId_fkey" FOREIGN KEY ("sourceChatId") REFERENCES "ChatState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatContextBridge" ADD CONSTRAINT "ChatContextBridge_targetChatId_fkey" FOREIGN KEY ("targetChatId") REFERENCES "ChatState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatContextBridge" ADD CONSTRAINT "ChatContextBridge_summaryMessageId_fkey" FOREIGN KEY ("summaryMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
