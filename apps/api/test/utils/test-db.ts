import { PrismaClient } from '@prisma/client';

// 测试数据库连接
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    },
  },
});

// 全局设置：测试前清理数据库
export async function setupTestDb() {
  await testPrisma.$connect();
  // 不自动清理，由具体测试决定
}

// 全局清理：测试后断开连接
export async function teardownTestDb() {
  await testPrisma.$disconnect();
}
