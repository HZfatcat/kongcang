import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { PrismaService } from './common/prisma.service';
import { HealthModule } from './modules/health/health.module';
import { KpiModule } from './modules/kpi/kpi.module';
import { AgentsModule } from './modules/agents/agents.module';
import { OpportunityModule } from './modules/opportunity/opportunity.module';
import { SyncModule } from './modules/sync/sync.module';
import { UdescModule } from './modules/udesc/udesc.module';
import { AuthModule } from './modules/auth/auth.module';
import { WecomEmployeeModule } from './modules/wecom-employee/wecom-employee.module';
import { LoggerModule } from './common/logger/logger.module';
import { CacheModule } from './modules/cache/cache.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { QueueModule } from './modules/queue/queue.module';
import { LogsModule } from './modules/logs/logs.module';

// 尝试多个可能的 .env 路径，确保找到项目根目录的文件
const possibleEnvPaths = [
  join(__dirname, '../../../.env'), // monorepo: apps/api/dist -> ../../.. 
  join(__dirname, '../../.env'), // 单应用: dist -> ../..
  resolve(process.cwd(), '.env'), // 当前工作目录
];

const envPath = possibleEnvPaths.find((p) => existsSync(p)) || possibleEnvPaths[0];
console.log('[AppModule] envFilePath:', envPath, 'exists:', existsSync(envPath));

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envPath,
      ignoreEnvFile: false,
    }),
    ScheduleModule.forRoot(),
    LoggerModule,
    CacheModule,
    WebSocketModule,
    QueueModule,
    HealthModule,
    KpiModule,
    AgentsModule,
    OpportunityModule,
    SyncModule,
    UdescModule,
    AuthModule,
    WecomEmployeeModule,
    LogsModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
