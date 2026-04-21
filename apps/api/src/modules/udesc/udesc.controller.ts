import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  UdescDateRangeDto,
  UdescSessionQueryDto,
  UdescCustomerQueryDto,
  UdescAgentQueryDto,
  UdescVoteQueryDto,
  UdescMetricsQueryDto,
} from './udesc.dto';
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

  // ========== 客户管理 ==========

  @Get('customers')
  getCustomers(@Query() query: UdescCustomerQueryDto) {
    return this.udescService.getCustomers({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      enterprise: query.enterprise,
    });
  }

  @Get('customers/:id')
  getCustomerDetail(@Param('id') id: string) {
    return this.udescService.getCustomerDetail(id);
  }

  // ========== 客服管理 ==========

  @Get('agents')
  getAgents(@Query() query: UdescAgentQueryDto) {
    return this.udescService.getAgents({
      enabled: query.enabled,
    });
  }

  @Get('agents/:id/performance')
  getAgentPerformance(
    @Param('id') id: string,
    @Query() query: UdescDateRangeDto
  ) {
    return this.udescService.getAgentPerformance(id, query.startDate, query.endDate);
  }

  // ========== 评价分析 ==========

  @Get('votes')
  getVotes(@Query() query: UdescVoteQueryDto) {
    return this.udescService.getVotes({
      startDate: query.startDate,
      endDate: query.endDate,
      minRating: query.minRating,
      maxRating: query.maxRating,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  // ========== 会话性能指标 ==========

  @Get('metrics')
  getSessionMetrics(@Query() query: UdescMetricsQueryDto) {
    return this.udescService.getSessionMetrics({
      startDate: query.startDate,
      endDate: query.endDate,
      agentId: query.agentId,
      agentIds: query.agentIds,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('metrics/summary')
  getMetricsSummary(@Query() query: UdescDateRangeDto) {
    return this.udescService.getMetricsSummary(query.startDate, query.endDate);
  }
}
