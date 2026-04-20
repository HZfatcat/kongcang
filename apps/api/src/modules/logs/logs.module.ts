import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [LogsController],
  providers: [LogsService, PrismaService],
})
export class LogsModule {}
