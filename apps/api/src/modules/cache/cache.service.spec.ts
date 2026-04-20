import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CacheService],
    }).compile();

    service = module.get<CacheService>(CacheService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('set and get', () => {
    it('should store and retrieve a value', async () => {
      if (!service.isReady()) {
        console.log('Redis not connected, skipping test');
        return;
      }

      const key = 'test:key:1';
      const value = { name: 'test', count: 42 };

      await service.set(key, value, 60);
      const result = await service.get<typeof value>(key);

      expect(result).toEqual(value);
    });

    it('should return null for non-existent key', async () => {
      if (!service.isReady()) return;

      const result = await service.get('non:existent:key');
      expect(result).toBeNull();
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      if (!service.isReady()) return;

      const key = 'test:cache:aside:1';
      const value = 'cached';

      await service.set(key, value, 60);
      const result = await service.getOrSet(key, () => Promise.resolve('fresh'));

      expect(result).toBe(value);
    });

    it('should call fn and cache result if not exists', async () => {
      if (!service.isReady()) return;

      const key = 'test:cache:aside:2';
      const freshValue = 'fresh';

      const result = await service.getOrSet(key, () => Promise.resolve(freshValue), 60);

      expect(result).toBe(freshValue);

      // 验证已缓存
      const cached = await service.get<string>(key);
      expect(cached).toBe(freshValue);
    });
  });
});
