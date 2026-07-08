import {
  loadMedications,
  saveMedications,
  addMedication,
  updateMedicationInterval,
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
      intervalRowInput.value = updated.intervalHours;
    } catch (error) {
      rowError.textContent = error.message;
      intervalRowInput.value = medication.intervalHours;
    }
  });

  intervalField.append(intervalLabel, intervalRowInput);
  item.append(info, intervalField, rowError);
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
