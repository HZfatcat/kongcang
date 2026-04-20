import { Injectable, LoggerService as NestLoggerService, OnModuleInit } from '@nestjs/common';
import pino from 'pino';
import { PrismaService } from '../prisma.service';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  module?: string;
  action?: string;
  [key: string]: unknown;
}

@Injectable()
export class LoggerService implements NestLoggerService, OnModuleInit {
  private pino: pino.Logger;
  private readonly isProduction: boolean;
  private prisma: PrismaService | null = null;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    
    const pinoOptions: pino.LoggerOptions = {
      level: process.env.LOG_LEVEL || (this.isProduction ? 'info' : 'debug'),
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        service: 'kefu-api',
        env: process.env.NODE_ENV || 'development',
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.token',
          'res.body.token',
        ],
        censor: '[REDACTED]',
      },
    };

    // 开发环境使用 pino-pretty 美化输出
    if (!this.isProduction) {
      this.pino = pino({
        ...pinoOptions,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      });
    } else {
      this.pino = pino(pinoOptions);
    }
  }

  onModuleInit() {
    // 延迟获取 PrismaService 避免循环依赖
    try {
      // 使用全局获取 PrismaService 的方式
      this.prisma = new PrismaService();
    } catch {
      // Prisma 初始化失败时，仅使用控制台日志
    }
  }

  private formatMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    return JSON.stringify(message);
  }

  verbose(message: unknown, context?: LogContext): void {
    this.pino.trace(context || {}, this.formatMessage(message));
  }

  debug(message: unknown, context?: LogContext): void {
    this.pino.debug(context || {}, this.formatMessage(message));
  }

  log(message: unknown, context?: LogContext): void {
    const msg = this.formatMessage(message);
    this.pino.info(context || {}, msg);
    void this.writeToDb('info', msg, context);
  }

  info(message: unknown, context?: LogContext): void {
    const msg = this.formatMessage(message);
    this.pino.info(context || {}, msg);
    void this.writeToDb('info', msg, context);
  }

  warn(message: unknown, context?: LogContext): void {
    const msg = this.formatMessage(message);
    this.pino.warn(context || {}, msg);
    void this.writeToDb('warn', msg, context);
  }

  error(message: unknown, trace?: string, context?: LogContext): void {
    const ctx = { ...context };
    if (trace) {
      ctx.trace = trace;
    }
    const msg = this.formatMessage(message);
    this.pino.error(ctx, msg);
    void this.writeToDb('error', msg, ctx);
  }

  /**
   * 记录 API 请求
   */
  logRequest(req: { method: string; url: string; headers: Record<string, unknown> }, context?: LogContext) {
    this.pino.info(
      {
        ...context,
        http: {
          method: req.method,
          url: req.url,
          user_agent: req.headers['user-agent'],
        },
      },
      `Incoming ${req.method} ${req.url}`,
    );
  }

  /**
   * 记录 API 响应
   */
  logResponse(
    req: { method: string; url: string },
    res: { statusCode: number },
    duration: number,
    context?: LogContext,
  ) {
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    this.pino[level](
      {
        ...context,
        http: {
          method: req.method,
          url: req.url,
          status_code: res.statusCode,
          duration_ms: duration,
        },
      },
      `Outgoing ${req.method} ${req.url} ${res.statusCode} ${duration}ms`,
    );
  }

  /**
   * 记录同步任务
   */
  logSync(source: string, action: string, data: Record<string, unknown> = {}) {
    const ctx: LogContext = {
      module: 'sync',
      source,
      action,
      ...data,
    };
    const msg = `Sync [${source}] ${action}`;
    this.pino.info(ctx, msg);
    void this.writeToDb('info', msg, ctx);
  }

  /**
   * 记录性能
   */
  logPerformance(operation: string, duration: number, context?: LogContext) {
    this.pino.info(
      {
        ...context,
        performance: {
          operation,
          duration_ms: duration,
        },
      },
      `Performance: ${operation} took ${duration}ms`,
    );
  }

  /**
   * 子日志（带固定上下文）
   */
  child(context: LogContext): LoggerService {
    const childLogger = Object.create(this);
    childLogger.pino = this.pino.child(context);
    return childLogger;
  }

  /**
   * 写入日志到数据库
   */
  private async writeToDb(
    level: string,
    message: string,
    context?: LogContext,
  ) {
    if (!this.prisma) return;
    
    try {
      await this.prisma.systemLog.create({
        data: {
          level,
          message,
          module: typeof context?.module === 'string' ? context.module : undefined,
          source: typeof context?.source === 'string' ? context.source : undefined,
          action: typeof context?.action === 'string' ? context.action : undefined,
          userId: typeof context?.userId === 'string' ? context.userId : undefined,
          correlationId: typeof context?.correlationId === 'string' ? context.correlationId : undefined,
          duration: typeof context?.duration === 'number' ? context.duration : undefined,
          context: context ? JSON.parse(JSON.stringify(context)) : undefined,
        },
      });
    } catch {
      // 写入数据库失败，忽略避免日志循环
    }
  }
}
