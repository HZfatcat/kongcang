const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 修复 agentName 为 null 但 rawPayload 中有 agent_nick_name 的记录
  const nullAgent = await prisma.udescCallLog.findMany({
    where: { agentName: null },
  });
  console.log(`找到 ${nullAgent.length} 条 agentName 为空的记录`);

  let fixed = 0;
  for (const r of nullAgent) {
    const rp = r.rawPayload || {};
    const name = rp.agent_nick_name || rp.agent_name || rp.agentName || rp.agent;
    if (name) {
      await prisma.udescCallLog.update({
        where: { id: r.id },
        data: { agentName: String(name) }
      });
      fixed++;
      if (fixed <= 5) console.log(`  修复: id=${r.id} agentName=${name}`);
    }
  }
  console.log(`已修复 ${fixed} 条记录的 agentName`);

  // 修复 satisfaction 字段 - 将 "未评价" 转为 "未评"（未评和未评价都视为未参评）
  const notRated = await prisma.udescCallLog.findMany({
    where: { satisfaction: '未评价' }
  });
  console.log(`\n找到 ${notRated.length} 条 satisfaction 为"未评价"的记录`);
  if (notRated.length > 0) {
    const { count } = await prisma.udescCallLog.updateMany({
      where: { satisfaction: '未评价' },
      data: { satisfaction: '未评' }
    });
    console.log(`已将 ${count} 条"未评价"转为"未评"`);
  }

  // 验证修复结果 - 重新统计5月数据
  const mayStart = new Date('2026-05-01T00:00:00.000Z');
  const mayEnd = new Date('2026-05-31T23:59:59.000Z');
  const all = await prisma.udescCallLog.findMany({
    where: { startTime: { gte: mayStart, lte: mayEnd } }
  });

  console.log('\n===== 修复后2026年5月按客服统计 =====');
  const agentMap = {};
  for (const r of all) {
    const name = r.agentName || '未知';
    if (!agentMap[name]) agentMap[name] = { total:0, inbound:0, outbound:0, inConn:0, outConn:0, rated:0, satisfied:0 };
    const d = agentMap[name];
    d.total++;
    if (r.callType === '呼入') d.inbound++; else if (r.callType === '呼出') d.outbound++;
    if (r.callResult === '客服接听') d.inConn++;
    else if (r.callResult === '客户接听') d.outConn++;
    if (r.satisfaction && r.satisfaction !== '未评' && r.satisfaction !== '无需评价') { d.rated++; if (r.satisfaction === '满意') d.satisfied++; }
  }
  for (const [name, d] of Object.entries(agentMap)) {
    const totalConn = d.inConn + d.outConn;
    console.log(`${name}: total=${d.total} 呼入=${d.inbound} 呼出=${d.outbound} 接通=${totalConn}(in=${d.inConn}+out=${d.outConn}) 接通率=${d.total?(totalConn/d.total*100).toFixed(1):0}% 评价/${d.rated}`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
