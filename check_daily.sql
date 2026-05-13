SELECT DATE("startedAt" AT TIME ZONE 'Asia/Shanghai') as day, COUNT(*) as cnt
FROM "UdescSession"
WHERE "startedAt" >= '2026-04-10 00:00:00+08'
  AND "startedAt" < '2026-05-13 00:00:00+08'
GROUP BY 1
ORDER BY 1;
