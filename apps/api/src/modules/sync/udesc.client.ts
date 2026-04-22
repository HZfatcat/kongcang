import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { createHash, randomBytes } from 'crypto';
import {
  SyncFetchResult,
  UdescMessageRecord,
  UdescSessionRecord,
  UdescVoteRecord,
  UdescCustomerRecord,
  UdescAgentRecord,
  UdescSessionStats,
} from './sync.types';

@Injectable()
export class UdescClient {
  private readonly logger = new Logger(UdescClient.name);
  private readonly http: AxiosInstance;
  private runtimeOpenApiToken?: string;

  constructor() {
    const baseURL = (process.env.UDESC_BASE_URL ?? '').replace(/\/+$/, '');
    this.http = axios.create({
      baseURL,
      timeout: 10000,
    });
  }

  private parseTokenFromLoginBody(data: Record<string, unknown>): string | undefined {
    if (data.code !== 1000) {
      return undefined;
    }

    const token =
      data.open_api_auth_token ??
      data.token ??
      data.open_api_token ??
      (typeof data.admin === 'object' && data.admin
        ? (data.admin as Record<string, unknown>).open_api_auth_token ??
          (data.admin as Record<string, unknown>).token
        : undefined);

    if (!token) {
      return undefined;
    }
    return String(token);
  }

  private async ensureOpenApiToken(): Promise<string> {
    const envToken = (process.env.UDESC_TOKEN ?? '').trim();
    if (envToken) {
      return envToken;
    }

    if (this.runtimeOpenApiToken) {
      return this.runtimeOpenApiToken;
    }

    const email = (process.env.UDESC_EMAIL ?? '').trim();
    const password = process.env.UDESC_PASSWORD ?? '';

    if (!email || !password) {
      throw new Error('缺少 UDESC_EMAIL/UDESC_PASSWORD 或 UDESC_TOKEN 配置');
    }

    const resp = await this.http.post('/open_api_v1/log_in', {
      email,
      password,
    });
    const data = resp.data as Record<string, unknown>;
    const token = this.parseTokenFromLoginBody(data);

    if (!token) {
      throw new Error(`udesc log_in 未获取到 token: ${JSON.stringify(data)}`);
    }

    this.runtimeOpenApiToken = token;
    return token;
  }

  private async signOpenApiQuery(): Promise<Record<string, string>> {
    const email = (process.env.UDESC_EMAIL ?? '').trim();
    if (!email) {
      throw new Error('UDESC_EMAIL 不能为空');
    }

    const token = await this.ensureOpenApiToken();
    const signVersion = process.env.UDESC_SIGN_VERSION ?? 'v2';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString('hex');
    const raw = `${email}&${token}&${timestamp}&${nonce}&${signVersion}`;
    const sign = createHash('sha256').update(raw, 'utf8').digest('hex');

    return {
      email,
      timestamp,
      nonce,
      sign,
      sign_version: signVersion,
    };
  }

  private async openApiGet(path: string, params: Record<string, string>) {
    const signed = await this.signOpenApiQuery();
    const fullPath = path.startsWith('/open_api_v1/') ? path : `/open_api_v1/${path.replace(/^\/+/, '')}`;
    return this.http.get(fullPath, {
      params: {
        ...signed,
        ...params,
      },
    });
  }

  private extractItems(data: Record<string, unknown>): Array<Record<string, unknown>> {
    const candidates = [data.items, data.item, data.results, data.data, data.contents];
    for (const value of candidates) {
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
      }
    }
    return [];
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private toStringValue(value: unknown): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const text = String(value).trim();
    return text ? text : undefined;
  }

  private pickString(item: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = this.toStringValue(item[key]);
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  private pickBoolean(item: Record<string, unknown>, keys: string[]): boolean | undefined {
    for (const key of keys) {
      const value = item[key];
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'number') {
        return value !== 0;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'y'].includes(normalized)) {
          return true;
        }
        if (['0', 'false', 'no', 'n'].includes(normalized)) {
          return false;
        }
      }
    }
    return undefined;
  }

  private pickRating(item: Record<string, unknown>): number | undefined {
    const normalize = (value: number | undefined) => {
      if (value === undefined) {
        return undefined;
      }
      // 满意度分值通常是 1~5（部分系统为 0~10），超出范围视为非评分字段。
      if (value >= 0 && value <= 10) {
        return value;
      }
      return undefined;
    };

    const direct = this.toNumber(item.rating ?? item.score ?? item.vote_score ?? item.satisfaction_level);
    const normalizedDirect = normalize(direct);
    if (normalizedDirect !== undefined) {
      return normalizedDirect;
    }
    const vote = item.vote;
    if (vote && typeof vote === 'object') {
      const nested = vote as Record<string, unknown>;
      return normalize(
        this.toNumber(nested.rating ?? nested.score ?? nested.vote_score ?? nested.satisfaction_level),
      );
    }
    return undefined;
  }

  private mapSession(
    item: Record<string, unknown>,
    fallbackStartDate: string,
    fallbackEndDate: string,
  ): UdescSessionRecord {
    const startedAt =
      this.pickString(item, ['start_time', 'session_start_at', 'started_at', 'created_at']) ??
      fallbackStartDate;
    const endedAt =
      this.pickString(item, ['end_time', 'session_end_at', 'ended_at', 'updated_at', 'closed_at']) ??
      fallbackEndDate;
    const updatedAt = this.pickString(item, ['updated_at', 'end_time', 'created_at', 'closed_at']);

    return {
      id:
        this.pickString(item, ['session_id', 'im_session_id', 'id', 'im_sub_session_id']) ??
        `${startedAt}-${endedAt}`,
      agentId: this.pickString(item, ['agent_id', 'owner_id', 'user_id', 'agent_nick_name']),
      startedAt,
      endedAt,
      rating: this.pickRating(item),
      isConsultToDemand: this.pickBoolean(item, ['is_consult_to_demand', 'has_requirement', 'convert_to_requirement']),
      updatedAt,
      rawPayload: item,
    };
  }

  private mapMessage(item: Record<string, unknown>, sessionId: string): UdescMessageRecord {
    const sentAt =
      this.pickString(item, ['created_at', 'send_time', 'sent_at', 'timestamp']) ?? new Date().toISOString();
    
    // 尝试从多个字段提取 senderType，包括 rawPayload 中的 sender 字段
    let senderType = this.pickString(item, ['sender_type', 'message_from', 'role', 'from_type', 'sender']);
    if (!senderType) {
      // 有些 API 响应中 senderType 在顶层，有些通过 rawPayload.sender
      // rawPayload 可能在调用时已经解构了
    }
    
    const senderId = this.pickString(item, ['sender_id', 'user_id', 'agent_id', 'from_id']);
    const content = this.pickString(item, ['content', 'message', 'body', 'text']);
    const messageId =
      this.pickString(item, ['id', 'message_id', 'msg_id']) ?? `${sessionId}-${sentAt}-${randomBytes(6).toString('hex')}`;

    return {
      id: messageId,
      sessionId,
      sentAt,
      senderType,
      senderId,
      content,
      rawPayload: item,
    };
  }

  async fetchSessions(params: {
    cursor?: string;
    pageSize: number;
    startDate: string;
    endDate: string;
  }): Promise<SyncFetchResult<UdescSessionRecord>> {
    if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
      this.logger.warn('UDESC_BASE_URL 未配置真实地址，跳过远端同步，返回空数据。');
      return { records: [], hasMore: false };
    }

    const page = Math.max(1, Number(params.cursor ?? '1'));
    const endpoint = process.env.UDESC_IM_SESSION_PATH ?? 'im/sessions/search';
    const resp = await this.openApiGet(endpoint, {
      page: String(page),
      page_size: String(params.pageSize),
      start_time: params.startDate,
      end_time: params.endDate,
    });
    const data = (resp.data ?? {}) as Record<string, unknown>;
    const items = this.extractItems(data);
    const records = items.map((item) => this.mapSession(item, params.startDate, params.endDate));

    const hasMoreFlag = this.pickBoolean(data, ['has_more']);
    const currentPage = this.toNumber(data.page) ?? page;
    const totalPages = this.toNumber(data.total_pages);
    const fallbackHasMore = records.length >= params.pageSize;
    const hasMore =
      hasMoreFlag ?? (totalPages !== undefined ? currentPage < totalPages : fallbackHasMore);
    const nextCursor = hasMore ? String(currentPage + 1) : undefined;

    return {
      records,
      nextCursor,
      hasMore,
    };
  }

  async fetchSessionLogs(params: {
    sessionId: string;
    cursor?: string;
    pageSize: number;
    startDate?: string;
    endDate?: string;
  }): Promise<SyncFetchResult<UdescMessageRecord>> {
    if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
      return { records: [], hasMore: false };
    }

    const page = Math.max(1, Number(params.cursor ?? '1'));
    const endpoint = process.env.UDESC_IM_LOG_PATH ?? 'im/sessions/log';
    const resp = await this.openApiGet(endpoint, {
      session_id: params.sessionId,
      page: String(page),
      page_size: String(params.pageSize),
      ...(params.startDate ? { start_time: params.startDate } : {}),
      ...(params.endDate ? { end_time: params.endDate } : {}),
    });
    const data = (resp.data ?? {}) as Record<string, unknown>;
    const items = this.extractItems(data);
    const records = items.map((item) => this.mapMessage(item, params.sessionId));

    const hasMoreFlag = this.pickBoolean(data, ['has_more']);
    const currentPage = this.toNumber(data.page) ?? page;
    const totalPages = this.toNumber(data.total_pages);
    const fallbackHasMore = records.length >= params.pageSize;
    const hasMore =
      hasMoreFlag ?? (totalPages !== undefined ? currentPage < totalPages : fallbackHasMore);
    const nextCursor = hasMore ? String(currentPage + 1) : undefined;

    return {
      records,
      nextCursor,
      hasMore,
    };
  }

  // ========== 新增 API 方法 ==========

  /**
   * 获取会话评价详情
   */
  async fetchSessionVotes(params: {
    sessionId: string;
    cursor?: string;
    pageSize: number;
  }): Promise<SyncFetchResult<UdescVoteRecord>> {
    if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
      return { records: [], hasMore: false };
    }

    const page = Math.max(1, Number(params.cursor ?? '1'));
    const endpoint = process.env.UDESC_IM_VOTE_PATH ?? 'im/sessions/vote';
    const resp = await this.openApiGet(endpoint, {
      session_id: params.sessionId,
      page: String(page),
      page_size: String(params.pageSize),
    });
    const data = (resp.data ?? {}) as Record<string, unknown>;
    const items = this.extractItems(data);
    const records: UdescVoteRecord[] = items.map((item) => ({
      sessionId: params.sessionId,
      rating: this.pickRating(item),
      tags: this.parseTags(item.tags ?? item.vote_tags),
      comment: this.pickString(item, ['comment', 'content', 'remark', 'vote_comment']),
      voterId: this.pickString(item, ['voter_id', 'customer_id', 'user_id']),
      voterName: this.pickString(item, ['voter_name', 'customer_name', 'user_name']),
      votedAt: this.pickString(item, ['voted_at', 'created_at', 'vote_time']),
      rawPayload: item,
    }));

    const hasMoreFlag = this.pickBoolean(data, ['has_more']);
    const currentPage = this.toNumber(data.page) ?? page;
    const totalPages = this.toNumber(data.total_pages);
    const hasMore = hasMoreFlag ?? (totalPages !== undefined ? currentPage < totalPages : records.length >= params.pageSize);
    const nextCursor = hasMore ? String(currentPage + 1) : undefined;

    return { records, nextCursor, hasMore };
  }

  /**
   * 获取客户信息
   */
  async fetchCustomers(params: {
    cursor?: string;
    pageSize: number;
    startDate?: string;
    endDate?: string;
  }): Promise<SyncFetchResult<UdescCustomerRecord>> {
    if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
      return { records: [], hasMore: false };
    }

    const page = Math.max(1, Number(params.cursor ?? '1'));
    const endpoint = process.env.UDESC_CUSTOMER_PATH ?? 'customers';
    const resp = await this.openApiGet(endpoint, {
      page: String(page),
      page_size: String(params.pageSize),
      ...(params.startDate ? { start_time: params.startDate } : {}),
      ...(params.endDate ? { end_time: params.endDate } : {}),
    });
    const data = (resp.data ?? {}) as Record<string, unknown>;
    const items = this.extractItems(data);
    const records: UdescCustomerRecord[] = items.map((item) => ({
      id: this.pickString(item, ['id', 'customer_id', 'user_id']) ?? `${Date.now()}-${randomBytes(4).toString('hex')}`,
      name: this.pickString(item, ['name', 'nick_name', 'nickname', 'customer_name']),
      phone: this.pickString(item, ['phone', 'mobile', 'cellphone']),
      email: this.pickString(item, ['email', 'mail']),
      wechat: this.pickString(item, ['wechat', 'weixin', 'openid']),
      enterprise: this.pickString(item, ['enterprise', 'company', 'organization']),
      tags: this.parseTags(item.tags ?? item.labels),
      customFields: this.parseCustomFields(item.custom_fields ?? item.fields),
      rawPayload: item,
    }));

    const hasMoreFlag = this.pickBoolean(data, ['has_more']);
    const currentPage = this.toNumber(data.page) ?? page;
    const totalPages = this.toNumber(data.total_pages);
    const hasMore = hasMoreFlag ?? (totalPages !== undefined ? currentPage < totalPages : records.length >= params.pageSize);
    const nextCursor = hasMore ? String(currentPage + 1) : undefined;

    return { records, nextCursor, hasMore };
  }

  /**
   * 获取客服列表
   */
  async fetchAgents(params: {
    cursor?: string;
    pageSize: number;
  }): Promise<SyncFetchResult<UdescAgentRecord>> {
    if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
      this.logger.warn('UDESC_BASE_URL not configured, skipping agent fetch');
      return { records: [], hasMore: false };
    }

    const page = Math.max(1, Number(params.cursor ?? '1'));
    const endpoint = process.env.UDESC_AGENTS_PATH ?? 'agents';
    this.logger.log(`Fetching agents from ${endpoint}, page=${page}`);
    
    try {
      const resp = await this.openApiGet(endpoint, {
        page: String(page),
        page_size: String(params.pageSize),
      });
      const data = (resp.data ?? {}) as Record<string, unknown>;
      this.logger.debug(`Agent API response keys: ${Object.keys(data).join(', ')}`);
      
      const items = this.extractItems(data);
      this.logger.log(`Agent API returned ${items.length} items`);
    const records: UdescAgentRecord[] = items.map((item) => ({
      id: this.pickString(item, ['id', 'agent_id', 'user_id']) ?? `${Date.now()}-${randomBytes(4).toString('hex')}`,
      name: this.pickString(item, ['name', 'nick_name', 'nickname', 'display_name']),
      email: this.pickString(item, ['email', 'mail']),
      phone: this.pickString(item, ['phone', 'mobile', 'cellphone']),
      roleId: this.pickString(item, ['role_id', 'roleid']),
      roleName: this.pickString(item, ['role_name', 'role', 'rolename']),
      enabled: this.pickBoolean(item, ['enabled', 'active', 'is_enabled']),
      groups: this.parseStringArray(item.groups ?? item.group_ids),
      skills: this.parseStringArray(item.skills ?? item.skill_ids),
      rawPayload: item,
    }));

    const hasMoreFlag = this.pickBoolean(data, ['has_more']);
    const currentPage = this.toNumber(data.page) ?? page;
    const totalPages = this.toNumber(data.total_pages);
    const hasMore = hasMoreFlag ?? (totalPages !== undefined ? currentPage < totalPages : records.length >= params.pageSize);
    const nextCursor = hasMore ? String(currentPage + 1) : undefined;

    return { records, nextCursor, hasMore };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to fetch agents: ${msg}`);
      return { records: [], hasMore: false };
    }
  }

  /**
   * 获取会话统计（响应时间等）
   */
  async fetchSessionStats(sessionId: string): Promise<UdescSessionStats | undefined> {
    if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
      return undefined;
    }

    try {
      const endpoint = process.env.UDESC_SESSION_STATS_PATH ?? 'im/sessions/stats';
      const resp = await this.openApiGet(endpoint, { session_id: sessionId });
      const data = (resp.data ?? {}) as Record<string, unknown>;
      
      return {
        firstResponseTime: this.toNumber(data.first_response_time ?? data.first_reply_time),
        avgResponseTime: this.toNumber(data.avg_response_time ?? data.average_response_time),
        waitTime: this.toNumber(data.wait_time ?? data.queue_time),
        resolutionTime: this.toNumber(data.resolution_time ?? data.solve_time),
        messageCount: this.toNumber(data.message_count ?? data.msg_count) ?? 0,
        agentMessageCount: this.toNumber(data.agent_message_count ?? data.agent_msg_count) ?? 0,
        customerMessageCount: this.toNumber(data.customer_message_count ?? data.user_msg_count) ?? 0,
      };
    } catch {
      return undefined;
    }
  }

  private parseTags(value: unknown): string[] | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) {
      const tags = value
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .map((v) => v.trim());
      return tags.length > 0 ? tags : undefined;
    }
    if (typeof value === 'string' && value.trim()) {
      return value.split(/[,，;；]/).map((s) => s.trim()).filter(Boolean);
    }
    return undefined;
  }

  private parseStringArray(value: unknown): string[] | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) {
      const arr = value
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .map((v) => v.trim());
      return arr.length > 0 ? arr : undefined;
    }
    return undefined;
  }

  private parseCustomFields(value: unknown): Record<string, unknown> | undefined {
    if (!value) return undefined;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return undefined;
  }
}
