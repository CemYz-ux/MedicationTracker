---
name: shared-jira
description: >
  Jira connection details and MCP call reference for the MedicationTracker project.
  All agents load this when they need to create, update, transition, or query
  issues in Jira. Never hardcode these values in agent responses — always
  reference this file.
---

# Shared Skill: Jira Reference

## Connection

| Field | Value |
|-------|-------|
| Site | yazicicem.atlassian.net |
| Cloud ID | `fc18b2b9-4b0a-4d08-bb29-4ffb6db86d7b` |
| Project name | **MedicationTracker** |
| Project key | `MED` |
| Project ID | `10066` |

## Issue Type IDs

| Type | ID | Hierarchy level |
|------|----|-----------------|
| Epic | `10078` | 1 (top) |
| Feature | `10082` | 0 |
| Story | `10081` | 0 |
| Task | `10080` | 0 |
| Bug | `10083` | 0 |
| Subtask | `10079` | -1 (child) |

## Creating Issues

Use `mcp__claude_ai_Atlassian_Rovo__createJiraIssue` with `cloudId: fc18b2b9-4b0a-4d08-bb29-4ffb6db86d7b`.

**Epic:**
```json
{
  "cloudId": "fc18b2b9-4b0a-4d08-bb29-4ffb6db86d7b",
  "projectKey": "MED",
  "issueTypeName": "Epic",
  "summary": "<Epic title>",
  "description": "<Goal / scope / success metrics>"
}
```

**Feature (child of Epic):**
```json
{
  "cloudId": "fc18b2b9-4b0a-4d08-bb29-4ffb6db86d7b",
  "projectKey": "MED",
  "issueTypeName": "Feature",
  "summary": "<Feature title>",
  "description": "<Description / value / dependencies>",
  "parentKey": "<MED-N of the parent Epic>"
}
```

**Story / PBI (child of Feature or standalone):**
```json
{
  "cloudId": "fc18b2b9-4b0a-4d08-bb29-4ffb6db86d7b",
  "projectKey": "MED",
  "issueTypeName": "Story",
  "summary": "<Story title>",
  "description": "As a [role], I want [goal], so that [benefit]\n\nAcceptance Criteria:\n- Given ... When ... Then ...",
  "parentKey": "<MED-N of the parent Feature>"
}
```

**Bug:**
```json
{
  "cloudId": "fc18b2b9-4b0a-4d08-bb29-4ffb6db86d7b",
  "projectKey": "MED",
  "issueTypeName": "Bug",
  "summary": "[Story #<id>] <Short description>",
  "description": "Steps to reproduce:\n1. ...\n\nExpected: ...\nActual: ...\nSeverity: Critical/High/Medium/Low"
}
```

**Task:**
```json
{
  "cloudId": "fc18b2b9-4b0a-4d08-bb29-4ffb6db86d7b",
  "projectKey": "MED",
  "issueTypeName": "Task",
  "summary": "<Task title>",
  "description": "<What must be done>"
}
```

## Transitioning Issues

Always call `mcp__claude_ai_Atlassian_Rovo__getTransitionsForJiraIssue` first to get the available transition IDs for the specific issue, then call `mcp__claude_ai_Atlassian_Rovo__transitionJiraIssue`.

Common Scrum board transitions (names may vary — always verify):
- `To Do` → the issue has been created and is awaiting sprint
- `In Progress` → work has started
- `Done` → work is complete and accepted

## Adding Comments

Use `mcp__claude_ai_Atlassian_Rovo__addCommentToJiraIssue` to record handoffs, test results, architect feedback, and PR links. Comments are the audit trail — use them at every handoff.

## Searching Issues

Use `mcp__claude_ai_Atlassian_Rovo__searchJiraIssuesUsingJql` with JQL, e.g.:
- All open stories: `project = MED AND issuetype = Story AND statusCategory != Done`
- Story by key: `key = MED-N`
- Bugs linked to a story: `project = MED AND issuetype = Bug AND "Epic Link" = MED-N`

## Linking Issues

Use `mcp__claude_ai_Atlassian_Rovo__createIssueLink` to link bugs to their parent story (link type: `is caused by` / `relates to`).
