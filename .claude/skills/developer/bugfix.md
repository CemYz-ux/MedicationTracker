---
name: frontend-developer-bugfix
description: >
  Process for fixing a bug on the MedicationTracker static webpage.
  Use when a bug is reported by the Tester, the PO, or found during development.
  Covers root cause analysis, fix, regression test, and documentation.
---

# Developer Skill: Fixing a Bug

## What You Receive
- A bug report linked to a PBI or standalone Bug work item
- Steps to reproduce, expected behavior, actual behavior, and browser/environment details

---

## Process

### Step 1 — Green Baseline
Run all tests before touching anything.

```bash
npm test
npx playwright test
```

If something is already failing, it may be the bug — note it. Do not start fixing on a red suite without understanding what is already failing and why.

---

### Step 2 — Articulate the Bug
Before changing code, state clearly:
- **Steps to reproduce:** exact sequence from a clean state (clear `localStorage`, reload)
- **Expected behavior:** what should happen (cross-reference `user_flows.md`)
- **Actual behavior:** what currently happens
- Confirm you can reproduce it locally before writing a fix

If you cannot reproduce it, report back to the Tester with your environment and what you tried.

---

### Step 3 — Find the Root Cause & Fix

Fix the root cause — do not mask symptoms.

Common root cause locations in this codebase:
- **Malformed/missing `localStorage` data not handled** → the pure logic module's read function
- **Validation gap** → the pure logic module's validation function
- **Stale DOM after a data change** → the DOM-wiring module's render/update function
- **Event listener not firing or firing twice** → listener attached in the wrong place or attached repeatedly on re-render
- **GitHub Pages base-path issue** → an absolute root path (`/foo.js`) instead of a relative one

Follow the module's conventions when fixing — don't introduce new patterns to fix a bug.

Validate by reproducing the original failing scenario and confirming it now behaves correctly:
```bash
npm run dev
# Reproduce the original steps in a browser — confirm correct behavior
```

---

### Step 4 — Write a Regression Test
Add a test that:
- **Fails on the original buggy behavior**
- **Passes with the fix**

At the layer where the bug lived:
- Logic bug (validation, data transform, storage read/write) → Vitest unit test
- User-visible flow bug → Playwright E2E test

---

### Step 5 — Run All Tests Again
Everything green before moving on.

```bash
npm test
npx playwright test
```

---

### Step 6 — Update `user_flows.md` (if needed)
If the bug means a documented flow's expected behavior was wrong or incomplete, correct the entry in `user_flows.md`. The fix defines the correct behavior going forward.

---

### Step 7 — Commit & Push

One focused commit: fix + regression test + any documentation correction.

```bash
git add .
git commit -m "fix(#<id>): <short description of what was wrong and what was fixed>"
git push origin bugfix/<work-item-id>-<short-description>
```

Open a Pull Request, request review from the **code-reviewer**, and link the original bug work item.

---

## Handoff Back to Tester
After the PR is merged, notify the **qa-acceptance-tester**:
- What was fixed
- How to verify (the steps that previously failed should now pass)
- The deployed/preview URL
