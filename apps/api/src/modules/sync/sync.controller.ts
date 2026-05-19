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
    return this.syncService.triggerUdeskSync();
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
    return this.syncService.getUdeskProgress();
  }

  @Get('summary')
  getSummary() {
    return this.syncService.getUdeskSyncSummary();
  }

  @Post('issues/retry')
  retryIssues() {
    return this.syncService.retryFailedIssues();
  }

  @Get('config')
  getConfig() {
    return this.syncService.getSyncConfig('udesk');
  }

  @Post('config')
  updateConfig(@Body() payload: { enabled?: boolean; intervalHours?: number }) {
    return this.syncService.updateSyncConfig('udesk', payload);
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

  @Post('udesk/reset')
  async resetUdeskCursor() {
    await this.prisma.syncCheckpoint.deleteMany({
      where: { source: 'udesk' },
    });
    return { ok: true };
  }

  @Post('udesk/recalc-metrics')
  async recalcMetrics() {
    const count = await this.syncService.recalculateMetrics();
    return { ok: true, count };
  }

  @Post('udesk/clear')
  async clearUdeskData() {
    const result = await this.syncService.clearUdeskData();
    return { ok: true, ...result };
  }

  @Post('udesk/smart-fix')
  async smartFix() {
    const result = await this.syncService.smartFix();
    return { ok: true, ...result };
  }
}
