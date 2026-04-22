import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, RequirementStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { UdescClient } from './udesc.client';
import { ZouwuClient } from './zouwu.client';

interface SyncProgressSnapshot {
  source: string;
  isRunning: boolean;
  runId?: string;
  startedAt?: string;
  finishedAt?: string;
  currentWindowStart?: string;
  currentWindowEnd?: string;
  totalWindows: number;
  processedWindows: number;
  sessionSynced: number;
  messageSynced: number;
  voteSynced: number;
  customerSynced: number;
  agentSynced: number;
  metricsSynced: number;
  issueCount: number;
  estimatedRemainingRecords: number;
  estimatedRemainingSeconds: number;
  note?: string;
}

interface UpdateSyncConfigPayload {
  enabled?: boolean;
  intervalHours?: number;
}

interface ZouwuFeedbackStatisticsQuery {
  start?: string;
  end?: string;
  token?: string;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private zouwuRunning = false;
  private readonly progress: SyncProgressSnapshot = {
    source: 'udesc',
    isRunning: false,
    totalWindows: 0,
    processedWindows: 0,
    sessionSynced: 0,
    messageSynced: 0,
    voteSynced: 0,
    customerSynced: 0,
    agentSynced: 0,
    metricsSynced: 0,
    issueCount: 0,
    estimatedRemainingRecords: 0,
    estimatedRemainingSeconds: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly udescClient: UdescClient,
    private readonly zouwuClient: ZouwuClient,
  ) {}

  private asJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    if (!value) {
      return undefined;
    }
    return value as Prisma.InputJsonValue;
  }

  private asDateOrNull(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }
    // Udesk API 返回的时间可能是 "2026-04-22T09:58:58Z" 格式
    // 但实际表示北京时间，不是 UTC。需要移除 Z 后按本地时间解析
    let normalized = value.trim();
    const isUTCSuffix = normalized.endsWith('Z');
    if (isUTCSuffix) {
      // 移除 Z，按本地时间解析
      normalized = normalized.slice(0, -1);
    }
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date;
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const maxAttempts = Number(process.env.SYNC_RETRY_MAX_ATTEMPTS ?? 3);
    const baseDelay = Number(process.env.SYNC_RETRY_BASE_DELAY_MS ?? 1000);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`${label} attempt ${attempt}/${maxAttempts} failed: ${message}`);
        if (attempt < maxAttempts) {
          await this.sleep(baseDelay * attempt);
        }
      }
    }

    throw lastError;
  }

  private async recordIssue(params: {
    runId: string;
    source: string;
    category: string;
    externalId?: string;
    payload?: Record<string, unknown>;
    errorMessage: string;
  }) {
    await this.prisma.syncIssue.create({
      data: {
        runId: params.runId,
        source: params.source,
        category: params.category,
        externalId: params.externalId,
        payload: this.asJson(params.payload),
        errorMessage: params.errorMessage,
      },
    });
  }

  private resolveUdescStartDate(): Date {
    const configured = process.env.UDESC_SYNC_START_DATE ?? '2026-01-01T00:00:00.000Z';
    const value = new Date(configured);
    if (Number.isNaN(value.getTime())) {
      throw new Error(`UDESC_SYNC_START_DATE 非法: ${configured}`);
    }
    return value;
  }

  private resolveProviderEarliestDate(now: Date): Date {
    const maxLookbackDays = Number(process.env.UDESC_PROVIDER_MAX_LOOKBACK_DAYS ?? 30);
    const earliest = new Date(now);
    earliest.setUTCDate(earliest.getUTCDate() - Math.max(1, maxLookbackDays));
    return earliest;
  }

  private estimateWindowCount(start: Date, end: Date, windowDays: number) {
    const ms = Math.max(0, end.getTime() - start.getTime() + 1);
    const eachWindowMs = windowDays * 24 * 60 * 60 * 1000;
    return Math.max(1, Math.ceil(ms / eachWindowMs));
  }

  private toWindowEnd(start: Date, maxEnd: Date, windowDays: number): Date {
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + windowDays);
    end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
    return end > maxEnd ? maxEnd : end;
  }

  private buildDateRange() {
    const explicitStart = process.env.SYNC_START_DATE;
    const end = new Date();
    if (explicitStart) {
      const start = new Date(explicitStart);
      return { start, end };
    }
    const lookbackDays = Number(process.env.SYNC_LOOKBACK_DAYS ?? 30);
    const start = new Date(end.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    return { start, end };
  }

  private resolveZouwuStatsWindow(query: ZouwuFeedbackStatisticsQuery) {
    const defaultStart = process.env.ZOUWU_STATS_DEFAULT_START ?? '2026-01-01 00:00:00';
    const defaultEnd = process.env.ZOUWU_STATS_DEFAULT_END ?? '2026-04-10 23:59:59';
    const startCreatedTime = query.start?.trim() || defaultStart;
    const endCreatedTime = query.end?.trim() || defaultEnd;
    return {
      startCreatedTime,
      endCreatedTime,
      tokenOverride: query.token?.trim() || undefined,
    };
  }

  private async startRun(source: string) {
    return this.prisma.syncRun.create({
      data: {
        source,
        status: 'RUNNING',
      },
    });
  }

  private async finishRun(
    runId: string,
    payload: { status: string; message?: string; recordsSynced: number },
  ) {
    return this.prisma.syncRun.update({
      where: { id: runId },
      data: {
        status: payload.status,
        message: payload.message,
        recordsSynced: payload.recordsSynced,
        finishedAt: new Date(),
      },
    });
  }

  async syncUdesc() {
    if (this.progress.isRunning) {
      throw new Error('udesc sync is already running');
    }

    const run = await this.startRun('udesc');
    let sessionSynced = 0;
    let messageSynced = 0;
    let voteSynced = 0;
    let customerSynced = 0;
    let agentSynced = 0;
    let metricsSynced = 0;
    let issueCount = 0;
    const syncStartedAt = new Date();

    try {
      const checkpoint = await this.prisma.syncCheckpoint.findUnique({
        where: { source: 'udesc' },
      });
      const finalEnd = new Date();
      const startDate = this.resolveUdescStartDate();
      const providerEarliest = this.resolveProviderEarliestDate(finalEnd);
      let windowStart = checkpoint?.cursor ? new Date(checkpoint.cursor) : startDate;
      if (Number.isNaN(windowStart.getTime()) || windowStart < startDate) {
        windowStart = startDate;
      }
      if (windowStart < providerEarliest) {
        issueCount += 1;
        await this.recordIssue({
          runId: run.id,
          source: 'udesc',
          category: 'PROVIDER_LIMIT',
          errorMessage: `udesc 当前仅支持最近时间窗口，已自动从 ${providerEarliest.toISOString()} 开始同步`,
        });
        windowStart = providerEarliest;
      }

      const windowDays = Math.max(1, Number(process.env.UDESC_SYNC_WINDOW_DAYS ?? 1));
      const pageSize = Number(process.env.UDESC_SYNC_PAGE_SIZE ?? 100);
      const syncLogs = (process.env.UDESC_SYNC_FETCH_LOGS ?? 'true').toLowerCase() !== 'false';
      const logPageSize = Number(process.env.UDESC_LOG_SYNC_PAGE_SIZE ?? 100);
      const logMaxPagesPerSession = Number(process.env.UDESC_LOG_MAX_PAGES_PER_SESSION ?? 10);
      const totalWindows = this.estimateWindowCount(windowStart, finalEnd, windowDays);

      this.progress.isRunning = true;
      this.progress.runId = run.id;
      this.progress.startedAt = syncStartedAt.toISOString();
      this.progress.finishedAt = undefined;
      this.progress.totalWindows = totalWindows;
      this.progress.processedWindows = 0;
      this.progress.sessionSynced = 0;
      this.progress.messageSynced = 0;
      this.progress.voteSynced = 0;
      this.progress.customerSynced = 0;
      this.progress.agentSynced = 0;
      this.progress.metricsSynced = 0;
      this.progress.issueCount = issueCount;
      this.progress.currentWindowStart = windowStart.toISOString();
      this.progress.currentWindowEnd = undefined;
      this.progress.estimatedRemainingRecords = 0;
      this.progress.estimatedRemainingSeconds = 0;
      this.progress.note = '同步中';

      while (windowStart <= finalEnd) {
        const windowEnd = this.toWindowEnd(windowStart, finalEnd, windowDays);
        this.progress.currentWindowStart = windowStart.toISOString();
        this.progress.currentWindowEnd = windowEnd.toISOString();
        this.logger.log(
          `udesc sync window ${windowStart.toISOString()} -> ${windowEnd.toISOString()}`,
        );

        let pageCursor: string | undefined = undefined;
        let hasMore = true;

        while (hasMore) {
          const resp = await this.withRetry('udesc.fetchSessions', () =>
            this.udescClient.fetchSessions({
              cursor: pageCursor,
              pageSize,
              startDate: windowStart.toISOString(),
              endDate: windowEnd.toISOString(),
            }),
          );

          for (const record of resp.records) {
            const startedAt = this.asDateOrNull(record.startedAt);
            if (!record.id || !startedAt) {
              issueCount += 1;
              await this.recordIssue({
                runId: run.id,
                source: 'udesc',
                category: 'SESSION_VALIDATE',
                externalId: record.id,
                payload: record.rawPayload,
                errorMessage: '会话缺少有效 id 或 startedAt',
              });
              this.progress.issueCount = issueCount;
              continue;
            }

            try {
              await this.prisma.udescSession.upsert({
                where: { id: record.id },
                create: {
                  id: record.id,
                  agentId: record.agentId,
                  startedAt,
                  endedAt: this.asDateOrNull(record.endedAt),
                  rating: record.rating ?? null,
                  isConsultToDemand: record.isConsultToDemand ?? false,
                  updatedAtSource: this.asDateOrNull(record.updatedAt),
                  rawPayload: this.asJson(record.rawPayload),
                },
                update: {
                  agentId: record.agentId,
                  startedAt,
                  endedAt: this.asDateOrNull(record.endedAt),
                  rating: record.rating ?? null,
                  isConsultToDemand: record.isConsultToDemand ?? false,
                  updatedAtSource: this.asDateOrNull(record.updatedAt),
                  rawPayload: this.asJson(record.rawPayload),
                  syncedAt: new Date(),
                },
              });
              sessionSynced += 1;
            } catch (error) {
              issueCount += 1;
              const message = error instanceof Error ? error.message : String(error);
              await this.recordIssue({
                runId: run.id,
                source: 'udesc',
                category: 'SESSION_UPSERT',
                externalId: record.id,
                payload: record.rawPayload,
                errorMessage: message,
              });
              this.progress.issueCount = issueCount;
              continue;
            }

            // 同步会话评价详情
            try {
              const voteResp = await this.withRetry('udesc.fetchSessionVotes', () =>
                this.udescClient.fetchSessionVotes({
                  sessionId: record.id,
                  pageSize: 10,
                }),
              );
              for (const vote of voteResp.records) {
                try {
                  // 查找该会话的评价记录
                  const existing = await this.prisma.udescSessionVote.findFirst({
                    where: { sessionId: record.id },
                  });
                  if (existing) {
                    await this.prisma.udescSessionVote.update({
                      where: { id: existing.id },
                      data: {
                        rating: vote.rating ?? null,
                        tags: vote.tags ?? [],
                        comment: vote.comment ?? null,
                        voterId: vote.voterId ?? null,
                        voterName: vote.voterName ?? null,
                        votedAt: this.asDateOrNull(vote.votedAt),
                        rawPayload: this.asJson(vote.rawPayload),
                      },
                    });
                  } else {
                    await this.prisma.udescSessionVote.create({
                      data: {
                        sessionId: record.id,
                        rating: vote.rating ?? null,
                        tags: vote.tags ?? [],
                        comment: vote.comment ?? null,
                        voterId: vote.voterId ?? null,
                        voterName: vote.voterName ?? null,
                        votedAt: this.asDateOrNull(vote.votedAt),
                        rawPayload: this.asJson(vote.rawPayload),
                      },
                    });
                  }
                  voteSynced += 1;
                } catch (e) {
                  // ignore individual vote errors
                }
                break; // 每会话只处理第一条评价
              }
            } catch (e) {
              // vote sync is optional
            }

            // 同步会话统计指标
            try {
              const stats = await this.withRetry('udesc.fetchSessionStats', () =>
                this.udescClient.fetchSessionStats(record.id),
              );
              if (stats) {
                await this.prisma.udescSessionMetrics.upsert({
                  where: { sessionId: record.id },
                  create: {
                    sessionId: record.id,
                    firstResponseTime: stats.firstResponseTime ?? null,
                    avgResponseTime: stats.avgResponseTime ?? null,
                    waitTime: stats.waitTime ?? null,
                    resolutionTime: stats.resolutionTime ?? null,
                    messageCount: stats.messageCount ?? 0,
                    customerMessageCount: stats.customerMessageCount ?? 0,
                    agentMessageCount: stats.agentMessageCount ?? 0,
                  },
                  update: {
                    firstResponseTime: stats.firstResponseTime ?? null,
                    avgResponseTime: stats.avgResponseTime ?? null,
                    waitTime: stats.waitTime ?? null,
                    resolutionTime: stats.resolutionTime ?? null,
                    messageCount: stats.messageCount ?? 0,
                    customerMessageCount: stats.customerMessageCount ?? 0,
                    agentMessageCount: stats.agentMessageCount ?? 0,
                  },
                });
                metricsSynced += 1;
              }
            } catch (e) {
              // metrics sync is optional
            }

            if (!syncLogs) {
              continue;
            }

            let logCursor: string | undefined = undefined;
            let logHasMore = true;
            let logPageCount = 0;

            while (logHasMore && logPageCount < logMaxPagesPerSession) {
              try {
                const logResp = await this.withRetry('udesc.fetchSessionLogs', () =>
                  this.udescClient.fetchSessionLogs({
                    sessionId: record.id,
                    cursor: logCursor,
                    pageSize: logPageSize,
                    startDate: windowStart.toISOString(),
                    endDate: windowEnd.toISOString(),
                  }),
                );

                for (const messageRecord of logResp.records) {
                  const sentAt = this.asDateOrNull(messageRecord.sentAt);
                  if (!messageRecord.id || !sentAt) {
                    issueCount += 1;
                    await this.recordIssue({
                      runId: run.id,
                      source: 'udesc',
                      category: 'MESSAGE_VALIDATE',
                      externalId: messageRecord.id,
                      payload: messageRecord.rawPayload,
                      errorMessage: '消息缺少有效 id 或 sentAt',
                    });
                    this.progress.issueCount = issueCount;
                    continue;
                  }

                  try {
                    await this.prisma.udescSessionMessage.upsert({
                      where: { id: messageRecord.id },
                      create: {
                        id: messageRecord.id,
                        sessionId: record.id,
                        sentAt,
                        senderType: messageRecord.senderType,
                        senderId: messageRecord.senderId,
                        content: messageRecord.content,
                        rawPayload: this.asJson(messageRecord.rawPayload),
                      },
                      update: {
                        sentAt,
                        senderType: messageRecord.senderType,
                        senderId: messageRecord.senderId,
                        content: messageRecord.content,
                        rawPayload: this.asJson(messageRecord.rawPayload),
                        syncedAt: new Date(),
                      },
                    });
                    messageSynced += 1;
                  } catch (error) {
                    issueCount += 1;
                    const upsertError = error instanceof Error ? error.message : String(error);
                    await this.recordIssue({
                      runId: run.id,
                      source: 'udesc',
                      category: 'MESSAGE_UPSERT',
                      externalId: messageRecord.id,
                      payload: messageRecord.rawPayload,
                      errorMessage: upsertError,
                    });
                    this.progress.issueCount = issueCount;
                  }
                }

                logCursor = logResp.nextCursor;
                logHasMore = logResp.hasMore && Boolean(logCursor);
                logPageCount += 1;
              } catch (error) {
                issueCount += 1;
                const message = error instanceof Error ? error.message : String(error);
                await this.recordIssue({
                  runId: run.id,
                  source: 'udesc',
                  category: 'MESSAGE_FETCH',
                  externalId: record.id,
                  errorMessage: message,
                });
                this.progress.issueCount = issueCount;
                break;
              }
            }
          }

          pageCursor = resp.nextCursor;
          hasMore = resp.hasMore && Boolean(pageCursor);
        }

        const nextWindowStart = new Date(windowEnd.getTime() + 1);
        await this.prisma.syncCheckpoint.upsert({
          where: { source: 'udesc' },
          create: {
            source: 'udesc',
            cursor: nextWindowStart.toISOString(),
            lastSyncedAt: new Date(),
          },
          update: {
            cursor: nextWindowStart.toISOString(),
            lastSyncedAt: new Date(),
          },
        });

        this.progress.sessionSynced = sessionSynced;
        this.progress.messageSynced = messageSynced;
        this.progress.voteSynced = voteSynced;
        this.progress.customerSynced = customerSynced;
        this.progress.agentSynced = agentSynced;
        this.progress.metricsSynced = metricsSynced;
        this.progress.issueCount = issueCount;
        this.progress.processedWindows += 1;
        const elapsedSeconds = Math.max(1, Math.floor((Date.now() - syncStartedAt.getTime()) / 1000));
        const doneWindows = Math.max(1, this.progress.processedWindows);
        const remainingWindows = Math.max(0, this.progress.totalWindows - this.progress.processedWindows);
        const avgRecordsPerWindow = (sessionSynced + messageSynced + voteSynced + metricsSynced) / doneWindows;
        const avgSecondsPerWindow = elapsedSeconds / doneWindows;
        this.progress.estimatedRemainingRecords = Math.max(
          0,
          Math.round(avgRecordsPerWindow * remainingWindows),
        );
        this.progress.estimatedRemainingSeconds = Math.max(
          0,
          Math.round(avgSecondsPerWindow * remainingWindows),
        );

        windowStart = nextWindowStart;
      }

      // 同步客户信息
      this.progress.note = '同步客户信息';
      try {
        let customerCursor: string | undefined = undefined;
        let customerHasMore = true;
        while (customerHasMore) {
          const customerResp = await this.withRetry('udesc.fetchCustomers', () =>
            this.udescClient.fetchCustomers({
              cursor: customerCursor,
              pageSize: 100,
            }),
          );
          for (const customer of customerResp.records) {
            if (!customer.id) continue;
            try {
              await this.prisma.udescCustomer.upsert({
                where: { id: customer.id },
                create: {
                  id: customer.id,
                  name: customer.name ?? null,
                  phone: customer.phone ?? null,
                  email: customer.email ?? null,
                  wechat: customer.wechat ?? null,
                  enterprise: customer.enterprise ?? null,
                  tags: customer.tags ?? [],
                  customFields: this.asJson(customer.customFields),
                  rawPayload: this.asJson(customer.rawPayload),
                },
                update: {
                  name: customer.name ?? null,
                  phone: customer.phone ?? null,
                  email: customer.email ?? null,
                  wechat: customer.wechat ?? null,
                  enterprise: customer.enterprise ?? null,
                  tags: customer.tags ?? [],
                  customFields: this.asJson(customer.customFields),
                  rawPayload: this.asJson(customer.rawPayload),
                },
              });
              customerSynced += 1;
            } catch (e) {
              // ignore individual customer errors
            }
          }
          customerCursor = customerResp.nextCursor;
          customerHasMore = customerResp.hasMore && Boolean(customerCursor);
        }
        this.progress.customerSynced = customerSynced;
      } catch (e) {
        this.logger.warn('customer sync failed, continuing');
      }

      // 同步客服信息
      this.progress.note = '同步客服信息';
      try {
        let agentCursor: string | undefined = undefined;
        let agentHasMore = true;
        while (agentHasMore) {
          const agentResp = await this.withRetry('udesc.fetchAgents', () =>
            this.udescClient.fetchAgents({
              cursor: agentCursor,
              pageSize: 100,
            }),
          );
          for (const agent of agentResp.records) {
            if (!agent.id) continue;
            try {
              await this.prisma.udescAgent.upsert({
                where: { id: agent.id },
                create: {
                  id: agent.id,
                  name: agent.name ?? null,
                  email: agent.email ?? null,
                  phone: agent.phone ?? null,
                  roleId: agent.roleId ?? null,
                  roleName: agent.roleName ?? null,
                  enabled: agent.enabled ?? true,
                  groups: agent.groups ?? [],
                  skills: agent.skills ?? [],
                  rawPayload: this.asJson(agent.rawPayload),
                },
                update: {
                  name: agent.name ?? null,
                  email: agent.email ?? null,
                  phone: agent.phone ?? null,
                  roleId: agent.roleId ?? null,
                  roleName: agent.roleName ?? null,
                  enabled: agent.enabled ?? true,
                  groups: agent.groups ?? [],
                  skills: agent.skills ?? [],
                  rawPayload: this.asJson(agent.rawPayload),
                },
              });
              // 同步到 AgentProfile 表，确保前端能获取到客服名字
              if (agent.name) {
                await this.prisma.agentProfile.upsert({
                  where: { agentId: agent.id },
                  create: {
                    agentId: agent.id,
                    displayName: agent.name,
                    enabled: agent.enabled ?? true,
                  },
                  update: {
                    displayName: agent.name,
                    enabled: agent.enabled ?? true,
                  },
                });
              }
              agentSynced += 1;
            } catch (e) {
              // ignore individual agent errors
            }
          }
          agentCursor = agentResp.nextCursor;
          agentHasMore = agentResp.hasMore && Boolean(agentCursor);
        }
        this.progress.agentSynced = agentSynced;
      } catch (e) {
        this.logger.warn('agent sync failed, continuing');
      }

      await this.finishRun(run.id, {
        status: 'SUCCESS',
        recordsSynced: sessionSynced + messageSynced + voteSynced + customerSynced + agentSynced + metricsSynced,
        message: `sessions=${sessionSynced},messages=${messageSynced},votes=${voteSynced},customers=${customerSynced},agents=${agentSynced},metrics=${metricsSynced},issues=${issueCount}`,
      });

      this.progress.isRunning = false;
      this.progress.finishedAt = new Date().toISOString();
      this.progress.currentWindowStart = undefined;
      this.progress.currentWindowEnd = undefined;
      this.progress.estimatedRemainingRecords = 0;
      this.progress.estimatedRemainingSeconds = 0;
      this.progress.note = '同步完成';
      return { source: 'udesc', sessionSynced, messageSynced, voteSynced, customerSynced, agentSynced, metricsSynced, issueCount };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`sync udesc failed: ${message}`);
      await this.finishRun(run.id, {
        status: 'FAILED',
        recordsSynced: sessionSynced + messageSynced + voteSynced + customerSynced + agentSynced + metricsSynced,
        message,
      });

      this.progress.isRunning = false;
      this.progress.finishedAt = new Date().toISOString();
      this.progress.note = `同步失败: ${message}`;
      throw error;
    }
  }

  async syncZouwu(options?: { startDate?: Date; endDate?: Date; resetCursor?: boolean }) {
    if (this.zouwuRunning) {
      throw new Error('zouwu sync is already running');
    }
    this.zouwuRunning = true;
    const run = await this.startRun('zouwu');
    let recordsSynced = 0;

    try {
      // 如果指定了日期范围，使用指定范围；否则使用 checkpoint 增量同步
      const checkpoint = options?.resetCursor ? null : await this.prisma.syncCheckpoint.findUnique({
        where: { source: 'zouwu' },
      });
      const pageSize = Number(process.env.ZOUWU_SYNC_PAGE_SIZE ?? 100);
      
      const start = options?.startDate ?? (checkpoint?.lastSyncedAt ? new Date(checkpoint.lastSyncedAt) : this.buildDateRange().start);
      const end = options?.endDate ?? new Date();
      
      let cursor = options?.resetCursor ? undefined : (checkpoint?.cursor ?? undefined);
      let hasMore = true;

      while (hasMore) {
        const resp = await this.zouwuClient.fetchRequirements({
          cursor,
          pageSize,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        });

        if (resp.records.length > 0) {
          await this.prisma.$transaction(
            resp.records.map((record) =>
              this.prisma.zouwuRequirement.upsert({
                where: { id: record.id },
                create: {
                  id: record.id,
                  title: record.title,
                  sourceSessionId: record.sourceSessionId,
                  issueType: record.issueType,
                  status: RequirementStatus[record.status],
                  isLongTerm: record.isLongTerm ?? false,
                  createdById: record.createdById,
                  createdByName: record.createdByName,
                  createdAtSource: new Date(record.createdAt),
                  completedAtSource: record.completedAt ? new Date(record.completedAt) : null,
                  updatedAtSource: record.updatedAt ? new Date(record.updatedAt) : null,
                  rawPayload: this.asJson(record.rawPayload),
                },
                update: {
                  title: record.title,
                  sourceSessionId: record.sourceSessionId,
                  issueType: record.issueType,
                  status: RequirementStatus[record.status],
                  isLongTerm: record.isLongTerm ?? false,
                  createdById: record.createdById,
                  createdByName: record.createdByName,
                  createdAtSource: new Date(record.createdAt),
                  completedAtSource: record.completedAt ? new Date(record.completedAt) : null,
                  updatedAtSource: record.updatedAt ? new Date(record.updatedAt) : null,
                  rawPayload: this.asJson(record.rawPayload),
                  syncedAt: new Date(),
                },
              }),
            ),
          );
        }

        recordsSynced += resp.records.length;
        cursor = resp.nextCursor;
        hasMore = resp.hasMore;

        if (!hasMore) {
          await this.prisma.syncCheckpoint.upsert({
            where: { source: 'zouwu' },
            create: {
              source: 'zouwu',
              cursor,
              lastSyncedAt: new Date(),
            },
            update: {
              cursor,
              lastSyncedAt: new Date(),
            },
          });
        }

        if (!cursor) {
          hasMore = false;
        }
      }

      await this.finishRun(run.id, { status: 'SUCCESS', recordsSynced });
      return { source: 'zouwu', recordsSynced };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`sync zouwu failed: ${message}`);
      await this.finishRun(run.id, { status: 'FAILED', recordsSynced, message });
      throw error;
    } finally {
      this.zouwuRunning = false;
    }
  }

  async syncAll() {
    const enableZouwu = (process.env.SYNC_ENABLE_ZOUWU ?? 'false').toLowerCase() === 'true';
    const udesc = await this.syncUdesc();
    const zouwu = enableZouwu ? await this.syncZouwu() : null;
    return { udesc, zouwu };
  }

  async getZouwuFeedbackStatistics(query: ZouwuFeedbackStatisticsQuery) {
    const params = this.resolveZouwuStatsWindow(query);
    try {
      return await this.zouwuClient.getFeedbackStatistics(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取驺吾统计失败';
      throw new BadRequestException(message);
    }
  }

  async getSyncConfig(source: string) {
    const config = await this.prisma.syncConfig.findUnique({
      where: { source },
    });
    if (config) {
      return config;
    }
    return this.prisma.syncConfig.create({
      data: {
        source,
        enabled: true,
        intervalHours: 1,
      },
    });
  }

  async updateSyncConfig(source: string, payload: UpdateSyncConfigPayload) {
    const intervalHours =
      payload.intervalHours !== undefined
        ? Math.max(1, Math.min(168, Math.floor(payload.intervalHours)))
        : undefined;
    return this.prisma.syncConfig.upsert({
      where: { source },
      create: {
        source,
        enabled: payload.enabled ?? true,
        intervalHours: intervalHours ?? 1,
      },
      update: {
        ...(payload.enabled !== undefined ? { enabled: payload.enabled } : {}),
        ...(intervalHours !== undefined ? { intervalHours } : {}),
      },
    });
  }

  async getUdescSyncSummary() {
    const [totalSessions, totalMessages, issueCount, latestRun, checkpoint] = await this.prisma.$transaction([
      this.prisma.udescSession.count(),
      this.prisma.udescSessionMessage.count(),
      this.prisma.syncIssue.count({ where: { source: 'udesc' } }),
      this.prisma.syncRun.findFirst({
        where: { source: 'udesc' },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.syncCheckpoint.findUnique({
        where: { source: 'udesc' },
      }),
    ]);

    const latestSuccessRun = await this.prisma.syncRun.findFirst({
      where: { source: 'udesc', status: 'SUCCESS' },
      orderBy: { finishedAt: 'desc' },
    });

    return {
      source: 'udesc',
      totalSessions,
      totalMessages,
      totalRecords: totalSessions + totalMessages,
      issueCount,
      latestSuccessAt: latestSuccessRun?.finishedAt ?? null,
      latestRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            startedAt: latestRun.startedAt,
            finishedAt: latestRun.finishedAt,
            recordsSynced: latestRun.recordsSynced,
            message: latestRun.message,
          }
        : null,
      checkpoint: checkpoint
        ? {
            cursor: checkpoint.cursor,
            lastSyncedAt: checkpoint.lastSyncedAt,
          }
        : null,
    };
  }

  async triggerScheduledUdescSync() {
    const config = await this.getSyncConfig('udesc');
    if (!config.enabled) {
      return { accepted: false, reason: 'disabled', config };
    }

    if (this.progress.isRunning) {
      return { accepted: false, reason: 'running', config };
    }

    const latestRun = await this.prisma.syncRun.findFirst({
      where: {
        source: 'udesc',
        status: 'SUCCESS',
      },
      orderBy: { finishedAt: 'desc' },
    });

    const now = Date.now();
    const lastFinished = latestRun?.finishedAt?.getTime() ?? 0;
    const intervalMs = config.intervalHours * 60 * 60 * 1000;
    const due = now - lastFinished >= intervalMs;

    if (!due && latestRun?.finishedAt) {
      return {
        accepted: false,
        reason: 'not_due',
        config,
        nextRunAt: new Date(lastFinished + intervalMs).toISOString(),
      };
    }

    return this.triggerUdescSync();
  }

  async triggerScheduledZouwuSync() {
    const config = await this.getSyncConfig('zouwu');
    if (!config.enabled) {
      return { accepted: false, reason: 'disabled', config };
    }

    if (this.zouwuRunning) {
      return { accepted: false, reason: 'running', config };
    }

    const latestRun = await this.prisma.syncRun.findFirst({
      where: {
        source: 'zouwu',
        status: 'SUCCESS',
      },
      orderBy: { finishedAt: 'desc' },
    });

    const now = Date.now();
    const lastFinished = latestRun?.finishedAt?.getTime() ?? 0;
    const intervalMs = config.intervalHours * 60 * 60 * 1000;
    const due = now - lastFinished >= intervalMs;

    if (!due && latestRun?.finishedAt) {
      return {
        accepted: false,
        reason: 'not_due',
        config,
        nextRunAt: new Date(lastFinished + intervalMs).toISOString(),
      };
    }

    return this.triggerZouwuSync();
  }

  getUdescProgress() {
    return { ...this.progress };
  }

  triggerUdescSync() {
    if (this.progress.isRunning) {
      return {
        accepted: false,
        reason: 'running',
        progress: this.getUdescProgress(),
      };
    }

    void this.syncUdesc().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`triggered udesc sync failed: ${message}`);
    });

    return {
      accepted: true,
      progress: this.getUdescProgress(),
    };
  }

  triggerZouwuSync(options?: { startDate?: Date; endDate?: Date; resetCursor?: boolean }) {
    if (this.zouwuRunning) {
      return {
        accepted: false,
        reason: 'running',
      };
    }

    void this.syncZouwu(options).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`triggered zouwu sync failed: ${message}`);
    });

    return {
      accepted: true,
      startDate: options?.startDate?.toISOString(),
      endDate: options?.endDate?.toISOString(),
    };
  }

  async retryFailedIssues() {
    const latestIssues = await this.prisma.syncIssue.findMany({
      where: { source: 'udesc' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    if (latestIssues.length === 0) {
      return {
        accepted: false,
        reason: 'no_issues',
        issueCount: 0,
      };
    }

    const rewindDays = Math.max(1, Number(process.env.SYNC_RETRY_REWIND_DAYS ?? 3));
    const checkpoint = await this.prisma.syncCheckpoint.findUnique({
      where: { source: 'udesc' },
    });

    const now = new Date();
    const providerEarliest = this.resolveProviderEarliestDate(now);
    const baseCursor = checkpoint?.cursor ? new Date(checkpoint.cursor) : now;
    const rewindCursor = new Date(baseCursor);
    rewindCursor.setUTCDate(rewindCursor.getUTCDate() - rewindDays);
    const adjustedCursor = rewindCursor < providerEarliest ? providerEarliest : rewindCursor;

    await this.prisma.syncCheckpoint.upsert({
      where: { source: 'udesc' },
      create: {
        source: 'udesc',
        cursor: adjustedCursor.toISOString(),
        lastSyncedAt: null,
      },
      update: {
        cursor: adjustedCursor.toISOString(),
        lastSyncedAt: null,
      },
    });

    const trigger = this.triggerUdescSync();
    return {
      accepted: trigger.accepted,
      reason: trigger.accepted ? 'retry_started' : 'running',
      issueCount: latestIssues.length,
      rewindCursor: adjustedCursor.toISOString(),
      progress: trigger.progress,
    };
  }
}
