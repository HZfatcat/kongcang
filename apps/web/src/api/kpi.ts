import { useState, useEffect, useCallback } from 'react';
import { apiClient } from './client';
import type {
  ConsultationFunnelOverview,
  DemandOverview,
  KpiOverview,
  ProductModuleDistribution,
  SyncRunRecord,
  AgentOverview,
} from '../types/kpi';
import dayjs from 'dayjs';

export async function fetchOverview(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<KpiOverview>('/kpi/overview', { params });
  return resp.data;
}

export async function fetchDemandOverview(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<DemandOverview>('/kpi/demand', { params });
  return resp.data;
}

export async function fetchAgentOverview(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<AgentOverview>('/kpi/demand/agent', { params });
  return resp.data;
}

export async function fetchConsultationFunnel(params: {
  startDate?: string;
  endDate?: string;
  granularity?: 'day' | 'week' | 'month';
}) {
  const resp = await apiClient.get<ConsultationFunnelOverview>('/kpi/consultation-funnel', {
    params,
  });
  return resp.data;
}

export async function fetchProductModuleDistribution(params: {
  startDate?: string;
  endDate?: string;
  issueType?: '0' | '1';
}) {
  const resp = await apiClient.get<ProductModuleDistribution>('/kpi/product-module', { params });
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

// Hook for KPI data with date range support
export function useKpi() {
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => {
    const end = dayjs();
    const start = dayjs('2026-01-01');
    return [start.startOf('day'), end.endOf('day')];
  });
  const [demandOverview, setDemandOverview] = useState<DemandOverview | null>(null);
  const [demandLoading, setDemandLoading] = useState(false);

  const loadDemandOverview = useCallback(async () => {
    setDemandLoading(true);
    try {
      const data = await fetchDemandOverview({
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
      });
      setDemandOverview(data);
    } catch (error) {
      console.error('Failed to load demand overview:', error);
    } finally {
      setDemandLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadDemandOverview();
  }, [loadDemandOverview]);

  return {
    dateRange,
    setDateRange,
    demandOverview,
    demandLoading,
    refresh: loadDemandOverview,
  };
}
