---
name: run
description: Launch and verify MedicationTracker. Use when asked to run, start, or verify the app, or to confirm a change works end-to-end. Covers the local static dev server and the test suites (Vitest unit, Playwright E2E).
---

# Running MedicationTracker

MedicationTracker is a static HTML/CSS/JS webpage with no backend. There is no build step required to view it — a local static file server is enough for development, and the same files are what GitHub Pages serves in production.

## Local dev (recommended default)

```bash
npm install    # first time only
npm run dev    # starts a local static file server, see package.json for the port
```

- Open the printed local URL in a browser.
- Any change to `index.html`, `css/`, or `js/` is picked up on refresh — no build/compile step.
- The page persists its data in `localStorage`, scoped to the origin/port you're viewing it on. Clearing the browser's site data (or opening a private window) gives you a clean slate.

## Running the test suites

**Vitest (unit tests — pure logic, no browser/DOM required)**
```bash
npm test          # single run
npm run test:watch  # watch mode while iterating
```

**Playwright (E2E tests — drives a real browser against the local dev server)**
```bash
npx playwright install   # first time only, downloads browser binaries
npx playwright test
```

Playwright's config starts the dev server automatically for the test run (see `playwright.config.js`) — no need to have `npm run dev` running separately first, though it doesn't hurt.

## Verifying it's healthy

- Dev server up: load the local URL — should render the MedicationTracker page, not a directory listing or connection error.
- Add a medication through the UI, reload the page, and confirm it's still listed — this exercises the `localStorage` persistence path end-to-end.
- `npm test` and `npx playwright test` should both report all green before considering a change verified.

## GitHub Pages deployment

- The site deploys via the GitHub Actions workflow in `.github/workflows/`, triggered on push to the default branch.
- Deployed URL follows the standard GitHub Pages pattern for this repo (`https://<owner>.github.io/<repo>/`) — note the **base path** is the repo name, not `/`. Any root-absolute asset path (`/js/app.js`) will 404 on the deployed site even though it works locally at `localhost:<port>/`. Use relative paths, or verify the deployed URL directly after any path-sensitive change.
