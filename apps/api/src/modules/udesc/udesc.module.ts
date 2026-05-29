import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SyncModule } from '../sync/sync.module';
import { UdescController } from './udesc.controller';
import { UdescService } from './udesc.service';

@Module({
  imports: [SyncModule],
  controllers: [UdescController],
  providers: [UdescService, PrismaService],
  exports: [UdescService],
})
export class UdescModule {}
