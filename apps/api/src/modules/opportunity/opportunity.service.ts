import { Injectable } from '@nestjs/common';
import { OpportunitySourceType, OpportunityStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  OpportunityQueryDto,
  UpdateOpportunityStatusDto,
  UpsertOpportunityDto,
} from './opportunity.dto';

@Injectable()
export class OpportunityService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveRange(startDate?: string, endDate?: string) {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 1000 * 60 * 60 * 24 * 30);
    return { start, end };
  }

  async list(query: OpportunityQueryDto) {
    const { start, end } = this.resolveRange(query.startDate, query.endDate);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where = {
      createdAt: { gte: start, lte: end },
      ...(query.status ? { status: query.status } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(query.agentId ? { agentId: query.agentId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword, mode: 'insensitive' as const } },
              { description: { contains: query.keyword, mode: 'insensitive' as const } },
              { customerName: { contains: query.keyword, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.businessOpportunity.count({ where }),
      this.prisma.businessOpportunity.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      records: rows.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        closedAt: item.closedAt?.toISOString(),
      })),
    };
  }

  async summary(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate);
    const baseWhere = { createdAt: { gte: start, lte: end } };
    const [total, won, lost, consulting, manual, statusGroups] = await Promise.all([
      this.prisma.businessOpportunity.count({ where: baseWhere }),
      this.prisma.businessOpportunity.count({
        where: { ...baseWhere, status: OpportunityStatus.WON },
      }),
      this.prisma.businessOpportunity.count({
        where: { ...baseWhere, status: OpportunityStatus.LOST },
      }),
      this.prisma.businessOpportunity.count({
        where: { ...baseWhere, sourceType: OpportunitySourceType.CONSULTATION },
      }),
      this.prisma.businessOpportunity.count({
        where: { ...baseWhere, sourceType: OpportunitySourceType.MANUAL },
      }),
      this.prisma.businessOpportunity.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { id: true },
      }),
    ]);

    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      total,
      won,
      lost,
      winRate: total > 0 ? won / total : 0,
      consultingLinked: consulting,
      manualCreated: manual,
      statusBreakdown: statusGroups.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {}),
    };
  }

  upsert(payload: UpsertOpportunityDto) {
    const sourceType =
      payload.sourceType ??
      (payload.sourceSessionId ? OpportunitySourceType.CONSULTATION : OpportunitySourceType.MANUAL);
    const status = payload.status ?? OpportunityStatus.NEW;
    const data = {
      title: payload.title,
      description: payload.description,
      sourceType,
      sourceSessionId: payload.sourceSessionId,
      agentId: payload.agentId,
      customerName: payload.customerName,
      contactInfo: payload.contactInfo,
      estimatedAmount: payload.estimatedAmount,
      status,
      nextAction: payload.nextAction,
      ...(status === OpportunityStatus.WON || status === OpportunityStatus.LOST
        ? { closedAt: new Date() }
        : {}),
    };

    if (payload.id) {
      return this.prisma.businessOpportunity.update({
        where: { id: payload.id },
        data,
      });
    }

    return this.prisma.businessOpportunity.create({
      data,
    });
  }

  updateStatus(id: string, payload: UpdateOpportunityStatusDto) {
    return this.prisma.businessOpportunity.update({
      where: { id },
      data: {
        status: payload.status,
        closeReason: payload.closeReason,
        closedAt:
          payload.status === OpportunityStatus.WON || payload.status === OpportunityStatus.LOST
            ? new Date()
            : null,
      },
    });
  }

  remove(id: string) {
    return this.prisma.businessOpportunity.delete({
      where: { id },
    });
  }
}
