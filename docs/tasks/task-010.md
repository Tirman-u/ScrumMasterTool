# TASK 010 — Historical metric trends

## Main status

`in-progress`

Owner: Main/ScrumMaster
Current stage: Designer
Scope lock: compact historical trends for existing metric snapshots

## User objective

Show whether important flow metrics improve, worsen, or remain unchanged across comparable historical periods without making the main view excessively tall or presenting missing data as zero.

## Architect handoff

Architect sequence starts with TASK 010 historical trends. Designer scope: compact, presentation-safe interaction using existing historical data, preserving selected team/period context and existing formulas. Candidate metrics are Lead Time, Cycle Time, Implementation Time after semantic migration, SLE P85, and waiting-time percentage.

## Designer handoff

Complete, remediation applied: [docs/design/task-010.md](../design/task-010.md). Adds the restored contract mapping for the sole authoritative selected-period window/filter, gap-aware adjacent-period direction, one-valid-period N/A, roving point keyboard model, complete point provenance (`as-of`/`capturedAt`/sample/usable/source), truthful loading/retrying/error/partial/unavailable states with last-known retention, and compact Team versus richer Scrum Master treatment.

## Developer handoff

Blocked until Main routes the approved Designer handoff. Do not add formulas, metrics, routes, customer-data flows, or unrelated redesign.

## QA verdict

Not started. QA must independently verify historical coverage, direction correctness, missing-vs-zero behavior, selected context, chart accessibility, responsive layout, and unchanged metric calculations.

## Open follow-ups

- Implementation Time remains conditional on the approved semantic migration; no fallback metric label should imply equivalence before that migration is complete.

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
