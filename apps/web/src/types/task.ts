export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'REVIEWING' | 'COMPLETED' | 'CLOSED' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TaskRecord {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  assigneeName?: string;
  creatorId?: string;
  creatorName?: string;
  taskId?: string;
  taskType?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  closedAt?: string;
}

export interface TaskListResp {
  page: number;
  pageSize: number;
  total: number;
  records: TaskRecord[];
}

export interface TaskSummary {
  dateRange: { startDate: string; endDate: string };
  total: number;
  pending: number;
  inProgress: number;
  reviewing: number;
  completed: number;
  closed: number;
  cancelled: number;
  statusBreakdown: Record<string, number>;
}
