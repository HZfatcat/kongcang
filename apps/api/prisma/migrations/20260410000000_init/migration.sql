-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CLOSED', 'REJECTED');

-- CreateTable
CREATE TABLE "UdescSession" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "isConsultToDemand" BOOLEAN NOT NULL DEFAULT false,
    "rawPayload" JSONB,
    "updatedAtSource" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UdescSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UdescSessionMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "senderType" TEXT,
    "senderId" TEXT,
    "content" TEXT,
    "rawPayload" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UdescSessionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZouwuRequirement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceSessionId" TEXT,
    "status" "RequirementStatus" NOT NULL,
    "createdAtSource" TIMESTAMP(3) NOT NULL,
    "completedAtSource" TIMESTAMP(3),
    "updatedAtSource" TIMESTAMP(3),
    "rawPayload" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZouwuRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCheckpoint" (
    "source" TEXT NOT NULL,
    "cursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCheckpoint_pkey" PRIMARY KEY ("source")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "message" TEXT,
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncIssue" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "externalId" TEXT,
    "payload" JSONB,
    "errorMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UdescSession_startedAt_idx" ON "UdescSession"("startedAt");

-- CreateIndex
CREATE INDEX "UdescSession_updatedAtSource_idx" ON "UdescSession"("updatedAtSource");

-- CreateIndex
CREATE INDEX "UdescSession_isConsultToDemand_idx" ON "UdescSession"("isConsultToDemand");

-- CreateIndex
CREATE INDEX "UdescSessionMessage_sessionId_sentAt_idx" ON "UdescSessionMessage"("sessionId", "sentAt");

-- CreateIndex
CREATE INDEX "UdescSessionMessage_senderType_idx" ON "UdescSessionMessage"("senderType");

-- CreateIndex
CREATE INDEX "ZouwuRequirement_createdAtSource_idx" ON "ZouwuRequirement"("createdAtSource");

-- CreateIndex
CREATE INDEX "ZouwuRequirement_completedAtSource_idx" ON "ZouwuRequirement"("completedAtSource");

-- CreateIndex
CREATE INDEX "ZouwuRequirement_status_idx" ON "ZouwuRequirement"("status");

-- CreateIndex
CREATE INDEX "ZouwuRequirement_sourceSessionId_idx" ON "ZouwuRequirement"("sourceSessionId");

-- CreateIndex
CREATE INDEX "SyncRun_source_startedAt_idx" ON "SyncRun"("source", "startedAt");

-- CreateIndex
CREATE INDEX "SyncIssue_runId_source_idx" ON "SyncIssue"("runId", "source");

-- CreateIndex
CREATE INDEX "SyncIssue_source_createdAt_idx" ON "SyncIssue"("source", "createdAt");

-- AddForeignKey
ALTER TABLE "UdescSessionMessage" ADD CONSTRAINT "UdescSessionMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UdescSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
