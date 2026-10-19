import { expect, test as setup } from "@playwright/test";
import { login, newApiContext } from "../support/api.ts";

const ACCOUNTS = [
  { slug: "acme", email: "owner@acme.test", plan: "ENTERPRISE" },
  { slug: "globex", email: "owner@globex.test", plan: "STARTER" },
] as const;

for (const account of ACCOUNTS) {
  setup(`authenticate ${account.slug}`, async () => {
    const ctx = await newApiContext();
    const bundle = await login(ctx, account.email, account.slug);
    expect(bundle.tenant.slug).toBe(account.slug);
    expect(bundle.tenant.plan).toBe(account.plan);
    expect(bundle.role).toBe("OWNER");
    await ctx.storageState({ path: `.auth/${account.slug}.json` });
    await ctx.dispose();
  });
}
