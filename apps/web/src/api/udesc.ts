import { apiClient } from './client';
import type {
  AgentProfile,
  SyncConfig,
  SyncIssue,
  SyncProgress,
  SyncRun,
  SyncSummary,
  UdescDailyAgentStats,
  UdescOverview,
  UdescSessionListResp,
  UdescTreeNode,
  ZouwuFeedbackStatistics,
  UdescVoteListResp,
  UdescAgentListResp,
  UdescAgentPerformance,
  UdescMetricsListResp,
  UdescMetricsSummary,
} from '../types/udesc';
import type { WecomEmployee } from '../types/udesc';

export async function fetchUdescOverview(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<UdescOverview>('/udesc/overview', { params });
  return resp.data;
}

export async function fetchUdescTree(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<UdescTreeNode[]>('/udesc/tree', { params });
  return resp.data;
}

export async function fetchUdescDailyAgentStats(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<UdescDailyAgentStats>('/udesc/daily-agent-stats', { params });
  return resp.data;
}

export async function fetchUdescSessions(params: {
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
  agentId?: string;
  agentIds?: string;
  sessionId?: string;
}) {
  console.log('[API] fetchUdescSessions params:', JSON.stringify(params));
  const resp = await apiClient.get<UdescSessionListResp>('/udesc/sessions', { params });
  console.log('[API] fetchUdescSessions response:', resp.data.total, 'records');
  return resp.data;
}

export async function runSync() {
  const resp = await apiClient.post<{ accepted: boolean }>('/sync/run');
  return resp.data;
}

export async function runZouwuSync(options?: { startDate?: string; endDate?: string; resetCursor?: boolean }) {
  const resp = await apiClient.post<{ accepted: boolean; reason?: string; startDate?: string; endDate?: string }>('/sync/zouwu/run', options);
  return resp.data;
}

export async function fetchSyncProgress() {
  const resp = await apiClient.get<SyncProgress>('/sync/progress');
  return resp.data;
}

export async function fetchSyncIssues() {
  const resp = await apiClient.get<SyncIssue[]>('/sync/issues');
  return resp.data;
}

export async function fetchSyncRuns() {
  const resp = await apiClient.get<SyncRun[]>('/sync/runs');
  return resp.data;
}

export async function fetchSyncSummary() {
  const resp = await apiClient.get<SyncSummary>('/sync/summary');
  return resp.data;
}

export async function retrySyncIssues() {
  const resp = await apiClient.post<{ accepted: boolean; reason: string; issueCount: number }>('/sync/issues/retry');
  return resp.data;
}

export async function fetchSyncConfig() {
  const resp = await apiClient.get<SyncConfig>('/sync/config');
  return resp.data;
}

export async function updateSyncConfig(payload: { enabled?: boolean; intervalHours?: number }) {
  const resp = await apiClient.post<SyncConfig>('/sync/config', payload);
  return resp.data;
}

export async function fetchZouwuSyncConfig() {
  const resp = await apiClient.get<SyncConfig>('/sync/zouwu/config');
  return resp.data;
}

export async function updateZouwuSyncConfig(payload: { enabled?: boolean; intervalHours?: number }) {
  const resp = await apiClient.post<SyncConfig>('/sync/zouwu/config', payload);
  return resp.data;
}

export async function fetchZouwuFeedbackStats(params: {
  start?: string;
  end?: string;
  token?: string;
}) {
  const resp = await apiClient.get<ZouwuFeedbackStatistics>('/sync/zouwu/feedback-stats', { params });
  return resp.data;
}

export async function fetchAgents() {
  const resp = await apiClient.get<AgentProfile[]>('/agents');
  return resp.data;
}

export async function fetchUdescAgentIds() {
  const resp = await apiClient.get<string[]>('/agents/udesc-agent-ids');
  return resp.data;
}

export async function upsertAgent(payload: {
  agentId: string;
  displayName: string;
  team?: string;
  role?: string;
  enabled?: boolean;
  remark?: string;
}) {
  const resp = await apiClient.post<AgentProfile>('/agents/upsert', payload);
  return resp.data;
}

export async function deleteAgent(agentId: string) {
  const resp = await apiClient.delete(`/agents/${encodeURIComponent(agentId)}`);
  return resp.data;
}

export async function fetchWecomEmployees() {
  const resp = await apiClient.get<WecomEmployee[]>('/wecom-employee');
  return resp.data;
}

export async function upsertWecomEmployee(payload: {
  userId: string;
  name?: string;
  department?: string;
  position?: string;
  mobile?: string;
  email?: string;
  avatar?: string;
  enabled?: boolean;
  isCustomerService?: boolean;
  remark?: string;
}) {
  const resp = await apiClient.post<WecomEmployee>('/wecom-employee/upsert', payload);
  return resp.data;
}

export async function deleteWecomEmployee(userId: string) {
  const resp = await apiClient.delete(`/wecom-employee/${encodeURIComponent(userId)}`);
  return resp.data;
}

// ========== 评价分析 ==========
export async function fetchUdescVotes(params: {
  startDate?: string;
  endDate?: string;
  minRating?: number;
  maxRating?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}) {
  const resp = await apiClient.get<UdescVoteListResp>('/udesc/votes', { params });
  return resp.data;
}

// ========== 客服管理 ==========
export async function fetchUdescAgents(params?: { enabled?: boolean }) {
  const resp = await apiClient.get<UdescAgentListResp>('/udesc/agents', { params });
  return resp.data;
}

export async function fetchUdescAgentPerformance(agentId: string, params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<UdescAgentPerformance>(`/udesc/agents/${encodeURIComponent(agentId)}/performance`, { params });
  return resp.data;
}

// ========== 会话性能指标 ==========
export async function fetchUdescMetrics(params: {
  startDate?: string;
  endDate?: string;
  agentId?: string;
  agentIds?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const resp = await apiClient.get<UdescMetricsListResp>('/udesc/metrics', { params });
  return resp.data;
}

export async function fetchUdescMetricsSummary(params: { startDate?: string; endDate?: string; agentId?: string }) {
  const resp = await apiClient.get<UdescMetricsSummary>('/udesc/metrics/summary', { params });
  return resp.data;
}

export async function fetchUdescAgentMetricsSummary(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<AgentMetricsSummary[]>('/udesc/metrics/agent-summary', { params });
  return resp.data;
}

export interface AgentMetricsSummary {
  agentId: string;
  agentName: string;
  sessionCount: number;
  avgFirstResponseTime: number | null;
  avgResponseTime: number | null;
  avgWaitTime: number | null;
  avgResolutionTime: number | null;
  avgMessagesPerSession: number;
}

// ========== 工单分析 ==========

export interface UdescTicket {
  id: string;
  fieldNum?: string;
  subject?: string;
  source?: string;
  status?: string;
  statusEn?: string;
  priority?: string;
  satisfaction?: number | null;
  userName?: string;
  assigneeId?: string;
  assigneeName?: string;
  userGroupName?: string;
  createdAt?: string | null;
  firstRepliedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  imSubSessionId?: string;
}

export interface UdescTicketListResp {
  page: number;
  pageSize: number;
  total: number;
  records: UdescTicket[];
}

export interface UdescTicketSummary {
  dateRange: { startDate: string; endDate: string };
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byAssignee: Array<{
    assigneeId?: string;
    assigneeName?: string;
    count: number;
  }>;
  avgResolutionHours: number | null;
  avgFirstReplyHours: number | null;
  resolvedCount: number;
}

export interface UdescTicketDailyStats {
  dateRange: { startDate: string; endDate: string };
  days: string[];
  created: number[];
  resolved: number[];
}

export async function fetchUdescTickets(params: {
  startDate?: string;
  endDate?: string;
  status?: string;
  assigneeId?: string;
  priority?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): Promise<UdescTicketListResp> {
  const resp = await apiClient.get<UdescTicketListResp>('/udesc/tickets', { params });
  return resp.data;
}

export async function fetchUdescTicketSummary(params: {
  startDate?: string;
  endDate?: string;
  assigneeId?: string;
}): Promise<UdescTicketSummary> {
  const resp = await apiClient.get<UdescTicketSummary>('/udesc/tickets/summary', { params });
  return resp.data;
}

export async function fetchUdescTicketDailyStats(params: {
  startDate?: string;
  endDate?: string;
}): Promise<UdescTicketDailyStats> {
  const resp = await apiClient.get<UdescTicketDailyStats>('/udesc/tickets/daily-stats', { params });
  return resp.data;
}

