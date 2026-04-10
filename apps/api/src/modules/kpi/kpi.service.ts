import { Injectable } from '@nestjs/common';
import { Prisma, RequirementStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class KpiService {
  constructor(private readonly prisma: PrismaService) {}

  resolveRange(startDate?: string, endDate?: string) {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 1000 * 60 * 60 * 24 * 30);

    return { start, end };
  }

  async getOverview(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);

    const sessions = await this.prisma.udescSession.findMany({
      where: {
        startedAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        rating: true,
        isConsultToDemand: true,
      },
    });

    const rated = sessions.filter((session) => session.rating !== null);
    const positive = rated.filter((session) => (session.rating ?? 0) >= 4).length;
    const consultToDemandCount = sessions.filter((session) => session.isConsultToDemand).length;

    const completedDemandCount = await this.prisma.zouwuRequirement.count({
      where: {
        sourceSessionId: {
          not: null,
        },
        status: {
          in: [RequirementStatus.DONE, RequirementStatus.CLOSED],
        },
        completedAtSource: {
          gte: start,
          lte: end,
        },
      },
    });

    const satisfactionRate = rated.length > 0 ? positive / rated.length : 0;
    const demandCompletionRate =
      consultToDemandCount > 0 ? completedDemandCount / consultToDemandCount : 0;

    return {
      dateRange: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      satisfactionRate,
      ratedSessions: rated.length,
      consultToDemandCount,
      completedDemandCount,
      demandCompletionRate,
    };
  }

  async getDemandOverview(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);
    const baseWhere = {
      createdAtSource: {
        gte: start,
        lte: end,
      },
    };

    const [totalIdentifiedCount, completedCount, linkedSessionCount, bugCount, statusGroups] =
      await Promise.all([
        this.prisma.zouwuRequirement.count({ where: baseWhere }),
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            status: {
              in: [RequirementStatus.DONE, RequirementStatus.CLOSED],
            },
          },
        }),
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            sourceSessionId: { not: null },
          },
        }),
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            OR: [
              { title: { contains: 'bug', mode: 'insensitive' } },
              { title: { contains: '缺陷', mode: 'insensitive' } },
            ],
          },
        }),
        this.prisma.zouwuRequirement.groupBy({
          by: ['status'],
          where: baseWhere,
          _count: { id: true },
        }),
      ]);

    const createdRows = await this.prisma.$queryRaw<
      Array<{ day: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('day', r."createdAtSource") AS day, COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
      GROUP BY DATE_TRUNC('day', r."createdAtSource")
      ORDER BY day ASC
    `;

    const completedRows = await this.prisma.$queryRaw<
      Array<{ day: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('day', r."completedAtSource") AS day, COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."completedAtSource" IS NOT NULL
        AND r."completedAtSource" >= ${start}
        AND r."completedAtSource" <= ${end}
      GROUP BY DATE_TRUNC('day', r."completedAtSource")
      ORDER BY day ASC
    `;

    const recentRequirements = await this.prisma.zouwuRequirement.findMany({
      where: baseWhere,
      orderBy: [{ updatedAtSource: 'desc' }, { createdAtSource: 'desc' }],
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        sourceSessionId: true,
        createdAtSource: true,
        completedAtSource: true,
      },
    });

    const createdMap = new Map<string, number>();
    const completedMap = new Map<string, number>();
    const daySet = new Set<string>();

    for (const row of createdRows) {
      const day = new Date(row.day).toISOString().slice(0, 10);
      createdMap.set(day, Number(row.count));
      daySet.add(day);
    }
    for (const row of completedRows) {
      const day = new Date(row.day).toISOString().slice(0, 10);
      completedMap.set(day, Number(row.count));
      daySet.add(day);
    }

    const days = Array.from(daySet).sort((a, b) => a.localeCompare(b));
    const statusBreakdown = statusGroups.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count.id;
      return acc;
    }, {});

    return {
      dateRange: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      totalIdentifiedCount,
      completedCount,
      completionRate: totalIdentifiedCount > 0 ? completedCount / totalIdentifiedCount : 0,
      linkedSessionCount,
      bugCount,
      statusBreakdown,
      daily: {
        days,
        created: days.map((day) => createdMap.get(day) ?? 0),
        completed: days.map((day) => completedMap.get(day) ?? 0),
      },
      recentRequirements: recentRequirements.map((item) => ({
        ...item,
        createdAtSource: item.createdAtSource.toISOString(),
        completedAtSource: item.completedAtSource?.toISOString(),
      })),
    };
  }

  private truncateDate(date: Date, granularity: 'day' | 'week' | 'month') {
    const d = new Date(date);
    if (granularity === 'month') {
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    if (granularity === 'week') {
      const day = d.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setUTCDate(d.getUTCDate() + diff);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private addStep(date: Date, granularity: 'day' | 'week' | 'month') {
    const d = new Date(date);
    if (granularity === 'month') {
      d.setUTCMonth(d.getUTCMonth() + 1);
      return d;
    }
    if (granularity === 'week') {
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    }
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  private formatLabel(date: Date, granularity: 'day' | 'week' | 'month') {
    if (granularity === 'month') {
      return date.toISOString().slice(0, 7);
    }
    if (granularity === 'week') {
      return `${date.toISOString().slice(0, 10)}(周)`;
    }
    return date.toISOString().slice(0, 10);
  }

  async getConsultationFunnel(
    startDate?: string,
    endDate?: string,
    granularity: 'day' | 'week' | 'month' = 'day',
  ) {
    const { start, end } = this.resolveRange(startDate, endDate);
    const unitLiteral = Prisma.raw(`'${granularity}'`);
    const rows = await this.prisma.$queryRaw<
      Array<{
        bucket: Date;
        consultation_count: bigint;
        issue_consult_count: bigint;
        feedback_count: bigint;
        requirement_identified_count: bigint;
        requirement_completed_count: bigint;
        release_count: bigint;
      }>
    >`
      WITH issue_sessions AS (
        SELECT DISTINCT m."sessionId"
        FROM "UdescSessionMessage" m
        WHERE m."content" ILIKE '%问题%'
          OR m."content" ILIKE '%报错%'
          OR m."content" ILIKE '%异常%'
          OR m."content" ILIKE '%故障%'
          OR m."content" ILIKE '%失败%'
          OR m."content" ILIKE '%bug%'
      ),
      requirement_agg AS (
        SELECT
          r."sourceSessionId",
          TRUE AS has_requirement,
          BOOL_OR(r."status" IN ('DONE', 'CLOSED')) AS is_completed,
          BOOL_OR(r."status" = 'CLOSED') AS is_released
        FROM "ZouwuRequirement" r
        WHERE r."sourceSessionId" IS NOT NULL
        GROUP BY r."sourceSessionId"
      ),
      session_base AS (
        SELECT
          s."id",
          DATE_TRUNC(${unitLiteral}, s."startedAt") AS bucket,
          s."rating" IS NOT NULL AS has_feedback,
          i."sessionId" IS NOT NULL AS is_issue,
          COALESCE(ra.has_requirement, FALSE) AS has_requirement,
          COALESCE(ra.is_completed, FALSE) AS is_completed,
          COALESCE(ra.is_released, FALSE) AS is_released
        FROM "UdescSession" s
        LEFT JOIN issue_sessions i ON i."sessionId" = s."id"
        LEFT JOIN requirement_agg ra ON ra."sourceSessionId" = s."id"
        WHERE s."startedAt" >= ${start}
          AND s."startedAt" <= ${end}
      )
      SELECT
        sb.bucket,
        COUNT(*)::bigint AS consultation_count,
        COUNT(*) FILTER (WHERE sb.is_issue)::bigint AS issue_consult_count,
        COUNT(*) FILTER (WHERE sb.is_issue AND sb.has_feedback)::bigint AS feedback_count,
        COUNT(*) FILTER (WHERE sb.is_issue AND sb.has_requirement)::bigint AS requirement_identified_count,
        COUNT(*) FILTER (
          WHERE sb.is_issue
            AND sb.has_requirement
            AND sb.is_completed
        )::bigint AS requirement_completed_count,
        COUNT(*) FILTER (
          WHERE sb.is_issue
            AND sb.has_requirement
            AND sb.is_completed
            AND sb.is_released
        )::bigint AS release_count
      FROM session_base sb
      GROUP BY sb.bucket
      ORDER BY sb.bucket ASC
    `;

    const buildMap = (getter: (row: (typeof rows)[number]) => bigint) => {
      const map = new Map<string, number>();
      for (const row of rows) {
        map.set(new Date(row.bucket).toISOString(), Number(getter(row)));
      }
      return map;
    };

    const consultationMap = buildMap((row) => row.consultation_count);
    const issueConsultMap = buildMap((row) => row.issue_consult_count);
    const feedbackMap = buildMap((row) => row.feedback_count);
    const requirementIdentifiedMap = buildMap((row) => row.requirement_identified_count);
    const requirementCompletedMap = buildMap((row) => row.requirement_completed_count);
    const releaseMap = buildMap((row) => row.release_count);

    const periods: Array<{
      periodStart: string;
      periodLabel: string;
      consultationCount: number;
      issueConsultCount: number;
      feedbackCount: number;
      requirementIdentifiedCount: number;
      requirementCompletedCount: number;
      releaseCount: number;
    }> = [];

    let cursor = this.truncateDate(start, granularity);
    while (cursor <= end) {
      const key = cursor.toISOString();
      periods.push({
        periodStart: key,
        periodLabel: this.formatLabel(cursor, granularity),
        consultationCount: consultationMap.get(key) ?? 0,
        issueConsultCount: issueConsultMap.get(key) ?? 0,
        feedbackCount: feedbackMap.get(key) ?? 0,
        requirementIdentifiedCount: requirementIdentifiedMap.get(key) ?? 0,
        requirementCompletedCount: requirementCompletedMap.get(key) ?? 0,
        releaseCount: releaseMap.get(key) ?? 0,
      });
      cursor = this.addStep(cursor, granularity);
    }

    return {
      dateRange: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      granularity,
      stages: [
        { key: 'consultationCount', label: '咨询量' },
        { key: 'issueConsultCount', label: '问题咨询' },
        { key: 'feedbackCount', label: '问题反馈' },
        { key: 'requirementIdentifiedCount', label: '识别需求/Bug' },
        { key: 'requirementCompletedCount', label: '已完成需求/Bug' },
        { key: 'releaseCount', label: '需求/Bug上线量' },
      ],
      periods,
    };
  }
}
