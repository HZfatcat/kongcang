-- AlterTable
ALTER TABLE "SyncIssue" ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SyncIssue_source_category_externalId_idx" ON "SyncIssue"("source", "category", "externalId");

-- CreateIndex
CREATE INDEX "UdeskSessionMetrics_firstResponseTime_idx" ON "UdeskSessionMetrics"("firstResponseTime");

-- CreateIndex
CREATE INDEX "UdeskSessionMetrics_avgResponseTime_idx" ON "UdeskSessionMetrics"("avgResponseTime");

-- CreateIndex
CREATE INDEX "UdeskSessionMetrics_waitTime_idx" ON "UdeskSessionMetrics"("waitTime");

-- CreateIndex
CREATE INDEX "UdeskSessionMetrics_resolutionTime_idx" ON "UdeskSessionMetrics"("resolutionTime");
