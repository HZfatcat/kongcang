import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { UdeskController } from './udesk.controller';
import { UdescService } from './udesk.service';

@Module({
  controllers: [UdeskController],
  providers: [UdescService, PrismaService],
  exports: [UdescService],
})
export class UdeskModule {}

