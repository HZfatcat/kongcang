-- AlterTable
ALTER TABLE "ZouwuRequirement" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "createdByName" TEXT;

-- CreateIndex
CREATE INDEX "ZouwuRequirement_createdById_idx" ON "ZouwuRequirement"("createdById");
