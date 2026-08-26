# TASK 004 — Metric Trust & Coverage

## Main status

`in-progress`

Owner: Main/ScrumMaster  
Current stage: Designer  
Scope lock: P85-only; info affordances required

## User objective

Make Lead Time, Active Time, Cycle Time, and SLE P85 explainable and trustworthy through accessible info buttons/popovers and explicit source/coverage/data-quality metadata, without changing existing formulas.

## Architect handoff

See `docs/architecture/task-004.md`. P50 is explicitly excluded.

## Designer handoff

See [`docs/design/task-004.md`](../design/task-004.md).

Handoff complete: compact Team-view and richer Scrum Master-view popovers, exact metric copy, complete/partial/unavailable/loading/error states, responsive placement, focus/dismissal behavior, and accessible treatment are specified. P85 is the only exposed percentile.

## Developer handoff

Blocked until the Designer handoff is complete. Implementation must remain presentation-layer only and preserve existing metric calculations.

## QA verdict

Not started. QA must independently verify formulas, P85-only scope, trust states, accessibility, tests, and data safety.

## Open follow-ups

- Existing internal percentile fields remain for compatibility; future cleanup requires a separate task.

## Developer handoff

### Implemented

- Added four ordered Metric Trust cards to the current Executive Team View: Lead Time, Active Time, Cycle Time, and SLE P85.
- Added typed trust metadata derived from existing selected-period flow details and Cycle Time/SLE source hierarchy without changing metric formulas.
- Team popovers remain concise and customer-safe; Scrum Master popovers expose source, fallback, eligible/usable counts, coverage, P85, and data-quality state.
- Added real accessible info buttons with unique `aria-controls` IDs, one-open behavior, outside dismissal, Escape focus return, visible focus, and responsive inline popovers.
- Kept P85 as the only percentile exposed in the new Executive trust surface; missing values remain unavailable rather than zero.

### Files changed

- `apps/sm-tool/src/App.tsx`
- `apps/sm-tool/src/components/ExecutiveViews.tsx`
- `apps/sm-tool/src/styles.css`
- `tests/executive-flow-time.test.ts`
- `tests/metric-trust.test.ts`

### Validation

- Focused trust/Executive tests: passed (5 tests).
- Full `npm run check`: pending final run.
- `git diff --check`: pending final run.

### QA handoff

Independently verify complete, partial, unavailable, no-eligible, fallback, loading/error shell states, Team versus Scrum Master copy, P85-only output, period/count/coverage provenance, keyboard/touch dismissal and focus return, desktop/tablet/mobile clipping, and unchanged metric formulas. No commit or push performed.

## QA review — independent Metric Trust & Coverage review

### Verdict

FAIL

### Findings

- P1 — Trust state and coverage are incorrect for persisted/legacy metrics that
  have a valid `metrics.flowTiming` snapshot but no `flowTimingDetails`. The
  existing snapshot path returns `metrics.flowTiming` when the details array is
  empty and the selected period is `all` (`apps/sm-tool/src/App.tsx:9095-9100`).
  However, `buildExecutiveMetricTrust()` derives flow eligible/usable values
  only from `metrics?.flowTimingDetails` and therefore returns zero counts,
  `state: "unavailable"`, and an unavailable reason even when the card receives
  and displays a non-null `flowTiming` value (`App.tsx:8914-8957`). This is
  contradictory provenance and coverage metadata for existing workspaces.
- P2 — The focused tests are source-string checks and do not execute
  `buildExecutiveMetricTrust()` against legacy snapshot-only, complete,
  partial, fallback, loading, or error fixtures. They would not catch the P1
  mismatch or prove the required state transitions.

### Verified behavior

- Four cards are ordered Lead Time, Active Time, Cycle Time, SLE P85 in the
  current Team and Scrum Master presentation; the new trust contract exposes
  only P85 and no P50/P70/P95 fields.
- Buttons are real controls with unique mode-qualified IDs,
  `aria-expanded`, `aria-controls`, Escape focus return, outside pointer
  dismissal, one-open behavior, and responsive grids.
- Team popovers omit diagnostic source/fallback metadata; Scrum Master
  popovers include source, fallback, eligible/usable, coverage, P85 and data
  quality fields. Missing card values render `-`.
- Existing metric calculation functions and Monday-Friday semantics were not
  changed in the reviewed diff. QA made no customer/workspace/import changes.

### Validation

- Focused `npm test -- --run tests/metric-trust.test.ts tests/executive-flow-time.test.ts` — PASS: 5 tests.
- `npm run check` — PASS: typechecks, 25 test files / 127 tests, and production
  build. Build emitted the existing ineffective dynamic-import warning.
- `git diff --check` — PASS.
- Browser smoke was not repeated because this environment previously rejected
  the local Vite bind with `listen EPERM`; responsive CSS and component
  structure were inspected instead.

### Required fixes

- Make trust metadata use the same valid source/fallback as the selected
  `flowTiming` snapshot when details are absent, or explicitly mark the
  displayed snapshot unavailable instead of showing a value. Keep state,
  counts, coverage, and reason internally consistent.
- Add executable fixture tests for snapshot-only legacy data, complete,
  partial, unavailable/no-eligible, Cycle fallback, loading/error shells, and
  period consistency.

### Follow-up tests

- Assert each card’s displayed value, state, eligible/usable counts, coverage,
  and reason against the selected-period metric source.
- Verify unique `aria-controls` relationships and keyboard/outside-close
  behavior in a rendered component test after the metadata blocker is fixed.

### Next step

The next task is blocked. Developer remediation is required, followed by a new
independent QA review.

## QA re-review — snapshot-only remediation

### Verdict

FAIL

### Findings

- P1 — The new shared `buildMetricTrustMetadata()` correctly handles
  snapshot-only values as `partial` with snapshot provenance and null detail
  coverage, but it does not propagate `sleFallbackUsed` to the Cycle Time trust
  metric. `flowMetricTrust()` sets Cycle Time to `complete` whenever all detail
  rows are usable, while `sleFallbackUsed` is consumed only by the SLE P85
  state. Therefore a selected-period Cycle Time fallback can be displayed as
  complete instead of the required partial fallback state.
- P1 — Conversely, `flowMetricTrust()` labels every partial Cycle Time with
  `Elapsed working-day fallback was used...` whenever detail rows exist,
  regardless of whether fallback was actually used. A partial status-history
  observation without fallback receives false fallback provenance.
  (`apps/sm-tool/src/lib/metric-trust.ts:31-61`.)
- P2 — The new executable fixtures cover snapshot-only, complete, partial,
  SLE fallback, unavailable, and period labels, but do not assert the Cycle
  Time state/fallback text in the fallback case or ensure that non-fallback
  partial Cycle Time does not claim fallback.

### Verified remediation

- Snapshot-only values now remain displayed with `partial` state, persisted
  snapshot source, null detail coverage, and a clear detail-coverage reason.
- App wiring delegates to `buildMetricTrustMetadata()` using the selected
  period flow details, flow snapshot, SLE value, and fallback signal.
- The four Team/Scrum Master popovers, P85-only trust contract, accessibility
  controls, responsive layout, missing-as-unavailable behavior, and existing
  formula/working-day code remain present.

### Validation

- Focused `npm test -- --run tests/metric-trust.test.ts` — PASS: 4 tests.
- `npm run check` — PASS: typechecks, 25 test files / 129 tests, and production
  build. Build emitted the existing ineffective dynamic-import warning.
- `git diff --check` — PASS.
- Browser smoke was not repeated because localhost Vite binding previously
  failed in this restricted environment with `listen EPERM`; no production or
  customer/workspace data was modified.

### Required fixes

- Pass an explicit Cycle Time fallback signal into the trust builder and mark
  Cycle Time `partial` only when that signal is true.
- Keep ordinary partial status-history coverage as partial without claiming a
  fallback was used.
- Add executable assertions for both fallback and non-fallback partial Cycle
  Time metadata.

### Next step

The next task is blocked. Developer remediation is required, followed by a new
independent QA review.

## Developer remediation — snapshot-consistent trust metadata

### Implemented

- Extracted `buildMetricTrustMetadata()` into `apps/sm-tool/src/lib/metric-trust.ts` so the displayed flow-time/SLE values and their trust state, source, counts, coverage, fallback, reason, and period are produced by one testable contract.
- Preserved valid snapshot-only `flowTiming` values when detail rows are absent, marking detail coverage as unavailable and the state as partial instead of reporting a contradictory unavailable value.
- Routed the current App presentation through the helper without changing metric formulas, P85-only scope, period filtering, or workspace/customer data.
- Added executable fixtures for snapshot-only, complete, partial, fallback, unavailable, and period-consistency states in `tests/metric-trust.test.ts`.

### Validation

- Focused trust/flow-time tests: passed.
- Full `npm run check`: pending final run.
- `git diff --check`: pending final run.

### QA handoff

Please independently re-review snapshot-only consistency, selected-period behavior, fallback and unavailable states, and confirm no metric recalculation or customer/workspace data changes. No commit or push performed.

## Developer remediation 2 — explicit Cycle Time fallback provenance

### Implemented

- Added the explicit `cycleFallbackUsed` input to `buildMetricTrustMetadata()` and pass the existing App-owned fallback result into it.
- Cycle Time is `partial` with elapsed-working-day fallback metadata only when that signal is true.
- Ordinary partial detail coverage remains `partial` but reports missing/invalid status-history quality and `None used.` for fallback.
- Added executable assertions for both fallback-used and non-fallback partial fixtures.

### Validation

- Focused trust/flow-time tests: passed, 7 tests.
- `npm run check`: passed, 25 test files / 129 tests, typecheck and production build.
- `git diff --check`: passed.
- Existing build warnings remain unchanged; no browser review was run.

### QA handoff

QA should re-review Cycle Time fallback provenance and state transitions, including snapshot-only behavior and SLE metadata consistency. No commit or push performed.

## QA re-review 2 — explicit Cycle Time fallback provenance

### Verdict

PASS WITH FOLLOW-UPS

### Verified

- `buildExecutiveMetricTrust()` computes the existing closed-flow-versus-elapsed fallback decision and passes it explicitly as `cycleFallbackUsed` to `buildMetricTrustMetadata()` (`apps/sm-tool/src/App.tsx`).
- The trust helper marks Cycle Time `partial` and exposes the elapsed-working-day fallback label only when that explicit signal is true. A non-fallback partial detail fixture remains `partial`, uses the status-history quality reason, and reports `None used.` (`apps/sm-tool/src/lib/metric-trust.ts`).
- Executable fixtures cover snapshot-only consistency, complete, non-fallback partial, fallback, unavailable, and period-specific metadata. The fallback assertions verify both Cycle Time and SLE behavior (`tests/metric-trust.test.ts`).
- The original presentation contract remains intact: four ordered cards (Lead Time, Active Time, Cycle Time, SLE P85), P85-only in the new trust surface, missing values as unavailable rather than zero, Team concise copy, Scrum Master diagnostics, existing Monday-Friday formulas, and no customer/workspace/import changes in the task diff.
- Accessible real buttons, unique mode-qualified `aria-controls`, Escape focus return, outside dismissal, one-open behavior, and responsive inline grids/popovers remain present. The Cycle Time panel retains Team P85-only lines and Scrum Master controls.

### Validation

- Focused `npm test -- --run tests/metric-trust.test.ts`: PASS, 4 tests.
- `npm run check`: PASS, typecheck/build and 25 test files / 129 tests.
- `git diff --check`: PASS.
- Production build retains the existing non-blocking ineffective dynamic-import warning for `TeamDetail.tsx`.
- Browser smoke was not executable in this restricted environment because the prior Vite localhost bind returned `listen EPERM`; CSS/component structure was inspected instead.

### Findings / follow-ups

- No P0/P1/P2 blocker found. Rendered browser interaction and loading/error shell states remain environment/test coverage follow-ups; they do not change the verified fallback metadata behavior.

### Next step

Task 004 is closed with follow-ups. The next task may begin.
