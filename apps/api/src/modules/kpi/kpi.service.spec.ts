import { Test, TestingModule } from '@nestjs/testing';
import { KpiService } from './kpi.service';
import { PrismaService } from '../../common/prisma.service';

describe('KpiService', () => {
  let service: KpiService;
  let prisma: PrismaService;

  const mockPrismaService = {
    udeskSession: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    zouwuRequirement: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    syncRun: {
      findFirst: jest.fn(),
    },
    agent: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KpiService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<KpiService>(KpiService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveRange', () => {
    it('should return default 90 days range when no params', () => {
      const result = service.resolveRange();
      const diffDays = (result.end.getTime() - result.start.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(90, 0);
    });

    it('should use provided dates', () => {
      const start = '2024-01-01';
      const end = '2024-01-31';
      const result = service.resolveRange(start, end);
      expect(result.start.toISOString().startsWith('2024-01-01')).toBe(true);
      expect(result.end.toISOString().startsWith('2024-01-31')).toBe(true);
    });

    it('should use custom lookback days', () => {
      const result = service.resolveRange(undefined, undefined, 30);
      const diffDays = (result.end.getTime() - result.start.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(30, 0);
    });
  });

  describe('getOverview', () => {
    it('should return overview statistics', async () => {
      mockPrismaService.udeskSession.findMany.mockResolvedValue([
        { rating: 5, isConsultToDemand: false },
        { rating: 4, isConsultToDemand: true },
        { rating: 3, isConsultToDemand: false },
        { rating: null, isConsultToDemand: false },
      ]);
      mockPrismaService.zouwuRequirement.count.mockResolvedValue(5);

      const result = await service.getOverview();

      expect(result.ratedSessions).toBe(3);
      expect(result.satisfactionRate).toBeCloseTo(2 / 3, 1);
      expect(result.consultToDemandCount).toBe(1);
      expect(result.completedDemandCount).toBe(5);
    });

    it('should handle no sessions', async () => {
      mockPrismaService.udeskSession.findMany.mockResolvedValue([]);
      mockPrismaService.zouwuRequirement.count.mockResolvedValue(0);

      const result = await service.getOverview();

      expect(result.ratedSessions).toBe(0);
      expect(result.satisfactionRate).toBe(0);
      expect(result.consultToDemandCount).toBe(0);
    });
  });

  describe('getDemandOverview', () => {
    it('should return demand statistics', async () => {
      mockPrismaService.zouwuRequirement.count
        .mockResolvedValueOnce(100) // totalWithLongTerm
        .mockResolvedValueOnce(80) // completedCount
        .mockResolvedValueOnce(5) // rejectedCount
        .mockResolvedValueOnce(10) // linkedSessionCount
        .mockResolvedValueOnce(30) // bugCount
        .mockResolvedValueOnce(25) // bugCompletedCount
        .mockResolvedValueOnce(6) // bugLongTermCount
        .mockResolvedValueOnce(4); // longTermCount

      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.zouwuRequirement.groupBy.mockResolvedValue([]);
      mockPrismaService.zouwuRequirement.findMany.mockResolvedValue([]);

      const result = await service.getDemandOverview();

      expect(result.totalWithLongTerm).toBe(100);
      expect(result.completedCount).toBe(80);
      expect(result.rejectedCount).toBe(5);
      expect(result.bugCount).toBe(30);
      expect(result.bugLongTermCount).toBe(6);
      expect(result.bugCompletedCount).toBe(25);
      expect(result.longTermCount).toBe(4);
    });
  });
});
