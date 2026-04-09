import { apiClient } from './client';
import type {
  AgentProfile,
  SyncIssue,
  SyncProgress,
  UdescDailyAgentStats,
  UdescOverview,
  UdescSessionListResp,
  UdescTreeNode,
} from '../types/udesc';

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
}) {
  const resp = await apiClient.get<UdescSessionListResp>('/udesc/sessions', { params });
  return resp.data;
}

export async function runSync() {
  const resp = await apiClient.post<{ accepted: boolean }>('/sync/run');
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

export async function retrySyncIssues() {
  const resp = await apiClient.post<{ accepted: boolean; reason: string; issueCount: number }>('/sync/issues/retry');
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

