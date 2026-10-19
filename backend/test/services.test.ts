import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EntitlementsService } from "../src/billing/entitlements.service.ts";
import { RateLimiterService } from "../src/ratelimit/rate-limiter.service.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { RedisService } from "../src/prisma/redis.module.ts";
import { TenantDbService } from "../src/prisma/tenant-db.service.ts";
import { env } from "../src/config/env.ts";
import type { RequestTenant } from "../src/common/request-types.ts";
import { appClient, ownerClient, tenantIdBySlug } from "./helpers.ts";

let prisma: PrismaService;
let redis: RedisService;
let tenantDb: TenantDbService;
let entitlements: EntitlementsService;
let rateLimiter: RateLimiterService;
let acme: RequestTenant;
let globex: RequestTenant;

beforeAll(async () => {
  const owner = ownerClient();
  const app = appClient();
  try {
    const [acmeId, globexId] = await Promise.all([
      tenantIdBySlug(owner, "acme"),
      tenantIdBySlug(owner, "globex"),
    ]);
    acme = tenant(acmeId, "acme", "Acme Corporation", "ENTERPRISE");
    globex = tenant(globexId, "globex", "Globex Industries", "STARTER");
  } finally {
    await app.$disconnect();
    await owner.$disconnect();
  }

  prisma = new PrismaService();
  redis = new RedisService();
  tenantDb = new TenantDbService(prisma);
  entitlements = new EntitlementsService(redis, prisma, tenantDb);
  rateLimiter = new RateLimiterService(redis);
});

afterAll(async () => {
  await redis.onModuleDestroy();
  await prisma.$disconnect();
});

function tenant(id: string, slug: string, name: string, plan: "STARTER" | "ENTERPRISE"): RequestTenant {
  return {
    id,
    slug,
    name,
    status: "ACTIVE",
    plan,
    isolationMode: "SHARED",
    dedicatedDatabaseUrl: null,
    dataRegion: "us-east-1",
    branding: {},
    customDomain: null,
    customDomainVerified: false,
    domainVerificationToken: null,
  };
}

describe("EntitlementsService (real Postgres + Redis)", () => {
  it("applies the plan entitlements for acme (ENTERPRISE)", async () => {
    const result = await entitlements.effective(acme);
    expect(result.plan.tier).toBe("ENTERPRISE");
    expect(result.features.sso).toBe(true);
    expect(result.features.byok).toBe(true);
    expect(result.overrides).toEqual({});
    expect(result.seats.limit).toBe(1000);
    expect(result.seats.used).toBe(4);
  });

  it("merges the globex feature override on top of STARTER", async () => {
    const result = await entitlements.effective(globex);
    expect(result.plan.tier).toBe("STARTER");
    // STARTER default is false; the seeded per-tenant override enables it.
    expect(result.features.audit_log).toBe(true);
    expect(result.overrides).toEqual({ audit_log: true });
    expect(result.features.byok).toBe(false);
    expect(result.seats.limit).toBe(5);
    expect(result.seats.used).toBe(2);
  });

  it("caches overrides per tenant and invalidates on demand", async () => {
    await entitlements.effective(globex);
    await expect(redis.getJson(`ent:${globex.id}`)).resolves.toEqual({ audit_log: true });
    // Acme has no overrides — its cache key must not be polluted by globex.
    await entitlements.effective(acme);
    await expect(redis.getJson(`ent:${acme.id}`)).resolves.toEqual({});

    await entitlements.invalidate(globex.id);
    await expect(redis.getJson(`ent:${globex.id}`)).resolves.toBeNull();
  });
});

describe("RateLimiterService (real Redis)", () => {
  it("allows up to the limit inside a window, then denies", async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    const decisions = [];
    for (let i = 0; i < 4; i++) decisions.push(await rateLimiter.consume(key, 3, 60));

    expect(decisions.map((d) => d.allowed)).toEqual([true, true, true, false]);
    expect(decisions.map((d) => d.count)).toEqual([1, 2, 3, 4]);
    expect(decisions[3]!.retryAfterSeconds).toBeGreaterThan(0);
    expect(decisions[3]!.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("returns a positive retry window for blocked IPs", async () => {
    const key = `ip-test:${Date.now()}:${Math.random()}`;
    for (let i = 0; i < 2; i++) {
      expect((await rateLimiter.consumeIp("203.0.113.9", key, 2, 60)).allowed).toBe(true);
    }
    const blocked = await rateLimiter.consumeIp("203.0.113.9", key, 2, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("enforces the sustained tenant budget (never unblocks a burst)", async () => {
    const tenantId = `load-${Date.now()}-${Math.random()}`;
    const results = [];
    for (let i = 0; i < 15; i++) {
      results.push(await rateLimiter.consumeTenant(tenantId, 300));
    }
    // 300 rpm => 10/s burst. 15 rapid calls must trip at least one bucket.
    expect(results.some((r) => !r.allowed)).toBe(true);
    const denied = results.find((r) => !r.allowed)!;
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("region routing", () => {
  it("blocks shared tenants pinned to another region when enforcement is on", () => {
    const previous = env.ENFORCE_REGION;
    env.ENFORCE_REGION = true;
    try {
      expect(() => tenantDb.assertRegionAllowed(acme)).not.toThrow();
      expect(() =>
        tenantDb.assertRegionAllowed({ ...acme, dataRegion: "eu-west-1" }),
      ).toThrow(/pinned to eu-west-1/);
      // Dedicated tenants are served by their own database, wherever it lives.
      expect(() =>
        tenantDb.assertRegionAllowed({ ...acme, isolationMode: "DEDICATED", dataRegion: "eu-west-1" }),
      ).not.toThrow();
    } finally {
      env.ENFORCE_REGION = previous;
    }
  });

  it("does nothing when enforcement is off", () => {
    const previous = env.ENFORCE_REGION;
    env.ENFORCE_REGION = false;
    try {
      expect(() => tenantDb.assertRegionAllowed({ ...acme, dataRegion: "eu-west-1" })).not.toThrow();
    } finally {
      env.ENFORCE_REGION = previous;
    }
  });
});
