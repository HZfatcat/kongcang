-- AlterTable
ALTER TABLE "ZouwuRequirement" ADD COLUMN     "isLongTerm" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ZouwuRequirement_isLongTerm_idx" ON "ZouwuRequirement"("isLongTerm");
