import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import {
  OpportunityQueryDto,
  UpdateOpportunityStatusDto,
  UpsertOpportunityDto,
} from './opportunity.dto';
import { OpportunityService } from './opportunity.service';

@Controller('opportunities')
export class OpportunityController {
  constructor(private readonly opportunityService: OpportunityService) {}

  @Get()
  list(@Query() query: OpportunityQueryDto) {
    return this.opportunityService.list(query);
  }

  @Get('summary')
  summary(@Query() query: OpportunityQueryDto) {
    return this.opportunityService.summary(query.startDate, query.endDate);
  }

  @Post('upsert')
  upsert(@Body() payload: UpsertOpportunityDto) {
    return this.opportunityService.upsert(payload);
  }

  @Post(':id/status')
  updateStatus(@Param('id') id: string, @Body() payload: UpdateOpportunityStatusDto) {
    return this.opportunityService.updateStatus(id, payload);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.opportunityService.remove(id);
  }
}
