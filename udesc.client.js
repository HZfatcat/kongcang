"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var UdescClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UdescClient = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const crypto_1 = require("crypto");
let UdescClient = UdescClient_1 = class UdescClient {
    constructor() {
        this.logger = new common_1.Logger(UdescClient_1.name);
        const baseURL = (process.env.UDESC_BASE_URL ?? '').replace(/\/+$/, '');
        this.http = axios_1.default.create({
            baseURL,
            timeout: 10000,
        });
    }
    parseTokenFromLoginBody(data) {
        if (data.code !== 1000) {
            return undefined;
        }
        const token = data.open_api_auth_token ??
            data.token ??
            data.open_api_token ??
            (typeof data.admin === 'object' && data.admin
                ? data.admin.open_api_auth_token ??
                    data.admin.token
                : undefined);
        if (!token) {
            return undefined;
        }
        return String(token);
    }
    async ensureOpenApiToken() {
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
        const data = resp.data;
        const token = this.parseTokenFromLoginBody(data);
        if (!token) {
            throw new Error(`udesc log_in 未获取到 token: ${JSON.stringify(data)}`);
        }
        this.runtimeOpenApiToken = token;
        return token;
    }
    async signOpenApiQuery() {
        const email = (process.env.UDESC_EMAIL ?? '').trim();
        if (!email) {
            throw new Error('UDESC_EMAIL 不能为空');
        }
        const token = await this.ensureOpenApiToken();
        const signVersion = process.env.UDESC_SIGN_VERSION ?? 'v2';
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = (0, crypto_1.randomBytes)(16).toString('hex');
        const raw = `${email}&${token}&${timestamp}&${nonce}&${signVersion}`;
        const sign = (0, crypto_1.createHash)('sha256').update(raw, 'utf8').digest('hex');
        return {
            email,
            timestamp,
            nonce,
            sign,
            sign_version: signVersion,
        };
    }
    async openApiGet(path, params) {
        const signed = await this.signOpenApiQuery();
        const fullPath = path.startsWith('/open_api_v1/') ? path : `/open_api_v1/${path.replace(/^\/+/, '')}`;
        return this.http.get(fullPath, {
            params: {
                ...signed,
                ...params,
            },
        });
    }
    extractItems(data) {
        const candidates = [data.items, data.item, data.results, data.data, data.contents];
        for (const value of candidates) {
            if (Array.isArray(value)) {
                return value.filter((item) => typeof item === 'object' && item !== null);
            }
        }
        return [];
    }
    toNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim()) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : undefined;
        }
        return undefined;
    }
    toStringValue(value) {
        if (value === null || value === undefined) {
            return undefined;
        }
        const text = String(value).trim();
        return text ? text : undefined;
    }
    pickString(item, keys) {
        for (const key of keys) {
            const value = this.toStringValue(item[key]);
            if (value) {
                return value;
            }
        }
        return undefined;
    }
    pickBoolean(item, keys) {
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
    pickRating(item) {
        const normalize = (value) => {
            if (value === undefined) {
                return undefined;
            }
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
            const nested = vote;
            return normalize(this.toNumber(nested.rating ?? nested.score ?? nested.vote_score ?? nested.satisfaction_level));
        }
        const resolvedState = this.toStringValue(item.resolved_state);
        if (resolvedState === '0') {
            return 5;
        }
        if (resolvedState === '1') {
            return 1;
        }
        return undefined;
    }
    mapSession(item, fallbackStartDate) {
        const startedAt = this.pickString(item, ['start_time', 'session_start_at', 'started_at', 'created_at']) ??
            fallbackStartDate;
        const endedAt = this.pickString(item, ['end_time', 'session_end_at', 'ended_at', 'closed_at']);
        const updatedAt = this.pickString(item, ['updated_at', 'end_time', 'created_at', 'closed_at']);
        return {
            id: this.pickString(item, ['session_id', 'im_session_id', 'id', 'im_sub_session_id']) ??
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
    mapMessage(item, sessionId) {
        const sentAt = this.pickString(item, ['created_at', 'send_time', 'sent_at', 'timestamp']) ?? new Date().toISOString();
        let senderType = this.pickString(item, ['sender_type', 'message_from', 'role', 'from_type', 'sender']);
        if (!senderType) {
        }
        const senderId = this.pickString(item, ['sender_id', 'user_id', 'agent_id', 'from_id']);
        const content = this.pickString(item, ['content', 'message', 'body', 'text']);
        const messageId = this.pickString(item, ['id', 'message_id', 'msg_id']) ?? `${sessionId}-${sentAt}-${(0, crypto_1.randomBytes)(6).toString('hex')}`;
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
    async fetchSessions(params) {
        if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
            this.logger.warn('UDESC_BASE_URL 未配置真实地址，跳过远端同步，返回空数据。');
            return { records: [], hasMore: false };
        }
        const page = Math.max(1, Number(params.cursor ?? '1'));
        const endpoint = process.env.UDESC_IM_SESSION_PATH ?? 'im/sessions/search';
        try {
            const resp = await this.openApiGet(endpoint, {
                page: String(page),
                page_size: String(params.pageSize),
                start_time: params.startDate,
                end_time: params.endDate,
            });
            const data = (resp.data ?? {});
            const items = this.extractItems(data);
            const records = items.map((item) => this.mapSession(item, params.startDate));
            const hasMoreFlag = this.pickBoolean(data, ['has_more']);
            const currentPage = this.toNumber(data.page) ?? page;
            const totalPages = this.toNumber(data.total_pages);
            const fallbackHasMore = records.length >= params.pageSize;
            const hasMore = hasMoreFlag ?? (totalPages !== undefined ? currentPage < totalPages : fallbackHasMore);
            const nextCursor = hasMore ? String(currentPage + 1) : undefined;
            return {
                records,
                nextCursor,
                hasMore,
            };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Failed to fetch sessions (page=${page}, start=${params.startDate}, end=${params.endDate}): ${msg}`);
            throw e;
        }
    }
    async fetchSessionLogs(params) {
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
        const data = (resp.data ?? {});
        const items = this.extractItems(data);
        const records = items.map((item) => this.mapMessage(item, params.sessionId));
        const hasMoreFlag = this.pickBoolean(data, ['has_more']);
        const currentPage = this.toNumber(data.page) ?? page;
        const totalPages = this.toNumber(data.total_pages);
        const fallbackHasMore = records.length >= params.pageSize;
        const hasMore = hasMoreFlag ?? (totalPages !== undefined ? currentPage < totalPages : fallbackHasMore);
        const nextCursor = hasMore ? String(currentPage + 1) : undefined;
        return {
            records,
            nextCursor,
            hasMore,
        };
    }
    async fetchSessionVotes(params) {
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
        const data = (resp.data ?? {});
        const items = this.extractItems(data);
        const records = items.map((item) => ({
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
    async fetchCustomers(params) {
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
        const data = (resp.data ?? {});
        const items = this.extractItems(data);
        const records = items.map((item) => ({
            id: this.pickString(item, ['id', 'customer_id', 'user_id']) ?? `${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`,
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
    async fetchAgents(params) {
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
            const data = (resp.data ?? {});
            this.logger.debug(`Agent API response keys: ${Object.keys(data).join(', ')}`);
            const items = this.extractItems(data);
            this.logger.log(`Agent API returned ${items.length} items`);
            const records = items.map((item) => ({
                id: this.pickString(item, ['id', 'agent_id', 'user_id']) ?? `${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`,
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
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Failed to fetch agents: ${msg}`);
            return { records: [], hasMore: false };
        }
    }
    async fetchSessionStats(sessionId) {
        if (!process.env.UDESC_BASE_URL || process.env.UDESC_BASE_URL.includes('example.com')) {
            return undefined;
        }
        try {
            const endpoint = process.env.UDESC_SESSION_STATS_PATH ?? 'im/sessions/stats';
            const resp = await this.openApiGet(endpoint, { session_id: sessionId });
            const data = (resp.data ?? {});
            return {
                firstResponseTime: this.toNumber(data.first_response_time ?? data.first_reply_time),
                avgResponseTime: this.toNumber(data.avg_response_time ?? data.average_response_time),
                waitTime: this.toNumber(data.wait_time ?? data.queue_time),
                resolutionTime: this.toNumber(data.resolution_time ?? data.solve_time),
                messageCount: this.toNumber(data.message_count ?? data.msg_count) ?? 0,
                agentMessageCount: this.toNumber(data.agent_message_count ?? data.agent_msg_count) ?? 0,
                customerMessageCount: this.toNumber(data.customer_message_count ?? data.user_msg_count) ?? 0,
            };
        }
        catch {
            return undefined;
        }
    }
    parseTags(value) {
        if (!value)
            return undefined;
        if (Array.isArray(value)) {
            const tags = value
                .filter((v) => typeof v === 'string' && v.trim() !== '')
                .map((v) => v.trim());
            return tags.length > 0 ? tags : undefined;
        }
        if (typeof value === 'string' && value.trim()) {
            return value.split(/[,，;；]/).map((s) => s.trim()).filter(Boolean);
        }
        return undefined;
    }
    parseStringArray(value) {
        if (!value)
            return undefined;
        if (Array.isArray(value)) {
            const arr = value
                .filter((v) => typeof v === 'string' && v.trim() !== '')
                .map((v) => v.trim());
            return arr.length > 0 ? arr : undefined;
        }
        return undefined;
    }
    parseCustomFields(value) {
        if (!value)
            return undefined;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return value;
        }
        return undefined;
    }
    async fetchOrganizations(params) {
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
            const data = (resp.data ?? {});
            const items = this.extractItems(data);
            const orgItems = Array.isArray(data.organizations) ? data.organizations : items;
            const records = orgItems
                .filter((item) => typeof item === 'object' && item !== null)
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
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Failed to fetch organizations: ${msg}`);
            return { records: [], hasMore: false };
        }
    }
    async fetchTickets(params) {
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
            const data = (resp.data ?? {});
            const contents = Array.isArray(data.contents) ? data.contents : [];
            const ticketItems = contents
                .map((c) => c?.ticket)
                .filter((t) => typeof t === 'object' && t !== null);
            const records = ticketItems.map((item) => ({
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
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Failed to fetch tickets: ${msg}`);
            return { records: [], hasMore: false };
        }
    }
};
exports.UdescClient = UdescClient;
exports.UdescClient = UdescClient = UdescClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], UdescClient);
//# sourceMappingURL=udesc.client.js.map