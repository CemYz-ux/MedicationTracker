# arc42 Architecture — MedicationTracker

## 1. Introduction and Goals
MedicationTracker is a very simple static webpage that lets a user log medications (name, dose, time) and see them in a list. It has no backend — all data lives in the browser via `localStorage`.

**Quality goals:**
1. Simplicity — no framework, no build step, easy to reason about
2. Testability — pure logic is Vitest-tested, user flows are Playwright-tested
3. Accessibility — usable via keyboard and screen readers

**Stakeholders:** end user (person logging their medications), product owner, solo developer.

## 2. Constraints
- Must be hostable on GitHub Pages (static files only, no server runtime)
- No backend, no database, no authentication
- npm is used only for dev/test tooling (Vitest, Playwright, a static dev server) — not for a runtime framework

## 3. Context and Scope
```
[Browser] --loads--> [index.html, css/, js/] --served by--> [GitHub Pages]
[Browser] <--reads/writes--> [localStorage]  (client-side only, no network call)
```
No external systems are involved beyond the browser's own storage.

## 4. Solution Strategy
- Plain HTML5 + CSS3 + ES module JavaScript
- Business logic (`js/medications.js`) is a pure, DOM-free module: easy to unit test with Vitest
- DOM wiring (`js/app.js`) is a thin layer that reads/writes via the pure module and re-renders the page
- `localStorage` is the single source of truth for persisted data
- Playwright drives the real page in a browser for end-to-end verification

## 5. Building Block View
- `index.html` — page structure: add-medication form, medication list, empty state
- `css/styles.css` — layout and visual styling
- `js/medications.js` — pure logic: load/save/add/remove/validate medications
- `js/app.js` — DOM wiring: form submission, rendering, delete handling

## 6. Runtime View

**Add a medication:**
1. User fills the form and submits
2. `app.js` calls `addMedication` from `medications.js`, which validates the input
3. On success, the updated list is saved to `localStorage` and the page re-renders
4. On failure, a validation message is shown inline (`role="alert"`)

**Remove a medication:**
1. User clicks "Remove" next to an entry
2. `app.js` calls `removeMedication`, saves the updated list, and re-renders

## 7. Deployment View
- Source files are served directly by a local static server (`npm run dev`) for development — no build step
- On push to `main`, GitHub Actions runs the Vitest and Playwright suites, then copies `index.html`, `css/`, `js/` into a `dist/` artifact and deploys it to GitHub Pages

## 8. Cross-cutting Concepts
- **Accessibility:** semantic HTML, labeled inputs, keyboard operability, visible focus states
- **Error handling:** `localStorage` reads are defensive — malformed/missing data never crashes the page, it falls back to an empty list
- **No secrets:** the site is fully public; nothing here should ever require an API key or credential

## 9. Architectural Decisions (ADRs)
See `architecture/decisions/`.

## 10. Risks and Technical Debt
- `localStorage` has no cross-device sync — a known, accepted limitation of this stack
- No automated accessibility audit tool wired into CI yet — currently relies on manual review during code review and QA
