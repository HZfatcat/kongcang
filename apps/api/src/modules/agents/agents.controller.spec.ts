import { Test, TestingModule } from '@nestjs/testing';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

describe('AgentsController', () => {
  let controller: AgentsController;
  let service: AgentsService;

  const mockAgentsService = {
    list: jest.fn(),
    listUdeskAgentIds: jest.fn(),
    upsert: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
      ],
    }).compile();

    controller = module.get<AgentsController>(AgentsController);
    service = module.get<AgentsService>(AgentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should return a list of agents', async () => {
      const mockAgents = [
        { agentId: 'agent1', displayName: 'Agent 1' },
        { agentId: 'agent2', displayName: 'Agent 2' },
      ];
      mockAgentsService.list.mockResolvedValue(mockAgents);

      const result = await controller.list();

      expect(result).toEqual(mockAgents);
      expect(mockAgentsService.list).toHaveBeenCalled();
    });
  });

  describe('listUdeskAgentIds', () => {
    it('should return unique agent IDs', async () => {
      const mockIds = ['agent1', 'agent2'];
      mockAgentsService.listUdeskAgentIds.mockResolvedValue(mockIds);

      const result = await controller.listUdeskAgentIds();

      expect(result).toEqual(mockIds);
    });
  });

  describe('upsert', () => {
    it('should upsert an agent', async () => {
      const dto = {
        agentId: 'agent1',
        displayName: 'Agent 1',
      };
      mockAgentsService.upsert.mockResolvedValue(dto);

      const result = await controller.upsert(dto);

      expect(result).toEqual(dto);
      expect(mockAgentsService.upsert).toHaveBeenCalledWith(dto);
    });
  });

  describe('remove', () => {
    it('should remove an agent', async () => {
      const agentId = 'agent-to-delete';
      mockAgentsService.remove.mockResolvedValue({ agentId });

      const result = await controller.remove(agentId);

      expect(result.agentId).toBe(agentId);
      expect(mockAgentsService.remove).toHaveBeenCalledWith(agentId);
    });
  });
});
