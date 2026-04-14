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

export interface SyncRun {
  id: string;
  source: string;
  startedAt: string;
  finishedAt?: string;
  status: string;
  message?: string;
  recordsSynced: number;
}

export interface SyncSummary {
  source: string;
  totalSessions: number;
  totalMessages: number;
  totalRecords: number;
  issueCount: number;
  latestSuccessAt?: string | null;
  latestRun?: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt?: string | null;
    recordsSynced: number;
    message?: string | null;
  } | null;
  checkpoint?: {
    cursor?: string | null;
    lastSyncedAt?: string | null;
  } | null;
}

export interface SyncConfig {
  source: string;
  enabled: boolean;
  intervalHours: number;
  updatedAt: string;
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

export interface WecomEmployee {
  userId: string;
  name?: string;
  department?: string;
  position?: string;
  mobile?: string;
  email?: string;
  avatar?: string;
  enabled: boolean;
  isCustomerService: boolean;
  remark?: string;
  createdAt: string;
  updatedAt: string;
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

