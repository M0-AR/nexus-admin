import { expect, test } from "@playwright/test";
import { signIn } from "../../support/session.ts";

test.describe("audit log (acme, audit_log enabled)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "acme");
  });

  test("sidebar exposes Audit log and the table renders rows", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Audit log" }).click();

    await expect(page).toHaveURL(/\/audit/);
    await expect(page.getByRole("heading", { name: "Audit log", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Search audit events")).toBeVisible();

    await page.locator("tbody tr").first().waitFor();
    await page.locator("tbody tr").nth(1).waitFor();
  });

  test("search narrows results and can be cleared", async ({ page }) => {
    await page.goto("/audit");
    await page.locator("tbody tr").first().waitFor();

    await page.getByLabel("Search audit events").fill("owner@acme.test");
    await expect(page.locator("tbody tr").first()).toContainText("owner@acme.test");

    await page.getByLabel("Search audit events").fill("no-such-actor-zzz");
    await expect(page.getByText("No audit events match your filters")).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.locator("tbody tr").first().waitFor();
  });

  test("action filter chip clears with its X button", async ({ page }) => {
    await page.goto("/audit");
    await page.locator("tbody tr").first().waitFor();

    await page.getByLabel("Filter by action").fill("orders.");
    await expect(page.locator("tbody tr").first()).toContainText(/Orders/i);

    await page.getByRole("button", { name: "Clear action filter" }).click();
    await expect(page.getByLabel("Filter by action")).toHaveValue("");
  });
});

test.describe("audit log (globex, feature override)", () => {
  test("the seeded override grants access on a STARTER plan and is labeled in billing", async ({ page }) => {
    await signIn(page, "globex");
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Audit log" })).toBeVisible();

    await page.goto("/audit");
    await expect(page.getByText("Audit log is not enabled on this plan")).toHaveCount(0);

    await page.goto("/settings?tab=billing");
    const auditRow = page.getByRole("listitem").filter({ hasText: "Audit log" }).first();
    await expect(auditRow.getByText("override")).toBeVisible();
  });
});

test.describe("audit log gate for a fresh workspace", () => {
  test("a brand-new STARTER signup has no audit access until upgraded", async ({ page }) => {
    const stamp = Date.now().toString(36);
    await page.goto("/signup");
    await page.getByLabel("Company").fill(`E2E Fresh ${stamp}`);
    await page.getByLabel("Your name").fill("Fresh Owner");
    await page.getByLabel("Work email").fill(`fresh-${stamp}@e2e.test`);
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: "Create workspace" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);

    await page.goto("/audit");
    await expect(page.getByText("Audit log is not enabled on this plan")).toBeVisible();
    await page.getByRole("link", { name: "View plans" }).click();
    await expect(page).toHaveURL(/\/settings\?tab=billing/);
  });
});
