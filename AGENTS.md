# AGENTS.md

## Project

This is a local-first Scrum Master tool for Jira CSV exports. The UI lives in `apps/sm-tool`; shared import, metrics, and workspace logic lives in `src` and `apps/sm-tool/src/lib`.

## Commands

- Install: `npm install` and `npm --prefix apps/sm-tool install`
- Dev server: `npm run sm:dev`
- Full validation: `npm run check`
- Root tests only: `npm test`

Always run `npm run check` after changing metric logic, parser logic, shared types, or UI behavior that depends on computed metrics.

## Data Safety

- Do not commit real Jira exports, cache files, `Teams/`, `teams/`, or `workspace.json`.
- Treat issue keys, team names, JQL, CSV contents, cache output, and manual team config as confidential customer data.
- Keep product source code and example/demo data separate from real workspaces.
- Jira tokens must stay in environment variables or terminal input. Never write tokens into repo files.

## Metric Rules

- SLE is based on Cycle Time and working days.
- Lead Time, Active Time, Cycle Time, and SLE use Monday-Friday working days unless a calendar feature is explicitly added.
- Time in Status rows are per-status diagnostic averages. Do not present them as additive components of Lead, Active, or Cycle Time.
- Team view is for presentation-safe flow metrics. Scrum Master view can include deeper diagnostic and configuration-heavy metrics.

## UI Rules

- Keep Team view simple enough for a team presentation.
- Keep Scrum Master view richer and more diagnostic.
- Avoid adding new metrics unless they answer a concrete Scrum Master or team coaching question.
- Preserve the existing visual style: dense operational UI, simple cards, restrained colors, no marketing-style hero sections inside the app.

## Multi-role delivery workflow

This repository uses a visible role-chat workflow coordinated from Main/ScrumMaster:

`Main/ScrumMaster → Architect → Designer (UI only) → Developer → QA → Main/ScrumMaster`

- Main/ScrumMaster owns task numbering, scope decisions, status updates, and the next-step decision.
- Architect defines scope, architecture, domain model, data flow, interfaces, risks, and acceptance criteria. Architect does not implement application code.
- Designer participates only when the task changes UI or Figma. Designer owns interaction, visual hierarchy, states, accessibility, and the developer handoff.
- Developer implements only the approved Architect specification and, when applicable, Designer handoff. Developer does not declare a task complete.
- QA independently inspects the repository, behavior, tests, data safety, accessibility, and scope. QA sends the final verdict directly to Main/ScrumMaster.

Main/ScrumMaster is coordination-only and must not implement application code. Main must not edit `apps/`, `src/`, or `tests/`; implementation changes belong to Developer and verification belongs to QA. If runtime thread coordination is unavailable, Main pauses the task instead of taking over implementation.

Task states are `PASS`, `PASS WITH FOLLOW-UPS`, `FAIL`, and `PAUSED`. A task is complete only after a QA verdict is recorded in Main/ScrumMaster. Do not start the next task before that verdict. A `FAIL` blocks scope progression until Developer remediation is followed by a new QA review.

Required Main/ScrumMaster status format:

```text
TASK [number] — [PASS / PASS WITH FOLLOW-UPS / FAIL / PAUSED]

Valmis:
- ...

Leitud probleemid:
- ...

Avatud follow-up’id:
- ...

Järgmine samm:
- ...
```

If task documents or numbering conflict, stop and report the conflict. Do not add scope without an explicit user decision. P0/P1 findings always block; P2 findings block when they affect financial correctness, security, provenance, historical reproducibility, or core behavior.
