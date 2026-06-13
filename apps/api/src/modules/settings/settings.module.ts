import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  providers: [SettingsService, PrismaService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
