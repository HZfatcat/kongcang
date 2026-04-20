import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface LogQueryParams {
  level?: string;
  module?: string;
  source?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  byModule: Record<string, number>;
}

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLogs(params: LogQueryParams) {
    const {
      level,
      module,
      source,
      startDate,
      endDate,
      search,
      page = 1,
      pageSize = 50,
    } = params;

    const where: any = {};

    if (level) {
      where.level = level;
    }
    if (module) {
      where.module = module;
    }
    if (source) {
      where.source = source;
    }
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }
    if (search) {
      where.OR = [
        { message: { contains: search, mode: 'insensitive' } },
        { context: { string_contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.systemLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.systemLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getLogStats(params: { startDate?: Date; endDate?: Date }): Promise<LogStats> {
    const { startDate, endDate } = params;

    const where: any = {};
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const [total, levelStats, moduleStats] = await Promise.all([
      this.prisma.systemLog.count({ where }),
      this.prisma.systemLog.groupBy({
        by: ['level'],
        where,
        _count: true,
      }),
      this.prisma.systemLog.groupBy({
        by: ['module'],
        where,
        _count: true,
      }),
    ]);

    return {
      total,
      byLevel: levelStats.reduce((acc: Record<string, number>, item) => {
        acc[item.level] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byModule: moduleStats.reduce((acc: Record<string, number>, item) => {
        if (item.module) {
          acc[item.module] = item._count;
        }
        return acc;
      }, {} as Record<string, number>),
    };
  }

  async getLogById(id: string) {
    return this.prisma.systemLog.findUnique({
      where: { id },
    });
  }

  async clearLogs(beforeDate: Date) {
    return this.prisma.systemLog.deleteMany({
      where: {
        timestamp: { lt: beforeDate },
      },
    });
  }
}
