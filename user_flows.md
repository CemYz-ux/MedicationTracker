# User Flows — MedicationTracker

Living source of truth for what the site does. Update this file with every feature and bug fix.

## Add a medication
**Status:** Implemented
**Flow:**
1. A "+ Add medication" control is shown prominently, top-center of the page. No add-medication form is otherwise visible on the list view.
2. Activating the control opens a modal dialog (native `<dialog>` + `showModal()`) containing Name, Dose, and Interval (hours) fields.
3. User fills in Name, Dose, and Interval (hours) and submits.
4. If Name, Dose, or Interval is empty, or Interval is non-numeric or not greater than zero, an inline error message is shown inside the modal (`role="alert"`), the modal stays open, and nothing is saved.
5. On a valid submit, the medication is added with `lastTakenAt: null` (GO/cooldown are owned by MED-7/9 and not part of this flow), the modal closes, and the medication appears in "Your medications".
6. The medication and its Name/Dose/Interval persist across page reloads (stored in `localStorage`).
7. The modal can be closed at any time — via its close control, the Cancel button, pressing Escape, or clicking the backdrop — without saving. Every close path discards unsaved input, resets the form, and returns keyboard focus to the "+ Add medication" trigger.
8. While the modal is open, Tab-based keyboard focus is contained inside it and cannot reach the page behind it.

## View medications
**Status:** Implemented
**Flow:**
1. On page load, previously logged medications are read from `localStorage` and rendered in a list.
2. Each row shows the medication's name, dose, an editable Interval (hours) input, a status pill, and a GO button (see "Log a dose (press GO)" below) — no cooldown countdown or delete control yet; those belong to later stories.
3. The status pill is a green "Active" pill when GO is enabled, or an amber "Cooldown" pill when GO is disabled. It is a visual label only, derived from the same `Boolean(lastTakenAt)` check the GO button already uses — no new logic.
4. If there are no medications (including corrupted/missing stored data), an empty-state message ("No medications yet — add one to get started.") is shown instead of the list.
5. Records left over from the old prototype schema (`{id, name, dose, time}`, no `intervalHours`) are silently discarded on load rather than shown or migrated.

## Log a dose (press GO)
**Status:** Implemented
**Flow:**
1. Every medication row shows a GO button, labeled for assistive tech as "GO — log {medication name} taken".
2. Pressing GO (click, or Enter/Space via keyboard) records the current time as that medication's `lastTakenAt` and saves it to `localStorage`.
3. Once logged, that medication's GO button becomes disabled (via `aria-disabled`, not the native `disabled` attribute, so keyboard focus is not forcibly moved elsewhere) and stays disabled across a page reload, since the disabled state is driven by the persisted `lastTakenAt`, not in-memory UI state alone.
4. A screen-reader-only status message ("{medication name} logged.") is announced via a page-level `aria-live="polite"` region when a dose is successfully logged.
5. If saving fails (e.g. storage full/unavailable), an inline error ("Could not log dose — please try again.") is shown next to that row, the GO button stays enabled, and nothing is written to storage — the UI never implies a dose was logged when it wasn't persisted.
6. Logging one medication's dose does not affect any other medication's GO button, timestamp, or interval.
7. Out of scope for this flow (separate stories): no cooldown/remaining-time countdown display (MED-8) and no automatic re-enabling of the GO button once the interval elapses (MED-9).

## Edit a medication's interval
**Status:** Implemented
**Flow:**
1. Every medication row (regardless of state) shows its Interval (hours) value in an editable, labeled input.
2. On change/blur, the new value is validated (numeric, greater than zero) and saved to `localStorage`; only `intervalHours` is updated — every other field, including `lastTakenAt`, is left untouched by the edit.
3. If the new value is non-numeric or not greater than zero, an inline error is shown next to the input, the previously saved value is retained on screen, and nothing invalid is written to `localStorage`.
4. The edited value persists across a page reload.
5. Note: because no cooldown/countdown exists yet (that lands with MED-7/MED-9), "editing does not disturb a running cooldown" is only verifiable today via the underlying data invariant (unit-tested); full end-to-end verification is deferred to those stories.
