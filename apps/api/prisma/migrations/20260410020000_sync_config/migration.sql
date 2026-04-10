-- CreateTable
CREATE TABLE "SyncConfig" (
    "source" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalHours" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncConfig_pkey" PRIMARY KEY ("source")
);

-- Seed default config for udesc
INSERT INTO "SyncConfig" ("source", "enabled", "intervalHours", "updatedAt")
VALUES ('udesc', true, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("source") DO NOTHING;
