# TASK 011 — Metric-info audit

## Main status

`in-progress`

Owner: Main/ScrumMaster
Current stage: Designer
Scope lock: one reusable Task 010 metric insight affordance/modal

## User objective

Make important Executive Summary metrics understandable through metric-specific insight content without creating a second help system, changing values/formulas, or presenting missing data as zero.

## Architect handoff

Use the Task 010 shared metric insight modal for Stories Done, Throughput, Avg Cycle Time, SLE P85, Aging WIP, Done Bug Ratio, Velocity, Bottleneck, visible Lead/Cycle/Implementation cards, Waiting Time % when available, and other stable-contract cards. Preserve selected period as the sole historical-window authority, local provenance, current/previous comparison, no-gap inference, no P50, and no special P85 target/trendline.

## Designer handoff

Complete: [docs/design/task-011.md](../design/task-011.md). Defines the reusable card/modal anatomy, typed metric meaning/source/calculation/unit/direction, current-versus-previous comparison, as-of versus capturedAt/source, sample/usable, truthful states, Team/Scrum Master density, desktop/mobile/200% reflow, keyboard/touch/focus behavior, reduced motion, and QA acceptance criteria.

## Developer handoff

Blocked until Main routes the approved Designer handoff. Reuse Task 010’s insight interaction; do not add a parallel help system, formulas, data sources, routes, or customer/workspace changes.

## QA verdict

Not started. QA must independently verify metric-specific content, value/provenance parity, state truthfulness, period/gap rules, modal accessibility, responsive reflow, and data boundaries.

## Open follow-ups

- Waiting Time % and any additional card are included only when their existing stable metric contract and historical data are available.

## Developer implementation evidence

- Extended the existing TASK 010 metric insight registry with typed, metric-specific meaning, local collection/source, calculation, unit, direction, unavailable guidance, and Team/Scrum Master detail for Executive cards and approved flow metrics.
- Removed the generic `existing metric unit` fallback in favor of an explicit unsupported-contract state.
- Kept the shared MetricInsightModal as the single insight surface; Executive Team and Scrum Master KPI cards use the existing disclosure interaction, selected period, and App-owned values.
- Preserved missing-versus-zero semantics and made previous values with display units (for example `5/month`) parseable without treating `-` as numeric.
- Added truthful source/state detail in the modal, including stale/loading/error/unavailable guidance; no Jira/network/token or workspace data path was changed.
- Validation: `npm run check` passed (31 test files, 160 tests, typecheck, build); `git diff --check` passed.

## QA verdict — 2026-09-03

`TASK 011 — PASS WITH FOLLOW-UPS`

Valmis:

- The existing shared `MetricInsightModal` and `metric-insights.ts` registry are used; no second help system or generic `existing metric unit` fallback remains. Unknown labels receive an explicit unsupported-contract state rather than invented metric copy.
- Registry coverage was independently confirmed for Stories Done, Throughput, Avg Cycle Time, SLE P85, Aging WIP, Done Bug Ratio, Velocity, Bottleneck, Lead Time, Active Time, Cycle Time, Implementation Time, and Waiting Time %. Definitions include metric-specific meaning, local collection/source, calculation, unit, direction, and unavailable guidance.
- Team and Scrum Master render the same `data.kpis` card values through the shared `InsightCardButton`; Scrum Master adds diagnostic detail/coverage. The modal keeps current value/provenance sourced from the existing App-owned data, preserves numeric zero, and treats missing/`-`/blank/nonnumeric previous values as unavailable.
- The modal retains selected-period filtering, deterministic same-period dedupe, adjacent-pair-only history, gap suppression, categorical Bottleneck semantics, P85-only wording without a target/trendline, dialog semantics, focus trap/Escape/outside-close/focus restoration, keyboard point interaction, and responsive CSS.
- Source inspection found no Jira/network/token or customer/workspace data path in the implementation diff, and no legacy Historical Trends or duplicate P85 target surface.
- Focused tests passed: 3 files / 17 tests. Full `npm run check` passed: typecheck, 30 test files / 157 tests, and production build. `git diff --check` passed.

Leitud probleemid:

- `[P2]` The requested `docs/architecture/task-011.md` is absent from the checkout, so the architecture handoff could not be independently compared. The available Designer handoff and task record were reviewed; this is a workflow/documentation gap, not an observed runtime defect.
- `[P2]` No dedicated Task 011 test file or rendered component/browser test was added. Current executable coverage is registry/source-contract coverage embedded in `tests/historical-trends.test.ts`; it does not render every typed card/state or verify desktop/mobile/focus behavior end-to-end.

Avatud follow-up’id:

- Add/restore the Task 011 Architect handoff and reconcile it with the Designer handoff before archival.
- Add rendered component/browser coverage for Team/Scrum Master card activation, typed content/provenance/state variants, modal focus lifecycle, and responsive desktop/mobile layout. Browser smoke was attempted but blocked by the environment’s `listen EPERM` on `::1:5173`.

Järgmine samm:

- Task may proceed with the above follow-ups recorded as non-blocking; no P0/P1 or financial/security/data-safety blocker was found.

## Release QA — TASK 011 v0.5.6 — 2026-09-03

Verdict: `PASS`

Evidence:

- `package.json`, `package-lock.json`, `apps/sm-tool/package.json`, and `apps/sm-tool/package-lock.json` all report `0.5.6`; both lockfiles also have `packages[""].version` set to `0.5.6`.
- The release bump diff contains exactly those four files. All hunks are version-only, including the lockfile root entries; dependency structure is unchanged.
- The approved TASK 011 metric-info implementation remains intact: shared MetricInsightModal/registry, typed metric coverage, truthful previous-value handling, and Team/Scrum Master wiring remain present. Its prior verdict remains `PASS WITH FOLLOW-UPS`.
- `npm run check` passed: typecheck, 31 test files / 160 tests, and production build. `git diff --check` passed.
- No release-scope `Teams/**`, `teams/**`, `workspace.json`, cache, customer-data, token, or unrelated source changes are included in the four-file version diff. Existing dirty workspace/task files and approved implementation changes were excluded from the release assessment.

Open follow-ups:

- Prior TASK 011 Architect-handoff and rendered UI/browser coverage follow-ups remain open and non-blocking for this version-only release.

Next-task status: release may proceed; no v0.5.6 release blocker found.
