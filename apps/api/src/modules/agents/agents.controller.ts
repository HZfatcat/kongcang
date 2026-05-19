import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { UpsertAgentDto } from './agents.dto';
import { AgentsService } from './agents.service';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  list() {
    return this.agentsService.list();
  }

  @Get('udesk-agent-ids')
  listUdeskAgentIds() {
    return this.agentsService.listUdeskAgentIds();
  }

  @Post('upsert')
  upsert(@Body() payload: UpsertAgentDto) {
    return this.agentsService.upsert(payload);
  }

  @Delete(':agentId')
  remove(@Param('agentId') agentId: string) {
    return this.agentsService.remove(agentId);
  }
}
