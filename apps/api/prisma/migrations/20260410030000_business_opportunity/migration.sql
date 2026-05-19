-- CreateEnum
CREATE TYPE "OpportunitySourceType" AS ENUM ('CONSULTATION', 'MANUAL');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('NEW', 'QUALIFIED', 'FOLLOWING', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "BusinessOpportunity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceType" "OpportunitySourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceSessionId" TEXT,
    "agentId" TEXT,
    "customerName" TEXT,
    "contactInfo" TEXT,
    "estimatedAmount" DOUBLE PRECISION,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'NEW',
    "closeReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "nextAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessOpportunity_status_createdAt_idx" ON "BusinessOpportunity"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessOpportunity_sourceType_createdAt_idx" ON "BusinessOpportunity"("sourceType", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessOpportunity_agentId_createdAt_idx" ON "BusinessOpportunity"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessOpportunity_sourceSessionId_idx" ON "BusinessOpportunity"("sourceSessionId");

-- AddForeignKey
ALTER TABLE "BusinessOpportunity" ADD CONSTRAINT "BusinessOpportunity_sourceSessionId_fkey" FOREIGN KEY ("sourceSessionId") REFERENCES "UdeskSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
