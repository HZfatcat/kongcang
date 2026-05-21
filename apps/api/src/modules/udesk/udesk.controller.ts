import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  UdeskDateRangeDto,
  UdeskSessionQueryDto,
  UdeskCustomerQueryDto,
  UdeskAgentQueryDto,
  UdeskVoteQueryDto,
  UdeskMetricsQueryDto,
  UdeskTicketQueryDto,
  UdeskHeatmapQueryDto,
} from './udesk.dto';
import { UdescService } from './udesk.service';

@Controller('udesk')
export class UdeskController {
  constructor(private readonly udescService: UdescService) {}

  @Get('overview')
  getOverview(@Query() query: UdeskDateRangeDto) {
    return this.udescService.getOverview(query.startDate, query.endDate);
  }

  @Get('tree')
  getTree(@Query() query: UdeskDateRangeDto) {
    return this.udescService.getAgentTree(query.startDate, query.endDate);
  }

  @Get('sessions')
  getSessions(@Query() query: UdeskSessionQueryDto) {
    console.log('[Controller] getSessions query:', JSON.stringify(query));
    return this.udescService.getSessions({
      startDate: query.startDate,
      endDate: query.endDate,
      agentId: query.agentId,
      agentIds: query.agentIds,
      sessionId: query.sessionId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('daily-agent-stats')
  getDailyAgentStats(@Query() query: UdeskDateRangeDto) {
    return this.udescService.getDailyAgentStats(query.startDate, query.endDate);
  }

  @Get('daily-rating-stats')
  getDailyRatingStats(@Query() query: UdeskDateRangeDto) {
    return this.udescService.getDailyRatingStats(query.startDate, query.endDate);
  }

  // ========== 客户管理 ==========

  @Get('customers')
  getCustomers(@Query() query: UdeskCustomerQueryDto) {
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
  getAgents(@Query() query: UdeskAgentQueryDto) {
    return this.udescService.getAgents({
      enabled: query.enabled,
    });
  }

  @Get('agents/:id/performance')
  getAgentPerformance(
    @Param('id') id: string,
    @Query() query: UdeskDateRangeDto
  ) {
    return this.udescService.getAgentPerformance(id, query.startDate, query.endDate);
  }

  // ========== 评价分析 ==========

  @Get('votes')
  getVotes(@Query() query: UdeskVoteQueryDto) {
    return this.udescService.getVotes({
      startDate: query.startDate,
      endDate: query.endDate,
      minRating: query.minRating,
      maxRating: query.maxRating,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      pageSize: query.pageSize,
      sessionId: query.sessionId,
    });
  }

  // ========== 会话性能指标 ==========

  @Get('metrics')
  getSessionMetrics(@Query() query: UdeskMetricsQueryDto) {
    console.log('[Controller] getSessionMetrics query:', JSON.stringify(query));
    return this.udescService.getSessionMetrics({
      startDate: query.startDate,
      endDate: query.endDate,
      agentId: query.agentId,
      agentIds: query.agentIds,
      sessionId: query.sessionId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('metrics/summary')
  getMetricsSummary(@Query() query: UdeskMetricsQueryDto) {
    console.log('[Controller] getMetricsSummary query:', JSON.stringify(query));
    return this.udescService.getMetricsSummary(query.startDate, query.endDate, query.agentId);
  }

  @Get('metrics/agent-summary')
  getAgentMetricsSummary(@Query() query: UdeskDateRangeDto) {
    return this.udescService.getAgentMetricsSummary(query.startDate, query.endDate);
  }

  // ========== 工单分析 ==========

  @Get('tickets')
  getTickets(@Query() query: UdeskTicketQueryDto) {
    return this.udescService.getTickets({
      startDate: query.startDate,
      endDate: query.endDate,
      status: query.status,
      assigneeId: query.assigneeId,
      priority: query.priority,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('tickets/summary')
  getTicketSummary(@Query() query: UdeskTicketQueryDto) {
    return this.udescService.getTicketSummary({
      startDate: query.startDate,
      endDate: query.endDate,
      assigneeId: query.assigneeId,
    });
  }

  @Get('tickets/daily-stats')
  getTicketDailyStats(@Query() query: UdeskDateRangeDto) {
    return this.udescService.getTicketDailyStats({
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  // ========== 时段热力图 ==========

  @Get('heatmap')
  getHeatmap(@Query() query: UdeskHeatmapQueryDto) {
    return this.udescService.getHeatmap({
      startDate: query.startDate,
      endDate: query.endDate,
      agentId: query.agentId,
      type: query.type || 'session',
    });
  }
}
