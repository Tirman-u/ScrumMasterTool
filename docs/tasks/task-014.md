# TASK 014 — Waiting Time %

## Main status

`in-progress`

Owner: Main/ScrumMaster
Current stage: Designer
Scope lock: one Executive Waiting Time % card with Task 010/011 insight modal reuse

## User objective

Show the share of usable Cycle-only time spent waiting outside Implementation, with truthful coverage and unavailable semantics.

## Architect handoff

Waiting Time % = summed usable Cycle-only waiting duration outside Implementation / summed usable Cycle Time duration × 100. New Cycle Time uses old Active semantics. Lead-only, Done, unknown/unmapped, invalid/missing are excluded and reduce coverage; zero denominator is unavailable. Reuse the existing metric insight modal; no standalone history/Visual Analytics duplicate.

## Designer handoff

Complete: [docs/design/task-014.md](../design/task-014.md). Defines card placement, exact formula/copy, modal reuse, Team/Scrum Master parity, current/change/direction, sample/usable/coverage/provenance, complete/partial/unavailable/conflict/stale/error states, optional gap-aware history, responsive/200% layout, keyboard/touch/accessibility, and QA acceptance criteria.

## Developer handoff

Blocked until Main routes the approved Designer handoff. Do not add a second history/help surface, change metric formulas, expose raw legacy confusion, or modify customer/workspace data outside approved behavior.

## QA verdict

Not started. QA must independently verify formula, exclusions/denominator, coverage, provenance parity, state truthfulness, modal accessibility, responsive behavior, and unchanged data boundaries.

## Open follow-ups

- Waiting Time % remains unavailable until a usable Cycle Time denominator and approved historical contract exist.

## QA verdict

`TASK 014 — FAIL`

### Evidence (2026-09-03)

- Focused validation passed: `npx vitest run tests/metric-trust.test.ts tests/executive-flow-time.test.ts tests/metrics.test.ts` — 3 files / 26 tests.
- Full validation passed: `npm run check` — typecheck, 33 test files / 180 tests, and production build. `git diff --check` passed.
- The implemented aggregate uses `activeTimeDays` as Cycle Time and `cycleTimeDays` as Implementation Time, excludes invalid/non-nested rows, sums durations before division, and returns unavailable for a zero denominator (`apps/sm-tool/src/lib/metric-trust.ts:99-137`).
- The Waiting Time % card is present once in the shared `kpis` list used by Team and Scrum Master (`apps/sm-tool/src/App.tsx:6470-6477`; `apps/sm-tool/src/components/ExecutiveViews.tsx:909,933`).

### Blocking findings

- **P1 — Waiting Time trust/provenance is not wired into the rendered insight modal.** `MetricTrust` computes `eligibleCount`, `usableCount`, `coveragePct`, state, period, and basis, but the card is flattened into an `ExecutiveTeamMetric` carrying only a formatted value, `prev: "-"`, and `detail: reason` (`apps/sm-tool/src/App.tsx:6388-6389,6470-6477`). `MetricInsightModal` receives no `MetricTrust`; it derives sample/usable as `Unavailable` for non-history metrics and uses generic progress snapshots for `As of`/`Captured` (`apps/sm-tool/src/components/ExecutiveViews.tsx:826-851,890`). Therefore the required Waiting Time current value is not accompanied by its actual sample/usable/coverage/provenance/state metadata, and the modal cannot show a truthful available previous comparison. This fails the core provenance/truthfulness acceptance criterion.
- **P2 (blocking under project rules) — Card status is falsely successful for non-complete states.** The Waiting Time card always passes tone `"good"`, including partial and unavailable results (`apps/sm-tool/src/App.tsx:6470`), while the approved state matrix requires partial/unavailable to remain visually distinct from success. The modal only exposes the reason as free-form detail; card state and tone are not derived from `waitingTimeTrust.state`.
- **P1 process gate — Required Architect handoff is absent.** `docs/architecture/task-014.md` does not exist in the checkout, so the requested architecture acceptance comparison and required Architect-first gate cannot be independently verified. The task record contains only a summary and the Designer handoff links to the missing document.

### Scope and limitations

- No production code or customer/workspace files were modified by QA. The checkout contains pre-existing dirty `Teams/**` and `workspace.json` changes; they were excluded from review. Task 014 implementation changes are limited to the reported App/view/trust/insight/test files plus this task record.
- Browser/File System Access smoke was not run in this review; source-level accessibility wiring and the existing focused contracts were inspected. This is an environment/coverage limitation, not the reason for FAIL.

### Required remediation / next step

- Developer must pass the full Waiting Time trust object (including state, coverage, sample/usable, period/as-of, captured-at, and source) through the existing modal contract, derive current/previous only from valid adjacent comparable data, and map non-complete states to truthful card presentation without changing formulas or data scope.
- Restore/provide the approved `docs/architecture/task-014.md` handoff, then rerun focused and full QA. **Next task is blocked until remediation and a new QA verdict.**

## QA re-review — remediation

`TASK 014 — FAIL`

### Re-review evidence (2026-09-03)

- `docs/architecture/task-014.md` is now present and was reviewed together with the Designer handoff.
- Focused validation passed: `npx vitest run tests/metric-trust.test.ts tests/executive-flow-time.test.ts tests/metrics.test.ts` — 3 files / 27 tests.
- Full validation passed: `npm run check` — typecheck, 33 test files / 181 tests, and production build. `git diff --check` passed.
- The remediation now passes `metricTrust` on the Waiting Time executive metric and the modal renders its typed value, state, reason, asOf, capturedAt, sample, usable, unknown, source, and basis (`apps/sm-tool/src/App.tsx:6470-6480`; `apps/sm-tool/src/components/ExecutiveViews.tsx:840-851,879-890`). Team and Scrum Master both consume the same `kpis` list (`apps/sm-tool/src/components/ExecutiveViews.tsx:909,933`).
- The card tone now distinguishes complete, partial, and unavailable (`apps/sm-tool/src/App.tsx:6390-6391,6472`), and the exact aggregate formula/zero-denominator behavior remains covered by executable fixtures (`apps/sm-tool/src/lib/metrics.ts:17-53`; `tests/metric-trust.test.ts:119-132`).

### Remaining blockers

- **P1 — Typed snapshot provenance/state is not authoritative in the trust adapter.** `waitingTimeTrust` always emits `source: "Local flowTiming detail snapshot"` and derives state only from `value`/`usableCount`, ignoring `snapshot.source` and `snapshot.coverageState` (`apps/sm-tool/src/lib/metric-trust.ts:111-138`). A `local-import`, `local-cache`, or `conflict` snapshot can therefore be presented as the wrong source or as complete/partial rather than conflict. The architecture contract requires source parity and distinct conflict/needs-review semantics; this is a core provenance/truthfulness failure.
- **P1 — Required state contract is incomplete.** `MetricTrustState` has only `complete | partial | unavailable | loading | error`; it has no conflict/stale/needs-review state, and the card/modal path does not map `WaitingTimeSnapshot.coverageState` to a distinct conflict or stale-last-known presentation. Global `dataStatus` can show a generic error/stale message, but it does not make the Waiting Time snapshot state authoritative or preserve a conflict reason. The executable tests cover complete/partial/unavailable but not conflict, stale, error/retry, or local source variants (`apps/sm-tool/src/lib/metric-trust.ts:3-5`; `tests/metric-trust.test.ts:136-169`).
- **P2 — Previous comparison is not fully adjacent-contract aware.** App computes the previous snapshot by subtracting one calendar month and does not validate a comparable configuration/version or a persisted contiguous snapshot before exposing `previousValue` (`apps/sm-tool/src/App.tsx:9561-9578`). Missing detail naturally yields no comparison, but changed status configuration or a non-comparable source can still produce a comparison, contrary to the handoff’s explicit invalidation rules.

### Scope and limitations

- No production code or customer/workspace file was changed by QA. Pre-existing dirty `Teams/**`, `workspace.json`, and unrelated task records remain out of scope. No Jira/network/token/admin path was introduced by the reviewed Task 014 diff.
- Browser/File System Access smoke was not run; this remains a separate environment coverage limitation. It does not replace the source and executable-test findings above.

### Required next step

- Developer must preserve `WaitingTimeSnapshot.source` and `coverageState` through the typed adapter, represent conflict/stale/error/needs-review distinctly, and add executable fixtures for those states plus source parity and contiguous-comparison invalidation. **FAIL blocks the next task; remediation must be followed by another independent QA review.**

## QA re-review 3 — final

`TASK 014 — PASS WITH FOLLOW-UPS`

### Evidence (2026-09-03)

- Architecture and Designer handoffs reviewed. The remediation now preserves typed WaitingTime snapshot `source`, `coverageState`, operational state, `semanticVersion`, `asOf`, `capturedAt`, counts, and retry metadata through metrics/App/MetricTrust and into the rendered shared MetricInsightModal (`apps/sm-tool/src/lib/metrics.ts:17-58`, `apps/sm-tool/src/lib/metric-trust.ts:124-188`, `apps/sm-tool/src/components/ExecutiveViews.tsx:843-890`).
- Current and previous comparison is guarded by finite current value plus matching semantic version and persisted contiguous period selection; current unavailable/error/stale/needs-review cannot render a change or “Unchanged from previous” (`apps/sm-tool/src/App.tsx:9578-9581`, `apps/sm-tool/src/App.tsx:6474-6484`, `apps/sm-tool/src/components/ExecutiveViews.tsx:848-851`).
- Card tone follows complete/partial/unavailable-or-operational state, and one Waiting Time % card is shared by Team and Scrum Master through `kpis`; no duplicate Waiting chart/panel was added.
- Formula remains the aggregate ratio of summed Cycle-only waiting (`activeTimeDays - cycleTimeDays`) to summed Cycle Time (`activeTimeDays`) × 100. Invalid/non-nested rows reduce coverage and a zero denominator is unavailable, never 0%. Task 012/013 naming, canonical duration semantics, overlap handling, and Monday-Friday basis remain intact.
- Focused validation passed: 3 files / 30 tests. Full `npm run check` passed: typecheck, 33 test files / 184 tests, and production build. `git diff --check` passed.
- No Jira/network/token/admin behavior or customer/workspace data was changed by QA. Pre-existing dirty `Teams/**` and `workspace.json` were preserved and excluded.

### Follow-ups

- Browser/File System Access smoke was not run in this environment; source-level accessibility/focus/modal wiring and executable contracts were inspected. This is a non-blocking environment limitation.
- Existing test coverage is strong for formula, state, provenance, and comparison guards; retain a future browser regression for Team/Scrum Master keyboard open, modal focus restore, and mobile reflow.

### Next step

- **PASS WITH FOLLOW-UPS. The next task may begin.** Follow-ups are non-blocking and do not change the approved scope.

## QA re-review 2 — remediation 2

`TASK 014 — FAIL`

### Re-review evidence (2026-09-03)

- `docs/architecture/task-014.md` and `docs/design/task-014.md` were independently reviewed.
- The typed snapshot now flows from the metrics contract through App into `MetricTrust`, and the rendered `MetricInsightModal` reads trust value/state/provenance/counts (`apps/sm-tool/src/types/contracts.ts:280-306`, `apps/sm-tool/src/App.tsx:9562-9591`, `apps/sm-tool/src/components/ExecutiveViews.tsx:843-890`).
- `source`, `coverageState`, semantic version, retry state, captured time, and comparable persisted predecessor are represented in the adapter (`apps/sm-tool/src/lib/metric-trust.ts:138-188`). Team and Scrum Master render the same Waiting Time KPI through their shared `kpis` list.
- Focused validation passed: 3 files / 27 tests. Full `npm run check` passed: typecheck, 33 test files / 181 tests, and production build. `git diff --check` passed.
- Formula and zero-denominator behavior remain aggregate and fail-closed in `apps/sm-tool/src/lib/metrics.ts:17-58`; no Jira/network/token/admin path or customer/workspace data change was introduced by QA.

### Remaining blocking finding

- **P1 — Modal reports a comparison when the current Waiting Time value is unavailable.** App supplies a valid `previousValue` and sets `trend` to `"flat"` whenever `waitingTimeTrust.value` is `null` (`apps/sm-tool/src/App.tsx:6474-6477`). The modal independently renders `Unchanged from [previous]` whenever `previousValue` exists, without checking `currentValueUnavailable` (`apps/sm-tool/src/components/ExecutiveViews.tsx:846-850`). Thus an unavailable/error/needs-review current result can display a false unchanged comparison against a valid predecessor. The handoff explicitly requires no comparison for an unknown current value. Add an executable regression fixture for current unavailable + valid previous and suppress change/direction until current is valid.

### Follow-up coverage

- Browser/File System Access smoke was not available in this review; source-level wiring and tests were checked. Existing tests now cover source/state/semantic-version fixtures, but do not cover the current-unavailable + previous-valid modal behavior above.
- **Next task remains blocked** until the P1 comparison guard is remediated and QA repeats the review.

## Developer implementation evidence

Added one `Waiting Time %` entry to the existing Executive Flow Time trust-card collection and reused the existing metric-insight disclosure path. The value is an aggregate ratio of usable Cycle-only waiting duration (`activeTimeDays - cycleTimeDays`) outside Implementation Time over usable Cycle Time duration (`activeTimeDays`) multiplied by 100. The existing metrics pipeline supplies these durations through the validated Task 013 canonical classifier; overlapping Cycle/Implementation status membership is therefore counted once in the existing duration values. Invalid or missing pairs are excluded and reduce coverage, while a zero denominator remains unavailable rather than becoming `0%`.

The card exposes `%` units, lower-is-better semantics, the exact formula, local source, sample/usable/coverage, Monday-Friday basis, and truthful complete/partial/unavailable reasons in Team and Scrum Master presentations through the same `MetricTrust` object. No Jira/network/token/admin path, standalone history/chart, or customer/workspace data was added. Executable fixtures cover aggregate numerator/denominator behavior, invalid-row exclusion, partial coverage, zero denominator, unavailable snapshot-only data, and canonical card labeling.

## Developer follow-up evidence

Waiting Time % is now included once in the shared Executive KPI list used by both Team and Scrum Master views, so it opens the existing `MetricInsightModal` rather than a second trust/history surface. Its `%` unit, exact aggregate formula, local detail source, state reason, and coverage detail are passed through the same metric object. A missing previous value remains `-`, which the existing modal treats as unavailable rather than inventing a comparison; historical trend rendering remains absent until real comparable Waiting Time % snapshots exist. Focused tests cover both view wiring, percent/formula/provenance content, aggregate ratio behavior, exclusion/partial state, zero denominator, and no-false-previous semantics.

## Developer remediation evidence

Added the typed `WaitingTimeSnapshot` contract to `TeamMetrics` and preserve/derive it for local recalculation and cache normalization. `MetricTrust` now carries the Waiting Time snapshot’s state, sample/usable/unknown counts, selected-period `asOf`, `capturedAt`, source, basis, and previous comparable snapshot value. The Waiting Time KPI attaches this trust object to `ExecutiveTeamMetric`; the existing `MetricInsightModal` reads it directly for current value, state, formula, provenance, coverage, and comparison instead of flattening to a hardcoded previous value or generic progress snapshot. Card tone is derived from trust state (`complete` good, `partial` warning, unavailable neutral).

Executable tests cover typed modal wiring, percent/formula/provenance, valid previous comparison, unavailable predecessor behavior, state-derived tone, exact aggregate ratio, exclusions, zero denominator, and Team/Scrum Master shared KPI rendering. No Jira/network/token/admin path or customer/workspace data was changed.
### Developer remediation 2 evidence

- Waiting Time now preserves the authoritative typed snapshot source, coverage state, operational state, reason, period, capturedAt, counts, and semantic metadata through MetricTrust and the shared MetricInsightModal contract. Snapshot conflict, stale-last-known, needs-review-config, unavailable-no-source, and error-with-retry states are not inferred from global status or downgraded to complete/partial.
- Previous Waiting Time comparison is selected only from persisted snapshots with an exact selected-period key and matching deterministic workflow semantic version; details and calendar-month heuristics are not used as a predecessor.
- Added executable trust fixtures for source parity, distinct snapshot states, and non-comparable semantic versions.

### Developer remediation 3 evidence

- Waiting Time card trend and modal change are now emitted only when both current and previous values are finite and comparable. An unavailable/error/stale-without-current/needs-review current snapshot cannot produce `flat` or “Unchanged from …”; its previous/change/direction remains unavailable.
- Added an executable regression fixture covering an unavailable current snapshot with a valid previous value.

## Release QA — v0.5.9

`TASK 014 RELEASE — PASS`

### Evidence (2026-09-03)

- Root and app `package.json` files are `0.5.9`; root and app lockfiles are also `0.5.9`, including both `packages[""].version` entries.
- Release hunks are version-only: each of the four files changes only its package version and, for lockfiles, the lock root version. A JSON comparison with all version fields removed reports `version-only` for all four files; dependency structure is unchanged.
- The approved Waiting Time implementation remains present: typed snapshot → MetricTrust → shared MetricInsightModal, exact aggregate formula, semantic-version comparison guard, and state-derived card tone.
- The release-specific file set is exactly the four package/lock files. Existing Task 014 source/docs changes and pre-existing dirty `Teams/**`, `workspace.json`, cache, imports, and unrelated task files were not treated as release changes and were not modified by QA.
- `npm run check` passed: typecheck, 33 test files / 184 tests, and production build. `git diff --check` passed.

### Verdict and next step

- No release blocker found. No version bump was performed by QA; no commit, push, or deploy was performed.
- **PASS. Release may proceed to Main’s release decision.**
