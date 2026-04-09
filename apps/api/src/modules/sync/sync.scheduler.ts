import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SyncService } from './sync.service';

@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(private readonly syncService: SyncService) {}

  @Cron(process.env.SYNC_CRON ?? '0 */6 * * *', { name: 'sync-udesc-job' })
  async handleCron() {
    this.logger.log('start scheduled udesc sync');
    try {
      await this.syncService.syncUdesc();
      this.logger.log('scheduled udesc sync finished');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`scheduled udesc sync failed: ${message}`);
    }
  }
}
