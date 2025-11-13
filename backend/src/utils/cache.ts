import type { RedisClientType } from 'redis';
import { env } from '../config/env';

let redisCreateClient: typeof import('redis')['createClient'] | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const redis = require('redis') as typeof import('redis');
  redisCreateClient = redis.createClient;
} catch {
  redisCreateClient = null;
}

export interface ReportCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  invalidate(prefix?: string): Promise<void>;
  close?(): Promise<void>;
}

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

class InMemoryReportCache implements ReportCache {
  private store = new Map<string, CacheEntry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }

  async invalidate(prefix?: string): Promise<void> {
    if (!prefix) {
      this.store.clear();
      return;
    }

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

class RedisReportCache implements ReportCache {
  constructor(private readonly client: RedisClientType<any, any, any>) {}

  async get<T>(key: string): Promise<T | null> {
    const payload = await this.client.get(key);
    if (!payload) {
      return null;
    }

    try {
      return JSON.parse(payload) as T;
    } catch {
      await this.client.del(key);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), {
      EX: ttlSeconds,
    });
  }

  async invalidate(prefix?: string): Promise<void> {
    if (!prefix) {
      await this.client.flushDb();
      return;
    }

    const pattern = `${prefix}*`;
    const keys: string[] = [];
    for await (const key of this.client.scanIterator({ MATCH: pattern })) {
      keys.push(key);
      if (keys.length >= 100) {
        await this.client.del(keys);
        keys.length = 0;
      }
    }

    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

export const createReportCache = (): ReportCache => {
  if (env.REDIS_URL && redisCreateClient) {
    const client = redisCreateClient({ url: env.REDIS_URL });
    client.on('error', (error) => {
      // eslint-disable-next-line no-console
      console.error('Redis cache error', error);
    });
    void client.connect().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to connect to Redis', error);
    });
    return new RedisReportCache(client);
  }

  return new InMemoryReportCache();
};

export { InMemoryReportCache, RedisReportCache };
