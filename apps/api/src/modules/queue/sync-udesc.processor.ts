import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SyncService } from '../sync/sync.service';
import { WebSocketGateway } from '../websocket/websocket.gateway';

export interface SyncUdescJobData {
  runId: string;
  triggeredBy: 'schedule' | 'manual';
}

@Processor('sync-udesc')
export class SyncUdescProcessor {
  private readonly logger = new Logger(SyncUdescProcessor.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly wsGateway: WebSocketGateway,
  ) {}

  @OnQueueActive()
  onActive(job: Job<SyncUdescJobData>) {
    this.logger.log(`Processing sync-udesc job ${job.id}, runId: ${job.data.runId}`);
    this.wsGateway.broadcastSyncStatus({
      source: 'udesc',
      status: 'running',
      runId: job.data.runId,
      timestamp: new Date().toISOString(),
    });
  }

  @Process({ concurrency: 1 })
  async handleSync(job: Job<SyncUdescJobData>) {
    this.logger.log(`Starting Udesc sync, job ${job.id}`);
    
    // 定期报告进度
    const progressInterval = setInterval(() => {
      const progress = this.syncService.getUdescProgress();
      job.progress(progress);
      this.wsGateway.broadcastSyncProgress({
        ...progress,
        source: 'udesc' as const,
      });
    }, 2000);

    try {
      await this.syncService.syncUdesc();
      clearInterval(progressInterval);
      return { success: true, runId: job.data.runId };
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job<SyncUdescJobData>, result: { success: boolean; runId: string }) {
    this.logger.log(`Completed sync-udesc job ${job.id}, runId: ${result.runId}`);
    this.wsGateway.broadcastSyncStatus({
      source: 'udesc',
      status: 'completed',
      runId: result.runId,
      timestamp: new Date().toISOString(),
    });
  }

  @OnQueueFailed()
  onFailed(job: Job<SyncUdescJobData>, err: Error) {
    this.logger.error(`Failed sync-udesc job ${job.id}: ${err.message}`);
    this.wsGateway.broadcastSyncStatus({
      source: 'udesc',
      status: 'failed',
      runId: job.data.runId,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
}
