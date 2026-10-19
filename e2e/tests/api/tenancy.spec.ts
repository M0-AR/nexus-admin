import { expect, test, type APIRequestContext } from "@playwright/test";
import { bearer, listOrders, login, newApiContext, type AuthBundle as Bundle } from "../../support/api.ts";

let ctx: APIRequestContext;
let acme: Bundle;
let globex: Bundle;

test.beforeAll(async () => {
  ctx = await newApiContext();
  acme = await login(ctx, "owner@acme.test", "acme");
  globex = await login(ctx, "owner@globex.test", "globex");
});
test.afterAll(async () => {
  await ctx.dispose();
});

test.describe("tenant isolation over HTTP", () => {
  test("acme and globex see disjoint order books", async () => {
    const [acmeOrders, globexOrders] = await Promise.all([
      listOrders(ctx, acme.accessToken),
      listOrders(ctx, globex.accessToken),
    ]);
    expect(acmeOrders.total).toBeGreaterThan(0);
    expect(globexOrders.total).toBeGreaterThan(0);

    const acmeIds = new Set(acmeOrders.items.map((o) => o.id));
    const overlap = globexOrders.items.filter((o) => acmeIds.has(o.id));
    expect(overlap).toHaveLength(0);
  });

  test("status updates on another tenant's order return 404 NOT_FOUND", async () => {
    const { items } = await listOrders(ctx, acme.accessToken);
    const foreign = items[0];

    const res = await ctx.patch(`/api/orders/${foreign.id}/status`, {
      headers: bearer(globex.accessToken),
      data: { status: "CANCELLED" },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_FOUND");

    const untouched = await listOrders(ctx, acme.accessToken);
    expect(untouched.items.find((o) => o.id === foreign.id)?.status).toBe(foreign.status);
  });

  test("bulk status on foreign order ids updates nothing", async () => {
    const { items } = await listOrders(ctx, acme.accessToken);

    const res = await ctx.patch("/api/orders/bulk/status", {
      headers: bearer(globex.accessToken),
      data: { ids: items.slice(0, 2).map((o) => o.id), status: "CANCELLED" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(0);
  });

  test("product writes across tenants return 404 NOT_FOUND", async () => {
    const acmeProducts = await ctx.get("/api/products?pageSize=1", { headers: bearer(acme.accessToken) });
    const { items } = await acmeProducts.json();
    const foreign = items[0];

    const patch = await ctx.patch(`/api/products/${foreign.id}`, {
      headers: bearer(globex.accessToken),
      data: { stock: 999 },
    });
    expect(patch.status()).toBe(404);

    const remove = await ctx.delete(`/api/products/${foreign.id}`, {
      headers: bearer(globex.accessToken),
    });
    expect(remove.status()).toBe(404);

    const verify = await ctx.get(`/api/products?q=${encodeURIComponent(foreign.sku)}`, {
      headers: bearer(acme.accessToken),
    });
    const check = await verify.json();
    expect(check.items.find((p: { id: string }) => p.id === foreign.id)?.status).toBe(foreign.status);
  });

  test("a user without a membership in a tenant cannot switch into it", async () => {
    const res = await ctx.post("/api/auth/switch", {
      headers: bearer(globex.accessToken),
      data: { tenantSlug: "acme" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("NOT_A_MEMBER");
  });
});
