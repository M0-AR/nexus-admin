import { expect, test, type APIRequestContext } from "@playwright/test";
import { bearer, login, newApiContext, provisionTenant, type AuthBundle } from "../../support/api.ts";

let ctx: APIRequestContext;
let acme!: AuthBundle;

test.beforeAll(async () => {
  ctx = await newApiContext();
  acme = await login(ctx, "owner@acme.test", "acme");
});
test.afterAll(async () => {
  await ctx.dispose();
});

test.describe("billing contract", () => {
  test("overview returns plan, seats, usage, all four plans and feature metadata", async () => {
    const res = await ctx.get("/api/billing", { headers: bearer(acme.accessToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.plan.tier).toBe("ENTERPRISE");
    expect(body.plans.map((p: { tier: string }) => p.tier).sort()).toEqual(["ENTERPRISE", "FREE", "PRO", "STARTER"]);
    expect(body.featureMeta.length).toBeGreaterThanOrEqual(8);
    expect(body.seats.used).toBeGreaterThan(0);
    expect(body.usage.orders.total).toBeGreaterThanOrEqual(0);
  });

  test("plan switch changes entitlements immediately", async () => {
    const temp = await provisionTenant(ctx, "billing-switch");
    expect(temp.tenant.plan).toBe("STARTER");

    const before = await ctx.get("/api/billing", { headers: bearer(temp.accessToken) });
    expect((await before.json()).plan.features.audit_log).toBe(false);

    const switched = await ctx.post("/api/billing/plan", {
      headers: bearer(temp.accessToken),
      data: { plan: "PRO" },
    });
    expect(switched.ok()).toBeTruthy();

    const after = await ctx.get("/api/billing", { headers: bearer(temp.accessToken) });
    const afterBody = await after.json();
    expect(afterBody.plan.tier).toBe("PRO");
    expect(afterBody.plan.features.audit_log).toBe(true);

    const audit = await ctx.get("/api/audit", { headers: bearer(temp.accessToken) });
    expect(audit.status()).toBe(200);
  });

  test("feature overrides flip entitlements and revert cleanly", async () => {
    const temp = await provisionTenant(ctx, "billing-override");

    const enable = await ctx.post("/api/billing/features", {
      headers: bearer(temp.accessToken),
      data: { feature: "audit_log", enabled: true },
    });
    expect(enable.ok()).toBeTruthy();
    const on = await ctx.get("/api/billing", { headers: bearer(temp.accessToken) });
    expect((await on.json()).plan.features.audit_log).toBe(true);

    const disable = await ctx.post("/api/billing/features", {
      headers: bearer(temp.accessToken),
      data: { feature: "audit_log", enabled: false },
    });
    expect(disable.ok()).toBeTruthy();
    const off = await ctx.get("/api/billing", { headers: bearer(temp.accessToken) });
    const body = await off.json();
    expect(body.plan.features.audit_log).toBe(false);
    const audit = await ctx.get("/api/audit", { headers: bearer(temp.accessToken) });
    expect(audit.status()).toBe(403);
  });

  test("members cannot switch plans, owners can", async () => {
    const temp = await provisionTenant(ctx, "billing-roles");
    const invited = await ctx.post("/api/members/invite", {
      headers: bearer(temp.accessToken),
      data: { email: `billing-${Date.now().toString(36)}@e2e.test`, role: "MEMBER" },
    });
    const { member, tempPassword } = await invited.json();

    const login = await ctx.post("/api/auth/login", {
      data: { email: member.email, password: tempPassword, tenantSlug: temp.tenant.slug },
    });
    const memberToken = (await login.json()).accessToken as string;

    const denied = await ctx.post("/api/billing/plan", {
      headers: bearer(memberToken),
      data: { plan: "ENTERPRISE" },
    });
    expect(denied.status()).toBe(403);

    const allowed = await ctx.post("/api/billing/plan", {
      headers: bearer(temp.accessToken),
      data: { plan: "PRO" },
    });
    expect(allowed.ok()).toBeTruthy();
  });
});
