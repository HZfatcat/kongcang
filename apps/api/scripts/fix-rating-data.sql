-- 修复评分数据：将 UdescSessionVote 的评分同步到 UdescSession.rating
-- 执行前请先备份数据库

-- 1. 查看需要修复的数据量
SELECT 
  COUNT(*) AS total_votes,
  COUNT(DISTINCT v."sessionId") AS sessions_with_votes,
  SUM(CASE WHEN s."rating" IS NULL THEN 1 ELSE 0 END) AS need_fix_count
FROM "UdescSessionVote" v
LEFT JOIN "UdescSession" s ON s."id" = v."sessionId"
WHERE v."rating" IS NOT NULL;

-- 2. 查看当前评分状态
SELECT 
  COUNT(*) AS total_sessions,
  SUM(CASE WHEN "rating" IS NOT NULL THEN 1 ELSE 0 END) AS sessions_with_rating,
  SUM(CASE WHEN "rating" IS NULL THEN 1 ELSE 0 END) AS sessions_without_rating
FROM "UdescSession";

-- 3. 执行修复（取消注释执行）
-- UPDATE "UdescSession" s
-- SET "rating" = v."rating"
-- FROM "UdescSessionVote" v
-- WHERE s."id" = v."sessionId"
--   AND s."rating" IS NULL
--   AND v."rating" IS NOT NULL;

-- 4. 验证修复结果
-- SELECT 
--   COUNT(*) AS total_sessions,
--   SUM(CASE WHEN "rating" IS NOT NULL THEN 1 ELSE 0 END) AS sessions_with_rating
-- FROM "UdescSession";
