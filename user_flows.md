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
2. Each row shows the medication's name, dose, and an editable Interval (hours) input — nothing else (no GO button, cooldown display, or delete control; those belong to later stories).
3. If there are no medications (including corrupted/missing stored data), an empty-state message ("No medications logged yet.") is shown instead of the list.
4. Records left over from the old prototype schema (`{id, name, dose, time}`, no `intervalHours`) are silently discarded on load rather than shown or migrated.

## Edit a medication's interval
**Status:** Implemented
**Flow:**
1. Every medication row (regardless of state) shows its Interval (hours) value in an editable, labeled input.
2. On change/blur, the new value is validated (numeric, greater than zero) and saved to `localStorage`; only `intervalHours` is updated — every other field, including `lastTakenAt`, is left untouched by the edit.
3. If the new value is non-numeric or not greater than zero, an inline error is shown next to the input, the previously saved value is retained on screen, and nothing invalid is written to `localStorage`.
4. The edited value persists across a page reload.
5. Note: because no cooldown/countdown exists yet (that lands with MED-7/MED-9), "editing does not disturb a running cooldown" is only verifiable today via the underlying data invariant (unit-tested); full end-to-end verification is deferred to those stories.
