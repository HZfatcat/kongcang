/**
 * 从本地消息计算会话指标并写入 UdescSessionMetrics 表
 * 运行: npx ts-node scripts/calc-metrics.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始计算会话指标...');
  
  // 获取所有会话及其消息
  const sessions = await prisma.udescSession.findMany({
    include: {
      messages: {
        orderBy: { sentAt: 'asc' },
      },
    },
  });
  
  console.log(`共 ${sessions.length} 个会话需要处理`);
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  for (const session of sessions) {
    const messages = session.messages;
    if (messages.length === 0) {
      skipped++;
      continue;
    }
    
    const agentMsgs = messages.filter(m =>
      m.senderType === 'agent' ||
      (m.rawPayload as Record<string, unknown>)?.sender === 'agent'
    );
    const customerMsgs = messages.filter(m =>
      m.senderType === 'customer' ||
      (m.rawPayload as Record<string, unknown>)?.sender === 'customer'
    );
    
    // 计算首次响应时间
    let firstResponseTime: number | null = null;
    if (customerMsgs.length > 0 && agentMsgs.length > 0) {
      const firstCustomerMsg = customerMsgs[0];
      const firstAgentMsg = agentMsgs.find(a => 
        new Date(a.sentAt) > new Date(firstCustomerMsg.sentAt)
      );
      if (firstAgentMsg) {
        firstResponseTime = Math.round(
          (new Date(firstAgentMsg.sentAt).getTime() - new Date(firstCustomerMsg.sentAt).getTime()) / 1000
        );
      }
    }
    
    // 计算平均响应时间
    let avgResponseTime: number | null = null;
    const responseTimes: number[] = [];
    for (let i = 0; i < customerMsgs.length; i++) {
      const agentReply = agentMsgs.find(a => 
        new Date(a.sentAt) > new Date(customerMsgs[i].sentAt)
      );
      if (agentReply) {
        responseTimes.push(
          (new Date(agentReply.sentAt).getTime() - new Date(customerMsgs[i].sentAt).getTime()) / 1000
        );
      }
    }
    if (responseTimes.length > 0) {
      avgResponseTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
    }
    
    // 计算解决时间
    let resolutionTime: number | null = null;
    if (session.endedAt && messages.length > 0) {
      const firstMsg = messages[0];
      resolutionTime = Math.round(
        (new Date(session.endedAt).getTime() - new Date(firstMsg.sentAt).getTime()) / 1000
      );
    }
    
    // 计算排队等待时间（如果会话有 startedAt 并且第一条是客户消息）
    let waitTime: number | null = null;
    if (customerMsgs.length > 0) {
      const firstCustomerMsg = customerMsgs[0];
      // 等待时间 = 第一条客户消息到最后一条客服消息的时间差？
      // 这里用简单的估算：首条消息距离会话开始的时间
      waitTime = Math.round(
        (new Date(firstCustomerMsg.sentAt).getTime() - new Date(session.startedAt).getTime()) / 1000
      );
      if (waitTime < 0) waitTime = 0;
    }
    
    // 写入数据库
    try {
      await prisma.udescSessionMetrics.upsert({
        where: { sessionId: session.id },
        create: {
          sessionId: session.id,
          firstResponseTime,
          avgResponseTime,
          waitTime,
          resolutionTime,
          messageCount: messages.length,
          agentMessageCount: agentMsgs.length,
          customerMessageCount: customerMsgs.length,
        },
        update: {
          firstResponseTime,
          avgResponseTime,
          waitTime,
          resolutionTime,
          messageCount: messages.length,
          agentMessageCount: agentMsgs.length,
          customerMessageCount: customerMsgs.length,
        },
      });
      created++;
    } catch (e) {
      console.error(`写入会话 ${session.id} 失败:`, e);
    }
    
    if ((created + updated) % 500 === 0) {
      console.log(`已处理 ${created + updated} 个会话...`);
    }
  }
  
  console.log(`\n完成！创建: ${created}, 更新: ${updated}, 跳过: ${skipped}`);
  
  // 验证
  const count = await prisma.udescSessionMetrics.count();
  console.log(`UdescSessionMetrics 表现有 ${count} 条记录`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
