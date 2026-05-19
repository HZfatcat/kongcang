-- CreateTable
CREATE TABLE "UdeskSessionVote" (
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

    CONSTRAINT "UdeskSessionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UdeskCustomer" (
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

    CONSTRAINT "UdeskCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UdeskAgent" (
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

    CONSTRAINT "UdeskAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UdeskSessionMetrics" (
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

    CONSTRAINT "UdeskSessionMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UdeskSessionVote_sessionId_idx" ON "UdeskSessionVote"("sessionId");

-- CreateIndex
CREATE INDEX "UdeskSessionVote_votedAt_idx" ON "UdeskSessionVote"("votedAt");

-- CreateIndex
CREATE INDEX "UdeskCustomer_phone_idx" ON "UdeskCustomer"("phone");

-- CreateIndex
CREATE INDEX "UdeskCustomer_email_idx" ON "UdeskCustomer"("email");

-- CreateIndex
CREATE INDEX "UdeskCustomer_enterprise_idx" ON "UdeskCustomer"("enterprise");

-- CreateIndex
CREATE INDEX "UdeskAgent_enabled_idx" ON "UdeskAgent"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "UdeskSessionMetrics_sessionId_key" ON "UdeskSessionMetrics"("sessionId");

-- CreateIndex
CREATE INDEX "UdeskSessionMetrics_sessionId_idx" ON "UdeskSessionMetrics"("sessionId");

-- AddForeignKey
ALTER TABLE "UdeskSessionVote" ADD CONSTRAINT "UdeskSessionVote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UdeskSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UdeskSessionMetrics" ADD CONSTRAINT "UdeskSessionMetrics_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UdeskSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
