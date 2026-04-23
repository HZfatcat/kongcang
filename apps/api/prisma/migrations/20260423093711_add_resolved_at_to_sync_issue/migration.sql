-- AlterTable
ALTER TABLE "SyncIssue" ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SyncIssue_source_category_externalId_idx" ON "SyncIssue"("source", "category", "externalId");

-- CreateIndex
CREATE INDEX "UdescSessionMetrics_firstResponseTime_idx" ON "UdescSessionMetrics"("firstResponseTime");

-- CreateIndex
CREATE INDEX "UdescSessionMetrics_avgResponseTime_idx" ON "UdescSessionMetrics"("avgResponseTime");

-- CreateIndex
CREATE INDEX "UdescSessionMetrics_waitTime_idx" ON "UdescSessionMetrics"("waitTime");

-- CreateIndex
CREATE INDEX "UdescSessionMetrics_resolutionTime_idx" ON "UdescSessionMetrics"("resolutionTime");
