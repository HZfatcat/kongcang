import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { UpsertAgentDto } from './agents.dto';
import { UdescClient } from '../sync/udesc.client';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly udescClient: UdescClient,
  ) {}

  async list() {
    const profiles = await this.prisma.agentProfile.findMany({
      orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
    });

    // 如果 agentProfile 表为空，从 synced session 中提取客服数据作为降级
    if (profiles.length === 0) {
      const rows = await this.prisma.udescSession.findMany({
        where: { agentId: { not: null } },
        select: { agentId: true },
        distinct: ['agentId'],
      });
      const agentIds = rows
        .map((r) => r.agentId)
        .filter((id): id is string => Boolean(id));

      // 从 udeskAgent 表中获取客服姓名（如果有的话）
      const agentNames = new Map<string, string>();
      if (agentIds.length > 0) {
        const agents = await this.prisma.udescAgent.findMany({
          where: { id: { in: agentIds }, name: { not: null } },
          select: { id: true, name: true },
        });
        for (const a of agents) {
          if (a.name) agentNames.set(a.id, a.name);
        }

        // 如果 udeskAgent 表中没有记录，直接从 Udesk API 获取客服信息
        if (agents.length === 0) {
          try {
            this.logger.log('udeskAgent 表为空，从 Udesk API 获取客服姓名');
            let cursor: string | undefined = undefined;
            let hasMore = true;
            while (hasMore) {
              const resp = await this.udescClient.fetchAgents({
                cursor,
                pageSize: 100,
              });
              for (const agent of resp.records) {
                if (agent.id && agent.name) {
                  agentNames.set(agent.id, agent.name);
                  // 缓存到 udeskAgent 表
                  await this.prisma.udescAgent.upsert({
                    where: { id: agent.id },
                    create: {
                      id: agent.id,
                      name: agent.name,
                      email: agent.email ?? null,
                      phone: agent.phone ?? null,
                      roleId: agent.roleId ?? null,
                      roleName: agent.roleName ?? null,
                      enabled: agent.enabled ?? true,
                      groups: agent.groups ?? [],
                      skills: agent.skills ?? [],
                      rawPayload: (agent.rawPayload ?? undefined) as any,
                    },
                    update: {
                      name: agent.name,
                      email: agent.email ?? null,
                      phone: agent.phone ?? null,
                      roleId: agent.roleId ?? null,
                      roleName: agent.roleName ?? null,
                      enabled: agent.enabled ?? true,
                      groups: agent.groups ?? [],
                      skills: agent.skills ?? [],
                      rawPayload: (agent.rawPayload ?? undefined) as any,
                    },
                  });
                }
              }
              cursor = resp.nextCursor;
              hasMore = resp.hasMore && Boolean(cursor);
            }
            this.logger.log(`从 Udesk API 获取了 ${agentNames.size} 个客服姓名`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.warn(`从 Udesk API 获取客服姓名失败: ${msg}`);
          }
        }
      }

      return agentIds.map((agentId) => ({
        agentId,
        displayName: agentNames.get(agentId) ?? agentId,
        enabled: true,
        team: null,
        role: null,
        createdAt: null,
        updatedAt: null,
        remark: null,
      }));
    }

    return profiles;
  }

  async listUdeskAgentIds() {
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
