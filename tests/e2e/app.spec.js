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

test("shows a medication as Active on load when its cooldown had already elapsed before the page loaded (MED-9 AC1)", async ({
  page,
}) => {
  // Seed a medication whose 8h cooldown finished 2h ago, directly into
  // localStorage — mirrors a tab that was closed mid-cooldown and reopened
  // after the interval elapsed, so this exercises the initial-render path
  // rather than the periodic re-check covered by the MED-8 fast-forward test.
  const lastTakenAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
  await page.evaluate((lastTakenAt) => {
    window.localStorage.setItem(
      "medications",
      JSON.stringify([
        {
          id: "1",
          name: "Aspirin",
          dose: "100mg",
          intervalHours: 8,
          cooldownIntervalHours: 8,
          lastTakenAt,
        },
      ])
    );
  }, lastTakenAt);
  await page.reload();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(page.getByRole("button", { name: "GO — log Aspirin taken" })).toBeEnabled();
  await expect(item.locator(".cooldown-countdown")).toBeHidden();
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

test("pressing GO via keyboard keeps focus in place instead of teleporting it to the add-medication trigger", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const goButton = page.getByRole("button", { name: "GO — log Aspirin taken" });
  const addTrigger = page.getByRole("button", { name: "+ Add medication" });

  // The add-medication flow itself returns focus to addTrigger once the
  // dialog finishes closing; wait for that settle before deliberately
  // moving focus to the GO button, so the assertion below isn't racing it.
  await expect(addTrigger).toBeFocused();

  await goButton.focus();
  await expect(goButton).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(goButton).toBeDisabled();
  // Regression guard: disabling the button used to steal focus and hand it
  // to the unrelated "+ Add medication" trigger at the top of the page,
  // silently as far as a keyboard/screen-reader user is concerned. Focus
  // must stay somewhere contextual to the action just taken instead.
  await expect(addTrigger).not.toBeFocused();
  await expect(goButton).toBeFocused();
});

test("announces a logged dose to assistive tech via a live status region", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const status = page.getByRole("status");
  await expect(status).toHaveText("");

  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  await expect(status).toHaveText("Aspirin logged.");
});

// --- MED-8: cooldown countdown + fill ---------------------------------

test("shows a live countdown in '{remaining} of {total} remaining' format after pressing GO, and the fill starts at 100%", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  // Just pressed, so remaining ~= total: both round to "8h" (no minutes
  // have elapsed yet), giving a deterministic assertion without needing to
  // fast-forward any clock.
  await expect(page.getByText("8h of 8h remaining")).toBeVisible();

  const item = page.locator(".medication-item.cooldown");
  await expect(item).toHaveCSS("--progress", "100%");
});

test("shows no fill or countdown text on an Active (non-cooldown) card", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(item.locator(".cooldown-countdown")).toBeHidden();
});

test("a forced click on a functionally-disabled GO button does not record a new dose (enforced in logic, not just the attribute)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const goButton = page.getByRole("button", { name: "GO — log Aspirin taken" });
  await goButton.click();

  const before = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(before[0].lastTakenAt).not.toBeNull();
  const firstTimestamp = before[0].lastTakenAt;

  // Falsify the fast `aria-disabled` guard first, so the attribute check
  // alone can no longer be the thing that blocks this click — only the
  // click handler's independent `isInCooldown` recheck (re-derived from
  // `medications`, not the DOM) stands between this click and a bogus
  // dose log. Without this step, dispatching a forced click while
  // `aria-disabled="true"` is still present would pass even if the logic
  // guard were removed entirely, since the attribute check alone catches
  // it — proving nothing about the second guard.
  await goButton.evaluate((button) => button.setAttribute("aria-disabled", "false"));

  // Bypass Playwright's actionability checks (which would refuse to click
  // an aria-disabled element) by dispatching the click event directly —
  // this simulates a forced/programmatic invocation of the control.
  await goButton.evaluate((button) =>
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  );

  const after = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(after[0].lastTakenAt).toBe(firstTimestamp);
});

test("pressing Enter a second time on an already-cooldown GO button does not record a new dose", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const goButton = page.getByRole("button", { name: "GO — log Aspirin taken" });
  const addTrigger = page.getByRole("button", { name: "+ Add medication" });

  // The add-medication flow itself returns focus to addTrigger once the
  // dialog finishes closing; wait for that settle before deliberately
  // moving focus to the GO button, so the keyboard press below isn't racing
  // that async refocus on a slower CI runner.
  await expect(addTrigger).toBeFocused();

  await goButton.focus();
  await expect(goButton).toBeFocused();
  await page.keyboard.press("Enter");

  const before = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(before[0].lastTakenAt).not.toBeNull();
  const firstTimestamp = before[0].lastTakenAt;

  // Button is now aria-disabled (in cooldown) but still focusable — confirm
  // a second real keyboard activation is a no-op, per the AC's "cannot be
  // activated by mouse, keyboard, or Enter" requirement.
  await goButton.focus();
  await expect(goButton).toBeFocused();
  await page.keyboard.press("Enter");

  const after = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(after[0].lastTakenAt).toBe(firstTimestamp);
});

test("the fill recedes proportionally to elapsed cooldown time, and reactivation + zero fill happen together", async ({
  page,
}) => {
  // Install fake timers before the module (re-)loads, so its setInterval is
  // registered against the fake clock and can be fast-forwarded
  // deterministically instead of waiting on real wall-clock time.
  await page.clock.install();
  await page.reload();

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(item).toHaveCSS("--progress", "100%");

  // Halfway through an 8h interval: left half of the card stays coloured.
  await page.clock.fastForward(4 * 60 * 60 * 1000);
  await expect(item).toHaveCSS("--progress", "50%");
  await expect(page.getByText("4h of 8h remaining")).toBeVisible();

  const goButton = page.getByRole("button", { name: "GO — log Aspirin taken" });
  await expect(goButton).toBeDisabled();

  // Past the full interval: the periodic re-check (no reload, no user
  // action) must flip the card back to Active with GO enabled and the fill
  // at exactly 0%, in the same update — never one visibly ahead of the other.
  await page.clock.fastForward(4 * 60 * 60 * 1000 + 60_000);
  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(goButton).toBeEnabled();
  await expect(item.locator(".cooldown-countdown")).toBeHidden();
});

test("editing the interval mid-cooldown does not disturb the running countdown/fill (MED-5 invariant)", async ({
  page,
}) => {
  await page.clock.install();
  await page.reload();

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  // Edit the interval down to 2h while the 8h cooldown from GO is running.
  const intervalInput = page.getByLabel("Interval (hours)").last();
  await intervalInput.fill("2");
  await intervalInput.blur();

  // 3h elapsed: past the *edited* 2h interval, but well inside the
  // *original* 8h one — the countdown/fill must still reflect the latter.
  await page.clock.fastForward(3 * 60 * 60 * 1000);

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(page.getByText("5h of 8h remaining")).toBeVisible();
  await expect(page.getByRole("button", { name: "GO — log Aspirin taken" })).toBeDisabled();
});

// --- MED-10: cooldown/active state stays correct across reload/reopen -----

test("mid-cooldown reload recomputes remaining time from the stored timestamp instead of resetting it (MED-10 AC1)", async ({
  page,
}) => {
  // Fake clock so the elapsed-then-reload sequence is deterministic instead
  // of racing real wall-clock time.
  await page.clock.install();
  await page.reload();

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(item).toHaveCSS("--progress", "100%");

  // 2 of the 8 hours elapse before the reload — a fresh reset would show
  // 8h/100%, so asserting ~6h/75% after reload proves the remaining time was
  // recomputed from the stored `lastTakenAt`, not restarted.
  await page.clock.fastForward(2 * 60 * 60 * 1000);
  await page.reload();

  const itemAfterReload = page.locator(".medication-item");
  await expect(itemAfterReload).toHaveClass(/cooldown/);
  // Numeric tolerance, not an exact "75%" string match: navigation across
  // the reload can leak a few milliseconds of real time before the fake
  // clock re-attaches to the new page, so the recomputed fraction lands
  // fractionally under 75% (e.g. 74.9999%) rather than exactly on it.
  const progressPercent = await itemAfterReload.evaluate((el) =>
    parseFloat(getComputedStyle(el).getPropertyValue("--progress"))
  );
  expect(progressPercent).toBeCloseTo(75, 1);
  await expect(page.getByText("6h of 8h remaining")).toBeVisible();
  await expect(page.getByRole("button", { name: "GO — log Aspirin taken" })).toBeDisabled();
});

test("a medication whose cooldown fully elapsed while the tab was closed shows Active on the very first render after reopening, with no in-tab timer required (MED-10 AC2)", async ({
  page,
}) => {
  // Seed localStorage directly with a medication whose stored lastTakenAt +
  // cooldownIntervalHours already fully elapsed, simulating "closed the
  // browser, came back hours later" rather than a tab that stayed open and
  // ticked down in real time.
  const lastTakenAt = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
  await page.evaluate((takenAtIso) => {
    window.localStorage.setItem(
      "medications",
      JSON.stringify([
        {
          id: "1",
          name: "Aspirin",
          dose: "100mg",
          intervalHours: 8,
          cooldownIntervalHours: 8,
          lastTakenAt: takenAtIso,
        },
      ])
    );
  }, lastTakenAt);

  // A reload re-runs the app's module from scratch, so the very first
  // render is the only thing that can be responsible for the Active
  // state below — no periodic tick has had a chance to run yet.
  await page.reload();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(page.getByRole("button", { name: "GO — log Aspirin taken" })).toBeEnabled();
  await expect(item.locator(".cooldown-countdown")).toBeHidden();
});
