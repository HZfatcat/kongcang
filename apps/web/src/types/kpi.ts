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

export interface SyncRunRecord {
  id: string;
  source: string;
  startedAt: string;
  finishedAt?: string;
  status: string;
  message?: string;
  recordsSynced: number;
}
