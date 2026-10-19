import { expect, test, type APIRequestContext } from "@playwright/test";
import { bearer, newApiContext, provisionTenant, setPlan } from "../../support/api.ts";

let ctx: APIRequestContext;

test.beforeAll(async () => {
  ctx = await newApiContext();
});
test.afterAll(async () => {
  await ctx.dispose();
});

test.describe("rate limiting", () => {
  test("a FREE tenant bursting past its per-tenant budget gets 429 RATE_LIMITED", async () => {
    // Isolated tenant: this test intentionally exhausts the tenant bucket.
    const temp = await provisionTenant(ctx, "ratelimit");
    await setPlan(ctx, temp.accessToken, "FREE"); // 60 req/min => 10 req/s burst window

    const attempts = await Promise.all(
      Array.from({ length: 15 }, () =>
        ctx.get("/api/orders?pageSize=1", { headers: bearer(temp.accessToken) }),
      ),
    );
    const statuses = attempts.map((r) => r.status());
    const limited = attempts.filter((r) => r.status() === 429);
    expect(limited.length, `statuses: ${statuses.join(",")}`).toBeGreaterThan(0);

    const body = await limited[0].json();
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.details.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
