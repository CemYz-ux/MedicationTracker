---
name: shared-ready-for-dev-gatekeeper
description: >
  The gate that a PBI must pass before the product-owner hands it to the frontend-developer.
  Applied jointly by product-owner and solution-architect after the feedback loop is complete.
  A PBI that fails any gate must not enter development.
---

# Shared Skill: Ready-for-Dev Gatekeeper

This gate is applied after the Architect has reviewed the PBI and the PO has incorporated all feedback. It is the final check before the PBI and arc42 section are handed to the Developer.

**Both the product-owner and solution-architect must be satisfied before a PBI passes this gate.**

---

## The Gates

### Gate 1 — Business Clarity
- [ ] Written in *As a [role] / I want / So that* format
- [ ] Business value is explicit — why does this matter to the user?
- [ ] Scope is bounded — what is in and what is out is stated
- [ ] No contradictory or ambiguous requirements remain

---

### Gate 2 — Acceptance Criteria Quality
- [ ] At least 3 AC defined
- [ ] Each AC is testable without asking the PO
- [ ] At least one error or edge case AC is included
- [ ] No vague language ("fast", "user-friendly", "looks good")
- [ ] Project specifics addressed where relevant: GitHub Pages hosting constraints, localStorage-based persistence, empty states

---

### Gate 3 — Architecture Feasibility
- [ ] **solution-architect** has confirmed the story is technically feasible on a static HTML/CSS/JS stack
- [ ] No unresolved technical blockers
- [ ] Any new npm dependency is justified and minimal
- [ ] No implicit requirement for a backend, server-side secret, or build framework

---

### Gate 4 — arc42 Section Generated
- [ ] **solution-architect** has produced the arc42 section for this PBI
- [ ] Arc42 section covers: affected files/modules, client-side data shape, runtime flow, conventions to follow, risks
- [ ] Arc42 section is attached to the PBI and committed to `architecture/pbis/`

---

### Gate 5 — UX / User Flow Completeness
- [ ] For any UI change: wireframe, mockup, or step-by-step layout description is attached
- [ ] User journey is described step by step
- [ ] Empty state, loading state, and error state are described
- [ ] `user_flows.md` update expectations are described (what the Developer must add/change)

---

### Gate 6 — Testing Strategy Clear
- [ ] Test types are identified (Vitest unit tests for pure logic, Playwright E2E for the user flow)
- [ ] Any special test data or `localStorage` seeding requirements are noted

---

### Gate 7 — No Open Questions
- [ ] All questions in PBI comments are answered and closed
- [ ] No "TBD" or "to be confirmed" placeholders remain
- [ ] All dependencies on other PBIs are resolved or tracked with a clear plan

---

## Outcomes

| Result | Action | Jira action |
|--------|---------|-------------|
| All 7 gates pass | PO hands PBI + arc42 to **frontend-developer** | `addCommentToJiraIssue` on the Story — "Passed all 7 Ready-for-Dev gates. Handed to developer with arc42 section." |
| Minor gap (Gate 1/2/5) | PO fixes immediately; gates re-checked before handoff | `addCommentToJiraIssue` — note the gap and the fix applied |
| Architecture gap (Gates 3/4) | Returns to **solution-architect** for resolution | `addCommentToJiraIssue` — "@architect: blocked on Gate 3/4 — [describe gap]" |
| Blocking open question (Gate 7) | PBI stays in refinement until resolved | `addCommentToJiraIssue` — note the open question and who owns resolving it |

See `shared/jira.md` for MCP call details and project connection values.
