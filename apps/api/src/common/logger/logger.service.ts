import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import pino from 'pino';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  module?: string;
  action?: string;
  [key: string]: unknown;
}

@Injectable()
export class LoggerService implements NestLoggerService {
  private pino: pino.Logger;
  private readonly isProduction: boolean;

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
    this.pino.info(context || {}, this.formatMessage(message));
  }

  info(message: unknown, context?: LogContext): void {
    this.pino.info(context || {}, this.formatMessage(message));
  }

  warn(message: unknown, context?: LogContext): void {
    this.pino.warn(context || {}, this.formatMessage(message));
  }

  error(message: unknown, trace?: string, context?: LogContext): void {
    const ctx = { ...context };
    if (trace) {
      ctx.trace = trace;
    }
    this.pino.error(ctx, this.formatMessage(message));
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
    this.pino.info(
      {
        module: 'sync',
        source,
        action,
        ...data,
      },
      `Sync [${source}] ${action}`,
    );
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
}
