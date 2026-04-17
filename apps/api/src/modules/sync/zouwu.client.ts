import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  SyncFetchResult,
  ZouwuCloseRateStat,
  ZouwuFeedbackStatistics,
  ZouwuRequirementRecord,
} from './sync.types';

@Injectable()
export class ZouwuClient implements OnModuleInit {
  private baseUrl!: string;
  private httpDirect!: AxiosInstance;
  private httpWithProxy!: AxiosInstance;
  private proxyMode: 'auto' | 'on' | 'off' = 'auto';
  private defaultCookieName!: string;
  private defaultLongTermLabelName!: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.baseUrl = this.resolveBaseUrl();
    this.proxyMode = this.resolveProxyMode();
    this.defaultCookieName = this.configService.get<string>('ZOUWU_COOKIE_NAME') ?? 'admin-plus-app-token';
    this.defaultLongTermLabelName = this.configService.get<string>('ZOUWU_LONG_TERM_LABEL_NAME') ?? '长期演进';
    console.log('[ZouwuClient] baseUrl:', this.baseUrl, 'proxyMode:', this.proxyMode);
    this.httpWithProxy = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
    });
    this.httpDirect = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      proxy: false,
    });
  }

  private resolveBaseUrl() {
    // 优先使用 process.env，因为 ConfigModule 可能未正确加载 .env
    const envValue = process.env.ZOUWU_BASE_URL || this.configService.get<string>('ZOUWU_BASE_URL');
    console.log('[ZouwuClient] ZOUWU_BASE_URL from process.env:', process.env.ZOUWU_BASE_URL);
    console.log('[ZouwuClient] ZOUWU_BASE_URL from configService:', this.configService.get<string>('ZOUWU_BASE_URL'));
    console.log('[ZouwuClient] ZOUWU_BASE_URL final value:', envValue);
    const baseUrl = (envValue?.trim() || 'https://zouwu.gitcode.com').replace(/\/$/, '');
    if (baseUrl === 'https://example.com' || baseUrl === 'http://example.com' || baseUrl.includes('example.com')) {
      throw new Error(`ZOUWU_BASE_URL 未配置为真实驺吾服务地址，当前值: ${baseUrl}`);
    }
    return baseUrl;
  }

  private resolveProxyMode(): 'auto' | 'on' | 'off' {
    const mode = (this.configService.get<string>('ZOUWU_PROXY_MODE') ?? 'auto').trim().toLowerCase();
    if (mode === 'on' || mode === 'off') {
      return mode;
    }
    return 'auto';
  }

  private resolveToken(tokenOverride?: string) {
    const token = tokenOverride?.trim() || this.configService.get<string>('ZOUWU_APP_TOKEN')?.trim() || '';
    return token || undefined;
  }

  private cookieHeader(token: string) {
    return `${this.defaultCookieName}=${token}`;
  }

  private formatZouwuDate(isoString: string): string {
    // 驺吾 API 需要北京时间 (UTC+8)，将传入的 ISO 时间 +8 小时
    const d = new Date(isoString);
    // 加 8 小时转成北京时间
    const beijingTime = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${beijingTime.getFullYear()}-${pad(beijingTime.getMonth() + 1)}-${pad(beijingTime.getDate())} ${pad(beijingTime.getHours())}:${pad(beijingTime.getMinutes())}:${pad(beijingTime.getSeconds())}`;
  }

  private parseZouwuDateTime(dateTimeStr: string | undefined): string | undefined {
    // 驺吾返回的时间是北京时间字符串 "2024-01-01 12:00:00"，需转成 ISO (UTC)
    if (!dateTimeStr) return undefined;
    // 驺吾返回的时间是北京时间，需要 -8 小时转成 UTC
    const d = new Date(dateTimeStr.replace(' ', 'T') + '+08:00');
    return d.toISOString();
  }

  private async requestWithNetworkFallback(
    path: string,
    params: Record<string, string | number | undefined>,
    headers?: Record<string, string>,
  ) {
    const config = {
      params,
      ...(headers ? { headers } : {}),
    };
    console.log('[ZouwuClient] requestWithNetworkFallback', path, 'proxyMode:', this.proxyMode, 'baseUrl:', this.baseUrl);
    if (this.proxyMode === 'off') {
      return this.httpDirect.get(path, config);
    }
    if (this.proxyMode === 'on') {
      return this.httpWithProxy.get(path, config);
    }
    try {
      return await this.httpWithProxy.get(path, config);
    } catch (err) {
      console.log('[ZouwuClient] httpWithProxy failed, trying httpDirect:', err);
      return this.httpDirect.get(path, config);
    }
  }

  private async getWithOptionalCookie(
    path: string,
    params: Record<string, string | number | undefined>,
    tokenOverride?: string,
  ) {
    const token = this.resolveToken(tokenOverride);
    if (!token) {
      return this.requestWithNetworkFallback(path, params);
    }

    try {
      return await this.requestWithNetworkFallback(path, params, {
        Cookie: this.cookieHeader(token),
      });
    } catch (error) {
      if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
        try {
          return await this.requestWithNetworkFallback(path, params);
        } catch (fallbackError) {
          if (axios.isAxiosError(fallbackError)) {
            throw new Error(
              `${path} 请求失败（cookie=${error.response?.status}, no-cookie=${fallbackError.response?.status ?? 'NA'}）`,
            );
          }
          throw fallbackError;
        }
      }
      if (axios.isAxiosError(error)) {
        const status = error.response?.status ?? 'NA';
        const errMsg = error.message ?? 'unknown';
        const url = error.config?.url ?? this.baseUrl + path;
        throw new Error(`${path} 请求失败（status=${status}, message=${errMsg}, url=${url}）`);
      }
      throw error;
    }
  }

  private pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
      if (typeof value === 'number') {
        return String(value);
      }
    }
    return undefined;
  }

  private mapStatus(rawStatus: unknown): ZouwuRequirementRecord['status'] {
    const code = String(rawStatus ?? '');
    if (code === '5') {
      return 'CLOSED';
    }
    if (code === '4') {
      return 'REJECTED';
    }
    if (code === '1' || code === '2' || code === '3') {
      return 'IN_PROGRESS';
    }
    return 'OPEN';
  }

  private parseListPayload(payload: unknown, context: string) {
    if (!payload || typeof payload !== 'object') {
      throw new Error(`${context}: 响应结构非法`);
    }
    const body = payload as Record<string, unknown>;
    const code = body.code;
    if (code !== undefined && code !== null && code !== 0 && code !== 200) {
      const message = String(body.msg ?? body.message ?? 'unknown');
      throw new Error(`${context}: API code=${String(code)}, msg=${message}`);
    }
    const data = body.data;
    if (!data || typeof data !== 'object') {
      throw new Error(`${context}: 缺少 data 字段`);
    }
    const listContainer = data as Record<string, unknown>;
    const total = Number(listContainer.total ?? 0);
    const rowsRaw = listContainer.list ?? listContainer.records ?? listContainer.items ?? [];
    const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
    return {
      total: Number.isFinite(total) ? total : 0,
      rows: rows.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')),
    };
  }

  private async listFeedback(params: {
    page: number;
    pageSize: number;
    startCreatedTime: string;
    endCreatedTime: string;
    issueType?: string;
    status?: string;
    labels?: string;
    tokenOverride?: string;
  }) {
    const payload = await this.getWithOptionalCookie(
      '/api/v1/feedback/list',
      {
        page: params.page,
        pageSize: params.pageSize,
        startCreatedTime: params.startCreatedTime,
        endCreatedTime: params.endCreatedTime,
        issueType: params.issueType,
        status: params.status,
        labels: params.labels,
      },
      params.tokenOverride,
    );
    return this.parseListPayload(payload.data, 'feedback/list');
  }

  private async feedbackTotal(params: {
    startCreatedTime: string;
    endCreatedTime: string;
    issueType?: string;
    status?: string;
    labels?: string;
    tokenOverride?: string;
  }) {
    const result = await this.listFeedback({
      ...params,
      page: 1,
      pageSize: 1,
    });
    return result.total;
  }

  private async fetchLongTermLabelId(tokenOverride?: string) {
    const payload = await this.getWithOptionalCookie(
      '/api/v1/label/list',
      { labelType: 4 },
      tokenOverride,
    );
    const body = payload.data as Record<string, unknown>;
    const code = body.code;
    if (code !== undefined && code !== null && code !== 0 && code !== 200) {
      const message = String(body.msg ?? body.message ?? 'unknown');
      throw new Error(`label/list: API code=${String(code)}, msg=${message}`);
    }
    const rows = Array.isArray(body.data) ? body.data : [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      const item = row as Record<string, unknown>;
      const name = String(item.label_name ?? item.labelName ?? '');
      if (name === this.defaultLongTermLabelName) {
        const id = Number(item.id);
        if (Number.isFinite(id)) {
          return id;
        }
      }
    }
    throw new Error(`未找到长期演进标签: ${this.defaultLongTermLabelName}`);
  }

  async fetchRequirements(params: {
    cursor?: string;
    pageSize: number;
    startDate: string;
    endDate: string;
  }): Promise<SyncFetchResult<ZouwuRequirementRecord>> {
    this.resolveBaseUrl();
    const page = Math.max(1, Number(params.cursor ?? 1));
    const result = await this.listFeedback({
      page,
      pageSize: params.pageSize,
      startCreatedTime: this.formatZouwuDate(params.startDate),
      endCreatedTime: this.formatZouwuDate(params.endDate),
    });

    const records: ZouwuRequirementRecord[] = result.rows.map((item) => {
      // 解析创建人信息
      const creatorObj = item.creator || item.createUser || item.owner;
      let createdById: string | undefined;
      let createdByName: string | undefined;
      
      // 优先检查 creator 对象
      if (creatorObj && typeof creatorObj === 'object') {
        const creator = creatorObj as Record<string, unknown>;
        createdById = this.pickString(creator, ['id', 'userId', 'uid']);
        createdByName = this.pickString(creator, ['name', 'nickname', 'displayName', 'userName']);
      }
      
      // 如果 creator 对象没找到，检查顶层字段 createdBy/createdByName
      if (!createdById && (typeof item.createdBy === 'number' || typeof item.createdBy === 'string')) {
        createdById = String(item.createdBy);
      }
      if (!createdByName) {
        createdByName = this.pickString(item, ['createdByName', 'creatorName', 'creator_name']);
      }

      return {
        id: this.pickString(item, ['id']) ?? '',
        title: this.pickString(item, ['title', 'subject', 'name']) ?? '',
        sourceSessionId: this.pickString(item, ['sessionId', 'sourceSessionId', 'source_session_id']),
        issueType: typeof item.issueType === 'number' ? item.issueType : (typeof item.issue_type === 'number' ? item.issue_type : (typeof item.type === 'number' ? item.type : undefined)),
        status: this.mapStatus(item.status),
        createdById,
        createdByName,
        createdAt: this.parseZouwuDateTime(this.pickString(item, ['createdTime', 'createTime', 'created_at'])) ?? new Date().toISOString(),
        completedAt: this.parseZouwuDateTime(this.pickString(item, ['closedTime', 'endTime', 'closed_at', 'doneTime'])),
        updatedAt: this.parseZouwuDateTime(this.pickString(item, ['updatedTime', 'updateTime', 'updated_at'])),
        rawPayload: item,
      };
    });

    const hasMore = page * params.pageSize < result.total;
    const nextCursor = hasMore ? String(page + 1) : undefined;

    return {
      records,
      nextCursor,
      hasMore,
    };
  }

  async getFeedbackStatistics(params: {
    startCreatedTime: string;
    endCreatedTime: string;
    tokenOverride?: string;
  }): Promise<ZouwuFeedbackStatistics> {
    this.resolveBaseUrl();
    const labelId = await this.fetchLongTermLabelId(params.tokenOverride);

    const buildRate = async (issueType: '0' | '1' | null, scope: ZouwuCloseRateStat['scope']) => {
      const total = await this.feedbackTotal({
        startCreatedTime: params.startCreatedTime,
        endCreatedTime: params.endCreatedTime,
        issueType: issueType ?? undefined,
        tokenOverride: params.tokenOverride,
      });
      const excludedByLongTermAccepted = await this.feedbackTotal({
        startCreatedTime: params.startCreatedTime,
        endCreatedTime: params.endCreatedTime,
        issueType: issueType ?? undefined,
        status: '1',
        labels: String(labelId),
        tokenOverride: params.tokenOverride,
      });
      const closedOrRejected = await this.feedbackTotal({
        startCreatedTime: params.startCreatedTime,
        endCreatedTime: params.endCreatedTime,
        issueType: issueType ?? undefined,
        status: '4,5',
        tokenOverride: params.tokenOverride,
      });
      const denominator = total - excludedByLongTermAccepted;
      return {
        scope,
        issueType,
        total,
        excludedByLongTermAccepted,
        closedOrRejected,
        denominator,
        closeRate: denominator > 0 ? closedOrRejected / denominator : null,
      };
    };

    const [newRequirements, newBugs, requirementRate, bugRate, allRate] = await Promise.all([
      this.feedbackTotal({
        startCreatedTime: params.startCreatedTime,
        endCreatedTime: params.endCreatedTime,
        issueType: '0',
        tokenOverride: params.tokenOverride,
      }),
      this.feedbackTotal({
        startCreatedTime: params.startCreatedTime,
        endCreatedTime: params.endCreatedTime,
        issueType: '1',
        tokenOverride: params.tokenOverride,
      }),
      buildRate('0', 'requirement'),
      buildRate('1', 'bug'),
      buildRate(null, 'all'),
    ]);

    return {
      baseUrl: this.baseUrl,
      startCreatedTime: params.startCreatedTime,
      endCreatedTime: params.endCreatedTime,
      longTermLabelName: this.defaultLongTermLabelName,
      longTermLabelId: labelId,
      newRequirements,
      newBugs,
      closeRates: [requirementRate, bugRate, allRate],
    };
  }
}
