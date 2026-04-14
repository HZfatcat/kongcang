-- AlterTable
ALTER TABLE "ZouwuRequirement" ADD COLUMN     "issueType" INTEGER;

-- CreateIndex
CREATE INDEX "ZouwuRequirement_issueType_idx" ON "ZouwuRequirement"("issueType");
