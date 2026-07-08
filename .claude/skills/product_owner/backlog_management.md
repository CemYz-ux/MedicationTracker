---
name: po-backlog-management
description: >
  Guides the Product Owner in writing, ordering, and refining Product Backlog Items (PBIs)
  for MedicationTracker on the Jira Scrum board (project key MED). Use when creating new
  User Stories, managing sprint backlog priority, or running a refinement session with the Architect.
---

# PO Skill: Backlog Management

## Work Item Structure

Every PBI in the backlog must follow this hierarchy:

| Level | Type | Description |
|-------|------|-------------|
| 1 | **Epic** | Large capability spanning multiple sprints (e.g., "Medication Logging") |
| 2 | **Feature** | Deliverable slice of an Epic (e.g., "Recurring Dose Reminders") |
| 3 | **User Story / PBI** | Single user-facing increment, completable in one sprint |
| 4 | **Task / Bug** | Implementation or fix unit linked to a PBI |

## Writing a PBI

Every PBI must follow this format:

```
As a [role, e.g. admin / member / guest],
I want [goal],
so that [benefit to the user or business].
```

Attach immediately:
- At least 3 Acceptance Criteria (see `acceptance_criteria.md`)
- Any relevant wireframe, screen description, or UX flow reference
- Known dependencies on other PBIs

## Before Submitting to the Architect

Run the PO self-check (`user_story_review.md`) before handing a PBI to the Architect for review.

The Architect will return written feedback — the PO must incorporate that feedback into the PBI before passing it to the Developer.

## Backlog Ordering Rules

- Top of backlog = items that have passed the Ready-for-Dev Gate and are awaiting a sprint
- Order by: user safety/impact > core workflow impact > technical enabler > nice-to-have
- Items dependent on prior groundwork (e.g. a new client-side data shape) go after that work
- Technical debt items must be visible and periodically prioritized — they do not disappear

## Refinement Cadence

- Once per sprint, mid-sprint (invite: PO + Architect)
- Goal: top 2 sprints of backlog are refined and estimated
- Output: PBIs marked as Ready-for-Dev with Architect sign-off

## Anti-Patterns to Avoid

- Submitting a PBI to the Developer without Architect feedback incorporated
- Writing AC in technical language — AC describe observable behavior, not implementation
- Adding scope mid-sprint without removing something else
- Leaving UX undefined ("it should look nice") — provide a layout description or wireframe

---

## Jira Integration

All backlog items **must be created in Jira** immediately after they are written — the Jira board is the single source of truth. See `shared/jira.md` for connection details, issue type IDs, and MCP call examples.

### Hierarchy in Jira

```
Epic (issuetype = Epic)
  └── Feature (issuetype = Feature, parentKey = <Epic key>)
        └── Story / PBI (issuetype = Story, parentKey = <Feature key>)
              └── Bug (issuetype = Bug, linked to Story via createIssueLink)
              └── Task (issuetype = Task, linked to Story)
```

### When to Create What

| Action | Jira call |
|--------|-----------|
| New Epic identified | `createJiraIssue` → Epic |
| New Feature scoped | `createJiraIssue` → Feature, `parentKey` = Epic |
| New PBI / User Story written | `createJiraIssue` → Story, `parentKey` = Feature |
| Bug found during QA | `createJiraIssue` → Bug, then `createIssueLink` to parent Story |
| Refinement comment / decision | `addCommentToJiraIssue` on the relevant issue |

### After Creating an Issue

1. Copy the Jira key (e.g., `MED-4`) and include it in all handoff communications.
2. Add the AC and UX description as the issue description — not just in conversation.
3. Use `addCommentToJiraIssue` at every handoff to record who did what and when.
