import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { UpsertAgentDto } from './agents.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.agentProfile.findMany({
      orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async listUdescAgentIds() {
    const rows = await this.prisma.udescSession.findMany({
      where: {
        agentId: { not: null },
      },
      distinct: ['agentId'],
      select: { agentId: true },
      orderBy: { agentId: 'asc' },
    });
    return rows
      .map((row) => row.agentId)
      .filter((value): value is string => Boolean(value));
  }

  upsert(payload: UpsertAgentDto) {
    return this.prisma.agentProfile.upsert({
      where: { agentId: payload.agentId },
      create: {
        agentId: payload.agentId,
        displayName: payload.displayName,
        team: payload.team,
        role: payload.role,
        enabled: payload.enabled ?? true,
        remark: payload.remark,
      },
      update: {
        displayName: payload.displayName,
        team: payload.team,
        role: payload.role,
        enabled: payload.enabled ?? true,
        remark: payload.remark,
      },
    });
  }

  remove(agentId: string) {
    return this.prisma.agentProfile.delete({
      where: { agentId },
    });
  }
}
