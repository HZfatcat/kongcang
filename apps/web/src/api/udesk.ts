import { apiClient } from './client';
import type {
  AgentProfile,
  SyncConfig,
  SyncIssue,
  SyncProgress,
  SyncRun,
  SyncSummary,
  UdeskDailyAgentStats,
  UdeskDailyRatingStats,
  UdeskOverview,
  UdeskSessionListResp,
  UdeskTreeNode,
  ZouwuFeedbackStatistics,
  UdeskVoteListResp,
  UdeskAgentListResp,
  UdeskAgentPerformance,
  UdeskMetricsListResp,
  UdeskMetricsSummary,
} from '../types/udesk';
import type { WecomEmployee } from '../types/udesk';

export async function fetchUdeskOverview(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<UdeskOverview>('/udesk/overview', { params });
  return resp.data;
}

export async function fetchUdeskTree(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<UdeskTreeNode[]>('/udesk/tree', { params });
  return resp.data;
}

export async function fetchUdeskDailyAgentStats(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<UdeskDailyAgentStats>('/udesk/daily-agent-stats', { params });
  return resp.data;
}

export async function fetchUdeskDailyRatingStats(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<UdeskDailyRatingStats>('/udesk/daily-rating-stats', { params });
  return resp.data;
}

export async function fetchUdeskSessions(params: {
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
  agentId?: string;
  agentIds?: string;
  sessionId?: string;
}) {
  console.log('[API] fetchUdeskSessions params:', JSON.stringify(params));
  const resp = await apiClient.get<UdeskSessionListResp>('/udesk/sessions', { params });
  console.log('[API] fetchUdeskSessions response:', resp.data.total, 'records');
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

export async function clearUdeskData() {
  const resp = await apiClient.post<{ ok: boolean; sessions: number; messages: number; votes: number }>('/sync/udesk/clear');
  return resp.data;
}

export async function smartFix() {
  const resp = await apiClient.post<{ ok: boolean; votes: number; messages: number; sessions: number; total: number }>('/sync/udesk/smart-fix');
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

export async function fetchUdeskAgentIds() {
  const resp = await apiClient.get<string[]>('/agents/udesk-agent-ids');
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
export async function fetchUdeskVotes(params: {
  startDate?: string;
  endDate?: string;
  minRating?: number;
  maxRating?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  sessionId?: string;
}) {
  const resp = await apiClient.get<UdeskVoteListResp>('/udesk/votes', { params });
  return resp.data;
}

// ========== 客服管理 ==========
export async function fetchUdeskAgents(params?: { enabled?: boolean }) {
  const resp = await apiClient.get<UdeskAgentListResp>('/udesk/agents', { params });
  return resp.data;
}

export async function fetchUdeskAgentPerformance(agentId: string, params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<UdeskAgentPerformance>(`/udesk/agents/${encodeURIComponent(agentId)}/performance`, { params });
  return resp.data;
}

// ========== 会话性能指标 ==========
export async function fetchUdeskMetrics(params: {
  startDate?: string;
  endDate?: string;
  agentId?: string;
  agentIds?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const resp = await apiClient.get<UdeskMetricsListResp>('/udesk/metrics', { params });
  return resp.data;
}

export async function fetchUdeskMetricsSummary(params: { startDate?: string; endDate?: string; agentId?: string }) {
  const resp = await apiClient.get<UdeskMetricsSummary>('/udesk/metrics/summary', { params });
  return resp.data;
}

export async function fetchUdeskAgentMetricsSummary(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<AgentMetricsSummary[]>('/udesk/metrics/agent-summary', { params });
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

export interface UdeskTicket {
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

export interface UdeskTicketListResp {
  page: number;
  pageSize: number;
  total: number;
  records: UdeskTicket[];
}

export interface UdeskTicketSummary {
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

export interface UdeskTicketDailyStats {
  dateRange: { startDate: string; endDate: string };
  days: string[];
  created: number[];
  resolved: number[];
}

export async function fetchUdeskTickets(params: {
  startDate?: string;
  endDate?: string;
  status?: string;
  assigneeId?: string;
  priority?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): Promise<UdeskTicketListResp> {
  const resp = await apiClient.get<UdeskTicketListResp>('/udesk/tickets', { params });
  return resp.data;
}

export async function fetchUdeskTicketSummary(params: {
  startDate?: string;
  endDate?: string;
  assigneeId?: string;
}): Promise<UdeskTicketSummary> {
  const resp = await apiClient.get<UdeskTicketSummary>('/udesk/tickets/summary', { params });
  return resp.data;
}

export async function fetchUdeskTicketDailyStats(params: {
  startDate?: string;
  endDate?: string;
}): Promise<UdeskTicketDailyStats> {
  const resp = await apiClient.get<UdeskTicketDailyStats>('/udesk/tickets/daily-stats', { params });
  return resp.data;
}

// ========== 时段热力图 ==========

export interface UdeskHeatmap {
  dateRange: { startDate: string; endDate: string };
  type: 'session' | 'ticket';
  hours: number[];
  days: string[];
  matrix: number[][]; // days[dayOfWeek][hour] -> count
  max: number;
  total: number;
  peakHours: { hour: number; count: number }[];
  peakDays: { day: number; dayName: string; count: number }[];
}

export async function fetchUdeskHeatmap(params: {
  startDate?: string;
  endDate?: string;
  agentId?: string;
  type?: 'session' | 'ticket';
}): Promise<UdeskHeatmap> {
  const resp = await apiClient.get<UdeskHeatmap>('/udesk/heatmap', { params });
  return resp.data;
}

