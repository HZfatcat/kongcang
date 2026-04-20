-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "module" TEXT,
    "source" TEXT,
    "action" TEXT,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "userId" TEXT,
    "correlationId" TEXT,
    "duration" INTEGER,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemLog_timestamp_idx" ON "SystemLog"("timestamp");

-- CreateIndex
CREATE INDEX "SystemLog_level_idx" ON "SystemLog"("level");

-- CreateIndex
CREATE INDEX "SystemLog_module_idx" ON "SystemLog"("module");

-- CreateIndex
CREATE INDEX "SystemLog_source_idx" ON "SystemLog"("source");

-- CreateIndex
CREATE INDEX "SystemLog_userId_idx" ON "SystemLog"("userId");
