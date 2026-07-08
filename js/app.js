import {
  loadMedications,
  saveMedications,
  addMedication,
  removeMedication,
} from "./medications.js";

const form = document.getElementById("medication-form");
const nameInput = document.getElementById("med-name");
const doseInput = document.getElementById("med-dose");
const timeInput = document.getElementById("med-time");
const list = document.getElementById("medication-list");
const emptyState = document.getElementById("empty-state");
const errorEl = document.getElementById("form-error");

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
    const item = document.createElement("li");
    item.className = "medication-item";

    const info = document.createElement("span");
    info.textContent = `${medication.name} — ${medication.dose} at ${medication.time}`;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.setAttribute("aria-label", `Remove ${medication.name}`);
    removeBtn.addEventListener("click", () => {
      medications = removeMedication(medications, medication.id);
      saveMedications(medications, window.localStorage);
      render();
    });

    item.append(info, removeBtn);
    list.append(item);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  try {
    medications = addMedication(medications, {
      name: nameInput.value,
      dose: doseInput.value,
      time: timeInput.value,
    });
    saveMedications(medications, window.localStorage);
    form.reset();
    nameInput.focus();
    render();
  } catch (error) {
    errorEl.textContent = error.message;
  }
});

render();
