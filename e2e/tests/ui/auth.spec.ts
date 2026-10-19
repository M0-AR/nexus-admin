import { expect, test } from "@playwright/test";

test.describe("authentication flow", () => {
  test("anonymous visitors are redirected to the login page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("wrong credentials show an inline error and stay on the page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Work email").fill("owner@acme.test");
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("demo login lands on the dashboard and logout returns to login", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Acme Corp/ }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Good to see you/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Audit log" })).toBeVisible();

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
