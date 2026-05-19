import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SyncService } from '../sync/sync.service';
import { WebSocketGateway } from '../websocket/websocket.gateway';

export interface SyncUdeskJobData {
  runId: string;
  triggeredBy: 'schedule' | 'manual';
}

@Processor('sync-udesk')
export class SyncUdeskProcessor {
  private readonly logger = new Logger(SyncUdeskProcessor.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly wsGateway: WebSocketGateway,
  ) {}

  @OnQueueActive()
  onActive(job: Job<SyncUdeskJobData>) {
    this.logger.log(`Processing sync-udesk job ${job.id}, runId: ${job.data.runId}`);
    this.wsGateway.broadcastSyncStatus({
      source: 'udesk',
      status: 'running',
      runId: job.data.runId,
      timestamp: new Date().toISOString(),
    });
  }

  @Process({ concurrency: 1 })
  async handleSync(job: Job<SyncUdeskJobData>) {
    this.logger.log(`Starting Udesk sync, job ${job.id}`);
    
    // 定期报告进度
    const progressInterval = setInterval(() => {
      const progress = this.syncService.getUdeskProgress();
      job.progress(progress);
      this.wsGateway.broadcastSyncProgress({
        ...progress,
        source: 'udesk' as const,
      });
    }, 2000);

    try {
      await this.syncService.syncUdesk();
      clearInterval(progressInterval);
      return { success: true, runId: job.data.runId };
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job<SyncUdeskJobData>, result: { success: boolean; runId: string }) {
    this.logger.log(`Completed sync-udesk job ${job.id}, runId: ${result.runId}`);
    this.wsGateway.broadcastSyncStatus({
      source: 'udesk',
      status: 'completed',
      runId: result.runId,
      timestamp: new Date().toISOString(),
    });
  }

  @OnQueueFailed()
  onFailed(job: Job<SyncUdeskJobData>, err: Error) {
    this.logger.error(`Failed sync-udesk job ${job.id}: ${err.message}`);
    this.wsGateway.broadcastSyncStatus({
      source: 'udesk',
      status: 'failed',
      runId: job.data.runId,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
}
