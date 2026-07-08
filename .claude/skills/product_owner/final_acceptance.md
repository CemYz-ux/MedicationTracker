---
name: po-final-acceptance
description: >
  Guides the Product Owner in performing final acceptance of a completed PBI after the
  Tester has approved it. Use at the end of the delivery workflow before merging to the default branch.
---

# PO Skill: Final Acceptance

## When to Apply
After the Tester has approved a completed PBI and notified the PO, the PO performs a final check on the deployed/preview page to confirm the feature delivers the intended business value — not just that the AC pass technically.

## Final Acceptance Checklist

### Business Value Verification
- [ ] The feature solves the user need described in the story
- [ ] The workflow feels correct for the intended user role(s) in their real-world context
- [ ] No unintended side effects on adjacent functionality are visible

### Acceptance Criteria Verification
- [ ] Each AC has been verified by the Tester (test report attached to the PBI)
- [ ] Walk through the primary happy path yourself on the deployed/preview page
- [ ] Spot-check at least one error or edge case AC

### Documentation & User Flows
- [ ] `user_flows.md` has been updated by the Developer to reflect the new or changed flow
- [ ] `README.md` is up to date (setup/run instructions)
- [ ] Release notes entry exists for user-visible changes

### Ready to Merge
- [ ] No open Jira Bugs linked to this Story remain unresolved (`searchJiraIssuesUsingJql`: `project = MED AND issuetype = Bug AND issueFunction in linkedIssuesOf("MED-N")`)
- [ ] The Tester's approval comment is attached to the Jira Story
- [ ] All DoD items are met (confirmed by Developer and Tester)

## Outcomes

| Result | Jira action | Next step |
|--------|-------------|-----------|
| All checks pass | `addCommentToJiraIssue` — "PO accepted. Approved for merge to the default branch." Then `transitionJiraIssue` → **Done** | Signal to Developer to merge to the default branch |
| Minor issue found | `createJiraIssue` — Story or Bug for the minor issue | Do not block the merge |
| AC not met | `addCommentToJiraIssue` on Story with specific written feedback. Do not transition. | Return to Tester |
| `user_flows.md` not updated | `addCommentToJiraIssue` — "Blocked: user_flows.md not updated." | Return to Developer |

See `shared/jira.md` for MCP call details and project connection values.

## Important
The PO does not merge to the default branch directly. After PO approval and the Story is transitioned to Done, the Developer (or release lead) performs the merge. The PO's approval is the gate — not the act of merging.
