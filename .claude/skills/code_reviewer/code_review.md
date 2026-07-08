---
name: code-reviewer
description: >
  Comprehensive code review skill for MedicationTracker.
  Use when reviewing a Pull Request from the frontend-developer. Covers
  correctness, code quality, accessibility, security, test quality, and documentation.
  The goal is to catch issues before they reach the qa-acceptance-tester.
---

# Skill: Code Review

## Role in the Workflow
The **code-reviewer** sits between the Developer and the Tester. No feature, bug fix, or refactor is handed to the **qa-acceptance-tester** until the PR has been reviewed and approved here.

The reviewer is a quality gate, not a gatekeeper. The goal is to make the code better and catch issues early — not to block progress. Keep feedback constructive, specific, and actionable.

---

## Before You Start

1. Read the linked PBI (User Story + Acceptance Criteria)
2. Read the arc42 section for this PBI (the Architect's brief to the Developer)
3. Understand what the feature is supposed to do before reviewing how it was done

---

## Review Checklist

### ✅ Correctness — Does it actually do what the PBI says?

- [ ] The implementation matches all Acceptance Criteria — walk through each one
- [ ] The primary happy path works as described in the PBI
- [ ] Error and edge cases from the AC are handled (invalid input, empty state, missing/corrupted stored data)
- [ ] No AC are silently skipped or partially implemented

---

### 🏗️ Code Structure — Does it follow the project's conventions?

- [ ] Pure logic (data transforms, validation, `localStorage`/`IndexedDB` read/write) is separated from DOM wiring, with no DOM access inside pure logic modules
- [ ] Markup is semantic HTML — `<button>` not `<div onclick>`, `<label>` bound to every input
- [ ] No framework, bundler, or new npm dependency introduced without justification in the PBI/arc42
- [ ] All asset/link paths are relative (or use the documented base path) — no root-absolute paths that would break under GitHub Pages
- [ ] No server-side assumptions (no runtime environment variables, no secrets, no server-side routing)

---

### 🔒 Security & Data Integrity

- [ ] No `innerHTML`/`outerHTML` set from unsanitized/user-provided input (XSS risk) — `textContent` or explicit escaping used instead
- [ ] No `eval` or `Function` constructor usage
- [ ] No secrets, API keys, or credentials committed
- [ ] `localStorage`/`IndexedDB` reads defensively handle missing or malformed data (first run, prior schema) without throwing uncaught errors

---

### 🧪 Test Quality — Are the tests meaningful?

**Coverage**
- [ ] Vitest unit tests cover new pure logic: happy path, edge cases, malformed input
- [ ] At least one Playwright E2E test covers the primary user-visible flow
- [ ] Regression test added for bug fixes — fails on old behavior, passes with fix

**Test hygiene**
- [ ] Playwright tests establish clean state (clear `localStorage`) at the start, not relying on leftover state from a previous test
- [ ] Test names are descriptive: what scenario, what expected outcome
- [ ] Tests assert on observable behavior (rendered DOM, stored data), not implementation internals
- [ ] No arbitrary `sleep`/fixed waits in Playwright — rely on its built-in auto-waiting/assertions
- [ ] No disabled or skipped tests left without a comment explaining why

**Coverage integrity**
- [ ] Overall test coverage has not decreased
- [ ] No existing tests were weakened or removed to make the suite pass

---

### ♿ Accessibility

- [ ] All new interactive elements are reachable via keyboard Tab navigation
- [ ] Visible focus states on all interactive elements
- [ ] New form fields have visible `<label>`s (not just placeholder text)
- [ ] Error messages are associated with the relevant field
- [ ] Color is not the only way information is conveyed

---

### 📄 Documentation

- [ ] `user_flows.md` is updated with the new or changed flow entry
- [ ] `README.md` is updated if setup/run instructions changed
- [ ] Inline comments explain non-obvious logic (the *why*, not the *what*)
- [ ] If the implementation deviated from the arc42 brief, the deviation is noted in a comment or updated in the arc42 document

---

### 🔧 Code Quality

- [ ] No dead code, commented-out blocks, or debug statements (`console.log` left in)
- [ ] No code duplication that should be extracted into a shared function
- [ ] Functions have a single, clear responsibility
- [ ] Naming is consistent with the project's existing conventions
- [ ] `const` preferred over `let` — no `var`
- [ ] No unused variables, imports, or event listeners left attached after their target is removed

---

### 🌿 Branching & PR

- [ ] Branch name follows the convention: `feature/<id>-<description>`, `bugfix/<id>-<description>`, etc.
- [ ] PR title: `[#<WorkItemId>] Short description`
- [ ] PR is linked to the work item
- [ ] PR scope is focused — one PBI or bug fix per PR
- [ ] No merge conflicts

---

## How to Give Feedback

Use comment prefixes to communicate urgency:

| Prefix | Meaning |
|--------|---------|
| `blocking:` | Must be fixed before approval — correctness, security, or accessibility violation |
| `nit:` | Minor style or naming suggestion — Developer's call |
| `suggestion:` | Optional improvement — discuss if time allows |
| `question:` | I need to understand this before I can assess it |

Keep feedback specific: point to the exact line, explain what is wrong, and suggest what to do instead.

---

## Approval Decision

| Situation | Action |
|-----------|--------|
| All blocking items resolved | ✅ Approve — Developer can hand off to **qa-acceptance-tester** |
| Minor nits only | ✅ Approve with comments — Developer addresses at their discretion |
| Blocking items remain | ❌ Request Changes — Developer must resolve before re-review |
| Stack/architecture violation (e.g. implies a backend, adds an unjustified framework) | ❌ Request Changes + notify **solution-architect** if the issue is significant |

---

## What the Reviewer Does NOT Do

- Does not re-verify the AC against the running system — that is the **qa-acceptance-tester**'s job
- Does not redesign the feature — if the approach is fundamentally wrong, escalate to **solution-architect**
- Does not rewrite code in comments — explain the issue and let the Developer fix it
