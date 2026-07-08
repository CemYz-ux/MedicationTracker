---
name: architect-technical-review
description: >
  Guides the Architect in reviewing PBIs from the Product Owner, providing structured
  technical feedback, and returning improved stories before they reach the Developer.
  Use for every PBI that is submitted for Architect review.
---

# Architect Skill: Technical Review & Feedback

## Role in the Workflow

The Architect sits between the PO and the Developer. When the PO submits a PBI:

1. The Architect reviews it against all dimensions below
2. The Architect returns **written feedback** to the PO (not directly to the Developer)
3. The PO improves the PBI based on that feedback
4. The Architect confirms the improved PBI is sound
5. The Architect generates the arc42 section for this PBI (`arc42_generation.md`)
6. The PO then hands both the improved PBI and the arc42 to the Developer

The Architect does **not** communicate implementation instructions directly to the Developer — that goes through the PBI and the arc42 document.

## Review Dimensions

### 1. Feasibility
Can this be built with a static HTML/CSS/JS page hosted on GitHub Pages, with no backend?

Check:
- Is this achievable without a server, database, or authenticated backend call?
- If the story implies a backend (e.g. "sync across devices", "send an email reminder"), flag it explicitly — that is out of scope for this stack unless the PO explicitly wants to pull in a third-party service via a public client-side API
- Does it require a new npm dependency? Is that justified over plain HTML/CSS/JS?
- Does it fit in one sprint?

Output: `✅ Feasible` / `⚠️ Feasible with caveats (state them)` / `❌ Needs redesign (explain why)`

---

### 2. Missing or Weak Acceptance Criteria
Are the AC specific enough that a Developer and Tester can work from them independently?

Flag:
- Missing error states (invalid form input, empty/corrupted `localStorage` data on first load)
- Missing empty states (what does the page show when there are zero medications logged?)
- Vague performance language ("fast" → specify target load time or interaction latency)
- AC that describe internal implementation rather than observable behavior
- Missing NFRs: accessibility (WCAG), GitHub Pages hosting constraints, data persistence across reloads

---

### 3. Missing UX / User Flow Specification
Is there enough design context for a Developer to implement without a separate meeting?

Flag:
- No wireframe or layout description for a new screen, form, or modal
- Undefined interaction patterns (form validation timing, error message placement)
- No empty state or loading state described
- Inconsistency with existing page UI patterns

---

### 4. Stack & Hosting Boundary
Does the story respect the project's constraints?

Check:
- No implicit requirement for a server, database, authentication, or scheduled job (this is a static site with no backend)
- No requirement for secrets or private API keys at runtime (public static hosting only)
- Client-side data (medications, reminders, etc.) lives in `localStorage`/`IndexedDB` — does the story's data shape fit that model?
- Any new page must respect GitHub Pages' relative-path / base-path constraints

---

### 5. Non-Functional Requirements
Are implicit NFRs made explicit?

- **Performance:** Page should load fast on GitHub Pages' static CDN — flag anything that would require heavy client-side computation or large assets
- **Security:** No `innerHTML` with unsanitized input; no secrets committed
- **Data integrity:** What happens to previously stored data if this PBI changes the storage shape?
- **Accessibility:** WCAG 2.1 AA for any new UI component

---

### 6. Risks
What could go wrong? Surface these so the Developer can plan for them.

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Example: existing `localStorage` data doesn't match new schema | Medium | High | Add a defensive migration/fallback when reading stored data |

## Feedback Format

Return feedback to the PO using this template:

```markdown
## Architect Review — [PBI Title]

**Feasibility:** ✅ / ⚠️ / ❌
**Summary:** [One paragraph assessment]

**Required changes before development can start:**
- [ ] [Specific gap in AC, UX, or scope]
- [ ] [Another gap]

**NFRs to add to AC:**
- [ ] [e.g., Page must show a clear empty state when no medications are logged]

**Architecture notes for the Developer** (will be captured in arc42):
- [Pattern to follow, module to add, convention to respect]

**Risks for the Developer to be aware of:**
- [Risk + recommended mitigation]

**Decision required from PO (if any):**
- [What the PO must decide before development starts]
```

## After PO Incorporates Feedback

Once the PO has updated the PBI, the Architect:
1. Confirms the feedback has been addressed
2. Generates the arc42 section for this PBI (see `arc42_generation.md`)
3. Signals to the PO that the PBI is cleared for development
