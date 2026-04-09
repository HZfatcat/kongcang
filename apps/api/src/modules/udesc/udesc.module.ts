import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { UdescController } from './udesc.controller';
import { UdescService } from './udesc.service';

@Module({
  controllers: [UdescController],
  providers: [UdescService, PrismaService],
  exports: [UdescService],
})
export class UdescModule {}

