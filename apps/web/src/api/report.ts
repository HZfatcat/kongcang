import { apiClient } from './client';
import type { KpiOverview, DemandOverview, ConsultationFunnelOverview } from '../types/kpi';

export interface ReportData {
  kpiOverview: KpiOverview | null;
  demandOverview: DemandOverview | null;
  funnel: ConsultationFunnelOverview | null;
}

/**
 * 获取周报所需的聚合数据：KPI 概览、需求概览、咨询漏斗
 */
export async function fetchReportData(startDate?: string, endDate?: string): Promise<ReportData> {
  const [kpiOverview, demandOverview, funnel] = await Promise.all([
    apiClient.get<KpiOverview>('/kpi/overview', { params: { startDate, endDate } }).then(r => r.data).catch(() => null),
    apiClient.get<DemandOverview>('/kpi/demand', { params: { startDate, endDate } }).then(r => r.data).catch(() => null),
    apiClient.get<ConsultationFunnelOverview>('/kpi/consultation-funnel', { params: { startDate, endDate, granularity: 'week' } }).then(r => r.data).catch(() => null),
  ]);
  return { kpiOverview, demandOverview, funnel };
}
