import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SyncService } from './sync.service';
import { PrismaService } from '../../common/prisma.service';
import { UdeskClient } from './udesk.client';
import { ZouwuClient } from './zouwu.client';

describe('SyncService', () => {
  let service: SyncService;
  let prisma: PrismaService;

  const mockPrismaService = {
    syncRun: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    syncConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
    },
    syncIssue: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    udeskSession: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    udeskSessionMessage: {
      count: jest.fn(),
    },
    syncCheckpoint: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    zouwuRequirement: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    zouwuFeedback: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string | undefined> = {
        UDESK_SYNC_WINDOW_DAYS: '7',
        UDESK_BASE_URL: 'https://test.udesk.cn',
        UDESK_API_KEY: 'test-key',
        ZOUWU_BASE_URL: 'https://test.zouwu.com',
        ZOUWU_API_TOKEN: 'test-token',
      };
      return config[key];
    }),
  };

  const mockUdeskClient = {
    getAccessToken: jest.fn(),
    fetchSessions: jest.fn(),
    fetchSessionMessages: jest.fn(),
  };

  const mockZouwuClient = {
    fetchRequirements: jest.fn(),
    fetchFeedbacks: jest.fn(),
    getFeedbackStatistics: jest.fn().mockResolvedValue({
      dateRange: { startDate: '2024-01-01', endDate: '2024-01-31' },
      granularity: 'day',
      periods: [],
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: UdeskClient, useValue: mockUdeskClient },
        { provide: ZouwuClient, useValue: mockZouwuClient },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSyncConfig', () => {
    it('should return config when exists', async () => {
      const mockConfig = {
        id: '1',
        source: 'udesk',
        lastSyncAt: new Date(),
        enabled: true,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaService.syncConfig.findUnique.mockResolvedValue(mockConfig);

      const result = await service.getSyncConfig('udesk');

      expect(result).toEqual(mockConfig);
      expect(mockPrismaService.syncConfig.findUnique).toHaveBeenCalledWith({
        where: { source: 'udesk' },
      });
    });
  });

  describe('getUdeskProgress', () => {
    it('should return progress data with isRunning flag', () => {
      const result = service.getUdeskProgress();

      expect(result).toHaveProperty('isRunning');
      expect(typeof result.isRunning).toBe('boolean');
    });

    it('should return progress with all required fields', () => {
      const result = service.getUdeskProgress();

      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('totalWindows');
      expect(result).toHaveProperty('processedWindows');
      expect(result).toHaveProperty('sessionSynced');
      expect(result).toHaveProperty('messageSynced');
    });
  });

  describe('triggerUdeskSync', () => {
    it('should return sync trigger response', () => {
      const result = service.triggerUdeskSync();

      expect(result).toHaveProperty('accepted');
      expect(result).toHaveProperty('progress');
    });
  });

  describe('triggerZouwuSync', () => {
    it('should return sync trigger response', () => {
      const result = service.triggerZouwuSync();

      expect(result).toHaveProperty('accepted');
    });
  });

  describe('getZouwuFeedbackStatistics', () => {
    it('should return feedback statistics structure', async () => {
      const result = await service.getZouwuFeedbackStatistics({});

      expect(result).toHaveProperty('dateRange');
      expect(result).toHaveProperty('granularity');
      expect(result).toHaveProperty('periods');
    });
  });
});
