import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

/**
 * 将 Date 转为本地时间 ISO 字符串（不含 Z 后缀）
 * 例如：2026-04-22T11:00:00（北京时间）
 * 前端 dayjs 解析时会按本地时间处理
 */
function toLocalISOString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

@Injectable()
export class UdescService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveRange(startDate?: string, endDate?: string) {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 1000 * 60 * 60 * 24 * 30);
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

    const [totalSessions, totalMessages, agentCount, ratedCount, avgRating, topAgents, voteStats, customerCount] =
      await Promise.all([
      this.prisma.udescSession.count({ where }),
      this.prisma.udescSessionMessage.count({
        where: {
          session: where,
        },
      }),
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
      this.prisma.udescSession.count({
        where: {
          ...where,
          rating: { not: null },
        },
      }),
      this.prisma.udescSession.aggregate({
        where: {
          ...where,
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
      this.getVoteTagStats(start, end),
      this.prisma.udescCustomer.count(),
      ]);

    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      totalSessions,
      totalMessages,
      avgMessagesPerSession: totalSessions > 0 ? Number((totalMessages / totalSessions).toFixed(2)) : 0,
      agentCount,
      ratedCount,
      avgRating: avgRating._avg.rating ?? 0,
      topAgents: topAgents.map((item) => ({
        agentId: item.agentId ?? 'unknown',
        sessions: item._count.id,
      })),
      voteTagStats: voteStats,
      customerCount,
    };
  }

  private async getVoteTagStats(start: Date, end: Date) {
    const votes = await this.prisma.udescSessionVote.findMany({
      where: {
        votedAt: { gte: start, lte: end },
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
      records: rows.map((item) => ({
        id: item.id,
        agentId: item.agentId,
        startedAt: toLocalISOString(item.startedAt),
        endedAt: item.endedAt ? toLocalISOString(item.endedAt) : null,
        rating: item.rating,
        isConsultToDemand: item.isConsultToDemand,
        messageCount: item.messages.length,
        messages: item.messages.map((msg) => ({
          id: msg.id,
          sentAt: toLocalISOString(msg.sentAt),
          senderType: msg.senderType,
          senderId: msg.senderId,
          content: msg.content,
        })),
      })),
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

    const messageRows = await this.prisma.$queryRaw<
      Array<{
        day: Date;
        agentId: string | null;
        messageCount: bigint;
      }>
    >`
      SELECT
        DATE_TRUNC('day', s."startedAt") AS day,
        s."agentId" AS "agentId",
        COUNT(m."id")::bigint AS "messageCount"
      FROM "UdescSession" s
      LEFT JOIN "UdescSessionMessage" m ON m."sessionId" = s."id"
      WHERE s."startedAt" >= ${start} AND s."startedAt" <= ${end}
      GROUP BY DATE_TRUNC('day', s."startedAt"), s."agentId"
      ORDER BY day ASC
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

    for (const row of messageRows) {
      const day = new Date(row.day).toISOString().slice(0, 10);
      const agentId = row.agentId ?? '未分配客服';
      const key = `${day}__${agentId}`;
      messageMap.set(key, Number(row.messageCount));
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

    const [sessionStats, ratingStats, messageStats] = await Promise.all([
      this.prisma.udescSession.groupBy({
        by: ['agentId'],
        where: {
          agentId,
          startedAt: { gte: start, lte: end },
        },
        _count: { id: true },
      }),
      this.prisma.udescSession.aggregate({
        where: {
          agentId,
          startedAt: { gte: start, lte: end },
          rating: { not: null },
        },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      this.prisma.udescSessionMessage.aggregate({
        where: {
          session: { agentId, startedAt: { gte: start, lte: end } },
        },
        _count: { id: true },
      }),
    ]);

    return {
      agentId,
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      totalSessions: sessionStats[0]?._count.id ?? 0,
      avgRating: ratingStats._avg.rating ?? null,
      ratedCount: ratingStats._count.rating,
      totalMessages: messageStats._count.id,
    };
  }

  // ========== 新增 API：评价分析 ==========

  async getVotes(params: {
    startDate?: string;
    endDate?: string;
    minRating?: number;
    maxRating?: number;
    page?: number;
    pageSize?: number;
  }) {
    const { start, end } = this.resolveRange(params.startDate, params.endDate);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    const where = {
      votedAt: { gte: start, lte: end },
      ...(params.minRating !== undefined ? { rating: { gte: params.minRating } } : {}),
      ...(params.maxRating !== undefined
        ? { rating: { ...(params.minRating !== undefined ? { gte: params.minRating } : {}), lte: params.maxRating } }
        : {}),
    };

    const [total, rows, ratingStats] = await Promise.all([
      this.prisma.udescSessionVote.count({ where }),
      this.prisma.udescSessionVote.findMany({
        where,
        orderBy: { votedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          session: {
            select: {
              agentId: true,
              startedAt: true,
            },
          },
        },
      }),
      this.prisma.udescSessionVote.groupBy({
        by: ['rating'],
        where: { ...where, rating: { not: null } },
        _count: { rating: true },
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

    const avgRatingResult = await this.prisma.udescSessionVote.aggregate({
      where: { ...where, rating: { not: null } },
      _avg: { rating: true },
    });

    // 统计时间范围内的总会话数
    const totalSessions = await this.prisma.udescSession.count({
      where: {
        startedAt: { gte: start, lte: end },
      },
    });

    const ratingDistribution: Record<number, number> = {};
    for (let i = 1; i <= 5; i++) {
      ratingDistribution[i] = 0;
    }
    for (const stat of ratingStats) {
      if (stat.rating !== null) {
        ratingDistribution[stat.rating] = stat._count.rating;
      }
    }

    return {
      page,
      pageSize,
      total,
      totalSessions,
      records: rows.map((vote) => ({
        id: vote.id,
        sessionId: vote.sessionId,
        rating: vote.rating,
        tags: vote.tags,
        comment: vote.comment,
        voterName: vote.voterName,
        votedAt: vote.votedAt ? toLocalISOString(vote.votedAt) : null,
        agentId: vote.session.agentId,
        agentName: vote.session.agentId ? (agentNameMap.get(vote.session.agentId) || vote.session.agentId) : null,
        sessionStartedAt: toLocalISOString(vote.session.startedAt),
      })),
      avgRating: avgRatingResult._avg.rating ?? null,
      ratingDistribution,
    };
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
          m.senderType === 'agent' ||
          (m.rawPayload as Record<string, unknown>)?.sender === 'agent'
        );
        const customerMsgs = messages.filter((m) =>
          m.senderType === 'customer' ||
          (m.rawPayload as Record<string, unknown>)?.sender === 'customer'
        );

        // 计算首次响应时间（无法计算时返回 null）
        let firstResponseTime: number | null = null;
        if (customerMsgs.length > 0) {
          if (agentMsgs.length > 0) {
            const firstCustomerMsg = customerMsgs[0];
            const firstAgentMsg = agentMsgs.find((a) => new Date(a.sentAt) > new Date(firstCustomerMsg.sentAt));
            if (firstAgentMsg) {
              const diff = Math.round(
                (new Date(firstAgentMsg.sentAt).getTime() - new Date(firstCustomerMsg.sentAt).getTime()) / 1000
              );
              if (diff > 0) {
                firstResponseTime = diff;
              }
            }
          }
          // 客户有消息但客服未回复，首次响应时间设为 100 小时
          if (agentMsgs.length === 0) {
            firstResponseTime = 100 * 60 * 60; // 360000 秒 = 100 小时
          }
        }

        // 计算平均响应时间
        let avgResponseTime = 0;
        const responseTimes: number[] = [];
        for (let i = 0; i < customerMsgs.length - 1; i++) {
          const agentReply = agentMsgs.find(
            (a) => new Date(a.sentAt) > new Date(customerMsgs[i].sentAt)
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
        let resolutionTime = 0;
        if (s.endedAt && messages.length > 0) {
          const firstMsg = messages[0];
          resolutionTime = Math.round(
            (new Date(s.endedAt).getTime() - new Date(firstMsg.sentAt).getTime()) / 1000
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
          messageCount: messages.length,
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

    // 查询符合条件的 session
    const sessions = await this.prisma.udescSession.findMany({
      where: {
        startedAt: { gte: start, lte: end },
        ...(agentId ? { agentId } : {}),
      },
      select: { id: true },
    });
    const sessionIds = sessions.map(s => s.id);
    console.log('[getMetricsSummary] sessions found:', sessions.length, 'agentId:', agentId);

    if (sessionIds.length === 0) {
      return {
        dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
        totalSessions: 0,
        avgFirstResponseTime: null,
        avgResponseTime: null,
        avgWaitTime: null,
        avgResolutionTime: null,
        totalMessages: 0,
        avgMessagesPerSession: 0,
      };
    }

    // 从消息表查询数据，按 sessionId 分组计算
    // 使用 $queryRaw 执行原生 SQL 以提高性能
    const metricsData = await this.prisma.$queryRaw<{
      sessionId: string;
      first_customer_msg: Date | null;
      first_agent_msg: Date | null;
      last_msg: Date | null;
      total_msgs: bigint;
      agent_msgs: bigint;
    }[]>`
      WITH session_msgs AS (
        SELECT 
          sm."sessionId",
          sm."sentAt",
          sm."senderType"
        FROM "UdescSessionMessage" sm
        WHERE sm."sessionId" = ANY(${sessionIds}::text[])
      ),
      aggregated AS (
        SELECT 
          "sessionId",
          MIN(CASE WHEN "senderType" = 'customer' THEN "sentAt" END) as first_customer_msg,
          MIN(CASE WHEN "senderType" = 'agent' THEN "sentAt" END) as first_agent_msg,
          MAX("sentAt") as last_msg,
          COUNT(*) as total_msgs,
          COUNT(*) FILTER (WHERE "senderType" = 'agent') as agent_msgs
        FROM session_msgs
        GROUP BY "sessionId"
      )
      SELECT * FROM aggregated
    `;

    console.log('[getMetricsSummary] metricsData rows:', metricsData.length);

    // 计算首次响应时间（第一个客服消息 - 第一个客户消息）
    const firstResponseTimes: number[] = [];
    let totalMessages = 0;
    let sessionsWithMessages = 0;

    const HUNDRED_HOURS = 100 * 60 * 60; // 360000 秒

    for (const row of metricsData) {
      if (row.first_customer_msg) {
        if (row.first_agent_msg) {
          const diffMs = new Date(row.first_agent_msg).getTime() - new Date(row.first_customer_msg).getTime();
          if (diffMs > 0) {
            firstResponseTimes.push(Math.round(diffMs / 1000)); // 转为秒
          }
        } else {
          // 客户有消息但客服未回复，首次响应时间设为 100 小时
          firstResponseTimes.push(HUNDRED_HOURS);
        }
      }
      totalMessages += Number(row.total_msgs);
      sessionsWithMessages++;
    }

    // 计算平均首次响应时间（秒），排除无效值
    const avgFirstResponseTime = firstResponseTimes.length > 0
      ? Math.round(firstResponseTimes.reduce((a, b) => a + b, 0) / firstResponseTimes.length)
      : null;

    // 计算平均响应时间、平均等待时间、平均解决时间
    // 需要获取每个会话的详细消息序列
    const responseTimes: number[] = [];
    const waitTimes: number[] = [];
    const resolutionTimes: number[] = [];

    // 批量获取消息，按 sessionId 和 sentAt 排序
    const allMessages = await this.prisma.udescSessionMessage.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true, sentAt: true, senderType: true },
      orderBy: [{ sessionId: 'asc' }, { sentAt: 'asc' }],
    });

    // 按 sessionId 分组
    const messagesBySession = new Map<string, typeof allMessages>();
    for (const msg of allMessages) {
      if (!messagesBySession.has(msg.sessionId)) {
        messagesBySession.set(msg.sessionId, []);
      }
      messagesBySession.get(msg.sessionId)!.push(msg);
    }

    // 获取会话的 endedAt
    const sessionEndTimes = await this.prisma.udescSession.findMany({
      where: { id: { in: sessionIds } },
      select: { id: true, startedAt: true, endedAt: true },
    });
    const sessionEndMap = new Map(sessionEndTimes.map(s => [s.id, s]));

    // 计算每个会话的指标
    for (const [sessionId, messages] of messagesBySession) {
      const session = sessionEndMap.get(sessionId);
      if (!session) continue;

      // 计算解决时间（会话结束 - 第一条消息）
      if (session.endedAt && messages.length > 0) {
        const firstMsgTime = new Date(messages[0].sentAt).getTime();
        const endedTime = new Date(session.endedAt).getTime();
        if (endedTime >= firstMsgTime) {
          resolutionTimes.push(Math.round((endedTime - firstMsgTime) / 1000));
        }
      }

      // 分离客户和客服消息
      const customerMsgs = messages.filter(m => m.senderType === 'customer');
      const agentMsgs = messages.filter(m => m.senderType === 'agent');

      // 计算响应时间：每条客户消息后的第一条客服回复
      for (const customerMsg of customerMsgs) {
        const customerTime = new Date(customerMsg.sentAt).getTime();
        const nextAgentMsg = agentMsgs.find(a => new Date(a.sentAt).getTime() > customerTime);
        if (nextAgentMsg) {
          const agentTime = new Date(nextAgentMsg.sentAt).getTime();
          responseTimes.push(Math.round((agentTime - customerTime) / 1000));
        }
      }

      // 计算等待时间：客户发送消息到客服回复的时间总和
      let sessionWaitTime = 0;
      for (const customerMsg of customerMsgs) {
        const customerTime = new Date(customerMsg.sentAt).getTime();
        const nextAgentMsg = agentMsgs.find(a => new Date(a.sentAt).getTime() > customerTime);
        if (nextAgentMsg) {
          const agentTime = new Date(nextAgentMsg.sentAt).getTime();
          sessionWaitTime += (agentTime - customerTime) / 1000;
        }
      }
      if (sessionWaitTime > 0) {
        waitTimes.push(Math.round(sessionWaitTime));
      }
    }

    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

    const avgWaitTime = waitTimes.length > 0
      ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
      : null;

    const avgResolutionTime = resolutionTimes.length > 0
      ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
      : null;

    const result = {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      totalSessions: sessions.length,
      avgFirstResponseTime,
      avgResponseTime,
      avgWaitTime,
      avgResolutionTime,
      totalMessages,
      avgMessagesPerSession: sessionsWithMessages > 0 ? Number((totalMessages / sessionsWithMessages).toFixed(2)) : 0,
    };
    console.log('[getMetricsSummary] returning:', result);
    return result;
  }

  async getAgentMetricsSummary(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);

    // 获取所有客服的会话，按 agentId 分组
    const sessions = await this.prisma.udescSession.findMany({
      where: {
        startedAt: { gte: start, lte: end },
        agentId: { not: null },
      },
      select: {
        id: true,
        agentId: true,
        startedAt: true,
        endedAt: true,
      },
    });

    // 按 agentId 分组
    const agentSessionMap = new Map<string, string[]>();
    for (const s of sessions) {
      if (s.agentId) {
        if (!agentSessionMap.has(s.agentId)) {
          agentSessionMap.set(s.agentId, []);
        }
        agentSessionMap.get(s.agentId)!.push(s.id);
      }
    }

    // 获取客服名称（优先 AgentProfile，fallback 到 UdescAgent）
    const agentIds = Array.from(agentSessionMap.keys());
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

    // 获取所有消息
    const allSessionIds = sessions.map(s => s.id);
    const allMessages = await this.prisma.udescSessionMessage.findMany({
      where: { sessionId: { in: allSessionIds } },
      select: { sessionId: true, sentAt: true, senderType: true },
      orderBy: { sentAt: 'asc' },
    });

    // 按 sessionId 分组消息
    const messagesBySession = new Map<string, typeof allMessages>();
    for (const msg of allMessages) {
      if (!messagesBySession.has(msg.sessionId)) {
        messagesBySession.set(msg.sessionId, []);
      }
      messagesBySession.get(msg.sessionId)!.push(msg);
    }

    // 会话结束时间映射
    const sessionEndMap = new Map(sessions.map(s => [s.id, s]));

    // 计算每个客服的指标
    const results = [];
    for (const [agentId, sessionIds] of agentSessionMap) {
      let totalFirstResponseTime = 0;
      let firstResponseCount = 0;
      let totalResponseTime = 0;
      let responseCount = 0;
      let totalWaitTime = 0;
      let waitCount = 0;
      let totalResolutionTime = 0;
      let resolutionCount = 0;
      let totalMessages = 0;

      for (const sessionId of sessionIds) {
        const messages = messagesBySession.get(sessionId) || [];
        const session = sessionEndMap.get(sessionId);

        totalMessages += messages.length;

        const customerMsgs = messages.filter(m => m.senderType === 'customer');
        const agentMsgs = messages.filter(m => m.senderType === 'agent');

        const HUNDRED_HOURS = 100 * 60 * 60; // 360000 秒

        // 首次响应时间
        if (customerMsgs.length > 0) {
          if (agentMsgs.length > 0) {
            const firstCustomerMsg = customerMsgs[0];
            const firstAgentMsgAfter = agentMsgs.find(a => 
              new Date(a.sentAt).getTime() > new Date(firstCustomerMsg.sentAt).getTime()
            );
            if (firstAgentMsgAfter) {
              const diff = Math.round(
                (new Date(firstAgentMsgAfter.sentAt).getTime() - new Date(firstCustomerMsg.sentAt).getTime()) / 1000
              );
              if (diff > 0) {
                totalFirstResponseTime += diff;
                firstResponseCount++;
              }
            }
          } else {
            // 客户有消息但客服未回复，首次响应时间设为 100 小时
            totalFirstResponseTime += HUNDRED_HOURS;
            firstResponseCount++;
          }
        }

        // 响应时间
        for (const customerMsg of customerMsgs) {
          const customerTime = new Date(customerMsg.sentAt).getTime();
          const nextAgentMsg = agentMsgs.find(a => new Date(a.sentAt).getTime() > customerTime);
          if (nextAgentMsg) {
            totalResponseTime += Math.round((new Date(nextAgentMsg.sentAt).getTime() - customerTime) / 1000);
            responseCount++;
          }
        }

        // 等待时间（每个会话的总等待时间）
        let sessionWait = 0;
        for (const customerMsg of customerMsgs) {
          const customerTime = new Date(customerMsg.sentAt).getTime();
          const nextAgentMsg = agentMsgs.find(a => new Date(a.sentAt).getTime() > customerTime);
          if (nextAgentMsg) {
            sessionWait += Math.round((new Date(nextAgentMsg.sentAt).getTime() - customerTime) / 1000);
          }
        }
        if (sessionWait > 0) {
          totalWaitTime += sessionWait;
          waitCount++;
        }

        // 解决时间
        if (session?.endedAt && messages.length > 0) {
          const diff = Math.round(
            (new Date(session.endedAt).getTime() - new Date(messages[0].sentAt).getTime()) / 1000
          );
          if (diff >= 0) {
            totalResolutionTime += diff;
            resolutionCount++;
          }
        }
      }

      results.push({
        agentId,
        agentName: agentNameMap.get(agentId) || agentId,
        sessionCount: sessionIds.length,
        avgFirstResponseTime: firstResponseCount > 0 ? Math.round(totalFirstResponseTime / firstResponseCount) : null,
        avgResponseTime: responseCount > 0 ? Math.round(totalResponseTime / responseCount) : null,
        avgWaitTime: waitCount > 0 ? Math.round(totalWaitTime / waitCount) : null,
        avgResolutionTime: resolutionCount > 0 ? Math.round(totalResolutionTime / resolutionCount) : null,
        avgMessagesPerSession: sessionIds.length > 0 ? Number((totalMessages / sessionIds.length).toFixed(1)) : 0,
      });
    }

    // 按会话数降序排序
    results.sort((a, b) => b.sessionCount - a.sessionCount);

    return results;
  }
}

