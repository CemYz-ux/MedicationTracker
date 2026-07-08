import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("shows an empty state when no medications are logged", async ({ page }) => {
  await expect(page.getByText("No medications logged yet.")).toBeVisible();
});

test("adds a medication and shows it in the list", async ({ page }) => {
  await page.getByLabel("Name").fill("Aspirin");
  await page.getByLabel("Dose").fill("100mg");
  await page.getByLabel("Time").fill("08:00");
  await page.getByRole("button", { name: "Add medication" }).click();

  await expect(page.getByText("Aspirin — 100mg at 08:00")).toBeVisible();
  await expect(page.getByText("No medications logged yet.")).toBeHidden();
});

test("persists medications across a reload", async ({ page }) => {
  await page.getByLabel("Name").fill("Ibuprofen");
  await page.getByLabel("Dose").fill("200mg");
  await page.getByLabel("Time").fill("12:00");
  await page.getByRole("button", { name: "Add medication" }).click();

  await page.reload();

  await expect(page.getByText("Ibuprofen — 200mg at 12:00")).toBeVisible();
});

test("removes a medication from the list", async ({ page }) => {
  await page.getByLabel("Name").fill("Aspirin");
  await page.getByLabel("Dose").fill("100mg");
  await page.getByLabel("Time").fill("08:00");
  await page.getByRole("button", { name: "Add medication" }).click();

  await page.getByRole("button", { name: "Remove Aspirin" }).click();

  await expect(page.getByText("No medications logged yet.")).toBeVisible();
});

test("shows a validation error when required fields are empty", async ({ page }) => {
  await page.getByRole("button", { name: "Add medication" }).click();
  await expect(page.getByRole("alert")).not.toBeEmpty();
});
