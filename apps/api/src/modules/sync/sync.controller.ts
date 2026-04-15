import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SyncService } from './sync.service';
import { ZouwuFeedbackStatisticsQueryDto } from './sync.dto';

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

  @Post('zouwu/run')
  runZouwu(@Body() body?: { startDate?: string; endDate?: string; resetCursor?: boolean }) {
    const options = body?.startDate || body?.endDate || body?.resetCursor ? {
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      resetCursor: body.resetCursor,
    } : undefined;
    return this.syncService.triggerZouwuSync(options);
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

  @Get('zouwu/config')
  getZouwuConfig() {
    return this.syncService.getSyncConfig('zouwu');
  }

  @Post('zouwu/config')
  updateZouwuConfig(@Body() payload: { enabled?: boolean; intervalHours?: number }) {
    return this.syncService.updateSyncConfig('zouwu', payload);
  }

  @Get('zouwu/feedback-stats')
  getZouwuFeedbackStats(@Query() query: ZouwuFeedbackStatisticsQueryDto) {
    return this.syncService.getZouwuFeedbackStatistics(query);
  }

  @Post('udesc/reset')
  async resetUdescCursor() {
    await this.prisma.syncCheckpoint.deleteMany({
      where: { source: 'udesc' },
    });
    return { ok: true };
  }
}
