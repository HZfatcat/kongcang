SELECT SUM(count) FROM (
  SELECT DATE("startedAt") as day, COUNT(*) as count FROM "UdescSession" WHERE "startedAt" >= '2026-04-10' AND "startedAt" < '2026-05-14' GROUP BY day ORDER BY day
) sub;
