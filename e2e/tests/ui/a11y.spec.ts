import AxeBuilder from "@axe-core/playwright";
import { signIn } from "../../support/session.ts";
import { expect, test, type Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const BLOCKING = new Set(["critical", "serious"]);

async function expectNoBlockingViolations(page: Page, context: string) {
  await page.waitForTimeout(250);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ""));
  const summary = blocking
    .map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
    .join("\n");
  expect(blocking, `${context}\n${summary}`).toEqual([]);
}

test.describe("accessibility", () => {
  test("login and signup pages are accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expectNoBlockingViolations(page, "login");

    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
    await expectNoBlockingViolations(page, "signup");
  });

  test("all authed pages are accessible", async ({ page }) => {
    test.slow();
    await signIn(page, "acme");
    const pages = [
      { path: "/dashboard", ready: /Good to see you/ },
      { path: "/orders", ready: /Every order across your storefront/ },
      { path: "/products", ready: /Manage your catalog/ },
      { path: "/users", ready: /Invite|members/ },
      { path: "/audit", ready: /Every sensitive action/ },
      { path: "/settings", ready: /Branding/ },
    ];

    for (const spec of pages) {
      await page.goto(spec.path);
      await expect(page.getByText(spec.ready).first()).toBeVisible();
      await expectNoBlockingViolations(page, spec.path);
    }
  });

  test("open dialogs and menus keep a clean axe trace", async ({ page }) => {
    await signIn(page, "acme");
    await page.goto("/orders");
    await page.getByRole("button", { name: /New order/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoBlockingViolations(page, "orders dialog");

    await page.keyboard.press("Escape");
    await page.getByLabel("Search orders").fill("");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Notifications/ }).click();
    await expectNoBlockingViolations(page, "notifications popover");

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Account menu" }).click();
    await expectNoBlockingViolations(page, "account menu");
  });
});
