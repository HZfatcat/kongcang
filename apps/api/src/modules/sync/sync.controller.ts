import { Controller, Get, Post } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SyncService } from './sync.service';
import { Body } from '@nestjs/common';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('run')
  run() {
    return this.syncService.triggerUdescSync();
  }

  @Get('runs')
  listRuns() {
    return this.prisma.syncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
  }

  @Get('issues')
  listIssues() {
    return this.prisma.syncIssue.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get('progress')
  getProgress() {
    return this.syncService.getUdescProgress();
  }

  @Get('summary')
  getSummary() {
    return this.syncService.getUdescSyncSummary();
  }

  @Post('issues/retry')
  retryIssues() {
    return this.syncService.retryFailedIssues();
  }

  @Get('config')
  getConfig() {
    return this.syncService.getSyncConfig('udesc');
  }

  @Post('config')
  updateConfig(@Body() payload: { enabled?: boolean; intervalHours?: number }) {
    return this.syncService.updateSyncConfig('udesc', payload);
  }

  @Post('udesc/reset')
  async resetUdescCursor() {
    await this.prisma.syncCheckpoint.deleteMany({
      where: { source: 'udesc' },
    });
    return { ok: true };
  }
}
