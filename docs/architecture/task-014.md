# TASK 014 — Waiting Time percentage of Cycle Time

## Status and boundary

Architecture-only handoff after TASK 013 approval/deployment. This task defines and implements one derived presentation metric in a later Developer step; no code, customer/workspace data, deploy, Jira/network/token flow, or formula redesign is included here. Designer is required for the card, summary, and MetricInsightModal treatment, then Developer, then independent QA.

Use the TASK 013 normalized status sets and TASK 012 naming exactly. Monday-Friday working-day semantics remain mandatory.

## Frozen meaning and formula

Waiting Time % answers: what proportion of usable Cycle Time was spent waiting rather than in Implementation work?

- Denominator: summed usable duration in Cycle Time statuses, which is the new Cycle Time and old activeTime semantic.
- Numerator: summed usable duration in Cycle statuses that are not in Implementation statuses.
- Implementation-status duration is doing/implementation time and is excluded from the numerator.
- Lead-only statuses are outside the denominator.
- Done is terminal and excluded.
- Unknown, unmapped, invalid, missing, and unusable durations are excluded from the ratio and reduce coverage.

Use one aggregate ratio, not an average of item percentages:

    waitingPct = sum(waitingDurationWorkingDays) / sum(cycleDurationWorkingDays) * 100

The result is valid only when both sums are finite and the denominator is greater than zero. Clamp is not a correction mechanism: a result outside 0–100 indicates an invariant/data error and must be unavailable with a diagnostic. Display precision follows the existing percentage formatter, recommended one decimal place, without implying precision beyond the source.

The calculation operates on the existing per-item status-duration representation and canonical role classifier. It must not count a status interval twice when roles overlap. A Cycle interval is waiting exactly when it is not classified as Implementation; an Implementation interval is not waiting. Status role overlap is resolved by TASK 013 precedence, while the numerator/denominator membership uses the canonical sets.

## Data and provenance contract

Add or normalize a typed derived snapshot without replacing base metrics:

    type WaitingTimeSnapshot = {
      waitingDurationWorkingDays?: number;
      cycleDurationWorkingDays?: number;
      waitingPct?: number;
      sampleCount?: number;
      usableCount?: number;
      unknownCount?: number;
      coverageState: "complete" | "partial" | "unavailable" | "conflict";
      asOf?: string;
      capturedAt?: string;
      source?: "local-import" | "local-cache" | "local-recalculation";
      reason?: string;
    };

sampleCount is the count of items eligible for a Cycle Time-duration candidate in the selected period. usableCount is the count of items with a finite usable Cycle denominator included in the aggregate. unknownCount counts candidate items or durations excluded because status/time data is unknown, unmapped, invalid, or missing. If the existing source cannot distinguish a count, expose unknown metadata rather than inventing zero.

asOf is the selected metric observation period endpoint. capturedAt is when the local calculation/snapshot was produced. source identifies local imported CSV/cache/recalculation provenance and must never imply a Jira request. The selected-period snapshot, Team, Scrum Master, card popup, and any retained diagnostic view use the same derived snapshot.

Coverage is complete only when all eligible candidate durations needed for the selected result are classifiable and usable. It is partial when a result is computed but some candidates/durations are excluded. It is unavailable when no valid denominator exists, the metric contract/status config is missing or invalid, or source data cannot establish the period. It is conflict when TASK 013 configuration candidates disagree. Never present unavailable as 0%.

## State and comparison semantics

States are ready-complete, ready-partial, unavailable-no-denominator, unavailable-no-source, needs-review-config, conflict, stale-last-known, and error-with-retry. A failed local refresh preserves the last-known value and labels it stale. A retry remains local-only. Configuration conflict does not silently reuse a new unverified result; the UI may show explicitly marked last-known output.

Waiting Time % is lower-is-better: a decrease means a larger share of Cycle Time is spent doing Implementation work, while an increase means more waiting. Show improved, worsened, unchanged only against the previous contiguous comparable selected period. Missing/invalid predecessor, period gap, changed status configuration without comparable semantic version, or unknown current value yields comparison unavailable. Do not use P50 or add any special P85 trendline/target.

## Placement and presentation

Executive Summary includes Waiting Time % only when its contract is available and a valid selected-period snapshot exists. It appears as one flow diagnostic card and uses the TASK 010/011 metric-card registry and shared MetricInsightModal. The card shows percentage, concise direction/quality state, and an info affordance.

The popup explains the numerator and denominator in plain language, Cycle Time boundary, what waiting versus Implementation means, working-day basis, current/previous comparison, asOf, source, sample/usable/unknown counts, and partial/unavailable reason. A small metric-specific history line is optional only when comparable local snapshots exist; it uses deduplicated points and the selected period. No standalone Historical Trends or duplicate Visual Analytics panel is added.

Team view is presentation-safe: percentage, one-sentence interpretation, concise coverage note, and basic provenance. Scrum Master view may show waiting/cycle working-day totals, counts, excluded/unknown reasons, status-role diagnostics, configuration version, and capturedAt. Both modes use identical values and direction.

Visual Analytics may retain only a clearly labelled diagnostic breakdown if Main explicitly keeps it; it must consume the same WaitingTimeSnapshot and not become a second card/trend owner. The default is no additional panel.

## Accessibility and responsive requirements

The card and info control are real keyboard-focusable controls with metric-specific accessible names. The popup follows TASK 010/011 dialog/popover rules: focus trap when dialog, Escape close, safe outside close, focus restoration, visible focus, screen-reader announcement, and no hover-only explanation. Values, units, percentage interpretation, and unavailable/partial state must be readable without the chart. Long numerator/denominator copy wraps normally; mobile stacks details and supports 200% zoom, touch, keyboard-only use, reduced motion, and narrow viewport reflow.

Color must not be the only distinction between lower/higher direction, partial, unavailable, or stale states. Do not expose raw issue keys, CSV rows, workspace paths, tokens, or customer identifiers.

## Exact implementation surfaces

- apps/sm-tool/src/types/contracts.ts: additive WaitingTimeSnapshot and metadata/state types.
- apps/sm-tool/src/lib/metrics.ts and existing status-duration classifier: derive numerator/denominator through TASK 013 role sets, with no duplicated base metric formula.
- apps/sm-tool/src/App.tsx: pass one selected-period derived snapshot to cards, summary, popup, and diagnostic surfaces.
- apps/sm-tool/src/components/ExecutiveViews.tsx and the current metric insight component: card and popup presentation.
- apps/sm-tool/src/components/TeamDetail.tsx or current Scrum Master diagnostic surface: richer coverage and status breakdown only.
- apps/sm-tool/src/styles.css: card, state, popup, and responsive styling.
- Established synthetic unit/component tests: no customer exports, issue keys, team names, workspace files, or credentials.

## Risks and non-goals

Risks are double-counting overlapping roles, treating Time in Status averages as additive, false precision from sparse samples, zero-as-missing confusion, denominator drift after naming/config migration, and stale/conflicting status configurations. Mitigate with the canonical classifier, aggregate-duration formula, explicit counts/states, stable presentation IDs, and fail-closed config handling.

Non-goals are changing Lead/Cycle/Implementation base formulas, changing SLE/P85, adding P50, adding a calendar, querying Jira, inferring status roles from names, averaging item percentages, or creating a second trend/analytics panel.

## Acceptance criteria

1. The numerator and denominator match the frozen TASK 013 boundary and use Monday-Friday working days.
2. The aggregate ratio is calculated from summed usable durations; overlapping status roles do not double-count.
3. Lead-only, Done, unknown, unmapped, invalid, and missing durations are excluded and visibly reduce coverage.
4. Zero or unavailable denominator renders unavailable, never 0%.
5. sampleCount, usableCount, unknownCount, asOf, capturedAt, source, and state are truthful; unknown metadata is not fabricated.
6. Complete, partial, unavailable, conflict, stale-last-known, and error/retry states are distinct and preserve last-known data safely.
7. Lower-is-better comparison is gap-aware and uses no inference across missing periods.
8. Executive card, MetricInsightModal, Team, Scrum Master, and any retained diagnostic surface use one snapshot and no duplicate Visual Analytics owner.
9. Popup copy explains the metric specifically, including numerator, denominator, working-day basis, and interpretation.
10. No P50, special P85 target/trendline, Jira/network/token path, customer/workspace data, or unrelated formula change is introduced.

## Focused tests

- Per-item classification for Cycle-only waiting, Implementation overlap, Lead-only, Done, Unmapped, unknown, and invalid intervals.
- Aggregate ratio versus average-item-percent regression; zero denominator; finite/range invariant; no double counting.
- Complete, partial, unknown-count, unavailable, conflict, stale, and retry/error fixtures.
- Selected-period/asOf filtering, previous contiguous comparison, missing predecessor/gap, and changed configuration version.
- Provenance fields and local-import/cache/recalculation source behavior.
- Executive card availability, MetricInsightModal copy/layout, Team concise versus Scrum Master diagnostic parity, no duplicate Visual Analytics panel.
- Keyboard, screen-reader, focus, responsive/mobile, zoom, reduced-motion, and text fallback checks.
- No-generic-copy and no-P50/special-P85 checks; synthetic-only data-safety and no-Jira/network regression tests.
