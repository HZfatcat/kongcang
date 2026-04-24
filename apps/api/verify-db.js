// 直接用 pg 库连接数据库验证修复
const { Client } = require('pg');

const HUNDRED_HOURS = 100 * 60 * 60; // 360000秒

async function main() {
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    database: 'kefumonitor',
    user: 'csdn',
    password: null, // 无密码认证
  });

  await client.connect();

  console.log('=== 验证修复：首次响应时间计算 ===\n');

  // 1. 查看会话总数和消息分布
  const totalResult = await client.query(`
    SELECT 
      COUNT(*) FILTER (WHERE "senderType" = 'customer') as customer_msg_count,
      COUNT(*) FILTER (WHERE "senderType" = 'agent') as agent_msg_count,
      COUNT(DISTINCT "sessionId") as session_count
    FROM "UdescSessionMessage" sm
    JOIN "UdescSession" s ON s.id = sm."sessionId"
    WHERE s."startedAt" >= '2025-06-01' AND s."startedAt" < '2025-06-30 23:59:59'
  `);
  console.log('会话/消息总量（2025-06）:', totalResult.rows[0]);

  // 2. 分别用 OLD (diff > 0) 和 FIXED (diff >= 0) 逻辑计算平均首次响应时间
  const result = await client.query(`
    WITH session_first AS (
      SELECT 
        s.id as session_id,
        MIN(m."sentAt") FILTER (WHERE m."senderType" = 'customer') as first_customer_msg,
        MIN(m."sentAt") FILTER (WHERE m."senderType" = 'agent') as first_agent_msg
      FROM "UdescSession" s
      JOIN "UdescSessionMessage" m ON m."sessionId" = s.id
      WHERE s."startedAt" >= '2025-06-01' AND s."startedAt" < '2025-06-30 23:59:59'
      GROUP BY s.id
    ),
    with_fcrt AS (
      SELECT *,
        CASE 
          WHEN first_agent_msg IS NOT NULL AND first_agent_msg >= first_customer_msg 
            THEN EXTRACT(EPOCH FROM (first_agent_msg - first_customer_msg))
          WHEN first_agent_msg IS NULL 
            THEN 360000.0  -- 100小时
          ELSE NULL
        END as fcrt_seconds_old,
        CASE 
          WHEN first_agent_msg IS NOT NULL AND first_agent_msg > first_customer_msg 
            THEN EXTRACT(EPOCH FROM (first_agent_msg - first_customer_msg))
          WHEN first_agent_msg IS NOT NULL AND first_agent_msg = first_customer_msg 
            THEN 0.0  -- diff = 0, 新逻辑应该计入
          WHEN first_agent_msg IS NULL 
            THEN 360000.0
          ELSE NULL  -- diff < 0: 客服先发，旧逻辑和新逻辑都不计入
        END as fcrt_seconds_fixed
      FROM session_first
    )
    SELECT 
      COUNT(*) as total_sessions,
      COUNT(*) FILTER (WHERE fcrt_seconds_old IS NOT NULL) as sessions_with_old,
      AVG(fcrt_seconds_old) as avg_old_hours,
      AVG(fcrt_seconds_old) / 3600.0 as avg_old_hours_calc,
      COUNT(*) FILTER (WHERE fcrt_seconds_fixed IS NOT NULL) as sessions_with_fixed,
      AVG(fcrt_seconds_fixed) as avg_fixed_seconds,
      AVG(fcrt_seconds_fixed) / 3600.0 as avg_fixed_hours,
      -- 具体分布
      COUNT(*) FILTER (WHERE fcrt_seconds_old = 360000) as unanswered_old,
      COUNT(*) FILTER (WHERE fcrt_seconds_fixed = 360000) as unanswered_fixed,
      COUNT(*) FILTER (WHERE fcrt_seconds_old < 360000) as real_reply_old,
      COUNT(*) FILTER (WHERE fcrt_seconds_fixed < 360000) as real_reply_fixed,
      -- diff=0 的会话数（修复的关键）
      COUNT(*) FILTER (WHERE first_agent_msg = first_customer_msg AND first_agent_msg IS NOT NULL) as instant_zero_count
    FROM with_fcrt
  `);

  const r = result.rows[0];
  console.log('\n--- OLD 逻辑（diff > 0）---');
  console.log(`  总会话数: ${r.total_sessions}`);
  console.log(`  有首次响应: ${r.sessions_with_old}`);
  console.log(`  无回复(100小时): ${r.unanswered_old}`);
  console.log(`  真实回复: ${r.real_reply_old}`);
  console.log(`  平均首次响应: ${parseFloat(r.avg_old_hours_calc).toFixed(2)} 小时 = ${parseFloat(r.avg_old_hours).toFixed(0)} 秒`);

  console.log('\n--- FIXED 逻辑（diff >= 0）---');
  console.log(`  有首次响应: ${r.sessions_with_fixed}`);
  console.log(`  无回复(100小时): ${r.unanswered_fixed}`);
  console.log(`  真实回复: ${r.real_reply_fixed}`);
  console.log(`  diff=0（即时回复）: ${r.instant_zero_count}`);
  console.log(`  平均首次响应: ${parseFloat(r.avg_fixed_hours).toFixed(2)} 小时 = ${parseFloat(r.avg_fixed_seconds).toFixed(0)} 秒`);

  console.log('\n--- 改善 ---');
  const oldH = parseFloat(r.avg_old_hours);
  const newH = parseFloat(r.avg_fixed_hours);
  if (oldH > newH) {
    console.log(`  首次响应平均时间从 ${oldH.toFixed(0)}秒 (${(oldH/3600).toFixed(2)}h) 降到了 ${newH.toFixed(0)}秒 (${(newH/3600).toFixed(2)}h)`);
  }

  // 3. 看 diff=0 和 diff<0 的具体情况
  const detailResult = await client.query(`
    WITH session_first AS (
      SELECT 
        s.id as session_id,
        MIN(m."sentAt") FILTER (WHERE m."senderType" = 'customer') as first_customer_msg,
        MIN(m."sentAt") FILTER (WHERE m."senderType" = 'agent') as first_agent_msg
      FROM "UdescSession" s
      JOIN "UdescSessionMessage" m ON m."sessionId" = s.id
      WHERE s."startedAt" >= '2025-06-01' AND s."startedAt" < '2025-06-30 23:59:59'
      GROUP BY s.id
    )
    SELECT 
      COUNT(*) FILTER (WHERE first_agent_msg < first_customer_msg) as agent_first_count,
      COUNT(*) FILTER (WHERE first_agent_msg = first_customer_msg) as equal_count,
      COUNT(*) FILTER (WHERE first_agent_msg > first_customer_msg) as customer_first_count,
      COUNT(*) FILTER (WHERE first_agent_msg IS NULL) as agent_never_replied
    FROM session_first
    WHERE first_customer_msg IS NOT NULL
  `);
  console.log('\n--- 会话分布详情 ---');
  console.log('  客服先发（diff<0）:', detailResult.rows[0].agent_first_count, '← 这些在 diff>=0 逻辑下不计入平均');
  console.log('  同时发（diff=0）:', detailResult.rows[0].equal_count, '← 修复后计入（0秒）');
  console.log('  客户先发（diff>0）:', detailResult.rows[0].customer_first_count);
  console.log('  客服从未回复:', detailResult.rows[0].agent_never_replied, '← 记100小时');

  await client.end();
}

main().catch(console.error);