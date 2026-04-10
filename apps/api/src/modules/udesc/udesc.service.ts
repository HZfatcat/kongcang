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

    const [totalSessions, totalMessages, agentCount, ratedCount, avgRating, topAgents] =
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
    };
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
}

