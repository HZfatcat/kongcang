import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { WecomEmployeeService } from './wecom-employee.service';
import { UpsertWecomEmployeeDto } from './wecom-employee.dto';

@Controller('wecom-employee')
export class WecomEmployeeController {
  constructor(private readonly service: WecomEmployeeService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':userId')
  get(@Param('userId') userId: string) {
    return this.service.get(userId);
  }

  @Post('upsert')
  upsert(@Body() dto: UpsertWecomEmployeeDto) {
    return this.service.upsert(dto);
  }

  @Delete(':userId')
  remove(@Param('userId') userId: string) {
    return this.service.remove(userId);
  }
}
