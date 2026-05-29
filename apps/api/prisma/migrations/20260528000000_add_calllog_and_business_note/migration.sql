-- CreateTable
CREATE TABLE "UdescCallLog" (
    "id" TEXT NOT NULL,
    "callType" TEXT,
    "callResult" TEXT,
    "customerPhone" TEXT,
    "agentName" TEXT,
    "callTime" INTEGER,
    "startTime" TIMESTAMP(3),
    "survey" TEXT,
    "satisfaction" TEXT,
    "rawPayload" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UdescCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UdescBusinessNote" (
    "id" TEXT NOT NULL,
    "agentNickName" TEXT,
    "customerNickName" TEXT,
    "createdAt" TIMESTAMP(3),
    "problemType1" TEXT,
    "problemType2" TEXT,
    "problemType3" TEXT,
    "rawPayload" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UdescBusinessNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UdescCallLog_startTime_idx" ON "UdescCallLog"("startTime");

-- CreateIndex
CREATE INDEX "UdescCallLog_callType_idx" ON "UdescCallLog"("callType");

-- CreateIndex
CREATE INDEX "UdescCallLog_callResult_idx" ON "UdescCallLog"("callResult");

-- CreateIndex
CREATE INDEX "UdescBusinessNote_createdAt_idx" ON "UdescBusinessNote"("createdAt");
