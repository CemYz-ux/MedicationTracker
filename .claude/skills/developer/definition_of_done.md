---
name: frontend-developer-definition-of-done
description: >
  Definition of Done checklist for MedicationTracker. Run this before handing off
  a completed PBI to the qa-acceptance-tester. A story is not Done until every
  item on this list is satisfied.
---

# Developer Skill: Definition of Done

A PBI is only `Resolved` and ready for the **qa-acceptance-tester** when every item below is satisfied. Partial completion is not completion.

---

## Definition of Done Checklist

### Acceptance Criteria
- [ ] Every Acceptance Criterion in the PBI has been implemented
- [ ] Each AC has been self-verified locally by the Developer before handoff
- [ ] No AC are deferred, waived, or marked "good enough" without explicit PO approval

### Tests
- [ ] Vitest unit tests written and passing for all new pure logic (`npm test` green)
- [ ] Playwright E2E test written for the primary user-visible flow (`npx playwright test` green)
- [ ] No pre-existing tests are broken (no regressions introduced)
- [ ] Test coverage has not decreased

### Code Quality
- [ ] Feature branch follows naming convention: `feature/<work-item-id>-<short-description>`
- [ ] PR opened and reviewed by the **code-reviewer**
- [ ] All PR review comments resolved
- [ ] CI pipeline passes (test run + build/deploy check)
- [ ] No dead code, commented-out blocks, or debug statements committed
- [ ] Pure logic stays separated from DOM wiring — no DOM access in logic modules
- [ ] No hardcoded secrets or environment-specific values committed (this is a public static site)
- [ ] No absolute root-relative paths that would break under the GitHub Pages base path

### Documentation
- [ ] `user_flows.md` updated — new or changed flow has a current entry (status, implementation, expected behavior)
- [ ] `README.md` updated — setup/run instructions updated if they changed
- [ ] Inline comments added for any non-obvious logic
- [ ] arc42 section remains accurate — if implementation deviated from the Architect's brief, deviations are noted

### Merge
- [ ] Branch is merged into the default branch via approved Pull Request
- [ ] No merge conflicts remain
- [ ] GitHub Pages deploy succeeds from the default branch

### PBI Status
- [ ] PBI is moved to `Resolved` in Jira
- [ ] **qa-acceptance-tester** has been notified with: PBI link, deployed/preview URL, and any test data notes

---

## The DoD is Not Negotiable
If time pressure pushes toward skipping items — especially tests or `user_flows.md` — raise this with the PO. Skipping the DoD creates debt that makes the next feature harder, not easier.

The only legitimate exception: the PO explicitly removes an AC from scope and documents the decision on the PBI.
