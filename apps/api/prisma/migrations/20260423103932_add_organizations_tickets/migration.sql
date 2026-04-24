-- CreateTable
CREATE TABLE "UdescOrganization" (
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

    CONSTRAINT "UdescOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UdescTicket" (
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

    CONSTRAINT "UdescTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UdescOrganization_name_idx" ON "UdescOrganization"("name");

-- CreateIndex
CREATE INDEX "UdescTicket_userId_idx" ON "UdescTicket"("userId");

-- CreateIndex
CREATE INDEX "UdescTicket_assigneeId_idx" ON "UdescTicket"("assigneeId");

-- CreateIndex
CREATE INDEX "UdescTicket_organizationId_idx" ON "UdescTicket"("organizationId");

-- CreateIndex
CREATE INDEX "UdescTicket_status_idx" ON "UdescTicket"("status");

-- CreateIndex
CREATE INDEX "UdescTicket_createdAt_idx" ON "UdescTicket"("createdAt");

-- CreateIndex
CREATE INDEX "UdescTicket_updatedAt_idx" ON "UdescTicket"("updatedAt");

-- CreateIndex
CREATE INDEX "UdescTicket_imSubSessionId_idx" ON "UdescTicket"("imSubSessionId");
