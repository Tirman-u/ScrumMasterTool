# TASK 020 — Metric clarity and screenshot remediation

Status: Architect handoff ready; Designer required next.

Scope: clarify Forecast P85 as an open-backlog 85% simulation forecast; document Flow Efficiency as active/(active+queue); rename WIP Bug Ratio presentation to Open Bug Ratio with numerator/denominator; clarify SLE Compliance as open-work within-SLE share with within/over counts; improve English copy and simplify Flow Time/Delivery Expectation hierarchy.

Frozen boundaries: preserve Task 012–019 formulas, canonical names, provenance/state contracts and shared `MetricInsightModal`; no P50 product surface or special P85 trendline; no Jira/network/token/admin flows; no customer/workspace data or deploy changes.

Architect specification: [docs/architecture/task-020.md](../architecture/task-020.md)

Handoff order: Designer defines final responsive copy/layout → Developer implements only the approved contract → QA independently verifies source, rendered UI, accessibility, formulas, provenance, and data-safety gates → Main records the task verdict.

## Designer handoff — 2026-09-24

Complete: [docs/design/task-020.md](../design/task-020.md).

Figma updated and verified: [desktop node 2:2](https://www.figma.com/design/QoH9hUoVftQxr73YDvmmdU?node-id=2-2), [shared MetricInsightModal node 2:3](https://www.figma.com/design/QoH9hUoVftQxr73YDvmmdU?node-id=2-3), [mobile node 2:4](https://www.figma.com/design/QoH9hUoVftQxr73YDvmmdU?node-id=2-4). Canonical copy now distinguishes Forecast P85, Flow Efficiency, Open Bug Ratio and SLE Compliance while preserving TASK 019 grouping. No application code, customer/workspace data or deploy changes.

Developer gate: verify the Forecast helper’s unit before implementation; then use existing metric adapters and shared modal only. QA must independently verify formulas, unit, order, states, provenance, responsive accessibility and duplicate-surface removal.

## Developer implementation — 2026-09-24

Verified the Forecast helper uses recent daily throughput over a 90-day sample and advances the forecast date with calendar-day addition; user-facing copy now says calendar days and clearly distinguishes backlog completion confidence from Cycle Time SLE. Clarified Flow Efficiency with the existing `active time ÷ (active time + queue time) × 100` formula and higher-means-less-waiting interpretation. Renamed the new Executive presentation of WIP Bug Ratio to Open Bug Ratio and exposed the existing open-bug/open-WIP numerator and denominator. Corrected SLE Compliance copy to describe currently open work within SLE, including within/eligible and over-threshold counts. Updated the shared insight definitions and preserved the TASK 019 grouped hierarchy without adding duplicate surfaces.

Validation: focused TASK 020/metric/modal tests passed (18 tests); `npm run check` passed (39 test files, 233 tests, production build); `git diff --check` passed. No version bump, commit, push, deploy, Teams/workspace/customer data, cache or token changes.

## Developer remediation — shared Executive card entry points — 2026-09-24

Added Forecast P85, Flow Efficiency, Open Bug Ratio and SLE Compliance to the shared `executiveTeamData.kpis` inventory. Both Team and Scrum Master presentation modes now expose them through the same clickable `SupportingMetrics` cards and shared `MetricInsightModal`; the former non-clickable health-row duplicates were removed. Existing diagnostic data remains available to the Scrum Master model without creating duplicate primary surfaces.

Validation: focused TASK 020/Executive/modal tests passed (19 tests); `npm run check` passed (39 test files, 234 tests, production build); `git diff --check` passed.

## QA review — 2026-09-24

Verdict: **FAIL**.

### Findings

- **P1 — required Team/Scrum Master card + shared-modal path is missing for the four clarified metrics.** `executiveTeamData.kpis` contains the primary/supporting cards through SLE P85, Flow Time, Waiting and Maintenance (`apps/sm-tool/src/App.tsx:6370-6469`), but `Forecast P85`, `Flow Efficiency`, `Open Bug Ratio` and `SLE Compliance` are only placed in `processHealth`, `workHealth` and `flowHealth` (`:6471-6485`). `TeamDesignView` and `ScrumMasterDesignView` pass only `data.kpis` into `SupportingMetrics` (`apps/sm-tool/src/components/ExecutiveViews.tsx:762-783`), so these four do not render as `FlowMetricCard` buttons and cannot open the shared `MetricInsightModal`. Scrum Master exposes them only as non-clickable `MetricRow` diagnostics; Team does not expose them in the Executive hierarchy.
- **P2 — focused tests assert copy/source strings, not rendered inventory or shared-modal entry points.** `tests/task-020.test.ts` passes 4/4 but does not prove that all four metrics are present in both modes or route through `InsightCardButton`/`MetricInsightModal`.

### Passing evidence

- Forecast copy explicitly distinguishes open-backlog Monte Carlo confidence and uses calendar-day wording; Flow Efficiency includes the exact formula and interpretation; Open Bug Ratio includes open-bug/open-WIP context; SLE Compliance describes open work and within/over counts.
- Task 019 hierarchy helpers and duplicate filtering remain present; no formula implementation or customer/workspace data changes were made by QA.
- Focused tests: 14/14 (`task-020` + `metric-trust`). Full `npm run check`: 39 test files/233 tests, typecheck and build passed. `git diff --check` passed. Only existing bundler warnings were emitted.

### Required fix / next step

Expose Forecast P85, Flow Efficiency, Open Bug Ratio and SLE Compliance in the shared Team/Scrum Master card inventory (preserving Team concise vs Scrum Master diagnostic copy) and add rendered-path assertions for each shared modal entry point. **Next task is blocked.**

## QA re-review — P1 remediation — 2026-09-24

Verdict: **PASS WITH FOLLOW-UPS**.

### Evidence

- `executiveTeamData.kpis` now contains exactly one entry each for `SLE Compliance`, `Open Bug Ratio`, `Flow Efficiency` and `Forecast P85` (`apps/sm-tool/src/App.tsx:6469-6472`). The former health-row duplicates were removed.
- Both `TeamDesignView` and `ScrumMasterDesignView` render the same `SupportingMetrics` component. Its cards use `FlowMetricCard`, which is an `InsightCardButton` and therefore opens the shared `MetricInsightModal` (`apps/sm-tool/src/components/ExecutiveViews.tsx:357-366, 762-783`).
- The new focused test asserts one source occurrence for all four metrics, two SupportingMetrics render paths and the shared modal route; focused tests passed 15/15 (`task-020` + `metric-trust`).
- Exact semantics/copy remain present: Forecast P85 is a calendar-day open-backlog Monte Carlo forecast distinct from Cycle Time SLE; Flow Efficiency uses active ÷ (active + queue) × 100; Open Bug Ratio shows open bugs/open WIP; SLE Compliance describes open work with within/eligible and over-threshold counts. Task 019 hierarchy and Task 012–019 contracts were not changed by QA.
- Full `npm run check` passed typecheck, 39 test files/234 tests and production build; `git diff --check` passed. Only existing bundler warnings were emitted.
- No Teams/teams/workspace/cache/import/customer/token data was changed by QA.

### Follow-up

Browser/200% zoom/screen-reader smoke was not available in this environment; retain it as a non-blocking UI accessibility follow-up. No P0/P1 blocker remains in the reviewed source or automated checks.

Next step: **the next task may begin**.
