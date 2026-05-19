import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SyncController } from './sync.controller';
import { SyncScheduler } from './sync.scheduler';
import { SyncService } from './sync.service';
import { UdeskClient } from './udesk.client';
import { ZouwuClient } from './zouwu.client';

@Module({
  controllers: [SyncController],
  providers: [SyncService, SyncScheduler, UdeskClient, ZouwuClient, PrismaService],
  exports: [SyncService, UdeskClient],
})
export class SyncModule {}
