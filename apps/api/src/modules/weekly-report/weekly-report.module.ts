import { Module } from '@nestjs/common';
import { KpiModule } from '../kpi/kpi.module';
import { SettingsModule } from '../settings/settings.module';
import { WeeklyReportController } from './weekly-report.controller';
import { WeeklyReportService } from './weekly-report.service';

@Module({
  imports: [KpiModule, SettingsModule],
  controllers: [WeeklyReportController],
  providers: [WeeklyReportService],
  exports: [WeeklyReportService],
})
export class WeeklyReportModule {}
