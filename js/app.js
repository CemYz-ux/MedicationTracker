import {
  loadMedications,
  saveMedications,
  addMedication,
  updateMedicationInterval,
  logDose,
} from "./medications.js";

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

function render() {
  list.innerHTML = "";

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

function renderMedicationItem(medication) {
  const item = document.createElement("li");
  item.className = "medication-item";

  const info = document.createElement("span");
  info.className = "medication-info";
  info.textContent = `${medication.name} — ${medication.dose}`;

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

  // MED-7 scope only: pressing GO records `lastTakenAt` and disables this
  // button so it can't be pressed again. It intentionally does not compute
  // or display a countdown/remaining-time (MED-8) and does not re-enable
  // once an interval elapses (MED-9) — "has lastTakenAt been set" is the
  // entire disabled-state rule for this story.
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
  setGoButtonDisabled(goButton, Boolean(medication.lastTakenAt));

  const goError = document.createElement("p");
  goError.className = "form-error row-error go-error";
  goError.setAttribute("role", "alert");

  goButton.addEventListener("click", () => {
    if (goButton.getAttribute("aria-disabled") === "true") {
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
      setGoButtonDisabled(goButton, true);
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

  item.append(info, intervalField, goButton, rowError, goError);
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
