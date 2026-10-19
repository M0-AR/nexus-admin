import { expect, test } from "@playwright/test";
import { signIn } from "../../support/session.ts";

test.describe("settings", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "acme");
  });

  test("tabs switch, deep-link works and billing shows the current plan", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Branding" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByLabel("Workspace name")).toBeVisible();

    await page.getByRole("button", { name: "Billing & features" }).click();
    await expect(page).toHaveURL(/tab=billing/);
    await expect(page.getByRole("heading", { name: "Current plan" })).toBeVisible();
    await expect(page.getByText("Enterprise", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Security & domain" }).click();
    await expect(page).toHaveURL(/tab=security/);
  });

  test("deep link straight into the billing tab", async ({ page }) => {
    await page.goto("/settings?tab=billing");
    await expect(page.getByRole("button", { name: "Billing & features" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Plans", { exact: true })).toBeVisible();
  });

  test("plan switch asks for confirmation and cancel performs no change", async ({ page }) => {
    await page.goto("/settings?tab=billing");

    await page.getByRole("button", { name: "Switch to Free" }).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm.getByText("Switch to Free?")).toBeVisible();
    await expect(confirm.getByText(/switching from Enterprise to Free/)).toBeVisible();

    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toBeHidden();

    await page.reload();
    await expect(page.getByText("Enterprise", { exact: true }).first()).toBeVisible();
  });

  test("branding edits persist across reload", async ({ page }) => {
    const stamp = Date.now().toString(36).toUpperCase().slice(-4);
    await page.goto("/settings");
    const logoText = page.getByLabel("Logo text");
    const original = await logoText.inputValue();

    await logoText.fill(stamp);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").last()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Logo text")).toHaveValue(stamp);

    await page.getByLabel("Logo text").fill(original);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").last()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Logo text")).toHaveValue(original);
  });
});
