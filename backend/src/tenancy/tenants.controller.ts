import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Public, Roles, CurrentTenant } from "../common/decorators.ts";
import { zodPipe } from "../common/zod.pipe.ts";
import type { RequestTenant } from "../common/request-types.ts";
import { PLANS } from "../billing/plans.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { TenantsService } from "./tenants.service.ts";

function publicView(tenant: { slug: string; name: string; plan: keyof typeof PLANS; branding: unknown; status: string }) {
  const plan = PLANS[tenant.plan];
  return {
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    branding: tenant.branding ?? {},
    plan: { tier: plan.tier, name: plan.name },
    features: plan.features,
  };
}

/** Unauthenticated tenant resolution for login pages, signup previews and branding. */
@Controller("public/tenants")
export class PublicTenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Public()
  @Get("resolve")
  async resolve(@Query("host") host?: string) {
    const tenant = await this.tenants.getByHost(host);
    if (!tenant) return { tenant: null };
    return { tenant: publicView(tenant) };
  }

  @Public()
  @Get(":slug")
  async bySlug(@Param("slug") slug: string) {
    const tenant = await this.tenants.getBySlug(slug);
    if (!tenant) throw new NotFoundException({ message: "Workspace not found", code: "TENANT_NOT_FOUND" });
    return { tenant: publicView(tenant) };
  }
}

const IsolationSchema = z.object({
  mode: z.enum(["SHARED", "DEDICATED"]),
  dedicatedDatabaseUrl: z.string().regex(/^postgres(ql)?:\/\//).optional(),
});

/**
 * Pattern #1/#2 admin surface: promote a tenant to a dedicated database and
 * pin its data region. Real data migration is an ops runbook (README) — this
 * flips routing for subsequent requests.
 */
@Controller("tenants")
export class TenantAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TenantsService,
  ) {}

  @Get("me")
  me(@CurrentTenant() tenant: RequestTenant) {
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      isolationMode: tenant.isolationMode,
      dataRegion: tenant.dataRegion,
      customDomain: tenant.customDomain,
      customDomainVerified: tenant.customDomainVerified,
      branding: tenant.branding,
      dedicatedDatabaseUrl: tenant.isolationMode === "DEDICATED" ? tenant.dedicatedDatabaseUrl : null,
    };
  }

  @Roles("OWNER")
  @Post("me/isolation")
  @HttpCode(200)
  async setIsolation(
    @CurrentTenant() tenant: RequestTenant,
    @Body(zodPipe(IsolationSchema)) body: z.infer<typeof IsolationSchema>,
  ) {
    if (body.mode === "DEDICATED" && tenant.plan !== "ENTERPRISE") {
      throw new ForbiddenException({
        message: "Dedicated database isolation is available on the Enterprise plan",
        code: "PLAN_UPGRADE_REQUIRED",
      });
    }
    if (body.mode === "DEDICATED" && !body.dedicatedDatabaseUrl) {
      throw new ForbiddenException({
        message: "Provide the dedicated database URL (see the isolation runbook in the README)",
        code: "DEDICATED_URL_REQUIRED",
      });
    }
    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        isolationMode: body.mode,
        dedicatedDatabaseUrl: body.mode === "DEDICATED" ? body.dedicatedDatabaseUrl : null,
      },
    });
    await this.registry.invalidate(tenant.id);
    return { ok: true, isolationMode: updated.isolationMode };
  }
}
