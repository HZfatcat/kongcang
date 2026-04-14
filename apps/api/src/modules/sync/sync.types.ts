export interface UdescSessionRecord {
  id: string;
  agentId?: string;
  startedAt: string;
  endedAt?: string;
  rating?: number;
  isConsultToDemand?: boolean;
  updatedAt?: string;
  rawPayload?: Record<string, unknown>;
}

export interface UdescMessageRecord {
  id: string;
  sessionId: string;
  sentAt: string;
  senderType?: string;
  senderId?: string;
  content?: string;
  rawPayload?: Record<string, unknown>;
}

export interface ZouwuRequirementRecord {
  id: string;
  title: string;
  sourceSessionId?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CLOSED' | 'REJECTED';
  createdAt: string;
  completedAt?: string;
  updatedAt?: string;
  rawPayload?: Record<string, unknown>;
}

export interface SyncFetchResult<T> {
  records: T[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface ZouwuCloseRateStat {
  scope: 'requirement' | 'bug' | 'all';
  issueType: '0' | '1' | null;
  total: number;
  excludedByLongTermAccepted: number;
  closedOrRejected: number;
  denominator: number;
  closeRate: number | null;
}

export interface ZouwuFeedbackStatistics {
  baseUrl: string;
  startCreatedTime: string;
  endCreatedTime: string;
  longTermLabelName: string;
  longTermLabelId: number;
  newRequirements: number;
  newBugs: number;
  closeRates: ZouwuCloseRateStat[];
}
