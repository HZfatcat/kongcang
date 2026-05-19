export interface UdeskOverview {
  dateRange: { startDate: string; endDate: string };
  totalSessions: number;
  totalMessages: number;
  avgMessagesPerSession: number;
  agentCount: number;
  ratedCount: number;
  avgRating: number;
  topAgents: Array<{ agentId: string; sessions: number }>;
  returnVisitCount: number;
}

export interface UdeskTreeNode {
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

export interface UdeskSessionMessage {
  id: string;
  sentAt: string;
  senderType?: string;
  senderId?: string;
  content?: string;
  rawPayload?: Record<string, unknown>;
}

export interface UdeskSessionRecord {
  id: string;
  agentId?: string;
  startedAt: string;
  endedAt?: string;
  rating: number | null;
  isConsultToDemand: boolean;
  messageCount: number;
  messages: UdeskSessionMessage[];
}

export interface UdeskSessionListResp {
  page: number;
  pageSize: number;
  total: number;
  records: UdeskSessionRecord[];
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

export interface UdeskDailyAgentStats {
  dateRange: { startDate: string; endDate: string };
  days: string[];
  series: Array<{
    agentId: string;
    sessions: number[];
    messages: number[];
  }>;
}

export interface UdeskDailyRatingStats {
  dateRange: { startDate: string; endDate: string };
  days: string[];
  series: Array<{
    agentId: string;
    ratings: (number | null)[];
  }>;
  overall: (number | null)[];
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

export interface UdeskSessionVote {
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

export interface UdeskVoteListResp {
  page: number;
  pageSize: number;
  total: number;
  totalSessions: number;
  records: UdeskSessionVote[];
  avgRating: number | null;
  ratingDistribution: Record<number, number>;
}

export interface UdeskAgentDetail {
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

export interface UdeskAgentListResp {
  records: UdeskAgentDetail[];
}

export interface UdeskAgentPerformance {
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

export interface UdeskSessionMetrics {
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

export interface UdeskMetricsListResp {
  page: number;
  pageSize: number;
  total: number;
  records: UdeskSessionMetrics[];
}

export interface UdeskMetricsSummary {
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

// ========== 工单分析 ==========

export interface UdeskTicket {
  id: string;
  fieldNum?: string;
  subject?: string;
  source?: string;
  status?: string;
  statusEn?: string;
  priority?: string;
  satisfaction?: number | null;
  userName?: string;
  assigneeId?: string;
  assigneeName?: string;
  userGroupName?: string;
  createdAt?: string | null;
  firstRepliedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  imSubSessionId?: string;
}

export interface UdeskTicketListResp {
  page: number;
  pageSize: number;
  total: number;
  records: UdeskTicket[];
}

export interface UdeskTicketSummary {
  dateRange: { startDate: string; endDate: string };
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byAssignee: Array<{
    assigneeId?: string;
    assigneeName?: string;
    count: number;
  }>;
  avgResolutionHours: number | null;
  avgFirstReplyHours: number | null;
  resolvedCount: number;
}

export interface UdeskTicketDailyStats {
  dateRange: { startDate: string; endDate: string };
  days: string[];
  created: number[];
  resolved: number[];
}
