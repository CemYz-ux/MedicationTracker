# MedicationTracker

A very simple static webpage for logging medications (name, dose, time), hosted on GitHub Pages. No backend — all data is stored in your browser via `localStorage`.

## Stack

- Plain HTML5 / CSS3 / ES module JavaScript — no framework, no build step
- npm for dev/test tooling only: [Vitest](https://vitest.dev) (unit tests) and [Playwright](https://playwright.dev) (E2E tests)
- Deployed to GitHub Pages via GitHub Actions on every push to `main`

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL in your browser.

## Testing

```bash
npm test                # Vitest unit tests (pure logic in js/medications.js)
npx playwright install  # first time only, downloads browser binaries
npm run test:e2e        # Playwright end-to-end tests
```

## Project structure

```
index.html           Page markup
css/styles.css        Styling
js/medications.js     Pure logic: load/save/add/remove/validate medications (Vitest-tested)
js/app.js             DOM wiring: form handling and rendering
tests/unit/           Vitest unit tests
tests/e2e/            Playwright end-to-end tests
architecture/         Arc42 architecture documentation and decisions
user_flows.md         Living source of truth for user-facing behavior
.github/workflows/    CI: test on PR, deploy to GitHub Pages on merge to main
```

## Product & architecture process

This project is developed using a small set of Claude Code subagents (product-owner, solution-architect, frontend-developer, code-reviewer, qa-acceptance-tester) — see `.claude/README.md`. The backlog lives on the "MedicationTracker" Jira Scrum board (project key `MED`). Architecture decisions follow the Arc42 template in `architecture/`.
