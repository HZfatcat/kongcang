-- CreateTable
CREATE TABLE "AgentProfile" (
    "agentId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "team" TEXT,
    "role" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("agentId")
);
