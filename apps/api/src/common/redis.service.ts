import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from './env';
import { AppError } from './errors';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new Redis(env.redisUrl, { maxRetriesPerRequest: null });

  async onModuleDestroy() {
    await this.client.quit();
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async delPattern(pattern: string) {
    const stream = this.client.scanStream({ match: pattern, count: 100 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length) await this.client.del(...keys);
    }
  }

  /** Fixed-window limiter. Throws 429 when `limit` is exceeded inside `windowSeconds`. */
  async rateLimit(key: string, limit: number, windowSeconds: number) {
    const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const count = await this.client.incr(bucket);
    if (count === 1) await this.client.expire(bucket, windowSeconds);
    if (count > limit) {
      throw new AppError('RATE_LIMITED', 'Too many requests, try again shortly', 429, {
        retryAfterSeconds: windowSeconds,
      });
    }
  }
}
