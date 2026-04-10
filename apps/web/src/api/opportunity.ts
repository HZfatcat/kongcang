import { apiClient } from './client';
import type { OpportunityListResp, OpportunitySummary } from '../types/opportunity';

export async function fetchOpportunityList(params: {
  startDate?: string;
  endDate?: string;
  status?: string;
  sourceType?: string;
  agentId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const resp = await apiClient.get<OpportunityListResp>('/opportunities', { params });
  return resp.data;
}

export async function fetchOpportunitySummary(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<OpportunitySummary>('/opportunities/summary', { params });
  return resp.data;
}

export async function upsertOpportunity(payload: Record<string, unknown>) {
  const resp = await apiClient.post('/opportunities/upsert', payload);
  return resp.data;
}

export async function updateOpportunityStatus(id: string, payload: { status: string; closeReason?: string }) {
  const resp = await apiClient.post(`/opportunities/${encodeURIComponent(id)}/status`, payload);
  return resp.data;
}

export async function deleteOpportunity(id: string) {
  const resp = await apiClient.delete(`/opportunities/${encodeURIComponent(id)}`);
  return resp.data;
}
