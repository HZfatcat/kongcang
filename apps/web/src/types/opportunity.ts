export type OpportunitySourceType = 'CONSULTATION' | 'MANUAL';
export type OpportunityStatus = 'NEW' | 'QUALIFIED' | 'FOLLOWING' | 'WON' | 'LOST';

export interface OpportunityRecord {
  id: string;
  title: string;
  description?: string;
  sourceType: OpportunitySourceType;
  sourceSessionId?: string;
  agentId?: string;
  customerName?: string;
  contactInfo?: string;
  estimatedAmount?: number;
  status: OpportunityStatus;
  closeReason?: string;
  closedAt?: string;
  nextAction?: string;
  // 新增字段
  username?: string;
  name?: string;
  phone?: string;
  email?: string;
  companyName?: string;
  requestType?: string;
  requestDetails?: string;
  feedbackChannel?: string;
  feedbackPerson?: string;
  feedbackResult?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityListResp {
  page: number;
  pageSize: number;
  total: number;
  records: OpportunityRecord[];
}

export interface OpportunitySummary {
  dateRange: { startDate: string; endDate: string };
  total: number;
  won: number;
  lost: number;
  winRate: number;
  consultingLinked: number;
  manualCreated: number;
  statusBreakdown: Record<string, number>;
}
