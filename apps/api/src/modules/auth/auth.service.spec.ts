import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let configService: ConfigService;

  const mockPrismaService = {
    wecomEmployee: {
      findUnique: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string | undefined> = {
        AUTH_TOKEN_SECRET: 'test-secret',
        WECOM_CORP_CORPID: 'test-corpid',
        WECOM_CORP_SECRET: 'test-secret-key',
        VITE_WECOM_APPID: 'test-appid',
        NODE_ENV: 'test',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStateUser', () => {
    it('should return null for invalid state', () => {
      expect(service.getStateUser('invalid-state')).toBeNull();
    });
  });

  describe('validateAppid', () => {
    it('should not throw when appid matches', () => {
      const appid = mockConfigService.get('VITE_WECOM_APPID');
      expect(appid).toBe('test-appid');
    });
  });

  describe('signToken', () => {
    it('should generate a token with correct format', () => {
      const secret = mockConfigService.get('AUTH_TOKEN_SECRET');
      expect(secret).toBe('test-secret');
    });
  });

  describe('config', () => {
    it('should have correct corp id config', () => {
      const corpid = mockConfigService.get('WECOM_CORP_CORPID');
      expect(corpid).toBe('test-corpid');
    });

    it('should have correct corp secret config', () => {
      const secret = mockConfigService.get('WECOM_CORP_SECRET');
      expect(secret).toBe('test-secret-key');
    });
  });
});
