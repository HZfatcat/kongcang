import { apiClient } from './client';
import type { DemandOverview, KpiOverview, SyncRunRecord } from '../types/kpi';

export async function fetchOverview(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<KpiOverview>('/kpi/overview', { params });
  return resp.data;
}

export async function fetchDemandOverview(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<DemandOverview>('/kpi/demand', { params });
  return resp.data;
}

export async function runSync() {
  const resp = await apiClient.post('/sync/run');
  return resp.data;
}

export async function fetchSyncRuns() {
  const resp = await apiClient.get<SyncRunRecord[]>('/sync/runs');
  return resp.data;
}
