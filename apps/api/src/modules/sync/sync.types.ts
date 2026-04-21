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

// 评价详情记录
export interface UdescVoteRecord {
  sessionId: string;
  rating?: number;
  tags?: string[];
  comment?: string;
  voterId?: string;
  voterName?: string;
  votedAt?: string;
  rawPayload?: Record<string, unknown>;
}

// 客户信息记录
export interface UdescCustomerRecord {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  wechat?: string;
  enterprise?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  rawPayload?: Record<string, unknown>;
}

// 客服信息记录
export interface UdescAgentRecord {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  roleId?: string;
  roleName?: string;
  enabled?: boolean;
  groups?: string[];
  skills?: string[];
  rawPayload?: Record<string, unknown>;
}

// 会话统计扩展
export interface UdescSessionStats {
  firstResponseTime?: number; // 首次响应时间(秒)
  avgResponseTime?: number; // 平均响应时间(秒)
  waitTime?: number; // 排队等待时间(秒)
  resolutionTime?: number; // 解决时间(秒)
  messageCount: number;
  agentMessageCount: number;
  customerMessageCount: number;
}

export interface ZouwuRequirementRecord {
  id: string;
  title: string;
  sourceSessionId?: string;
  issueType?: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CLOSED' | 'REJECTED';
  isLongTerm?: boolean;
  createdById?: string;
  createdByName?: string;
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
