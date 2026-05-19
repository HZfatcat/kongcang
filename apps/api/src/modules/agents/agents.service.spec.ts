import { Test, TestingModule } from '@nestjs/testing';
import { AgentsService } from './agents.service';
import { PrismaService } from '../../common/prisma.service';

describe('AgentsService', () => {
  let service: AgentsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    agentProfile: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    udeskSession: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should return a list of agents ordered by enabled and updatedAt', async () => {
      const mockAgents = [
        { agentId: 'agent1', displayName: 'Agent 1', enabled: true, updatedAt: new Date() },
        { agentId: 'agent2', displayName: 'Agent 2', enabled: false, updatedAt: new Date() },
      ];
      mockPrismaService.agentProfile.findMany.mockResolvedValue(mockAgents);

      const result = await service.list();

      expect(result).toEqual(mockAgents);
      expect(mockPrismaService.agentProfile.findMany).toHaveBeenCalledWith({
        orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
      });
    });
  });

  describe('listUdeskAgentIds', () => {
    it('should return unique agent IDs from udesk sessions', async () => {
      mockPrismaService.udeskSession.findMany.mockResolvedValue([
        { agentId: 'agent1' },
        { agentId: 'agent2' },
        { agentId: null },
      ]);

      const result = await service.listUdeskAgentIds();

      expect(result).toEqual(['agent1', 'agent2']);
    });

    it('should return empty array when no sessions found', async () => {
      mockPrismaService.udeskSession.findMany.mockResolvedValue([]);

      const result = await service.listUdeskAgentIds();

      expect(result).toEqual([]);
    });
  });

  describe('upsert', () => {
    it('should create a new agent', async () => {
      const dto = {
        agentId: 'newAgent',
        displayName: 'New Agent',
        team: 'Team A',
        role: 'Admin',
        enabled: true,
        remark: 'Test remark',
      };
      mockPrismaService.agentProfile.upsert.mockResolvedValue({
        ...dto,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.upsert(dto);

      expect(result.displayName).toBe(dto.displayName);
      expect(mockPrismaService.agentProfile.upsert).toHaveBeenCalledWith({
        where: { agentId: dto.agentId },
        create: {
          agentId: dto.agentId,
          displayName: dto.displayName,
          team: dto.team,
          role: dto.role,
          enabled: dto.enabled,
          remark: dto.remark,
        },
        update: {
          displayName: dto.displayName,
          team: dto.team,
          role: dto.role,
          enabled: dto.enabled,
          remark: dto.remark,
        },
      });
    });
  });

  describe('remove', () => {
    it('should delete an agent by id', async () => {
      const agentId = 'agent-to-delete';
      mockPrismaService.agentProfile.delete.mockResolvedValue({
        agentId,
        displayName: 'Deleted Agent',
      });

      const result = await service.remove(agentId);

      expect(result.agentId).toBe(agentId);
      expect(mockPrismaService.agentProfile.delete).toHaveBeenCalledWith({
        where: { agentId },
      });
    });
  });
});
