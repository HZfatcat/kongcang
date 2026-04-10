export interface KpiOverview {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  satisfactionRate: number;
  ratedSessions: number;
  consultToDemandCount: number;
  completedDemandCount: number;
  demandCompletionRate: number;
}

export interface DemandOverview {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  totalIdentifiedCount: number;
  completedCount: number;
  completionRate: number;
  linkedSessionCount: number;
  bugCount: number;
  statusBreakdown: Record<string, number>;
  daily: {
    days: string[];
    created: number[];
    completed: number[];
  };
  recentRequirements: Array<{
    id: string;
    title: string;
    status: string;
    sourceSessionId?: string | null;
    createdAtSource: string;
    completedAtSource?: string;
  }>;
}

export interface ConsultationFunnelPoint {
  periodStart: string;
  periodLabel: string;
  consultationCount: number;
  issueConsultCount: number;
  feedbackCount: number;
  newRequirementCount: number;
  solvedCount: number;
  releaseCount: number;
  opportunityCount: number;
  opportunityWonCount: number;
}

export interface ConsultationFunnelOverview {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  granularity: 'day' | 'week' | 'month';
  stages: Array<{ key: string; label: string }>;
  periods: ConsultationFunnelPoint[];
}

export interface SyncRunRecord {
  id: string;
  source: string;
  startedAt: string;
  finishedAt?: string;
  status: string;
  message?: string;
  recordsSynced: number;
}
