import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("shows an empty state when no medications are logged (first run, no localStorage data)", async ({
  page,
}) => {
  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();
  await expect(page.locator("#medication-list")).toBeHidden();
});

test("shows the empty state, not an error or blank page, when localStorage data is corrupted", async ({
  page,
}) => {
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.evaluate(() => window.localStorage.setItem("medications", "not valid json"));
  await page.reload();

  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();
  await expect(page.locator("#medication-list")).toBeHidden();
  expect(consoleErrors).toEqual([]);
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
  await expect(page.getByText("No medications yet — add one to get started.")).toBeHidden();
});

test("shows a validation error and keeps the modal open when fields are empty", async ({
  page,
}) => {
  await page.getByRole("button", { name: "+ Add medication" }).click();
  await page.getByRole("button", { name: "Add medication", exact: true }).click();

  const dialog = page.locator("#add-medication-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("alert")).not.toBeEmpty();
  await expect(page.getByText("No medications yet — add one to get started.")).toBeVisible();
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
  await expect(page.getByText("No medications yet — add one to get started.")).toBeVisible();
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
  await expect(page.getByText("No medications yet — add one to get started.")).toBeVisible();
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
  await expect(page.getByText("No medications yet — add one to get started.")).toBeVisible();
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
  await expect(page.getByText("No medications yet — add one to get started.")).toBeVisible();
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
  await expect(page.getByText("No medications yet — add one to get started.")).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("focuses the Name field, not the close button, when the modal opens", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add medication" }).click();

  await expect(page.getByLabel("Name")).toBeFocused();
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

async function addMedicationViaUi(page, { name, dose, interval }) {
  await page.getByRole("button", { name: "+ Add medication" }).click();

  // Scoped to the dialog: once a medication row already exists in the list,
  // its own "Interval (hours)" field would otherwise also match
  // getByLabel("Interval (hours)") and trip Playwright's strict-mode check.
  const dialog = page.getByRole("dialog", { name: "Add medication" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Dose").fill(dose);
  await dialog.getByLabel("Interval (hours)").fill(interval);
  await page.getByRole("button", { name: "Add medication", exact: true }).click();
}

test("pressing GO records the current timestamp, persists it, and disables that medication's GO button", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const goButton = page.getByRole("button", { name: "GO — log Aspirin taken" });
  await expect(goButton).toBeEnabled();

  const before = Date.now();
  await goButton.click();
  const after = Date.now();

  await expect(goButton).toBeDisabled();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored).toHaveLength(1);
  const loggedTime = new Date(stored[0].lastTakenAt).getTime();
  expect(loggedTime).toBeGreaterThanOrEqual(before);
  expect(loggedTime).toBeLessThanOrEqual(after);

  // Disabled state survives a reload too, since it's driven by the
  // persisted lastTakenAt, not just in-memory UI state.
  await page.reload();
  await expect(page.getByRole("button", { name: "GO — log Aspirin taken" })).toBeDisabled();
});

test("pressing GO on one medication does not affect another medication's GO button or timestamp", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });

  const aspirinGo = page.getByRole("button", { name: "GO — log Aspirin taken" });
  const ibuprofenGo = page.getByRole("button", { name: "GO — log Ibuprofen taken" });

  await aspirinGo.click();

  await expect(aspirinGo).toBeDisabled();
  await expect(ibuprofenGo).toBeEnabled();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  const aspirin = stored.find((medication) => medication.name === "Aspirin");
  const ibuprofen = stored.find((medication) => medication.name === "Ibuprofen");
  expect(aspirin.lastTakenAt).not.toBeNull();
  expect(ibuprofen.lastTakenAt).toBeNull();
});

test("shows an inline error and leaves the GO button enabled when the localStorage write fails", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  // Simulate a storage failure (e.g. quota exceeded) for writes made after
  // this point, without touching the add-medication flow that already
  // succeeded above.
  await page.evaluate(() => {
    window.localStorage.setItem = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
  });

  const goButton = page.getByRole("button", { name: "GO — log Aspirin taken" });
  await goButton.click();

  await expect(page.getByRole("alert").last()).toHaveText(
    "Could not log dose — please try again."
  );
  // The displayed state must not imply the dose was logged: button stays
  // enabled, and (per the earlier successful add) storage is unaffected.
  await expect(goButton).toBeEnabled();
});
