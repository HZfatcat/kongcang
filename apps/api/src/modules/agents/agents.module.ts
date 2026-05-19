import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [SyncModule],
  controllers: [AgentsController],
  providers: [AgentsService, PrismaService],
  exports: [AgentsService],
})
export class AgentsModule {}
