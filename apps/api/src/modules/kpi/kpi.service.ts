import { Injectable } from '@nestjs/common';
import { RequirementStatus } from '@prisma/client';
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
}
