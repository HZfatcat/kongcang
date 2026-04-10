import { Controller, Get, Query } from '@nestjs/common';
import { UdescDateRangeDto, UdescSessionQueryDto } from './udesc.dto';
import { UdescService } from './udesc.service';

@Controller('udesc')
export class UdescController {
  constructor(private readonly udescService: UdescService) {}

  @Get('overview')
  getOverview(@Query() query: UdescDateRangeDto) {
    return this.udescService.getOverview(query.startDate, query.endDate);
  }

  @Get('tree')
  getTree(@Query() query: UdescDateRangeDto) {
    return this.udescService.getAgentTree(query.startDate, query.endDate);
  }

  @Get('sessions')
  getSessions(@Query() query: UdescSessionQueryDto) {
    return this.udescService.getSessions({
      startDate: query.startDate,
      endDate: query.endDate,
      agentId: query.agentId,
      agentIds: query.agentIds,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('daily-agent-stats')
  getDailyAgentStats(@Query() query: UdescDateRangeDto) {
    return this.udescService.getDailyAgentStats(query.startDate, query.endDate);
  }
}

