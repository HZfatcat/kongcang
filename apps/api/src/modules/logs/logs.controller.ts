import { Controller, Get, Query, Param, Delete, BadRequestException } from '@nestjs/common';
import { LogsService } from './logs.service';

@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  async getLogs(
    @Query('level') level?: string,
    @Query('module') module?: string,
    @Query('source') source?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.logsService.getLogs({
      level,
      module,
      source,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      search,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 50,
    });
  }

  @Get('stats')
  async getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.logsService.getLogStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get(':id')
  async getLogById(@Param('id') id: string) {
    const log = await this.logsService.getLogById(id);
    if (!log) {
      throw new BadRequestException('Log not found');
    }
    return log;
  }

  @Delete('clear')
  async clearLogs(@Query('beforeDays') beforeDays?: string) {
    const days = beforeDays ? parseInt(beforeDays, 10) : 30;
    const beforeDate = new Date();
    beforeDate.setDate(beforeDate.getDate() - days);
    
    const result = await this.logsService.clearLogs(beforeDate);
    return { deleted: result.count };
  }
}
