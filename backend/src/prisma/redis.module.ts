import { Global, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { env } from "../config/env.ts";
import { loggerFor } from "../common/logger.ts";

const log = loggerFor("Redis");

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
    });
    this.client.on("error", (err) => log.error({ err }, "redis error"));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }

  /**
   * Fixed-window counter. Returns the number of hits within the window
   * (including this one) and the key TTL.
   */
  async hit(key: string, windowSeconds: number): Promise<{ count: number; ttl: number }> {
    const multi = this.client.multi();
    multi.incr(key);
    multi.ttl(key);
    const [count, ttl] = (await multi.exec()) as [Error | null, number][];
    const c = count[1] as number;
    const t = ttl[1] as number;
    if (t < 0) {
      await this.client.expire(key, windowSeconds);
      return { count: c, ttl: windowSeconds };
    }
    return { count: c, ttl: t };
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.client.del(...keys);
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
