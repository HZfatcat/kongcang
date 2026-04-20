import { apiClient } from './client';

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  module?: string;
  source?: string;
  action?: string;
  message: string;
  context?: Record<string, unknown>;
  userId?: string;
  correlationId?: string;
  duration?: number;
}

export interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  byModule: Record<string, number>;
}

export interface LogQueryParams {
  level?: string;
  module?: string;
  source?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function getLogs(params: LogQueryParams) {
  const resp = await apiClient.get<{ items: SystemLog[]; total: number; page: number; pageSize: number; totalPages: number }>('/logs', { params });
  return resp.data;
}

export async function getLogStats(params?: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<LogStats>('/logs/stats', { params });
  return resp.data;
}

export async function getLogById(id: string) {
  const resp = await apiClient.get<SystemLog>(`/logs/${id}`);
  return resp.data;
}

export async function clearLogs(beforeDays: number = 30) {
  const resp = await apiClient.delete<{ deleted: number }>('/logs/clear', { params: { beforeDays } });
  return resp.data;
}
