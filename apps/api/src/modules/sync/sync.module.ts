import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SyncController } from './sync.controller';
import { SyncScheduler } from './sync.scheduler';
import { SyncService } from './sync.service';
import { UdescClient } from './udesc.client';
import { ZouwuClient } from './zouwu.client';

@Module({
  controllers: [SyncController],
  providers: [SyncService, SyncScheduler, UdescClient, ZouwuClient, PrismaService],
  exports: [SyncService, UdescClient],
})
export class SyncModule {}
