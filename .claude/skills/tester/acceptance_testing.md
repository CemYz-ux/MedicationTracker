---
name: qa-acceptance-tester
description: >
  Acceptance testing skill for MedicationTracker. Use when the
  frontend-developer hands off a completed, PR-merged PBI for testing. Validates
  all Acceptance Criteria, runs regression checks, and either approves for PO review
  or returns to the Developer with a precise bug report.
---

# Skill: Acceptance Testing

## What You Receive
- The PBI: User Story + Acceptance Criteria
- Notification from the Developer that the PR is merged and the feature is live (GitHub Pages deploy, or a local preview build)
- Any test data / `localStorage` seeding notes from the Developer

## What You Do NOT Do
- You do not review code — that was the **code-reviewer**'s job
- You do not check test coverage — the Developer and reviewer handled that
- You test the feature from the outside: through the page in a real browser, exactly as a user would

---

## Process

### Step 1 — Prepare
- [ ] Read the full PBI and every Acceptance Criterion
- [ ] Confirm the deployed page (or local preview build) is running and the feature is present
- [ ] Identify what test data you need (e.g. specific medication entries) and how to create it through the UI
- [ ] Note any AC that require specific data state — prepare that state before testing

---

### Step 2 — Validate Each Acceptance Criterion

For every AC, run the exact scenario and record the result:

```
AC #N: [AC text]
Steps: [What you did, from a clean state — clear localStorage/reload if needed]
Expected: [What the AC says should happen]
Actual:   [What actually happened]
Result:   ✅ Pass / ❌ Fail
Evidence: [Screenshot / console output]
```

Test each AC independently — do not assume that passing the happy path means error cases pass too.

**Project specifics to check during AC validation:**
- Data persistence: after creating/editing data, reload the page and confirm the data is still there (localStorage-backed)
- First-run/empty state: clear all storage and confirm the page shows a meaningful empty state, not an error
- GitHub Pages base path: confirm all links/assets resolve correctly on the actual deployed URL, not just localhost
- Accessibility: keyboard-only navigation through the new flow

---

### Step 3 — Regression Check

After validating the new AC, spot-check existing flows:

- [ ] Run through the 3–5 most critical existing flows from `user_flows.md`
- [ ] Confirm nothing that worked before the feature is broken
- [ ] Check adjacent UI elements that weren't changed but sit near the changed area

---

### Step 4 — Edge Case & Negative Testing

Go beyond the documented AC:

| Scenario | What to test |
|----------|-------------|
| Invalid input | Empty required fields, too-long strings, special characters in names |
| Boundary values | Zero/one/many medication entries |
| Double actions | Double-clicking submit, navigating back after submitting a form |
| Corrupted storage | Manually set malformed JSON in `localStorage` for the app's key, reload — page should not crash |
| Reload mid-flow | Reload the page mid-form — confirm no partial/corrupted state is saved |

---

### Step 5 — Accessibility Spot Check (for UI changes)

- [ ] All new interactive elements reachable via keyboard Tab navigation
- [ ] Visible focus states on all interactive elements
- [ ] New form fields have visible labels (not just placeholder text)
- [ ] Error messages are associated with the relevant field (not just shown somewhere on the page)
- [ ] Color is not the only way information is conveyed (e.g., red-only error indicators)

---

### Step 6 — Document Results & Decide

**If all AC pass:**
1. Write a brief test summary.
2. `addCommentToJiraIssue` on the Story with the full test summary (AC results, regression outcome, edge cases checked).
3. `transitionJiraIssue` on the Story — transition to the "Done" or "Ready for PO Review" state (use `getTransitionsForJiraIssue` to confirm the right transition name).
4. Notify the **product-owner** that acceptance testing is complete and the feature is ready for their review.

**If any AC fail:**
For each failing AC:
1. `createJiraIssue` — Bug type — with:
   - `summary`: `[MED-N] Short description of what is wrong`
   - `description`: Steps to reproduce (numbered from clean state), Expected behavior, Actual behavior, Environment (browser/OS), Severity (Critical/High/Medium/Low), Evidence reference
2. `createIssueLink` — link the Bug to the parent Story.
3. After all bugs are created, `addCommentToJiraIssue` on the Story listing all bug keys (e.g., "Found 2 failures: MED-7, MED-8. Returning to developer.").
4. Notify the **frontend-developer** with the Jira bug keys.
5. Do not notify the PO until all bugs are resolved and re-tested.

See `shared/jira.md` for MCP call details and project connection values.

---

## Severity Guide

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | Feature cannot be used at all, data loss, or page crash | Save button does nothing; medication data disappears on reload |
| High | Core AC not met; no reasonable workaround | List shows the wrong medication's data |
| Medium | AC partially met; workaround exists | Error message is too generic; empty state missing |
| Low | Cosmetic or minor UX issue | Label slightly misaligned; tooltip text unclear |

---

## After Bug Resolution

When the Developer fixes a bug and notifies you with the Jira bug key:
1. Re-test the specific failing scenario from scratch.
2. Re-run the regression check on the affected area.
3. **If it passes:** `transitionJiraIssue` on the Bug → Done. `addCommentToJiraIssue` on the Bug — "Verified fixed. Closing." Re-evaluate the parent Story — if all bugs are now resolved, proceed as if all AC passed.
4. **If it still fails:** `addCommentToJiraIssue` on the Bug with new evidence (steps, actual result, screenshot/log). Notify the developer again with the updated bug key.
