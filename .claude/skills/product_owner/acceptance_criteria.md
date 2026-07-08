---
name: po-acceptance-criteria
description: >
  Guides the Product Owner in writing testable, complete Acceptance Criteria for
  PBIs. Use when creating or refining a User Story before sending it to the Architect.
---

# PO Skill: Acceptance Criteria

## Format

Use Given/When/Then for behavioral criteria:

```
Given [a context or precondition]
When  [the user takes an action]
Then  [the observable outcome]
```

Use a checklist for non-behavioral requirements:
```
- [ ] The API returns a 400 with a descriptive error message when the date field is empty
- [ ] The component renders without error when the list is empty
```

## Minimum Requirements per PBI

- At least **3 Acceptance Criteria**
- At least **1 error / edge case** (invalid input, empty state, network failure)
- Performance or security constraints stated explicitly where relevant

## Project Specifics

When writing AC for MedicationTracker, keep these constraints in mind:

**Static site, no backend:** This is a static HTML/CSS/JS page hosted on GitHub Pages — there is no server, database, or authentication. Data is stored client-side (`localStorage`/`IndexedDB`). Never write an AC that implies a server call, a login system, or cross-device sync unless it's an explicit, PO-approved exception via a public third-party API.

**Data persistence:** If the AC involves saved data (e.g. a logged medication), state the expected persistence behavior explicitly. Example: "after reloading the page, the logged medication is still shown."

**Empty & first-run states:** Since there's no seeded backend data, always consider what a brand-new visitor with no stored data sees. Example: "when no medications have been logged, the page shows an empty-state message instead of a blank list."

**Accessibility:** State WCAG-relevant expectations for new UI explicitly where relevant (keyboard operability, labeled fields).

## Quality Rules

| Rule | Description |
|------|-------------|
| Testable | A tester can verify pass/fail without asking the PO |
| Observable | Describes what the user or API consumer sees, not internal state |
| Bounded | Covers this story only — not future stories |
| Measurable | No vague terms: "fast" → "responds in < 500ms under normal load" |

## Common Mistakes

- AC that describe implementation ("the code calls `localStorage.setItem`") — describe the outcome, not the mechanism
- Missing the error case ("if there are no medications logged, the list is empty and shows a 'No medications yet' message")
- AC that can only be verified by inspecting `localStorage` directly in devtools — the page must surface the outcome observably in the UI

## AC Sign-Off

Once written, AC are reviewed by the Architect (for technical completeness) and the Tester (for testability) during refinement. AC are locked before the sprint — changes during the sprint require explicit PO approval.
