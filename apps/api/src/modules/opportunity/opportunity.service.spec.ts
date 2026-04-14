import { Test, TestingModule } from '@nestjs/testing';
import { OpportunityService } from './opportunity.service';
import { PrismaService } from '../../common/prisma.service';
import { OpportunityStatus, OpportunitySourceType } from '@prisma/client';

describe('OpportunityService', () => {
  let service: OpportunityService;
  let prisma: PrismaService;

  const mockPrismaService = {
    businessOpportunity: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpportunityService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<OpportunityService>(OpportunityService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveRange', () => {
    it('should use default 30 days range when no dates provided', () => {
      const result = service['resolveRange']();
      const diffDays = (result.end.getTime() - result.start.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(30, 0);
    });

    it('should use provided date range', () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';
      const result = service['resolveRange'](startDate, endDate);
      expect(result.start.toISOString().slice(0, 10)).toBe(startDate);
      expect(result.end.toISOString().slice(0, 10)).toBe(endDate);
    });
  });

  describe('list', () => {
    it('should return paginated opportunities', async () => {
      const mockOpportunities = [
        { id: '1', title: 'Test Opportunity', createdAt: new Date(), updatedAt: new Date() },
      ];
      mockPrismaService.businessOpportunity.count.mockResolvedValue(1);
      mockPrismaService.businessOpportunity.findMany.mockResolvedValue(mockOpportunities);

      const result = await service.list({ page: 1, pageSize: 10 });

      expect(result.total).toBe(1);
      expect(result.records).toHaveLength(1);
      expect(mockPrismaService.businessOpportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrismaService.businessOpportunity.count.mockResolvedValue(0);
      mockPrismaService.businessOpportunity.findMany.mockResolvedValue([]);

      await service.list({ status: OpportunityStatus.NEW });

      expect(mockPrismaService.businessOpportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: OpportunityStatus.NEW,
          }),
        }),
      );
    });

    it('should filter by keyword', async () => {
      mockPrismaService.businessOpportunity.count.mockResolvedValue(0);
      mockPrismaService.businessOpportunity.findMany.mockResolvedValue([]);

      await service.list({ keyword: 'test' });

      expect(mockPrismaService.businessOpportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { title: { contains: 'test', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });
  });

  describe('summary', () => {
    it('should return summary statistics', async () => {
      mockPrismaService.businessOpportunity.count.mockResolvedValue(10);
      mockPrismaService.businessOpportunity.groupBy.mockResolvedValue([
        { status: OpportunityStatus.NEW, _count: { id: 5 } },
        { status: OpportunityStatus.WON, _count: { id: 3 } },
        { status: OpportunityStatus.LOST, _count: { id: 2 } },
      ]);

      const result = await service.summary();

      expect(result.total).toBe(10);
      expect(result.won).toBe(10);
      expect(result.lost).toBe(10);
      expect(result.winRate).toBe(1);
      expect(result.statusBreakdown).toEqual({
        [OpportunityStatus.NEW]: 5,
        [OpportunityStatus.WON]: 3,
        [OpportunityStatus.LOST]: 2,
      });
    });
  });

  describe('upsert', () => {
    it('should create new opportunity without id', async () => {
      const dto = {
        title: 'New Opportunity',
        customerName: 'Test Customer',
      };
      mockPrismaService.businessOpportunity.create.mockResolvedValue({
        id: 'new-id',
        ...dto,
        status: OpportunityStatus.NEW,
        sourceType: OpportunitySourceType.MANUAL,
      });

      const result = await service.upsert(dto);

      expect(mockPrismaService.businessOpportunity.create).toHaveBeenCalled();
      expect(mockPrismaService.businessOpportunity.update).not.toHaveBeenCalled();
    });

    it('should update existing opportunity with id', async () => {
      const dto = {
        id: 'existing-id',
        title: 'Updated Title',
      };
      mockPrismaService.businessOpportunity.update.mockResolvedValue({
        id: 'existing-id',
        title: 'Updated Title',
        status: OpportunityStatus.NEW,
        sourceType: OpportunitySourceType.MANUAL,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.upsert(dto);

      expect(mockPrismaService.businessOpportunity.update).toHaveBeenCalledWith({
        where: { id: 'existing-id' },
        data: expect.objectContaining({ title: 'Updated Title' }),
      });
    });

    it('should set closedAt when status is WON or LOST', async () => {
      const dto = {
        id: 'existing-id',
        title: 'Test',
        status: OpportunityStatus.WON,
      };
      mockPrismaService.businessOpportunity.update.mockResolvedValue({
        id: 'existing-id',
        title: 'Test',
        status: OpportunityStatus.WON,
        sourceType: OpportunitySourceType.MANUAL,
        closedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.upsert(dto);

      expect(mockPrismaService.businessOpportunity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            closedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('should update opportunity status', async () => {
      mockPrismaService.businessOpportunity.update.mockResolvedValue({
        id: 'test-id',
        status: OpportunityStatus.WON,
      });

      await service.updateStatus('test-id', { status: OpportunityStatus.WON });

      expect(mockPrismaService.businessOpportunity.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: expect.objectContaining({
          status: OpportunityStatus.WON,
          closedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('remove', () => {
    it('should delete opportunity by id', async () => {
      mockPrismaService.businessOpportunity.delete.mockResolvedValue({
        id: 'deleted-id',
      });

      const result = await service.remove('deleted-id');

      expect(mockPrismaService.businessOpportunity.delete).toHaveBeenCalledWith({
        where: { id: 'deleted-id' },
      });
    });
  });
});
