import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { UdeskController } from './udesk.controller';
import { UdeskService } from './udesk.service';

@Module({
  controllers: [UdeskController],
  providers: [UdeskService, PrismaService],
  exports: [UdeskService],
})
export class UdeskModule {}

