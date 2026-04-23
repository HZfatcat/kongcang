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
  rawPayload?: Record<string, unknown>;
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
  resolvedAt?: string | null;
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

// ========== 新增：评价、客户、客服、指标 ==========

export interface UdescSessionVote {
  id: string;
  sessionId: string;
  rating: number | null;
  tags: string[];
  comment: string | null;
  voterId?: string | null;
  voterName: string | null;
  votedAt: string | null;
  agentId?: string;
  sessionStartedAt?: string;
}

export interface UdescVoteListResp {
  page: number;
  pageSize: number;
  total: number;
  totalSessions: number;
  records: UdescSessionVote[];
  avgRating: number | null;
  ratingDistribution: Record<number, number>;
}

export interface UdescAgentDetail {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  roleId: string | null;
  roleName: string | null;
  enabled: boolean;
  groups: string[];
  skills: string[];
  rawPayload: Record<string, unknown> | null;
  syncedAt: string;
  sessionCount?: number;
  avgRating?: number | null;
}

export interface UdescAgentListResp {
  records: UdescAgentDetail[];
}

export interface UdescAgentPerformance {
  agentId: string;
  dateRange: { startDate: string; endDate: string };
  totalSessions: number;
  avgRating: number | null;
  avgFirstResponseTime: number | null;
  avgResolutionTime: number | null;
  totalMessages: number;
  avgMessagesPerSession: number;
  dailyStats: Array<{
    date: string;
    sessions: number;
    avgRating: number | null;
    avgResponseTime: number | null;
  }>;
}

export interface UdescSessionMetrics {
  id: string;
  sessionId: string;
  agentId?: string;
  agentName?: string;
  startedAt?: string;
  endedAt?: string;
  sessionDuration?: number | null;
  firstResponseTime: number | null;
  avgResponseTime: number | null;
  waitTime: number | null;
  resolutionTime: number | null;
  messageCount: number;
  agentMessageCount: number;
  customerMessageCount: number;
  syncedAt: string;
  session?: {
    id: string;
    agentId?: string;
    startedAt: string;
    endedAt?: string;
  };
}

export interface UdescMetricsListResp {
  page: number;
  pageSize: number;
  total: number;
  records: UdescSessionMetrics[];
}

export interface UdescMetricsSummary {
  dateRange: { startDate: string; endDate: string };
  totalSessions: number;
  avgFirstResponseTime: number | null;
  avgResponseTime: number | null;
  avgWaitTime: number | null;
  avgResolutionTime: number | null;
  totalMessages: number;
  avgMessagesPerSession: number;
  avgAgentMessages: number;
  avgCustomerMessages: number;
}

