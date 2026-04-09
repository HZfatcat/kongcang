import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from './common/prisma.service';
import { HealthModule } from './modules/health/health.module';
import { KpiModule } from './modules/kpi/kpi.module';
import { AgentsModule } from './modules/agents/agents.module';
import { SyncModule } from './modules/sync/sync.module';
import { UdescModule } from './modules/udesc/udesc.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    HealthModule,
    KpiModule,
    AgentsModule,
    SyncModule,
    UdescModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
