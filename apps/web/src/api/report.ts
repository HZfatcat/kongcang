import { apiClient } from './client';
import type { DemandOverview, ConsultationFunnelOverview, KpiOverview } from '../types/kpi';

export interface ReportData {
  kpiOverview: KpiOverview | null;
  demandOverview: DemandOverview | null;
  funnel: ConsultationFunnelOverview | null;
  loading: boolean;
}

export async function fetchReportData(startDate: string, endDate: string): Promise<ReportData> {
  const [kpiResp, demandResp, funnelResp] = await Promise.all([
    apiClient.get('/kpi/overview', { params: { startDate, endDate } }),
    apiClient.get('/kpi/demand', { params: { startDate, endDate } }),
    apiClient.get('/kpi/consultation-funnel', {
      params: { startDate, endDate, granularity: 'week' },
    }),
  ]);

  return {
    kpiOverview: kpiResp.data,
    demandOverview: demandResp.data,
    funnel: funnelResp.data,
    loading: false,
  };
}
