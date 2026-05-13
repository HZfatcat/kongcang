SELECT DATE("startedAt" AT TIME ZONE 'Asia/Shanghai') as day_local, COUNT(*) as cnt
FROM "UdescSession"
WHERE "startedAt" >= '2026-04-10' AND "startedAt" <= '2026-04-30 23:59:59'::timestamp
GROUP BY day_local
ORDER BY day_local;
