# TASK 005 — Separate Cycle Time tab, unified time filter, per-team recalculate

## Main status

`in-progress`

Owner: Main/ScrumMaster
Current stage: Designer
Scope lock: approved; UI handoff required

## User objective

Move Cycle Time issue-level diagnostics into a dedicated tab, unify period selection, add local per-team recalculation, and distinguish source freshness from calculation time.

## Architect handoff

See `docs/architecture/task-005.md`.

## Designer handoff

See [`docs/design/task-005.md`](../design/task-005.md).

Handoff complete: tab hierarchy, shared period control, timestamp/stale copy, local Recalculate states, Team/Scrum Master Cycle Time differences, responsive behavior, and accessibility criteria are specified.

## Developer handoff

Blocked until Designer handoff is approved. Preserve the local-only, no-Jira/no-token and no-customer-data boundary.

## QA verdict

Not started. QA must independently verify tab migration, period consistency, per-team local recalculation, timestamp provenance, browser behavior, accessibility, data safety, and scope.

## Open follow-ups

- Legacy markup cleanup remains out of scope until a separate parity/cleanup task.

## Developer implementation notes

### Implemented

- Added first-class App-owned `Overview` and `Cycle Time` tabs to the active Executive team route with real tab semantics, keyboard navigation, stable panel IDs, and validated URL/popstate restoration for team, mode, tab, and period.
- Moved the shared `TeamDetail` scatter/table/diagnostic surface out of both active Overview render paths; it is rendered only by the Cycle Time panel. The hidden legacy subtree remains unchanged.
- Kept one period control in App and passed it into the active route shell so period changes persist across tabs and modes and continue to drive existing snapshots, trends, SLE/P85, scatter, and table filters.
- Added selected-team local `analyzeTeam` recalculation with duplicate-click protection, loading/success/error/unavailable status, last-known data preservation, and no Jira/token/network path.
- Added distinct `Last data update` from the latest valid imported-file `updatedAt`, `Last calculated` from `TeamMetrics.generatedAt`, stale comparison, and explicit text guidance.
- Added executable timestamp/state fixtures and route/content-split wiring assertions in `tests/task-005.test.ts`.

### Validation

- Focused tests: pending final full run.
- `npm run check`: pending final run.
- `git diff --check`: pending final run.

### QA handoff

QA must independently verify desktop/mobile rendering, direct URL and Back/popstate behavior, period consistency, selected-team-only recalculation including failure/concurrency, timestamp provenance/staleness, Team/Scrum Master Cycle Time differences, empty/malformed states, and the unchanged hidden legacy subtree. No commit or push performed.

## QA review — independent TASK 005 review

### Verdict

FAIL

### Findings

- P1 — Browser history does not record all required route-state changes. `handleTeamTabChange()` uses `pushState`, but the central route effect updates URL state with the default `replaceState` for `teamViewMode` and `periodMonth` (`apps/sm-tool/src/App.tsx:1973-1978`, `2840-2849`). Consequently, changing the period or mode and pressing Back cannot restore the immediately preceding period/mode state as required by the route/back acceptance. Expected: validated team, mode, tab, and period transitions produce restorable history entries, while `popstate` restores them without recalculation.
- P2 — The focused TASK 005 tests are not executable behavior tests for the core route/recalculate contract. `tests/task-005.test.ts` has only two tests: one executes timestamp helper fixtures, while the second only checks source strings (`tests/task-005.test.ts:9-38`). It does not exercise direct valid/invalid deep links, period consistency, Back/popstate, refresh, selected-team-only analysis, duplicate-click suppression, failure/last-known-data preservation, or the no-Jira/no-token path. These acceptance-critical behaviors therefore remain unverified.

### Verified behavior

- Active `ExecutiveTeamView` exposes real Overview and Cycle Time tabs, stable tabpanel IDs, arrow/Home/End keyboard handling, and mode-specific Cycle Time rendering. The hidden legacy subtree remains present and not re-enabled.
- Overview no longer renders `CycleTimePanel`; Cycle Time renders it with Team compact and Scrum Master diagnostic mode. The shared App period picker is passed to the active route and existing snapshots/trends/SLE/scatter/table data continue to use `periodMonth`.
- `buildTeamDataStatus()` selects the latest valid imported-file `updatedAt`, validates `generatedAt`, and marks stale only when valid source data is newer than valid calculated data. Missing timestamps remain unavailable.
- Selected-team recalculate calls the existing local `analyzeTeam(selectedTeam)` and reloads local workspace state; loading guards, success/error/unavailable messages, and old state preservation are present in the inspected implementation. No Jira/token/network/admin code was added.
- TASK 004 trust UI and metric/formula code are preserved in the reviewed target diff. Customer/workspace files were not modified by QA and remain unrelated dirty workspace state.

### Validation

- Focused `npm test -- --run tests/task-005.test.ts tests/executive-flow-time.test.ts`: PASS, 2 files / 5 tests.
- `npm run check`: PASS, typecheck, 26 test files / 131 tests, and production build.
- `git diff --check`: PASS.
- Browser smoke attempted, but `npm run sm:dev` could not bind localhost in this restricted environment (`listen EPERM ::1:5173`). Desktop/mobile visual and Back/popstate behavior are consequently unverified in the browser.
- Existing non-blocking build warnings remain: ineffective `TeamDetail.tsx` dynamic import and large bundle warning.

### Required fixes

- Make required period/mode route transitions history-restorable (for example, use intentional `pushState` entries for user changes while retaining replace behavior for hydration/canonicalization), and add executable tests proving Back/popstate restores team/mode/tab/period without recalculation.
- Add executable recalculate fixtures or component-level tests for selected-team-only analysis, duplicate activation, success, failure with last-known data, unavailable workspace, and explicit no-Jira/no-token behavior.

### Next step

The next task is blocked. Developer remediation is required, followed by a new independent QA review.

## Developer remediation — route history and executable coverage

### Implemented

- Replaced state-driven route replacement with explicit user-originated `pushState` transitions for team mode, tab, period, and team selection. Hydration/canonicalization uses at most one `replaceState`; `popstate` restores validated state without writing history or recalculating.
- Added validation for month, named, and range periods and canonicalized invalid deep links safely to the non-team route while preserving unrelated query parameters.
- Added executable route fixtures covering valid/invalid deep links, range-period preservation, serialization, push/replace/no-op history decisions, and simulated Back restoration without a history loop.
- Added executable selected-team recalculate fixtures covering target-only analysis, duplicate suppression, success refresh, failure with last-known data preserved, and route/period preservation. The production path remains the existing local `analyzeTeam` path with no Jira/token/network invocation.

### Validation

- Focused tests: PASS — 3 files, 11 tests (`tests/task-005.test.ts`, `tests/executive-flow-time.test.ts`, `tests/metric-trust.test.ts`).
- `npm run check`: PASS — typecheck, 26 test files / 133 tests, production build.
- `git diff --check`: PASS.
- Build warnings unchanged: ineffective dynamic import for `TeamDetail.tsx` and large bundle warning.

### QA handoff

Please independently re-review browser Back/Forward, direct and invalid deep links, refresh behavior, period/mode/tab restoration, no-history-loop behavior, and selected-team recalculation concurrency/failure in desktop and mobile layouts. No commit or push was performed.

## Developer remediation 2 — production range-period contract

### Implemented

- Reused the production `parseRangePeriod` helper in route validation; the route no longer maintains a second range grammar.
- Valid range URLs now use and preserve `range:YYYY-MM..YYYY-MM`, alongside existing month, named, and `all` periods. Malformed ranges are rejected safely.
- Extended executable route fixtures to create ranges with `buildRangePeriod`, then serialize, parse, validate, and restore them through the popstate/no-loop path. The former `YYYY-MM:YYYY-MM` mismatch is explicitly rejected.

### Validation

- Focused route tests: PASS — 4 tests.
- `npm run check`: PASS — 26 test files / 133 tests, typecheck, and production build.
- `git diff --check`: PASS.

### QA handoff

Please re-review real range deep links and Back/Forward restoration in the browser. No commit or push was performed.

## Developer remediation 3 — semantic month validation

### Implemented

- Updated the shared `isMonthPeriod` contract to accept only semantically valid `YYYY-MM` values with months `01` through `12`; year shape remains unchanged.
- `parseRangePeriod` and `buildRangePeriod` inherit the same validation, so invalid standalone months and range endpoints (`00`, `13`, `99`, malformed shapes) are rejected safely while valid `01`/`12` and production ranges continue to round-trip.
- Added executable boundary fixtures for standalone months, range endpoints, malformed range syntax, route canonicalization, and production range serialization.

### Validation

- Focused period/route/task tests: PASS — 6 tests.
- `npm run check`: PASS — 26 test files / 133 tests, typecheck, and production build.
- `git diff --check`: PASS.
- No metric/date calculation semantics were changed beyond rejecting impossible month tokens.

### QA handoff

Please re-review semantic month boundaries and range deep-link canonicalization. No commit or push was performed.

## QA re-review 3 — semantic month validation

### Verdict

PASS WITH FOLLOW-UPS

### Verified behavior

- Shared production `isMonthPeriod()` now accepts only `YYYY-MM` with month `01` through `12`; `00`, `13`, `99`, short, and oversized month shapes are rejected.
- `parseRangePeriod()` and `buildRangePeriod()` inherit this shared contract. Valid boundary ranges (`01` and `12`) and production `range:YYYY-MM..YYYY-MM` values remain valid; malformed range syntax and old `YYYY-MM:YYYY-MM` syntax are rejected.
- `team-route.ts` delegates range validation to `parseRangePeriod()` and does not duplicate the range grammar. Production range values round-trip through build → serialize → parse → validate and through the simulated history/popstate no-loop path.
- Existing period callers remain compatible: focused `team-health` fixtures covering range periods pass. No metric/date calculation logic was changed beyond rejecting impossible month tokens.
- Prior TASK 005 route push/replace/popstate behavior, selected-team recalculate helper, duplicate suppression, failure retention, Overview/Cycle split, shared period, timestamps/stale states, Team/Scrum Master behavior, accessibility/responsive structure, formulas, hidden legacy subtree, and customer/workspace scope remain intact by inspection.

### Validation

- Focused `npm test -- --run tests/task-005.test.ts tests/team-health.test.ts tests/executive-flow-time.test.ts`: PASS, 3 files / 43 tests.
- `npm run check`: PASS, typecheck, 26 test files / 133 tests, and production build.
- `git diff --check`: PASS.
- Browser smoke attempted; Vite could not bind localhost in this restricted environment (`listen EPERM ::1:5173`). This is an environment limitation, not a code blocker.
- Existing non-blocking build warnings remain: ineffective `TeamDetail.tsx` dynamic import and large bundle warning.

### Follow-up

- When localhost execution is available, perform real desktop/mobile Back/Forward and refresh smoke for valid and malformed deep links. No P0/P1/P2 blocker was found in the current code or executable checks.

### Next step

Task 005 is closed with follow-ups. The next task may begin.

## Release QA — version 0.4.0

### Verdict

PASS

### Verified

- Root `package.json`, root `package-lock.json` package root, app `apps/sm-tool/package.json`, and app `apps/sm-tool/package-lock.json` package root all report version `0.4.0`.
- The release diff for the version bump is limited to those four version files: package names and lockfile structure are unchanged, with no dependency updates.
- No `apps/sm-tool/public` cache-bust or legacy public asset changes were introduced by the release bump.
- Existing dirty `Teams/**` and workspace/customer files remain outside the release bump and were not modified by QA; the approved TASK 005 implementation remains separate from the four-file version change.

### Validation

- `npm run check`: PASS — 26 test files / 133 tests, typecheck, and production build.
- `git diff --check`: PASS.
- Build warnings remain unchanged and non-blocking.

### Next step

The 0.4.0 release bump is QA-approved. The next task may begin.

## QA re-review 2 — production range contract

### Verdict

FAIL

### Findings

- P2 — Malformed month values in a range deep link are still accepted. `validateTeamRoute()` correctly delegates range grammar to `parseRangePeriod()`, but the shared helper's `isMonthPeriod()` only checks `^\\d{4}-\\d{2}$`; it does not enforce month `01`–`12`. Therefore values such as `range:2026-99..2026-99` pass route validation instead of being rejected/canonicalized as malformed. This violates the explicit malformed-range acceptance and can drive a selected period that the period implementation cannot resolve to a real month.

### Verified behavior

- `team-route.ts` now imports and reuses production `parseRangePeriod()`; it has no duplicate range grammar.
- Production-format `buildRangePeriod("2026-01", "2026-03")` is used by the executable fixture and round-trips through serialize → parse → validate. The old mismatched `2026-01:2026-03` form is explicitly rejected.
- Route history fixtures cover user push, canonicalization replace, popstate no-op, and simulated Back restoration. Recalculate fixtures cover selected-team-only analysis, duplicate suppression, success refresh, and old-data retention on failure.
- Prior Overview/Cycle split, shared period wiring, timestamp/stale semantics, Team/Scrum Master controls, accessibility/responsive structure, formulas, hidden legacy subtree, and no customer/workspace changes remain intact by inspection.

### Validation

- Focused `npm test -- --run tests/task-005.test.ts tests/executive-flow-time.test.ts tests/metric-trust.test.ts`: PASS, 3 files / 11 tests.
- `npm run check`: typecheck, 26 test files / 133 tests, and production build PASS. The combined command then failed only because the requested browser dev server could not bind localhost (`listen EPERM ::1:5173`).
- `git diff --check`: PASS.
- Browser smoke unavailable for the same localhost bind restriction; this is an environment limitation, not the malformed-range defect.
- Existing build warnings remain non-blocking: ineffective `TeamDetail.tsx` dynamic import and large bundle warning.

### Required fix

- Tighten the shared month validation used by `parseRangePeriod()`/`buildRangePeriod()` or add route-level semantic month validation, then add executable fixtures for invalid month ranges (e.g. 00, 13, and reversed/invalid endpoints) and their safe canonicalization.

### Next step

The next task is blocked. Developer remediation is required, followed by a new independent QA review.

## QA re-review — route/recalculate remediation

### Verdict

FAIL

### Findings

- P1 — The production range-period route contract is internally inconsistent. The existing `buildRangePeriod()`/`parseRangePeriod()` contract produces and consumes `range:YYYY-MM..YYYY-MM` (`apps/sm-tool/src/lib/period.ts`), and the period picker passes that value to `handleTeamPeriodChange()`. However, `validateTeamRoute()` accepts only the unrelated `YYYY-MM:YYYY-MM` shape (`apps/sm-tool/src/lib/team-route.ts:31-37`). A real range URL produced by the application is therefore treated as an invalid deep link, loses its period during canonicalization, and cannot be restored by Back/Forward. The focused fixture masks this by testing `2026-01:2026-03` rather than the production `range:2026-01..2026-03` format.

### Verified behavior

- User mode, tab, period, and team changes now call `writeTeamRoute(..., "user")`, which uses `pushState`; initial/canonicalization uses `replaceState`, and `popstate` does not write history or recalculate.
- Route helpers execute valid/invalid parsing, named periods, serialization, simulated Back/no-loop behavior, and selected-team recalculate fixtures. Recalculate targets the supplied team, suppresses a running duplicate, refreshes only the selected result, and retains the old object on failure.
- The original Overview/Cycle Time split, one period control, timestamp/stale semantics, Team/Scrum Master Cycle Time behavior, accessibility structure, hidden legacy subtree, metric formulas, and no customer/workspace scope changes remain intact on inspection.

### Validation

- Focused `npm test -- --run tests/task-005.test.ts tests/executive-flow-time.test.ts tests/metric-trust.test.ts`: PASS, 3 files / 11 tests.
- `npm run check`: PASS, typecheck, 26 test files / 133 tests, and production build.
- `git diff --check`: PASS.
- Browser smoke attempted again; Vite could not bind localhost in this restricted environment (`listen EPERM ::1:5173`). Desktop/mobile rendering and real browser Back/Forward remain unverified for that environmental reason.
- Existing non-blocking build warnings remain: ineffective `TeamDetail.tsx` dynamic import and large bundle warning.

### Required fix

- Align `validateTeamRoute()` and its executable fixtures with the existing `range:YYYY-MM..YYYY-MM` period contract, and add a real production-format range deep-link round-trip/canonicalization assertion.

### Next step

The next task is blocked. Developer remediation is required, followed by a new independent QA review.
