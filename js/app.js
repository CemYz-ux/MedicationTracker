import {
  loadMedications,
  saveMedications,
  addMedication,
  updateMedicationInterval,
  updateMedicationDetails,
  validateMedication,
  removeMedication,
  logDose,
  stopCooldown,
  isInCooldown,
  getCooldownProgress,
  formatRemainingLabel,
  formatCurrentDate,
} from "./medications.js";

// How often the periodic re-check re-evaluates every medication's cooldown
// state (countdown text, fill, card aria-label). Dropped from 30s to ~1s in
// MED-29 (product decision, 2026-07-12 ticket comment) so the countdown's
// seconds component genuinely ticks live instead of sitting frozen for up to
// 29s and then jumping. `updateCooldownDisplay` only touches the specific
// card's countdown text and `--progress` custom property — never a full
// list re-render — so the ~30x increase in re-renders/minute per cooldown
// card is cheap at this app's scale (accepted trade-off, MED-29).
const COOLDOWN_TICK_MS = 1_000;

const trigger = document.getElementById("add-medication-fab");
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
const dateHeading = document.getElementById("medication-list-heading");

// MED-17: the Edit modal. One dialog/form, reused for whichever row's Edit
// control was activated — same reuse pattern as the Add dialog above, just
// pre-filled per open() call instead of always starting blank. MED-32 added
// the Interval field (moved out of the card's own inline input, MED-5).
// MED-34 removed the Revert-to-Active control that briefly lived here too —
// tapping a Cooldown card now does the same job (see `handleCardTap`).
const editDialog = document.getElementById("edit-medication-dialog");
const editForm = document.getElementById("edit-medication-form");
const editNameInput = document.getElementById("med-edit-name");
const editDoseInput = document.getElementById("med-edit-dose");
const editIntervalInput = document.getElementById("med-edit-interval");
const editErrorEl = document.getElementById("edit-form-error");
const closeEditDialogBtn = document.getElementById("close-edit-dialog-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");

let medications = loadMedications(window.localStorage);

// The id of the medication currently open in the Edit dialog, `null` when
// closed. Used both by the submit handler (which medication to update) and
// the `close` handler (which row's Edit control focus should return to) —
// looked up fresh from `cooldownRefs` rather than caching the button itself,
// so a save's `render()` (which replaces every row's DOM nodes) can't leave
// that reference dangling on a detached element.
let editingMedicationId = null;

// Per-medication references to the DOM nodes the periodic re-check and the
// various row-level handlers need to touch (the card, its tap-target,
// countdown text, interval-stat numeral, and the icon buttons/error
// paragraphs). Populated on every full `render()` and read by
// `runCooldownTick()`, kept separate from `medications` itself so the tick
// never has to rebuild the list — that would blow away keyboard focus
// elsewhere on the page every second.
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

// Reflects cooldown state via the card's background-tint/border-color
// classes only — green "active" or amber "cooldown". MED-33 removed the
// status-pill text/dot that used to accompany these classes (judged
// sufficient to signal state on its own, per AC2); MED-34 removed the third
// amber "Paused" sub-state (MED-32) before that.
function setCardStatus(item, inCooldown) {
  item.classList.toggle("active", !inCooldown);
  item.classList.toggle("cooldown", inCooldown);
}

// The card's tap-target accessible name doubles as the description of what
// the *next* tap will do — mirrors GO/Stop's own per-row aria-label
// discipline (a unique accessible name per row identifying the medication,
// not just a bare action word). MED-34: back to the two-state model (Active
// tap logs a dose, Cooldown tap cancels and reverts to Active) — no more
// "Resume" wording for the removed Paused state.
function tapTargetLabel(medication, inCooldown) {
  if (inCooldown) return `Cancel ${medication.name} cooldown`;
  return `Log ${medication.name} dose now`;
}

// Re-derives and applies everything cooldown-related for one medication: the
// tap-target's aria-label, the card's active/cooldown tint, the top-left
// countdown text, the always-visible interval-stat numeral, and the card's
// proportional fill (`--progress`). Called immediately after a tap or Reset
// (so the card reflects the new state right away) and from the periodic tick
// (so it stays current without a reload). Never touches any other
// medication's row, keeping refresh cycles independent.
function updateCooldownDisplay(medication, refs, now = Date.now()) {
  const { item, cardTapTarget, countdownEl, intervalValueEl } = refs;
  const inCooldown = isInCooldown(medication, now);

  setCardStatus(item, inCooldown);
  cardTapTarget.setAttribute("aria-label", tapTargetLabel(medication, inCooldown));
  // MED-33/MED-34: always-visible "how often" stat — reflects the
  // medication's live `intervalHours`, not the cooldown-snapshotted
  // `cooldownIntervalHours` the countdown text's total used to read — so it
  // stays correct in both Active and Cooldown states, including right after
  // an Edit-dialog interval change.
  intervalValueEl.textContent = String(medication.intervalHours);

  if (inCooldown) {
    // MED-33: the shorter "{remaining} left" wording, relocated to the top
    // strip's left side — supersedes `formatCountdown`'s longer "of {total}
    // remaining" phrasing at this position (see `formatRemainingLabel`).
    countdownEl.textContent = formatRemainingLabel(medication, now);
    countdownEl.classList.remove("is-hidden");
    const progressPercent = getCooldownProgress(medication, now) * 100;
    item.style.setProperty("--progress", `${progressPercent}%`);
  } else {
    countdownEl.textContent = "";
    // MED-33: `.is-hidden` toggles `visibility`, not `display` — this
    // element is now in normal flow (not absolutely positioned), so hiding
    // it via `display: none` (the old `hidden` attribute) would collapse
    // its reserved height and change the card's total height across
    // Active<->Cooldown, which MED-18/MED-33 both require to stay constant.
    countdownEl.classList.add("is-hidden");
    // Active cards show no fill at all — don't leave a stray inline
    // `--progress` value sitting on the element once cooldown ends.
    item.style.removeProperty("--progress");
  }
}

// Periodic re-check: re-evaluates every medication's cooldown status so the
// countdown/fill stay live and a medication automatically flips back to
// Active once its interval elapses, with no reload or user action
// (MED-9/MED-10's guarantee).
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

// MED-32 introduced tap-to-toggle; MED-34 reverted its three-state (Active/
// Cooldown/Paused) behavior back to two states: tapping an Active card logs
// a dose and starts Cooldown, tapping a Cooldown card immediately cancels it
// and reverts to Active (the same outcome the old pre-MED-32 Stop button, and
// then MED-32's "Revert to Active" dialog control, produced — reusing
// `stopCooldown` unchanged rather than reimplementing it). Decided fresh from
// `medications` (not the DOM) every time, mirroring GO/Stop's own
// re-derive-before-acting discipline against a forced/stale invocation.
// Same storage-failure discipline as every other mutating action in this
// app: if `saveMedications` throws, `medications` and the displayed state
// are left untouched and an inline error is shown instead.
function handleCardTap(id, refs) {
  const current = medications.find((medication) => medication.id === id);
  if (!current) return;

  const now = Date.now();
  let updated;
  let announcement;
  if (isInCooldown(current, now)) {
    updated = stopCooldown(medications, id, now);
    announcement = `${current.name} reverted to Active.`;
  } else {
    updated = logDose(medications, id, now);
    announcement = `${current.name} logged.`;
  }

  try {
    saveMedications(updated, window.localStorage);
  } catch {
    refs.tapError.textContent = "Could not update — please try again.";
    return;
  }

  medications = updated;
  refs.tapError.textContent = "";
  const justUpdated = medications.find((medication) => medication.id === id);
  // Refresh immediately rather than waiting for the next periodic tick, so
  // the card reflects the new state at the same moment it's tapped, not up
  // to a second later.
  updateCooldownDisplay(justUpdated, refs, now);
  // Don't rely on any implicit "focus stays put" behavior — explicitly
  // reassert focus here so it deterministically stays on this card on every
  // platform (mirrors GO/Stop's own explicit `.focus()` discipline).
  refs.cardTapTarget.focus();
  statusAnnouncer.textContent = announcement;
}

// MED-32: Reset always starts a brand-new full-length cooldown right now,
// from either state (Active or Cooldown) — the same overwrite a fresh
// tap-on-Active performs, via the same `logDose`. Unlike `handleCardTap`,
// there is deliberately no `isInCooldown` guard here at all: Reset is
// unconditional by design (AC4).
function handleReset(medication, refs) {
  const updated = logDose(medications, medication.id, Date.now());

  try {
    saveMedications(updated, window.localStorage);
  } catch {
    refs.resetError.textContent = "Could not reset — please try again.";
    return;
  }

  medications = updated;
  refs.resetError.textContent = "";
  const justReset = medications.find((entry) => entry.id === medication.id);
  updateCooldownDisplay(justReset, refs);
  refs.resetButton.focus();
  statusAnnouncer.textContent = `${medication.name} cooldown reset.`;
}

function renderMedicationItem(medication) {
  const item = document.createElement("li");
  item.className = "medication-item";

  // MED-32: the whole-card tap-to-toggle target. Deliberately a *sibling* of
  // `.header-actions` below, not its ancestor — Edit/Delete/Reset are real
  // `<button>` elements, and nesting interactive controls inside a
  // `role="button"` container is an accessibility anti-pattern (ambiguous or
  // duplicate activation when focus is actually on a nested control, and
  // inconsistent exposure of the nested controls across assistive tech).
  // Keeping them as siblings instead of descendants means a click or keydown
  // originating on Edit/Delete/Reset structurally never bubbles through this
  // element at all (DOM event bubbling only traverses ancestors) — no
  // `stopPropagation()` calls needed anywhere to keep the two interactions
  // from colliding.
  const cardTapTarget = document.createElement("div");
  cardTapTarget.className = "card-tap-target";
  cardTapTarget.setAttribute("role", "button");
  cardTapTarget.tabIndex = 0;

  // MED-33: top-left countdown text, now a normal in-flow child of
  // `cardTapTarget` (not absolutely positioned like the old bottom-right
  // version) so it shares a visual top strip with `.header-actions` below.
  // Its space is always reserved (`.cooldown-countdown`'s `min-height` in
  // CSS) and toggled via the `is-hidden` class rather than removed/hidden
  // outright, so appearing/disappearing across Active<->Cooldown never
  // changes the card's height (see `updateCooldownDisplay`).
  const countdownEl = document.createElement("p");
  countdownEl.className = "cooldown-countdown";
  countdownEl.classList.add("is-hidden");

  const nameEl = document.createElement("span");
  nameEl.className = "medication-name";
  nameEl.textContent = medication.name;

  const doseEl = document.createElement("span");
  doseEl.className = "medication-dose";
  doseEl.textContent = medication.dose;

  // MED-33: name above dose, stacked (replaces the old single-line
  // "Name — Dose" text), per the reference screenshot.
  const titleGroup = document.createElement("div");
  titleGroup.className = "medication-title";
  titleGroup.append(nameEl, doseEl);

  // MED-33: the compact "how often" stat — a large numeral plus a small
  // uppercase caption — replacing MED-34's plain-text `.medication-interval`
  // label ("Every 8h"). Always visible in both Active and Cooldown states
  // (unlike the Cooldown-only countdown text above), reflecting the
  // medication's live `intervalHours` (see `updateCooldownDisplay`).
  const intervalValueEl = document.createElement("span");
  intervalValueEl.className = "medication-interval-value";

  const intervalCaptionEl = document.createElement("span");
  intervalCaptionEl.className = "medication-interval-caption";
  intervalCaptionEl.textContent = "hours";

  const intervalStat = document.createElement("div");
  intervalStat.className = "medication-interval-stat";
  intervalStat.append(intervalValueEl, intervalCaptionEl);

  const body = document.createElement("div");
  body.className = "medication-body";
  body.append(titleGroup, intervalStat);

  cardTapTarget.append(countdownEl, body);

  // MED-17: per-card Edit trigger. Accessible name identifies the medication,
  // not just "Edit" (mirrors the tap-target's own per-row aria-label
  // discipline), and it's a plain <button> so it's keyboard-reachable/
  // operable for free.
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "icon-btn edit";
  editButton.textContent = "✎";
  editButton.setAttribute("aria-label", `Edit ${medication.name}`);
  // Looks up the *current* medication by id rather than closing over the
  // `medication` parameter this row was rendered with: `render()` isn't the
  // only thing that changes a medication's state now (MED-32) — tapping the
  // card to log/cancel, or Reset, mutate `medications` in place without a
  // full re-render, which would otherwise leave this closure pointing at a
  // stale snapshot. That staleness didn't matter for MED-17 (Name/Dose don't
  // change outside of `render()`), but does now: Interval's prefill depends
  // on the medication's *current* intervalHours, not its state at the moment
  // this card was last rendered.
  editButton.addEventListener("click", () => {
    const current = medications.find((entry) => entry.id === medication.id) ?? medication;
    openEditDialog(current);
  });

  // MED-12: per-card Delete trigger. Deletes immediately on activation — no
  // confirmation dialog, no undo, both deliberate product decisions (MED-12
  // AC3/AC4).
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "icon-btn delete";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", `Delete ${medication.name}`);
  deleteButton.addEventListener("click", () => handleDelete(medication));

  // MED-32: per-card Reset trigger — starts a brand-new full-length cooldown
  // right now from either state. Always visible/enabled (unlike the old Stop
  // button, which only showed up during cooldown): Reset is meaningful from
  // Active too, per AC4.
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "icon-btn reset";
  resetButton.textContent = "↻";
  resetButton.setAttribute("aria-label", `Reset ${medication.name} cooldown`);

  const headerActions = document.createElement("div");
  headerActions.className = "header-actions";
  headerActions.append(editButton, deleteButton, resetButton);

  // Inline error surfaces, one per action that can fail on a storage write —
  // mirrors GO/Stop/Edit/Delete's existing per-row `role="alert"` pattern.
  const tapError = document.createElement("p");
  tapError.className = "form-error row-error tap-error";
  tapError.setAttribute("role", "alert");

  const resetError = document.createElement("p");
  resetError.className = "form-error row-error reset-error";
  resetError.setAttribute("role", "alert");

  const deleteError = document.createElement("p");
  deleteError.className = "form-error row-error delete-error";
  deleteError.setAttribute("role", "alert");

  const refs = {
    item,
    cardTapTarget,
    countdownEl,
    intervalValueEl,
    editButton,
    deleteButton,
    resetButton,
    tapError,
    resetError,
    deleteError,
  };
  cooldownRefs.set(medication.id, refs);
  updateCooldownDisplay(medication, refs);

  cardTapTarget.addEventListener("click", () => handleCardTap(medication.id, refs));
  cardTapTarget.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    // Belt-and-braces guard, not strictly reachable given the sibling
    // structure above (Edit/Delete/Reset can't bubble a keydown up through
    // an element they aren't descendants of) — kept anyway so this handler
    // never fires for anything other than a keypress that genuinely
    // targeted the tap-target itself.
    if (event.target !== cardTapTarget) return;
    // Space's default action is to scroll the page when focus isn't on a
    // native form control — this is a custom `role="button"`, so that
    // default has to be suppressed explicitly the way a native <button>
    // already does for free.
    event.preventDefault();
    handleCardTap(medication.id, refs);
  });

  resetButton.addEventListener("click", () => handleReset(medication, refs));

  item.append(cardTapTarget, headerActions, tapError, resetError, deleteError);
  return item;
}

// --- MED-12: delete a medication ----------------------------------------

// Deletes `medication` immediately on activation — no confirmation dialog,
// no undo, both deliberate product decisions (MED-12 AC3/AC4), so unlike
// Edit this control owns no dialog and goes straight from click to
// deletion. Mirrors the storage-failure discipline established elsewhere:
// the in-memory list and the rendered list are only updated after
// `saveMedications` succeeds, so a storage failure never lets the UI imply
// a deletion that wasn't actually persisted. `removeMedication` itself
// filters by id with no branching on cooldown status, so a Cooldown or
// Paused medication's countdown/timestamp data is discarded the same way an
// Active medication's is (AC6), and every other medication is left
// completely untouched (AC7).
function handleDelete(medication) {
  // Reset at the top, before the attempt, like errorEl/editErrorEl's own
  // reset-at-start convention — otherwise a stale error from a previous
  // failed delete of this same row would still be showing right up until
  // (or, on a second failure, indistinguishably alongside) this attempt's
  // own result.
  const staleRefs = cooldownRefs.get(medication.id);
  if (staleRefs) {
    staleRefs.deleteError.textContent = "";
  }

  // Captured before removal: the deleted row's position in the *current*
  // list, used below to pick a focus target that's still near where the
  // user was working, rather than always jumping to the FAB.
  const deletedIndex = medications.findIndex((entry) => entry.id === medication.id);
  const remaining = removeMedication(medications, medication.id);
  try {
    saveMedications(remaining, window.localStorage);
  } catch {
    const refs = cooldownRefs.get(medication.id);
    if (refs) {
      refs.deleteError.textContent = "Could not delete — please try again.";
    }
    return;
  }
  medications = remaining;
  render();

  // Focus goes to whichever row now occupies the deleted row's old spot
  // (the next row, shifted up) — or, if the deleted row was last, to the
  // new last row instead — so a keyboard user working down the list can
  // keep deleting/tabbing from roughly where they were, rather than being
  // sent all the way back to the FAB at the top of the tab order (MED-12
  // review, 2026-07-12). The FAB is only the correct target for the
  // genuine AC8 case: the list is now completely empty and there is no
  // row left to focus.
  if (remaining.length === 0) {
    trigger.focus();
  } else {
    const nextFocusIndex = Math.min(deletedIndex, remaining.length - 1);
    const nextFocusRefs = cooldownRefs.get(remaining[nextFocusIndex].id);
    // Falls back to the FAB only if something unexpected left `cooldownRefs`
    // without an entry for that row — should never happen given `render()`
    // just repopulated it for every surviving medication, but keyboard focus
    // must land *somewhere* deterministic rather than silently falling
    // through to <body>.
    if (nextFocusRefs) {
      nextFocusRefs.deleteButton.focus();
    } else {
      trigger.focus();
    }
  }

  statusAnnouncer.textContent = `${medication.name} deleted.`;
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

// --- MED-17/MED-32: edit a medication's Name, Dose, and Interval --------

function openEditDialog(medication) {
  editingMedicationId = medication.id;
  editErrorEl.textContent = "";
  editNameInput.value = medication.name;
  editDoseInput.value = medication.dose;
  editIntervalInput.value = medication.intervalHours;
  editDialog.showModal();
}

function closeEditDialog() {
  if (editDialog.open) {
    editDialog.close();
  }
}

// Same single-close-handler discipline as the Add dialog: every close path
// (close button, Cancel, Escape, backdrop click, or a successful save) ends
// up here. Focus returns to the *specific* row's Edit button,
// not a generic default — looked up fresh via `cooldownRefs` rather than a
// cached element reference, since a successful save's `render()` (below)
// replaces every row's DOM nodes before this handler runs (the native
// `close` event fires asynchronously, after that synchronous `render()`
// call has already repopulated `cooldownRefs` with the new nodes).
editDialog.addEventListener("close", () => {
  editForm.reset();
  editErrorEl.textContent = "";
  const refs = cooldownRefs.get(editingMedicationId);
  if (refs) {
    refs.editButton.focus();
  }
  editingMedicationId = null;
});

// <dialog> does not close on backdrop click by default; a click that lands
// directly on the dialog element itself (not its content) is a backdrop click.
editDialog.addEventListener("click", (event) => {
  if (event.target === editDialog) {
    closeEditDialog();
  }
});

closeEditDialogBtn.addEventListener("click", closeEditDialog);
cancelEditBtn.addEventListener("click", closeEditDialog);

editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  editErrorEl.textContent = "";

  // Validate Name, Dose, and (MED-32) Interval together before writing
  // anything, exactly like the Add dialog does via the same
  // `validateMedication` — one combined error message, and nothing at all
  // persisted if any field is invalid (rather than partially saving Name/
  // Dose while rejecting an invalid Interval, or vice versa).
  const errors = validateMedication({
    name: editNameInput.value,
    dose: editDoseInput.value,
    intervalHours: editIntervalInput.value,
  });
  if (errors.length > 0) {
    editErrorEl.textContent = errors.join(" ");
    return;
  }

  // Name/Dose and Interval are still two separate, independently-tested
  // pure functions (`updateMedicationDetails`, unchanged since MED-17; and
  // `updateMedicationInterval`, unchanged since MED-5) rather than merged
  // into one. The validation above already guarantees neither should throw
  // here, but they're still called inside their own try/catch rather than
  // assumed infallible — belt-and-braces, not load-bearing for the normal
  // path. Persistence is a separate try/catch below, mirroring this app's
  // established "validation and persistence are separate try/catches"
  // discipline (see the equivalent comment in the pre-MED-32 version of
  // this handler).
  let updated;
  try {
    updated = updateMedicationInterval(
      updateMedicationDetails(medications, editingMedicationId, {
        name: editNameInput.value,
        dose: editDoseInput.value,
      }),
      editingMedicationId,
      editIntervalInput.value
    );
  } catch (error) {
    editErrorEl.textContent = error.message;
    return;
  }

  try {
    saveMedications(updated, window.localStorage);
  } catch {
    editErrorEl.textContent = "Could not save changes — please try again.";
    return;
  }

  medications = updated;
  render();
  closeEditDialog();
});

// Static site, no live-updating clock needed — just today's date as of when
// the page loaded, replacing the old "Your medications" heading.
dateHeading.textContent = formatCurrentDate();

render();
