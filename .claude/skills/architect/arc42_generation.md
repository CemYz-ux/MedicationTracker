---
name: architect-arc42-generation
description: >
  Guides the Architect in generating the arc42 architecture section for a PBI before
  it is handed to the Developer. The arc42 output tells the Developer what to build,
  how to structure it, which conventions to follow, and what risks to watch for.
  Use after the PO has incorporated all Architect feedback and the PBI is cleared.
---

# Architect Skill: arc42 Generation for PBIs

## Purpose
The arc42 section generated here is not a full system architecture document — it is a **targeted architectural brief** for a specific PBI. It tells the Developer exactly how this feature fits into the project's existing structure, which patterns to follow, and what to watch out for.

It is delivered alongside the PBI to the Developer. Together, the PBI (what to build) and the arc42 section (how to build it architecturally) give the Developer everything needed to start implementation.

This project has no backend — everything runs client-side as static HTML/CSS/JS hosted on GitHub Pages. The system-level arc42 document lives at `architecture/arc42.md`; per-PBI briefs generated here are committed to `architecture/pbis/`.

## What to Generate per PBI

Not all sections are relevant for every PBI. Generate the sections that are non-obvious for this specific change. Always include sections 1, 3, and 9.

---

### Section 1 — Context for This PBI
- Which part of the site does this PBI affect (a specific page/view, a shared module, or cross-cutting)?
- What is the single-sentence description of what this feature adds?
- Which external systems are touched, if any? (Most PBIs touch none — this is a static site. If a PBI calls an external public API, name it explicitly.)

---

### Section 3 — Scope & Boundaries
- What does this PBI touch? (`index.html`, specific `js/` modules, specific `css/` files, `localStorage`/`IndexedDB` schema)
- What does it explicitly NOT touch?
- Does it introduce a new `localStorage`/`IndexedDB` key or change the shape of existing stored data? If so, is a migration/backward-compatibility note needed for users with existing stored data?
- Does it introduce a new npm dependency? If so, justify why vanilla JS/CSS/HTML isn't sufficient.

**For any client-side "data contract" (the shape of data read/written to storage), document:**
```
Storage key: <key>
Shape: { field: type, ... }
Written by: <module/function>
Read by: <module/function>
Migration needed from prior shape? <yes/no — describe>
```

---

### Section 5 — Building Block View (What to Build)
Describe only the parts affected by this PBI:

- New or modified **pure logic modules** (e.g. `js/medications.js`) — no DOM access, unit-testable with Vitest. What functions, what inputs/outputs?
- New or modified **DOM-wiring modules** (e.g. `js/app.js`) — event listeners, rendering, calls into the pure logic modules
- New or modified markup in `index.html` (or a new page, if this is a multi-page site)
- New or modified styles in `css/`
- Changes to the Playwright E2E suite (`tests/e2e/`) — which new flow needs coverage?

---

### Section 6 — Runtime Flow (Key Scenario)
Describe the primary happy-path runtime flow for this PBI as a sequence:

```
1. User action in the browser (click, form submit, page load)
2. Event handler in the DOM-wiring module runs
3. Handler calls into the pure logic module (validation / transform / storage read-write)
4. Pure logic module reads/writes localStorage (or IndexedDB)
5. DOM-wiring module re-renders the affected part of the page
```

Also describe the **error flow** if non-trivial (e.g., invalid input, corrupted/missing stored data on first run).

---

### Section 8 — Cross-Cutting Concerns (if applicable)
Only include what is relevant for this PBI:

- **GitHub Pages constraints:** Any new asset or link must use relative paths or respect the repo's Pages base path — no root-absolute paths, no server-side redirects assumed.
- **Accessibility:** New interactive elements must be keyboard-operable with visible focus and proper labels.
- **Storage schema evolution:** If existing stored data must be read under a new shape, state the migration/fallback behavior explicitly.
- **No secrets:** This is a public static site — never introduce anything that requires a secret or private API key at runtime.

---

### Section 9 — Decisions & Conventions for This PBI
State explicitly which existing conventions apply and any new decisions made:

```markdown
## Decision: [Title]
Context: [Why this decision was needed]
Decision: [What was decided]
Convention to follow: [The specific pattern the Developer should replicate]
```

Example:
```markdown
## Decision: Medication records store dose as a string, not a number
Context: Doses may include units ("500mg") that don't fit a plain numeric field.
Decision: Store `dose` as a free-text string; validate non-empty, don't attempt numeric parsing.
Convention to follow: Follow the same free-text pattern for any future medication field with mixed units.
```

---

### Section 11 — Risks & Watch-Outs for the Developer
List specific risks the Developer should be aware of during implementation:

- First-run/empty-storage handling: `localStorage.getItem(...)` returning `null` must be handled gracefully, not treated as an error
- Corrupted stored JSON (e.g. from a prior schema) should not crash the page on load
- GitHub Pages base-path mismatches between local dev and the deployed URL
- [Any PBI-specific risks identified during the review]

---

## arc42 Output Format

Deliver the arc42 section as a Markdown document titled:

```
arc42 — [PBI Title]
```

Store it alongside the PBI (attach to the work item) and commit it to `architecture/pbis/<PBI-key>-<short-slug>.md`.

The Developer will use this document alongside the PBI's Acceptance Criteria to drive implementation.
