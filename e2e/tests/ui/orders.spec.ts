import { expect, test } from "@playwright/test";
import { signIn } from "../../support/session.ts";

test.describe("orders", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "acme");
  });

  test("creates an order through the dialog and finds it via search", async ({ page }) => {
    const marker = `E2E Buyer ${Date.now().toString(36)}`;

    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: /New order/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "New order" })).toBeVisible();

    await dialog.getByLabel("Customer").fill(marker);
    await dialog.getByLabel("Product").fill("Nimbus Pro");
    await dialog.getByLabel("Amount (USD)").fill("149.50");
    await dialog.getByLabel("Channel").selectOption("DIRECT");
    await dialog.getByLabel("Status").selectOption("PENDING");
    await dialog.getByRole("button", { name: "Create order" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status").getByText(/order/i)).toBeVisible();

    await page.getByLabel("Search orders").fill(marker);
    await expect(page.getByRole("cell", { name: marker })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Nimbus Pro" }).first()).toBeVisible();
  });

  test("status filter narrows rows and Clear resets it", async ({ page }) => {
    await page.goto("/orders");
    await page.getByLabel("Filter by status").selectOption("PAID");

    const dots = page.locator("tbody tr");
    await expect(dots.first()).toBeVisible();

    const badges = page.locator("tbody").getByText("Paid", { exact: true });
    await expect(badges.first()).toBeVisible();

    await page.getByRole("button", { name: /Clear/ }).click();
    await expect(page.getByLabel("Filter by status")).toHaveValue("");
  });

  test("row selection reveals the bulk toolbar and clears", async ({ page }) => {
    await page.goto("/orders");
    await page.locator("tbody tr").first().waitFor();

    const rowCheckbox = page.getByRole("checkbox").nth(1);
    await rowCheckbox.check();

    await expect(page.getByText("1 selected")).toBeVisible();
    await expect(page.getByRole("button", { name: /Set status/ })).toBeVisible();

    await page.getByRole("button", { name: "Clear selection" }).click();
    await expect(page.getByText("1 selected")).toBeHidden();
  });

  test("select-all checkbox toggles every row on the page", async ({ page }) => {
    await page.goto("/orders");
    await page.locator("tbody tr").first().waitFor();

    await page.getByRole("checkbox").first().check();
    const selectedText = page.getByText(/\d+ selected/);
    await expect(selectedText).toBeVisible();

    await page.getByRole("button", { name: "Clear selection" }).click();
    await expect(selectedText).toBeHidden();
  });

  test("dialog blocks an invalid email", async ({ page }) => {
    await page.goto("/orders");
    await page.getByRole("button", { name: /New order/ }).first().click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Customer").fill("Validation Probe");
    await dialog.getByLabel("Email").fill("not-an-email");
    await dialog.getByLabel("Product").fill("Nimbus Pro");
    await dialog.getByLabel("Amount (USD)").fill("10");
    await dialog.getByRole("button", { name: "Create order" }).click();

    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
