import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SyncService } from './sync.service';

@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(private readonly syncService: SyncService) {}

  @Cron(process.env.SYNC_HEARTBEAT_CRON ?? '*/5 * * * *', { name: 'sync-udesc-heartbeat-job' })
  async handleCron() {
    this.logger.log('check scheduled udesc sync');
    try {
      const result = await this.syncService.triggerScheduledUdescSync();
      if (result.accepted) {
        this.logger.log('scheduled udesc sync triggered');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`scheduled udesc sync failed: ${message}`);
    }

    this.logger.log('check scheduled zouwu sync');
    try {
      const result = await this.syncService.triggerScheduledZouwuSync();
      if (result.accepted) {
        this.logger.log('scheduled zouwu sync triggered');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`scheduled zouwu sync failed: ${message}`);
    }
  }
}
