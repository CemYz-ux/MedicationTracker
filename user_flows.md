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
2. Each row shows the medication's name, dose, a status pill, live cooldown countdown text (cooldown-only — see "Cooldown countdown and fill"), an editable Interval (hours) input, and a GO button (see "Log a dose (press GO)" below) — no delete control yet; that belongs to a later story.
3. The status pill is a green "Active" pill when GO is enabled, or an amber "Cooldown" pill when GO is disabled. It reflects the same time-based cooldown check the GO button and countdown text use — no separate logic of its own.
4. If there are no medications (including corrupted/missing stored data), an empty-state message ("No medications yet — add one to get started.") is shown instead of the list.
5. Records left over from the old prototype schema (`{id, name, dose, time}`, no `intervalHours`) are silently discarded on load rather than shown or migrated.

## Log a dose (press GO)
**Status:** Implemented
**Flow:**
1. Every medication row shows a GO button, labeled for assistive tech as "GO — log {medication name} taken".
2. Pressing GO (click, or Enter/Space via keyboard) records the current time as that medication's `lastTakenAt`, snapshots the interval that is active at that moment (so a later edit to the interval can't retroactively change this cooldown — see "Cooldown countdown and fill"), and saves both to `localStorage`.
3. Once logged, that medication's GO button becomes disabled (via `aria-disabled`, not the native `disabled` attribute, so keyboard focus is not forcibly moved elsewhere) for as long as it remains in cooldown, and stays disabled across a page reload, since the disabled state is derived from the persisted `lastTakenAt` (+ its snapshotted interval), not in-memory UI state alone. It automatically re-enables once the interval elapses — see "Cooldown countdown and fill".
4. A screen-reader-only status message ("{medication name} logged.") is announced via a page-level `aria-live="polite"` region when a dose is successfully logged.
5. If saving fails (e.g. storage full/unavailable), an inline error ("Could not log dose — please try again.") is shown next to that row, the GO button stays enabled, and nothing is written to storage — the UI never implies a dose was logged when it wasn't persisted.
6. Logging one medication's dose does not affect any other medication's GO button, timestamp, or interval.

## Edit a medication's interval
**Status:** Implemented
**Flow:**
1. Every medication row (regardless of state) shows its Interval (hours) value in an editable, labeled input.
2. On change/blur, the new value is validated (numeric, greater than zero) and saved to `localStorage`; only `intervalHours` is updated — every other field, including `lastTakenAt` and the running cooldown's own interval snapshot, is left untouched by the edit.
3. If the new value is non-numeric or not greater than zero, an inline error is shown next to the input, the previously saved value is retained on screen, and nothing invalid is written to `localStorage`.
4. The edited value persists across a page reload.
5. Editing the interval while a medication is mid-cooldown does not disturb that cooldown's countdown or fill — see "Cooldown countdown and fill" below for the mechanism.

## Cooldown countdown and fill
**Status:** Implemented
**Flow:**
1. A medication is "in cooldown" whenever `now < lastTakenAt + (the interval that was active when GO was last pressed)`. This is a live time comparison, not a one-way flag — once that moment passes, the medication automatically becomes Active again.
2. While in cooldown, the card is visually dimmed (amber "Cooldown" pill, tinted border) and shows live countdown text in the form "{remaining} of {total} remaining" (e.g. "3h 12m of 5h remaining") next to the pill.
3. The card's background fill starts at 100% the instant GO is pressed and recedes from right to left in direct proportion to elapsed time — e.g. at the halfway point of an 8-hour interval, exactly the left half of the card is coloured.
4. A page-wide periodic check re-evaluates every medication's cooldown status roughly every 30 seconds, so the countdown text and fill stay current, and a medication flips back to Active (fill reaching exactly 0% at the same moment) with no reload or user interaction required once its interval elapses. Each medication's refresh is independent — one medication's cooldown state or timing never affects another's.
5. GO is functionally disabled during cooldown: `aria-disabled` reflects the current cooldown state (not native `disabled`, to avoid stealing keyboard focus — see "Log a dose (press GO)"), and the click handler independently re-derives cooldown status from the stored data before logging, so a forced/programmatic click cannot record a new dose while genuinely in cooldown.
6. If the interval is edited while a medication is mid-cooldown, the countdown and fill continue to reflect the interval that was active when GO was pressed, not the newly edited value — the edited value only governs the *next* time GO is pressed.
7. An Active (not-in-cooldown) card shows no fill or countdown text at all — both are cooldown-only.
