import { Injectable, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private client: RedisClientType | null = null;
  private isConnected = false;

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.client = createClient({
      url: redisUrl,
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis client error: ${err.message}`);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      this.logger.log('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      this.logger.warn('Redis client disconnected');
      this.isConnected = false;
    });

    try {
      await this.client.connect();
    } catch (error) {
      this.logger.error(`Failed to connect to Redis: ${error}`);
      // 继续运行，缓存降级
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  private ensureClient(): RedisClientType {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected');
    }
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = this.ensureClient();
      const value = await client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.warn(`Cache get failed for key ${key}: ${error}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<boolean> {
    try {
      const client = this.ensureClient();
      await client.setEx(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      this.logger.warn(`Cache set failed for key ${key}: ${error}`);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const client = this.ensureClient();
      await client.del(key);
      return true;
    } catch (error) {
      this.logger.warn(`Cache del failed for key ${key}: ${error}`);
      return false;
    }
  }

  async delPattern(pattern: string): Promise<number> {
    try {
      const client = this.ensureClient();
      const keys = await client.keys(pattern);
      if (keys.length === 0) return 0;
      await client.del(keys);
      return keys.length;
    } catch (error) {
      this.logger.warn(`Cache delPattern failed for pattern ${pattern}: ${error}`);
      return 0;
    }
  }

  /**
   * 获取或设置缓存（Cache-Aside 模式）
   */
  async getOrSet<T>(key: string, fn: () => Promise<T>, ttlSeconds = 300): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * 缓存装饰器风格的包装方法
   */
  async wrap<T>(key: string, fn: () => Promise<T>, options?: { ttl?: number }): Promise<T> {
    return this.getOrSet(key, fn, options?.ttl ?? 300);
  }

  isReady(): boolean {
    return this.isConnected;
  }
}
