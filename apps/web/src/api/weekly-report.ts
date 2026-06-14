import { apiClient } from './client';

export interface SendReportParams {
  startDate?: string;
  endDate?: string;
  summary?: string;
  nextPlan?: string;
  recipientEmail?: string;
  subject?: string;
  type?: 'team' | 'personal';
  agentName?: string;
  html?: string;
  ccEmail?: string;
  topQuestions?: { name: string; count: number; pct: number }[];
  risks?: string[];
  suggestions?: string[];
}

export async function previewReport(params: SendReportParams): Promise<string> {
  const resp = await apiClient.post('/weekly-report/preview', params);
  return resp.data.html;
}

export async function sendReport(params: SendReportParams): Promise<void> {
  await apiClient.post('/weekly-report/send', params);
}
