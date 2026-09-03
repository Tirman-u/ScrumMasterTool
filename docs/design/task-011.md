# TASK 011 — Designer handoff: metric-info audit

## 1. User decision

Audit and standardize one reusable metric insight affordance/modal from TASK 010. Do not create a second help system, separate tooltip framework, or duplicate metric-history surface. The same interaction serves Stories Done, Throughput, Avg Cycle Time, SLE P85, Aging WIP, Done Bug Ratio, Velocity, Bottleneck, visible Lead/Cycle/Implementation cards, Waiting Time % when available, and other stable-contract cards.

Team and Scrum Master show identical values and provenance. Team is concise and presentation-safe; Scrum Master adds diagnostic detail and coverage. No P50, no special P85 target/trendline, no new formulas, and no inference across gaps.

## 2. Information hierarchy

Every popup uses the same order:

1. Metric title, selected team, selected period, and current value/unit.
2. Previous comparable period and explicit change interpretation.
3. Optional small history only when real adjacent comparable history exists.
4. Meaning and local collection/source.
5. Existing calculation explanation and formatter/unit.
6. `As of`, `Captured`, `Source`, `Sample`, and `Usable`.
7. Truthful missing, partial, stale, conflict, unsupported, loading, error, or retry guidance.

The selected period is the only historical-window endpoint/filter. Facts, calculation, interpretation, and any guidance are separate blocks. `As of` describes the metric’s data period; `Captured`/`capturedAt` describes when the snapshot was collected. They must never be merged into one ambiguous timestamp.

## 3. Screen/flow specification

### Entry and shared modal

Reuse the Task 010 card disclosure: each eligible card is a real button with a visible `View insight` affordance and an accessible name such as `Open SLE P85 insight`. Enter/Space or click opens one shared popup; opening another card replaces content in the same popup while preserving selected team, period, and mode.

Desktop uses a 440–560px popover/modal with a 360px minimum and a readable two-column detail grid. Do not permit flex/grid shrinkage into narrow vertical text. Each detail pair has a readable minimum, normal word wrapping, and no page-level horizontal overflow. Mobile uses a one-column bottom-sheet/reflow dialog with internal scroll and full-width controls. At 200% zoom, the dialog reflows to one column without clipping or loss of close/retry actions.

### Typed metric content

| Metric | Meaning | Local collection/source | Unit/formatter | Direction |
|---|---|---|---|---|
| Stories Done | Completed items in the selected period | Existing local imported issue/snapshot data | Existing count formatter | Higher is better with scope/context |
| Throughput | Completed items per the existing throughput period/unit | Existing local imported issue/snapshot data | Existing throughput formatter | Higher is better |
| Avg Cycle Time | Average configured Cycle Time in the implementation flow | Existing local issue history/status-transition snapshot | Working days; existing formatter | Lower is better |
| SLE P85 | 85% of valid completed items finish within this duration | Existing local Cycle Time/SLE snapshot | Working days; P85 label only | Lower is better; no target/trendline |
| Aging WIP | Existing age measure for work still in progress | Existing local open-work/status data | Existing working-day formatter | Lower is better |
| Done Bug Ratio | Completed items classified as bugs under existing mapping | Existing local issue type/complete-item data | Existing percentage formatter | Lower is better |
| Velocity | Existing configured velocity measure | Existing local period snapshot | Existing velocity formatter/unit | Higher is better |
| Bottleneck | Existing configured categorical bottleneck result | Existing local flow diagnostic data | Category label, not numeric formatter | Categorical movement only |
| Lead/Cycle/Implementation | Existing visible flow metric contract | Existing local imported issue/history data | Working days; existing metric formatter | Existing approved lower-is-better semantics |
| Waiting Time % | Existing defined share of flow time spent waiting | Existing local status-transition/flow snapshot | Percentage formatter | Lower is better |

For each metric, use typed copy rather than generic “This metric shows performance.” The popup must include `Current`, `Previous comparable period`, `Change`, `Interpretation`, `Meaning`, `How collected`, `How calculated`, and `Data details`. Team may collapse calculation/provenance into concise labelled rows; Scrum Master shows the full text, counts, coverage, and source.

### Change and optional history

Use `Improving`, `Worsening`, `Unchanged`, `N/A`, or `Unavailable` in text. Higher-is-better: Stories Done, Throughput, Velocity. Lower-is-better: Avg Cycle Time, Lead Time, Implementation Time, SLE P85, Aging WIP, Done Bug Ratio, Waiting Time %. Bottleneck is categorical; say `Moved from [previous category] to [current category]` or `No category change`, never numeric up/down.

Optional history is metric-specific and only appears when at least two adjacent valid comparable snapshots exist inside the selected-period window. Same-period snapshots are deterministically deduplicated. Missing/invalid gaps remain gaps and block inference across them. One valid point says `N/A · one valid period is available.` No P85 target or special P85 trendline status.

## 4. Component/state matrix

| State | Required copy/behavior |
|---|---|
| Valid | Current value, previous comparable value, direction, meaning, calculation, provenance |
| Missing current | `Unavailable · no valid value for [selected period].` Show `-`, never zero |
| No history | `Unavailable · no comparable historical data for this metric.` No trendline |
| One valid period | `N/A · one valid period is available.` No direction claim |
| Partial | `[n] of [total] comparable periods available.` Show gaps; no cross-gap inference |
| Stale | `Showing last-known data · source is newer than this calculation.` Keep value/timestamps distinct |
| Conflict | `Conflicting source values · current value is not presented as authoritative.` Explain source/coverage; do not silently choose |
| Unsupported | `This insight is unavailable for this metric contract.` State what remains available |
| Loading | `Loading [metric] insight…` Keep card/current context; no placeholder zero |
| Retrying | `Retrying [metric] insight…` Retain and label last-known values |
| Error | `Could not load [metric] insight. Current metrics are unchanged.` Persistent `Try again` where supported |
| Team | Concise value/change/meaning/provenance summary |
| Scrum Master | Same values/provenance plus full diagnostic calculation, coverage, source, gaps, and table |

All states are visible in the popup, not conveyed only by color. Errors and stale/conflict warnings do not rewrite values or timestamps. Team/Scrum Master must never disagree on a value or provenance field; only explanatory density differs.

## 5. Visual system

Reuse Task 010’s existing Executive metric-card, disclosure, modal/popover, chart, tooltip, border, spacing, typography, and semantic status tokens. The popup has a clear header, current/change block, optional trend block, meaning/calculation block, and provenance block. Use a two-column desktop grid with stable widths; stack below the reflow breakpoint and at 200% zoom.

Use text, icons/shapes, arrows, and line gaps in addition to restrained color. Do not use green/red as the sole direction or state signal. Keep P85 visually equivalent to other metrics except for its explicit meaning and `P85` label; no target, promise, or special trendline treatment.

## 6. Figma handoff

Use the Task 010 Executive Summary metric-insight component and existing Figma Make source of truth. No new help component is required and no Figma mutation is required for this documentation-only handoff.

Required variants: each typed metric; Team concise/Scrum Master diagnostic; valid, missing, partial, stale, conflict, unsupported, loading, retrying, error, one-valid-period; desktop 2-column, mobile drawer/1-column, 200% reflow; hover/focus/pinned detail; dialog focus-trap and close states. Annotate identical value/provenance data across modes and the no-zero/no-gap-inference rules.

## 7. Accessibility

- Cards are real disclosure buttons with explicit names and visible focus; Enter/Space opens the shared modal.
- Modal uses labelled dialog semantics, initial focus, focus trap, Escape close, outside click close where safe, and focus restoration to the exact opening card.
- No required content is hover-only. Tooltip/point detail is available on focus and touch, and a semantic text summary or `View data table` exposes all fields without a pointer.
- If the optional trend is present, points use roving `tabIndex`; ArrowLeft/Right and orientation-equivalent keys move, Home/End jump, Enter/Space pins, and Escape unpins. Leading gaps must not make every valid point unreachable.
- Announce opening, metric changes, loading/retry/error state, and pinned detail politely. Do not announce pointer movement or repeated redraws.
- Preserve relationships among metric title, current value, change, interpretation, and provenance with semantic headings/labels and `aria-describedby` where needed.
- At 200% zoom and narrow mobile widths, text reflows without character-by-character wrapping, clipping, or horizontal page scroll. Close/retry controls remain keyboard and touch reachable.
- Reduced-motion users receive no required animated transition; if motion exists, respect `prefers-reduced-motion` and keep state changes understandable without animation.

## 8. Acceptance criteria for Developer/QA

1. All eligible Executive Summary cards use the single Task 010 insight affordance/modal; no second help system or duplicate historical insight surface exists.
2. The old large Visual Analytics/inline trend duplication is removed or reconciled so the popup is the single metric-card insight surface.
3. Desktop popup remains readable at 360px minimum and 440–560px target width with a true 2-column detail grid; no collapsed columns, vertical word wrapping, clipping, or page overflow.
4. Mobile and 200% zoom reflow to readable one-column content with internal scroll and reachable close/retry actions.
5. Typed content covers Stories Done, Throughput, Avg Cycle Time, SLE P85, Aging WIP, Done Bug Ratio, Velocity, Bottleneck, visible Lead/Cycle/Implementation cards, Waiting Time % when available, and stable-contract cards.
6. Each popup exposes meaning, local collection/source, existing calculation, unit/formatter, current, previous comparable change, direction, asOf versus capturedAt/source, sample, and usable. Team is concise; Scrum Master is richer; values/provenance are identical.
7. Direction semantics are correct for higher/lower/categorical metrics. P50 is absent, P85 has no special target/trendline, and no direction is inferred across gaps.
8. Missing, partial, stale, conflict, unsupported, loading, retrying, error, and one-valid-period states are explicit; unavailable is never zero and errors retain last-known/current data with retry where supported.
9. Card keyboard/touch entry, modal focus trap, Escape/outside close, focus restoration, optional point keyboard behavior, no hover-only content, live announcements, and reduced-motion behavior pass accessibility review.
10. QA verifies same-period deduplication, selected-period authority, mode parity of values/provenance, 200% zoom/mobile layout, contrast/non-color semantics, and unchanged metric formulas/local data boundaries.
