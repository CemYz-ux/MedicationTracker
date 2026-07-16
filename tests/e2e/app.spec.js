import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

// --- shared helpers ------------------------------------------------------

// The whole-card tap-to-toggle region (MED-32) for a given medication,
// located by scoping to the card containing its name/dose text rather than
// by its (state-dependent) aria-label — a test driving this control usually
// doesn't want to have to know or assert the current label just to find it.
function cardTapTarget(page, name) {
  return page.locator(".medication-item", { hasText: name }).locator(".card-tap-target");
}

// MED-33: name and dose now render as separate, stacked text nodes
// (`.medication-name` above `.medication-dose`) rather than a single
// "Name — Dose" line, so a single `getByText("Name — Dose")` locator can no
// longer find them (no one element's text content matches that whole
// string anymore). These two helpers re-create the old "this row shows
// these values" / "this row is gone" checks against the new markup.
function expectMedicationVisible(page, name, dose) {
  const card = page.locator(".medication-item", { hasText: name });
  return Promise.all([
    expect(card.locator(".medication-name")).toHaveText(name),
    expect(card.locator(".medication-dose")).toHaveText(dose),
  ]);
}

function expectMedicationHidden(page, name) {
  return expect(page.locator(".medication-item", { hasText: name })).toBeHidden();
}

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
  // is moving focus elsewhere for its own assertions. The real fix is
  // waiting for the actual "close" event to finish firing (see
  // `awaitEditDialogClose` below for the MED-32 Edit-dialog equivalent).
  await page.evaluate(() => window.__addDialogClosed);
}

// MED-32: same close-event-await discipline as `addMedicationViaUi` above,
// for the Edit dialog's own close paths (Save changes, Revert to Active).
// Registers the listener before the triggering click so there's no window
// in which the event could fire and be missed.
async function clickAndAwaitEditDialogClose(page, buttonName) {
  await page.evaluate(() => {
    window.__editDialogClosed = new Promise((resolve) => {
      document
        .getElementById("edit-medication-dialog")
        .addEventListener("close", resolve, { once: true });
    });
  });
  await page.getByRole("button", { name: buttonName }).click();
  await page.evaluate(() => window.__editDialogClosed);
}

// `page.clock.install()` leaves the fake clock *running* — following real
// wall-clock time 1:1 — until something explicitly pauses it (per
// Playwright's Clock docs), and `fastForward` jumps forward but then leaves
// it running again afterward too. At the ~1s cooldown re-check cadence
// (MED-29), ordinary Playwright overhead (form-filling, `expect` polling,
// `evaluate` round-trips) between installing the clock and a later assertion
// can cross that 1s tick boundary. `installFrozenClock` pins the clock
// immediately after install/reload, before any interaction — and
// `advanceAndFreeze` moves it forward from there using `pauseAt` (which jumps
// to an absolute instant and then freezes, unlike `fastForward`) — so no
// real-time drift can leak in anywhere in the test.
async function installFrozenClock(page) {
  await page.clock.install();
  await page.reload();
  // `pauseAt` rejects a target that's already in the past *at the moment the
  // call actually executes in the browser* — and there's an unavoidable
  // round-trip between reading `now` here and that call taking effect,
  // during which the (still-running, per Playwright's Clock docs) fake
  // clock keeps advancing in real time. A generous forward buffer absorbs
  // that round-trip latency; its exact size is inconsequential here since
  // nothing test-relevant has happened yet — this only establishes the
  // frozen baseline everything else in the test is measured from.
  const now = await page.evaluate(() => Date.now());
  const frozenAt = now + 2000;
  await page.clock.pauseAt(frozenAt);
  return frozenAt;
}

async function advanceAndFreeze(page, ms) {
  const current = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(current + ms);
}

// --- basic rendering / persistence ---------------------------------------

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
  // rather than the periodic re-check covered elsewhere.
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
          pausedRemainingMs: null,
        },
      ])
    );
  }, lastTakenAt);
  await page.reload();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(cardTapTarget(page, "Aspirin")).toHaveAccessibleName("Log Aspirin dose now");
  await expect(item.locator(".cooldown-countdown")).toBeHidden();
});

test("shows today's day and date in place of the old page title/subtitle/heading, with the old disclaimer text gone too", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") }); // a Sunday
  await page.reload();

  await expect(page.getByRole("heading", { name: "Sunday, July 12" })).toBeVisible();

  await expect(page.getByText("Medication Tracker", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Keep track of the medications you take")
  ).toHaveCount(0);
  await expect(page.getByText("Your medications", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Data is stored only in your browser")
  ).toHaveCount(0);
});

// --- add a medication ------------------------------------------------------

test("opens the add-medication modal from the trigger", async ({ page }) => {
  const dialog = page.locator("#add-medication-dialog");
  await expect(dialog).not.toBeVisible();

  await page.locator("#add-medication-fab").click();

  await expect(dialog).toBeVisible();
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
  await dialog.getByRole("button", { name: "Add medication", exact: true }).click();

  await expect(dialog).not.toBeVisible();
  await expectMedicationVisible(page, "Aspirin", "100mg");
  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeHidden();
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
  await expectMedicationVisible(page, "Aspirin", "100mg");

  await page.locator("#add-medication-fab").click();

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
  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();
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
  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();
});

test("persists an added medication across a reload", async ({ page }) => {
  await page.locator("#add-medication-fab").click();
  const dialog = page.locator("#add-medication-dialog");
  await dialog.getByLabel("Name").fill("Ibuprofen");
  await dialog.getByLabel("Dose").fill("200mg");
  await dialog.getByLabel("Interval (hours)").fill("6");
  await dialog.getByRole("button", { name: "Add medication", exact: true }).click();

  await page.reload();

  await expectMedicationVisible(page, "Ibuprofen", "200mg");
});

test("closing via Cancel discards unsaved input and returns focus to the trigger", async ({
  page,
}) => {
  const trigger = page.locator("#add-medication-fab");
  await trigger.click();
  await page.locator("#add-medication-dialog").getByLabel("Name").fill("Should not be saved");

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.locator("#add-medication-dialog")).not.toBeVisible();
  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();
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
  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();
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
  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("closing via a backdrop click discards unsaved input and returns focus to the trigger", async ({
  page,
}) => {
  const trigger = page.locator("#add-medication-fab");
  await trigger.click();
  const dialog = page.locator("#add-medication-dialog");
  await dialog.getByLabel("Name").fill("Should not be saved");

  const box = await dialog.boundingBox();
  await page.mouse.click(box.x + 2, box.y + 2);

  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("No medications yet — add one to get started.")
  ).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("focuses the Name field, not the close button, when the modal opens", async ({ page }) => {
  await page.locator("#add-medication-fab").click();

  await expect(page.locator("#add-medication-dialog").getByLabel("Name")).toBeFocused();
});

test("focus stays trapped inside the modal while open", async ({ page }) => {
  await page.locator("#add-medication-fab").click();

  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
  }

  const activeElementInDialog = await page.evaluate(() => {
    const dialog = document.getElementById("add-medication-dialog");
    return dialog.contains(document.activeElement);
  });
  expect(activeElementInDialog).toBe(true);
});

// --- MED-32: whole-card tap-to-toggle (log a dose) ------------------------

test("shows no GO or Stop button anywhere — both removed entirely (MED-32)", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();

  await expect(page.getByText("GO", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Stop", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^GO/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Stop/ })).toHaveCount(0);
});

test("an Active card's tap-target is a keyboard-reachable role=button with an accessible name identifying the medication and the action a tap performs", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const tapTarget = cardTapTarget(page, "Aspirin");
  await expect(tapTarget).toHaveAccessibleName("Log Aspirin dose now");
  await tapTarget.focus();
  await expect(tapTarget).toBeFocused();
});

test("the tap target spans the card's full width, not just its text content — a tap anywhere on the card logs a dose (MED-32 AC1/AC12 'whole-card' regression guard)", async ({
  page,
}) => {
  // Regression guard for a real bug caught in review: `.medication-item`'s
  // `align-items: flex-start` shrinks a flex child that doesn't explicitly
  // opt out back down to the width of its content, so `.card-tap-target`
  // (a flex child of it) rendered far narrower than the visible card unless
  // it explicitly stretches. `cardTapTarget(...).click()` alone can't catch
  // this — Playwright clicks the located element's own center, which is
  // inside its content regardless of how narrow that content box is. This
  // test instead clicks a point derived from the *card's* bounding box, well
  // into its right-hand whitespace, to confirm the tap target's hit area
  // genuinely covers it.
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const item = page.locator(".medication-item");
  const box = await item.boundingBox();
  await page.mouse.click(box.x + box.width - 30, box.y + box.height / 2);

  await expect(item).toHaveClass(/cooldown/);
  await expect(cardTapTarget(page, "Aspirin")).toHaveAccessibleName("Cancel Aspirin cooldown");
});

test("tapping an Active card logs the current timestamp, persists it, and flips the card to Cooldown", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const tapTarget = cardTapTarget(page, "Aspirin");
  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/active/);

  const before = await page.evaluate(() => Date.now());
  await tapTarget.click();
  const after = await page.evaluate(() => Date.now());

  await expect(item).toHaveClass(/cooldown/);
  await expect(tapTarget).toHaveAccessibleName("Cancel Aspirin cooldown");

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored).toHaveLength(1);
  const loggedTime = new Date(stored[0].lastTakenAt).getTime();
  expect(loggedTime).toBeGreaterThanOrEqual(before);
  expect(loggedTime).toBeLessThanOrEqual(after);
  expect(stored[0]).not.toHaveProperty("pausedRemainingMs");

  // Persists across a reload, since it's derived from the persisted
  // lastTakenAt, not just in-memory UI state.
  await page.reload();
  await expect(page.locator(".medication-item")).toHaveClass(/cooldown/);
});

test("tapping one medication's card does not affect another medication's state", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });

  await cardTapTarget(page, "Aspirin").click();

  await expect(cardTapTarget(page, "Aspirin")).toHaveAccessibleName("Cancel Aspirin cooldown");
  await expect(cardTapTarget(page, "Ibuprofen")).toHaveAccessibleName("Log Ibuprofen dose now");

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  const aspirin = stored.find((medication) => medication.name === "Aspirin");
  const ibuprofen = stored.find((medication) => medication.name === "Ibuprofen");
  expect(aspirin.lastTakenAt).not.toBeNull();
  expect(ibuprofen.lastTakenAt).toBeNull();
});

test("shows an inline error and leaves the card Active when the localStorage write fails on tap-to-log", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.evaluate(() => {
    window.localStorage.setItem = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
  });

  await cardTapTarget(page, "Aspirin").click();

  await expect(page.getByRole("alert").last()).toHaveText(
    "Could not update — please try again."
  );
  await expect(page.locator(".medication-item")).toHaveClass(/active/);
  await expect(cardTapTarget(page, "Aspirin")).toHaveAccessibleName("Log Aspirin dose now");
});

test("activating the card via keyboard (Enter) keeps focus on the card instead of teleporting it elsewhere", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const tapTarget = cardTapTarget(page, "Aspirin");
  const addTrigger = page.locator("#add-medication-fab");

  await tapTarget.focus();
  await expect(tapTarget).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.locator(".medication-item")).toHaveClass(/cooldown/);
  await expect(addTrigger).not.toBeFocused();
  await expect(tapTarget).toBeFocused();
});

test("activating the card via keyboard (Space) also logs a dose", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const tapTarget = cardTapTarget(page, "Aspirin");
  await tapTarget.focus();
  await page.keyboard.press(" ");

  await expect(page.locator(".medication-item")).toHaveClass(/cooldown/);
});

test("announces a logged dose to assistive tech via a live status region", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const status = page.getByRole("status");
  await expect(status).toHaveText("");

  await cardTapTarget(page, "Aspirin").click();

  await expect(status).toHaveText("Aspirin logged.");
});

test("activating the per-card Edit/Delete/Reset icon buttons never also logs a dose (nested-interactive-elements independence, MED-32)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Delete Aspirin" }).focus();
  // Clicking/activating Edit or Reset must not bubble into the card's own
  // tap-to-toggle handler — verified by pressing Edit (opens a dialog,
  // doesn't touch cooldown state) and Reset (starts a cooldown on its own,
  // asserted separately below) and confirming the card was never logged via
  // an *unrelated* extra activation.
  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await expect(editDialog).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Still Active — opening/closing Edit never logged a dose via the card's
  // own click/keydown handlers underneath.
  await expect(page.locator(".medication-item")).toHaveClass(/active/);
  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored[0].lastTakenAt).toBeNull();
});

// --- MED-8/MED-29/MED-33: cooldown countdown + fill --------------------

test("shows a live countdown in '{remaining} left' format after tapping, and the fill starts at 100%", async ({
  page,
}) => {
  await page.clock.install();
  await page.reload();

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();

  await expect(page.getByText("8h left")).toBeVisible();

  const item = page.locator(".medication-item.cooldown");
  await expect(item).toHaveCSS("--progress", "100%");
});

test("tapping to log does not change the card's height, even though it reveals countdown text (MED-18)", async ({
  page,
}) => {
  await page.clock.install();
  await page.reload();

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const item = page.locator(".medication-item");
  const heightBeforeTap = (await item.boundingBox()).height;

  await cardTapTarget(page, "Aspirin").click();
  await expect(page.getByText("8h left")).toBeVisible();

  const heightAfterTap = (await item.boundingBox()).height;
  expect(heightAfterTap).toBe(heightBeforeTap);
});

test("shows no fill or countdown text on an Active (non-cooldown) card", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(item.locator(".cooldown-countdown")).toBeHidden();
});

test("the fill recedes proportionally to elapsed cooldown time, and reactivation + zero fill happen together (running, unpaused cooldown)", async ({
  page,
}) => {
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(item).toHaveCSS("--progress", "100%");

  await advanceAndFreeze(page, 4 * 60 * 60 * 1000);
  await expect(item).toHaveCSS("--progress", "50%");
  await expect(page.getByText("4h left")).toBeVisible();

  await advanceAndFreeze(page, 4 * 60 * 60 * 1000 + 60_000);
  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(cardTapTarget(page, "Aspirin")).toHaveAccessibleName("Log Aspirin dose now");
  await expect(item.locator(".cooldown-countdown")).toBeHidden();
});

test("the countdown's seconds component ticks live once per second, without waiting for a reload", async ({
  page,
}) => {
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "1" });
  await cardTapTarget(page, "Aspirin").click();
  await expect(page.getByText("1h left")).toBeVisible();

  await advanceAndFreeze(page, 1000);
  await expect(page.getByText("59m 59s left")).toBeVisible();

  await advanceAndFreeze(page, 1000);
  await expect(page.getByText("59m 58s left")).toBeVisible();
});

test("editing the interval mid-cooldown (via the Edit dialog, MED-32) does not disturb the running countdown/fill (MED-5 invariant)", async ({
  page,
}) => {
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Interval (hours)").fill("2");
  await clickAndAwaitEditDialogClose(page, "Save changes");

  await advanceAndFreeze(page, 3 * 60 * 60 * 1000);

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(page.getByText("5h left")).toBeVisible();
});

// --- MED-33: compact card redesign (remove pill, shrink card, reposition
// icon row + countdown text) -----------------------------------------------

test("Active and Cooldown render at identical card height for the same medication, measured via getBoundingClientRect, not visual inspection alone (MED-33 AC6, extends MED-18)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const item = page.locator(".medication-item");
  const activeHeight = await item.evaluate((el) => el.getBoundingClientRect().height);

  await cardTapTarget(page, "Aspirin").click();
  await expect(item).toHaveClass(/cooldown/);
  const cooldownHeight = await item.evaluate((el) => el.getBoundingClientRect().height);
  expect(cooldownHeight).toBe(activeHeight);

  // Round-trips back to Active (tap-to-cancel, MED-34) at the same height.
  await cardTapTarget(page, "Aspirin").click();
  await expect(item).toHaveClass(/active/);
  const activeHeightAgain = await item.evaluate((el) => el.getBoundingClientRect().height);
  expect(activeHeightAgain).toBe(activeHeight);
});

test("no status pill renders anywhere on the card in either state — state is color-only via active/cooldown classes (MED-33 AC2)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const item = page.locator(".medication-item");
  await expect(item.locator(".pill")).toHaveCount(0);
  await expect(page.getByText("Active", { exact: true })).toHaveCount(0);

  await cardTapTarget(page, "Aspirin").click();
  await expect(item).toHaveClass(/cooldown/);
  await expect(item.locator(".pill")).toHaveCount(0);
  await expect(page.getByText("Cooldown", { exact: true })).toHaveCount(0);
});

test("the remaining-cooldown countdown text renders top-left of the card, not bottom-right (MED-33 AC5, relocated from MED-18)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();

  const item = page.locator(".medication-item");
  const itemBox = await item.boundingBox();
  const countdownBox = await item.locator(".cooldown-countdown").boundingBox();

  expect(countdownBox.x - itemBox.x).toBeLessThan(itemBox.width / 2);
  expect(countdownBox.y - itemBox.y).toBeLessThan(itemBox.height / 2);
});

test("Edit/Delete/Reset render together in one row/strip, top-right, sharing it with the countdown text's vertical band rather than the name/dose row (MED-33 AC3)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();

  const item = page.locator(".medication-item");
  const itemBox = await item.boundingBox();
  const countdownBox = await item.locator(".cooldown-countdown").boundingBox();
  const nameBox = await item.locator(".medication-name").boundingBox();
  const editBox = await page.getByRole("button", { name: "Edit Aspirin" }).boundingBox();
  const deleteBox = await page.getByRole("button", { name: "Delete Aspirin" }).boundingBox();
  const resetBox = await page.getByRole("button", { name: "Reset Aspirin cooldown" }).boundingBox();

  // All three icon buttons sit within a fixed-width band hugging the card's
  // right edge (3 x 44px buttons + 2 x 8px gaps + the 1.2rem right offset is
  // ~187px, however wide the card itself renders) and in the card's upper
  // half...
  for (const box of [editBox, deleteBox, resetBox]) {
    expect(itemBox.x + itemBox.width - box.x).toBeLessThan(200);
    expect(box.y - itemBox.y).toBeLessThan(itemBox.height / 2);
  }
  // ...with Reset (the last/rightmost of the three) close to the card's
  // right edge itself, per `.header-actions`' `right: 1.2rem` offset.
  expect(itemBox.x + itemBox.width - (resetBox.x + resetBox.width)).toBeLessThan(25);
  // ...vertically overlapping the same top strip the countdown text occupies
  // (not a separate row below it)...
  expect(editBox.y).toBeLessThan(countdownBox.y + countdownBox.height);
  expect(editBox.y + editBox.height).toBeGreaterThan(countdownBox.y);
  // ...and entirely above the name/dose row further down the card, not
  // sharing a flex row with it.
  expect(editBox.y + editBox.height).toBeLessThanOrEqual(nameBox.y + 1);
});

test("the compact card does not overflow or clip its content at a narrow ~320-375px viewport, in either state (MED-33 AC9 — spot-check vs. MED-28)", async ({
  page,
}) => {
  // MED-28 (pre-existing, separate follow-up) is about page-level overflow
  // at this width, not this card's own layout — this test only asserts on
  // the card itself, so it can't confirm or deny MED-28 either way; it just
  // confirms this redesign doesn't introduce a *new* overflow of its own.
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await addMedicationViaUi(page, {
      name: "Amoxicillin Clavulanate Potassium",
      dose: "875mg/125mg",
      interval: "8",
    });

    const item = page.locator(".medication-item");
    const noHorizontalOverflow = await item.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1
    );
    expect(noHorizontalOverflow).toBe(true);

    await cardTapTarget(page, "Amoxicillin Clavulanate Potassium").click();
    await expect(item).toHaveClass(/cooldown/);
    const noHorizontalOverflowInCooldown = await item.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1
    );
    expect(noHorizontalOverflowInCooldown).toBe(true);

    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  }
});

// --- MED-33/MED-34: always-visible interval stat (numeral + caption) -----

test("shows an always-visible interval stat (large numeral + HOURS caption) near the name/dose row on an Active card", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/active/);
  await expect(item.locator(".medication-interval-value")).toHaveText("8");
  await expect(item.locator(".medication-interval-caption")).toHaveText("hours");
});

test("keeps showing the same interval stat once a card enters Cooldown, distinct from the countdown text (MED-33/MED-34)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const item = page.locator(".medication-item");
  await cardTapTarget(page, "Aspirin").click();

  await expect(item).toHaveClass(/cooldown/);
  // Both readouts are visible at once and say different things: the
  // top-left countdown text ("8h left", MED-33) alongside this story's
  // separate always-visible interval stat ("8" / "hours").
  await expect(page.getByText("8h left")).toBeVisible();
  await expect(item.locator(".medication-interval-value")).toHaveText("8");
});

test("the interval stat's numeral reflects a fractional interval as the raw intervalHours value", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "4.5" });

  const item = page.locator(".medication-item");
  await expect(item.locator(".medication-interval-value")).toHaveText("4.5");
  await expect(item.locator(".medication-interval-caption")).toHaveText("hours");
});

test("the interval stat updates immediately after an Edit-dialog interval change, in both Active and Cooldown states", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const item = page.locator(".medication-item");

  // Active: edit the interval and confirm the stat updates without a
  // reload.
  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  let editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Interval (hours)").fill("6");
  await clickAndAwaitEditDialogClose(page, "Save changes");

  await expect(item.locator(".medication-interval-value")).toHaveText("6");

  // Cooldown: editing the interval mid-cooldown must not disturb the
  // running countdown/fill (MED-5 invariant, unchanged) but the always-
  // visible stat still reflects the newly-edited live intervalHours.
  await cardTapTarget(page, "Aspirin").click();
  await expect(item).toHaveClass(/cooldown/);

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Interval (hours)").fill("3");
  await clickAndAwaitEditDialogClose(page, "Save changes");

  await expect(item).toHaveClass(/cooldown/);
  await expect(page.getByText("6h left")).toBeVisible();
  await expect(item.locator(".medication-interval-value")).toHaveText("3");
});

test("each medication's interval stat is independent of every other medication's", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });

  await expect(
    page
      .locator(".medication-item", { hasText: "Aspirin" })
      .locator(".medication-interval-value")
  ).toHaveText("8");
  await expect(
    page
      .locator(".medication-item", { hasText: "Ibuprofen" })
      .locator(".medication-interval-value")
  ).toHaveText("6");
});

// --- MED-10: cooldown/active state stays correct across reload/reopen -----

test("mid-cooldown reload recomputes remaining time from the stored timestamp instead of resetting it (MED-10 AC1)", async ({
  page,
}) => {
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(item).toHaveCSS("--progress", "100%");

  await advanceAndFreeze(page, 2 * 60 * 60 * 1000);
  await page.reload();

  const itemAfterReload = page.locator(".medication-item");
  await expect(itemAfterReload).toHaveClass(/cooldown/);
  const progressPercent = await itemAfterReload.evaluate((el) =>
    parseFloat(getComputedStyle(el).getPropertyValue("--progress"))
  );
  expect(progressPercent).toBeCloseTo(75, 1);
  await expect(page.getByText("6h left")).toBeVisible();
});

test("a medication whose cooldown fully elapsed while the tab was closed shows Active on the very first render after reopening, with no in-tab timer required (MED-10 AC2)", async ({
  page,
}) => {
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
          pausedRemainingMs: null,
        },
      ])
    );
  }, lastTakenAt);

  await page.reload();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(cardTapTarget(page, "Aspirin")).toHaveAccessibleName("Log Aspirin dose now");
  await expect(item.locator(".cooldown-countdown")).toBeHidden();
});

// --- MED-34: tapping a Cooldown card cancels immediately, reverting to
// Active (reverts MED-32's Paused state — no more freeze-in-place) ---------

test("tapping a running Cooldown card cancels it immediately and reverts to Active — not frozen/paused (MED-34 AC2, the regression MED-32's Paused state would have caused)", async ({
  page,
}) => {
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();
  await advanceAndFreeze(page, 2 * 60 * 60 * 1000);
  await expect(page.getByText("6h left")).toBeVisible();

  const tapTarget = cardTapTarget(page, "Aspirin");
  await tapTarget.click();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/active/);
  await expect(item).not.toHaveClass(/cooldown/);
  await expect(item).not.toHaveClass(/paused/);
  await expect(tapTarget).toHaveAccessibleName("Log Aspirin dose now");
  await expect(item.locator(".cooldown-countdown")).toBeHidden();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored[0].lastTakenAt).toBeNull();
  expect(stored[0].cooldownIntervalHours).toBeNull();
});

test("cancelling via tap persists to localStorage and survives a reload", async ({ page }) => {
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();
  await advanceAndFreeze(page, 2 * 60 * 60 * 1000);
  await cardTapTarget(page, "Aspirin").click(); // cancel

  await page.reload();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/active/);
  await expect(cardTapTarget(page, "Aspirin")).toHaveAccessibleName("Log Aspirin dose now");
});

test("cancelling one medication's cooldown via tap does not affect another medication", async ({
  page,
}) => {
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });

  await cardTapTarget(page, "Aspirin").click();
  await cardTapTarget(page, "Ibuprofen").click();
  await advanceAndFreeze(page, 1 * 60 * 60 * 1000);

  await cardTapTarget(page, "Aspirin").click(); // cancel Aspirin only

  await expect(cardTapTarget(page, "Aspirin")).toHaveAccessibleName("Log Aspirin dose now");
  await expect(cardTapTarget(page, "Ibuprofen")).toHaveAccessibleName("Cancel Ibuprofen cooldown");

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  const ibuprofen = stored.find((medication) => medication.name === "Ibuprofen");
  expect(ibuprofen.lastTakenAt).not.toBeNull();
});

test("shows an inline error and leaves the cooldown running when the localStorage write fails on tap-to-cancel", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();

  await page.evaluate(() => {
    window.localStorage.setItem = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
  });

  await cardTapTarget(page, "Aspirin").click();

  await expect(page.getByRole("alert").last()).toHaveText(
    "Could not update — please try again."
  );
  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(cardTapTarget(page, "Aspirin")).toHaveAccessibleName("Cancel Aspirin cooldown");
});

test("editing the interval mid-cooldown (via the Edit dialog) does not un-cancel or otherwise change whether tapping the card cancels it", async ({
  page,
}) => {
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();
  await advanceAndFreeze(page, 2 * 60 * 60 * 1000);

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Interval (hours)").fill("2");
  await clickAndAwaitEditDialogClose(page, "Save changes");

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(page.getByText("6h left")).toBeVisible();

  await cardTapTarget(page, "Aspirin").click(); // cancel

  await expect(item).toHaveClass(/active/);
  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored[0].lastTakenAt).toBeNull();
  expect(stored[0].intervalHours).toBe(2);
});

test("tapping to cancel keeps focus on the card and announces the change to assistive tech (MED-34, mirrors the removed Revert-to-Active button's own focus/announcement)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const tapTarget = cardTapTarget(page, "Aspirin");
  await tapTarget.click(); // log

  await tapTarget.click(); // cancel

  await expect(tapTarget).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Aspirin reverted to Active.");
});

// --- MED-32: Reset (from either state) ------------------------------------

test("shows a per-card Reset control, visible and usable from every state (Active or Cooldown)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const resetButton = page.getByRole("button", { name: "Reset Aspirin cooldown" });
  await expect(resetButton).toBeVisible();
  await resetButton.focus();
  await expect(resetButton).toBeFocused();
});

test("Reset from Active starts a brand-new full-length cooldown right now", async ({ page }) => {
  await page.clock.install();
  await page.reload();

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await page.getByRole("button", { name: "Reset Aspirin cooldown" }).click();

  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
  await expect(page.getByText("8h left")).toBeVisible();
});

test("Reset from a running Cooldown overwrites it with a brand-new full-length cooldown", async ({
  page,
}) => {
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();
  await advanceAndFreeze(page, 6 * 60 * 60 * 1000); // 2h left

  await page.getByRole("button", { name: "Reset Aspirin cooldown" }).click();

  await expect(page.getByText("8h left")).toBeVisible();
  const item = page.locator(".medication-item");
  await expect(item).toHaveClass(/cooldown/);
});

test("Reset moves focus to the Reset button itself and announces the reset", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const resetButton = page.getByRole("button", { name: "Reset Aspirin cooldown" });
  await resetButton.click();

  await expect(resetButton).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Aspirin cooldown reset.");
});

test("Reset on one medication does not affect another medication", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });

  await page.getByRole("button", { name: "Reset Aspirin cooldown" }).click();

  await expect(cardTapTarget(page, "Ibuprofen")).toHaveAccessibleName("Log Ibuprofen dose now");
  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  const ibuprofen = stored.find((medication) => medication.name === "Ibuprofen");
  expect(ibuprofen.lastTakenAt).toBeNull();
});

test("shows an inline error and leaves the medication unchanged when the localStorage write fails on Reset", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.evaluate(() => {
    window.localStorage.setItem = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
  });

  await page.getByRole("button", { name: "Reset Aspirin cooldown" }).click();

  await expect(page.getByRole("alert").last()).toHaveText(
    "Could not reset — please try again."
  );
  await expect(page.locator(".medication-item")).toHaveClass(/active/);
});

// --- MED-17/MED-32: Edit dialog (Name, Dose, Interval, Revert to Active) --

test("shows a per-card Edit control, keyboard-reachable, with an accessible name identifying the medication (MED-17 AC1-AC3)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const editButton = page.getByRole("button", { name: "Edit Aspirin" });
  await expect(editButton).toBeVisible();
  await editButton.focus();
  await expect(editButton).toBeFocused();
});

test("shows the Edit control on a Cooldown medication too, not just Active (MED-17 AC1)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();

  await expect(page.locator(".medication-item")).toHaveClass(/cooldown/);
  await expect(page.getByRole("button", { name: "Edit Aspirin" })).toBeVisible();
});

test("activating Edit opens a modal pre-filled with that medication's current Name, Dose, and Interval, and focuses Name (MED-17 AC4, MED-32 AC6)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();

  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByLabel("Name")).toHaveValue("Aspirin");
  await expect(editDialog.getByLabel("Dose")).toHaveValue("100mg");
  await expect(editDialog.getByLabel("Interval (hours)")).toHaveValue("8");
  await expect(editDialog.getByLabel("Name")).toBeFocused();
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
  await expect(editDialog.getByLabel("Interval (hours)")).toHaveValue("6");
});

test("a valid Edit submit updates Name/Dose/Interval in the list, persists to localStorage, and closes the modal (MED-17 AC5, MED-32 AC6)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Buffered Aspirin");
  await editDialog.getByLabel("Dose").fill("150mg");
  await editDialog.getByLabel("Interval (hours)").fill("12");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(editDialog).not.toBeVisible();
  await expectMedicationVisible(page, "Buffered Aspirin", "150mg");

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored[0]).toMatchObject({
    name: "Buffered Aspirin",
    dose: "150mg",
    intervalHours: 12,
  });
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
  await expectMedicationVisible(page, "Aspirin", "100mg");

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored[0]).toMatchObject({ name: "Aspirin", dose: "100mg", intervalHours: 8 });
});

test("clearing/invalidating Interval on submit shows an inline error, keeps the modal open, and persists nothing (MED-32)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Interval (hours)").fill("-3");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(editDialog).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(
    "Interval (hours) must be a positive number."
  );

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored[0].intervalHours).toBe(8);
});

test("closing via Cancel discards unsaved input (including Interval) and returns focus to that row's Edit control (MED-17 AC7-AC8)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const editButton = page.getByRole("button", { name: "Edit Aspirin" });
  await editButton.click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Should not be saved");
  await editDialog.getByLabel("Interval (hours)").fill("99");

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(editDialog).not.toBeVisible();
  await expectMedicationVisible(page, "Aspirin", "100mg");
  await expect(editButton).toBeFocused();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored[0].intervalHours).toBe(8);
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
  await expectMedicationVisible(page, "Aspirin", "100mg");
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
  await expectMedicationVisible(page, "Aspirin", "100mg");
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
  await expectMedicationVisible(page, "Aspirin", "100mg");
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
  await expect(page.getByRole("button", { name: "Edit Buffered Aspirin" })).toBeFocused();
});

test("focus stays trapped inside the Edit modal while open (MED-17 AC9)", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();

  // The Edit dialog has 6 tab stops (close, Name, Dose, Interval, Cancel,
  // Save — MED-34 removed the Revert-to-Active control this dialog briefly
  // had). Chromium briefly moves
  // `document.activeElement` to <body> for exactly one Tab press whenever
  // Tab wraps past the last focusable element back to the first (native
  // <dialog> behavior, not something this app's markup/JS controls) — a tab
  // count that's an exact multiple of the element count samples that
  // transient frame. 8 (not a multiple of 6) avoids it, mirroring the
  // pre-MED-32 version of this test picking a non-multiple for the same
  // reason.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
  }

  const activeElementInDialog = await page.evaluate(() => {
    const dialog = document.getElementById("edit-medication-dialog");
    return dialog.contains(document.activeElement);
  });
  expect(activeElementInDialog).toBe(true);
});

test("editing Name/Dose/Interval mid-cooldown leaves lastTakenAt and cooldownIntervalHours completely untouched (MED-17/MED-5 invariant)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFrozenClock(page);

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();
  await advanceAndFreeze(page, 3 * 60 * 60 * 1000);

  const item = page.locator(".medication-item");
  await expect(page.getByText("5h left")).toBeVisible();

  const storedBefore = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Buffered Aspirin");
  await editDialog.getByLabel("Dose").fill("150mg");
  await editDialog.getByLabel("Interval (hours)").fill("2");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(item).toHaveClass(/cooldown/);
  await expect(page.getByText("5h left")).toBeVisible();

  const storedAfter = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(storedAfter[0].lastTakenAt).toBe(storedBefore[0].lastTakenAt);
  expect(storedAfter[0].cooldownIntervalHours).toBe(storedBefore[0].cooldownIntervalHours);
  expect(storedAfter[0].name).toBe("Buffered Aspirin");
  expect(storedAfter[0].dose).toBe("150mg");
  expect(storedAfter[0].intervalHours).toBe(2);
});

// MED-37: NotificationHelper bakes the medication's name into the native
// alarm's PendingIntent at schedule time, so an Edit-dialog rename mid-cooldown
// must re-sync the native reminder — otherwise a reminder scheduled before the
// edit would go on to fire showing the stale, pre-edit name. `window.AndroidBridge`
// is stubbed via `addInitScript` (evaluated before any page script runs, same as
// `js/androidBridge.js`'s own "is this the native wrapper" check would see it) so
// this exercises the real `syncReminders` wiring in js/app.js, not a mock of it.
test("renaming a medication mid-cooldown re-syncs the native reminder with the new name (MED-37)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__bridgeCalls = { scheduleReminder: [], cancelReminder: [] };
    window.AndroidBridge = {
      scheduleReminder: (id, name, dueAtMillis) => {
        window.__bridgeCalls.scheduleReminder.push({ id, name, dueAtMillis });
      },
      cancelReminder: (id) => {
        window.__bridgeCalls.cancelReminder.push(id);
      },
    };
  });
  await page.reload();

  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click(); // logs a dose, entering Cooldown

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Aspirin XL");
  await clickAndAwaitEditDialogClose(page, "Save changes");

  const scheduleCalls = await page.evaluate(() => window.__bridgeCalls.scheduleReminder);
  expect(scheduleCalls.length).toBeGreaterThan(0);
  expect(scheduleCalls[scheduleCalls.length - 1].name).toBe("Aspirin XL");
  expect(Number.isFinite(scheduleCalls[scheduleCalls.length - 1].dueAtMillis)).toBe(true);
});

test("editing Name/Dose/Interval while Active leaves it Active — editing does not start a cooldown (MED-17)", async ({
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
  await expect(cardTapTarget(page, "Buffered Aspirin")).toHaveAccessibleName(
    "Log Buffered Aspirin dose now"
  );

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("medications"))
  );
  expect(stored[0].lastTakenAt).toBeNull();
});

test("an edited Name/Dose/Interval persists across a reload (MED-17/MED-32)", async ({ page }) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Buffered Aspirin");
  await editDialog.getByLabel("Dose").fill("150mg");
  await editDialog.getByLabel("Interval (hours)").fill("12");
  await page.getByRole("button", { name: "Save changes" }).click();

  await page.reload();

  await expectMedicationVisible(page, "Buffered Aspirin", "150mg");
  await page.getByRole("button", { name: "Edit Buffered Aspirin" }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit medication" }).getByLabel("Interval (hours)")
  ).toHaveValue("12");
});

test("editing one medication's Name/Dose/Interval does not affect another medication's data or display (MED-17)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });
  await cardTapTarget(page, "Ibuprofen").click();

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await editDialog.getByLabel("Name").fill("Buffered Aspirin");
  await editDialog.getByLabel("Interval (hours)").fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expectMedicationVisible(page, "Ibuprofen", "200mg");
  await expect(cardTapTarget(page, "Ibuprofen")).toHaveAccessibleName("Cancel Ibuprofen cooldown");

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
  await expectMedicationVisible(page, "Aspirin", "100mg");
});

// MED-34: the Edit dialog's "Revert to Active" control (MED-32) is removed
// entirely — tapping a Cooldown card does the same job now (see the
// tap-to-cancel tests above), so there is no dedicated dialog control left
// to test here.
test("the Edit dialog no longer has a Revert to Active control, in either Active or Cooldown state (MED-34)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit medication" });
  await expect(editDialog.getByRole("button", { name: "Revert to Active" })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();

  await cardTapTarget(page, "Aspirin").click();
  await page.getByRole("button", { name: "Edit Aspirin" }).click();
  await expect(editDialog.getByRole("button", { name: "Revert to Active" })).toHaveCount(0);
});

// --- MED-22: responsive grid -------------------------------------------

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
});

test("the page container's max-width grows at the 640px and 1000px breakpoints to fit the grid (MED-22 AC6)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 639, height: 900 });
  const narrowWidth = await page.evaluate(() => document.body.getBoundingClientRect().width);
  expect(narrowWidth).toBeLessThanOrEqual(640);

  await page.setViewportSize({ width: 900, height: 900 });
  const midWidth = await page.evaluate(() => document.body.getBoundingClientRect().width);
  expect(midWidth).toBeCloseTo(48 * 16, -1);

  await page.setViewportSize({ width: 1400, height: 900 });
  const wideWidth = await page.evaluate(() => document.body.getBoundingClientRect().width);
  expect(wideWidth).toBeCloseTo(64 * 16, -1);
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

  const xPositions = await items.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().x)
  );
  expect(xPositions[0]).toBeLessThan(xPositions[1]);
  expect(xPositions[1]).toBeLessThan(xPositions[2]);

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
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await addMedicationViaUi(page, {
    name: "Amoxicillin Clavulanate Potassium Extended-Release",
    dose: "200mg",
    interval: "6",
  });

  const items = page.locator(".medication-item");
  const [aspirinItem, longNameItem] = [items.nth(0), items.nth(1)];

  const aspirinBoxBefore = await aspirinItem.boundingBox();
  const longNameBoxBefore = await longNameItem.boundingBox();
  expect(aspirinBoxBefore.y).toBeCloseTo(longNameBoxBefore.y, 0);
  expect(longNameBoxBefore.height).toBeGreaterThan(aspirinBoxBefore.height);

  await cardTapTarget(page, "Aspirin").click();
  await expect(page.getByText("8h left")).toBeVisible();

  const aspirinBoxAfter = await aspirinItem.boundingBox();
  const longNameBoxAfter = await longNameItem.boundingBox();

  expect(aspirinBoxAfter.height).toBe(aspirinBoxBefore.height);
  expect(longNameBoxAfter.height).toBe(longNameBoxBefore.height);
  expect(longNameBoxAfter.y).toBe(longNameBoxBefore.y);
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

test("the per-card Edit/Delete/Reset icon buttons and both dialogs' close controls meet the ~44px touch target baseline (MED-19, MED-32)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  for (const name of ["Edit Aspirin", "Delete Aspirin", "Reset Aspirin cooldown"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

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

test("the per-card Edit/Delete/Reset icon buttons still meet the ~44px touch target baseline on a Cooldown card, not just Active (MED-19)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();
  await expect(page.locator(".medication-item")).toHaveClass(/cooldown/);

  for (const name of ["Edit Aspirin", "Delete Aspirin", "Reset Aspirin cooldown"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
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

  const boxAfterScroll = await fab.boundingBox();
  expect(boxAfterScroll.x).toBeCloseTo(boxBeforeScroll.x, 0);
  expect(boxAfterScroll.y).toBeCloseTo(boxBeforeScroll.y, 0);

  const lastCardBox = await page.locator(".medication-item").last().boundingBox();
  const overlaps =
    boxAfterScroll.x < lastCardBox.x + lastCardBox.width &&
    boxAfterScroll.x + boxAfterScroll.width > lastCardBox.x &&
    boxAfterScroll.y < lastCardBox.y + lastCardBox.height &&
    boxAfterScroll.y + boxAfterScroll.height > lastCardBox.y;
  expect(overlaps).toBe(false);
});

test("the FAB never overlaps the true bottom of the page (MED-23 AC5 regression)", async ({
  page,
}) => {
  for (const width of [320, 375, 480, 700]) {
    await page.setViewportSize({ width, height: 600 });

    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

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
    const mainBox = await page.locator("main").boundingBox();
    const overlaps =
      fabBox.x < mainBox.x + mainBox.width &&
      fabBox.x + fabBox.width > mainBox.x &&
      fabBox.y < mainBox.y + mainBox.height &&
      fabBox.y + fabBox.height > mainBox.y;
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
  await deleteButton.focus();
  await expect(deleteButton).toBeFocused();
});

test("shows the Delete control on a Cooldown medication too, not just Active (MED-12 AC1)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();

  await expect(page.locator(".medication-item")).toHaveClass(/cooldown/);
  await expect(page.getByRole("button", { name: "Delete Aspirin" })).toBeVisible();
});

test("activating Delete removes the medication immediately, with no confirmation dialog or intermediate step (MED-12 AC3)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await expectMedicationVisible(page, "Aspirin", "100mg");

  await page.getByRole("button", { name: "Delete Aspirin" }).click();

  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expectMedicationHidden(page, "Aspirin");
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

  await expectMedicationHidden(page, "Aspirin");
  await expectMedicationVisible(page, "Ibuprofen", "200mg");
});

test("shows an inline error and leaves the row in place when the localStorage write fails on Delete (MED-12 review)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  await page.evaluate(() => {
    window.localStorage.setItem = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
  });

  await page.getByRole("button", { name: "Delete Aspirin" }).click();

  await expect(page.getByRole("alert").last()).toHaveText(
    "Could not delete — please try again."
  );
  await expectMedicationVisible(page, "Aspirin", "100mg");
  await expect(page.getByRole("button", { name: "Delete Aspirin" })).toBeVisible();
});

test("deleting a medication that is currently in Cooldown discards its countdown/timestamp data with no special-casing vs. deleting an Active one (MED-12 AC6)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });
  await cardTapTarget(page, "Aspirin").click();
  await expect(page.locator(".medication-item")).toHaveClass(/cooldown/);

  await page.getByRole("button", { name: "Delete Aspirin" }).click();

  await expectMedicationHidden(page, "Aspirin");
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

  await cardTapTarget(page, "Paracetamol").click();
  await expect(cardTapTarget(page, "Paracetamol")).toHaveAccessibleName(
    "Cancel Paracetamol cooldown"
  );

  await page.getByRole("button", { name: "Delete Aspirin" }).click();

  await expectMedicationHidden(page, "Aspirin");
  await expectMedicationVisible(page, "Ibuprofen", "200mg");
  await expectMedicationVisible(page, "Paracetamol", "500mg");
  await expect(cardTapTarget(page, "Ibuprofen")).toHaveAccessibleName("Log Ibuprofen dose now");
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

  await addMedicationViaUi(page, { name: "Ibuprofen", dose: "200mg", interval: "6" });
  await expectMedicationVisible(page, "Ibuprofen", "200mg");
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

  await expectMedicationHidden(page, "Aspirin");
  await expectMedicationVisible(page, "Ibuprofen", "200mg");

  const deleteIbuprofen = page.getByRole("button", { name: "Delete Ibuprofen" });
  await deleteIbuprofen.focus();
  await expect(deleteIbuprofen).toBeFocused();
  await page.keyboard.press(" ");

  await expectMedicationHidden(page, "Ibuprofen");
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

  await expectMedicationHidden(page, "Ibuprofen");
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

  await expectMedicationHidden(page, "Ibuprofen");
  await expect(page.getByRole("button", { name: "Delete Aspirin" })).toBeFocused();
});

test("keyboard focus moves to the Add-medication trigger after deleting the last remaining medication (MED-12 AC8, genuine empty-state case)", async ({
  page,
}) => {
  await addMedicationViaUi(page, { name: "Aspirin", dose: "100mg", interval: "8" });

  const addTrigger = page.locator("#add-medication-fab");

  const deleteButton = page.getByRole("button", { name: "Delete Aspirin" });
  await deleteButton.focus();
  await expect(deleteButton).toBeFocused();
  await deleteButton.click();

  await expectMedicationHidden(page, "Aspirin");
  await expect(addTrigger).toBeFocused();
});
