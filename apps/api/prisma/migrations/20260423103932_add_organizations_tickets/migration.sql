-- CreateTable
CREATE TABLE "UdeskOrganization" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "domains" TEXT,
    "level" TEXT,
    "description" TEXT,
    "token" TEXT,
    "customFields" JSONB,
    "rawPayload" JSONB,
    "updatedAtSource" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UdeskOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UdeskTicket" (
    "id" TEXT NOT NULL,
    "fieldNum" TEXT,
    "subject" TEXT,
    "content" TEXT,
    "source" TEXT,
    "contentType" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "userEmail" TEXT,
    "userCellphone" TEXT,
    "organizationId" TEXT,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "assigneeAvatar" TEXT,
    "userGroupId" TEXT,
    "userGroupName" TEXT,
    "templateId" TEXT,
    "priority" TEXT,
    "status" TEXT,
    "statusEn" TEXT,
    "platform" TEXT,
    "satisfaction" TEXT,
    "customFields" JSONB,
    "tags" TEXT,
    "creatorId" TEXT,
    "imSubSessionId" TEXT,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "solvingAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "solvedDeadline" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "agentRepliedAt" TIMESTAMP(3),
    "customerRepliedAt" TIMESTAMP(3),
    "firstRepliedAt" TIMESTAMP(3),
    "repliedBy" TEXT,
    "rawPayload" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UdeskTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UdeskOrganization_name_idx" ON "UdeskOrganization"("name");

-- CreateIndex
CREATE INDEX "UdeskTicket_userId_idx" ON "UdeskTicket"("userId");

-- CreateIndex
CREATE INDEX "UdeskTicket_assigneeId_idx" ON "UdeskTicket"("assigneeId");

-- CreateIndex
CREATE INDEX "UdeskTicket_organizationId_idx" ON "UdeskTicket"("organizationId");

-- CreateIndex
CREATE INDEX "UdeskTicket_status_idx" ON "UdeskTicket"("status");

-- CreateIndex
CREATE INDEX "UdeskTicket_createdAt_idx" ON "UdeskTicket"("createdAt");

-- CreateIndex
CREATE INDEX "UdeskTicket_updatedAt_idx" ON "UdeskTicket"("updatedAt");

-- CreateIndex
CREATE INDEX "UdeskTicket_imSubSessionId_idx" ON "UdeskTicket"("imSubSessionId");
