import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { PrismaService } from './common/prisma.service';
import { HealthModule } from './modules/health/health.module';
import { KpiModule } from './modules/kpi/kpi.module';
import { AgentsModule } from './modules/agents/agents.module';
import { OpportunityModule } from './modules/opportunity/opportunity.module';
import { SyncModule } from './modules/sync/sync.module';
import { UdescModule } from './modules/udesc/udesc.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '../../../.env'), '.env'],
    }),
    ScheduleModule.forRoot(),
    HealthModule,
    KpiModule,
    AgentsModule,
    OpportunityModule,
    SyncModule,
    UdescModule,
    AuthModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
