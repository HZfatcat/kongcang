const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 2026年5月数据
  const mayStart = new Date('2026-05-01T00:00:00.000Z');
  const mayEnd = new Date('2026-05-31T23:59:59.000Z');
  
  const all = await prisma.udescCallLog.findMany({
    where: { startTime: { gte: mayStart, lte: mayEnd } },
    orderBy: { startTime: 'asc' }
  });
  console.log('2026年5月总记录数:', all.length);

  // 按客服统计
  const agentMap = {};
  for (const r of all) {
    const name = r.agentName || '未知';
    if (!agentMap[name]) agentMap[name] = { total:0, inbound:0, outbound:0, inConn:0, outConn:0, rated:0, satisfied:0, noEval:0 };
    const d = agentMap[name];
    d.total++;
    if (r.callType === '呼入') d.inbound++; else if (r.callType === '呼出') d.outbound++;
    if (r.callResult === '客服接听') d.inConn++;
    else if (r.callResult === '客户接听') d.outConn++;
    if (r.satisfaction === '满意') { d.rated++; d.satisfied++; }
    else if (r.satisfaction === '不满意') d.rated++;
    else if (r.satisfaction === '无需评价') d.noEval++;
  }
  console.log('\n===== 2026年5月按客服统计 =====');
  for (const [name, d] of Object.entries(agentMap)) {
    const totalConn = d.inConn + d.outConn;
    console.log(`${name}: total=${d.total} 呼入=${d.inbound} 呼出=${d.outbound} 接通=${totalConn}(呼入接通=${d.inConn}+呼出接通=${d.outConn}) 接通率=${d.total>0?(totalConn/d.total*100).toFixed(1):0}% 评价=${d.rated} 满意=${d.satisfied} 无需评价=${d.noEval}`);
  }

  // 呼入参评相关统计
  const inbound = all.filter(r => r.callType === '呼入');
  const outbound = all.filter(r => r.callType === '呼出');
  const inConn = inbound.filter(r => r.callResult === '客服接听');
  const outConn = outbound.filter(r => r.callResult === '客户接听');
  const inRated = inbound.filter(r => r.satisfaction && r.satisfaction !== '未评' && r.satisfaction !== '无需评价' && r.satisfaction !== '未评价');
  const outRated = outbound.filter(r => r.satisfaction && r.satisfaction !== '未评' && r.satisfaction !== '无需评价' && r.satisfaction !== '未评价');
  const inNoEval = inbound.filter(r => r.satisfaction === '无需评价' || r.satisfaction === '未评价').length;
  const outNoEval = outbound.filter(r => r.satisfaction === '无需评价' || r.satisfaction === '未评价').length;
  
  console.log('\n===== 2026年5月整体统计 =====');
  console.log(`呼入: total=${inbound.length} 接通=${inConn.length} 参评=${inRated.length} 无需评价=${inNoEval}`);
  console.log(`  参评率 = ${inRated.length} / (${inConn.length} - ${inNoEval}) = ${inConn.length > inNoEval ? (inRated.length/(inConn.length-inNoEval)*100).toFixed(2) : 'N/A'}%`);
  console.log(`呼出: total=${outbound.length} 接通=${outConn.length} 参评=${outRated.length} 无需评价=${outNoEval}`);
  console.log(`  参评率 = ${outRated.length} / (${outConn.length} - ${outNoEval}) = ${outConn.length > outNoEval ? (outRated.length/(outConn.length-outNoEval)*100).toFixed(2) : 'N/A'}%`);

  // 查看"客服接听但agentName为空的记录"的最新rawPayload
  const noAgent = all.filter(r => r.callResult === '客服接听' && !r.agentName);
  console.log('\n客服接听但agentName为空数量:', noAgent.length);
  if (noAgent.length > 0) {
    const r = noAgent[0];
    const rp = r.rawPayload;
    // 从rawPayload中提取agent信息
    console.log('rawPayload中的agent相关字段:');
    console.log('  agent_nick_name:', rp?.agent_nick_name);
    console.log('  agent_name:', rp?.agent_name);
    console.log('  agentName:', rp?.agentName);
    console.log('  agent:', rp?.agent);
    console.log('  agent_nickname:', rp?.agent_nickname);
    console.log('  agent_id:', rp?.agent_id);
    console.log('  user_name:', rp?.user_name);
    console.log('  agent_email:', rp?.agent_email);
  }

  // 查看"未选择队列"的情况
  const noQueue = all.filter(r => r.callResult === '未选择队列');
  console.log('\n未选择队列数量:', noQueue.length);
  if (noQueue.length > 0) {
    const r = noQueue[0];
    console.log('  呼入数:', noQueue.filter(x=>x.callType==='呼入').length);
    console.log('  呼出数:', noQueue.filter(x=>x.callType==='呼出').length);
    console.log('  接通数:', noQueue.filter(x=>x.callResult==='客服接听'||x.callResult==='客户接听').length);
    console.log('  agentName:', r.agentName);
    console.log('  callType:', r.callType);
    console.log('  callResult:', r.callResult);
    // 判断是否应该算入振铃
  }

  // 看呼入振铃计算: 正确应该是 客服接听 + 未接听，但 "未选择队列" 也应该算吗？
  const inRing = inbound.filter(x => x.callResult === '客服接听' || x.callResult === '未接听' || x.callResult === '客服未接');
  console.log('\n呼入振铃数(客服接听+未接听+客服未接):', inRing.length);

  // 查看所有可能的callResult
  const results = {};
  for (const r of all) results[r.callResult] = (results[r.callResult]||0) + 1;
  console.log('\n通话结果分布:', JSON.stringify(results));

  // 查看所有可能的satisfaction
  const sats = {};
  for (const r of all) sats[r.satisfaction||'null'] = (sats[r.satisfaction||'null']||0) + 1;
  console.log('\n满意度分布:', JSON.stringify(sats));

  await prisma.$disconnect();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
