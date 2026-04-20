import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CacheService } from '../cache/cache.service';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: { status: 'ok' | 'error'; latency?: number; message?: string };
    redis: { status: 'ok' | 'error' | 'not_configured'; latency?: number; message?: string };
  };
  uptime: number;
}

@Controller('health')
export class HealthController {
  private startTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  async check(): Promise<HealthStatus> {
    const checks = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    const hasError = checks.some((c) => c.status === 'error');
    const hasDegraded = checks.some((c) => c.status === 'not_configured');

    let status: 'ok' | 'degraded' | 'unhealthy';
    if (hasError) {
      status = 'unhealthy';
    } else if (hasDegraded) {
      status = 'degraded';
    } else {
      status = 'ok';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: checks[0],
        redis: checks[1],
      },
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  @Get('live')
  liveness() {
    // Kubernetes liveness probe - 应用是否活着
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async readiness() {
    // Kubernetes readiness probe - 应用是否准备好接收流量
    const dbCheck = await this.checkDatabase();
    if (dbCheck.status === 'error') {
      return { status: 'not_ready', reason: 'database_unavailable', timestamp: new Date().toISOString() };
    }
    return { status: 'ready', timestamp: new Date().toISOString() };
  }

  private async checkDatabase(): Promise<{ status: 'ok' | 'error'; latency?: number; message?: string }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latency: Date.now() - start };
    } catch (error) {
      return {
        status: 'error',
        latency: Date.now() - start,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkRedis(): Promise<{ status: 'ok' | 'error' | 'not_configured'; latency?: number; message?: string }> {
    if (!this.cache.isReady()) {
      return { status: 'not_configured', message: 'Redis not connected' };
    }

    const start = Date.now();
    try {
      // 简单的 ping 测试
      await this.cache.set('health:check', 'ok', 10);
      return { status: 'ok', latency: Date.now() - start };
    } catch (error) {
      return {
        status: 'error',
        latency: Date.now() - start,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
