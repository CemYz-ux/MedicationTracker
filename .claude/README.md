# Agent Skills System

Skills and manifests for the five Claude Code subagents delivering features on
MedicationTracker — a very simple static webpage (HTML/CSS/JS, npm for dev/test tooling
only, no backend) hosted on GitHub Pages. Each agent has a manifest (its configuration and
role) and one or more skill files (its actionable process guides).

---

## Agents & Their Manifests

| Agent | Model | Manifest |
|-------|-------|---------|
| `product-owner` | Sonnet | `manifests/product_owner_manifest.yaml` |
| `solution-architect` | Opus | `manifests/solution_architect_manifest.yaml` |
| `frontend-developer` | Sonnet | `manifests/frontend_developer_manifest.yaml` |
| `code-reviewer` | Sonnet | `manifests/code_reviewer_manifest.yaml` |
| `qa-acceptance-tester` | Sonnet | `manifests/qa_acceptance_tester_manifest.yaml` |

---

## Delivery Workflow

```
product-owner
  │  Writes PBI + AC. Runs self-review.
  ▼
solution-architect
  │  Reviews PBI. Returns written feedback to product-owner.
  ▼
product-owner
  │  Improves PBI based on feedback.
  ▼
solution-architect
  │  Generates arc42 section. Clears PBI for development.
  ▼
product-owner
  │  Hands improved PBI + arc42 to developer.
  ▼
frontend-developer
  │  Implements. Writes Vitest + Playwright tests. Updates user_flows.md + README.
  │  Opens Pull Request.
  ▼
code-reviewer
  │  Reviews PR. Approves or requests changes.
  ▼
frontend-developer
  │  Resolves review comments. Merges PR. Notifies tester.
  ▼
qa-acceptance-tester
  │  Tests all AC on the deployed/preview page. Regression + edge cases.
  │  Pass → notifies product-owner.
  │  Fail → raises bugs, returns to frontend-developer.
  ▼
product-owner
  │  Final acceptance on the deployed/preview page. Verifies business value.
  │  Approves → signals merge to the default branch.
  ▼
frontend-developer
     Merges to the default branch (GitHub Pages redeploys).
```

---

## Folder Structure

```
skills/
  product_owner/
    backlog_management.md       # PBI structure, refinement, ordering
    acceptance_criteria.md      # AC format, project specifics, quality rules
    user_story_review.md        # Self-check before submitting to architect
    final_acceptance.md         # PO acceptance checklist before merge to the default branch

  architect/
    technical_review.md         # Feasibility, AC gaps, UX gaps, risks — feedback to PO
    arc42_generation.md         # Arc42 brief for the developer: layers, contracts, conventions

  developer/
    feature.md                  # Full feature implementation process (matches SKILL.md style)
    bugfix.md                   # Bug fix process with regression test requirement
    refactoring.md              # Refactor process: structure-only, tests stay green
    definition_of_done.md       # DoD checklist before handoff to tester

  code_reviewer/
    code_review.md              # Full PR review checklist: correctness, architecture, tests, docs

  tester/
    acceptance_testing.md       # AC validation, regression, edge cases, bug reporting

  shared/
    workflow.md                 # Full chain with handoff requirements and RACI
    ready_for_dev_gatekeeper.md # 7-gate check before developer receives the PBI

manifests/
  product_owner_manifest.yaml
  solution_architect_manifest.yaml
  frontend_developer_manifest.yaml
  code_reviewer_manifest.yaml
  qa_acceptance_tester_manifest.yaml

README.md
```

---

## Key Delivery Rules (All Agents Must Know)

- **No backend, ever** — this is a static site hosted on GitHub Pages. No server, no database, no runtime secrets. If a PBI seems to require one, escalate to the solution-architect instead of building around it.
- **Pure logic separated from DOM wiring** — data transforms, validation, and storage access live in DOM-free modules so Vitest can test them directly; DOM wiring is a thin layer on top.
- **No framework/bundler by default** — plain HTML/CSS/JS, npm only for dev/test tooling (Vitest, Playwright). A new dependency needs explicit justification.
- **Client-side data is the only data** — `localStorage`/`IndexedDB` is the source of truth; always handle missing/corrupted stored data defensively (first run, prior schema).
- **GitHub Pages path constraints** — relative paths only; no root-absolute asset paths that break under the repo's Pages base path.
- **Accessibility is not optional** — no framework does it for you here; semantic HTML, labels, keyboard support, and focus states are reviewed every time.
- **A living source of truth is kept up to date** — `user_flows.md` and `README.md` are updated with every feature and bug fix.
- **Arc42 architecture docs live in `architecture/`** — `architecture/arc42.md` (system-level), `architecture/decisions/` (ADRs), `architecture/pbis/` (per-feature briefs).

---

## Stack Reference

| Layer | Technology |
|-------|-----------|
| Markup / Styling / Scripting | Plain HTML5 / CSS3 / ES module JavaScript, framework-free by default |
| Package manager | npm (dev/test tooling only) |
| Unit testing | Vitest |
| E2E testing | Playwright |
| Hosting | GitHub Pages (static hosting only) |
| CI/CD | GitHub Actions (test on PR, deploy on merge to default branch) |
| Data | Client-side only — `localStorage`/`IndexedDB`, no server-side datastore |
| Backlog | Jira Scrum board "MedicationTracker" (project key `MED`) |
| Architecture docs | `architecture/` folder, Arc42 template |
