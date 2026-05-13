-- 重置 Udesc 同步检查点到 2026-04-10，触发全量重同步
UPDATE "SyncCheckpoint"
SET cursor = '2026-04-10T00:00:00.000Z',
    "lastSyncedAt" = NOW(),
    "updatedAt" = NOW()
WHERE source = 'udesc';
