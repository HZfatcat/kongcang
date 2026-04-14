-- CreateTable
CREATE TABLE "WecomEmployee" (
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "department" TEXT,
    "position" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "avatar" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isCustomerService" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WecomEmployee_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "WecomEmployee_enabled_idx" ON "WecomEmployee"("enabled");

-- CreateIndex
CREATE INDEX "WecomEmployee_isCustomerService_idx" ON "WecomEmployee"("isCustomerService");
