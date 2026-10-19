import { expect, test, type APIRequestContext } from "@playwright/test";
import { bearer, login, newApiContext, provisionTenant, setPlan, type AuthBundle } from "../../support/api.ts";

let ctx: APIRequestContext;
let acme: AuthBundle;

test.beforeAll(async () => {
  ctx = await newApiContext();
  acme = await login(ctx, "owner@acme.test", "acme");
});
test.afterAll(async () => {
  await ctx.dispose();
});

test.describe("products contract", () => {
  test("create, edit, and archive a product", async () => {
    const sku = `E2E-${Date.now().toString(36).toUpperCase()}`;

    const created = await ctx.post("/api/products", {
      headers: bearer(acme.accessToken),
      data: { name: "E2E Widget", sku, price: 42, stock: 7, status: "ACTIVE" },
    });
    expect(created.status()).toBe(201);
    const product = await created.json();
    expect(product.sku).toBe(sku);

    const edited = await ctx.patch(`/api/products/${product.id}`, {
      headers: bearer(acme.accessToken),
      data: { stock: 9, price: 45 },
    });
    expect(edited.status()).toBe(200);
    const editedBody = await edited.json();
    expect(editedBody.stock).toBe(9);
    expect(editedBody.sku).toBe(sku);

    const archived = await ctx.delete(`/api/products/${product.id}`, {
      headers: bearer(acme.accessToken),
    });
    expect(archived.status()).toBe(200);
    expect((await archived.json()).status).toBe("ARCHIVED");
  });

  test("duplicate SKUs are rejected", async () => {
    const list = await ctx.get("/api/products?pageSize=1", { headers: bearer(acme.accessToken) });
    const { items } = await list.json();
    const existingSku = items[0].sku;

    const res = await ctx.post("/api/products", {
      headers: bearer(acme.accessToken),
      data: { name: "Dup", sku: existingSku, price: 1, stock: 1 },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });

  test("products over the plan limit are rejected with PLAN_LIMIT_REACHED", async () => {
    const temp = await provisionTenant(ctx, "products-limit");
    await setPlan(ctx, temp.accessToken, "FREE");

    const list = await ctx.get("/api/products?pageSize=1", { headers: bearer(temp.accessToken) });
    const { total } = await list.json();
    expect(total).toBeLessThan(10);

    for (let i = 0; i < 10 - total; i++) {
      const res = await ctx.post("/api/products", {
        headers: bearer(temp.accessToken),
        data: { name: `Fill ${i}`, sku: `FILL-${Date.now().toString(36)}-${i}`, price: 1, stock: 1 },
      });
      expect(res.status(), `fill ${i}`).toBe(201);
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 150));
    }

    const blocked = await ctx.post("/api/products", {
      headers: bearer(temp.accessToken),
      data: { name: "One too many", sku: `OVER-${Date.now().toString(36)}`, price: 1, stock: 1 },
    });
    expect(blocked.status()).toBe(403);
    const body = await blocked.json();
    expect(body.code).toBe("PLAN_LIMIT_REACHED");
  });
});
