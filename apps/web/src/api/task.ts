import { apiClient } from './client';
import type { TaskListResp, TaskSummary } from '../types/task';

export async function fetchTaskList(params: {
  startDate?: string;
  endDate?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  keyword?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  pageSize?: number;
}) {
  const resp = await apiClient.get<TaskListResp>('/tasks', { params });
  return resp.data;
}

export async function fetchTaskSummary(params: { startDate?: string; endDate?: string }) {
  const resp = await apiClient.get<TaskSummary>('/tasks/summary', { params });
  return resp.data;
}

export async function createTask(payload: {
  title: string;
  description?: string;
  priority?: string;
  assigneeId?: string;
  assigneeName?: string;
  taskId?: string;
  taskType?: string;
}) {
  const resp = await apiClient.post('/tasks', payload);
  return resp.data;
}

export async function updateTaskStatus(id: string, payload: { status: string }) {
  const resp = await apiClient.post(`/tasks/${encodeURIComponent(id)}/status`, payload);
  return resp.data;
}

export async function deleteTask(id: string) {
  const resp = await apiClient.delete(`/tasks/${encodeURIComponent(id)}`);
  return resp.data;
}
