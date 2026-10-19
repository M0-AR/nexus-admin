import { expect, request, type APIRequestContext } from "@playwright/test";

export const API_BASE = process.env.E2E_API_URL ?? "http://localhost:4000";
export const UI_BASE = process.env.E2E_UI_URL ?? "http://localhost:3200";
export const PASSWORD = "Password123!";

export interface AuthBundle {
  accessToken: string;
  user: { id: string; email: string; name: string; avatarColor: string };
  tenant: { id: string; slug: string; name: string; plan: string; dataRegion: string };
  role: string;
  memberships: Array<{ tenantId: string; slug: string; name: string; role: string }>;
}

export function newApiContext(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: API_BASE });
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function login(
  ctx: APIRequestContext,
  email: string,
  tenantSlug?: string,
): Promise<AuthBundle> {
  const res = await ctx.post("/api/auth/login", { data: { email, password: PASSWORD, tenantSlug } });
  expect(res.status(), `login ${email} failed: ${await res.text()}`).toBe(200);
  return (await res.json()) as AuthBundle;
}

let tenantCounter = 0;

/**
 * Provisions a brand-new workspace through the public signup flow.
 * Unique email per call so every run starts from pristine plan limits.
 * New tenants are STARTER (no audit_log, 5 seats, 50 products, 300 rpm).
 */
export async function provisionTenant(
  ctx: APIRequestContext,
  label: string,
): Promise<AuthBundle> {
  const unique = `${label}-${Date.now().toString(36)}-${tenantCounter++}`;
  const res = await ctx.post("/api/auth/signup", {
    data: {
      companyName: `E2E ${unique}`,
      name: "E2E Owner",
      email: `${unique}@e2e.test`,
      password: PASSWORD,
      region: "us-east-1",
    },
  });
  expect(res.status(), `signup failed: ${await res.text()}`).toBe(201);
  return (await res.json()) as AuthBundle;
}

export async function listOrders(
  ctx: APIRequestContext,
  token: string,
): Promise<{ items: Array<{ id: string; number: string; status: string }>; total: number; page: number; pages: number }> {
  const res = await ctx.get("/api/orders?pageSize=50", { headers: bearer(token) });
  expect(res.status()).toBe(200);
  return res.json();
}

export async function setPlan(ctx: APIRequestContext, token: string, plan: string): Promise<void> {
  const res = await ctx.post("/api/billing/plan", { headers: bearer(token), data: { plan } });
  expect(res.ok(), `plan switch to ${plan} failed: ${await res.text()}`).toBeTruthy();
}
