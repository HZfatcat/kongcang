import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

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
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString(),
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
    page?: number;
    pageSize?: number;
  }) {
    const { start, end } = this.resolveRange(params.startDate, params.endDate);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const agentIds = (params.agentIds ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const where = {
      startedAt: { gte: start, lte: end },
      ...(agentIds.length > 0
        ? { agentId: { in: agentIds } }
        : params.agentId
          ? { agentId: params.agentId }
          : {}),
    };

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
        startedAt: item.startedAt.toISOString(),
        endedAt: item.endedAt?.toISOString(),
        rating: item.rating,
        isConsultToDemand: item.isConsultToDemand,
        messageCount: item.messages.length,
        messages: item.messages.map((msg) => ({
          id: msg.id,
          sentAt: msg.sentAt.toISOString(),
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
        syncedAt: item.syncedAt.toISOString(),
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
      updatedAtSource: customer.updatedAtSource?.toISOString(),
      syncedAt: customer.syncedAt.toISOString(),
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

    const [total, rows] = await Promise.all([
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
    ]);

    return {
      page,
      pageSize,
      total,
      records: rows.map((vote) => ({
        id: vote.id,
        sessionId: vote.sessionId,
        rating: vote.rating,
        tags: vote.tags,
        comment: vote.comment,
        voterName: vote.voterName,
        votedAt: vote.votedAt?.toISOString(),
        agentId: vote.session.agentId,
        sessionStartedAt: vote.session.startedAt.toISOString(),
      })),
    };
  }

  // ========== 新增 API：会话性能指标 ==========

  async getSessionMetrics(params: {
    startDate?: string;
    endDate?: string;
    agentId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { start, end } = this.resolveRange(params.startDate, params.endDate);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    const sessionWhere = {
      startedAt: { gte: start, lte: end },
      ...(params.agentId ? { agentId: params.agentId } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.udescSessionMetrics.count({
        where: { session: sessionWhere },
      }),
      this.prisma.udescSessionMetrics.findMany({
        where: { session: sessionWhere },
        orderBy: { syncedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          session: {
            select: {
              id: true,
              agentId: true,
              startedAt: true,
              rating: true,
            },
          },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      records: rows.map((m) => ({
        sessionId: m.sessionId,
        agentId: m.session.agentId,
        sessionStartedAt: m.session.startedAt.toISOString(),
        rating: m.session.rating,
        firstResponseTime: m.firstResponseTime,
        avgResponseTime: m.avgResponseTime,
        waitTime: m.waitTime,
        resolutionTime: m.resolutionTime,
        messageCount: m.messageCount,
        agentMessageCount: m.agentMessageCount,
        customerMessageCount: m.customerMessageCount,
      })),
    };
  }

  async getMetricsSummary(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);

    const metrics = await this.prisma.udescSessionMetrics.findMany({
      where: {
        session: { startedAt: { gte: start, lte: end } },
      },
      select: {
        firstResponseTime: true,
        avgResponseTime: true,
        waitTime: true,
        resolutionTime: true,
        messageCount: true,
        agentMessageCount: true,
        customerMessageCount: true,
      },
    });

    if (metrics.length === 0) {
      return {
        dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
        avgFirstResponseTime: null,
        avgResponseTime: null,
        avgWaitTime: null,
        avgResolutionTime: null,
        totalMessages: 0,
        avgMessagesPerSession: 0,
      };
    }

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const avg = (arr: (number | null)[]) => {
      const filtered = arr.filter((v): v is number => v !== null);
      return filtered.length > 0 ? sum(filtered) / filtered.length : null;
    };

    const firstResponseTimes = metrics.map((m) => m.firstResponseTime).filter((v): v is number => v !== null);
    const avgResponseTimes = metrics.map((m) => m.avgResponseTime).filter((v): v is number => v !== null);
    const waitTimes = metrics.map((m) => m.waitTime).filter((v): v is number => v !== null);
    const resolutionTimes = metrics.map((m) => m.resolutionTime).filter((v): v is number => v !== null);
    const messageCounts = metrics.map((m) => m.messageCount);

    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      avgFirstResponseTime: firstResponseTimes.length > 0 ? Math.round(sum(firstResponseTimes) / firstResponseTimes.length) : null,
      avgResponseTime: avgResponseTimes.length > 0 ? Math.round(avg(avgResponseTimes)!) : null,
      avgWaitTime: waitTimes.length > 0 ? Math.round(sum(waitTimes) / waitTimes.length) : null,
      avgResolutionTime: resolutionTimes.length > 0 ? Math.round(sum(resolutionTimes) / resolutionTimes.length) : null,
      totalMessages: sum(messageCounts),
      avgMessagesPerSession: metrics.length > 0 ? Number((sum(messageCounts) / metrics.length).toFixed(2)) : 0,
    };
  }
}

