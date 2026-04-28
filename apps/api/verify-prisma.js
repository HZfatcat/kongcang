// 用 Prisma Client 执行验证 SQL（复用项目已有的 DB 连接）
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://csdn@127.0.0.1:5432/kefumonitor?schema=public&timezone=Asia/Shanghai',
    },
  },
});

async function main() {
  console.log('=== 验证修复：首次响应时间计算 ===\n');

  const r = await prisma.$queryRaw`
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
            THEN 360000.0
          ELSE NULL
        END as fcrt_fixed,
        CASE 
          WHEN first_agent_msg IS NOT NULL AND first_agent_msg > first_customer_msg 
            THEN EXTRACT(EPOCH FROM (first_agent_msg - first_customer_msg))
          WHEN first_agent_msg IS NULL 
            THEN 360000.0
          ELSE NULL
        END as fcrt_old
      FROM session_first
    )
    SELECT 
      COUNT(*)::int as total_sessions,
      COUNT(*) FILTER (WHERE fcrt_old IS NOT NULL)::int as sessions_with_old,
      AVG(fcrt_old)::float as avg_old_seconds,
      AVG(fcrt_old)/3600.0::float as avg_old_hours,
      COUNT(*) FILTER (WHERE fcrt_fixed IS NOT NULL)::int as sessions_with_fixed,
      AVG(fcrt_fixed)::float as avg_fixed_seconds,
      AVG(fcrt_fixed)/3600.0::float as avg_fixed_hours,
      COUNT(*) FILTER (WHERE fcrt_old = 360000)::int as unanswered_old,
      COUNT(*) FILTER (WHERE fcrt_fixed = 360000)::int as unanswered_fixed,
      COUNT(*) FILTER (WHERE fcrt_old < 360000)::int as real_reply_old,
      COUNT(*) FILTER (WHERE fcrt_fixed < 360000)::int as real_reply_fixed,
      COUNT(*) FILTER (WHERE first_agent_msg = first_customer_msg AND first_agent_msg IS NOT NULL)::int as instant_zero_count
    FROM with_fcrt
  `;

  const row = r[0];
  console.log('--- OLD 逻辑（diff > 0）---');
  console.log(`  总会话数:        ${row.total_sessions}`);
  console.log(`  有首次响应:      ${row.sessions_with_old}`);
  console.log(`  无回复(100小时): ${row.unanswered_old}`);
  console.log(`  真实回复:        ${row.real_reply_old}`);
  console.log(`  平均首次响应:    ${row.avg_old_seconds?.toFixed(0)} 秒 = ${parseFloat(row.avg_old_hours).toFixed(2)} 小时`);

  console.log('\n--- FIXED 逻辑（diff >= 0）---');
  console.log(`  有首次响应:      ${row.sessions_with_fixed}`);
  console.log(`  无回复(100小时): ${row.unanswered_fixed}`);
  console.log(`  真实回复:        ${row.real_reply_fixed}`);
  console.log(`  diff=0（即时）:  ${row.instant_zero_count}`);
  console.log(`  平均首次响应:    ${row.avg_fixed_seconds?.toFixed(0)} 秒 = ${parseFloat(row.avg_fixed_hours).toFixed(2)} 小时`);

  console.log('\n--- 分布详情 ---');
  const detail = await prisma.$queryRaw`
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
      COUNT(*) FILTER (WHERE first_agent_msg < first_customer_msg)::int as agent_first_count,
      COUNT(*) FILTER (WHERE first_agent_msg = first_customer_msg AND first_agent_msg IS NOT NULL)::int as equal_count,
      COUNT(*) FILTER (WHERE first_agent_msg > first_customer_msg)::int as customer_first_count,
      COUNT(*) FILTER (WHERE first_agent_msg IS NULL)::int as agent_never_replied
    FROM session_first
    WHERE first_customer_msg IS NOT NULL
  `;
  console.log(`  客服先发（diff<0，修正后仍不计入）:  ${detail[0].agent_first_count}`);
  console.log(`  同时发（diff=0，修正前被丢弃）:     ${detail[0].equal_count}  ← 修复后计入为0秒`);
  console.log(`  客户先发（diff>0，正常计入）:       ${detail[0].customer_first_count}`);
  console.log(`  客服从未回复（记100小时）:          ${detail[0].agent_never_replied}`);

  const oldH = parseFloat(row.avg_old_hours);
  const newH = parseFloat(row.avg_fixed_hours);
  console.log('\n=== 改善 ===');
  console.log(`首次响应平均时间: ${oldH.toFixed(2)}h → ${newH.toFixed(2)}h`);
  console.log(`下降: ${(oldH - newH).toFixed(2)} 小时`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});