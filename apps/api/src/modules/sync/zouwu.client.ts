import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { SyncFetchResult, ZouwuRequirementRecord } from './sync.types';

@Injectable()
export class ZouwuClient {
  private readonly logger = new Logger(ZouwuClient.name);
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: process.env.ZOUWU_BASE_URL,
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${process.env.ZOUWU_API_KEY ?? ''}`,
      },
    });
  }

  async fetchRequirements(params: {
    cursor?: string;
    pageSize: number;
    startDate: string;
    endDate: string;
  }): Promise<SyncFetchResult<ZouwuRequirementRecord>> {
    // TODO: 等你提供驺吾 API 文档后，替换为真实请求路径与字段映射。
    if (!process.env.ZOUWU_BASE_URL || process.env.ZOUWU_BASE_URL.includes('example.com')) {
      this.logger.warn('ZOUWU_BASE_URL 未配置真实地址，跳过远端同步，返回空数据。');
      return { records: [], hasMore: false };
    }

    const resp = await this.http.get('/requirements', {
      params: {
        cursor: params.cursor,
        page_size: params.pageSize,
        start_date: params.startDate,
        end_date: params.endDate,
      },
    });

    const data = resp.data as {
      items: Array<Record<string, unknown>>;
      next_cursor?: string;
      has_more?: boolean;
    };

    const records: ZouwuRequirementRecord[] = (data.items ?? []).map((item) => ({
      id: String(item.id),
      title: String(item.title ?? ''),
      sourceSessionId: item.source_session_id ? String(item.source_session_id) : undefined,
      status: (item.status as ZouwuRequirementRecord['status']) ?? 'OPEN',
      createdAt: String(item.created_at),
      completedAt: item.completed_at ? String(item.completed_at) : undefined,
      updatedAt: item.updated_at ? String(item.updated_at) : undefined,
      rawPayload: item,
    }));

    return {
      records,
      nextCursor: data.next_cursor,
      hasMore: Boolean(data.has_more),
    };
  }
}
