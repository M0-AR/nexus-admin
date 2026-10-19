import { expect, type Page } from "@playwright/test";
import { API_BASE, PASSWORD } from "./api.ts";

export type TenantSlug = "acme" | "globex";

const EMAILS: Record<TenantSlug, string> = {
  acme: "owner@acme.test",
  globex: "owner@globex.test",
};

/**
 * Refresh tokens rotate on every use, so a storageState file can only seed a
 * single context. Signing in through the page's own request context keeps the
 * httpOnly refresh cookie in sync with the browser and is safe to run per test.
 */
export async function signIn(page: Page, slug: TenantSlug = "acme") {
  const res = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { email: EMAILS[slug], password: PASSWORD, tenantSlug: slug },
  });
  expect(res.status(), `sign in as ${slug}`).toBe(200);
}
