# TASK 010 — Historical metric trends

## Main status

`in-progress`

Owner: Main/ScrumMaster
Current stage: Designer
Scope lock: compact metric-card insight popup replacing inline historical trends

## User objective

Show whether important existing metric-card values improve, worsen, or remain unchanged through one compact accessible insight popup, without a tall inline trends block or presenting missing data as zero.

## Architect handoff

Corrected Architect decision: remove/replace the large inline Historical trends block. Existing important cards open one compact accessible metric insight popup, preserving selected team/period context and existing formulas. Cards include Stories Done, Throughput, Avg Cycle Time, SLE P85, Aging WIP, Done Bug Ratio, Velocity, Bottleneck, and other existing cards where data exists. Direction semantics are higher-is-better for throughput/stories/velocity, lower-is-better for time/aging/bug ratio, and categorical for Bottleneck. P85 has no special trendline status.

## Designer handoff

Complete, corrected scope: [docs/design/task-010.md](../design/task-010.md). Replaces the inline trend block with one reusable metric-card insight popup, including Team/Scrum Master variants, metric meaning/calculation/current/change interpretation, optional real-history trend only, provenance, missing/unavailable states, focus trap/Escape/outside close, keyboard card and point behavior, no-zero/no-duplicate rules, and responsive acceptance criteria.

## Developer handoff

Blocked until Main routes the approved Designer handoff. Do not add formulas, metrics, routes, customer-data flows, or unrelated redesign.

## QA verdict

Not started. QA must independently verify historical coverage, direction correctness, missing-vs-zero behavior, selected context, chart accessibility, responsive layout, and unchanged metric calculations.

## Open follow-ups

- Implementation Time remains conditional on the approved semantic migration; no fallback metric label should imply equivalence before that migration is complete.

## Scope correction note

The corrected Architect decision supersedes the earlier inline Historical trends implementation and its related QA review evidence. The prior QA entries remain historical records, but the metric-card insight popup scope requires fresh Developer implementation and QA verification against the corrected Designer handoff.

## Designer remediation mapping

- Architect contract → design sections 2–4 and `Remediation contract`: selected period is the sole historical-window filter; no inference across gaps; one valid period is N/A.
- Interaction contract → sections 3 and 7: roving `tabIndex`, ArrowLeft/Right plus orientation equivalents, Home/End, Enter/Space pin, Escape unpin, visible focus, and text/table fallback.
- Trust/state contract → sections 4 and 8: point `as-of`/`capturedAt`/sample/usable/source; truthful loading/retrying/error/partial/unavailable states; last-known data retention and retry.
- Mode contract → sections 3, 4, and remediation: compact Team presentation and richer Scrum Master diagnostics without a taller chart grid.

## QA review — independent review

Verdict: `FAIL`

Evidence (2026-09-01):

- Focused `tests/historical-trends.test.ts`: 2 tests passed.
- `npm run check`: passed typecheck, 30 test files / 149 tests, and production build.
- `git diff --check`: passed.
- The implementation adds the card to both `TeamDesignView` and `ScrumMasterDesignView` and derives Cycle Time/SLE P85 only from `selectedTeam.progressHistory`; no new formula, route, Jira path, or customer/workspace data change was found in the task-local diff. Existing dirty `Teams/**` and `workspace.json` files were excluded from scope assessment.

Blocking findings:

- P1: the shared selected period is only displayed in the card header. `historicalTrend` maps and sorts every `selectedTeam.progressHistory` snapshot and never applies `periodMonth`/the selected period to the historical window, so changing the authoritative period does not update the history/comparison as required by the handoff.
- P1: required chart interaction is incomplete. Valid points are plain buttons with click/implicit activation and Escape clearing, but there is no Arrow/Home/End navigation, pinned tooltip, hover/focus tooltip, or equivalent point detail containing as-of/sample context. The summary/data table is only a partial text alternative.
- P1: the required loading, error/retry, partial/unavailable-reason, and one-valid-period state treatment is not implemented. The component has only a generic no-snapshot message when history or available metrics are empty; it cannot distinguish unavailable metric/history reasons or preserve current metrics on an error.
- P2: `resolveHistoricalTrendDirection` filters out all gaps and compares the last two valid values, which can infer a direction across a missing period, contrary to the handoff’s “do not infer across a missing period” rule. The focused test explicitly codifies the opposite (`[5, null, 4]` => Improving).
- P2: `docs/architecture/task-010.md` is absent even though the task requests comparison against that handoff; the task record contains only a brief Architect handoff summary. This is a workflow/documentation gap.

Required before next task:

- Apply the authoritative period to the historical window and test period changes, selected team context, and current-period comparison.
- Implement the specified point keyboard model and hover/focus/pinned details, including as-of and sample/usable context where available.
- Model and render loading, error/retry, partial, unavailable-reason, insufficient-history, and empty states without zero substitution.
- Change direction logic/tests so a missing intervening period does not produce an inferred trend, unless the handoff is explicitly revised.
- Restore or explicitly route the missing architecture handoff before re-review.

## QA re-review — after remediation

Verdict: `FAIL`

Evidence (2026-09-02):

- `tests/historical-trends.test.ts`: 3 tests passed, including selected-period endpoint/range filtering and no-inference direction behavior.
- `npm run check`: passed typecheck, 30 test files / 150 tests, and production build.
- `git diff --check`: passed.
- Re-inspection confirms `filterHistoricalPeriods` is now used with `selectedHistoricalPeriod`, and `resolveAdjacentHistoricalDirection` refuses to infer across a missing current/previous period. The card remains wired in both Team and Scrum Master views and uses only `progressHistory`.

Remaining blockers:

- P1: loading, error/retry, partial, unavailable-reason, and explicit insufficient-history state behavior is still not modeled. Empty/window-without-data collapses to `No historical snapshots are available for this team`, with no error recovery or reason-specific copy.
- P1: roving focus is unsafe when the first rendered period is a gap. `activePointIndex` starts at `0`, while gap periods render non-focusable spans and every valid point uses `tabIndex={index === activePointIndex ? 0 : -1}`. If index 0 is missing, no valid point is keyboard tabbable; changing metric/window also does not normalize the active index.
- P2: point detail is rendered as an inline status paragraph rather than a tooltip/pinned popover with explicit hover-leave/outside behavior. It now includes as-of/sample/usable/source, but hover focus can leave persistent detail and the required tooltip interaction is not fully demonstrated by executable UI tests.
- P2: `docs/architecture/task-010.md` remains absent, so the requested architecture handoff cannot be independently compared as a source document.

Scope/data safety: no task-local new formulas, routes, Jira/network paths, or customer/workspace data changes observed; pre-existing dirty workspace files remain excluded.

Required follow-up: add truthful state modeling/recovery, normalize roving focus to the first valid point after metric/window changes and when leading gaps exist, complete tooltip lifecycle/accessibility coverage, and restore the missing architecture handoff before another QA review.

## QA final re-review — after remediation

Verdict: `PASS WITH FOLLOW-UPS`

Evidence (2026-09-02):

- `docs/architecture/task-010.md` and `docs/design/task-010.md` were independently reviewed.
- `tests/historical-trends.test.ts`: 5 tests passed, covering selected-period/range window filtering, gap-aware direction, valid zero vs missing, state classification, and leading-gap roving-index normalization.
- `npm run check`: passed typecheck, 30 test files / 152 tests, and production build. `git diff --check`: passed.
- `filterHistoricalPeriods` now drives the card from `selectedHistoricalPeriod`; `resolveAdjacentHistoricalDirection` compares only the immediately adjacent rendered periods and returns unavailable across gaps. `normalizeHistoricalPointIndex` plus the effect keeps a valid point reachable after leading gaps and metric/window changes.
- Card behavior includes loading/last-known, error with retry, partial coverage, unavailable/no-data, and insufficient-history copy; valid zero remains numeric and missing values remain gaps/No data. Roving Arrow/Home/End, Enter/Space pin, Escape unpin, hover/focus detail, pointer-leave/blur cleanup, semantic summary, and data-table provenance are present.
- Card remains compact/responsive with Team and Scrum Master placement; task-local diff adds no formulas, routes, new data sources, Jira/network calls, or customer/workspace changes. Existing dirty customer/workspace files were excluded.

Follow-ups (non-blocking):

- Render a distinct user-visible `Retrying historical trends…` message when the helper state is `retrying`; currently it shares the loading presentation.
- Add a component/browser-level regression suite for Team/Scrum Master rendering, leading-gap tab order, hover-leave vs pinned persistence, keyboard traversal, and mobile overflow. Browser smoke was not run in this environment.
- Ensure the newly present architecture handoff is included in the task’s approved review set before release bookkeeping.

Next-task status: task may proceed; follow-ups remain recorded and do not block progression.

## Release QA — version 0.5.2

Verdict: `PASS`

- Root `package.json` and `package-lock.json` are `0.5.2`; root lock package entry is also `0.5.2`.
- App `apps/sm-tool/package.json` and `apps/sm-tool/package-lock.json` are `0.5.2`; app lock package entry is also `0.5.2`.
- Release diff for the four version files contains only version-field changes; dependency structure is unchanged.
- `git diff --check` passed. `npm run check` passed: typecheck, 30 test files / 152 tests, and production build.
- No new Teams/workspace/customer/cache/token changes are part of the release diff. Existing dirty workspace/customer files and the already-approved Task 010 implementation remain outside the version-only release scope.

Release next step: may proceed.

## Release QA — version 0.5.3

Verdict: `PASS`

- Root and app `package.json`/`package-lock.json` versions, including both lock root entries, are all `0.5.3`.
- The four release-file diffs contain only version-field changes; dependency structure is unchanged.
- Task 010 corrected popup remains under the recorded QA verdict `PASS WITH FOLLOW-UPS`; no new popup implementation changes are part of this release bump.
- `git diff --check` passed. `npm run check` passed: typecheck, 30 test files / 155 tests, and production build.
- No release-scope Teams/**, teams/**, workspace.json, customer data, cache, token, or application-logic changes were introduced. Existing dirty files and approved Task 010 implementation are excluded from the version-only release assessment.

Release next step: may proceed.

## Developer implementation notes

- Added one compact Historical trends card to the current Team and Scrum Master presentation views, backed only by existing progress snapshots.
- Cycle Time and SLE P85 are offered when historical values exist; missing periods remain gaps/No data and valid zero remains numeric zero.
- Added explicit lower-is-better direction, selected team/period context, keyboard-focusable points, accessible summary, data table, and responsive compact styling.
- Added executable direction and missing-vs-zero tests in `tests/historical-trends.test.ts`.
- Validation pending; no commit or push is performed by Developer.

## Developer remediation notes

- Historical windows now consume the shared selected period for month, range, all-time, YTD, and rolling named periods.
- Direction compares only adjacent periods in the selected window; gaps produce unavailable/insufficient history and never infer a trend across missing data.
- Points use roving tabindex with directional/Home/End navigation, Enter/Space pinning, Escape unpinning, and provenance-rich details/table output.
- Existing snapshot history remains the sole source; unavailable history is retained as an explicit state without zero substitution.

## Developer remediation 2 notes — 2026-09-02

- Added the restored architecture contract at `docs/architecture/task-010.md`.
- Historical trend presentation now distinguishes loading/retrying, error with last-known retention and retry, partial, unavailable, and insufficient-history states; no-data copy identifies the selected period and never substitutes zero.
- Roving point focus normalizes to the first valid point after metric/window changes, including leading gaps. Pointer exit and focus exit clear unpinned detail, while pinned detail persists until Escape or a new context/metric selection.
- Added executable tests for leading-gap focus normalization and truthful trend state classification.
- Validation: `npm run check` passed (30 test files / 152 tests and production build); `git diff --check` passed. No commit or push performed.

## Developer corrected-popup remediation — 2026-09-03

- Rendered `MetricInsightModal` now owns the complete optional trend interaction: hover/focus detail, roving tabindex, ArrowLeft/Right and Up/Down, Home/End, Enter/Space pinning, Escape unpinning, visible focus, semantic summary and diagnostic data-table fallback.
- Trend rendering is limited to real adjacent comparable history; null gaps remain visible gaps and do not produce a connecting/inferred trend. Same-period snapshots are deduplicated by newest capture before selected-period filtering.
- Current provenance (`as-of`, capturedAt, sample, usable, source) is derived from the selected-period-filtered window rather than the full-history tail. Team metric cards include Velocity and Bottleneck alongside the other stable Executive entries.
- Removed the obsolete inline trend implementation and its CSS from the rendered production path. Validation: focused tests 10 passed; `npm run check` passed with 30 files / 154 tests and production build; `git diff --check` passed. No commit or push performed; browser QA remains required.

## QA corrected-popup review — 2026-09-03

Verdict: `FAIL`

Evidence:

- Reviewed `docs/architecture/task-010.md` and `docs/design/task-010.md`, current ExecutiveViews/App/styles and focused tests.
- Focused tests passed: 10 tests (historical-trends and executive-flow-time). Full `npm run check` passed: 30 test files / 154 tests, typecheck, and production build. `git diff --check` passed.
- Team and Scrum Master now use one `MetricInsightProvider`; the old `HistoricalTrendsCard` is not rendered by either view. Existing cards are wrapped by `InsightCardButton`, and modal semantics/focus trap/Escape/outside close/focus restoration are present.

Findings:

- P1: the rendered modal trend points are plain buttons without `onFocus`, `onMouseEnter`, `onClick`, keyboard navigation, roving `tabIndex`, pin/unpin behavior, or point detail output. The old inline component contains those handlers but is no longer rendered. This fails the required chart point hover/focus/pin and keyboard interaction contract.
- P1: optional history is rendered whenever `validPoints.length >= 2`, even when the two valid points are separated by a null gap; this violates “only real adjacent comparable history” and can present a trend surface where no adjacent comparison exists.
- P1: modal Data details uses `snapshots.at(-1)` from the entire deduplicated history rather than the selected-period window/current comparable snapshot. A popup for an earlier selected period can show future `capturedAt`, sample, usable, and source provenance.
- P2: `HistoricalTrendsCard` and old historical CSS remain in the production source despite the corrected scope; they are dead legacy implementation and create regression/maintenance risk, although they do not currently render.
- P2: Team view renders only `data.kpis.slice(0, 6)`, so listed `Velocity` and `Bottleneck` cards are not entry points in Team mode (they are present in Scrum Master’s first eight).

Scope/data safety: no new formulas, routes, data sources, Jira/network calls, or Teams/workspace/customer/cache/token changes were found in the task-local implementation diff; unrelated dirty customer/workspace files were excluded.

Required fixes: implement the point interaction contract in the rendered modal trend (or a shared component), suppress trend when no adjacent valid pair exists, derive modal provenance from the selected-period/current window, and confirm Team card eligibility or explicitly narrow the approved card list. Remove dead inline trend implementation after replacement is verified. Next task is blocked pending Developer remediation and fresh QA review.

## Developer implementation — corrected popup scope — 2026-09-02

- Replaced the rendered standalone Historical trends surface with a single reusable metric insight modal used by Executive metric cards in Team and Scrum Master presentations.
- Existing card values and formulas remain unchanged; cards are keyboard-operable disclosure buttons with accessible names. The modal preserves selected team/period context, supports desktop modal/mobile bottom-sheet reflow, focus trap, Escape/outside close, and focus return.
- Modal content includes current/change/interpretation, metric meaning, existing calculation wording, provenance and truthful unavailable/insufficient/error/loading states. Cycle Time and SLE P85 history use selected-period filtering and deterministic same-period deduplication; no zero substitution or P85 target line was added.
- Added executable deduplication and popup wiring assertions. Validation: focused tests 10 passed; `npm run check` passed with 30 files / 154 tests and production build; `git diff --check` passed. No commit or push performed; browser-level QA remains required.

## QA popup final re-review — 2026-09-03

Verdict: `FAIL`

Evidence:

- Reviewed corrected architecture/design handoffs and current rendered `MetricInsightModal`, `MetricInsightProvider`, Team/Scrum Master card wiring, helper and CSS.
- Focused tests: 10/10 passed. `npm run check`: passed typecheck, 30 test files / 154 tests, and production build. `git diff --check`: passed.
- All eight listed KPI cards are now included in Team (`data.kpis.slice(0, 8)`) and Scrum Master; `InsightCardButton` is a real keyboard-operable button with an accessible name. Rendered modal has dialog semantics, focus trap, Escape/outside close, and opener focus restoration.
- Rendered point buttons now implement roving tabindex, hover/focus detail, Arrow/Home/End, Enter/Space pinning, Escape unpinning, and pointer/focus exit behavior. Same-period snapshots are deduped by newest `capturedAt`; selected period filters the window; no P85 target/trendline is added.

Findings:

- P1: optional modal trend is gated by `validPoints.length >= 2`, not by existence of an immediately adjacent valid pair. With values separated by a missing period it still renders a trend surface, contrary to the explicit adjacent-comparable-history requirement, even though direction is unavailable.
- P2: the old `HistoricalTrendsCard` implementation remains in `ExecutiveViews.tsx` behind a comment and the old `.historical-trends-*` CSS remains in `styles.css`. It is not currently rendered, but violates the corrected “no dead CSS/old inline implementation” scope and creates regression risk.
- P2: no component/browser-level test actually exercises the rendered modal point lifecycle, focus trap/restore, Team card set, or mobile drawer; current tests are source-string/helper assertions. Browser smoke was not run in this environment.

Scope/data safety: no new formulas, routes, data sources, Jira/network calls, or Teams/workspace/customer/cache/token changes found in task-local scope; unrelated dirty customer/workspace files excluded.

Required fixes: gate the rendered trend on at least one adjacent valid pair in the selected/deduped window; remove dead HistoricalTrendsCard and historical-trends CSS; add rendered UI regression coverage. Next task remains blocked pending Developer remediation and fresh QA review.

## QA corrected-popup final re-review — 2026-09-03

Verdict: `PASS WITH FOLLOW-UPS`

Evidence:

- `MetricInsightModal` now gates the optional trend with `hasAdjacentValidPair(points)` after selected-window filtering and deterministic same-period deduplication. A gap-separated pair suppresses the trend and reports that gaps prevent comparison; adjacent valid pairs render gaps without interpolation.
- The previously dead `HistoricalTrendsCard` implementation and `.historical-trends-*` CSS are gone. Team and Scrum Master both render eight card entry points (`slice(0, 8)`), including Velocity and Bottleneck, through the real `InsightCardButton` disclosure button.
- Rendered popup points implement roving tabindex, hover/focus detail, Arrow/Home/End navigation, Enter/Space pinning, Escape unpinning, and pointer/focus exit cleanup. Dialog focus trap, outside close, Escape close, mobile bottom-sheet sizing, and exact opener focus restoration are present.
- Popup uses selected-window `currentSnapshot` for provenance and exposes current/change/interpretation/meaning/calculation details, units, sample/usable, as-of/captured/source, missing/zero, partial/insufficient/error/loading behavior, and no P85 target/trendline.
- Focused tests: 11/11 passed. `npm run check`: passed typecheck, 30 test files / 155 tests, and production build. `git diff --check`: passed.
- No new formulas, routes, data sources, Jira/network calls, or Teams/workspace/customer/cache/token changes observed; unrelated dirty files excluded.

Non-blocking follow-ups:

- Add component/browser-level tests for actual rendered popup interactions and mobile visual overflow; browser smoke was not available in this environment.
- Add an explicit fixture for the retrying visual state and equal-timestamp dedupe tie behavior if release hardening requires it.

Next-task status: task may proceed; follow-ups are recorded and non-blocking.

## Developer popup remediation 3 — 2026-09-03

- Added `hasAdjacentValidPair` gating so separated valid points with a missing period do not render a trend; the popup reports that gaps prevent a trend.
- Removed the obsolete inline implementation from `ExecutiveViews.tsx` and all `.historical-trends-*` CSS. The shared metric insight popup is the sole rendered trend surface.
- Added executable adjacent-pair and rendered-popup wiring assertions covering keyboard lifecycle, focus trap/restore, selected-window behavior, deduplication, and all eight Team card entry points.
- Validation: `npm run check` passed with 30 files / 155 tests and production build; `git diff --check` passed. No commit or push performed; browser-level QA remains required.
