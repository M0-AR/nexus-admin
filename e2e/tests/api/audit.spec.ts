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

test.describe("audit contract", () => {
  test("plan without audit_log is blocked with FEATURE_NOT_ENABLED", async () => {
    const temp = await provisionTenant(ctx, "audit-gate");
    const res = await ctx.get("/api/audit", { headers: bearer(temp.accessToken) });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("FEATURE_NOT_ENABLED");
  });

  test("enterprise tenant sees entries recorded from its own mutations", async () => {
    const accessToken = acme.accessToken;
    const marker = `E2E audit ${Date.now().toString(36)}`;

    const created = await ctx.post("/api/orders", {
      headers: bearer(accessToken),
      data: { customer: marker, product: "Nimbus Pro", channel: "DIRECT", amount: 10, status: "PENDING" },
    });
    expect(created.status()).toBe(201);

    let found = false;
    for (let attempt = 0; attempt < 10 && !found; attempt++) {
      const res = await ctx.get("/api/audit?action=orders.created&pageSize=20", {
        headers: bearer(accessToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      found = body.items.some((e: { actorEmail: string; meta?: { route?: string } }) => e.actorEmail === "owner@acme.test");
      if (!found) await new Promise((r) => setTimeout(r, 200));
    }
    expect(found, "audit entry for orders.created should appear").toBe(true);
  });

  test("audit search filters by action", async () => {
    const res = await ctx.get("/api/audit?action=orders.&pageSize=5", { headers: bearer(acme.accessToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items.every((e: { action: string }) => e.action.includes("orders."))).toBe(true);
  });
});
