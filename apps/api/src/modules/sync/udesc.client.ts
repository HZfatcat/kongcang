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
  UdescOrganizationRecord,
  UdescTicketRecord,
  UdescCallLogRecord,
  UdescBusinessNoteRecord,
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
    // 优先级3：通过 survey_option_id 映射（客户满意度评价选项）
    const surveyOptionId = this.toNumber(item.survey_option_id);
    if (surveyOptionId !== undefined) {
      if (surveyOptionId === 20979) return 5;  // 满意
      if (surveyOptionId === 20981) return 1;  // 不满意
    }
    // 注意：resolved_state 表示"是否已解决"，不等于"满意度"，
    // 评分应仅从显式评分字段（rating/score/satisfaction_level等）或 survey_option_id 提取
    return undefined;
  }

  private mapSession(
    item: Record<string, unknown>,
    fallbackStartDate: string,
  ): UdescSessionRecord {
    const startedAt =
      this.pickString(item, ['start_time', 'session_start_at', 'started_at', 'created_at']) ??
      fallbackStartDate;
    // endedAt 不使用 fallback，未结束的会话应为 null
    const endedAt =
      this.pickString(item, ['end_time', 'session_end_at', 'ended_at', 'closed_at']);
    const updatedAt = this.pickString(item, ['updated_at', 'end_time', 'created_at', 'closed_at']);

    return {
      id:
        this.pickString(item, ['session_id', 'im_session_id', 'id', 'im_sub_session_id']) ??
        `${startedAt}-${endedAt ?? 'ongoing'}`,
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
    const records = items.map((item) => this.mapSession(item, params.startDate));

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
    sessionId?: string;
    cursor?: string;
    pageSize: number;
    startDate?: string;
    endDate?: string;
  }): Promise<SyncFetchResult<UdescVoteRecord>> {
    if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
      return { records: [], hasMore: false };
    }

    const page = Math.max(1, Number(params.cursor ?? '1'));
    const endpoint = process.env.UDESC_IM_VOTE_PATH ?? 'im/sessions/vote';
    const resp = await this.openApiGet(endpoint, {
      ...(params.sessionId ? { session_id: params.sessionId } : {}),
      ...(params.startDate ? { start_time: params.startDate } : {}),
      ...(params.endDate ? { end_time: params.endDate } : {}),
      page: String(page),
      page_size: String(params.pageSize),
    });
    const data = (resp.data ?? {}) as Record<string, unknown>;
    const items = this.extractItems(data);
    const records: UdescVoteRecord[] = items.map((item) => ({
      id: String(item.id ?? item.survey_id ?? `${item.session_id}_${item.created_at ?? Date.now()}`),
      sessionId: String(item.session_id ?? params.sessionId),
      rating: this.pickRating(item),
      tags: this.parseTags(item.tags ?? item.vote_tags),
      comment: this.pickString(item, ['comment', 'content', 'remark', 'survey_remark', 'vote_comment']),
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

  /**
   * 获取客户公司/组织列表
   */
  async fetchOrganizations(params: {
    cursor?: string;
    pageSize: number;
  }): Promise<SyncFetchResult<UdescOrganizationRecord>> {
    if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
      return { records: [], hasMore: false };
    }

    const page = Math.max(1, Number(params.cursor ?? '1'));
    const endpoint = process.env.UDESC_ORGANIZATIONS_PATH ?? 'organizations';
    this.logger.log(`Fetching organizations from ${endpoint}, page=${page}`);
    
    try {
      const resp = await this.openApiGet(endpoint, {
        page: String(page),
        per_page: String(params.pageSize),
      });
      const data = (resp.data ?? {}) as Record<string, unknown>;
      const items = this.extractItems(data);
      
      // organizations API 返回格式: { organizations: [...] }
      const orgItems = Array.isArray(data.organizations) ? data.organizations : items;
      
      const records: UdescOrganizationRecord[] = orgItems
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item) => ({
          id: String(item.id ?? ''),
          name: this.pickString(item, ['name']),
          domains: this.pickString(item, ['domains', 'domain']),
          level: this.pickString(item, ['level']),
          description: this.pickString(item, ['description', 'desc']),
          token: this.pickString(item, ['token']),
          customFields: this.parseCustomFields(item.custom_fields),
          updatedAt: this.pickString(item, ['updated_at', 'updated_at']),
          rawPayload: item,
        }));

      const hasMoreFlag = this.pickBoolean(data, ['has_more']);
      const totalPages = this.toNumber(data.total_pages);
      const hasMore = hasMoreFlag ?? (totalPages !== undefined ? page < totalPages : records.length >= params.pageSize);
      const nextCursor = hasMore ? String(page + 1) : undefined;

      return { records, nextCursor, hasMore };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to fetch organizations: ${msg}`);
      return { records: [], hasMore: false };
    }
  }

  /**
   * 获取工单列表
   */
  async fetchTickets(params: {
    cursor?: string;
    pageSize: number;
    startDate?: string;
    endDate?: string;
  }): Promise<SyncFetchResult<UdescTicketRecord>> {
    if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
      return { records: [], hasMore: false };
    }

    const page = Math.max(1, Number(params.cursor ?? '1'));
    const endpoint = process.env.UDESC_TICKETS_PATH ?? 'tickets';
    this.logger.log(`Fetching tickets from ${endpoint}, page=${page}`);
    
    try {
      const resp = await this.openApiGet(endpoint, {
        page: String(page),
        per_page: String(params.pageSize),
        ...(params.startDate ? { start_time: params.startDate } : {}),
        ...(params.endDate ? { end_time: params.endDate } : {}),
      });
      const data = (resp.data ?? {}) as Record<string, unknown>;
      
      // tickets API 返回格式: { contents: [{ ticket: {...} }, ...] }
      const contents = Array.isArray(data.contents) ? data.contents : [];
      const ticketItems = contents
        .map((c: any) => c?.ticket)
        .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null);
      
      const records: UdescTicketRecord[] = ticketItems.map((item) => ({
        id: String(item.id ?? ''),
        fieldNum: this.pickString(item, ['field_num', 'ticket_num']),
        subject: this.pickString(item, ['subject', 'title']),
        content: this.pickString(item, ['content', 'body']),
        source: this.pickString(item, ['source']),
        contentType: this.pickString(item, ['content_type']),
        userId: this.pickString(item, ['user_id', 'customer_id']),
        userName: this.pickString(item, ['user_name', 'customer_name']),
        userEmail: this.pickString(item, ['user_email', 'customer_email']),
        userCellphone: this.pickString(item, ['user_cellphone', 'customer_phone']),
        organizationId: this.pickString(item, ['organization_id', 'org_id']),
        assigneeId: this.pickString(item, ['assignee_id', 'agent_id']),
        assigneeName: this.pickString(item, ['assignee_name', 'agent_name']),
        assigneeAvatar: this.pickString(item, ['assignee_avatar']),
        userGroupId: this.pickString(item, ['user_group_id', 'group_id']),
        userGroupName: this.pickString(item, ['user_group_name', 'group_name']),
        templateId: this.pickString(item, ['template_id']),
        priority: this.pickString(item, ['priority']),
        status: this.pickString(item, ['status']),
        statusEn: this.pickString(item, ['status_en']),
        platform: this.pickString(item, ['platform']),
        satisfaction: this.pickString(item, ['satisfaction']),
        customFields: this.parseCustomFields(item.custom_fields),
        tags: this.pickString(item, ['tags']),
        creatorId: this.pickString(item, ['creator_id']),
        imSubSessionId: this.pickString(item, ['im_sub_session_id']),
        conversationId: this.pickString(item, ['conversation_id']),
        createdAt: this.pickString(item, ['created_at']),
        updatedAt: this.pickString(item, ['updated_at']),
        solvingAt: this.pickString(item, ['solving_at']),
        resolvedAt: this.pickString(item, ['resolved_at']),
        closedAt: this.pickString(item, ['closed_at']),
        solvedDeadline: this.pickString(item, ['solved_deadline']),
        repliedAt: this.pickString(item, ['replied_at']),
        agentRepliedAt: this.pickString(item, ['agent_replied_at']),
        customerRepliedAt: this.pickString(item, ['customer_replied_at']),
        firstRepliedAt: this.pickString(item, ['first_replied_at']),
        repliedBy: this.pickString(item, ['replied_by']),
        rawPayload: item,
      }));

      const hasMoreFlag = this.pickBoolean(data, ['has_more']);
      const totalPages = this.toNumber(data.total_pages);
      const hasMore = hasMoreFlag ?? (totalPages !== undefined ? page < totalPages : records.length >= params.pageSize);
      const nextCursor = hasMore ? String(page + 1) : undefined;

      return { records, nextCursor, hasMore };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to fetch tickets: ${msg}`);
      return { records: [], hasMore: false };
    }
  }

  // ========== 呼叫中心 · 通话记录 ==========

  async fetchCallLogs(params: {
    startTime: string;
    endTime?: string;
    page?: number;
    pageSize?: number;
    customerPhone?: string;
  }): Promise<{ records: Record<string, unknown>[]; total: number }> {
    if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
      return { records: [], total: 0 };
    }

    const allItems: Record<string, unknown>[] = [];
    let page = params.page ?? 1;
    const pageSize = params.pageSize ?? 100;

    try {
      while (true) {
        const resp = await this.openApiGet('callcenter/calllogs', {
          start_time: params.startTime,
          ...(params.endTime ? { end_time: params.endTime } : {}),
          ...(params.customerPhone ? { customer_phone: params.customerPhone } : {}),
          page: String(page),
          page_size: String(pageSize),
        });
        const data = (resp.data ?? {}) as Record<string, unknown>;
        if (data.code !== 1000) {
          this.logger.warn(`callcenter/calllogs API 返回异常: ${JSON.stringify(data)}`);
          break;
        }
        const items = Array.isArray(data.items) ? data.items as Record<string, unknown>[] : [];
        if (items.length === 0) break;
        allItems.push(...items);
        const total = this.toNumber(data.total) ?? 0;
        if (allItems.length >= total) break;
        page++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to fetch call logs: ${msg}`);
    }

    return { records: allItems, total: allItems.length };
  }

  // ========== 业务记录 ==========

  async fetchBusinessNotes(params: {
    startDate?: string;
    endDate?: string;
    category?: string;
    page?: number;
    perPage?: number;
  }): Promise<{ records: Record<string, unknown>[]; meta?: Record<string, unknown> }> {
    if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
      return { records: [], meta: {} };
    }

    try {
      const resp = await this.openApiGet('notes', {
        ...(params.startDate ? { start_date: params.startDate } : {}),
        ...(params.endDate ? { end_date: params.endDate } : {}),
        ...(params.category ? { category: params.category } : {}),
        page: String(params.page ?? 1),
        per_page: String(params.perPage ?? 50),
      });
      const data = (resp.data ?? {}) as Record<string, unknown>;
      if (data.code !== 1000) {
        this.logger.warn(`notes API 返回异常: ${JSON.stringify(data)}`);
        return { records: [], meta: {} };
      }
      const records = Array.isArray(data.note_record) ? data.note_record as Record<string, unknown>[] : [];
      const meta = data.meta as Record<string, unknown> | undefined;
      return { records, meta };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to fetch business notes: ${msg}`);
      return { records: [], meta: {} };
    }
  }

  // ========== 自定义字段选项树（级联字段解析用） ==========

  async fetchFieldOptions(fieldId: string): Promise<Record<string, unknown>[]> {
    if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
      return [];
    }

    try {
      const resp = await this.openApiGet(`custom_fields/${fieldId}`, {});
      const data = (resp.data ?? {}) as Record<string, unknown>;
      if (data.code !== 1000) return [];
      const field = (data.field ?? (Array.isArray(data.fields) ? (data.fields as Record<string, unknown>[])[0] : undefined)) as Record<string, unknown> | undefined;
      return (field?.options as Record<string, unknown>[]) ?? [];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to fetch field options for ${fieldId}: ${msg}`);
      return [];
    }
  }

  // ========== 通话记录映射 ==========

  mapCallLog(item: Record<string, unknown>): UdescCallLogRecord {
    const survey = this.pickString(item, ['survey']);
    const isRated = (s: string) => s?.includes('已评') && !s?.includes('未评');
    const isSatisfied = (s: string) => s?.includes('满意') && !s?.includes('不满');
    let satisfaction: string | undefined;
    if (survey) {
      if (isRated(survey)) satisfaction = isSatisfied(survey) ? '满意' : '不满意';
      else satisfaction = '未评';
    }
    const startTime = this.pickString(item, ['call_start_at', 'start_time', 'startTime']);
    return {
      id: this.pickString(item, ['id']) ?? '',
      callType: this.pickString(item, ['call_type', 'callType']),
      callResult: this.pickString(item, ['call_result', 'callResult']),
      customerPhone: this.pickString(item, ['customer_phone', 'customerPhone']),
      agentName: this.pickString(item, ['agent_name', 'agentName']),
      callTime: this.toNumber(this.pickString(item, ['call_time', 'callTime'])),
      startTime,
      survey,
      satisfaction,
      rawPayload: item as Record<string, unknown>,
    };
  }

  // ========== 业务记录映射 ==========

  private fieldOptionsCache: {
    fieldId: string;
    tree: Record<string, unknown>[];
    fetchedAt: number;
  } | null = null;

  async getFieldOptionsTree(fieldId: string): Promise<Record<string, unknown>[]> {
    // 缓存 5 分钟，避免每次同步都请求
    if (this.fieldOptionsCache && this.fieldOptionsCache.fieldId === fieldId && Date.now() - this.fieldOptionsCache.fetchedAt < 300000) {
      return this.fieldOptionsCache.tree;
    }
    const tree = await this.fetchFieldOptions(fieldId);
    this.fieldOptionsCache = { fieldId, tree, fetchedAt: Date.now() };
    return tree;
  }

  async mapBusinessNote(item: Record<string, unknown>): Promise<UdescBusinessNoteRecord> {
    const fieldId = 'SelectField_19997';
    const tree = await this.getFieldOptionsTree(fieldId);
    const raw = (item.custom_fields as Record<string, unknown>)?.[fieldId] ?? '';
    const levels = this.parseCascade(String(raw), tree);
    const createdAt = this.pickString(item, ['created_at', 'createdAt']);
    return {
      id: this.pickString(item, ['id']) ?? '',
      agentNickName: this.pickString(item, ['agent_nick_name', 'agentNickName']),
      customerNickName: this.pickString(item, ['customer_nick_name', 'customerNickName']),
      createdAt,
      problemType1: levels[0] ?? '',
      problemType2: levels[1] ?? '',
      problemType3: levels[2] ?? '',
      rawPayload: item as Record<string, unknown>,
    };
  }

  // ========== 级联字段解析 ==========

  parseCascade(valueStr: string, tree: Record<string, unknown>[]): string[] {
    if (!valueStr) return [];
    const parts = valueStr.split(',').map(p => p.trim());
    const result: string[] = [];
    let level: Record<string, unknown>[] = tree;
    for (const part of parts) {
      if (!level || level.length === 0) {
        result.push(`[${part}]`);
        continue;
      }
      let found = false;
      for (const opt of level) {
        if (String(opt.value ?? '') === part) {
          result.push(String(opt.title ?? `[${part}]`));
          level = (opt.subs as Record<string, unknown>[]) ?? [];
          found = true;
          break;
        }
      }
      if (!found) {
        result.push(`[${part}]`);
        level = [];
      }
    }
    return result;
  }
}
