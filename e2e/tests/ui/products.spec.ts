import { expect, test } from "@playwright/test";
import { signIn } from "../../support/session.ts";

test.describe("products", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "acme");
  });

  test("creates a product, edits stock, then archives it", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const name = `E2E Widget ${stamp}`;
    const sku = `E2E-${stamp.toUpperCase()}`;

    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "Products", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: /New product/ }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("SKU").fill(sku);
    await dialog.getByLabel("Price (USD)").fill("59.90");
    await dialog.getByLabel("Stock").fill("12");
    await dialog.getByRole("button", { name: "Create product" }).click();

    await expect(dialog).toBeHidden();
    await page.getByLabel("Search products").fill(sku);
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

    await page.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog.getByLabel("SKU")).toBeDisabled();
    await editDialog.getByLabel("Stock").fill("4");
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).toBeHidden();
    await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("4");

    await page.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm.getByText(`Archive ${name}?`)).toBeVisible();
    await confirm.getByRole("button", { name: "Archive" }).click();
    await expect(confirm).toBeHidden();

    await expect(
      page.getByRole("row", { name: new RegExp(name) }),
    ).toHaveCount(0);
  });

  test("duplicate SKU surfaces a friendly conflict error", async ({ page }) => {
    await page.goto("/products");
    const firstSku = await page.locator("tbody tr").first().getByRole("cell").nth(1).textContent();

    await page.getByRole("button", { name: /New product/ }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Duplicate Probe");
    await dialog.getByLabel("SKU").fill(firstSku?.trim() ?? "DUP-1");
    await dialog.getByLabel("Price (USD)").fill("1");
    await dialog.getByRole("button", { name: "Create product" }).click();

    await expect(dialog.getByText(/already exists/)).toBeVisible();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
