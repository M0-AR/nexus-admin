import { expect, test, type APIRequestContext } from "@playwright/test";
import { bearer, login, newApiContext, PASSWORD } from "../../support/api.ts";

let ctx: APIRequestContext;

test.beforeAll(async () => {
  ctx = await newApiContext();
});
test.afterAll(async () => {
  await ctx.dispose();
});

test.describe("auth contract", () => {
  test("health endpoint is public", async () => {
    const res = await ctx.get("/api/healthz");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status ?? body.ok).toBeTruthy();
  });

  test("protected endpoints reject anonymous requests", async () => {
    for (const path of ["/api/orders", "/api/products", "/api/members", "/api/billing", "/api/dashboard/summary"]) {
      const res = await ctx.get(path);
      expect(res.status(), path).toBe(401);
    }
  });

  test("login rejects a wrong password with 401", async () => {
    const res = await ctx.post("/api/auth/login", {
      data: { email: "owner@acme.test", password: "wrong-password-123" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("BAD_CREDENTIALS");
  });

  test("login returns access token, bundle and an httpOnly refresh cookie", async () => {
    const res = await ctx.post("/api/auth/login", {
      data: { email: "owner@acme.test", password: PASSWORD, tenantSlug: "acme" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.tenant.slug).toBe("acme");
    expect(body.role).toBe("OWNER");
    const cookies = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
    expect(cookies.some((c) => c.value.includes("nexus_rt="))).toBe(true);
    const access = cookies.find((c) => c.value.includes("nexus_rt="));
    expect(access?.value).toContain("HttpOnly");
  });

  test("me returns the authenticated user with memberships", async () => {
    const bundle = await login(ctx, "owner@acme.test", "acme");
    const res = await ctx.get("/api/auth/me", { headers: bearer(bundle.accessToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("owner@acme.test");
    expect(Array.isArray(body.memberships)).toBe(true);
    expect(body.memberships.some((m: { slug: string }) => m.slug === "acme")).toBe(true);
  });

  test("invalid access tokens are rejected", async () => {
    const res = await ctx.get("/api/orders", { headers: bearer("not-a-real-token") });
    expect(res.status()).toBe(401);
  });

  test("refresh rotates the session and logout revokes it", async () => {
    const fresh = await newApiContext();
    try {
      const resetRes = await fresh.post("/api/auth/login", {
        data: { email: "owner@globex.test", password: PASSWORD, tenantSlug: "globex" },
      });
      expect(resetRes.status()).toBe(200);

      const refreshed = await fresh.post("/api/auth/refresh");
      expect(refreshed.status()).toBe(200);
      const body = await refreshed.json();
      expect(body.accessToken).toBeTruthy();

      const loggedOut = await fresh.post("/api/auth/logout");
      expect(loggedOut.status()).toBe(200);

      const after = await fresh.post("/api/auth/refresh");
      expect(after.status()).toBe(401);
      const afterBody = await after.json();
      expect(["REFRESH_INVALID", "NO_REFRESH_TOKEN"]).toContain(afterBody.code);
    } finally {
      await fresh.dispose();
    }
  });
});
