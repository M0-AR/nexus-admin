import { expect, test } from "@playwright/test";
import { signIn } from "../../support/session.ts";

test.describe("dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "acme");
  });

  test("renders greeting, stat cards, charts and activity", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: /Good to see you/ })).toBeVisible();
    await expect(page.getByText(/last \d+ days/)).toBeVisible();

    for (const card of ["Revenue", "Orders", "Customers", "Visits", "Conversion"]) {
      await expect(page.getByText(card, { exact: true }).first()).toBeVisible();
    }

    await expect(page.getByRole("heading", { name: "Revenue", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acquisition channels" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Top products" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent orders" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
    await expect(page.getByRole("link", { name: /New order/ })).toBeVisible();
  });

  test("New order shortcut opens the order dialog on the orders page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /New order/ }).click();

    await expect(page).toHaveURL(/\/orders/);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "New order" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("topbar page title tracks navigation", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "Orders" }).click();
    await expect(page.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "Products" }).click();
    await expect(page.getByRole("heading", { name: "Products", level: 1 })).toBeVisible();
  });

  test("notifications popover opens, closes on Escape and restores focus", async ({ page }) => {
    await page.goto("/dashboard");
    const bell = page.getByRole("button", { name: /Notifications/ });
    await bell.click();
    await expect(page.getByText(/Notifications/).first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(bell).toBeFocused();
  });
});
