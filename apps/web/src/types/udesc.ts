export interface UdescOverview {
  dateRange: { startDate: string; endDate: string };
  totalSessions: number;
  totalMessages: number;
  avgMessagesPerSession: number;
  agentCount: number;
  ratedCount: number;
  avgRating: number;
  topAgents: Array<{ agentId: string; sessions: number }>;
}

export interface UdescTreeNode {
  agentId: string;
  sessionCount: number;
  avgRating: number | null;
  sessions: Array<{
    id: string;
    startedAt: string;
    endedAt?: string;
    rating: number | null;
    messageCount: number;
  }>;
}

export interface UdescSessionMessage {
  id: string;
  sentAt: string;
  senderType?: string;
  senderId?: string;
  content?: string;
}

export interface UdescSessionRecord {
  id: string;
  agentId?: string;
  startedAt: string;
  endedAt?: string;
  rating: number | null;
  isConsultToDemand: boolean;
  messageCount: number;
  messages: UdescSessionMessage[];
}

export interface UdescSessionListResp {
  page: number;
  pageSize: number;
  total: number;
  records: UdescSessionRecord[];
}

export interface SyncProgress {
  source: string;
  isRunning: boolean;
  runId?: string;
  startedAt?: string;
  finishedAt?: string;
  currentWindowStart?: string;
  currentWindowEnd?: string;
  totalWindows: number;
  processedWindows: number;
  sessionSynced: number;
  messageSynced: number;
  issueCount: number;
  estimatedRemainingRecords: number;
  estimatedRemainingSeconds: number;
  note?: string;
}

export interface SyncIssue {
  id: string;
  runId: string;
  source: string;
  category: string;
  externalId?: string;
  errorMessage: string;
  createdAt: string;
}

export interface UdescDailyAgentStats {
  dateRange: { startDate: string; endDate: string };
  days: string[];
  series: Array<{
    agentId: string;
    sessions: number[];
    messages: number[];
  }>;
}

export interface AgentProfile {
  agentId: string;
  displayName: string;
  team?: string;
  role?: string;
  enabled: boolean;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

