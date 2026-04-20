import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  let service: LoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoggerService],
    }).compile();

    service = module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log methods', () => {
    it('should log info message without throwing', () => {
      expect(() => service.log('test message')).not.toThrow();
    });

    it('should log error with trace without throwing', () => {
      expect(() => service.error('error message', 'stack trace')).not.toThrow();
    });

    it('should log with context without throwing', () => {
      expect(() => {
        service.info('message with context', { userId: 'user-123', module: 'test' });
      }).not.toThrow();
    });
  });

  describe('logRequest', () => {
    it('should log HTTP request', () => {
      expect(() => {
        service.logRequest({
          method: 'GET',
          url: '/api/v1/health',
          headers: { 'user-agent': 'test' },
        });
      }).not.toThrow();
    });
  });

  describe('logResponse', () => {
    it('should log HTTP response', () => {
      expect(() => {
        service.logResponse(
          { method: 'GET', url: '/api/v1/health' },
          { statusCode: 200 },
          42,
        );
      }).not.toThrow();
    });
  });

  describe('logSync', () => {
    it('should log sync action', () => {
      expect(() => {
        service.logSync('udesc', 'start', { recordsCount: 100 });
      }).not.toThrow();
    });
  });

  describe('child logger', () => {
    it('should create child logger with context', () => {
      const child = service.child({ module: 'test-module' });
      expect(child).toBeDefined();
    });
  });
});
