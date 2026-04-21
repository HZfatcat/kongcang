-- CreateTable
CREATE TABLE "UdescSessionVote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rating" INTEGER,
    "tags" TEXT[],
    "comment" TEXT,
    "voterId" TEXT,
    "voterName" TEXT,
    "votedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UdescSessionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UdescCustomer" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "wechat" TEXT,
    "enterprise" TEXT,
    "tags" TEXT[],
    "customFields" JSONB,
    "rawPayload" JSONB,
    "updatedAtSource" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UdescCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UdescAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "roleId" TEXT,
    "roleName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "groups" TEXT[],
    "skills" TEXT[],
    "rawPayload" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UdescAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UdescSessionMetrics" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "firstResponseTime" INTEGER,
    "avgResponseTime" DOUBLE PRECISION,
    "waitTime" INTEGER,
    "resolutionTime" INTEGER,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "agentMessageCount" INTEGER NOT NULL DEFAULT 0,
    "customerMessageCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UdescSessionMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UdescSessionVote_sessionId_idx" ON "UdescSessionVote"("sessionId");

-- CreateIndex
CREATE INDEX "UdescSessionVote_votedAt_idx" ON "UdescSessionVote"("votedAt");

-- CreateIndex
CREATE INDEX "UdescCustomer_phone_idx" ON "UdescCustomer"("phone");

-- CreateIndex
CREATE INDEX "UdescCustomer_email_idx" ON "UdescCustomer"("email");

-- CreateIndex
CREATE INDEX "UdescCustomer_enterprise_idx" ON "UdescCustomer"("enterprise");

-- CreateIndex
CREATE INDEX "UdescAgent_enabled_idx" ON "UdescAgent"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "UdescSessionMetrics_sessionId_key" ON "UdescSessionMetrics"("sessionId");

-- CreateIndex
CREATE INDEX "UdescSessionMetrics_sessionId_idx" ON "UdescSessionMetrics"("sessionId");

-- AddForeignKey
ALTER TABLE "UdescSessionVote" ADD CONSTRAINT "UdescSessionVote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UdescSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UdescSessionMetrics" ADD CONSTRAINT "UdescSessionMetrics_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UdescSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
