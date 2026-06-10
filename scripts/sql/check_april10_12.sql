SELECT DATE("startedAt") as d, COUNT(*) as cnt
FROM "UdescSession"
WHERE "startedAt" >= '2026-04-10' AND "startedAt" < '2026-04-13'
GROUP BY DATE("startedAt")
ORDER BY d;
