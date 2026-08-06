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
