import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { UdescClient } from '../sync/udesc.client';

/**
 * 将 Date 转为本地时间 ISO 字符串（不含 Z 后缀）
 * 例如：2026-04-22T11:00:00（北京时间）
 * 前端 dayjs 解析时会按本地时间处理
 */
function toLocalISOString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 判断消息是否为系统自动消息（不包含在消息数统计中）
 * 匹配内容包含系统提示、超时、会话关闭、满意度调查等
 * 注意：仅用于内容检测，不覆盖 API 已正确标记的发送者类型
 */
function isSystemMessage(content: string | object | null | undefined): boolean {
  if (!content) return false;
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const patterns = [
    /"push_type"/,
    /"is_welcome":true/,
    /"type":"survey"/,
    /"type":"start_session"/,
    /满意度调查/,
    /系统将暂时关闭/,
    /有新的咨询进来了/,
    /长时间未响应/,
    /超时未回复/,
    /系统将自动结束会话/,
    /已为您转接/,
    /正在为您转接/,
    /转接至/,
    /会话已结束/,
    /会话已关闭/,
    /客服已离线/,
    /客服已上线/,
    /"type":"lock"/,
    /锁定会话/,
    /解锁对话/,
    /"auto":true/,
    /"is_receive":false/,
  ];
  return patterns.some(p => p.test(text));
}

/**
 * 判断消息发送者是否为客服或客户（基于 senderType 字段及 rawPayload）
 * 同时支持英文('agent','customer')和中文('客服','客户')值
 */
function isAgentSenderType(senderType: string | null | undefined): boolean {
  return senderType === 'agent' || senderType === '客服' || senderType === 'AGENT';
}

function isCustomerSenderType(senderType: string | null | undefined): boolean {
  return senderType === 'customer' || senderType === '客户' || senderType === 'CUSTOMER';
}

function isSystemSenderType(senderType: string | null | undefined): boolean {
  return senderType === 'system' || senderType === '系统' || senderType === 'SYSTEM';
}

/**
 * 计算非系统消息数量（客服消息 + 客户消息）
 * - 内容优先检测：匹配系统消息模式则排除（覆盖 UDesk 误标记的 senderType）
 * - 其次信任 senderType/rawPayload 判断
 */
function countNonSystemMessages(messages: any[]): number {
  return messages.filter(m => {
    // 内容优先检测：系统消息直接排除
    if (isSystemMessage(m.content)) return false;
    // 有明确发送者类型的消息，计入
    if (isAgentSenderType(m.senderType) || isCustomerSenderType(m.senderType)) return true;
    // 从 rawPayload 兜底判断
    const raw = m.rawPayload as Record<string, unknown> | undefined;
    if (raw?.sender === 'agent' || raw?.sender === 'customer') return true;
    return false;
  }).length;
}

/**
 * 规范化消息 senderType：统一输出为前端可识别的中文值
 * - 内容优先检测：若匹配系统消息模式则直接返回'系统'（覆盖 UDesk 误标记的 senderType）
 * - 其次信任 API 返回的 'agent'/'customer'/'客服'/'客户' 等明确值
 * - 最后从 rawPayload.sender 兜底判断
 */
function normalizeSenderType(msg: any): string {
  const st = msg.senderType;
  // 内容优先检测：匹配系统消息模式则直接返回'系统'（即使 senderType 被误标记为 agent/customer）
  if (isSystemMessage(msg.content)) return '系统';
  // API 已明确标记为客服或客户，信任原始数据
  if (isAgentSenderType(st)) return '客服';
  if (isCustomerSenderType(st)) return '客户';
  // 尝试从 rawPayload 判断
  const raw = msg.rawPayload as Record<string, unknown> | undefined;
  if (raw?.sender === 'agent') return '客服';
  if (raw?.sender === 'customer') return '客户';
  return st || '';
}

@Injectable()
export class UdescService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly udescClient: UdescClient,
  ) {}

  private resolveRange(startDate?: string, endDate?: string) {
    const start = startDate
      ? startDate.includes('T') || startDate.includes('Z')
        ? new Date(startDate)
        : new Date(startDate + 'T00:00:00.000+08:00')
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate
      ? endDate.includes('T') || endDate.includes('Z')
        ? new Date(endDate)
        : new Date(endDate + 'T23:59:59.999+08:00')
      : new Date();
    return { start, end };
  }

  async getOverview(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);
    const where = {
      startedAt: {
        gte: start,
        lte: end,
      },
    };

    // 获取时间范围内的 sessionIds，用于从 UdescSessionVote 表查询评价
    const sessionsInRange = await this.prisma.udescSession.findMany({
      where,
      select: { id: true },
    });
    const sessionIds = sessionsInRange.map((s) => s.id);

    // 获取评价标签统计（包含"回访"标签计数）
    const voteTagStatsPromise = this.getVoteTagStats(start, end);

    const [totalSessions, totalMessages, agentCount, ratedCount, avgRating, topAgents, voteTagStats, customerCount, returnVisitCount] =
      await Promise.all([
      this.prisma.udescSession.count({ where }),
      this.prisma.udescSessionMessage.findMany({
        where: {
          session: where,
        },
        select: { content: true, senderType: true, rawPayload: true },
      }).then(messages => countNonSystemMessages(messages)),
      this.prisma.udescSession
        .findMany({
          where: {
            ...where,
            agentId: { not: null },
          },
          distinct: ['agentId'],
          select: { agentId: true },
        })
        .then((rows) => rows.length),
      // 从 UdescSessionVote 表统计总评价数（与评价分析页 getVotes 的 total 逻辑一致）
      this.prisma.udescSessionVote.count({
        where: {
          sessionId: { in: sessionIds },
        },
      }),
      // 从 UdescSessionVote 表计算平均评分
      this.prisma.udescSessionVote.aggregate({
        where: {
          sessionId: { in: sessionIds },
          rating: { not: null },
        },
        _avg: { rating: true },
      }),
      this.prisma.udescSession.groupBy({
        by: ['agentId'],
        where: {
          ...where,
          agentId: { not: null },
        },
        _count: { id: true },
        orderBy: {
          _count: { id: 'desc' },
        },
        take: 10,
      }),
      voteTagStatsPromise,
      this.prisma.udescCustomer.count(),
      // 统计回访会话数：查找 UdescSessionVote 中 tags 包含"回访"的会话
      this.prisma.udescSessionVote
        .findMany({
          where: {
            sessionId: { in: sessionIds },
            tags: { has: '回访' },
          },
          select: { sessionId: true },
        })
        .then((votes) => new Set(votes.map((v) => v.sessionId)).size),
      ]);

    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      totalSessions,
      totalMessages,
      avgMessagesPerSession: totalSessions > 0 ? Number((totalMessages / totalSessions).toFixed(2)) : 0,
      agentCount,
      ratedCount,
      avgRating: avgRating._avg.rating ?? null,
      topAgents: topAgents.map((item) => ({
        agentId: item.agentId ?? 'unknown',
        sessions: item._count.id,
      })),
      voteTagStats: voteTagStats,
      customerCount,
      returnVisitCount,
    };
  }

  private async getVoteTagStats(start: Date, end: Date) {
    // 先获取时间范围内的 sessionId
    const sessionsInRange = await this.prisma.udescSession.findMany({
      where: { startedAt: { gte: start, lte: end } },
      select: { id: true },
    });
    const sessionIds = sessionsInRange.map((s) => s.id);

    const votes = await this.prisma.udescSessionVote.findMany({
      where: {
        sessionId: { in: sessionIds },
      },
      select: { tags: true, rating: true },
    });

    const tagCounts = new Map<string, { count: number; ratingSum: number }>();
    for (const vote of votes) {
      for (const tag of vote.tags) {
        const existing = tagCounts.get(tag) ?? { count: 0, ratingSum: 0 };
        existing.count += 1;
        if (vote.rating !== null) {
          existing.ratingSum += vote.rating;
        }
        tagCounts.set(tag, existing);
      }
    }

    return Array.from(tagCounts.entries())
      .map(([tag, data]) => ({
        tag,
        count: data.count,
        avgRating: data.ratingSum > 0 ? Number((data.ratingSum / data.count).toFixed(2)) : null,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  async getAgentTree(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);
    const sessions = await this.prisma.udescSession.findMany({
      where: {
        startedAt: { gte: start, lte: end },
      },
      orderBy: {
        startedAt: 'desc',
      },
      include: {
        _count: {
          select: { messages: true },
        },
      },
      take: 2000,
    });

    const grouped = new Map<
      string,
      {
        agentId: string;
        sessionCount: number;
        ratedCount: number;
        avgRatingTotal: number;
        sessions: Array<Record<string, unknown>>;
      }
    >();

    for (const session of sessions) {
      const agentId = session.agentId ?? '未分配客服';
      if (!grouped.has(agentId)) {
        grouped.set(agentId, {
          agentId,
          sessionCount: 0,
          ratedCount: 0,
          avgRatingTotal: 0,
          sessions: [],
        });
      }
      const node = grouped.get(agentId)!;
      node.sessionCount += 1;
      if (session.rating !== null) {
        node.ratedCount += 1;
        node.avgRatingTotal += session.rating;
      }
      node.sessions.push({
        id: session.id,
        startedAt: toLocalISOString(session.startedAt),
        endedAt: session.endedAt ? toLocalISOString(session.endedAt) : null,
        rating: session.rating,
        messageCount: session._count.messages,
      });
    }

    return Array.from(grouped.values()).map((node) => ({
      agentId: node.agentId,
      sessionCount: node.sessionCount,
      avgRating: node.ratedCount > 0 ? Number((node.avgRatingTotal / node.ratedCount).toFixed(2)) : null,
      sessions: node.sessions,
    }));
  }

  async getSessions(params: {
    startDate?: string;
    endDate?: string;
    agentId?: string;
    agentIds?: string;
    sessionId?: string;
    page?: number;
    pageSize?: number;
  }) {
    console.log('[Service] getSessions params:', JSON.stringify(params));
    const { start, end } = this.resolveRange(params.startDate, params.endDate);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const agentIds = (params.agentIds ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    
    // 当有 sessionId 搜索时，不限制时间范围，且精确匹配 ID
    const where = {
      ...(params.sessionId
        ? { id: params.sessionId }
        : {
            startedAt: { gte: start, lte: end },
            ...(agentIds.length > 0
              ? { agentId: { in: agentIds } }
              : params.agentId
                ? { agentId: params.agentId }
                : {}),
          }),
    };
    console.log('[Service] getSessions where clause:', JSON.stringify(where, null, 2));

    const [total, rows] = await Promise.all([
      this.prisma.udescSession.count({ where }),
      this.prisma.udescSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          messages: {
            orderBy: { sentAt: 'asc' },
            take: 50,
          },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      records: rows.map((item) => {
        // 从 rawPayload 中提取用户名（兼容多种字段名）
        const rawPayload = item.rawPayload as Record<string, unknown> | null;
        const userName =
          (rawPayload?.['customer_name'] as string) ??
          (rawPayload?.['user_name'] as string) ??
          (rawPayload?.['nick_name'] as string) ??
          (rawPayload?.['customer_nick_name'] as string) ??
          (rawPayload?.['client_name'] as string) ??
          (rawPayload?.['name'] as string) ??
          (rawPayload?.['customerName'] as string) ??
          '';

        return {
          id: item.id,
          agentId: item.agentId,
          userName,
          startedAt: toLocalISOString(item.startedAt),
          endedAt: item.endedAt ? toLocalISOString(item.endedAt) : null,
          rating: item.rating,
          isConsultToDemand: item.isConsultToDemand,
          messageCount: countNonSystemMessages(item.messages),
          messages: item.messages.map((msg) => ({
            id: msg.id,
            sentAt: toLocalISOString(msg.sentAt),
            senderType: normalizeSenderType(msg),
            senderId: msg.senderId,
            content: msg.content,
          })),
        };
      }),
    };
  }

  async getDailyAgentStats(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);

    const sessionRows = await this.prisma.$queryRaw<
      Array<{
        day: Date;
        agentId: string | null;
        sessionCount: bigint;
      }>
    >`
      SELECT
        DATE_TRUNC('day', s."startedAt") AS day,
        s."agentId" AS "agentId",
        COUNT(*)::bigint AS "sessionCount"
      FROM "UdescSession" s
      WHERE s."startedAt" >= ${start} AND s."startedAt" <= ${end}
      GROUP BY DATE_TRUNC('day', s."startedAt"), s."agentId"
      ORDER BY day ASC
    `;

    // 获取所有消息数据（含 content），在代码中排除系统消息后按天/客服聚合
    const allMessages = await this.prisma.$queryRaw<
      Array<{
        day: Date;
        agentId: string | null;
        id: bigint;
        content: string | null;
        senderType: string | null;
        rawPayload: unknown;
        sentAt: Date;
      }>
    >`
      SELECT
        DATE_TRUNC('day', s."startedAt") AS day,
        s."agentId" AS "agentId",
        m."id" AS "id",
        m."content" AS "content",
        m."senderType" AS "senderType",
        m."rawPayload" AS "rawPayload",
        m."sentAt" AS "sentAt"
      FROM "UdescSession" s
      LEFT JOIN "UdescSessionMessage" m ON m."sessionId" = s."id"
      WHERE s."startedAt" >= ${start} AND s."startedAt" <= ${end}
      ORDER BY s."agentId", day ASC
    `;

    const sessionMap = new Map<string, number>();
    const messageMap = new Map<string, number>();
    const daySet = new Set<string>();
    const agentSet = new Set<string>();

    for (const row of sessionRows) {
      const day = new Date(row.day).toISOString().slice(0, 10);
      const agentId = row.agentId ?? '未分配客服';
      const key = `${day}__${agentId}`;
      sessionMap.set(key, Number(row.sessionCount));
      daySet.add(day);
      agentSet.add(agentId);
    }

    for (const row of allMessages) {
      // 排除系统消息
      if (!row.id) continue; // LEFT JOIN 产生的 NULL 行
      if (isSystemMessage(row.content)) continue;
      if (isAgentSenderType(row.senderType) || isCustomerSenderType(row.senderType)) {
        // 正常计数
      } else {
        const raw = row.rawPayload as Record<string, unknown> | undefined;
        if (raw?.sender !== 'agent' && raw?.sender !== 'customer') continue;
      }

      const day = new Date(row.day).toISOString().slice(0, 10);
      const agentId = row.agentId ?? '未分配客服';
      const key = `${day}__${agentId}`;
      messageMap.set(key, (messageMap.get(key) ?? 0) + 1);
      daySet.add(day);
      agentSet.add(agentId);
    }

    const days = Array.from(daySet).sort((a, b) => a.localeCompare(b));
    const agents = Array.from(agentSet).sort((a, b) => a.localeCompare(b));

    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      days,
      series: agents.map((agentId) => ({
        agentId,
        sessions: days.map((day) => sessionMap.get(`${day}__${agentId}`) ?? 0),
        messages: days.map((day) => messageMap.get(`${day}__${agentId}`) ?? 0),
      })),
    };
  }

  async getDailyRatingStats(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);

    const ratingRows = await this.prisma.$queryRaw<
      Array<{
        day: Date;
        agentId: string | null;
        avgRating: number | null;
        ratingCount: bigint;
      }>
    >`
      SELECT
        DATE_TRUNC('day', s."startedAt") AS day,
        s."agentId" AS "agentId",
        AVG(s."rating")::double precision AS "avgRating",
        COUNT(s."rating")::bigint AS "ratingCount"
      FROM "UdescSession" s
      WHERE s."startedAt" >= ${start} AND s."startedAt" <= ${end}
        AND s."rating" IS NOT NULL
      GROUP BY DATE_TRUNC('day', s."startedAt"), s."agentId"
      ORDER BY day ASC
    `;

    const ratingMap = new Map<string, { sum: number; count: number }>();
    const daySet = new Set<string>();
    const agentSet = new Set<string>();

    for (const row of ratingRows) {
      const day = new Date(row.day).toISOString().slice(0, 10);
      const agentId = row.agentId ?? '未分配客服';
      const key = `${day}__${agentId}`;
      const avg = row.avgRating ?? 0;
      const cnt = Number(row.ratingCount);
      ratingMap.set(key, { sum: avg * cnt, count: cnt });
      daySet.add(day);
      agentSet.add(agentId);
    }

    const days = Array.from(daySet).sort((a, b) => a.localeCompare(b));
    const agents = Array.from(agentSet).sort((a, b) => a.localeCompare(b));

    // 计算整体平均评分（按天）
    const overallMap = new Map<string, { sum: number; count: number }>();
    for (const row of ratingRows) {
      const day = new Date(row.day).toISOString().slice(0, 10);
      const avg = row.avgRating ?? 0;
      const cnt = Number(row.ratingCount);
      const prev = overallMap.get(day) ?? { sum: 0, count: 0 };
      overallMap.set(day, { sum: prev.sum + avg * cnt, count: prev.count + cnt });
    }

    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      days,
      series: agents.map((agentId) => ({
        agentId,
        ratings: days.map((day) => {
          const entry = ratingMap.get(`${day}__${agentId}`);
          return entry && entry.count > 0 ? Number((entry.sum / entry.count).toFixed(2)) : null;
        }),
      })),
      overall: days.map((day) => {
        const entry = overallMap.get(day);
        return entry && entry.count > 0 ? Number((entry.sum / entry.count).toFixed(2)) : null;
      }),
    };
  }

  async getMonthlyVoteStats(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);

    const rows = await this.prisma.$queryRaw<
      Array<{
        month: Date;
        totalVotes: bigint;
        satisfiedCount: bigint;
        resolvedCount: bigint;
      }>
    >`
      SELECT
        DATE_TRUNC('month', s."startedAt") AS month,
        COUNT(s."rating")::bigint AS "totalVotes",
        COUNT(CASE WHEN s."rating" >= 4 THEN 1 END)::bigint AS "satisfiedCount",
        COUNT(CASE WHEN s."rawPayload"->>'resolved_state_name' = '已解决' THEN 1 END)::bigint AS "resolvedCount"
      FROM "UdescSession" s
      WHERE s."startedAt" >= ${start} AND s."startedAt" <= ${end}
        AND s."rating" IS NOT NULL
      GROUP BY DATE_TRUNC('month', s."startedAt")
      ORDER BY month ASC
    `;

    // 构建月份 -> 数据映射
    const monthMap = new Map<string, { totalVotes: number; satisfiedCount: number; resolvedCount: number }>();
    for (const row of rows) {
      const d = new Date(row.month);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, {
        totalVotes: Number(row.totalVotes),
        satisfiedCount: Number(row.satisfiedCount),
        resolvedCount: Number(row.resolvedCount),
      });
    }

    // 补全从 start 到 end 之间的所有月份（缺失月份填 0）
    const result: { month: string; totalVotes: number; satisfiedCount: number; resolvedCount: number }[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (current <= last) {
      const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      const existing = monthMap.get(key);
      result.push({
        month: key,
        totalVotes: existing?.totalVotes ?? 0,
        satisfiedCount: existing?.satisfiedCount ?? 0,
        resolvedCount: existing?.resolvedCount ?? 0,
      });
      current.setMonth(current.getMonth() + 1);
    }

    return result;
  }

  async getMonthlyMetrics(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);

    // 查询所有会话（按月分组），优先使用预计算指标表，其次 rawPayload，最后回退消息计算
    const sessions = await this.prisma.udescSession.findMany({
      where: {
        startedAt: { gte: start, lte: end },
      },
      include: {
        messages: {
          orderBy: { sentAt: 'asc' },
          select: { sentAt: true, senderType: true, content: true, rawPayload: true },
        },
        metrics: {
          select: { avgResponseTime: true, firstResponseTime: true },
        },
      },
    });

    // 从 rawPayload 提取数值的工具函数
    const extractNum = (v: unknown): number | null => {
      if (typeof v === 'number' && v >= 0) return Math.round(v);
      if (typeof v === 'string') {
        const n = Number(v);
        return !isNaN(n) && n >= 0 ? Math.round(n) : null;
      }
      return null;
    };

    // 按月分组
    const monthMap = new Map<string, {
      firstResponseTimes: number[];
      responseTimes: number[];
    }>();

    for (const s of sessions) {
      const monthKey = s.startedAt.toISOString().slice(0, 7);
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { firstResponseTimes: [], responseTimes: [] });
      }
      const bucket = monthMap.get(monthKey)!;

      // 优先级1：使用 rawPayload 的上游数据（与对话报表一致）
      const raw = s.rawPayload as Record<string, unknown> | null;
      const rawFrt = raw ? extractNum(raw.resp_seconds) : null;
      const rawAvg = raw ? extractNum(raw.avg_resp_seconds) : null;

      let hasFrtFromPayload = false;
      let hasAvgFromPayload = false;

      if (rawFrt !== null) {
        bucket.firstResponseTimes.push(rawFrt);
        hasFrtFromPayload = true;
      }
      if (rawAvg !== null) {
        bucket.responseTimes.push(rawAvg);
        hasAvgFromPayload = true;
      }

      // 优先级2：使用预计算指标表（本地计算值作为 fallback）
      if (!hasFrtFromPayload && s.metrics?.firstResponseTime != null) {
        bucket.firstResponseTimes.push(s.metrics.firstResponseTime);
      }
      if (!hasAvgFromPayload && s.metrics?.avgResponseTime != null && s.metrics.avgResponseTime > 0) {
        bucket.responseTimes.push(s.metrics.avgResponseTime);
      }

      // 优先级3：rawPayload 也缺失时，回退到消息时间戳计算
      if (!hasFrtFromPayload && !hasAvgFromPayload && !s.metrics) {
          const agentMsgs = s.messages.filter((m) =>
            !isSystemMessage(m.content) && (
              isAgentSenderType(m.senderType) ||
              (m.rawPayload as Record<string, unknown> | null)?.sender === 'agent'
            )
          );
          const customerMsgs = s.messages.filter((m) =>
            !isSystemMessage(m.content) && (
              isCustomerSenderType(m.senderType) ||
              (m.rawPayload as Record<string, unknown> | null)?.sender === 'customer'
            )
          );

          if (rawFrt === null && customerMsgs.length > 0 && agentMsgs.length > 0) {
            const firstAgentAfterStart = agentMsgs.find((a) => new Date(a.sentAt) > new Date(s.startedAt));
            if (firstAgentAfterStart) {
              const diff = Math.round(
                (new Date(firstAgentAfterStart.sentAt).getTime() - new Date(s.startedAt).getTime()) / 1000
              );
              if (diff >= 0) bucket.firstResponseTimes.push(diff);
            }
          }

          if (rawAvg === null) {
            let firstAgentReplyTime = Infinity;
            if (agentMsgs.length > 0) {
              firstAgentReplyTime = new Date(agentMsgs[0].sentAt).getTime();
            }
            let agentIdx = 0;
            const pairResponseTimes: number[] = [];
            for (let ci = 0; ci < customerMsgs.length && agentIdx < agentMsgs.length; ci++) {
              const custTime = new Date(customerMsgs[ci].sentAt).getTime();
              if (custTime < firstAgentReplyTime) continue;
              while (agentIdx < agentMsgs.length && new Date(agentMsgs[agentIdx].sentAt).getTime() < custTime) {
                agentIdx++;
              }
              if (agentIdx < agentMsgs.length) {
                const diff = new Date(agentMsgs[agentIdx].sentAt).getTime() - custTime;
                if (diff > 0) {
                  pairResponseTimes.push(Math.min(Math.round(diff / 1000), 3600));
                } else {
                  pairResponseTimes.push(0);
                }
                agentIdx++;
              }
            }
            // 每个会话的响应时间取均值再参与团队平均，保持各会话权重一致
            if (pairResponseTimes.length > 0) {
              bucket.responseTimes.push(Math.round(pairResponseTimes.reduce((a, b) => a + b, 0) / pairResponseTimes.length));
            }
          }
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const rows = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        avgFirstResponseTime: avg(data.firstResponseTimes),
        avgResponseTime: avg(data.responseTimes),
      }));

    return rows;
  }

  // ========== 新增 API：客户管理 ==========

  async getCustomers(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    enterprise?: string;
  }) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    
    const where = {
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' as const } },
              { phone: { contains: params.search, mode: 'insensitive' as const } },
              { email: { contains: params.search, mode: 'insensitive' as const } },
              { enterprise: { contains: params.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(params.enterprise ? { enterprise: params.enterprise } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.udescCustomer.count({ where }),
      this.prisma.udescCustomer.findMany({
        where,
        orderBy: { syncedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      records: rows.map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
        email: item.email,
        wechat: item.wechat,
        enterprise: item.enterprise,
        tags: item.tags,
        syncedAt: toLocalISOString(item.syncedAt),
      })),
    };
  }

  async getCustomerDetail(id: string) {
    const customer = await this.prisma.udescCustomer.findUnique({
      where: { id },
    });

    if (!customer) {
      return null;
    }

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      wechat: customer.wechat,
      enterprise: customer.enterprise,
      tags: customer.tags,
      customFields: customer.customFields,
      updatedAtSource: customer.updatedAtSource ? toLocalISOString(customer.updatedAtSource) : null,
      syncedAt: toLocalISOString(customer.syncedAt),
    };
  }

  // ========== 新增 API：客服管理 ==========

  async getAgents(params: { enabled?: boolean }) {
    const where = {
      ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
    };

    const agents = await this.prisma.udescAgent.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      roleName: agent.roleName,
      enabled: agent.enabled,
      groups: agent.groups,
      skills: agent.skills,
    }));
  }

  async getAgentPerformance(agentId: string, startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);

    // 获取该客服时间范围内的 sessionIds，用于统计回访
    const agentSessions = await this.prisma.udescSession.findMany({
      where: { agentId, startedAt: { gte: start, lte: end } },
      select: { id: true },
    });
    const agentSessionIds = agentSessions.map((s) => s.id);

    const [sessionStats, messageStats, returnVisitCount, agentSessionsDetailed] = await Promise.all([
      this.prisma.udescSession.groupBy({
        by: ['agentId'],
        where: {
          agentId,
          startedAt: { gte: start, lte: end },
        },
        _count: { id: true },
      }),
      this.prisma.udescSessionMessage.aggregate({
        where: {
          session: { agentId, startedAt: { gte: start, lte: end } },
        },
        _count: { id: true },
      }),
      // 统计回访：从业务记录(UdescBusinessNote)中统计该客服会话的问题类型含"回访"的记录数
      this.prisma.udescBusinessNote.count({
        where: {
          createdAt: { gte: start, lte: end },
          feedbackId: { in: agentSessionIds },
          OR: [
            { problemType1: { contains: '回访' } },
            { problemType2: { contains: '回访' } },
            { problemType3: { contains: '回访' } },
          ],
        },
      }),
      // 获取会话评级数据（与团队口径一致：使用 UdescSession.rating）
      this.prisma.udescSession.findMany({
        where: { agentId, startedAt: { gte: start, lte: end } },
        select: { rating: true, rawPayload: true },
      }),
    ]);

    // 满意度 & 问题解决率：与团队口径一致，使用 UdescSession.rating
    const ratedSessions = agentSessionsDetailed.filter(s => s.rating !== null);
    const positiveCount = ratedSessions.filter(s => (s.rating ?? 0) >= 4).length;
    const resolvedCount = ratedSessions.filter(s => {
      const rp = s.rawPayload as Record<string, unknown> | null;
      return rp?.resolved_state_name === '已解决';
    }).length;
    const satisfactionRate = ratedSessions.length > 0 ? positiveCount / ratedSessions.length : null;
    const problemResolutionRate = ratedSessions.length > 0 ? resolvedCount / ratedSessions.length : null;
    const ratedCount = ratedSessions.length;
    // avgRating: 直接使用 UdescSession.rating 平均值
    const avgRatingValue = ratedSessions.length > 0
      ? ratedSessions.reduce((sum, s) => sum + (s.rating ?? 0), 0) / ratedSessions.length
      : null;

    // 按天统计
    const dailySessions = await this.prisma.udescSession.groupBy({
      by: ['startedAt'],
      where: {
        agentId,
        startedAt: { gte: start, lte: end },
      },
      _count: { id: true },
      _avg: { rating: true },
    });

    // 按日期聚合
    const dailyMap = new Map<string, { sessions: number; totalRating: number; ratedCount: number }>();
    for (const s of dailySessions) {
      const date = s.startedAt.toISOString().slice(0, 10);
      const existing = dailyMap.get(date) ?? { sessions: 0, totalRating: 0, ratedCount: 0 };
      existing.sessions += s._count.id;
      if (s._avg.rating !== null) {
        existing.totalRating += s._avg.rating ?? 0;
        existing.ratedCount += 1;
      }
      dailyMap.set(date, existing);
    }

    const dailyStats = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        sessions: stats.sessions,
        avgRating: stats.ratedCount > 0 ? stats.totalRating / stats.ratedCount : null,
        avgResponseTime: null,
      }));

    return {
      agentId,
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      totalSessions: sessionStats[0]?._count.id ?? 0,
      avgRating: avgRatingValue,
      satisfactionRate,
      problemResolutionRate,
      ratedSessions: ratedCount,
      resolvedSessions: resolvedCount,
      avgFirstResponseTime: null,
      avgResolutionTime: null,
      totalMessages: messageStats._count.id,
      avgMessagesPerSession: sessionStats[0]?._count.id ? messageStats._count.id / sessionStats[0]._count.id : 0,
      returnVisitCount: returnVisitCount,
      dailyStats,
    };
  }

  // ========== 新增 API：评价分析 ==========

  async getVotes(params: {
    startDate?: string;
    endDate?: string;
    minRating?: number;
    maxRating?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    sessionId?: string;
  }) {
    const { start, end } = this.resolveRange(params.startDate, params.endDate);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    // 如果指定了 sessionId，直接搜索该会话的评价
    let sessionIds: string[] | undefined;
    if (params.sessionId) {
      sessionIds = [params.sessionId];
    } else {
      // 先获取时间范围内的 sessionId 列表
      const sessionsInRange = await this.prisma.udescSession.findMany({
        where: { startedAt: { gte: start, lte: end } },
        select: { id: true },
      });
      sessionIds = sessionsInRange.map((s) => s.id);
    }

    // 构建评分筛选条件（统一构造，避免对象 key 覆盖）
    const ratingFilter: Record<string, number> = {};
    if (params.minRating !== undefined) ratingFilter.gte = params.minRating;
    if (params.maxRating !== undefined) ratingFilter.lte = params.maxRating;

    // 基础查询条件（按会话 startedAt 筛选，而不是 votedAt）
    const where: any = {
      sessionId: { in: sessionIds },
    };
    if (Object.keys(ratingFilter).length > 0) {
      where.rating = ratingFilter;
    }

    // 统计查询条件（基础筛选 + 排除 null 评分 — 使用 AND 避免 key 覆盖）
    const statsWhere: any = {
      sessionId: { in: sessionIds },
      rating: { ...ratingFilter, not: null },
    };

    // 构建排序条件
    const sortDirection = params.sortOrder ?? 'desc';
    let orderBy: any;
    if (params.sortBy === 'comment') {
      // comment 排序：有内容的排前面，null 排后面
      orderBy = [
        { comment: { sort: sortDirection, nulls: 'last' } },
      ];
    } else if (params.sortBy === 'rating') {
      orderBy = { rating: sortDirection };
    } else {
      orderBy = { votedAt: sortDirection };
    }

    const [total, rows, ratingStats, avgRatingResult, nullRatingVotes, totalSessions] = await Promise.all([
      // total 只统计有评分的记录，确保总评价数 = 评分分布之和
      this.prisma.udescSessionVote.count({ where: statsWhere }),
      this.prisma.udescSessionVote.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          session: {
            select: {
              agentId: true,
              startedAt: true,
              rawPayload: true,
            },
          },
        },
      }),
      // 非 null 评分分布（全部记录，不分页）
      this.prisma.udescSessionVote.groupBy({
        by: ['rating'],
        where: statsWhere,
        _count: { rating: true },
      }),
      // 非 null 平均分（全部记录，不分页）
      this.prisma.udescSessionVote.aggregate({
        where: statsWhere,
        _avg: { rating: true },
      }),
      // null 评分记录，用于展示时从 rawPayload 推断（全部记录，不分页）
      this.prisma.udescSessionVote.findMany({
        where: { sessionId: { in: sessionIds }, rating: null },
        select: { id: true, sessionId: true, rawPayload: true },
      }),
      this.prisma.udescSession.count({
        where: { startedAt: { gte: start, lte: end } },
      }),
    ]);

    // 获取客服名字映射（优先 AgentProfile，fallback 到 UdescAgent）
    const agentIds = [...new Set(rows.map((r) => r.session.agentId).filter(Boolean))] as string[];
    const [agentProfiles, udescAgents] = await Promise.all([
      this.prisma.agentProfile.findMany({
        where: { agentId: { in: agentIds } },
      }),
      this.prisma.udescAgent.findMany({
        where: { id: { in: agentIds } },
      }),
    ]);
    const agentNameMap = new Map<string, string>();
    // 先从 UdescAgent 填充名字
    for (const a of udescAgents) {
      if (a.name) agentNameMap.set(a.id, a.name);
    }
    // AgentProfile 覆盖优先级更高
    for (const a of agentProfiles) {
      if (a.displayName) agentNameMap.set(a.agentId, a.displayName);
    }

    // === 合并非 null 评分分布 + 从 rawPayload 推断 null 评分，修正评分分布和平均分 ===
    let sumRating = 0;
    let countRated = 0;
    const ratingDistribution: Record<number, number> = {};
    for (let i = 1; i <= 5; i++) {
      ratingDistribution[i] = 0;
    }

    // 1. 先累加非 null 评分的分布
    for (const stat of ratingStats) {
      if (stat.rating !== null) {
        ratingDistribution[stat.rating] = stat._count.rating;
        sumRating += stat.rating * stat._count.rating;
        countRated += stat._count.rating;
      }
    }

    // 2. 从 rawPayload 推断 null 评分记录，累加分布（仅使用显式评分字段 / survey_option_id）
    //    注意：resolved_state 表示"是否已解决"，不等于"满意度"，不应用来推断评分
    for (const vote of nullRatingVotes) {
      if (vote.rawPayload) {
        const inferred = this.inferRatingFromRawPayload(vote.rawPayload as Record<string, unknown>);
        if (inferred !== undefined) {
          // 对推断的评分也应用评分筛选（最高/最低评分筛选）
          const matchesFilter = (
            (params.minRating === undefined || inferred >= params.minRating) &&
            (params.maxRating === undefined || inferred <= params.maxRating)
          );
          if (matchesFilter) {
            ratingDistribution[inferred] = (ratingDistribution[inferred] ?? 0) + 1;
            sumRating += inferred;
            countRated++;
          }
        }
      }
    }

    // 3. 处理分页记录中的评分（当前页展示，仅从 rawPayload 推断，不使用 resolved_state 兜底）
    const records = rows.map((vote) => {
      let effectiveRating = vote.rating;
      // 尝试从投票 rawPayload 推断
      if (effectiveRating === null && vote.rawPayload) {
        effectiveRating = this.inferRatingFromRawPayload(vote.rawPayload as Record<string, unknown>) ?? null;
      }
      return {
        id: vote.id,
        sessionId: vote.sessionId,
        rating: effectiveRating,
        tags: vote.tags,
        comment: vote.comment,
        voterName: vote.voterName,
        votedAt: vote.votedAt ? toLocalISOString(vote.votedAt) : null,
        agentId: vote.session.agentId,
        agentName: vote.session.agentId ? (agentNameMap.get(vote.session.agentId) || vote.session.agentId) : null,
        sessionStartedAt: toLocalISOString(vote.session.startedAt),
      };
    });

    return {
      page,
      pageSize,
      total: countRated, // 总评价数 = 非 null 评分 + 从 rawPayload 成功推断的记录
      totalSessions,
      records,
      avgRating: countRated > 0 ? Number((sumRating / countRated).toFixed(2)) : null,
      ratingDistribution,
    };
  }

  /**
   * 从 rawPayload JSON 中推断评分值（仅用于 rating 为 null 时的兜底推断）
   * 按优先级：显式评分字段 → 嵌套 vote 对象 → survey_option_id
   */
  private inferRatingFromRawPayload(rawPayload: Record<string, unknown>): number | undefined {
    const normalize = (v: number | undefined): number | undefined => {
      if (v === undefined) return undefined;
      if (v >= 0 && v <= 10) return v;
      return undefined;
    };
    const toNumber = (v: unknown): number | undefined => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const n = Number(v);
        return isNaN(n) ? undefined : n;
      }
      return undefined;
    };

    // 优先级1：通过 survey_option_id 映射（客户满意度评价选项）- 最可靠
    const surveyOptionId = toNumber(rawPayload.survey_option_id);
    if (surveyOptionId !== undefined) {
      if (surveyOptionId === 20979) return 5;  // 满意
      if (surveyOptionId === 20981) return 1;  // 不满意
    }

    // 优先级2：显式评分字段
    const direct = toNumber(
      rawPayload.rating ?? rawPayload.score ?? rawPayload.vote_score ?? rawPayload.satisfaction_level
        ?? rawPayload.survey_score ?? rawPayload.satisfaction_score ?? rawPayload.feedback_rating
        ?? rawPayload.customer_satisfaction ?? rawPayload.satisfaction ?? rawPayload.evaluation ?? rawPayload.rate,
    );
    const normalizedDirect = normalize(direct);
    if (normalizedDirect !== undefined) return normalizedDirect;

    // 优先级3：嵌套 vote 对象
    const vote = rawPayload.vote;
    if (vote && typeof vote === 'object') {
      const nested = vote as Record<string, unknown>;
      return normalize(
        toNumber(
          nested.rating ?? nested.score ?? nested.vote_score ?? nested.satisfaction_level
            ?? nested.survey_score ?? nested.satisfaction_score ?? nested.feedback_rating
            ?? nested.customer_satisfaction ?? nested.satisfaction ?? nested.evaluation ?? nested.rate,
        ),
      );
    }

    // 注意：resolved_state 表示"是否已解决"，不等于"满意度"，
    // 评分应仅从显式评分字段（rating/score/satisfaction_level等）或 survey_option_id 提取，不由 resolved_state 推断
    return undefined;
  }

  // ========== 新增 API：会话性能指标 ==========

  async getSessionMetrics(params: {
    startDate?: string;
    endDate?: string;
    agentId?: string;
    agentIds?: string;
    sessionId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }) {
    const { start, end } = this.resolveRange(params.startDate, params.endDate);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const sortOrder = params.sortOrder ?? 'desc';

    // 解析 agentIds（逗号分隔）
    const agentIdList = params.agentIds
      ? params.agentIds.split(',').map((id) => id.trim()).filter(Boolean)
      : undefined;

    // 构建agentId过滤条件
    const agentFilter = params.agentId
      ? params.agentId
      : agentIdList && agentIdList.length === 1
      ? agentIdList[0]
      : undefined;

    // 排序字段映射
    const sortFieldMap: Record<string, string> = {
      sessionId: 'sessionId',
      startedAt: 'startedAt',
      endedAt: 'endedAt',
      sessionDuration: 'sessionDuration',
      firstResponseTime: 'firstResponseTime',
      avgResponseTime: 'avgResponseTime',
      waitTime: 'waitTime',
      resolutionTime: 'resolutionTime',
      messageCount: 'messageCount',
      agentMessageCount: 'agentMessageCount',
      customerMessageCount: 'customerMessageCount',
    };
    const sortBy = params.sortBy && sortFieldMap[params.sortBy] ? params.sortBy : 'sessionId';

    // 当搜索 sessionId 时，忽略时间限制
    const sessionWhere = {
      ...(params.sessionId ? {} : { startedAt: { gte: start, lte: end } }),
      ...(params.sessionId ? { id: params.sessionId } : {}),
      ...(agentFilter ? { agentId: agentFilter } : {}),
      ...(agentIdList && agentIdList.length > 1 ? { agentId: { in: agentIdList } } : {}),
    };

    // sessionDuration 是计算字段，需要内存排序
    const isComputedSort = sortBy === 'sessionDuration';
    
    // 构建排序条件 - 直接使用 relation filter，让数据库优化执行计划
    // 指标字段已在 UdescSessionMetrics 表上有索引，可直接排序
    const orderBy = sortBy === 'sessionId'
      ? { session: { startedAt: sortOrder } }
      : sortBy === 'startedAt'
      ? { session: { startedAt: sortOrder } }
      : sortBy === 'endedAt'
      ? { session: { endedAt: sortOrder } }
      : isComputedSort
      ? undefined
      : { [sortFieldMap[sortBy]]: sortOrder };

    // 先从 UdescSessionMetrics 取，如果为空则从消息计算
    let metricsRows = await this.prisma.udescSessionMetrics.findMany({
      where: { session: sessionWhere },
      ...(orderBy ? { orderBy } : {}),
      ...(isComputedSort ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      include: {
        session: {
          select: {
            id: true,
            agentId: true,
            startedAt: true,
            endedAt: true,
            rating: true,
          },
        },
      },
    });

    // 如果 metrics 表为空，从消息计算
    if (metricsRows.length === 0) {
      // 获取所有符合条件的会话用于计算
      const sessions = await this.prisma.udescSession.findMany({
        where: sessionWhere,
        include: {
          messages: {
            orderBy: { sentAt: 'asc' },
          },
        },
      });

      const total = sessions.length;

      // 获取所有 agentId 并关联 AgentProfile，fallback 到 UdescAgent
      const agentIds = [...new Set(sessions.map((s) => s.agentId).filter((id): id is string => !!id))];
      const [agentProfiles, udescAgents] = agentIds.length > 0 ? await Promise.all([
        this.prisma.agentProfile.findMany({
          where: { agentId: { in: agentIds } },
          select: { agentId: true, displayName: true },
        }),
        this.prisma.udescAgent.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true },
        }),
      ]) : [[], []];
      const agentNameMap = new Map<string, string>();
      for (const a of udescAgents) {
        if (a.name) agentNameMap.set(a.id, a.name);
      }
      for (const a of agentProfiles) {
        if (a.displayName) agentNameMap.set(a.agentId, a.displayName);
      }

      // 计算每个会话的指标
      const records = sessions.map((s) => {
        const messages = s.messages;
        const agentMsgs = messages.filter((m) =>
          !isSystemMessage(m.content) && (
            isAgentSenderType(m.senderType) ||
            (m.rawPayload as Record<string, unknown>)?.sender === 'agent'
          )
        );
        const customerMsgs = messages.filter((m) =>
          !isSystemMessage(m.content) && (
            isCustomerSenderType(m.senderType) ||
            (m.rawPayload as Record<string, unknown>)?.sender === 'customer'
          )
        );

        // 计算首次响应时间：客服首次回复时间 - 会话开始时间（不包含留言等待时间）
        let firstResponseTime: number | null = null;
        if (customerMsgs.length > 0) {
          if (agentMsgs.length > 0) {
            const firstAgentMsg = agentMsgs.find((a) => new Date(a.sentAt) > new Date(s.startedAt));
            if (firstAgentMsg) {
              const diff = Math.round(
                (new Date(firstAgentMsg.sentAt).getTime() - new Date(s.startedAt).getTime()) / 1000
              );
              if (diff >= 0) {
                firstResponseTime = diff;
              }
            }
          }
          // 客户有消息但客服未回复，firstResponseTime 保持 null（不纳入平均首次响应时长统计）
        }

        // 计算平均响应时间（仅统计客服接入后的消息配对，排除留言时间）
        let avgResponseTime = 0;
        const responseTimes: number[] = [];
        // 找到首次客服回复时间（接入时间），仅接入后的客户消息计入平均响应
        let firstAgentReplyTime = Infinity;
        if (agentMsgs.length > 0) {
          firstAgentReplyTime = new Date(agentMsgs[0].sentAt).getTime();
        }
        let agentIdx = 0;
        for (let ci = 0; ci < customerMsgs.length && agentIdx < agentMsgs.length; ci++) {
          const custTime = new Date(customerMsgs[ci].sentAt).getTime();
          // 跳过客服接入前的客户消息（留言等），不计入平均响应
          if (custTime < firstAgentReplyTime) continue;
          // 跳过当前客户消息之前的客服回复（已被之前客户消息配对）
          while (agentIdx < agentMsgs.length && new Date(agentMsgs[agentIdx].sentAt).getTime() < custTime) {
            agentIdx++;
          }
          if (agentIdx < agentMsgs.length) {
            const diff = new Date(agentMsgs[agentIdx].sentAt).getTime() - custTime;
            if (diff > 0) {
              responseTimes.push(Math.min(Math.round(diff / 1000), 3600)); // 上限1小时，排除异常值
            } else {
              responseTimes.push(0); // 客服回复早于客户消息，视为即时
            }
            agentIdx++; // 每条客服回复只用于配对一条客户消息
          }
        }
        if (responseTimes.length > 0) {
          avgResponseTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
        }

        // 计算解决时间：会话结束 - 会话开始
        let resolutionTime = 0;
        if (s.endedAt) {
          resolutionTime = Math.round(
            (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000
          );
        }

        return {
          sessionId: s.id,
          agentId: s.agentId,
          agentName: s.agentId ? (agentNameMap.get(s.agentId) || s.agentId) : null,
        startedAt: toLocalISOString(s.startedAt),
          endedAt: s.endedAt ? toLocalISOString(s.endedAt) : null,
          sessionDuration: s.endedAt ? Math.floor((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000) : null,
          rating: s.rating,
          firstResponseTime,
          avgResponseTime,
          waitTime: 0,
          resolutionTime,
          messageCount: countNonSystemMessages(messages),
          agentMessageCount: agentMsgs.length,
          customerMessageCount: customerMsgs.length,
        };
      });

      // 排序：
      if (sortBy === 'sessionId' || sortBy === 'startedAt') {
        records.sort((a, b) => {
          const aTime = new Date(a.startedAt).getTime();
          const bTime = new Date(b.startedAt).getTime();
          return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
        });
      } else if (sortBy === 'endedAt') {
        records.sort((a, b) => {
          const aTime = a.endedAt ? new Date(a.endedAt).getTime() : 0;
          const bTime = b.endedAt ? new Date(b.endedAt).getTime() : 0;
          return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
        });
      } else if (sortBy === 'sessionDuration') {
        records.sort((a, b) => {
          const aVal = a.sessionDuration ?? 0;
          const bVal = b.sessionDuration ?? 0;
          return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
        });
      } else {
        const sortKey = sortFieldMap[sortBy] as keyof typeof records[0];
        records.sort((a, b) => {
          const aVal = a[sortKey] as number;
          const bVal = b[sortKey] as number;
          return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
        });
      }

      // 分页
      const pagedRecords = records.slice((page - 1) * pageSize, page * pageSize);

      return {
        page,
        pageSize,
        total,
        records: pagedRecords,
      };
    }

    const total = await this.prisma.udescSessionMetrics.count({
      where: { session: sessionWhere },
    });

    // 获取所有 agentId 并关联 AgentProfile，fallback 到 UdescAgent
    const agentIds = [...new Set(metricsRows.map((m) => m.session.agentId).filter((id): id is string => !!id))];
    const [agentProfiles, udescAgents] = agentIds.length > 0 ? await Promise.all([
      this.prisma.agentProfile.findMany({
        where: { agentId: { in: agentIds } },
        select: { agentId: true, displayName: true },
      }),
      this.prisma.udescAgent.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true },
      }),
    ]) : [[], []];
    const agentNameMap = new Map<string, string>();
    for (const a of udescAgents) {
      if (a.name) agentNameMap.set(a.id, a.name);
    }
    for (const a of agentProfiles) {
      if (a.displayName) agentNameMap.set(a.agentId, a.displayName);
    }

    // 构建记录
    let records = metricsRows.map((m) => {
      const startedAtDate = m.session.startedAt instanceof Date ? m.session.startedAt : new Date(m.session.startedAt);
      const endedAtDate = m.session.endedAt ? (m.session.endedAt instanceof Date ? m.session.endedAt : new Date(m.session.endedAt)) : null;
      const sessionDuration = endedAtDate && !isNaN(endedAtDate.getTime()) ? Math.floor((endedAtDate.getTime() - startedAtDate.getTime()) / 1000) : null;
      return {
        sessionId: m.sessionId,
        agentId: m.session.agentId,
        agentName: m.session.agentId ? (agentNameMap.get(m.session.agentId) || m.session.agentId) : null,
        startedAt: toLocalISOString(m.session.startedAt),
        endedAt: m.session.endedAt ? toLocalISOString(m.session.endedAt) : null,
        sessionDuration,
        rating: m.session.rating,
        firstResponseTime: m.firstResponseTime,
        avgResponseTime: m.avgResponseTime,
        waitTime: m.waitTime,
        resolutionTime: m.resolutionTime,
        messageCount: m.messageCount,
        agentMessageCount: m.agentMessageCount,
        customerMessageCount: m.customerMessageCount,
      };
    });

    // sessionDuration 内存排序
    if (isComputedSort) {
      records.sort((a, b) => {
        const aVal = a.sessionDuration ?? 0;
        const bVal = b.sessionDuration ?? 0;
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
      records = records.slice((page - 1) * pageSize, page * pageSize);
    }

    return {
      page,
      pageSize,
      total,
      records,
    };
  }

  async getMetricsSummary(startDate?: string, endDate?: string, agentId?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);
    console.log('[getMetricsSummary] params:', { startDate, endDate, agentId, start: start.toISOString(), end: end.toISOString() });

    // 查询所有会话及其预计算指标
    const sessions = await this.prisma.udescSession.findMany({
      where: {
        startedAt: { gte: start, lte: end },
        ...(agentId ? { agentId } : {}),
      },
      include: {
        messages: {
          orderBy: { sentAt: 'asc' },
          select: { sentAt: true, senderType: true, content: true, rawPayload: true },
        },
        metrics: {
          select: { avgResponseTime: true, firstResponseTime: true, resolutionTime: true, waitTime: true, messageCount: true },
        },
      },
    });

    const firstResponseTimes: number[] = [];
    const responseTimes: number[] = [];
    const sessionDurations: number[] = [];
    const resolutionTimes: number[] = [];
    let totalMessages = 0;

    for (const s of sessions) {
      // 优先级1：使用预计算指标表（由 sync 服务计算，最准确）
      if (s.metrics?.firstResponseTime != null) {
        firstResponseTimes.push(s.metrics.firstResponseTime);
      }
      if (s.metrics?.avgResponseTime != null && s.metrics.avgResponseTime > 0) {
        responseTimes.push(s.metrics.avgResponseTime);
      }

      // 优先级2：如果 metrics 表缺失，尝试从 session.rawPayload 读取
      if (!s.metrics) {
        const raw = s.rawPayload as Record<string, unknown> | null;
        const rawFrt = raw ? (() => {
          const v = raw.resp_seconds;
          if (typeof v === 'number' && v >= 0) return Math.round(v);
          if (typeof v === 'string') { const n = Number(v); return !isNaN(n) && n >= 0 ? Math.round(n) : null; }
          return null;
        })() : null;
        const rawAvg = raw ? (() => {
          const v = raw.avg_resp_seconds;
          if (typeof v === 'number' && v >= 0) return Math.round(v);
          if (typeof v === 'string') { const n = Number(v); return !isNaN(n) && n >= 0 ? Math.round(n) : null; }
          return null;
        })() : null;

        if (rawFrt !== null) firstResponseTimes.push(rawFrt);
        if (rawAvg !== null) responseTimes.push(rawAvg);

        // 优先级3：rawPayload 也缺失时，回退到消息时间戳计算
        if (rawFrt === null || rawAvg === null) {
          const messages = s.messages;
          const agentMsgs = messages.filter((m) =>
            !isSystemMessage(m.content) && (
              isAgentSenderType(m.senderType) ||
              (m.rawPayload as Record<string, unknown> | null)?.sender === 'agent'
            )
          );
          const customerMsgs = messages.filter((m) =>
            !isSystemMessage(m.content) && (
              isCustomerSenderType(m.senderType) ||
              (m.rawPayload as Record<string, unknown> | null)?.sender === 'customer'
            )
          );

          if (rawFrt === null && customerMsgs.length > 0 && agentMsgs.length > 0) {
            const firstAgentAfterStart = agentMsgs.find((a) => new Date(a.sentAt) > new Date(s.startedAt));
            if (firstAgentAfterStart) {
              const diff = Math.round(
                (new Date(firstAgentAfterStart.sentAt).getTime() - new Date(s.startedAt).getTime()) / 1000
              );
              if (diff >= 0) firstResponseTimes.push(diff);
            }
          }

          if (rawAvg === null) {
            let firstAgentReplyTime = Infinity;
            if (agentMsgs.length > 0) {
              firstAgentReplyTime = new Date(agentMsgs[0].sentAt).getTime();
            }
            let agentIdx = 0;
            const pairResponseTimes: number[] = [];
            for (let ci = 0; ci < customerMsgs.length && agentIdx < agentMsgs.length; ci++) {
              const custTime = new Date(customerMsgs[ci].sentAt).getTime();
              if (custTime < firstAgentReplyTime) continue;
              while (agentIdx < agentMsgs.length && new Date(agentMsgs[agentIdx].sentAt).getTime() < custTime) {
                agentIdx++;
              }
              if (agentIdx < agentMsgs.length) {
                const diff = new Date(agentMsgs[agentIdx].sentAt).getTime() - custTime;
                if (diff > 0) {
                  pairResponseTimes.push(Math.min(Math.round(diff / 1000), 3600));
                } else {
                  pairResponseTimes.push(0);
                }
                agentIdx++;
              }
            }
            // 每个会话的响应时间取均值再参与团队平均，保持各会话权重一致
            if (pairResponseTimes.length > 0) {
              responseTimes.push(Math.round(pairResponseTimes.reduce((a, b) => a + b, 0) / pairResponseTimes.length));
            }
          }
        }
      }

      // 对话时长
      if (s.endedAt) {
        sessionDurations.push(Math.floor(
          (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000
        ));
      }

      // 解决时间（优先从 metrics 读取，否则用 endedAt - startedAt）
      if (s.metrics?.resolutionTime != null && s.metrics.resolutionTime > 0) {
        resolutionTimes.push(s.metrics.resolutionTime);
      } else if (s.endedAt) {
        resolutionTimes.push(Math.round(
          (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000
        ));
      }

      // 消息总数（优先用 metrics 表缓存的计数，否则实时过滤）
      if (s.metrics?.messageCount != null) {
        totalMessages += s.metrics.messageCount;
      } else {
        totalMessages += s.messages.filter(m => !isSystemMessage(m.content)).length;
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const result = {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      totalSessions: sessions.length,
      avgFirstResponseTime: avg(firstResponseTimes),
      avgResponseTime: avg(responseTimes),
      avgSessionDuration: avg(sessionDurations),
      avgWaitTime: null,
      avgResolutionTime: avg(resolutionTimes),
      totalMessages,
      avgMessagesPerSession: sessions.length > 0 ? Number((totalMessages / sessions.length).toFixed(2)) : 0,
    };
    console.log('[getMetricsSummary] returning:', result);
    return result;
  }

  async getAgentMetricsSummary(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);

    // 从 UdescSessionMetrics 表聚合客服指标（与明细页面的数据保持一致）
    const agentMetrics = await this.prisma.udescSessionMetrics.findMany({
      where: {
        session: {
          startedAt: { gte: start, lte: end },
          agentId: { not: null },
        },
      },
      select: {
        session: {
          select: {
            agentId: true,
          },
        },
        firstResponseTime: true,
        avgResponseTime: true,
        waitTime: true,
        resolutionTime: true,
        messageCount: true,
        agentMessageCount: true,
        customerMessageCount: true,
      },
    });

    if (agentMetrics.length === 0) {
      // 实时计算：从会话消息计算指标（当指标表为空时）
      const sessions = await this.prisma.udescSession.findMany({
        where: {
          startedAt: { gte: start, lte: end },
          agentId: { not: null },
        },
        include: {
          messages: {
            orderBy: { sentAt: 'asc' },
            select: { sentAt: true, senderType: true, content: true, rawPayload: true },
          },
        },
      });

      const agentStats = new Map<string, {
        sessionCount: number;
        firstResponseTimes: number[];
        responseTimes: number[];
        totalMessages: number;
      }>();

      for (const s of sessions) {
        if (!s.agentId) continue;
        const messages = s.messages;
        const agentMsgs = messages.filter((m) =>
          !isSystemMessage(m.content) && (
            isAgentSenderType(m.senderType) ||
            (m.rawPayload as Record<string, unknown> | null)?.sender === 'agent'
          )
        );
        const customerMsgs = messages.filter((m) =>
          !isSystemMessage(m.content) && (
            isCustomerSenderType(m.senderType) ||
            (m.rawPayload as Record<string, unknown> | null)?.sender === 'customer'
          )
        );

        if (!agentStats.has(s.agentId)) {
          agentStats.set(s.agentId, {
            sessionCount: 0,
            firstResponseTimes: [],
            responseTimes: [],
            totalMessages: 0,
          });
        }
        const stat = agentStats.get(s.agentId)!;
        stat.sessionCount++;
        stat.totalMessages += messages.filter(m => !isSystemMessage(m.content)).length;

        // 首次响应时间
        if (customerMsgs.length > 0 && agentMsgs.length > 0) {
          const firstAgentAfterStart = agentMsgs.find((a) => new Date(a.sentAt) > new Date(s.startedAt));
          if (firstAgentAfterStart) {
            const diff = Math.round(
              (new Date(firstAgentAfterStart.sentAt).getTime() - new Date(s.startedAt).getTime()) / 1000
            );
            if (diff >= 0) {
              stat.firstResponseTimes.push(diff);
            }
          }
        }

        // 平均响应时间（双指针配对，仅统计接入后的客户消息，排除留言）
        let firstAgentReplyTime = Infinity;
        if (agentMsgs.length > 0) {
          firstAgentReplyTime = new Date(agentMsgs[0].sentAt).getTime();
        }
        let agentIdx = 0;
        const pairResponseTimes: number[] = [];
        for (let ci = 0; ci < customerMsgs.length && agentIdx < agentMsgs.length; ci++) {
          const custTime = new Date(customerMsgs[ci].sentAt).getTime();
          // 跳过客服接入前的客户消息（留言等），不计入平均响应
          if (custTime < firstAgentReplyTime) continue;
          while (agentIdx < agentMsgs.length && new Date(agentMsgs[agentIdx].sentAt).getTime() < custTime) {
            agentIdx++;
          }
          if (agentIdx < agentMsgs.length) {
            const diff = new Date(agentMsgs[agentIdx].sentAt).getTime() - custTime;
            if (diff > 0) {
              pairResponseTimes.push(Math.min(Math.round(diff / 1000), 3600));
            } else {
              pairResponseTimes.push(0);
            }
            agentIdx++;
          }
        }
        // 每个会话的响应时间取均值再参与统计，保持各会话权重一致
        if (pairResponseTimes.length > 0) {
          stat.responseTimes.push(Math.round(pairResponseTimes.reduce((a, b) => a + b, 0) / pairResponseTimes.length));
        }
      }

      // 获取客服名称
      const agentIds = Array.from(agentStats.keys());
      const [agentProfiles, udescAgents] = await Promise.all([
        this.prisma.agentProfile.findMany({
          where: { agentId: { in: agentIds } },
          select: { agentId: true, displayName: true },
        }),
        this.prisma.udescAgent.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true },
        }),
      ]);
      const agentNameMap = new Map<string, string>();
      for (const a of udescAgents) {
        if (a.name) agentNameMap.set(a.id, a.name);
      }
      for (const a of agentProfiles) {
        if (a.displayName) agentNameMap.set(a.agentId, a.displayName);
      }

      const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

      const results = Array.from(agentStats.entries()).map(([agentId, stat]) => ({
        agentId,
        agentName: agentNameMap.get(agentId) || agentId,
        sessionCount: stat.sessionCount,
        avgFirstResponseTime: avg(stat.firstResponseTimes),
        avgResponseTime: avg(stat.responseTimes),
        avgWaitTime: null,
        avgResolutionTime: null,
        avgMessagesPerSession: stat.sessionCount > 0 ? Number((stat.totalMessages / stat.sessionCount).toFixed(1)) : 0,
      }));

      results.sort((a, b) => b.sessionCount - a.sessionCount);
      return results;
    }

    // 按 agentId 分组聚合
    const agentMap = new Map<string, {
      sessionCount: number;
      firstResponseTimes: number[];
      responseTimes: number[];
      waitTimes: number[];
      resolutionTimes: number[];
      totalMessages: number;
    }>();

    for (const m of agentMetrics) {
      const agentId = m.session.agentId;
      if (!agentId) continue;

      if (!agentMap.has(agentId)) {
        agentMap.set(agentId, {
          sessionCount: 0,
          firstResponseTimes: [],
          responseTimes: [],
          waitTimes: [],
          resolutionTimes: [],
          totalMessages: 0,
        });
      }

      const stat = agentMap.get(agentId)!;
      stat.sessionCount++;
      stat.totalMessages += m.messageCount ?? 0;

      if (m.firstResponseTime != null) {
        stat.firstResponseTimes.push(m.firstResponseTime);
      }
      if (m.avgResponseTime != null && m.avgResponseTime > 0) {
        // avgResponseTime 是每个会话内的平均响应时间，每个会话贡献一次
        stat.responseTimes.push(m.avgResponseTime);
      }
      if (m.waitTime != null) {
        stat.waitTimes.push(m.waitTime);
      }
      if (m.resolutionTime != null) {
        stat.resolutionTimes.push(m.resolutionTime);
      }
    }

    // 获取客服名称
    const agentIds = Array.from(agentMap.keys());
    const [agentProfiles, udescAgents] = await Promise.all([
      this.prisma.agentProfile.findMany({
        where: { agentId: { in: agentIds } },
        select: { agentId: true, displayName: true },
      }),
      this.prisma.udescAgent.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true },
      }),
    ]);
    const agentNameMap = new Map<string, string>();
    for (const a of udescAgents) {
      if (a.name) agentNameMap.set(a.id, a.name);
    }
    for (const a of agentProfiles) {
      if (a.displayName) agentNameMap.set(a.agentId, a.displayName);
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const results = Array.from(agentMap.entries()).map(([agentId, stat]) => ({
      agentId,
      agentName: agentNameMap.get(agentId) || agentId,
      sessionCount: stat.sessionCount,
      avgFirstResponseTime: avg(stat.firstResponseTimes),
      avgResponseTime: avg(stat.responseTimes),
      avgWaitTime: avg(stat.waitTimes),
      avgResolutionTime: avg(stat.resolutionTimes),
      avgMessagesPerSession: stat.sessionCount > 0 ? Number((stat.totalMessages / stat.sessionCount).toFixed(1)) : 0,
    }));

    results.sort((a, b) => b.sessionCount - a.sessionCount);
    return results;
  }

  // ========== 工单分析 ==========

  async getTickets(params: {
    startDate?: string;
    endDate?: string;
    status?: string;
    assigneeId?: string;
    priority?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }) {
    const { start, end } = this.resolveRange(params.startDate, params.endDate);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const sortBy = params.sortBy ?? 'createdAt';
    const sortOrder = params.sortOrder ?? 'desc';

    const where: any = {
      createdAt: { gte: start, lte: end },
    };
    if (params.status) {
      where.status = params.status;
    }
    if (params.assigneeId) {
      where.assigneeId = params.assigneeId;
    }
    if (params.priority) {
      where.priority = params.priority;
    }

    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    const [total, records] = await Promise.all([
      this.prisma.udescTicket.count({ where }),
      this.prisma.udescTicket.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      records: records.map((t) => ({
        id: t.id,
        fieldNum: t.fieldNum,
        subject: t.subject,
        source: t.source,
        status: t.status,
        statusEn: t.statusEn,
        priority: t.priority,
        satisfaction: t.satisfaction,
        userName: t.userName,
        assigneeId: t.assigneeId,
        assigneeName: t.assigneeName,
        userGroupName: t.userGroupName,
        tags: t.tags,
        createdAt: t.createdAt ? toLocalISOString(t.createdAt) : null,
        firstRepliedAt: t.firstRepliedAt ? toLocalISOString(t.firstRepliedAt) : null,
        resolvedAt: t.resolvedAt ? toLocalISOString(t.resolvedAt) : null,
        closedAt: t.closedAt ? toLocalISOString(t.closedAt) : null,
        imSubSessionId: t.imSubSessionId,
      })),
    };
  }

  async getTicketSummary(params: {
    startDate?: string;
    endDate?: string;
    assigneeId?: string;
  }) {
    const { start, end } = this.resolveRange(params.startDate, params.endDate);

    const where: any = {
      createdAt: { gte: start, lte: end },
    };
    if (params.assigneeId) {
      where.assigneeId = params.assigneeId;
    }

    // 基础统计
    const [total, byStatus, byPriority, byAssignee] = await Promise.all([
      // 总数
      this.prisma.udescTicket.count({ where }),

      // 按状态分组
      this.prisma.udescTicket.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),

      // 按优先级分组
      this.prisma.udescTicket.groupBy({
        by: ['priority'],
        where,
        _count: { id: true },
      }),

      // 按受理人分组（取前10）
      this.prisma.udescTicket.groupBy({
        by: ['assigneeId', 'assigneeName'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ]);

    // 计算平均解决时间（仅统计已解决状态的工单）
    const resolvedTickets = await this.prisma.udescTicket.findMany({
      where: {
        ...where,
        status: '已解决',
        createdAt: { not: null },
        resolvedAt: { not: null },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
      },
    });

    let totalResolutionHours = 0;
    let resolvedCount = 0;
    for (const t of resolvedTickets) {
      if (t.createdAt && t.resolvedAt) {
        const hours = (t.resolvedAt.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60);
        totalResolutionHours += hours;
        resolvedCount++;
      }
    }
    const avgResolutionHours = resolvedCount > 0 ? totalResolutionHours / resolvedCount : null;

    // 计算首次响应时间
    const firstReplyTickets = await this.prisma.udescTicket.findMany({
      where: {
        ...where,
        createdAt: { not: null },
        firstRepliedAt: { not: null },
      },
      select: {
        createdAt: true,
        firstRepliedAt: true,
      },
    });

    let totalFirstReplyHours = 0;
    let firstReplyCount = 0;
    for (const t of firstReplyTickets) {
      if (t.createdAt && t.firstRepliedAt) {
        const hours = (t.firstRepliedAt.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60);
        totalFirstReplyHours += hours;
        firstReplyCount++;
      }
    }
    const avgFirstReplyHours = firstReplyCount > 0 ? totalFirstReplyHours / firstReplyCount : null;

    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status ?? '未知', s._count.id])),
      byPriority: Object.fromEntries(byPriority.map((p) => [p.priority ?? '未知', p._count.id])),
      byAssignee: byAssignee.map((a) => ({
        assigneeId: a.assigneeId,
        assigneeName: a.assigneeName,
        count: a._count.id,
      })),
      avgResolutionHours,
      avgFirstReplyHours,
      resolvedCount,
      totalResolutionHours,
      totalFirstReplyHours,
    };
  }

  async getTicketDailyStats(params: {
    startDate?: string;
    endDate?: string;
  }) {
    const { start, end } = this.resolveRange(params.startDate, params.endDate);

    // 生成日期范围（北京时间）
    const formatLocalDate = (date: Date): string => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const days: string[] = [];
    const current = new Date(start);
    while (current <= end) {
      days.push(formatLocalDate(current));
      current.setDate(current.getDate() + 1);
    }

    // 按天统计创建数（createdAt 字段存储的是 UTC 时间，需加 8 小时转为北京时间再分组）
    const dailyCreated = await this.prisma.$queryRaw<{ date: Date; count: bigint }[]>`
      SELECT DATE("createdAt" + INTERVAL '8 hours') as date, COUNT(*) as count
      FROM "UdescTicket"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY DATE("createdAt" + INTERVAL '8 hours')
      ORDER BY date
    `;

    const createdMap = new Map(
      dailyCreated.map((d) => [formatLocalDate(d.date), Number(d.count)])
    );

    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      days,
      created: days.map((d) => createdMap.get(d) ?? 0),
    };
  }

  // ========== 时段热力图 ==========

  /**
   * 获取时段热力图数据
   * 返回 24小时 x 7天 的矩阵，用于排班优化
   */
  async getHeatmap(params: {
    startDate?: string;
    endDate?: string;
    agentId?: string;
    type: 'session' | 'ticket';
  }) {
    const { start, end } = this.resolveRange(params.startDate, params.endDate);
    const { agentId, type } = params;

    // 初始化 7天 x 24小时 矩阵
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    // 初始化数据矩阵
    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

    if (type === 'session') {
      // 查询会话数据（全量统计，不额外过滤会话状态，与 Udesk 对话报表口径一致）
      const where: any = {
        startedAt: { gte: start, lte: end },
      };
      if (agentId) {
        where.agentId = agentId;
      }
      const sessions = await this.prisma.udescSession.findMany({
        where,
        select: { startedAt: true },
      });

      // 统计每小时每天的会话数
      for (const session of sessions) {
        const d = new Date(session.startedAt);
        const dayOfWeek = d.getDay(); // 0-6
        const hour = d.getHours(); // 0-23
        matrix[dayOfWeek][hour]++;
      }
    } else {
      // 查询工单数据
      const tickets = await this.prisma.udescTicket.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          assigneeId: agentId,
        },
        select: { createdAt: true },
      });

      // 统计每小时每天的工单数
      for (const ticket of tickets) {
        if (!ticket.createdAt) continue;
        const d = new Date(ticket.createdAt);
        const dayOfWeek = d.getDay();
        const hour = d.getHours();
        matrix[dayOfWeek][hour]++;
      }
    }

    // 计算峰值和总量
    let max = 0;
    let total = 0;
    for (const row of matrix) {
      for (const val of row) {
        total += val;
        if (val > max) max = val;
      }
    }

    // 找出最繁忙时段（按小时降序）
    const peakHours: { hour: number; count: number }[] = [];
    for (let h = 0; h < 24; h++) {
      let count = 0;
      for (let d = 0; d < 7; d++) {
        count += matrix[d][h];
      }
      peakHours.push({ hour: h, count });
    }
    peakHours.sort((a, b) => b.count - a.count);

    // 找出最繁忙天（按天降序）
    const peakDays: { day: number; dayName: string; count: number }[] = [];
    for (let d = 0; d < 7; d++) {
      let count = 0;
      for (let h = 0; h < 24; h++) {
        count += matrix[d][h];
      }
      peakDays.push({ day: d, dayName: days[d], count });
    }
    peakDays.sort((a, b) => b.count - a.count);

    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      type,
      hours,
      days,
      matrix, // days[dayOfWeek][hour] -> count
      max,
      total,
      peakHours: peakHours.slice(0, 5), // Top 5 繁忙时段
      peakDays: peakDays.slice(0, 3), // Top 3 繁忙天
    };
  }

  // ========== 呼叫中心 ==========

  async getCallCenterStats(startDate?: string, endDate?: string, agentName?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);

    const where: any = {
      startTime: { gte: start, lte: end },
    };
    if (agentName) {
      where.agentName = { contains: agentName, mode: 'insensitive' };
    }

    const records = await this.prisma.udescCallLog.findMany({
      where,
      orderBy: { startTime: 'desc' },
    });

    const inbound = records.filter((x) => x.callType === '呼入');
    const outbound = records.filter((x) => x.callType === '呼出');
    // 振铃 = 实际到达客服/客户端的通话（有接听或未接听结果）
    const inRing = inbound.filter((x) => x.callResult === '客服接听' || x.callResult === '未接听');
    const outRing = outbound.filter((x) => x.callResult === '客户接听' || x.callResult === '未接听');
    const inConnected = inbound.filter((x) => x.callResult === '客服接听');
    const outConnected = outbound.filter((x) => x.callResult === '客户接听');

    const calcStats = (items: typeof records, ringItems: typeof records, connected: typeof records) => {
      const cnt = items.length;
      const ringCnt = ringItems.length;
      const connCnt = connected.length;
      const totalDuration = connected.reduce((s, x) => s + (x.callTime || 0), 0);
      const avgDuration = connCnt > 0 ? Math.round((totalDuration / connCnt) * 10) / 10 : 0;
      const rated = items.filter((x) => x.satisfaction && x.satisfaction !== '未评');
      const sat = rated.filter((x) => x.satisfaction === '满意');
      const satRate = rated.length > 0 ? `${Math.round((sat.length / rated.length) * 1000) / 10}%` : 'N/A';
      return { total: cnt, ringCount: ringCnt, connected: connCnt, totalDuration, avgDuration, rated: rated.length, satisfaction: satRate };
    };

    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      inbound: calcStats(inbound, inRing, inConnected),
      outbound: calcStats(outbound, outRing, outConnected),
      totalCalls: records.length,
      records: records.map((item) => ({
        id: item.id,
        callType: item.callType || '',
        callResult: item.callResult || '',
        customerPhone: item.customerPhone || '',
        agentName: item.agentName ?? '',
        callTime: item.callTime ?? 0,
        startTime: item.startTime?.toISOString() ?? '',
        satisfaction: item.satisfaction || '未评',
      })),
    };
  }

  // ========== 业务记录 ==========

  async getNotes(params: {
    startDate?: string;
    endDate?: string;
    category?: 'im' | 'call' | 'ticket';
    keyword?: string;
    page?: number;
    perPage?: number;
  }) {
    const { start, end } = this.resolveRange(params.startDate, params.endDate);
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 50;

    const where: Record<string, unknown> = {
      createdAt: { gte: start, lte: end },
    };

    // 根据来源分类过滤（通过 ID 前缀判断）
    if (params.category) {
      if (params.category === 'im') {
        where.id = { startsWith: 'note_im_' };
      } else if (params.category === 'call') {
        where.OR = [
          { id: { startsWith: 'note_call_' } },
          { id: { startsWith: 'call_' } },
        ];
      } else if (params.category === 'ticket') {
        where.OR = [
          { id: { startsWith: 'note_ticket_' } },
          { id: { startsWith: 'ticket_' } },
        ];
      }
    }

    if (params.keyword) {
      where.OR = [
        { agentNickName: { contains: params.keyword, mode: 'insensitive' } },
        { customerNickName: { contains: params.keyword, mode: 'insensitive' } },
      ];
    }

    const [records, total] = await Promise.all([
      this.prisma.udescBusinessNote.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.udescBusinessNote.count({
        where: where as any,
      }),
    ]);

    const items = records.map((rec) => {
      // 从 id 推断来源：支持 note_ 前缀和直接前缀两种格式
      let source = 'im';
      if (rec.id.startsWith('note_ticket_') || rec.id.startsWith('ticket_')) source = 'ticket';
      else if (rec.id.startsWith('note_call_') || rec.id.startsWith('call_')) source = 'call';
      return {
        id: rec.id,
        time: rec.createdAt ? toLocalISOString(rec.createdAt) : '',
        agent: rec.agentNickName ?? '',
        customer: rec.customerNickName ?? '',
        problemType1: rec.problemType1 ?? '',
        problemType2: rec.problemType2 ?? '',
        problemType3: rec.problemType3 ?? '',
        source,
      };
    });

    return {
      records: items,
      total,
      page,
      totalPages: Math.ceil(total / perPage),
    };
  }

  /** 获取问题类型TOP5（按 problemType1 统计，排除回访标签） */
  async getTopProblems(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);

    const records = await this.prisma.udescBusinessNote.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        problemType1: { not: null },
        // 排除回访标签
        NOT: [
          { problemType1: { contains: '回访' } },
          { problemType2: { contains: '回访' } },
          { problemType3: { contains: '回访' } },
        ],
      },
      select: { problemType1: true },
    });

    // 按 problemType1 分组统计
    const countMap = new Map<string, number>();
    for (const r of records) {
      const key = r.problemType1?.trim() || '';
      if (key) {
        countMap.set(key, (countMap.get(key) ?? 0) + 1);
      }
    }

    // 排序取 TOP5
    const total = records.length;
    const top5 = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({
        name,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }));

    return { topQuestions: top5, total };
  }
}
