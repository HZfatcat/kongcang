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

export interface MonthlyCompletion {
  month: string;
  created: number;
  completed: number;
  rejectedCount: number;
  longTermCount: number;
  completionRate: number;
}

export interface DemandOverview {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  totalIdentifiedCount: number;
  totalWithLongTerm: number;
  completedCount: number;
  rejectedCount: number;
  longTermCount: number;
  completionRate: number;
  linkedSessionCount: number;
  bugCount: number;
  bugLongTermCount: number;
  bugCompletedCount: number;
  bugRejectedCount: number;
  bugCompletionRate: number;
  statusBreakdown: Record<string, number>;
  daily: {
    days: string[];
    created: number[];
    completed: number[];
  };
  monthlyRequirement: MonthlyCompletion[];
  monthlyBug: MonthlyCompletion[];
  recentRequirements: Array<{
    id: string;
    title: string;
    status: string;
    issueType?: number;
    isLongTerm?: boolean;
    sourceSessionId?: string | null;
    createdById?: string | null;
    createdByName?: string | null;
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
  requirementIdentifiedCount: number;
  requirementCompletedCount: number;
  releaseCount: number;
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

export interface ModuleDistributionItem {
  module: string;
  count: number;
  percentage: number;
}

export interface ProductModuleDistribution {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  total: number;
  distribution: ModuleDistributionItem[];
}
