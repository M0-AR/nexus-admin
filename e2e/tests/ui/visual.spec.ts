import { expect, test } from "@playwright/test";
import { signIn } from "../../support/session.ts";

test.describe("visual regression @visual", () => {
  test("login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.mouse.move(-1, -1);
    await expect(page).toHaveScreenshot("login.png", { fullPage: true });
  });

  test("settings branding tab", async ({ page }) => {
    await signIn(page, "acme");
    await page.goto("/settings");
    await expect(page.getByLabel("Workspace name")).toBeVisible();
    await page.mouse.move(-1, -1);
    await expect(page).toHaveScreenshot("settings-branding.png", { fullPage: true });
  });
});
