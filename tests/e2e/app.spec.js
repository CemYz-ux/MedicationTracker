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

  await page.locator("#add-medication-fab").click();

  await expect(dialog).toBeVisible();
  // Scoped to the dialog: MED-17's Edit dialog also has "Name"/"Dose"
  // labels, so an unscoped getByLabel would otherwise match both (the
  // Edit one just isn't visible yet) and trip Playwright's strict-mode check.
  await expect(dialog.getByLabel("Name")).toBeVisible();
  await expect(dialog.getByLabel("Dose")).toBeVisible();
  await expect(dialog.getByLabel("Interval (hours)")).toBeVisible();
});

test("adds a valid medication and shows it in the list", async ({ page }) => {
  await page.locator("#add-medication-fab").click();
  const dialog = page.locator("#add-medication-dialog");
  await dialog.getByLabel("Name").fill("Aspirin");
  await dialog.getByLabel("Dose").fill("100mg");
  await dialog.getByLabel("Interval (hours)").fill("8");
  // Scoped to the dialog: the background Add-medication FAB (MED-23) shares
  // this exact accessible name ("Add medication"), which would otherwise
  // trip Playwright's strict-mode check against an unscoped page-wide query.
  await dialog.getByRole("button", { name: "Add medication", exact: true }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Aspirin — 100mg")).toBeVisible();
  await expect(page.getByText("No medications yet — add one to get started.")).toBeHidden();
});

test("the Add dialog's fields are reset (not just hidden) after a successful submit, so a later add doesn't leak stale values (MED-15)", async ({
  page,
}) => {
  await page.locator("#add-medication-fab").click();
  const dialog = page.locator("#add-medication-dialog");
  await dialog.getByLabel("Name").fill("Aspirin");
  await dialog.getByLabel("Dose").fill("100mg");
  await dialog.getByLabel("Interval (hours)").fill("8");
  await dialog.getByRole("button", { name: "Add medication", exact: true }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Aspirin — 100mg")).toBeVisible();

  await page.locator("#add-medication-fab").click();

  // Reopen and check the fields directly, without filling them first —
  // filling would mask the exact regression (MED-15) this test guards
  // against: stale values from the prior submit leaking into the reopened
  // form because it was hidden via dialog.close() without form.reset().
  await expect(dialog.getByLabel("Name")).toHaveValue("");
  await expect(dialog.getByLabel("Dose")).toHaveValue("");
  await expect(dialog.getByLabel("Interval (hours)")).toHaveValue("");
});

test("shows a validation error and keeps the modal open when fields are empty", async ({
  page,
}) => {
  await page.locator("#add-medication-fab").click();
  const dialog = page.locator("#add-medication-dialog");
  await dialog.getByRole("button", { name: "Add medication", exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).not.toBeEmpty();
  await expect(page.getByText("No medications yet — add one to get started.")).toBeVisible();
});

test("shows a validation error for a non-numeric or non-positive interval", async ({ page }) => {
  await page.locator("#add-medication-fab").click();
  const dialog = page.locator("#add-medication-dialog");
  await dialog.getByLabel("Name").fill("Aspirin");
  await dialog.getByLabel("Dose").fill("100mg");
  await dialog.getByLabel("Interval (hours)").fill("0");
  await dialog.getByRole("button", { name: "Add medication", exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Interval (hours) must be a positive number."
  );
  await expect(page.getByText("No medications yet — add one to get started.")).toBeVisible();
});

test("persists an added medication across a reload", async ({ page }) => {
  await page.locator("#add-medication-fab").click();
  const dialog = page.locator("#add-medication-dialog");
  await dialog.getByLabel("Name").fill("Ibuprofen");
  await dialog.getByLabel("Dose").fill("200mg");
  await dialog.getByLabel("Interval (hours)").fill("6");
  await dialog.getByRole("button", { name: "Add medication", exact: true }).click();

  await page.reload();

  await expect(page.getByText("Ibuprofen — 200mg")).toBeVisible();
});

test("closing via Cancel discards unsaved input and returns focus to the trigger", async ({
  page,
}) => {
  const trigger = page.locator("#add-medication-fab");
  await trigger.click();
  await page.locator("#add-medication-dialog").getByLabel("Name").fill("Should not be saved");

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.locator("#add-medication-dialog")).not.toBeVisible();
  await expect(page.getByText("No medications yet — add one to get started.")).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("closing via the close control discards unsaved input and returns focus to the trigger", async ({
  page,
}) => {
  const trigger = page.locator("#add-medication-fab");
  await trigger.click();
  await page.locator("#add-medication-dialog").getByLabel("Name").fill("Should not be saved");

  await page.getByRole("button", { name: "Close" }).click();

  await expect(page.locator("#add-medication-dialog")).not.toBeVisible();
  await expect(page.getByText("No medications yet — add one to get started.")).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("closing via Escape discards unsaved input and returns focus to the trigger", async ({
  page,
}) => {
  const trigger = page.locator("#add-medication-fab");
  await trigger.click();
  await page.locator("#add-medication-dialog").getByLabel("Name").fill("Should not be saved");

  await page.keyboard.press("Escape");

  await expect(page.locator("#add-medication-dialog")).not.toBeVisible();
  await expect(page.getByText("No medications yet — add one to get started.")).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("closing via a backdrop click discards unsaved input and returns focus to the trigger", async ({
  page,
}) => {
  const trigger = page.locator("#add-medication-fab");
  await trigger.click();
  const dialog = page.locator("#add-medication-dialog");
  await dialog.getByLabel("Name").fill("Should not be saved");

  // Click near the top-left corner of the dialog element, outside its content.
  const box = await dialog.boundingBox();
  await page.mouse.click(box.x + 2, box.y + 2);

  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("No medications yet — add one to get started.")).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("focuses the Name field, not the close button, when the modal opens", async ({ page }) => {
  await page.locator("#add-medication-fab").click();

  await expect(page.locator("#add-medication-dialog").getByLabel("Name")).toBeFocused();
});

test("focus stays trapped inside the modal while open", async ({ page }) => {
  await page.locator("#add-medication-fab").click();

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
  await page.locator("#add-medication-fab").click();
  const addDialog = page.locator("#add-medication-dialog");
  await addDialog.getByLabel("Name").fill("Aspirin");
  await addDialog.getByLabel("Dose").fill("100mg");
  await addDialog.getByLabel("Interval (hours)").fill("8");
  await addDialog.getByRole("button", { name: "Add medication", exact: true }).click();

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
  await page.locator("#add-medication-fab").click();
  const addDialog = page.locator("#add-medication-dialog");
  await addDialog.getByLabel("Name").fill("Aspirin");
  await addDialog.getByLabel("Dose").fill("100mg");
  await addDialog.getByLabel("Interval (hours)").fill("8");
  await addDialog.getByRole("button", { name: "Add medication", exact: true }).click();

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
  await page.locator("#add-medication-fab").click();
  const addDialog = page.locator("#add-medication-dialog");
  await addDialog.getByLabel("Name").fill("Aspirin");
  await addDialog.getByLabel("Dose").fill("100mg");
  await addDialog.getByLabel("Interval (hours)").fill("8");
  await addDialog.getByRole("button", { name: "Add medication", exact: true }).click();

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
  const trigger = page.locator("#add-medication-fab");
  await trigger.click();

  // Scoped to the dialog: once a medication row already exists in the list,
  // its own "Interval (hours)" field would otherwise also match
  // getByLabel("Interval (hours)") and trip Playwright's strict-mode check.
  const dialog = page.getByRole("dialog", { name: "Add medication" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Dose").fill(dose);
  await dialog.getByLabel("Interval (hours)").fill(interval);

  // Register a listener for the dialog's native `close` event *before*
  // triggering it below, so there's no window in which the event could fire
  // (and be missed) before we start waiting on it. Stashed on `window`
  // rather than awaited directly, since we can't await a promise that only
  // resolves once we've gone on to cause the event in the first place.
  await page.evaluate(() => {
    window.__addDialogClosed = new Promise((resolve) => {
      document
        .getElementById("add-medication-dialog")
        .addEventListener("close", resolve, { once: true });
    });
  });

  await dialog.getByRole("button", { name: "Add medication", exact: true }).click();

  // Closing a modal <dialog> actually moves focus back to the trigger via
  // *two* separate mechanisms, not one: (1) the browser's own native
  // "restore focus to whatever had focus before the dialog opened" step,
  // which runs synchronously inside dialog.close() itself, and (2) this
  // app's own "close" event listener (js/app.js), which explicitly calls
  // trigger.focus() again — but that listener only runs on the *later*
  // queued task the HTML spec dispatches "close" on, not synchronously.
  //
  // Waiting for the trigger to merely *appear* focused (e.g. polling
  // toBeFocused()) is satisfied by the first, native restoration and
  // returns too early: the second, explicit trigger.focus() call is still
  // queued at that point and can steal focus back later, right as a caller
  // is moving focus elsewhere for its own assertions. Confirmed by
  // instrumenting js/app.js's focus calls under --workers=2 load: the
  // trigger observably regains focus ~10ms *before* the "close" event even
  // fires.
  //
  // Waiting for the actual "close" event to finish firing is the real fix:
  // JS is single-threaded, so once our listener above (registered before
  // the app's own, so it always runs after it — same-element listeners
  // fire in registration order) has resolved, the app's own close handler
  // and its trigger.focus() call — its last statement — are guaranteed to
  // have already completed. Nothing more is left queued to steal focus.
  await page.evaluate(() => window.__addDialogClosed);
}

test("pressing GO records the current timestamp, persists it, and disables that medication's GO button", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const goButton = page.getByRole("button", { name: "GO — log Aspirin taken" });
  await expect(goButton).toBeEnabled();

  // Bracket with the browser's own clock, not Node's: comparing a Node-side
  // Date.now() against a timestamp recorded inside the page mixes two
  // different clocks across a process boundary, and the CDP round-trip
  // latency around the click can exceed the real gap between them —
  // exactly the kind of tight cross-process timing assumption that gets
  // less reliable, not more, under heavier concurrent load (e.g.
  // --workers=2). Reading both bounds from the page keeps the whole
  // comparison on one clock.
  const before = await page.evaluate(() => Date.now());
  await goButton.click();
  const after = await page.evaluate(() => Date.now());

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
  // addMedicationViaUi already waits for the dialog-close refocus to settle
  // before returning, so the trigger is guaranteed focused here.
  const addTrigger = page.locator("#add-medication-fab");

  await goButton.focus();
  await expect(goButton).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(goButton).toBeDisabled();
  // Regression guard: disabling the button used to steal focus and hand it
  // to the unrelated Add-medication FAB (bottom-right, MED-23), silently as
  // far as a keyboard/screen-reader user is concerned. Focus must stay
  // somewhere contextual to the action just taken instead.
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
  // Fake clock (MED-29): with the periodic re-check now ticking every ~1s
  // (down from 30s), real wall-clock time could otherwise tick the seconds
  // component between the click and the assertion below, on a slow CI run.
  // Installing the fake clock keeps `now` pinned so "8h of 8h remaining" is
  // deterministic regardless of how long the assertion takes to settle.
  await page.clock.install();
  await page.reload();

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  // Just pressed, so remaining ~= total: both round to "8h" (no minutes or
  // seconds have elapsed yet), giving a deterministic assertion without
  // needing to fast-forward the clock.
  await expect(page.getByText("8h of 8h remaining")).toBeVisible();

  const item = page.locator(".medication-item.cooldown");
  await expect(item).toHaveCSS("--progress", "100%");
});

test("pressing GO does not change the card's height, even though it reveals countdown text (MED-18)", async ({
  page,
}) => {
  // Fake clock (MED-29): same reasoning as the test above — pins `now` so
  // the ~1s periodic re-check can't tick the seconds component mid-test.
  await page.clock.install();
  await page.reload();

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const item = page.locator(".medication-item");
  const heightBeforeGo = (await item.boundingBox()).height;

  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();
  await expect(page.getByText("8h of 8h remaining")).toBeVisible();

  const heightAfterGo = (await item.boundingBox()).height;
  expect(heightAfterGo).toBe(heightBeforeGo);
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
  // addMedicationViaUi already waits for the dialog-close refocus to settle
  // before returning, so no extra wait is needed before moving focus here.

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
  // Install and immediately pin the fake clock before the module (re-)loads,
  // so its setInterval is registered against the fake clock and time can be
  // moved forward deterministically instead of racing real wall-clock time
  // (see `installFrozenClock`/`advanceAndFreeze`, defined below, for why a
  // bare `install()`/`fastForward()` isn't enough now that the periodic
  // re-check runs every ~1s instead of 30s — MED-29).
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(item).toHaveCSS("--progress", "100%");

  // Halfway through an 8h interval: left half of the card stays coloured.
  await advanceAndFreeze(page, 4 * 60 * 60 * 1000);
  await expect(item).toHaveCSS("--progress", "50%");
  await expect(page.getByText("4h of 8h remaining")).toBeVisible();

  const goButton = page.getByRole("button", { name: "GO — log Aspirin taken" });
  await expect(goButton).toBeDisabled();

  // Past the full interval: the periodic re-check (no reload, no user
  // action) must flip the card back to Active with GO enabled and the fill
  // at exactly 0%, in the same update — never one visibly ahead of the other.
  await advanceAndFreeze(page, 4 * 60 * 60 * 1000 + 60_000);
  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(goButton).toBeEnabled();
  await expect(item.locator(".cooldown-countdown")).toBeHidden();
});

// --- MED-29: live seconds in the countdown ------------------------------

// `page.clock.install()` leaves the fake clock *running* — following real
// wall-clock time 1:1 — until something explicitly pauses it (per
// Playwright's Clock docs), and `fastForward` jumps forward but then leaves
// it running again afterward too. At the old 30s tick that was harmless:
// ordinary Playwright overhead (form-filling, `expect` polling, `evaluate`
// round-trips) between installing the clock and a later assertion is at
// most a few hundred real ms, nowhere near enough to cross a 30s tick
// boundary. MED-29 dropped the tick to ~1s, which *is* within that overhead
// window — real time leaking into the fake clock lets an extra
// `runCooldownTick` fire before an assertion settles, showing up as a
// `--progress` percentage that's slightly (and, across retries,
// increasingly) off its expected value. `installFrozenClock` pins the clock
// immediately after install/reload, before any interaction — and
// `advanceAndFreeze` moves it forward from there using `pauseAt` (which
// jumps to an absolute instant and then freezes, unlike `fastForward`) — so
// no real-time drift can leak in anywhere in the test.
async function installFrozenClock(page) {
  await page.clock.install();
  await page.reload();
  // `pauseAt` rejects a target that's already in the past *at the moment the
  // call actually executes in the browser* — and there's an unavoidable
  // round-trip between reading `now` here and that call taking effect,
  // during which the (still-running, per Playwright's Clock docs) fake
  // clock keeps advancing in real time. A generous forward buffer absorbs
  // that round-trip latency; its exact size is inconsequential here since
  // nothing test-relevant (adding a medication, pressing GO) has happened
  // yet — this only establishes the frozen baseline everything else in the
  // test is measured from.
  const now = await page.evaluate(() => Date.now());
  const frozenAt = now + 2000;
  await page.clock.pauseAt(frozenAt);
  return frozenAt;
}

async function advanceAndFreeze(page, ms) {
  const current = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(current + ms);
}

test("the countdown's seconds component ticks live once per second, without waiting for a reload", async ({
  page,
}) => {
  // The whole point of MED-29 is that `COOLDOWN_TICK_MS` dropped from 30s to
  // ~1s so the seconds digit genuinely counts down — this test proves that
  // cadence, not just the format string.
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "1" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();
  await expect(page.getByText("1h of 1h remaining")).toBeVisible();

  await advanceAndFreeze(page, 1000);
  await expect(page.getByText("59m 59s of 1h remaining")).toBeVisible();

  await advanceAndFreeze(page, 1000);
  await expect(page.getByText("59m 58s of 1h remaining")).toBeVisible();

  await advanceAndFreeze(page, 1000);
  await expect(page.getByText("59m 57s of 1h remaining")).toBeVisible();
});

test("the countdown's fill (--progress) also updates every second, not just every 30s (MED-29)", async ({
  page,
}) => {
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "1" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  const item = page.locator(".medication-item");
  await expect(item).toHaveCSS("--progress", "100%");

  // A 1s tick on a 1h (3600s) interval moves the fill by 1/3600 ≈ 0.0278%.
  // Advancing 36s (36/3600 = 1%) keeps the arithmetic exact rather than
  // relying on floating-point rounding at the 1s granularity.
  await advanceAndFreeze(page, 36 * 1000);
  await expect(item).toHaveCSS("--progress", "99%");
});

test("a mid-cooldown reload does not carry the fake-tick cadence past a real reactivation boundary (MED-9/MED-29 regression)", async ({
  page,
}) => {
  // Confirms the tick-rate change (30s -> ~1s) doesn't disturb MED-9's
  // auto-reactivation: reactivation must still happen automatically via the
  // periodic tick once the interval elapses, regardless of how often that
  // tick now runs.
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "1" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  const item = page.locator(".medication-item");
  const goButton = page.getByRole("button", { name: "GO — log Aspirin taken" });
  await expect(item).toHaveClass(/cooldown/);
  await expect(goButton).toBeDisabled();

  await advanceAndFreeze(page, 1 * 60 * 60 * 1000 + 1000);

  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(goButton).toBeEnabled();
  await expect(item.locator(".cooldown-countdown")).toBeHidden();
});

test("editing the interval mid-cooldown does not disturb the running countdown/fill (MED-5 invariant)", async ({
  page,
}) => {
  // Frozen fake clock (MED-29 regression — see `installFrozenClock`/
  // `advanceAndFreeze`, defined above near the MED-29 tests): this test's
  // exact-string "5h of 8h remaining" assertion needs the clock pinned at a
  // known instant, not just fast-forwarded, now that the periodic re-check
  // runs every ~1s instead of 30s.
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  // Edit the interval down to 2h while the 8h cooldown from GO is running.
  const intervalInput = page.getByLabel("Interval (hours)").last();
  await intervalInput.fill("2");
  await intervalInput.blur();

  // 3h elapsed: past the *edited* 2h interval, but well inside the
  // *original* 8h one — the countdown/fill must still reflect the latter.
  await advanceAndFreeze(page, 3 * 60 * 60 * 1000);

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(page.getByText("5h of 8h remaining")).toBeVisible();
  await expect(page.getByRole("button", { name: "GO — log Aspirin taken" })).toBeDisabled();
});

// --- MED-10: cooldown/active state stays correct across reload/reopen -----

test("mid-cooldown reload recomputes remaining time from the stored timestamp instead of resetting it (MED-10 AC1)", async ({
  page,
}) => {
  // Frozen fake clock (MED-29 regression — see `installFrozenClock`/
  // `advanceAndFreeze` above) so the elapsed-then-reload sequence is
  // deterministic instead of racing real wall-clock time.
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(item).toHaveCSS("--progress", "100%");

  // 2 of the 8 hours elapse before the reload — a fresh reset would show
  // 8h/100%, so asserting ~6h/75% after reload proves the remaining time was
  // recomputed from the stored `lastTakenAt`, not restarted. Pausing at an
  // exact target instant (`advanceAndFreeze`) rather than a bare
  // `fastForward` keeps the clock pinned there *through* the reload itself,
  // instead of continuing to run in real time during navigation.
  await advanceAndFreeze(page, 2 * 60 * 60 * 1000);
  await page.reload();

  const itemAfterReload = page.locator(".medication-item");
  await expect(itemAfterReload).toHaveClass(/cooldown/);
  // Numeric tolerance, not an exact "75%" string match: navigation across
  // the reload can still leak a little real time before the fake clock
  // re-attaches to the new page (freezing beforehand only removes the
  // *pre*-reload drift source), so the recomputed fraction can land
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

// --- MED-11: stop cooldown early -------------------------------------------

test("shows no Stop control on an Active medication (MED-11 AC1)", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await expect(page.locator(".medication-item")).toHaveClass(/active/);
  await expect(
    page.getByRole("button", { name: "Stop — cancel Aspirin cooldown" })
  ).toBeHidden();
});

test("pressing Stop cancels the cooldown immediately, without waiting for the remaining time to elapse (MED-11 AC2)", async ({
  page,
}) => {
  await page.clock.install();
  await page.reload();

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);

  // Only a sliver of the 8h interval has passed — a large amount of
  // cooldown time is deliberately still remaining when Stop is pressed, so
  // an immediate cancellation (not a coincidental natural elapse) is what's
  // being proven here.
  await page.clock.fastForward(5 * 60 * 1000);
  await expect(page.getByText(/of 8h remaining/)).toBeVisible();

  await page.getByRole("button", { name: "Stop — cancel Aspirin cooldown" }).click();

  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(page.getByRole("button", { name: "GO — log Aspirin taken" })).toBeEnabled();
  await expect(item.locator(".cooldown-countdown")).toBeHidden();
});

test("Stop's resulting state is indistinguishable from one that reached Active by natural elapse (MED-11 AC3)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);

  await page.getByRole("button", { name: "Stop — cancel Aspirin cooldown" }).click();

  // Same assertions the natural-elapse cases (MED-9/MED-10) make on an
  // Active row — there is no separate "stopped" visual state.
  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(page.getByRole("button", { name: "GO — log Aspirin taken" })).toBeEnabled();
  await expect(item.locator(".cooldown-countdown")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Stop — cancel Aspirin cooldown" })
  ).toBeHidden();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored[0].lastTakenAt).toBeNull();
});

test("Stop, then editing the Interval, then pressing GO starts a fresh cooldown using the new interval (MED-11 AC4)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();
  await page.getByRole("button", { name: "Stop — cancel Aspirin cooldown" }).click();

  const intervalInput = page.getByLabel("Interval (hours)").last();
  await intervalInput.fill("3");
  await intervalInput.blur();

  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  // A fresh 3h cooldown, not a resumption or reflection of the original 8h
  // interval that was in effect before Stop was pressed.
  await expect(page.getByText("3h of 3h remaining")).toBeVisible();
  await expect(page.locator(".medication-item")).toHaveClass(/cooldown/);
});

test("shows an inline error and leaves the cooldown running when the Stop write to localStorage fails (MED-11 AC5)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  // Simulate a storage failure for writes made after this point, without
  // touching the add-medication/GO flow that already succeeded above.
  await page.evaluate(() => {
    window.localStorage.setItem = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
  });

  const stopButton = page.getByRole("button", { name: "Stop — cancel Aspirin cooldown" });
  await stopButton.click();

  await expect(page.getByRole("alert").last()).toHaveText(
    "Could not stop cooldown — please try again."
  );
  // The displayed state must not imply the cooldown was cancelled: the row
  // stays greyed out, GO stays disabled, and Stop is still there to retry.
  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(page.getByRole("button", { name: "GO — log Aspirin taken" })).toBeDisabled();
  await expect(stopButton).toBeVisible();
});

test("pressing Stop on one medication does not affect another medication's cooldown", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });

  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();
  await page.getByRole("button", { name: "GO — log Ibuprofen taken" }).click();

  await page.getByRole("button", { name: "Stop — cancel Aspirin cooldown" }).click();

  await expect(page.getByRole("button", { name: "GO — log Aspirin taken" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "GO — log Ibuprofen taken" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Stop — cancel Ibuprofen cooldown" })
  ).toBeVisible();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  const aspirin = stored.find((medication) => medication.name === "Aspirin");
  const ibuprofen = stored.find((medication) => medication.name === "Ibuprofen");
  expect(aspirin.lastTakenAt).toBeNull();
  expect(ibuprofen.lastTakenAt).not.toBeNull();
});

test("pressing Stop moves focus to the now-enabled GO button, not somewhere unrelated", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const goButton = page.getByRole("button", { name: "GO — log Aspirin taken" });
  const stopButton = page.getByRole("button", { name: "Stop — cancel Aspirin cooldown" });
  // addMedicationViaUi already waits for the dialog-close refocus to settle
  // before returning, so the trigger is guaranteed focused here.
  const addTrigger = page.locator("#add-medication-fab");

  await goButton.click();
  await expect(stopButton).toBeVisible();

  await stopButton.focus();
  await expect(stopButton).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(goButton).toBeEnabled();
  // Regression guard mirroring the equivalent GO test: cancelling and
  // hiding the control that held focus must not silently drop focus to the
  // unrelated Add-medication FAB.
  await expect(addTrigger).not.toBeFocused();
  await expect(goButton).toBeFocused();
});

// --- MED-17: edit a medication's Name and Dosage ---------------------------

test("shows a per-card Edit control, keyboard-reachable, with an accessible name identifying the medication (MED-17 AC1-AC3)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const editButton = page.getByRole("button", { name: "Edit Aspirin" });
  await expect(editButton).toBeVisible();

  // Reachable by keyboard alone: Tab to it, then Enter/Space activates it —
  // exercised end-to-end via the "opens pre-filled" test below, which drives
  // it with a real click; this test only proves it's in the Tab order and
  // has the right accessible name/role.
  await editButton.focus();
  await expect(editButton).toBeFocused();
});

test("shows the Edit control on a Cooldown medication too, not just Active (MED-17 AC1)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  await expect(page.locator(".medication-item")).toHaveClass(/cooldown/);
  await expect(page.getByRole("button", { name: "Edit Aspirin" })).toBeVisible();
});

test("activating Edit opens a modal pre-filled with that medication's current Name and Dose, and focuses Name (MED-17 AC4)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();

  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByLabel("Name")).toHaveValue("Aspirin");
  await expect(editDialog.getByLabel("Dose")).toHaveValue("100mg");
  await expect(editDialog.getByLabel("Name")).toBeFocused();
  // The Edit modal is scoped to Name/Dose only — Interval is never shown
  // here (MED-17's explicit scope boundary; it stays on the card's own
  // inline control).
  await expect(editDialog.getByLabel("Interval (hours)")).toHaveCount(0);
});

test("prefills the correct row's values, not another medication's (MED-17 AC4)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });

  await page.getByRole("button", { name: "Edit Ibuprofen" }).click();

  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await expect(editDialog.getByLabel("Name")).toHaveValue("Ibuprofen");
  await expect(editDialog.getByLabel("Dose")).toHaveValue("200mg");
});

test("a valid Edit submit updates Name/Dose in the list, persists to localStorage, and closes the modal (MED-17 AC5)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Buffered Aspirin");
  await editDialog.getByLabel("Dose").fill("150mg");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(editDialog).not.toBeVisible();
  await expect(page.getByText("Buffered Aspirin — 150mg")).toBeVisible();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored[0]).toMatchObject({ name: "Buffered Aspirin", dose: "150mg" });
});

test("clearing Name or Dose on submit shows an inline error, keeps the modal open, and persists nothing (MED-17 AC6)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(editDialog).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Name is required.");
  await expect(page.getByText("Aspirin — 100mg")).toBeVisible();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored[0]).toMatchObject({ name: "Aspirin", dose: "100mg" });
});

test("closing via Cancel discards unsaved input and returns focus to that row's Edit control (MED-17 AC7-AC8)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const editButton = page.getByRole("button", { name: "Edit Aspirin" });
  await editButton.click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Should not be saved");

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(editDialog).not.toBeVisible();
  await expect(page.getByText("Aspirin — 100mg")).toBeVisible();
  await expect(editButton).toBeFocused();
});

test("closing via the close control discards unsaved input and returns focus to that row's Edit control (MED-17 AC7-AC8)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const editButton = page.getByRole("button", { name: "Edit Aspirin" });
  await editButton.click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Should not be saved");

  await editDialog.getByRole("button", { name: "Close" }).click();

  await expect(editDialog).not.toBeVisible();
  await expect(page.getByText("Aspirin — 100mg")).toBeVisible();
  await expect(editButton).toBeFocused();
});

test("closing via Escape discards unsaved input and returns focus to that row's Edit control (MED-17 AC7-AC8)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const editButton = page.getByRole("button", { name: "Edit Aspirin" });
  await editButton.click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Should not be saved");

  await page.keyboard.press("Escape");

  await expect(editDialog).not.toBeVisible();
  await expect(page.getByText("Aspirin — 100mg")).toBeVisible();
  await expect(editButton).toBeFocused();
});

test("closing via a backdrop click discards unsaved input and returns focus to that row's Edit control (MED-17 AC7-AC8)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const editButton = page.getByRole("button", { name: "Edit Aspirin" });
  await editButton.click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Should not be saved");

  const box = await editDialog.boundingBox();
  await page.mouse.click(box.x + 2, box.y + 2);

  await expect(editDialog).not.toBeVisible();
  await expect(page.getByText("Aspirin — 100mg")).toBeVisible();
  await expect(editButton).toBeFocused();
});

test("saving an edit also returns focus to that row's Edit control, even though the whole list re-renders (MED-17 AC8)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Buffered Aspirin");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(editDialog).not.toBeVisible();
  // The re-render replaces every row's DOM node, including the Edit button
  // itself — this proves focus landed on the *new* node for the *edited*
  // row's new name, not a stale/detached reference to the old one.
  await expect(page.getByRole("button", { name: "Edit Buffered Aspirin" })).toBeFocused();
});

test("saving an edit on the middle medication of several returns focus to that specific row's Edit button, not the first or last row's (MED-17 AC8)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });
  await addMedicationViaUi(page, { name: "Paracetamol", dose: "500mg", interval: "4" });

  await page.getByRole("button", { name: "Edit Ibuprofen" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Middle Row Renamed");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(editDialog).not.toBeVisible();
  // Renaming the middle row makes the assertion unambiguous: if
  // cooldownRefs ever mapped focus by list position instead of medication
  // id, focus would land on whichever row is now second (Paracetamol,
  // unchanged) rather than on the renamed medication itself.
  await expect(page.getByRole("button", { name: "Edit Middle Row Renamed" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Edit Aspirin" })).not.toBeFocused();
  await expect(page.getByRole("button", { name: "Edit Paracetamol" })).not.toBeFocused();
});

test("focus stays trapped inside the Edit modal while open (MED-17 AC9)", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();

  // 7, not the Add-modal test's 10: the Edit dialog has 5 focusable elements
  // (close, Name, Dose, Cancel, Save), and Chromium briefly moves
  // `document.activeElement` to <body> for exactly one Tab press whenever
  // Tab wraps past the last focusable element back to the first, before the
  // *following* Tab correctly re-enters the inert-bounded dialog. Landing
  // on a tab count that's an exact multiple of the element count (10 was,
  // for 5) samples that transient frame; the Add modal's own "10 tabs"
  // check only avoids this by coincidence (6 elements, not a divisor of
  // 10) — it's the same underlying native-dialog behavior either way, not
  // something this app's markup/JS controls.
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
  }

  const activeElementInDialog = await page.evaluate(() => {
    const dialog = document.getElementById("edit-medication-dialog");
    return dialog.contains(document.activeElement);
  });
  expect(activeElementInDialog).toBe(true);
});

test("editing Name/Dose mid-cooldown leaves lastTakenAt, the countdown, Cooldown status, and the fill completely untouched (MED-17's central invariant)", async ({
  page,
}) => {
  // `--progress` is registered via `@property` with a 0.2s CSS transition
  // (see styles.css), so a one-shot `getComputedStyle` read taken right
  // after a JS update can catch an in-flight animation frame instead of the
  // settled value — irrelevant for the existing `toHaveCSS` assertions
  // elsewhere (that's a polling matcher that waits the transition out), but
  // this test needs precise one-shot snapshots to diff against each other.
  // Reduced motion disables the transition (already wired in the CSS for
  // this exact accessibility mode), making every set instant/synchronous.
  await page.emulateMedia({ reducedMotion: "reduce" });

  // Frozen fake clock (MED-29 regression — see `installFrozenClock`/
  // `advanceAndFreeze` above): this test asserts the exact-string "5h of 8h
  // remaining" *twice* (before and after the edit), so the clock needs to
  // stay pinned at a known instant across the whole edit-dialog interaction,
  // not just fast-forwarded once and left running.
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  await advanceAndFreeze(page, 3 * 60 * 60 * 1000);

  const item = page.locator(".medication-item");
  // `advanceAndFreeze` (`pauseAt` under the hood) fires any due timers
  // synchronously as it jumps forward — same catch-up behavior `fastForward`
  // has — so `--progress` is already settled by the time this resolves.
  // Still asserting the countdown text first (rather than reading
  // `--progress` directly) before taking the one-shot snapshot below, since
  // that's the meaningful proof the seconds-precision remaining time landed
  // exactly on the expected boundary.
  await expect(page.getByText("5h of 8h remaining")).toBeVisible();

  const storedBefore = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  const progressBeforeEdit = await item.evaluate((el) =>
    parseFloat(getComputedStyle(el).getPropertyValue("--progress"))
  );

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Buffered Aspirin");
  await editDialog.getByLabel("Dose").fill("150mg");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(item).toHaveClass(/cooldown/);
  await expect(page.getByText("5h of 8h remaining")).toBeVisible();
  // Numeric comparison against the pre-edit fill, not a hardcoded "62.5%":
  // the frozen clock (`installFrozenClock`/`advanceAndFreeze`, MED-29) keeps
  // real time from leaking in while the Edit dialog is being driven, so in
  // practice this is now an exact match — but a small tolerance is kept
  // regardless, since what the AC actually forbids is the *edit* disturbing
  // the countdown/fill, which would show up as tens of percentage points of
  // jump, not sub-1% noise.
  const progressAfterEdit = await item.evaluate((el) =>
    parseFloat(getComputedStyle(el).getPropertyValue("--progress"))
  );
  expect(Math.abs(progressAfterEdit - progressBeforeEdit)).toBeLessThan(1);
  await expect(
    page.getByRole("button", { name: "GO — log Buffered Aspirin taken" })
  ).toBeDisabled();

  const storedAfter = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(storedAfter[0].lastTakenAt).toBe(storedBefore[0].lastTakenAt);
  expect(storedAfter[0].cooldownIntervalHours).toBe(storedBefore[0].cooldownIntervalHours);
  expect(storedAfter[0].name).toBe("Buffered Aspirin");
  expect(storedAfter[0].dose).toBe("150mg");
});

test("editing Name/Dose while Active leaves it Active with GO still enabled — editing does not start a cooldown (MED-17)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Buffered Aspirin");
  await page.getByRole("button", { name: "Save changes" }).click();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(
    page.getByRole("button", { name: "GO — log Buffered Aspirin taken" })
  ).toBeEnabled();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored[0].lastTakenAt).toBeNull();
});

test("an edited Name/Dose persists across a reload (MED-17)", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Buffered Aspirin");
  await editDialog.getByLabel("Dose").fill("150mg");
  await page.getByRole("button", { name: "Save changes" }).click();

  await page.reload();

  await expect(page.getByText("Buffered Aspirin — 150mg")).toBeVisible();
});

test("editing one medication's Name/Dose does not affect another medication's data or display (MED-17)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });
  await page.getByRole("button", { name: "GO — log Ibuprofen taken" }).click();

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Buffered Aspirin");
  await editDialog.getByLabel("Dose").fill("150mg");
  await page.getByRole("button", { name: "Save changes" }).click();

  // Ibuprofen's own data/state — name, dose, interval, and its still-running
  // cooldown — are all untouched by an edit made to a different medication.
  await expect(page.getByText("Ibuprofen — 200mg")).toBeVisible();
  await expect(page.getByLabel("Interval (hours)").last()).toHaveValue("6");
  await expect(
    page.getByRole("button", { name: "GO — log Ibuprofen taken" })
  ).toBeDisabled();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  const ibuprofen = stored.find((m) => m.dose === "200mg");
  expect(ibuprofen.name).toBe("Ibuprofen");
  expect(ibuprofen.intervalHours).toBe(6);
  expect(ibuprofen.lastTakenAt).not.toBeNull();
});

test("shows an inline error and does not close the modal when the localStorage write fails on Edit save", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.evaluate(() => {
    window.localStorage.setItem = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
  });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Buffered Aspirin");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(editDialog).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(
    "Could not save changes — please try again."
  );
  // Display must not imply the change was saved: the card still shows the
  // original name.
  await expect(page.getByText("Aspirin — 100mg")).toBeVisible();
});

// --- MED-22: responsive grid -------------------------------------------

// Resolves `.medication-list`'s computed `grid-template-columns` into a
// track count (e.g. "342px 342px" -> 2) rather than reading the source
// media query directly, so these tests exercise the same rendering the
// user actually sees.
async function getMedicationListColumnCount(page) {
  return page.locator("#medication-list").evaluate((el) => {
    return getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length;
  });
}

test("renders a single column below the 640px breakpoint, same as the pre-grid layout (MED-22 AC1)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 639, height: 900 });
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });

  expect(await getMedicationListColumnCount(page)).toBe(1);
});

test("renders a 2-column grid from 640px up to 999px with 2+ medications (MED-22 AC2)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });

  expect(await getMedicationListColumnCount(page)).toBe(2);

  await page.setViewportSize({ width: 999, height: 900 });
  expect(await getMedicationListColumnCount(page)).toBe(2);
});

test("renders a 3-column grid at 1000px and up with 3+ medications (MED-22 AC3)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });
  await addMedicationViaUi(page, { name: "Paracetamol", dose: "500mg", interval: "4" });

  expect(await getMedicationListColumnCount(page)).toBe(3);
});

test("a list shorter than the column count occupies leftmost cells only, without stretching to fill the row (MED-22 AC4)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const listWidth = (await page.locator("#medication-list").boundingBox()).width;
  const itemBox = await page.locator(".medication-item").boundingBox();

  // A lone card in a 3-column grid should occupy roughly one column
  // (~1/3 of the list width) and sit flush against the list's left edge —
  // not stretch across the two empty tracks beside it.
  expect(itemBox.width).toBeLessThan(listWidth * 0.5);
  expect(itemBox.x).toBeCloseTo((await page.locator("#medication-list").boundingBox()).x, 0);
});

test("the empty-state message still renders unaffected by the grid at a multi-column viewport (MED-22 AC5)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });

  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();
  await expect(page.locator("#medication-list")).toBeHidden();
});

test("the page container's max-width grows at the 640px and 1000px breakpoints to fit the grid (MED-22 AC6)", async ({
  page,
}) => {
  const maxWidthAt = async (viewportWidth) => {
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    return page.evaluate(() => parseFloat(getComputedStyle(document.body).maxWidth));
  };

  const belowFirstBreakpoint = await maxWidthAt(639);
  const atFirstBreakpoint = await maxWidthAt(640);
  const atSecondBreakpoint = await maxWidthAt(1000);

  expect(atFirstBreakpoint).toBeGreaterThan(belowFirstBreakpoint);
  expect(atSecondBreakpoint).toBeGreaterThan(atFirstBreakpoint);
});

test("keyboard tab order follows DOM order, matching left-to-right visual grid order (MED-22 AC10)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });
  await addMedicationViaUi(page, { name: "Paracetamol", dose: "500mg", interval: "4" });

  const items = page.locator(".medication-item");
  await expect(items).toHaveCount(3);

  // Confirm the 3 cards actually landed in one row, left-to-right, in DOM
  // order first — the precondition the tab-order assertion below actually
  // depends on (if the grid ever mis-ordered visually, this catches it
  // before the tab-order check below could mask it).
  const xPositions = await items.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().x)
  );
  expect(xPositions[0]).toBeLessThan(xPositions[1]);
  expect(xPositions[1]).toBeLessThan(xPositions[2]);

  // Tab forward from a known starting point and record each row's Edit
  // control (identified via its per-row aria-label) as it receives focus,
  // in the order encountered — this must match DOM/add order (Aspirin,
  // Ibuprofen, Paracetamol), regardless of how many other focusable
  // controls (interval input, GO, Stop) sit between one row's Edit button
  // and the next in the actual tab sequence.
  const addTrigger = page.locator("#add-medication-fab");
  await addTrigger.focus();
  await expect(addTrigger).toBeFocused();

  const editButtonOrder = [];
  for (let i = 0; i < 60 && editButtonOrder.length < 3; i++) {
    await page.keyboard.press("Tab");
    const editedName = await page.evaluate(() => {
      const el = document.activeElement;
      const isEditButton = el?.classList?.contains("icon-btn") && el.classList.contains("edit");
      return isEditButton ? el.getAttribute("aria-label") : null;
    });
    if (editedName) editButtonOrder.push(editedName);
  }

  expect(editButtonOrder).toEqual(["Edit Aspirin", "Edit Ibuprofen", "Edit Paracetamol"]);
});

test("a status change on one card does not jitter its row-sharing sibling's height (MED-18 guarantee holds per-row in the grid, MED-22 AC8)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 900 });
  // Aspirin's name is short and stays on a single line. Ibuprofen's name is
  // deliberately long enough to wrap to multiple lines at this viewport's
  // ~2-column card width, giving the two cards genuinely different
  // intrinsic heights. That difference is the whole point: with Grid's
  // default row-stretch behavior (i.e. without `align-items: start` on
  // .medication-list), the shorter card would be stretched to match its
  // taller row-mate, so a fixture where both cards happen to already be the
  // same height can't actually catch a regression here (it'd pass either
  // way). See css/styles.css `.medication-list` comment for the CSS fix
  // this test guards.
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, {
    name: "Amoxicillin Clavulanate Potassium Extended-Release",
    dose: "200mg",
    interval: "6",
  });

  const items = page.locator(".medication-item");
  const [aspirinItem, longNameItem] = [items.nth(0), items.nth(1)];

  // Confirm they actually share a grid row ...
  const aspirinBoxBefore = await aspirinItem.boundingBox();
  const longNameBoxBefore = await longNameItem.boundingBox();
  expect(aspirinBoxBefore.y).toBeCloseTo(longNameBoxBefore.y, 0);
  // ... and, crucially, that the fixture isn't accidentally homogeneous
  // again: the wrapping name must actually make its card taller than
  // Aspirin's up front, proving there's a real height difference for
  // row-stretch to (incorrectly) erase.
  expect(longNameBoxBefore.height).toBeGreaterThan(aspirinBoxBefore.height);

  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();
  await expect(page.getByText("8h of 8h remaining")).toBeVisible();

  const aspirinBoxAfter = await aspirinItem.boundingBox();
  const longNameBoxAfter = await longNameItem.boundingBox();

  // Aspirin itself keeps the same height on its own Active-to-Cooldown
  // transition (MED-18) ...
  expect(aspirinBoxAfter.height).toBe(aspirinBoxBefore.height);
  // ... and its row-sharing sibling — which never changed state at all —
  // must not have its height or position perturbed either, i.e. no
  // row-height jitter from a neighbor's status change.
  expect(longNameBoxAfter.height).toBe(longNameBoxBefore.height);
  expect(longNameBoxAfter.y).toBe(longNameBoxBefore.y);
  // And the two cards must still differ in height exactly as before —
  // proof that Aspirin's shorter card was never stretched up to match its
  // taller sibling by the GO click's re-render.
  expect(aspirinBoxAfter.height).toBeLessThan(longNameBoxAfter.height);
});

// --- MED-23: floating "+" add-medication button ----------------------

test("the FAB is visible in the bottom-right corner when the medication list is empty (MED-23 AC1, AC6)", async ({
  page,
}) => {
  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();

  const fab = page.locator("#add-medication-fab");
  await expect(fab).toBeVisible();
  // Bare "+" glyph, no visible text label (AC2) — the accessible name comes
  // entirely from aria-label, mirroring .close-dialog-btn's "×" pattern.
  await expect(fab).toHaveText("+");
  await expect(fab).toHaveAccessibleName("Add medication");
});

test("the FAB's touch target is at least 56x56px, larger than the app's ~44px baseline (MED-23 AC4)", async ({
  page,
}) => {
  const box = await page.locator("#add-medication-fab").boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(56);
  expect(box.height).toBeGreaterThanOrEqual(56);
});

test("the per-card Edit/Delete icon buttons and both dialogs' close controls meet the ~44px touch target baseline (MED-19)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const editBox = await page.getByRole("button", { name: "Edit Aspirin" }).boundingBox();
  expect(editBox.width).toBeGreaterThanOrEqual(44);
  expect(editBox.height).toBeGreaterThanOrEqual(44);

  const deleteBox = await page.getByRole("button", { name: "Delete Aspirin" }).boundingBox();
  expect(deleteBox.width).toBeGreaterThanOrEqual(44);
  expect(deleteBox.height).toBeGreaterThanOrEqual(44);

  await page.locator("#add-medication-fab").click();
  const addDialog = page.getByRole("dialog", { name: "Add medication" });
  const addCloseBox = await addDialog.getByRole("button", { name: "Close" }).boundingBox();
  expect(addCloseBox.width).toBeGreaterThanOrEqual(44);
  expect(addCloseBox.height).toBeGreaterThanOrEqual(44);
  await addDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  const editCloseBox = await editDialog.getByRole("button", { name: "Close" }).boundingBox();
  expect(editCloseBox.width).toBeGreaterThanOrEqual(44);
  expect(editCloseBox.height).toBeGreaterThanOrEqual(44);
  await editDialog.getByRole("button", { name: "Close" }).click();
});

test("the per-card Edit/Delete icon buttons still meet the ~44px touch target baseline on a Cooldown card, not just Active (MED-19)", async ({
  page,
}) => {
  // Guards against a future regression that accidentally scopes the 44px
  // sizing rule to `.active` only — there's no per-state CSS override today,
  // but nothing enforced that until this test existed.
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();
  await expect(page.locator(".medication-item")).toHaveClass(/cooldown/);

  const editBox = await page.getByRole("button", { name: "Edit Aspirin" }).boundingBox();
  expect(editBox.width).toBeGreaterThanOrEqual(44);
  expect(editBox.height).toBeGreaterThanOrEqual(44);

  const deleteBox = await page.getByRole("button", { name: "Delete Aspirin" }).boundingBox();
  expect(deleteBox.width).toBeGreaterThanOrEqual(44);
  expect(deleteBox.height).toBeGreaterThanOrEqual(44);
});

test("the FAB uses the app's --go color token as its fill (MED-23 AC11)", async ({ page }) => {
  const [fabColor, goTokenColor] = await page.evaluate(() => {
    const fab = document.getElementById("add-medication-fab");
    const probe = document.createElement("div");
    probe.style.background = getComputedStyle(document.documentElement).getPropertyValue("--go");
    document.body.append(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [getComputedStyle(fab).backgroundColor, resolved];
  });
  expect(fabColor).toBe(goTokenColor);
});

test("the FAB stays fixed in the bottom-right corner while the list is scrolled, and never overlaps the last row of cards (MED-23 AC5)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 600 });

  // Enough medications to make the page taller than the viewport at this
  // width (2-column grid), so scrolling is actually exercised rather than
  // trivially passing because the page never scrolls at all.
  for (let i = 0; i < 12; i++) {
    await addMedicationViaUi(page, {
      name: `Medication ${i}`,
      dose: "100mg",
      interval: "8",
    });
  }

  const fab = page.locator("#add-medication-fab");
  const boxBeforeScroll = await fab.boundingBox();

  await page.mouse.wheel(0, 10_000);
  await expect(async () => {
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
  }).toPass();

  // Fixed positioning: the FAB's viewport-relative box is unchanged by the
  // scroll even though the page content moved underneath it.
  const boxAfterScroll = await fab.boundingBox();
  expect(boxAfterScroll.x).toBeCloseTo(boxBeforeScroll.x, 0);
  expect(boxAfterScroll.y).toBeCloseTo(boxBeforeScroll.y, 0);

  // At (or near) the bottom of a fully-scrolled page, the FAB must not
  // overlap the last card's bounding box.
  const lastCardBox = await page.locator(".medication-item").last().boundingBox();
  const overlaps =
    boxAfterScroll.x < lastCardBox.x + lastCardBox.width &&
    boxAfterScroll.x + boxAfterScroll.width > lastCardBox.x &&
    boxAfterScroll.y < lastCardBox.y + lastCardBox.height &&
    boxAfterScroll.y + boxAfterScroll.height > lastCardBox.y;
  expect(overlaps).toBe(false);
});

test("the FAB never overlaps the footer at the true bottom of the page (MED-23 AC5 regression)", async ({
  page,
}) => {
  // Regression test for a bug the code review caught: the AC5 clearance
  // was originally reserved via padding-bottom on <main>, but <footer>
  // renders after </main>, so the reserved gap sat between the card list
  // and the footer instead of below it — the FAB still visually overlapped
  // the footer's disclaimer text once the page was scrolled all the way
  // down. Checking only `.medication-item.last()` (as the AC5 test above
  // does) can't catch this, since the last card was never the problem —
  // the footer below it was. This test scrolls to the true end of the
  // page and checks the FAB against the footer's bounding box instead.
  for (const width of [320, 375, 480, 700]) {
    await page.setViewportSize({ width, height: 600 });

    // Start each width from a clean, empty medication list rather than
    // compounding onto whatever the previous width left behind — reload()
    // alone wouldn't do this, since localStorage survives a reload.
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    // Enough medications that the page is taller than the viewport at
    // every one of these widths, so scrolling to the bottom is actually
    // exercised.
    for (let i = 0; i < 6; i++) {
      await addMedicationViaUi(page, {
        name: `Regression Med ${i}`,
        dose: "100mg",
        interval: "8",
      });
    }

    await page.mouse.wheel(0, 20_000);
    await expect(async () => {
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(0);
    }).toPass();

    const fabBox = await page.locator("#add-medication-fab").boundingBox();
    const footerBox = await page.locator("footer").boundingBox();
    const overlaps =
      fabBox.x < footerBox.x + footerBox.width &&
      fabBox.x + fabBox.width > footerBox.x &&
      fabBox.y < footerBox.y + footerBox.height &&
      fabBox.y + fabBox.height > footerBox.y;
    expect(overlaps).toBe(false);
  }
});

test("the FAB keeps a fixed size and a consistent margin from the viewport's bottom-right corner across viewport widths, independent of the MED-22 grid's column count (MED-23 AC10)", async ({
  page,
}) => {
  const fab = page.locator("#add-medication-fab");
  const viewportHeight = 900;
  const widths = [375, 640, 1000, 1400];
  const measurements = [];

  for (const width of widths) {
    await page.setViewportSize({ width, height: viewportHeight });
    const box = await fab.boundingBox();
    measurements.push({
      width: box.width,
      height: box.height,
      rightOffset: width - (box.x + box.width),
      bottomOffset: viewportHeight - (box.y + box.height),
    });
  }

  for (const measurement of measurements.slice(1)) {
    expect(measurement.width).toBeCloseTo(measurements[0].width, 0);
    expect(measurement.height).toBeCloseTo(measurements[0].height, 0);
    expect(measurement.rightOffset).toBeCloseTo(measurements[0].rightOffset, 0);
    expect(measurement.bottomOffset).toBeCloseTo(measurements[0].bottomOffset, 0);
  }
});

test("the FAB is keyboard-reachable and opens the unchanged add-medication dialog via Enter, returning focus to the FAB on close (MED-23 AC7-AC9)", async ({
  page,
}) => {
  const fab = page.locator("#add-medication-fab");
  await fab.focus();
  await expect(fab).toBeFocused();

  await page.keyboard.press("Enter");

  const dialog = page.locator("#add-medication-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Name")).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(dialog).not.toBeVisible();
  await expect(fab).toBeFocused();
});

// --- MED-12: delete a medication ------------------------------------------

test("shows a per-card Delete control, keyboard-reachable, with an accessible name identifying the medication (MED-12 AC1-AC2, AC9)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const deleteButton = page.getByRole("button", { name: "Delete Aspirin" });
  await expect(deleteButton).toBeVisible();

  // Reachable by keyboard alone: Tab to it, then Enter/Space activates it —
  // exercised end-to-end by the keyboard-activation tests below, which
  // drive it with real key presses; this test only proves it's in the Tab
  // order with the right accessible name/role (mirrors the equivalent
  // MED-17 Edit-control test).
  await deleteButton.focus();
  await expect(deleteButton).toBeFocused();
});

test("shows the Delete control on a Cooldown medication too, not just Active (MED-12 AC1)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();

  await expect(page.locator(".medication-item")).toHaveClass(/cooldown/);
  await expect(page.getByRole("button", { name: "Delete Aspirin" })).toBeVisible();
});

test("activating Delete removes the medication immediately, with no confirmation dialog or intermediate step (MED-12 AC3)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await expect(page.getByText("Aspirin — 100mg")).toBeVisible();

  await page.getByRole("button", { name: "Delete Aspirin" }).click();

  // No dialog of any kind appears — the row is simply gone.
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.getByText("Aspirin — 100mg")).toBeHidden();
});

test("a deleted medication is removed from localStorage and does not reappear on reload (MED-12 AC5)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });

  await page.getByRole("button", { name: "Delete Aspirin" }).click();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ name: "Ibuprofen" });

  await page.reload();

  await expect(page.getByText("Aspirin — 100mg")).toBeHidden();
  await expect(page.getByText("Ibuprofen — 200mg")).toBeVisible();
});

test("shows an inline error and leaves the row in place when the localStorage write fails on Delete (MED-12 review)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  // Simulate a storage failure (e.g. quota exceeded) for writes made after
  // this point, without touching the add-medication flow that already
  // succeeded above — same technique as the equivalent GO/Stop/Edit tests.
  await page.evaluate(() => {
    window.localStorage.setItem = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
  });

  await page.getByRole("button", { name: "Delete Aspirin" }).click();

  await expect(page.getByRole("alert").last()).toHaveText(
    "Could not delete — please try again."
  );
  // The displayed state must not imply the deletion happened: the row is
  // still there, and (per the earlier successful add) storage is unaffected.
  await expect(page.getByText("Aspirin — 100mg")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Aspirin" })).toBeVisible();
});

test("deleting a medication that is currently in Cooldown discards its countdown/timestamp data with no special-casing vs. deleting an Active one (MED-12 AC6)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "GO — log Aspirin taken" }).click();
  await expect(page.locator(".medication-item")).toHaveClass(/cooldown/);

  await page.getByRole("button", { name: "Delete Aspirin" }).click();

  await expect(page.getByText("Aspirin — 100mg")).toBeHidden();
  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored).toEqual([]);
});

test("deleting one medication leaves every other medication's data and displayed state completely unaffected (MED-12 AC7)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });
  await addMedicationViaUi(page, { name: "Paracetamol", dose: "500mg", interval: "4" });

  // Put the surviving medications into two different states so the
  // assertion below actually proves independence, not just "the row is
  // still there": Ibuprofen stays Active, Paracetamol goes into Cooldown.
  await page.getByRole("button", { name: "GO — log Paracetamol taken" }).click();
  await expect(page.getByRole("button", { name: "GO — log Paracetamol taken" })).toBeDisabled();

  await page.getByRole("button", { name: "Delete Aspirin" }).click();

  await expect(page.getByText("Aspirin — 100mg")).toBeHidden();
  await expect(page.getByText("Ibuprofen — 200mg")).toBeVisible();
  await expect(page.getByText("Paracetamol — 500mg")).toBeVisible();
  await expect(page.getByRole("button", { name: "GO — log Ibuprofen taken" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "GO — log Paracetamol taken" })).toBeDisabled();
  await expect(page.locator(".medication-item", { hasText: "Paracetamol" })).toHaveClass(
    /cooldown/
  );

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored).toHaveLength(2);
  expect(stored.map((medication) => medication.name).sort()).toEqual([
    "Ibuprofen",
    "Paracetamol",
  ]);
});

test("deleting the last remaining medication returns the app to the MED-6 empty state, with the FAB still visible and usable (MED-12 AC8)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Delete Aspirin" }).click();

  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();
  await expect(page.locator("#medication-list")).toBeHidden();

  const fab = page.locator("#add-medication-fab");
  await expect(fab).toBeVisible();

  // "usable", not just visible: adding a fresh medication through it must
  // still work after the list has emptied out.
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });
  await expect(page.getByText("Ibuprofen — 200mg")).toBeVisible();
});

test("the Delete control can be activated by keyboard alone, via both Enter and Space (MED-12 AC9)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });

  const deleteAspirin = page.getByRole("button", { name: "Delete Aspirin" });
  await deleteAspirin.focus();
  await expect(deleteAspirin).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Aspirin — 100mg")).toBeHidden();
  await expect(page.getByText("Ibuprofen — 200mg")).toBeVisible();

  const deleteIbuprofen = page.getByRole("button", { name: "Delete Ibuprofen" });
  await deleteIbuprofen.focus();
  await expect(deleteIbuprofen).toBeFocused();
  await page.keyboard.press(" ");

  await expect(page.getByText("Ibuprofen — 200mg")).toBeHidden();
  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();
});

test("keyboard focus moves to the next row's Delete button after deleting a middle item, not the Add-medication trigger (MED-12 review, keyboard efficiency)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });
  await addMedicationViaUi(page, { name: "Paracetamol", dose: "500mg", interval: "4" });

  const deleteIbuprofen = page.getByRole("button", { name: "Delete Ibuprofen" });
  await deleteIbuprofen.focus();
  await expect(deleteIbuprofen).toBeFocused();
  await deleteIbuprofen.click();

  await expect(page.getByText("Ibuprofen — 200mg")).toBeHidden();
  // Paracetamol shifted up into the deleted row's position — focus should
  // land on its Delete button, not be teleported back to the FAB at the top
  // of the tab order.
  await expect(page.getByRole("button", { name: "Delete Paracetamol" })).toBeFocused();
});

test("keyboard focus moves to the previous row's Delete button after deleting the last item in a multi-item list", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });

  const deleteIbuprofen = page.getByRole("button", { name: "Delete Ibuprofen" });
  await deleteIbuprofen.focus();
  await expect(deleteIbuprofen).toBeFocused();
  await deleteIbuprofen.click();

  await expect(page.getByText("Ibuprofen — 200mg")).toBeHidden();
  // No row shifted up into the deleted (last) row's old position, so focus
  // falls back to the new last row, Aspirin, instead.
  await expect(page.getByRole("button", { name: "Delete Aspirin" })).toBeFocused();
});

test("keyboard focus moves to the Add-medication trigger after deleting the last remaining medication (MED-12 AC8, genuine empty-state case)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  // addMedicationViaUi waits for its own dialog-close refocus to settle
  // before returning, so the trigger is guaranteed focused here.
  const addTrigger = page.locator("#add-medication-fab");

  const deleteButton = page.getByRole("button", { name: "Delete Aspirin" });
  await deleteButton.focus();
  await expect(deleteButton).toBeFocused();
  await deleteButton.click();

  await expect(page.getByText("Aspirin — 100mg")).toBeHidden();
  // The list is now genuinely empty — the FAB is the only focusable control
  // left, and is the correct AC8 target.
  await expect(addTrigger).toBeFocused();
});
