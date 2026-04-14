// 必须在最开头加载 dotenv，确保环境变量在其他模块加载前就设置好
import * as dotenv from 'dotenv';
import * as path from 'path';
const envPath = path.join(__dirname, '../../../.env');
dotenv.config({ path: envPath });
console.log('[main.ts] Loaded .env from:', envPath);
console.log('[main.ts] ZOUWU_BASE_URL:', process.env.ZOUWU_BASE_URL);

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
}

void bootstrap();
