import { apiClient } from './client';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export async function fetchSmtpConfig() {
  const resp = await apiClient.get<SmtpConfig>('/settings/smtp');
  return resp.data;
}

export async function saveSmtpConfig(data: SmtpConfig) {
  const resp = await apiClient.put('/settings/smtp', data);
  return resp.data;
}

export async function testSmtpConfig(data: SmtpConfig & { to: string }) {
  const resp = await apiClient.post<{ ok: boolean; message: string }>('/settings/smtp/test', data);
  return resp.data;
}
