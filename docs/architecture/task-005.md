# TASK 005 — Separate Cycle Time tab, unified time filter, per-team recalculate

## Decision

Make the current team route a first-class tabbed UI with `Overview` and `Cycle Time`. The Cycle Time tab owns the scatterplot, detailed issue table, SLE-line controls, issue-type controls, and anomaly controls. Do not re-enable the hidden legacy subtree and do not add a second metric-calculation path.

Keep one canonical period selection in `App.tsx`. Add a selected-team local Recalculate action using the existing `analyzeTeam` path only. Designer handoff is required before implementation.

## Current state and boundary

- `App.tsx` already owns period selection, but the state must become one explicit contract across tabs.
- Legacy tabs exist inside hidden `.legacy-team-ui`; the active `ExecutiveTeamView` has no first-class Cycle Time tab.
- `TeamDetail` already contains scatter, period filtering, table, SLE controls, and anomaly actions.
- Existing Recalculate analyzes the whole workspace; TASK 005 adds a selected-team action.
- `TeamMetrics.generatedAt` is calculation time; latest valid `ImportFileInfo.updatedAt` is source-data freshness.

## State and URL

`App.tsx` owns page, team ID, team tab, view mode, and period. Child views receive state and callbacks. Use validated query parameters on the existing route; tab/team/mode changes use history state, period changes update the URL, and `popstate` restores validated state. Refresh restores URL state through the existing remembered-workspace flow. Deep links never trigger recalculation or network access.

## Unified period contract

One App-owned period drives the Team overview, Scrum Master view, P85/SLE, trends, scatterplot, table, and data-quality messages. Tab switches preserve it. Cycle Time filters the existing scatter points; it does not recalculate cards or SLE.

## Per-team Recalculate

Add a selected-team handler that validates the loaded workspace/team, marks only that team busy, calls the existing local `analyzeTeam(team)`, reloads that team, and preserves team/tab/mode/period. Duplicate clicks are ignored. Failure keeps last-known metrics and shows an actionable error. This path must not invoke Jira, request a token, or require admin rights.

## Timestamp and staleness contract

- **Last data update:** maximum valid `ImportFileInfo.updatedAt` for selected-team imported CSV files.
- **Last calculated:** `TeamMetrics.generatedAt` from the loaded metrics cache.
- If data update is newer than calculated, show a visible stale warning and Recalculate action.
- Missing/invalid timestamps are unavailable with an explanation; never substitute epoch/zero.

## Content split

Overview keeps aggregate cards and approved aggregate diagnostics, shared period control, timestamps, stale guidance, and Recalculate. Cycle Time contains the period-filtered scatter and working-day/resolution-date axes. Team mode stays compact without exclusions/configuration controls. Scrum Master mode includes the detailed table, SLE controls, issue-type controls, point selection, anomaly exclusion/restore, and data-quality diagnostics.

## Accessibility and responsive behavior

Use real tab semantics, keyboard navigation, visible focus, named period/Recalculate controls, and status announcements. Recalculate has a button-level busy state while preserving old data. Empty periods retain title/unit/period context. Stale/error/partial/unavailable are text, not color-only. Narrow layouts wrap tabs/timestamps/controls and keep chart/table overflow usable.

## Primary files and tests

Primary implementation files are `apps/sm-tool/src/App.tsx`, `ExecutiveViews.tsx`, the existing shared scatter/`TeamDetail` component, existing local workspace analysis functions, minimal shared types if needed, scoped CSS, and executable tests.

Tests must cover URL round-trip and fallback, period persistence/consistency, Back/popstate without recalculation, Overview/Cycle Time content split, Team/Scrum Master differences, target-team-only local analysis, no Jira/token/network path, duplicate/failure behavior, timestamp provenance/staleness, empty/malformed states, keyboard/responsive behavior, and customer-data safety.

## Acceptance criteria

The active team route has Overview and Cycle Time tabs; scatter/table are removed from Overview; one period drives all period-aware views; per-team Recalculate is local-only and preserves route state; both timestamps use distinct authoritative sources; all states are explicit; formulas, P85/SLE, Monday-Friday semantics, and missing-data rules are unchanged; no customer data or unrelated logic is introduced; `npm run check` passes and QA records the final verdict.

## Excluded scope

No Jira/API/network/token/admin changes, formula/status/calendar changes, storage-schema redesign, customer files, `Teams/**`, `teams/**`, `workspace.json`, deployment, legacy markup deletion, or all-team recalculation from Team view.
