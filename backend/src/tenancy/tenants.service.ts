import { Injectable } from "@nestjs/common";
import type { Tenant } from "../generated/prisma/client.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { RedisService } from "../prisma/redis.module.ts";
import { env } from "../config/env.ts";

const CACHE_TTL_SECONDS = 60;

/**
 * Tenant registry lookups (control plane) with a short Redis cache so the
 * auth guard resolves tenants without hammering Postgres.
 */
@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  cacheKey(id: string): string {
    return `tenant:${id}`;
  }

  async getById(id: string): Promise<Tenant | null> {
    const cached = await this.redis.getJson<Tenant>(this.cacheKey(id));
    if (cached) return cached;
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (tenant) await this.redis.setJson(this.cacheKey(id), tenant, CACHE_TTL_SECONDS);
    return tenant;
  }

  async getBySlug(slug: string): Promise<Tenant | null> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (tenant) await this.redis.setJson(this.cacheKey(tenant.id), tenant, CACHE_TTL_SECONDS);
    return tenant;
  }

  /**
   * Tenant resolution by hostname (pattern #3):
   *   1. verified custom domain → tenant
   *   2. <slug>.{APP_ROOT_DOMAIN}   → tenant
   */
  async getByHost(host: string | undefined): Promise<Tenant | null> {
    if (!host) return null;
    const bare = host.split(":")[0]?.toLowerCase() ?? "";
    if (!bare) return null;
    const byDomain = await this.prisma.tenant.findFirst({
      where: { customDomain: bare, customDomainVerified: true },
    });
    if (byDomain) return byDomain;
    const root = env.APP_ROOT_DOMAIN;
    if (root && bare.endsWith(`.${root}`)) {
      const slug = bare.slice(0, -(root.length + 1)).split(".")[0];
      if (slug && slug !== "www" && slug !== "app") return this.getBySlug(slug);
    }
    return null;
  }

  async invalidate(id: string): Promise<void> {
    await this.redis.del(this.cacheKey(id));
  }
}
