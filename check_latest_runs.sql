SELECT id, status, "recordsSynced", message, "startedAt", "finishedAt"
FROM "SyncRun"
WHERE source='udesc'
ORDER BY "startedAt" DESC
LIMIT 5;
