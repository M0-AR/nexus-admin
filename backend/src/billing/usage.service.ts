import { Injectable } from "@nestjs/common";
import { env } from "../config/env.ts";
import { RedisService } from "../prisma/redis.module.ts";
import { TenantDbService } from "../prisma/tenant-db.service.ts";
import type { RequestTenant } from "../common/request-types.ts";

/**
 * Pattern #5: usage metering for the billing engine.
 * Counters live in Redis (cheap, hot path); daily aggregates in Postgres are
 * the durable ledger (written by the seed and, in production, by a nightly
 * flush job — see README). Billing reads DB history and overlays today's live
 * Redis counter.
 */
@Injectable()
export class UsageService {
  constructor(
    private readonly redis: RedisService,
    private readonly tenantDb: TenantDbService,
  ) {}

  static counterKey(tenantId: string, metric: string, day: string): string {
    return `usage:${tenantId}:${metric}:${day}`;
  }

  private static dayKey(date = new Date()): string {
    return date.toISOString().slice(0, 10);
  }

  async increment(tenantId: string, metric: string, by = 1): Promise<void> {
    const key = UsageService.counterKey(tenantId, metric, UsageService.dayKey());
    await this.redis.client.incrby(key, by);
    await this.redis.client.expire(key, 32 * 86_400);
  }

  async todayLive(tenantId: string, metric: string): Promise<number> {
    const raw = await this.redis.client.get(UsageService.counterKey(tenantId, metric, UsageService.dayKey()));
    return raw ? Number(raw) : 0;
  }

  /** Last `days` daily series for a metric: DB ledger with live Redis overlay for today. */
  async series(tenant: RequestTenant, metric: string, days = 30): Promise<Array<{ day: string; quantity: number }>> {
    const since = new Date(Date.now() - days * 86_400_000);
    since.setUTCHours(0, 0, 0, 0);

    const rows = await this.tenantDb.run(
      {
        id: tenant.id,
        slug: tenant.slug,
        isolationMode: tenant.isolationMode,
        dedicatedDatabaseUrl: tenant.dedicatedDatabaseUrl,
        dataRegion: tenant.dataRegion,
      },
      (tx) =>
        tx.usageRecord.findMany({
          where: { metric, day: { gte: since } },
          orderBy: { day: "asc" },
        }),
    );

    const map = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r.quantity]));
    const today = UsageService.dayKey();
    const live = await this.todayLive(tenant.id, metric);
    if (live > 0) map.set(today, live);

    const out: Array<{ day: string; quantity: number }> = [];
    for (let d = days - 1; d >= 0; d -= 1) {
      const day = UsageService.dayKey(new Date(Date.now() - d * 86_400_000));
      out.push({ day, quantity: map.get(day) ?? 0 });
    }
    return out;
  }

  async periodTotal(tenant: RequestTenant, metric: string, days = 30): Promise<number> {
    const s = await this.series(tenant, metric, days);
    return s.reduce((acc, row) => acc + row.quantity, 0);
  }

  /** Current live plan for the env — billing period bounds for display. */
  currentPeriod(): { start: string; end: string } {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }

  get environment(): string {
    return env.NODE_ENV;
  }
}
