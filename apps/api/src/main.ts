// 必须在最开头加载 dotenv，确保环境变量在其他模块加载前就设置好
import * as dotenv from 'dotenv';
import * as path from 'path';
const envPath = path.join(__dirname, '../../../.env');
dotenv.config({ path: envPath });

// 加载 .env.local（本地私有覆盖，不会被源项目覆盖）
const envLocalPath = path.join(__dirname, '../../../.env.local');
dotenv.config({ path: envLocalPath, override: true });

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerService } from './common/logger/logger.service';
import { HttpLoggingInterceptor } from './common/interceptors';

// BigInt 不能直接被 JSON.stringify 序列化，添加 toJSON 方法全局修复
// 参考：https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
(BigInt.prototype as unknown as Record<string, unknown>).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // 使用结构化日志
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  // HTTP 请求/响应日志拦截器
  app.useGlobalInterceptors(new HttpLoggingInterceptor(logger));

  const explicitOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (explicitOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      try {
        const parsed = new URL(origin);
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
          callback(null, true);
          return;
        }
      } catch {
        callback(null, false);
        return;
      }

      callback(null, false);
    },
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`, { module: 'main' });
}

void bootstrap();
