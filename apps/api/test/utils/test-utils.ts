import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

/**
 * 创建测试应用
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}

/**
 * 数据库清理工具
 */
export async function cleanDatabase(prisma: PrismaService) {
  const tables = ['SyncCheckpoint', 'SyncRun', 'SyncIssue', 'ZouwuRequirement', 'ImSession', 'ImMessage', 'ImVote'];

  for (const table of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[table].deleteMany();
  }
}

/**
 * 生成测试用的 UUID
 */
export function generateTestUuid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 模拟日期范围
 */
export function mockDateRange(days: number): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start, end };
}

/**
 * 测试数据工厂
 */
export class TestDataFactory {
  static createMockSession(overrides = {}) {
    return {
      id: generateTestUuid('session-'),
      sourceId: `udesk-${Date.now()}`,
      agentId: 'agent-001',
      agentName: '测试客服',
      status: 'CLOSED',
      startedAt: new Date(),
      endedAt: new Date(),
      satisfaction: 5,
      classification: '技术咨询',
      ...overrides,
    };
  }

  static createMockRequirement(overrides = {}) {
    return {
      id: generateTestUuid('req-'),
      sourceId: `zouwu-${Date.now()}`,
      title: '测试需求',
      description: '测试需求描述',
      status: 'OPEN',
      issueType: 0,
      isLongTerm: false,
      createdAtSource: new Date(),
      updatedAtSource: new Date(),
      ...overrides,
    };
  }
}
