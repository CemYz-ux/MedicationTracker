---
name: frontend-developer-refactoring
description: >
  Process for refactoring code on the MedicationTracker static webpage.
  Refactoring changes structure, not behavior. Use when improving code quality,
  extracting shared patterns, or preparing the codebase for a new feature.
---

# Developer Skill: Refactoring

Refactoring changes structure, not behavior. The existing tests are your safety net — they must stay green throughout, unchanged in meaning.

---

## Process

### Step 1 — Green Baseline
Do not start refactoring on a red suite.

```bash
npm test
npx playwright test
```

If anything is failing, fix it first or raise it as a bug. Refactoring on a red baseline makes it impossible to distinguish regressions from pre-existing failures.

---

### Step 2 — Perform the Refactor
Change structure, preserve behavior:
- Rename, extract, restructure, simplify — one concern at a time
- Do not mix in feature additions or bug fixes — those get separate commits
- Update tests only where they assert on internal structure that moved — never weaken an assertion to make a failure disappear
- Keep the pure-logic/DOM-wiring separation intact — refactoring must not pull DOM access into a logic module or vice versa

Common refactors in this codebase:
- Extracting a shared validation or formatting helper used by multiple logic modules
- Simplifying a render function that has grown complex
- Extracting a helper for repeated `localStorage` read/write patterns
- Flattening an unnecessary abstraction layer

---

### Step 3 — Build & Validate
After the structural change, run the page locally and confirm all flows described in `user_flows.md` still behave identically:

```bash
npm run dev
# Walk through the flows manually in a browser
```

---

### Step 4 — Run All Tests Again
They must pass with the **same coverage** as before.

```bash
npm test
npx playwright test
```

A refactor that causes tests to fail (and cannot be fixed by updating test structure — not weakening assertions) is not a pure refactor. Stop, assess, and raise the issue before proceeding.

---

### Step 5 — Update Conventions (if the refactor establishes a new pattern)
If the refactor establishes or changes a pattern that should be followed going forward, document it:
- Update `README.md`
- Add a note to `architecture/arc42.md` or create/update an ADR in `architecture/decisions/` if it was a significant architectural decision

---

### Step 6 — Commit & Push

One focused commit describing the structural change:

```bash
git add .
git commit -m "refactor(#<id>): <describe the structural change — not 'cleaned up code'>"
git push origin chore/<work-item-id>-<short-description>
```

Open a Pull Request and request review from the **code-reviewer**.
