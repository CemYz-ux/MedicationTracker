# ADR-0001: Static site with no backend

**Date**: 2026-07-08
**Status**: Accepted
**Context**: MedicationTracker needs to be simple to build, run, and host, and hostable for free on GitHub Pages.
**Decision**: Build the app as a static HTML/CSS/JS page with no backend, no database, and no build framework. Persist data client-side via `localStorage`.
**Alternatives Considered**:
- A small backend API + database for cross-device sync — rejected: adds hosting cost/complexity not justified by current scope
- A frontend framework (React/Vue/etc.) — rejected: unnecessary for a page this simple; adds a build step with no clear benefit yet
**Consequences**:
- Positive: zero hosting cost, trivial deploy (GitHub Pages), fast to build and test
- Negative: no cross-device sync, no server-side validation, data is lost if the user clears browser storage
**Related Decisions**: None yet
