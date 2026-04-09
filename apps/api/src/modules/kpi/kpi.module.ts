import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';

@Module({
  controllers: [KpiController],
  providers: [KpiService, PrismaService],
  exports: [KpiService],
})
export class KpiModule {}
