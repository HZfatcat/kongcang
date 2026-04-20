import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../../common/prisma.service';
import { CacheService } from '../cache/cache.service';

@Module({
  controllers: [HealthController],
  providers: [PrismaService, CacheService],
})
export class HealthModule {}
