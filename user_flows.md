# User Flows — MedicationTracker

Living source of truth for what the site does. Update this file with every feature and bug fix.

## Add a medication
**Status:** Implemented
**Flow:**
1. A circular floating action button (FAB), showing only a bare "+" glyph (accessible name "Add medication" via `aria-label`, mirroring the close control's "×" + `aria-label="Close"` pattern), is fixed to the bottom-right corner of the viewport at all times — on every viewport size, whether the list is empty or full, and regardless of scroll position (MED-23). It is the only control that opens the add-medication form. Its 56x56px touch target is deliberately larger than the app's ~44px baseline (MED-19), being the app's single primary action. The medication list reserves bottom space so the FAB never overlaps the last row of cards.
2. Activating the control (click, or Enter/Space via keyboard) opens a modal dialog (native `<dialog>` + `showModal()`) containing Name, Dose, and Interval (hours) fields.
3. User fills in Name, Dose, and Interval (hours) and submits.
4. If Name, Dose, or Interval is empty, or Interval is non-numeric or not greater than zero, an inline error message is shown inside the modal (`role="alert"`), the modal stays open, and nothing is saved.
5. On a valid submit, the medication is added with `lastTakenAt: null` (GO/cooldown are owned by MED-7/9 and not part of this flow), the modal closes, and the medication appears in "Your medications".
6. The medication and its Name/Dose/Interval persist across page reloads (stored in `localStorage`).
7. The modal can be closed at any time — via its close control, the Cancel button, pressing Escape, or clicking the backdrop — without saving. Every close path discards unsaved input, resets the form, and returns keyboard focus to the FAB.
8. While the modal is open, Tab-based keyboard focus is contained inside it and cannot reach the page behind it.

## View medications
**Status:** Implemented
**Flow:**
1. On page load, previously logged medications are read from `localStorage` and rendered in a list.
2. Each row shows the medication's name, dose, a small Edit (pencil-icon) control (see "Edit a medication's Name and Dosage" below), a status pill, live cooldown countdown text (cooldown-only — see "Cooldown countdown and fill"), an editable Interval (hours) input, and a GO button (see "Log a dose (press GO)" below) — no delete control yet; that belongs to a later story.
3. The status pill is a green "Active" pill when GO is enabled, or an amber "Cooldown" pill when GO is disabled. It reflects the same time-based cooldown check the GO button and countdown text use — no separate logic of its own.
4. If there are no medications (including corrupted/missing stored data), an empty-state message ("No medications yet — add one to get started.") is shown instead of the list.
5. Records left over from the old prototype schema (`{id, name, dose, time}`, no `intervalHours`) are silently discarded on load rather than shown or migrated.
6. The list lays out as a responsive CSS Grid so more medications are visible at once on wider screens (MED-22): a single column below 640px viewport width (pixel-identical to the original single-column layout), 2 columns from 640px up to 999px, and 3 columns from 1000px up. The page's content-width cap grows at those same two breakpoints so no column ever renders narrower than about 16rem, while still staying capped (not stretching edge-to-edge) on ultra-wide monitors. A list shorter than the current column count fills the leftmost cells only and never stretches to fill the empty ones, and a card's own fixed height (see "Cooldown countdown and fill") holds across its row-sharing siblings too — one card changing status never jitters the height of the row it shares with others. The grid uses plain DOM-order auto-placement (no CSS `order`), so visual left-to-right/top-to-bottom reading order always matches keyboard tab order.

## Log a dose (press GO)
**Status:** Implemented
**Flow:**
1. Every medication row shows a GO button, labeled for assistive tech as "GO — log {medication name} taken".
2. Pressing GO (click, or Enter/Space via keyboard) records the current time as that medication's `lastTakenAt`, snapshots the interval that is active at that moment (so a later edit to the interval can't retroactively change this cooldown — see "Cooldown countdown and fill"), and saves both to `localStorage`.
3. Once logged, that medication's GO button becomes disabled (via `aria-disabled`, not the native `disabled` attribute, so keyboard focus is not forcibly moved elsewhere) for as long as it remains in cooldown, and stays disabled across a page reload, since the disabled state is derived from the persisted `lastTakenAt` (+ its snapshotted interval), not in-memory UI state alone. It re-enables once the medication returns to Active — either the interval elapses naturally, or Stop is pressed — see "Cooldown countdown and fill" and "Stop a cooldown early".
4. A screen-reader-only status message ("{medication name} logged.") is announced via a page-level `aria-live="polite"` region when a dose is successfully logged.
5. If saving fails (e.g. storage full/unavailable), an inline error ("Could not log dose — please try again.") is shown next to that row, the GO button stays enabled, and nothing is written to storage — the UI never implies a dose was logged when it wasn't persisted.
6. Logging one medication's dose does not affect any other medication's GO button, timestamp, or interval.

## Edit a medication's Name and Dosage
**Status:** Implemented
**Flow:**
1. Every medication card (Active or Cooldown) shows a small pencil-icon "Edit" control in its header, labeled for assistive tech as "Edit {medication name}" and reachable/operable via keyboard alone (Tab to focus, Enter/Space to activate) — the first per-card secondary-action icon button in the app; there is no delete ("x") control yet to sit alongside it.
2. Activating a card's Edit control opens a modal dialog (native `<dialog>` + `showModal()`) containing only Name and Dose fields, pre-filled with that specific medication's current saved values — never blank, and never another medication's values. This is a separate dialog element from the Add-medication modal (mirrors its markup/CSS classes and interaction pattern, but is not a shared/mode-toggling dialog), and it deliberately has no Interval field — Interval remains editable exclusively via its own existing inline per-card control (see "Edit a medication's interval" below).
3. User changes Name and/or Dose and submits.
4. If Name or Dose is empty, an inline error message is shown inside the modal (`role="alert"`), the modal stays open, and nothing is saved — mirroring the Add-medication modal's own empty-field validation.
5. On a valid submit, only that medication's `name` and `dose` are updated (trimmed) — `intervalHours`, `lastTakenAt`, and the cooldown interval snapshot are all left completely untouched, so editing Name/Dose never disturbs a running cooldown's countdown, status, or card fill (the same discipline "Edit a medication's interval" below already applies to Interval edits). An Active medication stays Active; editing never starts a cooldown. The change is saved to `localStorage` immediately, the modal closes, and the card reflects the new values right away.
6. If saving fails (e.g. storage full/unavailable), an inline error ("Could not save changes — please try again.") is shown inside the modal, the modal stays open, and the card keeps showing the pre-edit values — the UI never implies a change was saved when it wasn't persisted.
7. The modal can be closed at any time — via its close control, the Cancel button, pressing Escape, or clicking the backdrop — without saving. Every close path discards unsaved input and returns keyboard focus to the *specific* card's Edit control that opened it (not a generic default), including after a successful save, even though saving re-renders the entire list.
8. While the modal is open, Tab-based keyboard focus is contained inside it and cannot reach the page behind it (native `<dialog>` modal behavior, same mechanism the Add-medication modal relies on).
9. The edited Name/Dose persist across a page reload.
10. Editing one medication's Name/Dose never affects any other medication's data (name, dose, interval, cooldown state) or display.

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
2. While in cooldown, the card is visually dimmed (amber "Cooldown" pill, tinted border) and shows live countdown text in the form "{remaining} of {total} remaining" (e.g. "3h 12m of 5h remaining"), pinned to the card's bottom-right corner. That corner's space is permanently reserved on every card (Active or Cooldown) so showing/hiding the countdown on GO press never grows or shrinks the card — no layout shift in the list when a card enters or leaves cooldown (MED-18).
3. The card's background fill starts at 100% the instant GO is pressed and recedes from right to left in direct proportion to elapsed time — e.g. at the halfway point of an 8-hour interval, exactly the left half of the card is coloured.
4. A page-wide periodic check re-evaluates every medication's cooldown status roughly every 30 seconds, so the countdown text and fill stay current, and a medication flips back to Active (fill reaching exactly 0% at the same moment) with no reload or user interaction required once its interval elapses. Each medication's refresh is independent — one medication's cooldown state or timing never affects another's.
5. GO is functionally disabled during cooldown: `aria-disabled` reflects the current cooldown state (not native `disabled`, to avoid stealing keyboard focus — see "Log a dose (press GO)"), and the click handler independently re-derives cooldown status from the stored data before logging, so a forced/programmatic click cannot record a new dose while genuinely in cooldown.
6. If the interval is edited while a medication is mid-cooldown, the countdown and fill continue to reflect the interval that was active when GO was pressed, not the newly edited value — the edited value only governs the *next* time GO is pressed.
7. An Active (not-in-cooldown) card shows no fill or countdown text at all — both are cooldown-only.

## Stop a cooldown early
**Status:** Implemented
**Flow:**
1. Every medication row shows a Stop button, but only while that medication is in cooldown — it is hidden entirely (not merely disabled) the rest of the time, since there is nothing to stop while a medication is Active. It is labeled for assistive tech as "Stop — cancel {medication name} cooldown".
2. Pressing Stop (click, or Enter/Space via keyboard) cancels the in-progress cooldown immediately and saves the change to `localStorage`; the click handler independently re-derives cooldown status from the stored data before acting, so a forced/stale click cannot cancel a cooldown that has already ended on its own.
3. Once stopped, the medication returns to Active the same way it would if its interval had simply elapsed naturally (see "Cooldown countdown and fill" above) — green "Active" pill, no countdown text or fill, GO re-enabled. There is no separate "stopped" state: like every other status in this app, what's shown is derived fresh from stored data each time, not tracked as a flag.
4. Keyboard focus moves to the GO button immediately after Stop succeeds, since Stop itself just disappeared from the accessibility tree (mirroring the app's general discipline of never leaving focus on a control that no longer exists).
5. A screen-reader-only status message ("{medication name} cooldown stopped.") is announced via the page-level `aria-live="polite"` region when Stop succeeds.
6. If saving fails (e.g. storage full/unavailable), an inline error ("Could not stop cooldown — please try again.") is shown next to that row, the cooldown is left running, and nothing is written to storage — the UI never implies a cooldown was cancelled when it wasn't persisted (same discipline as GO's storage-failure guard).
7. Stop never changes the medication's Interval (hours) value. A fresh GO press afterward starts a new cooldown using whatever Interval is currently set in the input at that moment — including any edit made after Stop and before that next GO press.
