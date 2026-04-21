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
      // 新增字段
      username: payload.username,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      companyName: payload.companyName,
      requestType: payload.requestType,
      requestDetails: payload.requestDetails,
      feedbackChannel: payload.feedbackChannel,
      feedbackPerson: payload.feedbackPerson,
      feedbackResult: payload.feedbackResult,
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

  async importFromCsv(records: Record<string, string>[]) {
    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2; // CSV 第1行是表头

      try {
        // 提取各字段
        const username = row['用户名'] || row['username'] || '';
        const name = row['姓名'] || row['name'] || '';
        const phone = row['手机号'] || row['phone'] || '';
        const email = row['邮箱'] || row['email'] || '';
        const companyName = row['公司名称'] || row['companyName'] || '';
        const requestType = row['诉求类型'] || row['requestType'] || '';
        const requestDetails = row['诉求详情'] || row['requestDetails'] || '';
        const feedbackChannel = row['反馈渠道'] || row['feedbackChannel'] || '';
        const feedbackPerson = row['反馈人'] || row['feedbackPerson'] || '';
        const feedbackResult = row['反馈结果'] || row['feedbackResult'] || '';

        // 检查是否为空行（所有关键字段都为空）
        if (!username && !name && !phone && !email && !companyName && !requestType && !requestDetails) {
          continue;
        }

        // 标题为空时自动生成：诉求类型-公司名称-姓名
        let title = row['标题'] || row['title'] || '';
        if (!title) {
          const parts = [requestType, companyName, name].filter(Boolean);
          title = parts.length > 0 ? parts.join('-') : `商机-${Date.now()}-${i}`;
        }

        const data = {
          title,
          username: username || null,
          name: name || null,
          phone: phone || null,
          email: email || null,
          companyName: companyName || null,
          requestType: requestType || null,
          requestDetails: requestDetails || null,
          feedbackChannel: feedbackChannel || null,
          feedbackPerson: feedbackPerson || null,
          feedbackResult: feedbackResult || null,
          sourceType: OpportunitySourceType.MANUAL,
          status: OpportunityStatus.NEW,
        };

        await this.prisma.businessOpportunity.create({ data });
        results.success++;
      } catch (error) {
        results.failed++;
        const errMsg = error instanceof Error ? error.message : String(error);
        results.errors.push(`第${rowNum}行: ${errMsg}`);
      }
    }

    return results;
  }
}
