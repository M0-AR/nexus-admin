import { expect, test, type APIRequestContext } from "@playwright/test";
import { bearer, listOrders, login, newApiContext, type AuthBundle } from "../../support/api.ts";

let ctx: APIRequestContext;
let acme: AuthBundle;

test.beforeAll(async () => {
  ctx = await newApiContext();
  acme = await login(ctx, "owner@acme.test", "acme");
});
test.afterAll(async () => {
  await ctx.dispose();
});

test.describe("orders contract", () => {
  test("list returns a paginated envelope with stable fields", async () => {
    const res = await ctx.get("/api/orders?page=1&pageSize=5&sort=createdAt&dir=desc", {
      headers: bearer(acme.accessToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(5);
    expect(body.items.length).toBeLessThanOrEqual(5);
    expect(body.total).toBeGreaterThan(0);
    const order = body.items[0];
    for (const key of ["id", "number", "customer", "product", "channel", "amount", "status", "createdAt"]) {
      expect(order, `missing ${key}`).toHaveProperty(key);
    }
  });

  test("search and status filters narrow the result set", async () => {
    const all = await listOrders(ctx, acme.accessToken);
    const target = all.items[0];

    const byNumber = await ctx.get(`/api/orders?q=${encodeURIComponent(target.number)}`, {
      headers: bearer(acme.accessToken),
    });
    const found = await byNumber.json();
    expect(found.items.length).toBeGreaterThan(0);
    expect(found.items.every((o: { number: string }) => o.number.toLowerCase().includes(target.number.toLowerCase()))).toBe(true);
  });

  test("invalid query params are rejected with 400", async () => {
    const res = await ctx.get("/api/orders?status=NOT_A_STATUS", { headers: bearer(acme.accessToken) });
    expect(res.status()).toBe(400);
  });

  test("create, update status, and bulk status round-trip", async () => {

    const created = await ctx.post("/api/orders", {
      headers: bearer(acme.accessToken),
      data: {
        customer: "E2E Contract Buyer",
        email: "e2e-buyer@example.com",
        product: "Nimbus Pro",
        channel: "DIRECT",
        amount: 249.5,
        status: "PENDING",
      },
    });
    expect(created.status()).toBe(201);
    const order = await created.json();
    expect(order.number).toMatch(/^NC-\d+$/);
    expect(order.status).toBe("PENDING");

    const paid = await ctx.patch(`/api/orders/${order.id}/status`, {
      headers: bearer(acme.accessToken),
      data: { status: "PAID" },
    });
    expect(paid.status()).toBe(200);
    expect((await paid.json()).status).toBe("PAID");

    const bulk = await ctx.patch("/api/orders/bulk/status", {
      headers: bearer(acme.accessToken),
      data: { ids: [order.id], status: "CANCELLED" },
    });
    expect(bulk.status()).toBe(200);
    expect((await bulk.json()).updated).toBe(1);

    // Revert to the snapshot status so repeat runs stay deterministic.
    const revert = await ctx.patch("/api/orders/bulk/status", {
      headers: bearer(acme.accessToken),
      data: { ids: [order.id], status: "PENDING" },
    });
    expect(revert.status()).toBe(200);
  });

  test("create validates required fields", async () => {
    const res = await ctx.post("/api/orders", {
      headers: bearer(acme.accessToken),
      data: { customer: "", amount: -5 },
    });
    expect(res.status()).toBe(400);
  });
});
