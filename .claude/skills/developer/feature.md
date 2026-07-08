---
name: frontend-developer-feature
description: >
  Process for implementing a new feature on the MedicationTracker static webpage.
  Use when the Product Owner hands you a PBI with Acceptance Criteria and an arc42 section
  from the Architect. Covers HTML/CSS/JS implementation, tests (Vitest + Playwright),
  user_flows.md, and README updates.
---

# Developer Skill: Implementing a New Feature

## What You Receive
Before starting, confirm you have both:
1. **The PBI** — User Story + Acceptance Criteria from the Product Owner
2. **The arc42 section** — Architecture brief from the Architect (files/modules to touch, storage data shape, conventions, risks)

If either is missing, request it from the PO before writing any code.

---

## Process

### Step 1 — Green Baseline
Run all tests before touching anything.

```bash
npm install   # first time only
npm test              # Vitest unit tests
npx playwright test   # Playwright E2E tests
```

If the baseline is red, surface that immediately — do not start feature work on a failing suite.

---

### Step 2 — Articulate the Feature
Before writing code, restate in your own words:
- What the user does and what they see
- What client-side logic must change (data transform, validation, storage read/write)
- What markup/DOM changes are needed
- Confirm this matches the AC and the arc42 section

Resolve any ambiguity with the PO before proceeding. Post questions on the PBI — do not assume.

---

### Step 3 — Build & Validate

**Branch first:**
```bash
git checkout -b feature/<work-item-id>-<short-description>
```

**Structure — keep logic and DOM separate:**
- `js/<feature>.js` — pure logic: data transforms, validation, `localStorage`/`IndexedDB` read/write. No DOM access. This is what Vitest tests directly.
- `js/app.js` (or a feature-specific wiring module) — DOM wiring: event listeners, rendering, calling into the pure logic module.
- `index.html` — semantic markup; add new elements here, wire them up via `id`/`data-*` attributes the JS can select.
- `css/styles.css` (or a feature-specific stylesheet) — styling, responsive layout.

Rules:
- No framework, no bundler, no new npm dependency unless the arc42 section explicitly calls for one
- All interactive elements must be keyboard-operable with visible focus and proper `<label>`s
- Never use `innerHTML`/`outerHTML` with unsanitized/user-provided input — use `textContent` or explicit escaping
- Defensively handle missing/corrupted `localStorage` data (first run, prior schema) — never let it throw uncaught
- Use relative paths for all assets/links so the page works under the GitHub Pages base path

**Validate it works locally before writing tests:**
```bash
npm run dev   # starts a local static server (see package.json)
# Open the printed local URL, exercise the flow manually in a browser
```

---

### Step 4 — Write Tests

Add both layers. Tests are not optional — they are part of the feature.

**Unit tests (Vitest) — pure logic only, no DOM**
```javascript
// tests/unit/<feature>.test.js
// Test the pure logic module directly: happy path, edge cases, malformed input
// Naming: describe('functionName', () => { it('does X when Y', () => {...}) })
```

**E2E (Playwright) — the real user-visible flow**
```javascript
// tests/e2e/<feature>.spec.js
// Drive the actual page: fill the form, click, assert on the rendered DOM
// Clear localStorage state at the start of the test for isolation
```

---

### Step 5 — Run All Tests Again
Everything must be green before handoff.

```bash
npm test
npx playwright test
```

Fix any regressions you introduced. Do not hand off a red suite.

---

### Step 6 — Update `user_flows.md` and `README.md`

**`user_flows.md`** — mandatory for every feature:
- Add or update the flow entry: status, implementation notes, expected behavior
- This is the living source of truth for what the site does — keep it accurate

**`README.md`** — update if:
- Setup or run instructions changed
- A new npm script or dependency was added

---

### Step 7 — Commit & Push

One focused commit: feature code + tests + documentation.

```bash
git add .
git commit -m "feat(#<id>): <short description of what the feature does>"
git push origin feature/<work-item-id>-<short-description>
```

Open a Pull Request and request review from the **code-reviewer**.
Do not hand off to the Tester until the PR is approved and merged to the default branch.

---

## Handoff to Tester

After the PR is merged (and GitHub Pages redeploys):
- Update the PBI status to `Resolved`
- Notify the **qa-acceptance-tester** that the feature is ready for acceptance testing
- Include: the PBI link, the deployed/preview URL, and any test data/localStorage seeding notes
