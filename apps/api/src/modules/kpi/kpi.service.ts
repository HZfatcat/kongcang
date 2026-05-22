import { Injectable } from '@nestjs/common';
import { Prisma, RequirementStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class KpiService {
  constructor(private readonly prisma: PrismaService) {}

  resolveRange(startDate?: string, endDate?: string, lookbackDays = 90) {
    let end: Date;
    if (endDate) {
      // 将 endDate 设置为当天的 23:59:59.999，确保包含当天所有数据
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      end = new Date();
    }
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 1000 * 60 * 60 * 24 * lookbackDays);

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
      },
    });

    const rated = sessions.filter((session) => session.rating !== null);
    const positive = rated.filter((session) => (session.rating ?? 0) >= 4).length;

    // 使用与 getDemandOverview 相同的逻辑查询需求数据
    const baseWhere = {
      createdAtSource: { gte: start, lte: end },
    };

    const [consultToDemandCount, completedDemandCount, rejectedDemandCount] = await Promise.all([
      // 转需求会话数（所有非 bug 需求总数）
      this.prisma.zouwuRequirement.count({
        where: {
          ...baseWhere,
          OR: [
            { issueType: { not: 1 } },
            { issueType: null },
          ],
        },
      }),
      // 已完成需求数（CLOSED，排除 bug 和长期演进）
      this.prisma.zouwuRequirement.count({
        where: {
          ...baseWhere,
          isLongTerm: false,
          OR: [
            { issueType: { not: 1 } },
            { issueType: null },
          ],
          status: RequirementStatus.CLOSED,
        },
      }),
      // 已驳回需求数（REJECTED，排除 bug 和长期演进）
      this.prisma.zouwuRequirement.count({
        where: {
          ...baseWhere,
          isLongTerm: false,
          OR: [
            { issueType: { not: 1 } },
            { issueType: null },
          ],
          status: RequirementStatus.REJECTED,
        },
      }),
    ]);

    const satisfactionRate = rated.length > 0 ? positive / rated.length : 0;
    const demandCompletionRate =
      consultToDemandCount > 0 ? (completedDemandCount + rejectedDemandCount) / consultToDemandCount : 0;

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

    // 需求总数（含长期演进，排除 Bug）
    const totalWithLongTerm = await this.prisma.zouwuRequirement.count({
      where: {
        ...baseWhere,
        OR: [
          { issueType: { not: 1 } },
          { issueType: null },
        ],
      },
    });

    const [completedCount, rejectedCount, linkedSessionCount, bugCount, bugCompletedCount, bugRejectedCount, bugLongTermCount, statusGroups, longTermCount, followUpCount, bugFollowUpCount] =
      await Promise.all([
        // 需求结单数（CLOSED + DONE，含长期演进中已闭环的）
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            OR: [
              { issueType: { not: 1 } },
              { issueType: null },
            ],
            status: { in: [RequirementStatus.CLOSED, RequirementStatus.DONE] },
          },
        }),
        // 需求拒绝数（REJECTED，排除长期演进）
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            isLongTerm: false,
            OR: [
              { issueType: { not: 1 } },
              { issueType: null },
            ],
            status: RequirementStatus.REJECTED,
          },
        }),
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            sourceSessionId: { not: null },
          },
        }),
        // Bug 总数（issueType = 1，包含长期演进）
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            issueType: 1,
          },
        }),
        // Bug 结单数（CLOSED + DONE，排除长期演进）
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            isLongTerm: false,
            issueType: 1,
            status: { in: [RequirementStatus.CLOSED, RequirementStatus.DONE] },
          },
        }),
        // Bug 拒绝数（REJECTED，排除长期演进）
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            isLongTerm: false,
            issueType: 1,
            status: RequirementStatus.REJECTED,
          },
        }),
        // Bug 长期演进数量
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            issueType: 1,
            isLongTerm: true,
          },
        }),
        this.prisma.zouwuRequirement.groupBy({
          by: ['status'],
          where: baseWhere,
          _count: { id: true },
        }),
        // 长期演进数量（排除 Bug）
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            isLongTerm: true,
            OR: [
              { issueType: { not: 1 } },
              { issueType: null },
            ],
          },
        }),
        // 跟进中需求数（非 Bug、非长期演进、状态为 OPEN / IN_PROGRESS / DONE）
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            isLongTerm: false,
            OR: [
              { issueType: { not: 1 } },
              { issueType: null },
            ],
            status: { in: [RequirementStatus.OPEN, RequirementStatus.IN_PROGRESS, RequirementStatus.DONE] },
          },
        }),
        // 跟进中 Bug 数（Bug、非长期演进、状态为 OPEN / IN_PROGRESS / DONE）
        this.prisma.zouwuRequirement.count({
          where: {
            ...baseWhere,
            isLongTerm: false,
            issueType: 1,
            status: { in: [RequirementStatus.OPEN, RequirementStatus.IN_PROGRESS, RequirementStatus.DONE] },
          },
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

    // 按月统计需求（不含 bug，即 issueType != 1，包含长期演进）
    const monthlyRequirementCreatedRows = await this.prisma.$queryRaw<
      Array<{ month: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('month', r."createdAtSource") AS month, COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND (r."issueType" IS NULL OR r."issueType" != 1)
      GROUP BY DATE_TRUNC('month', r."createdAtSource")
      ORDER BY month ASC
    `;

    // 月度需求完成统计：按创建时间月份分组，统计已闭环状态（CLOSED + DONE，含长期演进中已闭环的）
    const monthlyRequirementCompletedRows = await this.prisma.$queryRaw<
      Array<{ month: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('month', r."createdAtSource") AS month, COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND (r."issueType" IS NULL OR r."issueType" != 1)
        AND r.status IN ('CLOSED', 'DONE')
      GROUP BY DATE_TRUNC('month', r."createdAtSource")
      ORDER BY month ASC
    `;

    // 月度需求拒绝统计：按创建时间月份分组，统计已拒绝状态
    const monthlyRequirementRejectedRows = await this.prisma.$queryRaw<
      Array<{ month: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('month', r."createdAtSource") AS month, COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND (r."issueType" IS NULL OR r."issueType" != 1)
        AND r."isLongTerm" = false
        AND r.status = 'REJECTED'
      GROUP BY DATE_TRUNC('month', r."createdAtSource")
      ORDER BY month ASC
    `;

    // 按月统计长期演进需求数量（不含 bug）
    const monthlyLongTermRows = await this.prisma.$queryRaw<
      Array<{ month: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('month', r."createdAtSource") AS month, COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND (r."issueType" IS NULL OR r."issueType" != 1)
        AND r."isLongTerm" = true
      GROUP BY DATE_TRUNC('month', r."createdAtSource")
      ORDER BY month ASC
    `;

    // 按月统计 bug 长期演进数量
    const monthlyBugLongTermRows = await this.prisma.$queryRaw<
      Array<{ month: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('month', r."createdAtSource") AS month, COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND r."issueType" = 1
        AND r."isLongTerm" = true
      GROUP BY DATE_TRUNC('month', r."createdAtSource")
      ORDER BY month ASC
    `;

    // 按月统计 bug 总数（包含长期演进）
    const monthlyBugCreatedRows = await this.prisma.$queryRaw<
      Array<{ month: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('month', r."createdAtSource") AS month, COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND r."issueType" = 1
      GROUP BY DATE_TRUNC('month', r."createdAtSource")
      ORDER BY month ASC
    `;

    // 月度Bug完成统计：按创建时间月份分组，统计已闭环状态（CLOSED + DONE，排除长期演进）
    const monthlyBugCompletedRows = await this.prisma.$queryRaw<
      Array<{ month: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('month', r."createdAtSource") AS month, COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND r."issueType" = 1
        AND r."isLongTerm" = false
        AND r.status IN ('CLOSED', 'DONE')
      GROUP BY DATE_TRUNC('month', r."createdAtSource")
      ORDER BY month ASC
    `;

    // 月度 Bug 拒绝统计：按创建时间月份分组，统计已拒绝状态
    const monthlyBugRejectedRows = await this.prisma.$queryRaw<
      Array<{ month: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('month', r."createdAtSource") AS month, COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND r."issueType" = 1
        AND r."isLongTerm" = false
        AND r.status = 'REJECTED'
      GROUP BY DATE_TRUNC('month', r."createdAtSource")
      ORDER BY month ASC
    `;

    const recentRequirements = await this.prisma.zouwuRequirement.findMany({
      where: baseWhere,
      orderBy: [{ updatedAtSource: 'desc' }, { createdAtSource: 'desc' }],
      select: {
        id: true,
        title: true,
        status: true,
        issueType: true,
        isLongTerm: true,
        sourceSessionId: true,
        createdById: true,
        createdByName: true,
        createdAtSource: true,
        completedAtSource: true,
        updatedAtSource: true,
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

    // 构建按月统计数据 - 根据时间窗口生成月份
    const allMonths: string[] = [];
    const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    const iterMonth = new Date(startMonth);
    while (iterMonth <= endMonth) {
      const monthStr = `${iterMonth.getFullYear()}-${String(iterMonth.getMonth() + 1).padStart(2, '0')}`;
      allMonths.push(monthStr);
      iterMonth.setMonth(iterMonth.getMonth() + 1);
    }

    const monthlyRequirementMap = new Map<string, { created: number; completed: number; rejectedCount: number; longTermCount: number }>();
    // 初始化所有月份
    for (const month of allMonths) {
      monthlyRequirementMap.set(month, { created: 0, completed: 0, rejectedCount: 0, longTermCount: 0 });
    }
    // 填充实际数据
    for (const row of monthlyRequirementCreatedRows) {
      const month = new Date(row.month).toISOString().slice(0, 7);
      const prev = monthlyRequirementMap.get(month);
      if (prev) {
        prev.created = Number(row.count);
      }
    }
    for (const row of monthlyRequirementCompletedRows) {
      const month = new Date(row.month).toISOString().slice(0, 7);
      const prev = monthlyRequirementMap.get(month);
      if (prev) {
        prev.completed = Number(row.count);
      }
    }
    for (const row of monthlyLongTermRows) {
      const month = new Date(row.month).toISOString().slice(0, 7);
      const prev = monthlyRequirementMap.get(month);
      if (prev) {
        prev.longTermCount = Number(row.count);
      }
    }
    for (const row of monthlyRequirementRejectedRows) {
      const month = new Date(row.month).toISOString().slice(0, 7);
      const prev = monthlyRequirementMap.get(month);
      if (prev) {
        prev.rejectedCount = Number(row.count);
      }
    }

    const monthlyBugMap = new Map<string, { created: number; completed: number; rejectedCount: number; longTermCount: number }>();
    // 初始化所有月份
    for (const month of allMonths) {
      monthlyBugMap.set(month, { created: 0, completed: 0, rejectedCount: 0, longTermCount: 0 });
    }
    // 填充实际数据
    for (const row of monthlyBugCreatedRows) {
      const month = new Date(row.month).toISOString().slice(0, 7);
      const prev = monthlyBugMap.get(month);
      if (prev) {
        prev.created = Number(row.count);
      }
    }
    for (const row of monthlyBugCompletedRows) {
      const month = new Date(row.month).toISOString().slice(0, 7);
      const prev = monthlyBugMap.get(month);
      if (prev) {
        prev.completed = Number(row.count);
      }
    }
    for (const row of monthlyBugLongTermRows) {
      const month = new Date(row.month).toISOString().slice(0, 7);
      const prev = monthlyBugMap.get(month);
      if (prev) {
        prev.longTermCount = Number(row.count);
      }
    }
    for (const row of monthlyBugRejectedRows) {
      const month = new Date(row.month).toISOString().slice(0, 7);
      const prev = monthlyBugMap.get(month);
      if (prev) {
        prev.rejectedCount = Number(row.count);
      }
    }
    const days = Array.from(daySet).sort((a, b) => a.localeCompare(b));
    const statusBreakdown = statusGroups.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count.id;
      return acc;
    }, {});

    // 分母 = 需求总数 - 长期演进
    const totalIdentifiedCount = totalWithLongTerm - longTermCount;

    return {
      dateRange: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      totalWithLongTerm,
      longTermCount,
      totalIdentifiedCount,
      completedCount,
      rejectedCount,
      completionRate: totalIdentifiedCount > 0 ? (completedCount + rejectedCount) / totalIdentifiedCount : 0,
      linkedSessionCount,
      bugCount,
      bugLongTermCount,
      bugCompletedCount,
      bugRejectedCount,
      bugCompletionRate: (bugCount - bugLongTermCount) > 0 ? (bugCompletedCount + bugRejectedCount) / (bugCount - bugLongTermCount) : 0,
      followUpCount,
      bugFollowUpCount,
      statusBreakdown,
      daily: {
        days,
        created: days.map((day) => createdMap.get(day) ?? 0),
        completed: days.map((day) => completedMap.get(day) ?? 0),
      },
      monthlyRequirement: Array.from(monthlyRequirementMap.entries())
        .map(([month, value]) => ({
          month,
          created: value.created,
          completed: value.completed,
          rejectedCount: value.rejectedCount,
          longTermCount: value.longTermCount,
          completionRate: (value.created - value.longTermCount) > 0 
            ? (value.completed + value.rejectedCount) / (value.created - value.longTermCount) 
            : 0,
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      monthlyBug: Array.from(monthlyBugMap.entries())
        .map(([month, value]) => ({
          month,
          created: value.created,
          completed: value.completed,
          rejectedCount: value.rejectedCount,
          longTermCount: value.longTermCount,
          completionRate: (value.created - value.longTermCount) > 0 
            ? (value.completed + value.rejectedCount) / (value.created - value.longTermCount) 
            : 0,
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      recentRequirements: recentRequirements.map((item) => ({
        ...item,
        createdAtSource: item.createdAtSource.toISOString(),
        completedAtSource: item.completedAtSource?.toISOString(),
        updatedAtSource: item.updatedAtSource?.toISOString(),
      })),
    };
  }

  // ===== 按客服汇总 =====
  async getAgentOverview(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);

    // 需求按客服统计（不含 bug，即 issueType != 1，包含长期演进）
    const agentRequirementCreatedRows = await this.prisma.$queryRaw<
      Array<{ agentName: string; count: bigint }>
    >`
      SELECT COALESCE(r."createdByName", '未知') AS "agentName", COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND (r."issueType" IS NULL OR r."issueType" != 1)
      GROUP BY r."createdByName"
      ORDER BY count DESC
    `;

    // 需求完成按客服统计
    const agentRequirementCompletedRows = await this.prisma.$queryRaw<
      Array<{ agentName: string; count: bigint }>
    >`
      SELECT COALESCE(r."createdByName", '未知') AS "agentName", COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND (r."issueType" IS NULL OR r."issueType" != 1)
        AND r.status IN ('CLOSED', 'DONE')
      GROUP BY r."createdByName"
      ORDER BY count DESC
    `;

    // 需求拒绝按客服统计
    const agentRequirementRejectedRows = await this.prisma.$queryRaw<
      Array<{ agentName: string; count: bigint }>
    >`
      SELECT COALESCE(r."createdByName", '未知') AS "agentName", COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND (r."issueType" IS NULL OR r."issueType" != 1)
        AND r."isLongTerm" = false
        AND r.status = 'REJECTED'
      GROUP BY r."createdByName"
      ORDER BY count DESC
    `;

    // 长期演进需求按客服统计
    const agentLongTermRows = await this.prisma.$queryRaw<
      Array<{ agentName: string; count: bigint }>
    >`
      SELECT COALESCE(r."createdByName", '未知') AS "agentName", COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND (r."issueType" IS NULL OR r."issueType" != 1)
        AND r."isLongTerm" = true
      GROUP BY r."createdByName"
      ORDER BY count DESC
    `;

    // Bug 总数按客服统计
    const agentBugCreatedRows = await this.prisma.$queryRaw<
      Array<{ agentName: string; count: bigint }>
    >`
      SELECT COALESCE(r."createdByName", '未知') AS "agentName", COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND r."issueType" = 1
      GROUP BY r."createdByName"
      ORDER BY count DESC
    `;

    // Bug 完成按客服统计（排除长期演进）
    const agentBugCompletedRows = await this.prisma.$queryRaw<
      Array<{ agentName: string; count: bigint }>
    >`
      SELECT COALESCE(r."createdByName", '未知') AS "agentName", COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND r."issueType" = 1
        AND r."isLongTerm" = false
        AND r.status IN ('CLOSED', 'DONE')
      GROUP BY r."createdByName"
      ORDER BY count DESC
    `;

    // Bug 拒绝按客服统计（排除长期演进）
    const agentBugRejectedRows = await this.prisma.$queryRaw<
      Array<{ agentName: string; count: bigint }>
    >`
      SELECT COALESCE(r."createdByName", '未知') AS "agentName", COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND r."issueType" = 1
        AND r."isLongTerm" = false
        AND r.status = 'REJECTED'
      GROUP BY r."createdByName"
      ORDER BY count DESC
    `;

    // Bug 长期演进按客服统计
    const agentBugLongTermRows = await this.prisma.$queryRaw<
      Array<{ agentName: string; count: bigint }>
    >`
      SELECT COALESCE(r."createdByName", '未知') AS "agentName", COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND r."issueType" = 1
        AND r."isLongTerm" = true
      GROUP BY r."createdByName"
      ORDER BY count DESC
    `;

    // 超七天未采纳：状态为 OPEN，非长期演进，创建时间距 end 超过 7 天
    const sevenDaysAgo = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const agentOver7NotAdoptedRows = await this.prisma.$queryRaw<
      Array<{ agentName: string; count: bigint }>
    >`
      SELECT COALESCE(r."createdByName", '未知') AS "agentName", COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND (r."issueType" IS NULL OR r."issueType" != 1)
        AND r."isLongTerm" = false
        AND r.status = 'OPEN'
        AND r."createdAtSource" < ${sevenDaysAgo}
      GROUP BY r."createdByName"
      ORDER BY count DESC
    `;

    // 超30天未闭环（需求）：已采纳/开发中/已完成 且超过 30 天未关闭
    const thirtyDaysAgo = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const agentOver30NotClosedReqRows = await this.prisma.$queryRaw<
      Array<{ agentName: string; count: bigint }>
    >`
      SELECT COALESCE(r."createdByName", '未知') AS "agentName", COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND (r."issueType" IS NULL OR r."issueType" != 1)
        AND r."isLongTerm" = false
        AND r.status IN ('IN_PROGRESS', 'DONE')
        AND r."createdAtSource" < ${thirtyDaysAgo}
      GROUP BY r."createdByName"
      ORDER BY count DESC
    `;

    // 超30天未闭环（Bug）：开发中/已完成 且超过 30 天未关闭
    const agentOver30NotClosedBugRows = await this.prisma.$queryRaw<
      Array<{ agentName: string; count: bigint }>
    >`
      SELECT COALESCE(r."createdByName", '未知') AS "agentName", COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start} AND r."createdAtSource" <= ${end}
        AND r."issueType" = 1
        AND r."isLongTerm" = false
        AND r.status IN ('IN_PROGRESS', 'DONE')
        AND r."createdAtSource" < ${thirtyDaysAgo}
      GROUP BY r."createdByName"
      ORDER BY count DESC
    `;

    // 收集所有客服名称
    const allAgents = new Set<string>();
    const addAgents = (rows: Array<{ agentName: string; count: bigint }>) =>
      rows.forEach((r) => allAgents.add(r.agentName));
    addAgents(agentRequirementCreatedRows);
    addAgents(agentRequirementCompletedRows);
    addAgents(agentRequirementRejectedRows);
    addAgents(agentLongTermRows);
    addAgents(agentBugCreatedRows);
    addAgents(agentBugCompletedRows);
    addAgents(agentBugRejectedRows);
    addAgents(agentBugLongTermRows);
    addAgents(agentOver7NotAdoptedRows);
    addAgents(agentOver30NotClosedReqRows);
    addAgents(agentOver30NotClosedBugRows);

    // 构建 Map 工具
    const buildMap = (rows: Array<{ agentName: string; count: bigint }>) => {
      const map = new Map<string, number>();
      for (const row of rows) {
        map.set(row.agentName, Number(row.count));
      }
      return map;
    };

    const createdMap = buildMap(agentRequirementCreatedRows);
    const completedMap = buildMap(agentRequirementCompletedRows);
    const rejectedMap = buildMap(agentRequirementRejectedRows);
    const longTermMap = buildMap(agentLongTermRows);
    const bugCreatedMap = buildMap(agentBugCreatedRows);
    const bugCompletedMap = buildMap(agentBugCompletedRows);
    const bugRejectedMap = buildMap(agentBugRejectedRows);
    const bugLongTermMap = buildMap(agentBugLongTermRows);
    const over7NotAdoptedMap = buildMap(agentOver7NotAdoptedRows);
    const over30NotClosedReqMap = buildMap(agentOver30NotClosedReqRows);
    const over30NotClosedBugMap = buildMap(agentOver30NotClosedBugRows);

    const rows = Array.from(allAgents).map((agentName) => {
      const reqCreated = createdMap.get(agentName) ?? 0;
      const reqCompleted = completedMap.get(agentName) ?? 0;
      const reqRejected = rejectedMap.get(agentName) ?? 0;
      const reqLongTerm = longTermMap.get(agentName) ?? 0;
      const bugCreated = bugCreatedMap.get(agentName) ?? 0;
      const bugCompleted = bugCompletedMap.get(agentName) ?? 0;
      const bugRejected = bugRejectedMap.get(agentName) ?? 0;
      const bugLongTerm = bugLongTermMap.get(agentName) ?? 0;
      const over7NotAdopted = over7NotAdoptedMap.get(agentName) ?? 0;
      const over30NotClosedReq = over30NotClosedReqMap.get(agentName) ?? 0;
      const over30NotClosedBug = over30NotClosedBugMap.get(agentName) ?? 0;

      const reqEffectiveTotal = reqCreated - reqLongTerm;
      const reqCompletionRate = reqEffectiveTotal > 0
        ? (reqCompleted + reqRejected) / reqEffectiveTotal
        : 0;
      const bugEffectiveTotal = bugCreated - bugLongTerm;
      const bugCompletionRate = bugEffectiveTotal > 0
        ? (bugCompleted + bugRejected) / bugEffectiveTotal
        : 0;

      return {
        agentName,
        reqCreated,
        reqCompleted,
        reqRejected,
        reqLongTerm,
        reqCompletionRate,
        bugCreated,
        bugCompleted,
        bugRejected,
        bugLongTerm,
        bugCompletionRate,
        over7NotAdopted,
        over30NotClosedReq,
        over30NotClosedBug,
      };
    });

    // 按需求总数降序排列
    rows.sort((a, b) => b.reqCreated - a.reqCreated);

    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      rows,
    };
  }

  private truncateDate(date: Date, granularity: 'day' | 'week' | 'month') {
    const d = new Date(date);
    if (granularity === 'month') {
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (granularity === 'week') {
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private addStep(date: Date, granularity: 'day' | 'week' | 'month') {
    const d = new Date(date);
    if (granularity === 'month') {
      d.setMonth(d.getMonth() + 1);
      return d;
    }
    if (granularity === 'week') {
      d.setDate(d.getDate() + 7);
      return d;
    }
    d.setDate(d.getDate() + 1);
    return d;
  }

  private formatLabel(date: Date, granularity: 'day' | 'week' | 'month') {
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (granularity === 'month') {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
    }
    if (granularity === 'week') {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}(周)`;
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  async getConsultationFunnel(
    startDate?: string,
    endDate?: string,
    granularity: 'day' | 'week' | 'month' = 'day',
  ) {
    const { start, end } = this.resolveRange(startDate, endDate);
    console.log('[funnel-debug] resolveRange:', { startDate, endDate, start: start.toISOString(), end: end.toISOString() });

    // 使用 Prisma ORM 查询 UdescSession 统计数据
    const sessions = await this.prisma.udescSession.findMany({
      where: {
        startedAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        startedAt: true,
        rating: true,
        messages: {
          select: { content: true },
          where: {
            OR: [
              { content: { contains: '问题' } },
              { content: { contains: '报错' } },
              { content: { contains: '异常' } },
              { content: { contains: '故障' } },
              { content: { contains: '失败' } },
              { content: { contains: 'bug' } },
            ],
          },
          take: 1,
        },
      },
    });
    console.log('[funnel-debug] sessions count:', sessions.length);

    // 2. 查询关联的需求数据
    const requirements = await this.prisma.zouwuRequirement.findMany({
      where: {
        sourceSessionId: { not: null },
        createdAtSource: { gte: start, lte: end },
      },
      select: {
        sourceSessionId: true,
        status: true,
      },
    });
    // 按 sessionId 聚合需求状态
    const reqMap = new Map<string, { hasRequirement: boolean; isCompleted: boolean; isReleased: boolean }>();
    for (const req of requirements) {
      if (!req.sourceSessionId) continue;
      const existing = reqMap.get(req.sourceSessionId) ?? { hasRequirement: false, isCompleted: false, isReleased: false };
      existing.hasRequirement = true;
      if (req.status === 'DONE' || req.status === 'CLOSED') existing.isCompleted = true;
      if (req.status === 'CLOSED') existing.isReleased = true;
      reqMap.set(req.sourceSessionId, existing);
    }

    // 分组聚合（按日/周/月）
    const periodMap = new Map<string, {
      consultationCount: number;
      issueConsultCount: number;
      feedbackCount: number;
      requirementIdentifiedCount: number;
      requirementCompletedCount: number;
      releaseCount: number;
    }>();

    for (const session of sessions) {
      const truncated = this.truncateDate(session.startedAt, granularity);
      const key = truncated.toISOString();
      const isIssue = session.messages.length > 0;
      const hasFeedback = session.rating !== null;
      const reqInfo = reqMap.get(session.id);

      if (!periodMap.has(key)) {
        periodMap.set(key, {
          consultationCount: 0,
          issueConsultCount: 0,
          feedbackCount: 0,
          requirementIdentifiedCount: 0,
          requirementCompletedCount: 0,
          releaseCount: 0,
        });
      }
      const entry = periodMap.get(key)!;
      entry.consultationCount++;
      if (isIssue) {
        entry.issueConsultCount++;
        if (hasFeedback) {
          entry.feedbackCount++;
        }
        // 需求相关统计（仅对有问题的会话）
        if (reqInfo?.hasRequirement) {
          entry.requirementIdentifiedCount++;
          if (reqInfo.isCompleted) entry.requirementCompletedCount++;
          if (reqInfo.isReleased) entry.releaseCount++;
        }
      }
    }

    // 构建 periods 数组
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
      const existing = periodMap.get(key);
      periods.push({
        periodStart: key,
        periodLabel: this.formatLabel(cursor, granularity),
        consultationCount: existing?.consultationCount ?? 0,
        issueConsultCount: existing?.issueConsultCount ?? 0,
        feedbackCount: existing?.feedbackCount ?? 0,
        requirementIdentifiedCount: existing?.requirementIdentifiedCount ?? 0,
        requirementCompletedCount: existing?.requirementCompletedCount ?? 0,
        releaseCount: existing?.releaseCount ?? 0,
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

  async getProductModuleDistribution(
    startDate?: string,
    endDate?: string,
    issueType?: '0' | '1',
  ) {
    const { start, end } = this.resolveRange(startDate, endDate);

    // 从 rawPayload JSONB 中提取模块信息，尝试多个常见字段名
    const rows = await this.prisma.$queryRaw<
      Array<{ module: string; count: bigint }>
    >`
      SELECT
        COALESCE(
          NULLIF(r."rawPayload"->>'moduleName', ''),
          NULLIF(r."rawPayload"->>'module', ''),
          NULLIF(r."rawPayload"->>'productModule', ''),
          NULLIF(r."rawPayload"->>'categoryName', ''),
          NULLIF(r."rawPayload"->>'category', ''),
          NULLIF(r."rawPayload"->>'productLine', ''),
          NULLIF(r."rawPayload"->>'belongModule', ''),
          NULLIF(r."rawPayload"->>'businessLine', ''),
          '未分类'
        ) AS module,
        COUNT(*)::bigint AS count
      FROM "ZouwuRequirement" r
      WHERE r."createdAtSource" >= ${start}
        AND r."createdAtSource" <= ${end}
        ${issueType ? (issueType === '1' ? Prisma.sql`AND r."issueType" = 1` : Prisma.sql`AND (r."issueType" IS NULL OR r."issueType" != 1)`) : Prisma.sql``}
      GROUP BY module
      ORDER BY count DESC
    `;

    const total = rows.reduce((sum, row) => sum + Number(row.count), 0);

    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      total,
      distribution: rows.map((row) => ({
        module: row.module,
        count: Number(row.count),
        percentage: total > 0 ? Number(row.count) / total : 0,
      })),
    };
  }
}
