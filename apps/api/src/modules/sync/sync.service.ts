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
  organizationSynced: number;
  ticketSynced: number;
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
    organizationSynced: 0,
    ticketSynced: 0,
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

  private async markIssueResolved(params: { source: string; category: string; externalId: string }) {
    await this.prisma.syncIssue.updateMany({
      where: {
        source: params.source,
        category: params.category,
        externalId: params.externalId,
        resolvedAt: null,
      },
      data: {
        resolvedAt: new Date(),
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
    let organizationSynced = 0;
    let ticketSynced = 0;
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
              // 标记之前的失败记录为已解决
              await this.markIssueResolved({
                source: 'udesc',
                category: 'SESSION_UPSERT',
                externalId: record.id,
              });
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

            // 评价同步移至会话同步完成后独立处理（im/sessions/vote API 不支持 session_id 过滤）

            // 会话统计指标在消息同步完成后从本地消息计算，不调用第三方接口

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

                    // 检测评价消息，更新评价记录的真实评价时间
                    // 评价消息特征：content 包含 "type":"survey" 且包含 "客户评价"
                    try {
                      const rawPayload = messageRecord.rawPayload;
                      const content = rawPayload?.['content'];
                      if (typeof content === 'string' && content.includes('"type":"survey"') && content.includes('客户评价')) {
                        const surveyOptionId = rawPayload?.['survey_option_id'];
                        if (surveyOptionId) {
                          // 找到对应的评价记录，更新 votedAt 为真实评价时间
                          await this.prisma.$executeRaw`
                            UPDATE "UdescSessionVote"
                            SET "votedAt" = ${sentAt}, "syncedAt" = NOW()
                            WHERE "sessionId" = ${record.id}
                              AND "rawPayload"::text LIKE ${'%"survey_option_id":' + String(surveyOptionId) + '%'}
                              AND ("votedAt" IS NULL OR "votedAt" != ${sentAt})
                          `;
                        }
                      }
                    } catch {
                      // 评价时间更新失败不影响主流程
                    }
                    // 标记之前的失败记录为已解决
                    await this.markIssueResolved({
                      source: 'udesc',
                      category: 'MESSAGE_UPSERT',
                      externalId: messageRecord.id,
                    });
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

      // 同步评价信息（im/sessions/vote API 只支持 30 天内的数据，需用窗口方式同步）
      this.progress.note = '同步评价信息';
      console.log('[SYNC] 开始同步评价信息:', { startDate: startDate.toISOString(), endDate: finalEnd.toISOString() });
      try {
        // Vote API 只支持 30 天，使用 25 天窗口确保不超限
        const voteWindowDays = 25;
        let voteWindowStart = new Date(finalEnd);
        const voteEarliest = this.resolveProviderEarliestDate(new Date());

        while (voteWindowStart > voteEarliest) {
          const voteWindowEnd = new Date(voteWindowStart);
          const voteWindowStartActual = new Date(voteWindowStart);
          voteWindowStartActual.setUTCDate(voteWindowStartActual.getUTCDate() - voteWindowDays);
          if (voteWindowStartActual < voteEarliest) {
            voteWindowStartActual.setTime(voteEarliest.getTime());
          }

          console.log('[SYNC] vote window:', { start: voteWindowStartActual.toISOString(), end: voteWindowEnd.toISOString() });

          let voteCursor: string | undefined = undefined;
          let voteHasMore = true;
          while (voteHasMore) {
            const voteResp = await this.withRetry('udesc.fetchSessionVotes', () =>
              this.udescClient.fetchSessionVotes({
                cursor: voteCursor,
                pageSize: 100,
                startDate: voteWindowStartActual.toISOString(),
                endDate: voteWindowEnd.toISOString(),
              }),
            );
            console.log('[SYNC] vote page result:', { records: voteResp.records.length, hasMore: voteResp.hasMore });

            for (const vote of voteResp.records) {
              if (!vote.sessionId) continue;
              try {
                await this.prisma.udescSessionVote.upsert({
                  where: { id: vote.id },
                  create: {
                    id: vote.id,
                    sessionId: vote.sessionId,
                    rating: vote.rating ?? null,
                    tags: vote.tags ?? [],
                    comment: vote.comment ?? null,
                    voterId: vote.voterId ?? null,
                    voterName: vote.voterName ?? null,
                    votedAt: this.asDateOrNull(vote.votedAt),
                    rawPayload: this.asJson(vote.rawPayload),
                  },
                  update: {
                    rating: vote.rating ?? null,
                    tags: vote.tags ?? [],
                    comment: vote.comment ?? null,
                    voterId: vote.voterId ?? null,
                    voterName: vote.voterName ?? null,
                    votedAt: this.asDateOrNull(vote.votedAt),
                    rawPayload: this.asJson(vote.rawPayload),
                  },
                });
                if (vote.rating !== undefined && vote.rating !== null) {
                  await this.prisma.udescSession.update({
                    where: { id: vote.sessionId },
                    data: { rating: vote.rating },
                  }).catch(() => { /* session may not exist */ });
                }
                voteSynced += 1;
              } catch (e) {
                // ignore individual vote errors
              }
            }
            voteCursor = voteResp.nextCursor;
            voteHasMore = voteResp.hasMore;
          }

          voteWindowStart = new Date(voteWindowStartActual);
          voteWindowStart.setUTCMilliseconds(voteWindowStart.getUTCMilliseconds() - 1);
        }
        this.progress.voteSynced = voteSynced;
      } catch (e) {
        this.logger.warn('vote sync failed, continuing');
      }

      // 评价同步完成后，从消息表中更新真实评价时间
      // 消息同步时已获取会话日志，其中包含真实评价时间
      this.progress.note = '更新评价时间';
      try {
        // JSONB 转 text 后双引号会被转义，需用更宽松的匹配
        const voteTimeUpdates = await this.prisma.$executeRaw`
          UPDATE "UdescSessionVote" v
          SET "votedAt" = m."sentAt", "syncedAt" = NOW()
          FROM "UdescSessionMessage" m
          WHERE m."sessionId" = v."sessionId"
            AND m."rawPayload"::text LIKE '%"type":%survey%'
            AND m."rawPayload"::text LIKE '%客户评价%'
            AND (v."votedAt" IS NULL OR v."votedAt" != m."sentAt")
        `;
        if (voteTimeUpdates > 0) {
          this.logger.log(`Updated ${voteTimeUpdates} vote timestamps from message logs`);
        }
      } catch (e) {
        this.logger.warn('vote timestamp update failed, continuing');
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
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`agent sync failed: ${msg}`);
      }

      // 同步客户公司/组织
      this.progress.note = '同步客户公司';
      try {
        let orgCursor: string | undefined = undefined;
        let orgHasMore = true;
        while (orgHasMore) {
          const orgResp = await this.withRetry('udesc.fetchOrganizations', () =>
            this.udescClient.fetchOrganizations({
              cursor: orgCursor,
              pageSize: 100,
            }),
          );
          for (const org of orgResp.records) {
            if (!org.id) continue;
            try {
              await this.prisma.udescOrganization.upsert({
                where: { id: org.id },
                create: {
                  id: org.id,
                  name: org.name ?? null,
                  domains: org.domains ?? null,
                  level: org.level ?? null,
                  description: org.description ?? null,
                  token: org.token ?? null,
                  customFields: this.asJson(org.customFields),
                  rawPayload: this.asJson(org.rawPayload),
                },
                update: {
                  name: org.name ?? null,
                  domains: org.domains ?? null,
                  level: org.level ?? null,
                  description: org.description ?? null,
                  token: org.token ?? null,
                  customFields: this.asJson(org.customFields),
                  rawPayload: this.asJson(org.rawPayload),
                },
              });
              organizationSynced += 1;
            } catch (e) {
              // ignore individual org errors
            }
          }
          orgCursor = orgResp.nextCursor;
          orgHasMore = orgResp.hasMore && Boolean(orgCursor);
        }
        this.progress.organizationSynced = organizationSynced;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`organization sync failed: ${msg}`);
      }

      // 同步工单
      this.progress.note = '同步工单';
      try {
        let ticketCursor: string | undefined = undefined;
        let ticketHasMore = true;
        while (ticketHasMore) {
          const ticketResp = await this.withRetry('udesc.fetchTickets', () =>
            this.udescClient.fetchTickets({
              cursor: ticketCursor,
              pageSize: 100,
            }),
          );
          for (const ticket of ticketResp.records) {
            if (!ticket.id) continue;
            try {
              await this.prisma.udescTicket.upsert({
                where: { id: ticket.id },
                create: {
                  id: ticket.id,
                  fieldNum: ticket.fieldNum ?? null,
                  subject: ticket.subject ?? null,
                  content: ticket.content ?? null,
                  source: ticket.source ?? null,
                  contentType: ticket.contentType ?? null,
                  userId: ticket.userId ?? null,
                  userName: ticket.userName ?? null,
                  userEmail: ticket.userEmail ?? null,
                  userCellphone: ticket.userCellphone ?? null,
                  organizationId: ticket.organizationId ?? null,
                  assigneeId: ticket.assigneeId ?? null,
                  assigneeName: ticket.assigneeName ?? null,
                  assigneeAvatar: ticket.assigneeAvatar ?? null,
                  userGroupId: ticket.userGroupId ?? null,
                  userGroupName: ticket.userGroupName ?? null,
                  templateId: ticket.templateId ?? null,
                  priority: ticket.priority ?? null,
                  status: ticket.status ?? null,
                  statusEn: ticket.statusEn ?? null,
                  platform: ticket.platform ?? null,
                  satisfaction: ticket.satisfaction ?? null,
                  customFields: this.asJson(ticket.customFields),
                  tags: ticket.tags ?? null,
                  creatorId: ticket.creatorId ?? null,
                  imSubSessionId: ticket.imSubSessionId ?? null,
                  conversationId: ticket.conversationId ?? null,
                  createdAt: this.asDateOrNull(ticket.createdAt),
                  updatedAt: this.asDateOrNull(ticket.updatedAt),
                  solvingAt: this.asDateOrNull(ticket.solvingAt),
                  resolvedAt: this.asDateOrNull(ticket.resolvedAt),
                  closedAt: this.asDateOrNull(ticket.closedAt),
                  solvedDeadline: this.asDateOrNull(ticket.solvedDeadline),
                  repliedAt: this.asDateOrNull(ticket.repliedAt),
                  agentRepliedAt: this.asDateOrNull(ticket.agentRepliedAt),
                  customerRepliedAt: this.asDateOrNull(ticket.customerRepliedAt),
                  firstRepliedAt: this.asDateOrNull(ticket.firstRepliedAt),
                  repliedBy: ticket.repliedBy ?? null,
                  rawPayload: this.asJson(ticket.rawPayload),
                },
                update: {
                  fieldNum: ticket.fieldNum ?? null,
                  subject: ticket.subject ?? null,
                  content: ticket.content ?? null,
                  source: ticket.source ?? null,
                  contentType: ticket.contentType ?? null,
                  userId: ticket.userId ?? null,
                  userName: ticket.userName ?? null,
                  userEmail: ticket.userEmail ?? null,
                  userCellphone: ticket.userCellphone ?? null,
                  organizationId: ticket.organizationId ?? null,
                  assigneeId: ticket.assigneeId ?? null,
                  assigneeName: ticket.assigneeName ?? null,
                  assigneeAvatar: ticket.assigneeAvatar ?? null,
                  userGroupId: ticket.userGroupId ?? null,
                  userGroupName: ticket.userGroupName ?? null,
                  templateId: ticket.templateId ?? null,
                  priority: ticket.priority ?? null,
                  status: ticket.status ?? null,
                  statusEn: ticket.statusEn ?? null,
                  platform: ticket.platform ?? null,
                  satisfaction: ticket.satisfaction ?? null,
                  customFields: this.asJson(ticket.customFields),
                  tags: ticket.tags ?? null,
                  creatorId: ticket.creatorId ?? null,
                  imSubSessionId: ticket.imSubSessionId ?? null,
                  conversationId: ticket.conversationId ?? null,
                  createdAt: this.asDateOrNull(ticket.createdAt),
                  updatedAt: this.asDateOrNull(ticket.updatedAt),
                  solvingAt: this.asDateOrNull(ticket.solvingAt),
                  resolvedAt: this.asDateOrNull(ticket.resolvedAt),
                  closedAt: this.asDateOrNull(ticket.closedAt),
                  solvedDeadline: this.asDateOrNull(ticket.solvedDeadline),
                  repliedAt: this.asDateOrNull(ticket.repliedAt),
                  agentRepliedAt: this.asDateOrNull(ticket.agentRepliedAt),
                  customerRepliedAt: this.asDateOrNull(ticket.customerRepliedAt),
                  firstRepliedAt: this.asDateOrNull(ticket.firstRepliedAt),
                  repliedBy: ticket.repliedBy ?? null,
                  rawPayload: this.asJson(ticket.rawPayload),
                },
              });
              ticketSynced += 1;
            } catch (e) {
              // ignore individual ticket errors
            }
          }
          ticketCursor = ticketResp.nextCursor;
          ticketHasMore = ticketResp.hasMore && Boolean(ticketCursor);
        }
        this.progress.ticketSynced = ticketSynced;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`ticket sync failed: ${msg}`);
      }

      // 从本地消息计算会话指标（不调用第三方接口）
      this.progress.note = '计算会话指标';
      metricsSynced = await this.calculateSessionMetricsFromLocal();
      this.progress.metricsSynced = metricsSynced;

      await this.finishRun(run.id, {
        status: 'SUCCESS',
        recordsSynced: sessionSynced + messageSynced + voteSynced + customerSynced + agentSynced + metricsSynced + organizationSynced + ticketSynced,
        message: `sessions=${sessionSynced},messages=${messageSynced},votes=${voteSynced},customers=${customerSynced},agents=${agentSynced},metrics=${metricsSynced},organizations=${organizationSynced},tickets=${ticketSynced},issues=${issueCount}`,
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
        recordsSynced: sessionSynced + messageSynced + voteSynced + customerSynced + agentSynced + metricsSynced + organizationSynced + ticketSynced,
        message,
      });

      this.progress.isRunning = false;
      this.progress.note = `同步失败: ${message}`;
      throw error;
    }
  }

  /**
   * 重新计算所有会话指标
   */
  async recalculateMetrics(): Promise<number> {
    this.logger.log('手动触发重新计算会话指标...');
    return this.calculateSessionMetricsFromLocal();
  }

  /**
   * 从 Udesk 原始数据同步会话指标，并用本地消息记录验证修正
   */
  private async calculateSessionMetricsFromLocal(): Promise<number> {
    this.logger.log('开始从 Udesk 原始数据同步会话指标...');
    
    const sessions = await this.prisma.udescSession.findMany();

    let count = 0;
    for (const session of sessions) {
      const rawPayload = session.rawPayload as Record<string, unknown> | null;

      // 先统计实际消息数量（用于验证 UDesk 数据）
      const actualMessages = await this.prisma.udescSessionMessage.groupBy({
        by: ['senderType'],
        where: { sessionId: session.id },
        _count: true,
      });
      
      const actualAgentMsgCount = actualMessages.find(m => m.senderType === 'agent')?._count ?? 0;
      const actualCustomerMsgCount = actualMessages.find(m => m.senderType === 'customer')?._count ?? 0;

      // 从 Udesk 原始数据提取指标
      let firstResponseTime: number | null = null;
      let avgResponseTime: number | null = null;
      let waitTime: number | null = null;
      let resolutionTime: number | null = null;
      let messageCount = 0;
      let agentMessageCount = actualAgentMsgCount;
      let customerMessageCount = actualCustomerMsgCount;

      // 从 rawPayload 提取
      if (rawPayload) {
        const extractNumber = (value: unknown): number | null => {
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? null : parsed;
          }
          return null;
        };

        const respSeconds = extractNumber(rawPayload.resp_seconds);
        const avgRespSeconds = extractNumber(rawPayload.avg_resp_seconds);
        const sustainSeconds = extractNumber(rawPayload.sustain_seconds);
        const queueSeconds = extractNumber(rawPayload.queue_seconds);

        // 只有当实际有客户消息时，才计算首次响应时间
        if (actualCustomerMsgCount > 0) {
          // UDesk 数据可能不准确：resp_seconds=0 但实际有时间间隔
          if (respSeconds !== null && respSeconds > 0) {
            // UDesk 数据有效，直接使用
            firstResponseTime = respSeconds;
          } else {
            // UDesk 数据为 0 或无效，从本地消息记录计算
            const firstCustomerMsg = await this.prisma.udescSessionMessage.findFirst({
              where: { sessionId: session.id, senderType: 'customer' },
              orderBy: { sentAt: 'asc' },
              select: { sentAt: true },
            });
            const firstAgentMsg = await this.prisma.udescSessionMessage.findFirst({
              where: { sessionId: session.id, senderType: 'agent' },
              orderBy: { sentAt: 'asc' },
              select: { sentAt: true },
            });
            if (firstCustomerMsg && firstAgentMsg) {
              const diffMs = firstAgentMsg.sentAt.getTime() - firstCustomerMsg.sentAt.getTime();
              if (diffMs > 0) {
                firstResponseTime = Math.floor(diffMs / 1000);
              }
            }
            // 客户有消息但客服未回复，首次响应时间设为 100 小时
            if (firstCustomerMsg && !firstAgentMsg) {
              firstResponseTime = 100 * 60 * 60; // 360000 秒 = 100 小时
            }
          }
        }
        if (avgRespSeconds !== null && avgRespSeconds > 0) {
          avgResponseTime = avgRespSeconds;
        }
        if (sustainSeconds !== null && sustainSeconds > 0) {
          resolutionTime = sustainSeconds;
        }
        // queue_seconds 可能是 "未排队" 字符串，此时 extractNumber 返回 null
        if (queueSeconds !== null && queueSeconds >= 0) {
          waitTime = queueSeconds;
        }

        // 消息总数 = 实际客服消息数 + 实际客户消息数
        messageCount = actualAgentMsgCount + actualCustomerMsgCount;
      }

      await this.prisma.udescSessionMetrics.upsert({
        where: { sessionId: session.id },
        create: {
          sessionId: session.id,
          firstResponseTime,
          avgResponseTime,
          waitTime,
          resolutionTime,
          messageCount,
          agentMessageCount,
          customerMessageCount,
        },
        update: {
          firstResponseTime,
          avgResponseTime,
          waitTime,
          resolutionTime,
          messageCount,
          agentMessageCount,
          customerMessageCount,
        },
      });
      count++;
    }

    this.logger.log(`会话指标同步完成，共 ${count} 条`);
    return count;
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
    const enableZouwu = (process.env.SYNC_ENABLE_ZOUWU ?? 'true').toLowerCase() === 'true';
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

  /**
   * 清空 Udesk 全部数据
   */
  async clearUdescData() {
    this.logger.log('开始清空 Udesk 数据...');

    // 按顺序删除，避免外键约束问题
    const votes = await this.prisma.udescSessionVote.deleteMany({});
    const metrics = await this.prisma.udescSessionMetrics.deleteMany({});
    const messages = await this.prisma.udescSessionMessage.deleteMany({});
    const opportunities = await this.prisma.businessOpportunity.deleteMany({});
    const sessions = await this.prisma.udescSession.deleteMany({});
    const customers = await this.prisma.udescCustomer.deleteMany({});
    const agents = await this.prisma.udescAgent.deleteMany({});
    const organizations = await this.prisma.udescOrganization.deleteMany({});
    const tickets = await this.prisma.udescTicket.deleteMany({});
    const checkpoints = await this.prisma.syncCheckpoint.deleteMany({ where: { source: 'udesc' } });

    // 重置进度
    this.progress.sessionSynced = 0;
    this.progress.messageSynced = 0;
    this.progress.voteSynced = 0;
    this.progress.customerSynced = 0;
    this.progress.agentSynced = 0;

    this.logger.log('Udesk 数据清空完成');

    return {
      votes: votes.count,
      messages: messages.count,
      sessions: sessions.count,
      customers: customers.count,
      agents: agents.count,
      organizations: organizations.count,
      tickets: tickets.count,
      checkpoints: checkpoints.count,
    };
  }

  /**
   * 智能修复数据 - 检测并删除各类错误数据
   * 同步时会自动补齐缺失数据
   */
  async smartFix() {
    this.logger.log('开始智能修复数据...');

    let fixedVotes = 0;
    let fixedMessages = 0;
    let fixedSessions = 0;
    let fixedVoteTimes = 0;
    let fixedSystemMessages = 0;
    let fixedMetricsSessions = 0;

    // 1. 修复评价数据：删除 id = sessionId 的错误记录
    const wrongVotes = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "UdescSessionVote" WHERE id = "sessionId"
    `;
    fixedVotes = wrongVotes.length;
    if (fixedVotes > 0) {
      await this.prisma.$executeRaw`
        DELETE FROM "UdescSessionVote" WHERE id = "sessionId"
      `;
      this.logger.log(`已删除 ${fixedVotes} 条错误评价记录`);
    }

    // 2. 修复评价时间：从消息表中获取真实评价时间
    // votedAt 应该等于消息表中的 sentAt（客户的评价消息）
    fixedVoteTimes = await this.prisma.$executeRaw`
      UPDATE "UdescSessionVote" v
      SET "votedAt" = m."sentAt", "syncedAt" = NOW()
      FROM "UdescSessionMessage" m
      WHERE m."sessionId" = v."sessionId"
        AND m."rawPayload"::text LIKE '%survey%'
        AND m."rawPayload"::text LIKE '%客户评价%'
        AND (v."votedAt" IS NULL OR v."votedAt" != m."sentAt")
    `;
    if (fixedVoteTimes > 0) {
      this.logger.log(`已修复 ${fixedVoteTimes} 条评价时间`);
    }

    // 3. 修复系统消息 senderType：将系统自动发送的消息从 agent/customer 改为 system
    // 系统消息特征：由系统自动发送的提示、超时、会话关闭、满意度调查等，不属于人工交互消息
    this.logger.log('开始修复系统消息 senderType...');
    const systemMsgKeywords = [
      '%接入人工服务%',
      '%有新的咨询进来了%',
      '%长时间未响应%',
      '%超时未回复%',
      '%系统将自动结束会话%',
      '%关闭会话%',
      '%满意度调查%',
      '%系统发送%',
      '%已为您转接%',
      '%正在为您转接%',
      '%转接至%',
      '%会话已结束%',
      '%会话已关闭%',
      '%客服已离线%',
      '%客服已上线%',
    ];
    for (const keyword of systemMsgKeywords) {
      const result = await this.prisma.$executeRaw`
        UPDATE "UdescSessionMessage"
        SET "senderType" = 'system', "syncedAt" = NOW()
        WHERE "senderType" IN ('agent', 'customer')
          AND "content" ILIKE ${keyword}
      `;
      fixedSystemMessages += Number(result);
    }
    if (fixedSystemMessages > 0) {
      this.logger.log(`已修复 ${fixedSystemMessages} 条系统消息的 senderType`);
    } else {
      this.logger.log('未发现需要修复的系统消息');
    }

    // 4. 重新计算系统消息修复涉及的会话指标
    if (fixedSystemMessages > 0) {
      this.logger.log('开始重新计算受影响会话的消息数指标...');
      // 找出被修复的会话去重重新计算
      const affectedSessions = await this.prisma.$queryRaw<{ sessionId: string }[]>`
        SELECT DISTINCT "sessionId" FROM "UdescSessionMessage"
        WHERE "senderType" = 'system' AND "syncedAt" >= NOW() - INTERVAL '30 seconds'
      `;
      for (const row of affectedSessions) {
        const actualMessages = await this.prisma.udescSessionMessage.groupBy({
          by: ['senderType'],
          where: { sessionId: row.sessionId },
          _count: true,
        });
        const actualAgentMsgCount = actualMessages.find(m => m.senderType === 'agent')?._count ?? 0;
        const actualCustomerMsgCount = actualMessages.find(m => m.senderType === 'customer')?._count ?? 0;
        const messageCount = actualAgentMsgCount + actualCustomerMsgCount;
        const agentMessageCount = actualAgentMsgCount;
        const customerMessageCount = actualCustomerMsgCount;

        await this.prisma.udescSessionMetrics.upsert({
          where: { sessionId: row.sessionId },
          create: { sessionId: row.sessionId, messageCount, agentMessageCount, customerMessageCount },
          update: { messageCount, agentMessageCount, customerMessageCount },
        });
        fixedMetricsSessions++;
      }
      this.logger.log(`已重新计算 ${fixedMetricsSessions} 个会话的消息数指标`);
    }

    // 5. 如有需要修复的特定会话，可在此添加

    // 清除同步检查点，下次同步会重新拉取修复的数据
    await this.prisma.syncCheckpoint.deleteMany({ where: { source: 'udesc' } });

    this.logger.log(`智能修复完成：评价=${fixedVotes}, 系统消息=${fixedSystemMessages}, 会话指标=${fixedMetricsSessions}, 评价时间=${fixedVoteTimes}`);

    return {
      votes: fixedVotes,
      messages: fixedMessages,
      sessions: fixedSessions,
      voteTimes: fixedVoteTimes,
      systemMessages: fixedSystemMessages,
      metricsSessions: fixedMetricsSessions,
      total: fixedVotes + fixedMessages + fixedSessions + fixedVoteTimes + fixedSystemMessages + fixedMetricsSessions,
    };
  }
}
