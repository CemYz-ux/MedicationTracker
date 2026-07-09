# arc42 — MED-5: Add a new medication (name, dosage, interval) + edit interval

> Per-PBI architectural brief for **MED-5** (Epic **MED-1**, Feature link **MED-2**).
> Companion to the PBI's 15 Acceptance Criteria. Read both before implementing.
> Status: cleared for development. Author: solution-architect. Date: 2026-07-08.

## Architect Review Summary (technical_review.md)

**Feasibility: ⚠️ Feasible with caveats.** MED-5 is buildable on the existing static
HTML/CSS/JS + localStorage stack with no new npm dependency and no backend. The caveats are
**scope-boundary**, not technical — see below. No blocking gap exists in the AC themselves, so
this does not loop back to the PO.

**This is a rework, not an additive change.** MED-5 supersedes the prototype's data model and
add-UI. What is kept vs. replaced:

| Current prototype element | Verdict for MED-5 |
|---|---|
| `loadMedications` / `saveMedications` localStorage wrapper + defensive corrupted-data handling | **Keep & extend** — exactly the right pattern. Extend the load-time guard to also drop old-schema records (see Risk 1). |
| Pure-logic / DOM-wiring separation (`medications.js` vs `app.js`) | **Keep** — the core convention. |
| `validateMedication` / `addMedication` / `removeMedication` shape (pure, returns new list, throws readable errors) | **Adapt** — replace the `time` field with `intervalHours`; add numeric validation; add `updateMedicationInterval`. `removeMedication` stays as a function (MED-12 wires it later) but is **not** given UI in MED-5. |
| Flat `time` field (`type="time"`, clock time) | **Remove** — replaced by `intervalHours` (decimal hours). |
| Always-visible inline add form | **Remove** — replaced by a `+ Add medication` trigger + `<dialog>` modal. |
| Existing unit tests asserting `time`; E2E asserting inline form + `Remove` button | **Rewrite / drop** — see Section 9 & Risk 2. |

### Scope boundary — where to draw the line for this pass

MED-5's own AC unavoidably touch **some** list rendering (AC: "the medication appears in Your
medications", persists across reload). But several AC reference states and controls that are
**owned by sibling stories**. Draw the line as follows.

**In scope for MED-5 (build + verify now):**
- The `+ Add medication` trigger (top-center) and the `<dialog>` add-flow: open, valid submit,
  the two invalid-submit cases, close/discard via every path, focus return to trigger, focus
  containment. (AC 1, 2, 4, 5, 7, 8, 9, and the *data* half of AC 3.)
- Data-model migration to `{id, name, dose, intervalHours, lastTakenAt}` with `lastTakenAt: null`
  at creation, persisted across reload. (AC 3, 6.)
- A **minimal** medication row: name, dose, and an **editable interval input** — enough to satisfy
  "appears in Your medications" and the interval-edit AC. (AC 10, 14, 15.)
- The data-layer invariant behind AC 11/12/13: editing `intervalHours` **never** touches
  `lastTakenAt` or status. Build it now as a pure function and unit-test it, so it is already
  correct when MED-7 lands. (AC 11 is verifiable now in its degenerate form: with `lastTakenAt`
  null there is no cooldown to start.)

**Out of scope for MED-5 — do NOT build (belongs to siblings):**
- The **GO button** and press-to-record-timestamp → **MED-7**. AC 3 says "with GO enabled and no
  cooldown"; MED-5 delivers only the *data precondition* (`lastTakenAt: null`), not the GO control.
- **Cooldown** visual state, greying, live countdown text → **MED-7 / MED-9**.
- Proportional right-to-left **card fill** → **MED-8**.
- Per-card **delete "x"** control → **MED-12**.
- Full MED-6 list semantics (its specific empty-state copy, corrupted-data fallback *messaging*) →
  **MED-6**. Keep the existing plain empty-state (`No medications logged yet.`); do not elaborate it.

**Two AC cannot be end-to-end verified inside MED-5 in isolation:** AC 12 and AC 13 describe an
edit *not disturbing a running cooldown countdown* — but no countdown exists until MED-7/MED-9.
Resolution (architect's call, no PO loop-back needed): implement the data invariant now and cover
it with a **Vitest unit test** (`updateMedicationInterval` leaves `lastTakenAt` untouched); **defer
the E2E verification of AC 12/13 to when MED-7/9 exist.** QA must not fail MED-5 for these two being
un-exercisable in isolation — note this explicitly in the QA handoff.

---

## 1. Context for This PBI
- **Affects:** the single-page app — `index.html` structure, `js/app.js` (DOM wiring),
  `js/medications.js` (pure logic), `css/styles.css`, and both test suites.
- **Adds:** a modal-based flow to define a medication (name, dosage strength, decimal-hour interval)
  and an inline control to edit an existing medication's interval at any time; both persisted in
  localStorage.
- **External systems touched:** none. Static site, `localStorage` only (ADR-0001).

---

## 3. Scope & Boundaries

**Touches:** `index.html`, `js/medications.js`, `js/app.js`, `css/styles.css`,
`tests/unit/medications.test.js`, `tests/e2e/app.spec.js`.

**Does NOT touch:** any backend (none exists), no new npm dependency (native `<dialog>` covers the
modal), no new storage key, no GO/cooldown/fill/delete rendering (sibling stories).

### Client-side data contract

```
Storage key: "medications"            (unchanged key; shape changes)
Shape (per record): {
  id:           string   // uuid-ish, unchanged generation logic
  name:         string   // free-text, trimmed, required
  dose:         string   // free-text incl. units e.g. "10mg", trimmed, required
  intervalHours: number  // decimal hours e.g. 4.5, > 0, required   ← replaces `time`
  lastTakenAt:  null     // created null in MED-5; populated by MED-7's GO. Field exists from creation.
}
Written by: medications.js  (addMedication, updateMedicationInterval, saveMedications)
Read by:    medications.js  (loadMedications) → app.js render
Migration from prior shape? YES — see Risk 1. Prototype records were {id,name,dose,time}. They have
  no valid intervalHours; loadMedications must drop them (discard, not migrate — a clock time cannot
  be converted to an interval). Acceptable because the prototype holds no real user data (Epic MED-1
  "Supersedes" note).
```

**New npm dependency?** No. The native `<dialog>` element (validated by the confirmed 2026-07-08
prototype) provides focus trap, Escape-to-close, `::backdrop`, and background inertness without a
library.

---

## 5. Building Block View (What to Build)

### `js/medications.js` — pure logic (Vitest-tested, no DOM)
- **`validateMedication({ name, dose, intervalHours })`** — replace the `time` rule with an
  interval rule: `name` non-empty, `dose` non-empty, `intervalHours` present, numeric, finite,
  `> 0`. Reject non-numeric strings and zero/negative. Keep returning an array of readable messages.
- **Factor out `validateInterval(value)`** (returns error string or `null`) so both add-time and
  edit-time validation share one code path (AC 5 and AC 15 must behave identically).
- **`addMedication(list, { name, dose, intervalHours })`** — build the new record with
  `intervalHours: Number(...)` and `lastTakenAt: null`. Keep: pure, returns a new array, throws a
  readable Error on invalid input, does not mutate input, existing id generation.
- **NEW `updateMedicationInterval(list, id, newIntervalHours)`** — validate the new value; return a
  new list where that record's `intervalHours` is replaced and **every other field — including
  `lastTakenAt` and any future status — is preserved untouched**. This is the AC 11/12/13 invariant.
  Throw / signal a readable error on invalid input so the caller can retain the prior value.
- **`loadMedications(storage)`** — keep the try/catch + array guard; **add** a filter that keeps
  only records with a valid positive numeric `intervalHours` (drops old `time`-only records).
- **`saveMedications`**, **`removeMedication`** — unchanged. `removeMedication` stays exported for
  MED-12; not wired to UI here.

### `js/app.js` — DOM wiring
- Query the `+ Add medication` trigger and the `<dialog>`; open via `dialog.showModal()`.
- **Add-modal submit handler:** `event.preventDefault()`, read name/dose/interval, call
  `addMedication`, `saveMedications`, close the dialog, re-render, focus the trigger. On thrown
  validation error, write the message to the modal's `role="alert"` element and keep the dialog open.
- **Close handlers (all paths):** Cancel button, close "×", `Escape` (native `cancel` event), and
  backdrop click (`<dialog>` does NOT close on backdrop click for free — add a click listener that
  closes when `event.target === dialog`). On any close: reset the form, clear the error, and return
  focus to the trigger (AC 8 — do this explicitly; do not rely solely on the browser default).
- **Render:** for each medication render name, dose, and a labeled editable interval
  `<input type="number" step="any" inputmode="decimal">`. On `change`/blur: read value, call
  `updateMedicationInterval`; on success `saveMedications` + reflect the value; on invalid input show
  an inline error and reset the input to the last-saved value (AC 15 — invalid value is never
  written). Keep the empty-state toggle as-is.
- Remove the old always-visible inline-form wiring.

### `index.html`
- Remove the always-visible add-form `<section>`.
- Add a prominent, top-center `+ Add medication` trigger `<button>`.
- Add `<dialog id="add-medication-dialog" aria-labelledby="...">` containing a `<form>` with Name,
  Dose, Interval (hours) fields, a `role="alert"` error paragraph, and submit / Cancel / close
  controls.
- Keep the "Your medications" section and `#empty-state` (unchanged copy — MED-6 owns any change).

### `css/styles.css`
- Style the top-center trigger, the `dialog` and its `::backdrop`, and the inline interval input in
  a row. Reuse existing tokens (`--border`, `--error`, focus-visible outline). No new palette.

### Tests
- **Vitest** (`tests/unit/medications.test.js`): rewrite `time` tests → `intervalHours`; add tests
  for numeric/positive validation, `updateMedicationInterval` (changes interval, **preserves
  `lastTakenAt`/other fields**, rejects invalid, does not mutate), and load-time discard of
  old-schema records. Keep the corrupted-JSON / non-array tests (still valid).
- **Playwright** (`tests/e2e/app.spec.js`): rewrite for the modal flow — open modal, valid submit
  adds + closes, invalid submit (empty and non-numeric/non-positive interval) keeps modal open with
  alert, persistence across reload, close via Escape/Cancel/backdrop discards + returns focus to
  trigger, focus containment, and editing a row's interval persists across reload. **Drop** the old
  inline-form and `Remove`-button E2E tests (delete is MED-12; not rendered here).

---

## 6. Runtime Flow (Key Scenarios)

**Add a medication (happy path):**
```
1. User activates "+ Add medication" (which had/receives focus)
2. app.js calls dialog.showModal() → native focus trap + ::backdrop engage
3. User fills Name, Dose, Interval (hours) and submits
4. app.js calls addMedication() → validateMedication() passes
5. saveMedications() writes the new {…, intervalHours, lastTakenAt:null} to localStorage
6. dialog.close(); form reset; render() redraws "Your medications"
7. Focus returns to the "+ Add medication" trigger
```
**Add — error flow:** invalid/empty field or non-numeric/non-positive interval → `addMedication`
throws → message shown in the modal's `role="alert"`; dialog stays open; nothing saved.
**Add — close/discard flow:** Cancel / × / Escape (`cancel` event) / backdrop click → form reset,
no save, dialog closes, focus returns to trigger.

**Edit an existing interval:**
```
1. User changes a row's interval input and blurs / commits
2. app.js calls updateMedicationInterval(list, id, newValue)
3. Valid → new list returned with only intervalHours changed (lastTakenAt untouched);
   saveMedications() persists; input reflects the saved value
4. Invalid → inline error shown; input reset to last-saved value; localStorage unchanged
```
Reload at any point re-derives everything from localStorage (state is stored, not in-memory).

---

## 8. Cross-Cutting Concepts
- **GitHub Pages:** no new asset or path; the `<dialog>` lives in `index.html`. Keep all references
  relative — no root-absolute paths.
- **Accessibility (WCAG 2.1 AA):** `<dialog>` labelled via `aria-labelledby`; native focus
  containment + Escape satisfy AC 9/7; explicit focus-return satisfies AC 8; the interval input has
  a visible `<label>`; validation errors use `role="alert"`; preserve the existing visible
  focus-visible outline. Interval editing is fully keyboard-operable.
- **No secrets:** unchanged — fully public static site.
- **Storage schema evolution:** the load-time filter (Risk 1) is the migration/fallback; it must
  never throw.

---

## 9. Decisions & Conventions for This PBI

**Decision: Use the native `<dialog>` element for the add-medication modal**
Context: AC 7/8/9 require focus containment, Escape/backdrop/Cancel close, and focus return.
Decision: Use `dialog.showModal()` rather than a hand-rolled overlay or a library. The confirmed
prototype validated it gives focus trap, Escape, and `::backdrop` for free.
Convention: Reuse `<dialog>` for any future modal. Remember two things are NOT free — backdrop-click
close (add a `target === dialog` handler) and guaranteed focus-return (refocus the trigger explicitly).

**Decision: `intervalHours` is a validated number; `dose` stays free-text**
Context: interval drives future countdown math (MED-7); dose carries mixed units.
Decision: Store `intervalHours` as `Number` (decimal hours, `> 0`); keep `dose` as a trimmed
free-text string (existing pattern). Validate interval numeric-and-positive at both add and edit.
Convention: numeric domain fields are stored/validated as numbers; descriptive fields stay strings.

**Decision: `lastTakenAt` exists from creation as `null`, owned by MED-7**
Context: MED-7 records the GO timestamp; MED-5 must not create a schema MED-7 has to migrate.
Decision: `addMedication` writes `lastTakenAt: null`. MED-5 never reads or writes it thereafter.
Convention: create sibling-owned fields with a neutral default rather than omitting them.

**Decision: Interval edit is inline on the row and never disturbs cooldown state**
Context: AC 10-13 — edit any time (Active or Cooldown) without starting/stopping/restarting a timer.
Decision: `updateMedicationInterval` changes only `intervalHours`; `lastTakenAt`/status are copied
through untouched. The edit takes effect only on a future GO (MED-7).
Convention: interval edits are a pure data change; cooldown recomputation is exclusively GO's job.

**Decision: Rewrite existing tests; drop the Remove-button E2E test**
Context: the data model drops `time`; the UI drops the inline form and (for now) the delete control.
Decision: rewrite the `time`-based unit tests and the inline-form E2E tests around the new
model/modal; delete the `Remove Aspirin` E2E test (delete belongs to MED-12, not rendered here).
Convention: superseding a prototype means updating its tests, not layering new ones on stale asserts.

---

## 11. Risks & Watch-Outs for the Developer

1. **Old-schema localStorage data (TOP RISK).** Existing prototype records are `{id,name,dose,time}`
   with no `intervalHours`. Naively rendering them would show blank/`NaN` intervals or crash the
   row. Mitigation: `loadMedications` filters out records lacking a valid positive numeric
   `intervalHours` (discard, not migrate — a clock time can't become an interval). Acceptable: the
   prototype holds no real user data (Epic "Supersedes" note). The load path must **never throw**.
2. **Tests must be rewritten, not just added.** The current unit tests assert the `time` field and
   the current E2E asserts the inline form + `Remove` button; all of these will fail after the
   rework and must be updated/removed. Dropping the `Remove` E2E test is correct (MED-12 owns
   delete) — not a regression. Budget for this; it is not optional cleanup.
3. **AC 12 & AC 13 are not E2E-verifiable in MED-5 isolation.** No cooldown countdown exists until
   MED-7/9. Cover the invariant with a Vitest unit test on `updateMedicationInterval`
   (`lastTakenAt` unchanged); defer E2E to MED-7/9. Flag this in the QA handoff so MED-5 is not
   failed for it.
4. **Scope-creep guardrail.** The minimal row must stay minimal: name + dose + editable interval
   only. Do NOT add a GO button (MED-7), cooldown/countdown visuals (MED-7/9), card fill (MED-8), or
   a delete "×" (MED-12). Growing the row here is the most likely way this pass bleeds into four
   other stories.
5. **`<dialog>` sharp edges.** Backdrop-click close needs a manual `event.target === dialog`
   handler; the `cancel` event fires on Escape (hook it to reset+refocus); explicitly refocus the
   trigger on every close path rather than trusting default focus return.
6. **Interval input validation must be in JS, not just HTML.** The form is `novalidate` and
   `type="number"`/`min` attributes won't block all invalid submissions; enforce numeric-and-positive
   in `validateInterval` so add and edit reject identically (AC 5 ≡ AC 15).

---

## Follow-up (not part of MED-5 implementation)
The system-level `architecture/arc42.md` still describes the flat `{name, dose, time}` model and the
inline form. Once MED-5 merges, update arc42.md §1/§3/§5 to the `{id,name,dose,intervalHours,
lastTakenAt}` shape and the modal flow. Tracked here so it is not lost.
