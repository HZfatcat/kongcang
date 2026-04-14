import { Module } from '@nestjs/common';
import { WecomEmployeeController } from './wecom-employee.controller';
import { WecomEmployeeService } from './wecom-employee.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [WecomEmployeeController],
  providers: [WecomEmployeeService, PrismaService],
  exports: [WecomEmployeeService],
})
export class WecomEmployeeModule {}
