import { Injectable } from "@nestjs/common";
import { RedisService } from "../prisma/redis.module.ts";

export interface RateDecision {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * Pattern #6: fast, tenant-fair rate limiting on Redis.
 * A sustained per-minute budget plus a per-second burst budget keeps a noisy
 * tenant from consuming the whole node while still allowing bursts.
 */
@Injectable()
export class RateLimiterService {
  constructor(private readonly redis: RedisService) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateDecision> {
    const { count, ttl } = await this.redis.hit(`rl:${key}:${windowSeconds}:${bucket(nowSeconds(), windowSeconds)}`, windowSeconds);
    return {
      allowed: count <= limit,
      count,
      limit,
      retryAfterSeconds: Math.max(1, ttl),
    };
  }

  /** Tenant request budget: minute + second buckets (rpm, burst ≈ rpm/30s). */
  async consumeTenant(tenantId: string, requestsPerMinute: number): Promise<RateDecision> {
    const perSecond = Math.max(10, Math.ceil(requestsPerMinute / 30));
    const secondDecision = await this.consume(`t:${tenantId}`, perSecond, 1);
    if (!secondDecision.allowed) return secondDecision;
    const minuteDecision = await this.consume(`t:${tenantId}`, requestsPerMinute, 60);
    return minuteDecision;
  }

  async consumeIp(ip: string, routeKey: string, limit: number, windowSeconds: number): Promise<RateDecision> {
    return this.consume(`ip:${ip}:${routeKey}`, limit, windowSeconds);
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function bucket(seconds: number, window: number): number {
  return Math.floor(seconds / window);
}
