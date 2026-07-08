---
name: po-user-story-review
description: >
  PO self-review checklist to run before sending a PBI to the Architect.
  Catches gaps that would cause the Architect to return the story immediately.
---

# PO Skill: User Story Self-Review

Run this check on every PBI before sending it to the Architect for technical review.
A story that fails multiple checks will be returned — catching gaps here saves a full feedback loop.

## Self-Review Checklist

### Story Quality
- [ ] Written in *As a [role] / I want [goal] / So that [benefit]* format
- [ ] Business value is explicit — why does this matter to the user?
- [ ] Scope is bounded — what is in and what is out is stated
- [ ] No contradictory or ambiguous requirements

### Acceptance Criteria
- [ ] At least 3 AC defined
- [ ] Each AC is observable and testable without asking the PO
- [ ] At least one error or edge case is covered
- [ ] No AC describe internal implementation — they describe observable outcomes
- [ ] No AC implies a backend, login, or cross-device sync (this is a static, no-backend site)

### UX / User Flow
- [ ] The user journey is described step by step
- [ ] A wireframe, mockup, or layout description is attached for any UI change
- [ ] Empty states, loading states, and error states are described
- [ ] The expected `user_flows.md` update is described

### Scope & Dependencies
- [ ] Story fits within one sprint
- [ ] Dependencies on other PBIs are listed and their status noted
- [ ] Any new npm dependency the story would require is flagged and justified
- [ ] No open questions remain that require PO input

## Outcome

| Result | Action |
|--------|--------|
| All checks pass | Submit to Architect for technical review |
| 1–2 minor gaps | Fix them, then submit |
| Multiple gaps or unclear scope | Rework the story and run this check again before submitting |

## After Architect Feedback

When the Architect returns the PBI:
1. Read all feedback carefully
2. Update the story: AC, UX description, or scope as directed
3. Confirm with the Architect that the updated story addresses their feedback
4. Only then: hand the PBI (with the Architect's arc42 section) to the Developer

Do not hand a PBI to the Developer that still has unresolved Architect comments.
