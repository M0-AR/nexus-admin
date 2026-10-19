import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { z } from "zod";
import { CurrentTenant, Roles } from "../common/decorators.ts";
import { zodPipe } from "../common/zod.pipe.ts";
import type { RequestTenant } from "../common/request-types.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { TenantsService } from "../tenancy/tenants.service.ts";
import { EntitlementsService } from "./entitlements.service.ts";
import { UsageService } from "./usage.service.ts";
import { FEATURE_KEYS, FEATURE_LABELS, PLANS } from "./plans.ts";
import type { FeatureKey } from "./plans.ts";

const PlanSchema = z.object({ plan: z.enum(["FREE", "STARTER", "PRO", "ENTERPRISE"]) });

/**
 * Pattern #5: the billing engine surface. Subscription state lives in
 * Postgres; usage comes from the metering ledger. Stripe-ready: customer and
 * subscription ids are stored, switching plans here simulates a checkout
 * completion (wire Stripe Billing webhooks to the same service in production).
 */
@Controller("billing")
export class BillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly usage: UsageService,
    private readonly tenants: TenantsService,
  ) {}

  @Get()
  async overview(@CurrentTenant() tenant: RequestTenant) {
    const [subscription, ent, apiCalls, orders, visits] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { tenantId: tenant.id } }),
      this.entitlements.effective(tenant),
      this.usage.periodTotal(tenant, "api_calls", 30),
      this.usage.periodTotal(tenant, "orders", 30),
      this.usage.periodTotal(tenant, "visits", 30),
    ]);
    const daily = await this.usage.series(tenant, "api_calls", 30);
    return {
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            seats: subscription.seats,
            currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
            stripeCustomerId: subscription.stripeCustomerId,
          }
        : null,
      plan: {
        tier: ent.plan.tier,
        name: ent.plan.name,
        priceMonthly: ent.plan.priceMonthly,
        features: ent.features,
        overrides: ent.overrides,
        limits: ent.plan.limits,
        requestsPerMinute: ent.plan.requestsPerMinute,
      },
      seats: ent.seats,
      period: this.usage.currentPeriod(),
      usage: {
        api_calls: { total: apiCalls, daily },
        orders: { total: orders },
        visits: { total: visits },
        limits: ent.plan.limits,
      },
      plans: Object.values(PLANS).map((p) => ({
        tier: p.tier,
        name: p.name,
        tagline: p.tagline,
        priceMonthly: p.priceMonthly,
        seats: p.seats,
        requestsPerMinute: p.requestsPerMinute,
        features: p.features,
        limits: p.limits,
      })),
      featureMeta: FEATURE_KEYS.map((k) => ({ key: k, ...FEATURE_LABELS[k] })),
    };
  }

  @Roles("OWNER")
  @Post("plan")
  @HttpCode(200)
  async changePlan(
    @CurrentTenant() tenant: RequestTenant,
    @Body(zodPipe(PlanSchema)) body: z.infer<typeof PlanSchema>,
  ) {
    const def = PLANS[body.plan];
    const subscription = await this.prisma.subscription.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        plan: body.plan,
        status: "ACTIVE",
        seats: def.seats,
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
      update: {
        plan: body.plan,
        status: "ACTIVE",
        seats: def.seats,
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    await this.prisma.tenant.update({ where: { id: tenant.id }, data: { plan: body.plan } });
    await Promise.all([this.tenants.invalidate(tenant.id), this.entitlements.invalidate(tenant.id)]);
    return {
      ok: true,
      plan: subscription.plan,
      message: `Switched to ${def.name}. Stripe Billing would finalize proration here in production.`,
    };
  }

  @Roles("OWNER", "ADMIN")
  @Post("features")
  @HttpCode(200)
  async setFeature(
    @CurrentTenant() tenant: RequestTenant,
    @Body(zodPipe(z.object({ feature: z.string(), enabled: z.boolean() })))
    body: { feature: string; enabled: boolean },
  ) {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}::text, true)`;
      return tx.featureOverride.upsert({
        where: { tenantId_feature: { tenantId: tenant.id, feature: body.feature } },
        create: { tenantId: tenant.id, feature: body.feature, enabled: body.enabled },
        update: { enabled: body.enabled },
      });
    });
    await this.entitlements.invalidate(tenant.id);
    return { ok: true, feature: row.feature as FeatureKey, enabled: row.enabled };
  }
}
