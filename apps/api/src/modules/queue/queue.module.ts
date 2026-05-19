import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SyncUdeskProcessor } from './sync-udesk.processor';
import { SyncZouwuProcessor } from './sync-zouwu.processor';
import { WebSocketModule } from '../websocket/websocket.module';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0', 10),
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }),
    BullModule.registerQueue(
      { name: 'sync-udesk' },
      { name: 'sync-zouwu' },
      { name: 'sync-all' },
    ),
    forwardRef(() => WebSocketModule),
    forwardRef(() => SyncModule),
  ],
  providers: [SyncUdeskProcessor, SyncZouwuProcessor],
  exports: [BullModule],
})
export class QueueModule {}
