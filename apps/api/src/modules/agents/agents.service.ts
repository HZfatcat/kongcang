import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { UpsertAgentDto } from './agents.dto';
import axios from 'axios';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const profiles = await this.prisma.agentProfile.findMany({
      orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
    });
    if (profiles.length > 0) return profiles;
    // 后备：从 udescSession 表中提取 distinct agentId
    const sessionIds = await this.prisma.udescSession.findMany({
      where: { agentId: { not: null } },
      distinct: ['agentId'],
      select: { agentId: true },
      orderBy: { agentId: 'asc' },
    });
    const ids = sessionIds
      .map((r) => r.agentId)
      .filter((v): v is string => Boolean(v));
    // 尝试从 UdescAgent 表获取名字
    const agents = await this.prisma.udescAgent.findMany({
      where: { id: { in: ids } },
    });
    const nameMap = new Map(agents.map((a) => [a.id, a.name]));

    // 对于仍未找到名字的 ID，尝试通过 Udesk OpenAPI 获取
    const unresolved = ids.filter((id) => !nameMap.has(id) || !nameMap.get(id));
    if (unresolved.length > 0) {
      const udescBaseUrl = process.env.UDESC_BASE_URL;
      if (udescBaseUrl && !udescBaseUrl.includes('example.com')) {
        try {
          const resp = await axios.get(`${udescBaseUrl}/agents`, {
            params: { page: 1, page_size: 100 },
          });
          const data = (resp.data ?? {}) as Record<string, unknown>;
          const items = (Array.isArray(data?.data) ? data.data : Array.isArray(data?.list) ? data.list : Array.isArray(data?.records) ? data.records : []) as Array<Record<string, unknown>>;
          for (const item of items) {
            const id = String(item.id ?? item.agent_id ?? item.user_id ?? '');
            const name = String(item.name ?? item.nick_name ?? item.nickname ?? item.display_name ?? '');
            if (id && name) {
              if (!nameMap.has(id)) {
                nameMap.set(id, name);
              }
            }
          }
        } catch (e) {
          this.logger.warn('Failed to fetch agent names from Udesk API: ' + (e instanceof Error ? e.message : String(e)));
        }
      }
    }

    return ids.map((id) => ({
      agentId: id,
      displayName: nameMap.get(id) ?? id,
      enabled: true,
      createdAt: '',
      updatedAt: '',
    }));
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
