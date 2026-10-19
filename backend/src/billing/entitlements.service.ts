import { Injectable } from "@nestjs/common";
import { RedisService } from "../prisma/redis.module.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { TenantDbService } from "../prisma/tenant-db.service.ts";
import type { RequestTenant } from "../common/request-types.ts";
import { FEATURE_KEYS, PLANS, type FeatureKey, type PlanDef } from "./plans.ts";

export interface Entitlements {
  plan: PlanDef;
  features: Record<FeatureKey, boolean>;
  overrides: Partial<Record<FeatureKey, boolean>>;
  seats: { limit: number; used: number };
}

/**
 * Pattern #9: feature flags as plan entitlements + per-tenant overrides.
 * Overrides live in the tenant-scoped feature_overrides table (RLS) and are
 * cached for 60s; writes invalidate the cache.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly tenantDb: TenantDbService,
  ) {}

  static cacheKey(tenantId: string): string {
    return `ent:${tenantId}`;
  }

  async effective(tenant: RequestTenant): Promise<Entitlements> {
    const plan = PLANS[tenant.plan];
    const features: Record<FeatureKey, boolean> = { ...plan.features };
    const overrides: Partial<Record<FeatureKey, boolean>> = {};

    const cached = await this.redis.getJson<Partial<Record<FeatureKey, boolean>>>(
      EntitlementsService.cacheKey(tenant.id),
    );
    const rows = cached
      ? Object.entries(cached).map(([feature, enabled]) => ({ feature, enabled: enabled as boolean }))
      : await this.tenantDb.run(tenant, (tx) => tx.featureOverride.findMany());

    for (const row of rows) {
      if ((FEATURE_KEYS as string[]).includes(row.feature)) {
        overrides[row.feature as FeatureKey] = row.enabled;
        features[row.feature as FeatureKey] = row.enabled;
      }
    }
    if (!cached) {
      await this.redis.setJson(EntitlementsService.cacheKey(tenant.id), overrides, 60);
    }

    // memberships is a control-plane table (no RLS), so the tenant filter
    // must be explicit — mirroring members.controller's invite gate exactly.
    const used = await this.prisma.membership.count({
      where: { tenantId: tenant.id, status: { not: "SUSPENDED" } },
    });

    return { plan, features, overrides, seats: { limit: plan.seats, used } };
  }

  async invalidate(tenantId: string): Promise<void> {
    await this.redis.del(EntitlementsService.cacheKey(tenantId));
  }
}
