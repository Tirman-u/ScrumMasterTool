# TASK 003 — Restore flow-time visibility and Cycle Time scatter

## Main status

`in-progress`

Owner: Main/ScrumMaster  
Current stage: Designer  
Scope lock: Architect handoff ready; Designer handoff required

## User objective

Restore visible Lead Time, Active Time, Cycle Time, and the Cycle Time scatterplot in the current Executive Team View without re-enabling the hidden legacy UI or changing metric calculations.

## Architect handoff

See [`docs/architecture/task-003.md`](../architecture/task-003.md).

## Developer handoff

See [`docs/design/task-003.md`](../design/task-003.md).

Implementation remains pending. Developer must reuse existing flow-timing/scatter contracts and avoid a second metric-calculation path.

## QA verdict

Not started.

## Open follow-ups

- Legacy UI cleanup remains outside this task and requires a separate scope after parity QA.

## Developer handoff

### Implemented

- Restored explicit Lead Time, Active Time, and Cycle Time cards in the current ExecutiveTeamView in the approved order.
- Added the Cycle Time scatter panel below the cards in both Team and Scrum Master modes by reusing the existing TeamDetail presentation and App-owned period, SLE, issue-type, and exclusion contracts.
- Team mode uses presentation-only behavior with the P85 line; Scrum Master mode retains percentile controls, issue-type controls, issue table, and exclusion/restore callbacks.
- Preserved nullable values as unavailable, working-day labels, diagnostic Time in Status wording, and the hidden `.legacy-team-ui` subtree.

### Files changed

- `apps/sm-tool/src/App.tsx`
- `apps/sm-tool/src/components/ExecutiveViews.tsx`
- `apps/sm-tool/src/styles.css`
- `tests/executive-flow-time.test.ts`

### Validation

- Focused UI wiring test: passed (2 tests).
- `npm run check`: passed (typecheck, 122 repository tests, production build).
- `git diff --check`: passed.

### QA handoff

Please verify both ExecutiveTeamView modes at desktop and narrow responsive widths, including selected-period changes, null/empty scatter data, P85-only Team presentation, Scrum Master controls/table and exclusion callbacks, accessibility/read-only behavior, and that `.legacy-team-ui` remains hidden. Existing unrelated dirty workspace/customer-data changes were not staged or modified.

## QA remediation handoff

- Made Scrum Master issue-table rows keyboard-operable with focus styling, Enter/Space selection, `aria-selected`, and a live selection announcement.
- Added a visible semantic chart summary with team, selected period, axes, visible SLE lines, and completed-item count.
- Added explicit unavailable reasons for null flow-time values and P50/P85/P95 percentile context, including unavailable percentile states.
- Added invalid-resolution-date omission messaging and a consistent Completed items / dashed SLE legend, including the Team P85 delivery-expectation label.
- Extended the focused fixture-driven regression test for null metrics, invalid dates, legend/summary wiring, and keyboard selection semantics.

Remediation validation: focused test passed (3 tests); `npm run check` passed (24 files, 125 tests, typecheck, build); `git diff --check` passed. Browser review remains for QA to perform independently.

### Follow-up remediation

Updated the accessible chart summary so an SLE percentile is listed as visible only when its line is enabled and its value is non-null; null or disabled percentiles are explicitly reported as `unavailable/not rendered`. Added the null selected-SLE fixture assertion.

Follow-up validation: focused test passed (3 tests); `npm run check` passed (24 files, 125 tests, typecheck, build); `git diff --check` passed.

## QA review — independent flow-time/scatter restoration

### Verdict

FAIL

### Findings

- P1 — The Scrum Master issue table is not a keyboard-accessible selection
  alternative and cannot synchronize selection with the scatter. The table rows
  are plain `<tr>` elements with no button/link, keyboard handler, focus state,
  or selected state (`apps/sm-tool/src/components/TeamDetail.tsx:258-277`),
  while only the SVG scatter click handler updates `selectedIssueKey`
  (`TeamDetail.tsx:225-239`). This fails the explicit requirement that table
  row selection expose the same selected-point state as chart selection.
- P1 — The scatter has no accessible chart summary naming the selected team,
  selected period, x/y axes, visible SLE lines, and point count. The new wrapper
  only provides `aria-label="Cycle Time scatter"`
  (`apps/sm-tool/src/components/ExecutiveViews.tsx:344-369`); the Recharts
  region itself has no equivalent summary or programmatic point count. This
  leaves the primary visualization and its controls materially inaccessible to
  non-pointer users.
- P2 — Null flow-time values render as `-`, but no explicit unavailable reason
  is shown. `FlowTimeCards` only supplies the definition, sample/P85 line, and
  optional previous value (`ExecutiveViews.tsx:318-327`), contrary to the
  required `-` plus a reason for unavailable metrics.
- P2 — Scrum Master cards do not retain the specified percentile detail. They
  show only P85 in the shared subline and an average previous value when
  present (`ExecutiveViews.tsx:318-327`); P50/P85/P95 detail and explicit
  unavailable percentile context are not exposed as specified.
- P2 — Invalid resolution dates are filtered out, but the UI does not report
  how many were excluded. `TeamDetail` maps to timestamps and drops non-finite
  dates (`TeamDetail.tsx:62-70`) then shows only the generic “No completed
  issues in selected period” state (`TeamDetail.tsx:197-199`). The acceptance
  criteria require an invalid-date data note/count when points are omitted.
- P2 — The legend does not identify the Team P85 line as “P85 delivery
  expectation”, does not include a “Completed item” point legend, and renders
  solid CSS legend swatches although the chart reference lines are dashed
  (`TeamDetail.tsx:187-195,241-251`; `styles.css:1625-1652`). This fails the
  specified redundant legend treatment and weakens presentation readability.

### Verified behavior

- Lead Time, Active Time, and Cycle Time are rendered in the required order in
  both current ExecutiveTeamView modes and receive
  `selectedTeamRow.current.flowTiming` from App (`App.tsx:5933-5934`).
- Team mode passes a fixed P85-only visibility map and hides Scrum Master
  controls; Scrum Master mode passes App-owned SLE, issue-type, exclusion and
  restore callbacks (`ExecutiveViews.tsx:344-369`).
- The hidden `.legacy-team-ui` rule remains present and is not re-enabled by
  the target diff. No metric/import/workspace/customer-data logic changes were
  found in the reviewed target diff.
- Null numeric formatting itself is safe (`formatPlainDays` returns `-`), and
  period filtering plus invalid-date filtering are present in the reused panel.
- Responsive CSS stacks the three flow cards at the existing 980px breakpoint,
  wraps the percentile legend, and keeps the chart width constrained to its
  parent. No new obvious horizontal-overflow rule was introduced.

### Validation

- Focused `npm test -- --run tests/executive-flow-time.test.ts` — PASS: 2 tests.
- `npm run check` — PASS: typechecks, 24 test files / 124 tests, and production
  build. Build emitted only the existing dynamic-import chunking warning.
- `git diff --check` — PASS.
- Scope review: target diff is limited to the reported App/ExecutiveViews/CSS
  files plus the focused test; unrelated dirty Teams/workspace/customer files
  and existing app/task changes were not modified.

### Required fixes

- Add a keyboard-operable table-row selection path synchronized with
  `selectedIssueKey`, plus visible focus/selected semantics.
- Add an accessible chart summary including team, period, axes, visible SLE
  lines, and point count.
- Add explicit unavailable reasons, Scrum Master percentile detail, invalid-date
  exclusion messaging, and the required redundant scatter legend wording/dash
  treatment.

### Follow-up tests

- Add fixture-driven Team and Scrum Master tests for normal, empty, null-SLE,
  invalid-date, and unavailable states; assert period changes update cards,
  points, lines, legend, and table together.
- Add keyboard tests for table selection, focus, controls, exclusion/restore,
  and assert `.legacy-team-ui` remains hidden.

### Next step

The next task is blocked. Developer remediation is required, followed by a new
independent QA review.

## QA re-review — remediation

### Verdict

PASS WITH FOLLOW-UPS

### Findings

- P2 — When a selected SLE percentile is nullable, the visible chart summary
  lists it under `visible SLE` based on toggle state even though no reference
  line is drawn; the legend correctly says `Pxx unavailable`. The summary
  should distinguish available visible lines from selected-but-unavailable
  percentiles to avoid a contradictory accessibility description.

### Verified remediation

- Scrum Master issue rows now expose `role="button"`, `tabIndex`,
  `aria-selected`, visible focus/selected styling, and Enter/Space selection;
  selection updates the same `selectedIssueKey` used by chart selection and
  exclusion controls.
- The panel now presents a visible chart summary containing team, period,
  resolution-date x-axis, Cycle Time working-day y-axis, SLE context, and
  completed-item count.
- Null averages show an explicit unavailable reason; P50/P85/P95 context and
  unavailable percentile labels are present.
- Invalid resolution dates are counted and reported as omitted.
- The legend now includes Completed items, Team P85 delivery-expectation
  wording, and dashed SLE swatch styling.
- Team mode remains read-only/P85-only; Scrum Master controls and callbacks
  remain wired; `.legacy-team-ui` remains hidden.
- Responsive CSS stacks cards and wraps legend/controls without a new obvious
  horizontal overflow path.

### Validation

- Focused `npm test -- --run tests/executive-flow-time.test.ts` — PASS: 3 tests.
- `npm run check` — PASS: typechecks, 24 test files / 125 tests, and production
  build. Build emitted the existing ineffective dynamic-import chunking warning.
- `git diff --check` — PASS.
- Browser smoke was attempted but could not start the local Vite server in this
  restricted environment (`listen EPERM` on localhost:5173). Source and
  responsive CSS inspection covered Team/Scrum Master structure and mobile
  stacking; no production or customer-data files were modified.

### Required fixes

- None blocking the task.

### Follow-up tests

- Add an edge assertion that a null selected SLE percentile is described as
  unavailable in the accessible chart summary, not as a visible line.
- Run desktop/mobile browser smoke in an environment where the local server can
  bind, including period changes, no-data states, and keyboard table selection.

### Next step

The task is closed with follow-ups. The next task may begin.

## QA final re-review — accessible SLE summary fix

### Verdict

PASS WITH FOLLOW-UPS

### Findings

- P3 — The focused test asserts the new `unavailable/not rendered` source
  contract, but does not execute the summary mapping with both a null percentile
  and a toggled-off non-null percentile. The production predicate itself is
  correct and this is test-strength follow-up only.

### Verified behavior

- `sleLineSummary` describes a percentile as visible only when both
  `lineVisibility[key]` is true and `overlay[key]` is non-null.
- Null percentiles and toggled-off percentiles are described as
  `unavailable/not rendered` and are not drawn by the existing nullable
  `ReferenceLine` guards.
- Existing Team P85 labeling, Scrum Master percentile controls, chart summary,
  invalid-date note, keyboard table selection, and prior flow-time wiring remain
  intact.

### Validation

- Focused `npm test -- --run tests/executive-flow-time.test.ts` — PASS: 3 tests.
- `npm run check` — PASS: typechecks, 24 test files / 125 tests, and production
  build. The existing ineffective dynamic-import warning remains non-blocking.
- `git diff --check` — PASS.
- No production/customer-data files were edited by QA; browser smoke remains
  environment-unverified because localhost binding previously failed with
  `listen EPERM`.

### Required fixes

- None blocking this task.

### Follow-up tests

- Replace or supplement the source-string assertion with a small executable
  summary-mapping test covering null, toggled-off, and active non-null lines.

### Next step

The task is closed with a low-risk test follow-up. The next task may begin.
