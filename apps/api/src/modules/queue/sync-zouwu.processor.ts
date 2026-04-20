import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SyncService } from '../sync/sync.service';
import { WebSocketGateway } from '../websocket/websocket.gateway';

export interface SyncZouwuJobData {
  runId: string;
  startDate?: string;
  endDate?: string;
  resetCheckpoint?: boolean;
  triggeredBy: 'schedule' | 'manual';
}

@Processor('sync-zouwu')
export class SyncZouwuProcessor {
  private readonly logger = new Logger(SyncZouwuProcessor.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly wsGateway: WebSocketGateway,
  ) {}

  @OnQueueActive()
  onActive(job: Job<SyncZouwuJobData>) {
    this.logger.log(`Processing sync-zouwu job ${job.id}, runId: ${job.data.runId}`);
    this.wsGateway.broadcastSyncStatus({
      source: 'zouwu',
      status: 'running',
      runId: job.data.runId,
      timestamp: new Date().toISOString(),
    });
  }

  @Process({ concurrency: 1 })
  async handleSync(job: Job<SyncZouwuJobData>) {
    this.logger.log(`Starting Zouwu sync, job ${job.id}`);
    
    const progressInterval = setInterval(() => {
      job.progress({ processing: true });
    }, 2000);

    try {
      await this.syncService.syncZouwu({
        startDate: job.data.startDate ? new Date(job.data.startDate) : undefined,
        endDate: job.data.endDate ? new Date(job.data.endDate) : undefined,
        resetCursor: job.data.resetCheckpoint,
      });
      clearInterval(progressInterval);
      return { success: true, runId: job.data.runId };
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job<SyncZouwuJobData>, result: { success: boolean; runId: string }) {
    this.logger.log(`Completed sync-zouwu job ${job.id}`);
    this.wsGateway.broadcastSyncStatus({
      source: 'zouwu',
      status: 'completed',
      runId: result.runId,
      timestamp: new Date().toISOString(),
    });
  }

  @OnQueueFailed()
  onFailed(job: Job<SyncZouwuJobData>, err: Error) {
    this.logger.error(`Failed sync-zouwu job ${job.id}: ${err.message}`);
    this.wsGateway.broadcastSyncStatus({
      source: 'zouwu',
      status: 'failed',
      runId: job.data.runId,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
}
