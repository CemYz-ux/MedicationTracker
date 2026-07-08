---
name: medication-tracker-delivery-pipeline
description: Orchestration playbook for shipping a feature/fix end-to-end in MedicationTracker — the main chat's own workflow for delegating to subagents (dev, code reviewer, QA, product owner), filing Jira follow-ups, and managing the PR through merge. Use when implementing, continuing, or resuming a feature that needs to go from code to merged PR, or when asked "what's next" on an in-flight branch.
---

# MedicationTracker Delivery Pipeline

This is the main chat's own operating procedure in this repo, not a subagent's.

## Core rule: the main chat does not write code

All HTML/CSS/JS implementation, debugging, and fix work is delegated to the
**frontend-developer** agent via the `Agent` tool — never done with direct `Edit`/`Write`
calls in the main session. Direct `Read`/`Bash`/`Grep` in the main session is fine and
expected for *investigation* — reading files, running `git log`/`git diff`, checking test
output — so the dispatch prompt to the agent is well-briefed instead of vague. The line is:
look, don't touch; touching is the agent's job.

## The chain

```
frontend-developer  (implement + Vitest/Playwright tests, same commit)
        │
        ▼
code-reviewer  (full diff vs default branch, correctness + accessibility + test quality)
        │  blockers? ──► back to frontend-developer, then re-review the fix
        ▼
qa-acceptance-tester  (verify against LIVE Jira AC — not local architecture docs)
        │  NO-GO? ──► back to frontend-developer, then re-run QA on the new commit
        ▼
[user confirms any judgment call before merge, e.g. push/PR/merge]
        │
        ▼
product-owner  (final acceptance, AFTER merge — independent judgment, not a rubber stamp)
```

Each stage is a fresh `Agent` dispatch (`subagent_type` set accordingly), not a continuation
of the previous one — they don't share context, so every dispatch prompt must be
self-contained: repo path, branch, current commit, what already happened, what to focus on,
and what "done" looks like (tests passing, build/deploy clean, commit made).

### Verify independently, don't trust a self-report at face value

A dispatched agent's own "all green" report should be independently re-checked by the
*next* stage rather than taken as given — code review should re-derive suspected bugs with
evidence instead of assuming, and QA should re-run both test suites and actually exercise the
flow in a browser rather than trusting the dev agent's fix summary. Every dispatch prompt
should say "verify independently, don't take the prior report at face value."

## TDD is non-negotiable

Vitest unit tests (for pure logic) and Playwright E2E tests (for the user-visible flow) must
land in the *same commit* as the code they cover, or the work is blocked at review. When a
fix-dispatch to frontend-developer touches behavior, the prompt must ask for a regression
test that would have caught the bug, not just the fix.

## QA must use live Jira, not local docs

Every QA/PO dispatch prompt must explicitly instruct: pull the real AC from Jira
(`searchJiraIssuesUsingJql` / `getJiraIssue`, cloud ID
`fc18b2b9-4b0a-4d08-bb29-4ffb6db86d7b`, project key `MED`, site `yazicicem.atlassian.net`),
don't rely on the repo's own summarized docs or on the main chat's summary of what was built.

## Non-blocking findings get filed, not dropped

Every review/QA pass accumulates a list of "not a blocker, but should be tracked" items
(accessibility polish, dead code, missing test coverage, UX polish). Before opening or
merging the PR:
1. Check Jira first for existing tickets covering the same thing (`searchJiraIssuesUsingJql`)
   — don't file duplicates across QA re-passes.
2. File the rest via `createJiraIssue` (project `MED`, `Bug` for real defects, `Task` for
   tech debt/hardening/missing coverage), each with a description that includes the
   file:line reference and which pass found it.
3. Reference the filed ticket keys in the PR description.

## Architecture-level decisions get surfaced, not silently shipped

If a dispatched agent's diff includes something bigger than the stated task — e.g. a new
npm dependency, a new storage schema that breaks old data, or anything that starts to smell
like "this needs a backend" — stop and ask the user with `AskUserQuestion` before treating it
as settled. Don't let a subagent's side effect become a silent fact. Once the user confirms
intent, record it in `memory/project_context.md` so downstream agents (review, QA, PO) get
the confirmed framing instead of re-litigating it — but still tell the PO dispatch to weigh
in with independent judgment on whether the *sequencing* of that decision was right, not just
whether the decision itself was fine.

## Git/PR mechanics

- Conventional commits scoped to the Jira ticket: `feat(MED-N): ...`, `fix(MED-N): ...`,
  `test(MED-N): ...` — dev agent dispatches should specify this format explicitly.
- Dev agent dispatches commit locally but never push or open a PR themselves — that stays
  with the main chat, which asks the user before doing anything visible/shared (push,
  `gh pr create`, `gh pr merge`).
- Before merging: re-check `gh pr view <n> --json mergeable,mergeStateStatus,statusCheckRollup`
  — don't merge blind.
- After merge, verify the GitHub Pages deploy workflow succeeded
  (`gh run list --workflow=<deploy-workflow>.yml` or check the Actions tab) before telling
  the user the feature is live.

## Keep `memory/project_context.md` current at every handoff

Update the "Open PR" / current-feature section in project memory after each stage
transition (dispatched → landed → next stage), so a session that resumes cold (new context
window, or literally a new conversation) can pick up the pipeline exactly where it left off
without re-deriving state from git log. Once merged and PO-accepted, collapse the section
into a short "MERGED, PO-accepted" summary with the key findings, not a blow-by-blow.
