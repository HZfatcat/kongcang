import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LoggerService } from '../logger/logger.service';
import { randomUUID } from 'crypto';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(LoggerService)
    @Optional()
    private readonly logger: LoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.logger) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const startTime = Date.now();
    const correlationId = (request.headers['x-correlation-id'] as string) || randomUUID();

    // 设置 correlationId 到响应头
    response.setHeader('x-correlation-id', correlationId);

    // 记录请求
    this.logger.logRequest(
      {
        method: request.method,
        url: request.url,
        headers: {
          'user-agent': request.headers['user-agent'],
          'content-type': request.headers['content-type'],
        },
      },
      { correlationId, userId: request.user?.id },
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.logResponse(
            { method: request.method, url: request.url },
            { statusCode: response.statusCode },
            duration,
            { correlationId, userId: request.user?.id },
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            `Request failed: ${request.method} ${request.url}`,
            error.stack,
            {
              correlationId,
              userId: request.user?.id,
              error: {
                name: error.name,
                message: error.message,
                statusCode: error.status,
              },
            },
          );
        },
      }),
    );
  }
}
