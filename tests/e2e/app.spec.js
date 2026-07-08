import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("shows an empty state when no medications are logged", async ({ page }) => {
  await expect(page.getByText("No medications logged yet.")).toBeVisible();
});

test("opens the add-medication modal from the trigger", async ({ page }) => {
  const dialog = page.locator("#add-medication-dialog");
  await expect(dialog).not.toBeVisible();

  await page.getByRole("button", { name: "+ Add medication" }).click();

  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(page.getByLabel("Dose")).toBeVisible();
  await expect(page.getByLabel("Interval (hours)")).toBeVisible();
});

test("adds a valid medication and shows it in the list", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add medication" }).click();
  await page.getByLabel("Name").fill("Aspirin");
  await page.getByLabel("Dose").fill("100mg");
  await page.getByLabel("Interval (hours)").fill("8");
  await page.getByRole("button", { name: "Add medication", exact: true }).click();

  await expect(page.locator("#add-medication-dialog")).not.toBeVisible();
  await expect(page.getByText("Aspirin — 100mg")).toBeVisible();
  await expect(page.getByText("No medications logged yet.")).toBeHidden();
});

test("shows a validation error and keeps the modal open when fields are empty", async ({
  page,
}) => {
  await page.getByRole("button", { name: "+ Add medication" }).click();
  await page.getByRole("button", { name: "Add medication", exact: true }).click();

  const dialog = page.locator("#add-medication-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("alert")).not.toBeEmpty();
  await expect(page.getByText("No medications logged yet.")).toBeVisible();
});

test("shows a validation error for a non-numeric or non-positive interval", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add medication" }).click();
  await page.getByLabel("Name").fill("Aspirin");
  await page.getByLabel("Dose").fill("100mg");
  await page.getByLabel("Interval (hours)").fill("0");
  await page.getByRole("button", { name: "Add medication", exact: true }).click();

  const dialog = page.locator("#add-medication-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(
    "Interval (hours) must be a positive number."
  );
  await expect(page.getByText("No medications logged yet.")).toBeVisible();
});

test("persists an added medication across a reload", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add medication" }).click();
  await page.getByLabel("Name").fill("Ibuprofen");
  await page.getByLabel("Dose").fill("200mg");
  await page.getByLabel("Interval (hours)").fill("6");
  await page.getByRole("button", { name: "Add medication", exact: true }).click();

  await page.reload();

  await expect(page.getByText("Ibuprofen — 200mg")).toBeVisible();
});

test("closing via Cancel discards unsaved input and returns focus to the trigger", async ({
  page,
}) => {
  const trigger = page.getByRole("button", { name: "+ Add medication" });
  await trigger.click();
  await page.getByLabel("Name").fill("Should not be saved");

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.locator("#add-medication-dialog")).not.toBeVisible();
  await expect(page.getByText("No medications logged yet.")).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("closing via the close control discards unsaved input and returns focus to the trigger", async ({
  page,
}) => {
  const trigger = page.getByRole("button", { name: "+ Add medication" });
  await trigger.click();
  await page.getByLabel("Name").fill("Should not be saved");

  await page.getByRole("button", { name: "Close" }).click();

  await expect(page.locator("#add-medication-dialog")).not.toBeVisible();
  await expect(page.getByText("No medications logged yet.")).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("closing via Escape discards unsaved input and returns focus to the trigger", async ({
  page,
}) => {
  const trigger = page.getByRole("button", { name: "+ Add medication" });
  await trigger.click();
  await page.getByLabel("Name").fill("Should not be saved");

  await page.keyboard.press("Escape");

  await expect(page.locator("#add-medication-dialog")).not.toBeVisible();
  await expect(page.getByText("No medications logged yet.")).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("closing via a backdrop click discards unsaved input and returns focus to the trigger", async ({
  page,
}) => {
  const trigger = page.getByRole("button", { name: "+ Add medication" });
  await trigger.click();
  await page.getByLabel("Name").fill("Should not be saved");

  const dialog = page.locator("#add-medication-dialog");
  // Click near the top-left corner of the dialog element, outside its content.
  const box = await dialog.boundingBox();
  await page.mouse.click(box.x + 2, box.y + 2);

  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("No medications logged yet.")).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("focus stays trapped inside the modal while open", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add medication" }).click();

  // Tab past every focusable element inside the dialog; focus should stay inside it.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
  }

  const activeElementInDialog = await page.evaluate(() => {
    const dialog = document.getElementById("add-medication-dialog");
    return dialog.contains(document.activeElement);
  });
  expect(activeElementInDialog).toBe(true);
});

test("editing an existing medication's interval persists across reload", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add medication" }).click();
  await page.getByLabel("Name").fill("Aspirin");
  await page.getByLabel("Dose").fill("100mg");
  await page.getByLabel("Interval (hours)").fill("8");
  await page.getByRole("button", { name: "Add medication", exact: true }).click();

  const intervalInput = page.getByLabel("Interval (hours)").last();
  await intervalInput.fill("12");
  await intervalInput.blur();

  await expect(intervalInput).toHaveValue("12");

  await page.reload();

  await expect(page.getByLabel("Interval (hours)").last()).toHaveValue("12");
});

test("editing a medication's interval to an invalid value shows an error and retains the saved value", async ({
  page,
}) => {
  await page.getByRole("button", { name: "+ Add medication" }).click();
  await page.getByLabel("Name").fill("Aspirin");
  await page.getByLabel("Dose").fill("100mg");
  await page.getByLabel("Interval (hours)").fill("8");
  await page.getByRole("button", { name: "Add medication", exact: true }).click();

  const intervalInput = page.getByLabel("Interval (hours)").last();
  await intervalInput.fill("-1");
  await intervalInput.blur();

  await expect(page.getByRole("alert").last()).toHaveText(
    "Interval (hours) must be a positive number."
  );
  await expect(intervalInput).toHaveValue("8");

  await page.reload();

  await expect(page.getByLabel("Interval (hours)").last()).toHaveValue("8");
});

test("after a successful interval edit, a later invalid edit retains the newly saved value (not the original)", async ({
  page,
}) => {
  await page.getByRole("button", { name: "+ Add medication" }).click();
  await page.getByLabel("Name").fill("Aspirin");
  await page.getByLabel("Dose").fill("100mg");
  await page.getByLabel("Interval (hours)").fill("8");
  await page.getByRole("button", { name: "Add medication", exact: true }).click();

  const intervalInput = page.getByLabel("Interval (hours)").last();

  // First edit: valid change from the original value, should save.
  await intervalInput.fill("12");
  await intervalInput.blur();
  await expect(intervalInput).toHaveValue("12");

  // Second edit: invalid, should be rejected and fall back to the last
  // *saved* value (12), not the row's original pre-edit value (8).
  await intervalInput.fill("-1");
  await intervalInput.blur();

  await expect(page.getByRole("alert").last()).toHaveText(
    "Interval (hours) must be a positive number."
  );
  await expect(intervalInput).toHaveValue("12");

  await page.reload();

  await expect(page.getByLabel("Interval (hours)").last()).toHaveValue("12");
});
