-- 生产环境评分数据诊断脚本
-- 请在生产环境数据库执行以下查询

-- 1. 检查 UdescSession 表中 4 月的评分情况
SELECT 
  'UdescSession.rating IS NOT NULL' AS metric,
  COUNT(*) AS count
FROM "UdescSession"
WHERE "startedAt" >= '2026-04-01' 
  AND "startedAt" < '2026-04-22' 
  AND "rating" IS NOT NULL;
-- 预期: 7 (如果不为 7，说明生产环境 rating 字段没有同步)

-- 2. 检查 UdescSessionVote 表中 4 月的评分情况
SELECT 
  'UdescSessionVote exists' AS metric,
  COUNT(*) AS count
FROM "UdescSessionVote" v
JOIN "UdescSession" s ON s."id" = v."sessionId"
WHERE s."startedAt" >= '2026-04-01' AND s."startedAt" < '2026-04-22';

-- 3. 检查 UdescSessionVote.rating 不为空的数量
SELECT 
  'UdescSessionVote.rating IS NOT NULL' AS metric,
  COUNT(*) AS count
FROM "UdescSessionVote" v
JOIN "UdescSession" s ON s."id" = v."sessionId"
WHERE s."startedAt" >= '2026-04-01' 
  AND s."startedAt" < '2026-04-22' 
  AND v."rating" IS NOT NULL;
-- 如果这里有数据，但查询 1 没有，说明需要执行修复

-- 4. 详细查看 4 月的评分数据
SELECT 
  s."id" AS session_id,
  s."rating" AS session_rating,
  v."rating" AS vote_rating,
  v."votedAt",
  s."startedAt"
FROM "UdescSession" s
LEFT JOIN "UdescSessionVote" v ON v."sessionId" = s."id"
WHERE s."startedAt" >= '2026-04-01' AND s."startedAt" < '2026-04-22'
  AND v."rating" IS NOT NULL
ORDER BY s."startedAt" DESC
LIMIT 20;

-- 5. 总会话数对比
SELECT 
  COUNT(*) AS total_sessions
FROM "UdescSession"
WHERE "startedAt" >= '2026-04-01' AND "startedAt" < '2026-04-22';
-- 预期: 994

-- ============================================
-- 如果查询 2 和 3 有数据，但查询 1 是 0，需要执行修复：
-- ============================================
/*
UPDATE "UdescSession" s
SET "rating" = v."rating"
FROM "UdescSessionVote" v
WHERE s."id" = v."sessionId"
  AND s."rating" IS NULL
  AND v."rating" IS NOT NULL;
*/
