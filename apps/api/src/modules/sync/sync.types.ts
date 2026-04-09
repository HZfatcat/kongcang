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
