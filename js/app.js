import {
  loadMedications,
  saveMedications,
  addMedication,
  updateMedicationInterval,
  logDose,
  stopCooldown,
  isInCooldown,
  getCooldownProgress,
  formatCountdown,
} from "./medications.js";

// How often the periodic re-check re-evaluates every medication's cooldown
// state (countdown text, fill, GO enablement). The AC requires the
// countdown text to refresh at least once a minute and reactivation to
// happen within roughly 30-60s of the actual elapse moment; a 30s cadence
// comfortably satisfies both without excessive DOM churn for a small list.
const COOLDOWN_TICK_MS = 30_000;

const trigger = document.getElementById("add-medication-trigger");
const dialog = document.getElementById("add-medication-dialog");
const form = document.getElementById("add-medication-form");
const nameInput = document.getElementById("med-name");
const doseInput = document.getElementById("med-dose");
const intervalInput = document.getElementById("med-interval");
const errorEl = document.getElementById("form-error");
const closeDialogBtn = document.getElementById("close-dialog-btn");
const cancelBtn = document.getElementById("cancel-add-btn");
const list = document.getElementById("medication-list");
const emptyState = document.getElementById("empty-state");
const statusAnnouncer = document.getElementById("status-announcer");

let medications = loadMedications(window.localStorage);

// Per-medication references to the DOM nodes the periodic re-check needs to
// touch (pill, GO button, countdown text, the card itself for its fill).
// Populated on every full `render()` and read by `runCooldownTick()`, kept
// separate from `medications` itself so the tick never has to rebuild the
// list — that would blow away in-progress input (e.g. an interval edit) or
// keyboard focus elsewhere on the page every 30 seconds.
const cooldownRefs = new Map();

function render() {
  list.innerHTML = "";
  cooldownRefs.clear();

  if (medications.length === 0) {
    emptyState.hidden = false;
    list.hidden = true;
    return;
  }

  emptyState.hidden = true;
  list.hidden = false;

  for (const medication of medications) {
    list.append(renderMedicationItem(medication));
  }
}

// Sets the GO button's disabled-looking state via `aria-disabled` rather
// than the native `disabled` attribute — see the comment where this is
// first called for why.
function setGoButtonDisabled(goButton, isDisabled) {
  goButton.setAttribute("aria-disabled", String(isDisabled));
}

// Reflects cooldown state as a status pill — "Active" when GO is pressable,
// "Cooldown" when it isn't.
function setCardStatus(item, pill, inCooldown) {
  item.classList.toggle("active", !inCooldown);
  item.classList.toggle("cooldown", inCooldown);
  pill.classList.toggle("go", !inCooldown);
  pill.classList.toggle("wait", inCooldown);
  pill.textContent = inCooldown ? "Cooldown" : "Active";
}

// Re-derives and applies everything cooldown-related for one medication:
// GO's functional disabled state, the status pill, the countdown text, and
// the card's proportional fill (`--progress`). Called immediately after GO
// is pressed (so the card reflects 100% fill + countdown right away) and
// from the periodic tick (so it stays current without a reload). Never
// touches any other medication's row, keeping refresh cycles independent.
function updateCooldownDisplay(medication, refs, now = Date.now()) {
  const { item, pill, goButton, countdownEl, stopButton } = refs;
  const inCooldown = isInCooldown(medication, now);

  setGoButtonDisabled(goButton, inCooldown);
  setCardStatus(item, pill, inCooldown);
  // Stop only makes sense while there's a cooldown to cancel (MED-11 AC1) —
  // hidden entirely rather than merely disabled, since "no Stop control is
  // shown" is the literal AC wording (unlike GO, which stays visible but
  // aria-disabled so it never loses keyboard focus while in cooldown).
  stopButton.hidden = !inCooldown;

  if (inCooldown) {
    countdownEl.textContent = formatCountdown(medication, now);
    countdownEl.hidden = false;
    const progressPercent = getCooldownProgress(medication, now) * 100;
    item.style.setProperty("--progress", `${progressPercent}%`);
  } else {
    countdownEl.textContent = "";
    countdownEl.hidden = true;
    // Active cards show no fill at all — don't leave a stray inline
    // `--progress` value sitting on the element once cooldown ends.
    item.style.removeProperty("--progress");
  }
}

// Periodic re-check: re-evaluates every medication's cooldown status so the
// countdown/fill stay live and a medication automatically flips back to
// Active once its interval elapses, with no reload or user action.
function runCooldownTick() {
  const now = Date.now();
  for (const medication of medications) {
    const refs = cooldownRefs.get(medication.id);
    if (refs) {
      updateCooldownDisplay(medication, refs, now);
    }
  }
}

setInterval(runCooldownTick, COOLDOWN_TICK_MS);

function renderMedicationItem(medication) {
  const item = document.createElement("li");
  item.className = "medication-item";

  const header = document.createElement("div");
  header.className = "medication-header";

  const nameEl = document.createElement("span");
  nameEl.className = "medication-name";
  nameEl.textContent = medication.name;

  const doseEl = document.createElement("span");
  doseEl.className = "medication-dose";
  doseEl.textContent = medication.dose;

  header.append(nameEl, " — ", doseEl);

  const pill = document.createElement("span");
  pill.className = "pill";

  const intervalFieldId = `interval-${medication.id}`;

  const intervalField = document.createElement("div");
  intervalField.className = "interval-field";

  const intervalLabel = document.createElement("label");
  intervalLabel.setAttribute("for", intervalFieldId);
  intervalLabel.textContent = "Interval (hours)";

  const intervalRowInput = document.createElement("input");
  intervalRowInput.type = "number";
  intervalRowInput.step = "any";
  intervalRowInput.inputMode = "decimal";
  intervalRowInput.id = intervalFieldId;
  intervalRowInput.value = medication.intervalHours;

  const rowError = document.createElement("p");
  rowError.className = "form-error row-error";
  rowError.setAttribute("role", "alert");

  // Tracks the last successfully saved interval for this row. `medication`
  // is captured once at render time and never updated, so on an invalid
  // edit we must fall back to this instead of `medication.intervalHours` —
  // otherwise a row that was successfully edited once would revert to its
  // original pre-edit value on a later invalid edit, even though the saved
  // value is correct.
  let lastSavedIntervalHours = medication.intervalHours;

  intervalRowInput.addEventListener("change", () => {
    try {
      medications = updateMedicationInterval(
        medications,
        medication.id,
        intervalRowInput.value
      );
      saveMedications(medications, window.localStorage);
      rowError.textContent = "";
      const updated = medications.find((item) => item.id === medication.id);
      lastSavedIntervalHours = updated.intervalHours;
      intervalRowInput.value = lastSavedIntervalHours;
    } catch (error) {
      rowError.textContent = error.message;
      intervalRowInput.value = lastSavedIntervalHours;
    }
  });

  intervalField.append(intervalLabel, intervalRowInput);

  // Pressing GO records `lastTakenAt` (and snapshots the interval that was
  // active at that moment — see `logDose`), which starts a live countdown
  // shown via the pill, `countdownEl`, and the card's `--progress` fill,
  // and disables this button until the interval elapses (MED-8) or is
  // reactivated by a later story.
  const goButton = document.createElement("button");
  goButton.type = "button";
  goButton.className = "go-btn";
  goButton.id = `go-${medication.id}`;
  goButton.textContent = "GO";
  // Wording deliberately avoids the substring "dose" — it would otherwise
  // collide with `getByLabel("Dose")`'s substring match against the
  // add-medication form's Dose field in the Playwright E2E suite.
  goButton.setAttribute("aria-label", `GO — log ${medication.name} taken`);
  // `aria-disabled` (not the native `disabled` attribute) on purpose: making
  // an element natively disabled while it holds keyboard focus forces the
  // browser to move focus elsewhere (observed landing on the unrelated
  // "+ Add medication" trigger), with no announcement to screen readers.
  // aria-disabled keeps the button focusable — the click handler below
  // no-ops instead — so focus simply stays where the user left it.

  const goError = document.createElement("p");
  goError.className = "form-error row-error go-error";
  goError.setAttribute("role", "alert");

  // Pressing Stop cancels an in-progress cooldown immediately and returns
  // the medication to Active (MED-11) — visible only while in cooldown
  // (toggled in `updateCooldownDisplay`), since there's nothing to stop
  // otherwise (AC1).
  const stopButton = document.createElement("button");
  stopButton.type = "button";
  stopButton.className = "btn stop";
  stopButton.id = `stop-${medication.id}`;
  stopButton.textContent = "Stop";
  // Same reasoning as GO's aria-label: a unique accessible name per row
  // (via the medication's name) so Playwright/screen readers can address
  // one specific medication's Stop control among several in the list.
  stopButton.setAttribute("aria-label", `Stop — cancel ${medication.name} cooldown`);

  const stopError = document.createElement("p");
  stopError.className = "form-error row-error stop-error";
  stopError.setAttribute("role", "alert");

  // Live countdown text, e.g. "3h 12m of 5h remaining" — supplementary to
  // the card's fill, never a substitute for it. Hidden entirely outside of
  // cooldown (see `updateCooldownDisplay`).
  const countdownEl = document.createElement("p");
  countdownEl.className = "cooldown-countdown";
  countdownEl.hidden = true;

  const refs = { item, pill, goButton, countdownEl, stopButton };
  cooldownRefs.set(medication.id, refs);
  updateCooldownDisplay(medication, refs);

  goButton.addEventListener("click", () => {
    // Two independent guards, deliberately not just one: `aria-disabled` is
    // the fast, already-rendered check, but the cooldown itself is
    // re-derived from `medications` right here too. That way a forced click
    // (e.g. `dispatchEvent` bypassing Playwright/browser actionability
    // checks) still can't log a new dose while genuinely in cooldown, even
    // if the attribute were ever stale — the rule lives in logic, not just
    // in the disabled styling/attribute.
    const current = medications.find((entry) => entry.id === medication.id);
    if (
      goButton.getAttribute("aria-disabled") === "true" ||
      (current && isInCooldown(current))
    ) {
      return;
    }

    try {
      const updated = logDose(medications, medication.id);
      // If the write fails (e.g. storage full/unavailable), this throws
      // before `medications` or the button's disabled state are touched —
      // the UI must not imply the dose was logged when it wasn't persisted.
      saveMedications(updated, window.localStorage);
      medications = updated;
      goError.textContent = "";
      const justLogged = medications.find((entry) => entry.id === medication.id);
      // Refresh immediately rather than waiting for the next periodic tick,
      // so the card's fill starts at 100% and the countdown appears at the
      // same moment GO is pressed, not up to 30s later.
      updateCooldownDisplay(justLogged, refs);
      // Don't rely on aria-disabled's implicit "focus stays put" behavior —
      // it's a browser/Chromium-version-dependent quirk, not a guarantee.
      // Explicitly reassert focus here so it deterministically stays on
      // (or returns to) this button on every platform.
      goButton.focus();
      statusAnnouncer.textContent = `${medication.name} logged.`;
    } catch {
      goError.textContent = "Could not log dose — please try again.";
    }
  });

  stopButton.addEventListener("click", () => {
    // Same double-guard discipline as GO: Stop is hidden outside of
    // cooldown (see `updateCooldownDisplay`), but a forced/stale invocation
    // is still re-checked against freshly-derived state here rather than
    // trusting the DOM alone.
    const current = medications.find((entry) => entry.id === medication.id);
    if (!current || !isInCooldown(current)) {
      return;
    }

    try {
      const updated = stopCooldown(medications, medication.id);
      // Same storage-failure discipline as GO: if the write throws, this
      // throws before `medications` or any displayed state changes — the UI
      // must not imply the cooldown was cancelled when it wasn't persisted
      // (MED-11 AC5).
      saveMedications(updated, window.localStorage);
      medications = updated;
      stopError.textContent = "";
      const justStopped = medications.find((entry) => entry.id === medication.id);
      updateCooldownDisplay(justStopped, refs);
      // Stop just hid itself and GO just became enabled (MED-11 AC2/AC3) —
      // move focus there explicitly rather than leaving it on a control
      // that no longer exists in the accessibility tree, mirroring GO's own
      // explicit `.focus()` discipline above.
      goButton.focus();
      statusAnnouncer.textContent = `${medication.name} cooldown stopped.`;
    } catch {
      stopError.textContent = "Could not stop cooldown — please try again.";
    }
  });

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(goButton, stopButton);

  item.append(header, pill, countdownEl, intervalField, rowError, actions, goError, stopError);
  return item;
}

function openAddDialog() {
  errorEl.textContent = "";
  dialog.showModal();
}

function closeAddDialog() {
  if (dialog.open) {
    dialog.close();
  }
}

// A single close handler covers every close path (close button, Cancel,
// Escape/native `cancel` event, backdrop click, and a successful submit):
// discard unsaved input and return focus to the trigger that opened it.
// Native `<dialog>` focus-return is not guaranteed, so this is explicit.
dialog.addEventListener("close", () => {
  form.reset();
  errorEl.textContent = "";
  trigger.focus();
});

// <dialog> does not close on backdrop click by default; a click that lands
// directly on the dialog element itself (not its content) is a backdrop click.
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    closeAddDialog();
  }
});

trigger.addEventListener("click", openAddDialog);
closeDialogBtn.addEventListener("click", closeAddDialog);
cancelBtn.addEventListener("click", closeAddDialog);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  try {
    medications = addMedication(medications, {
      name: nameInput.value,
      dose: doseInput.value,
      intervalHours: intervalInput.value,
    });
    saveMedications(medications, window.localStorage);
    render();
    closeAddDialog();
  } catch (error) {
    errorEl.textContent = error.message;
  }
});

render();
