import { Controller, Get, Query } from '@nestjs/common';
import { DateRangeQueryDto } from './kpi.dto';
import { KpiService } from './kpi.service';

@Controller('kpi')
export class KpiController {
  constructor(private readonly kpiService: KpiService) {}

  @Get('overview')
  async getOverview(@Query() query: DateRangeQueryDto) {
    return this.kpiService.getOverview(query.startDate, query.endDate);
  }

  @Get('satisfaction')
  async getSatisfaction(@Query() query: DateRangeQueryDto) {
    return this.kpiService.getOverview(query.startDate, query.endDate);
  }

  @Get('demand')
  async getDemand(@Query() query: DateRangeQueryDto) {
    return this.kpiService.getDemandOverview(query.startDate, query.endDate);
  }
}
