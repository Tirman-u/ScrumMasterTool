# TASK 010 — Designer handoff: historical metric trends

## 1. User decision

Add one compact `Historical trends` interaction to the current team detail/Executive view. It helps a Team or Scrum Master answer: “Is this metric improving, worsening, or unchanged over comparable periods?” It must preserve the selected team and period context and never turn missing history into zero.

Initial metrics, only where historical snapshots exist:

- Lead Time;
- Cycle Time;
- Implementation Time after the semantic migration makes that metric available;
- SLE P85;
- Waiting-time percentage.

P85 is the only SLE percentile shown in this trend UI. Do not add trading-style actions, new metric formulas, or a separate dashboard route.

## 2. Information hierarchy

1. Selected team, selected period, and comparison basis.
2. Trend direction: improving, worsening, unchanged, or unavailable.
3. Metric value over time, with unit and as-of period labels.
4. Current-period value and sample/coverage context where available.
5. Method note: lower is better for Lead/Cycle/Implementation/SLE; waiting percentage is also lower-is-better. Missing history is not zero.

The trend must state its comparison basis, for example `Last 6 comparable periods · current period highlighted`. The selected period filter is the sole authoritative historical-window endpoint and filter in both Team and Scrum Master modes; changing it must rebuild the window, current-point highlight, coverage, and direction summary without changing selected team or active mode. No trend-local period control may override it.

## 3. Screen/flow specification

### Placement and height

Place `Historical trends` after the primary Team Overview metric cards and before secondary diagnostic panels. Do not repeat a full chart for every metric. Use one compact chart card with a metric selector (segmented control or compact tabs) and a single plot. Default to Cycle Time when available; otherwise the first available metric in the order above.

Desktop layout: card header with title and context on one line, metric selector beneath or inline, chart below, one-line accessible summary and legend. Target plot height 170–210px including axes; the section should not create a tall dashboard block.

Team view is presentation-safe: selector, line/point chart, one clear direction summary, and no diagnostic configuration. Scrum Master view may expose sample/usable count and a concise “why unavailable” detail, but keeps the same compact chart height. Do not add a second trend chart grid unless the Architect explicitly expands scope.

### Context and comparison

Show context in the card header: `[Team name] · [selected period]` and `Historical trend · [N comparable periods]`. Use the existing shared period control; do not add an independent period selector. Highlight the selected/current period with a stronger point or outline, not a different scale.

For periods without a valid value, leave a gap in the line and show `No data` in the tooltip/table summary. Do not connect across missing periods in a way that implies a value. A valid numeric zero, if the metric contract permits it, is shown as `0`; missing/unavailable is shown as `-` plus a reason. Direction compares the selected current period with its immediately preceding period only when both are valid and adjacent in the selected historical window; a gap makes direction `Unavailable`/`Insufficient history`, never an inferred improvement or worsening.

### Click, hover, and keyboard

Hovering a valid point shows a high-contrast tooltip with metric name, value/unit, period, `as-of`, `capturedAt`, sample count, usable count, source, and comparison context when available. Hovering a missing period shows `No data for this period`, never `0`. If provenance is unavailable, say `Source unavailable` rather than inventing a source or timestamp.

Each valid point is keyboard reachable through an equivalent focusable point with roving `tabIndex`: only the active point is in the tab order. ArrowLeft/ArrowRight move through periods; the equivalent orientation keys (ArrowUp/ArrowDown for a vertical point model) must also work; Home/End move to first/last point; Enter/Space pins the tooltip; Escape unpins it. Visible focus must remain obvious. Clicking a point pins its detail and updates the accessible summary, but does not change the selected global period or team. Clicking outside or pressing Escape unpins it.

The chart must have a text alternative: `Cycle Time trend for [team], [N] comparable periods. Current period: [value]. Direction: improving. Lower is better.` Include gaps, unavailable reasons, as-of, capturedAt, sample, usable, and source in an adjacent details table or expandable `View data table`, especially for Scrum Master users.

### Direction semantics

Use the existing trend arrow/pill language and thresholds. The visible text must say `Improving`, `Worsening`, `Unchanged`, or `Unavailable`; arrows/colors reinforce but never carry the meaning alone. Compare the current selected period to the immediately preceding valid comparable period, or show `Insufficient history` when that comparison is not valid. Do not infer a direction across a missing period.

Exact summary examples:

- `Improving · 4.2 working days, down from 5.0 in the previous comparable period.`
- `Worsening · 7.1 working days, up from 5.8 in the previous comparable period.`
- `Unchanged · within the existing neutral threshold.`
- `Insufficient history · one valid period available.`
- `Unavailable · no valid historical snapshot for this metric.`

## 4. Component/state matrix

| State | Visual/copy | Interaction |
|---|---|---|
| Loading | Card skeleton/quiet spinner; `Loading historical trends…` | Keep team/period context visible; do not show placeholder zeros. |
| Valid history | Line with points, unit-labelled axis, current point emphasis, direction summary | Hover/focus/click point details; selector changes metric only. |
| Improving | `Improving` plus downward/appropriate arrow and text | Direction is announced in summary; color is secondary. |
| Worsening | `Worsening` plus upward/appropriate arrow and text | Same interaction; no alarm-only color. |
| Unchanged | `Unchanged` plus neutral arrow/text | Explain neutral threshold if needed. |
| One valid period | `Insufficient history · one valid period available.` | Direction is `N/A`; render point/card context, no connecting trend claim. |
| Missing history | `No historical data for this metric.` | Show `-`/gap and reason; selector remains available for other metrics. |
| Partial history | `3 of 6 periods available.` | Gaps remain visible; direction only if adjacent valid comparison exists. |
| Metric unavailable | `Implementation Time is unavailable until semantic migration is complete.` | Disabled selector option with reason, or omit only if no useful explanation is possible. |
| Error | `Could not load historical trends. Current metrics are unchanged.` | Persistent inline `Try again`; retain last-known trend/data if available and label it as last known; do not claim a newly loaded trend. |
| Empty team/history | `No historical snapshots are available for this team.` | Preserve selected team/period; no empty chart axes implying zero. |
| Hover/focus | Tooltip/detail with period, as-of, value, unit, sample | Keyboard-equivalent to pointer; tooltip remains while focused/pinned. |
| Mobile | Stacked selector, chart, summary, optional data table | Horizontal scroll only inside data table if needed; no page overflow. |

Metric-specific labels:

| Metric | Display unit/meaning | Lower-is-better copy |
|---|---|---|
| Lead Time | `working days` from start/commitment to completion per existing contract | `Lower Lead Time means work reaches completion sooner.` |
| Cycle Time | `working days` in the configured implementation flow per existing contract | `Lower Cycle Time means completed work moves through delivery faster.` |
| Implementation Time | `working days` for the post-migration implementation semantic | `Lower Implementation Time means less time in implementation.` |
| SLE P85 | `working days`; 85% of valid completed items finished within this duration | `Lower SLE P85 indicates a shorter delivery expectation.` |
| Waiting-time percentage | `%` of the existing defined flow time spent waiting | `Lower waiting-time percentage indicates less queue/wait time.` |

Facts (period/value/sample), calculation/meaning, and interpretation (direction) are separate in the card and tooltip. Never render unavailable as `0`.

### Remediation contract

- The selected period is the only historical-window endpoint/filter. Team, Scrum Master, metric selector, tooltip, summary, and data table all consume that same window.
- A valid current period and the immediately previous period are required for a direction. Any missing/invalid period between them blocks inference; `[5, null, 4]` is not `Improving`.
- Exactly one valid period renders the value and provenance but direction `N/A` with `Insufficient history · one valid period available.`
- Point detail fields are normative: period, value/unit, as-of, capturedAt, sample, usable, and source. Omit a field only when the contract marks it unavailable, then show the unavailable reason.
- Loading and retrying retain team/period context and last-known valid trend where present. Errors retain current metrics, identify that trend data is unavailable or last known, and expose `Try again`.
- Team stays compact: direction, coverage, and essential value. Scrum Master may show full provenance, sample/usable counts, gaps, and unavailable reasons in the details table without increasing chart height.

## 5. Visual system

Reuse existing Executive chart-card, `Delivery Trends`, `Cycle Time Trend`, metric selector, trend pill/arrow, axis, tooltip, border, spacing, and typography tokens. Keep one restrained line color per metric and a neutral reference/grid treatment. Use point shape, line style, and text to distinguish current point, missing gap, and selected point.

Do not encode improving/worsening only with green/red. Recommended reinforcement: downward arrow plus `Improving` for lower-is-better metrics, upward arrow plus `Worsening`, neutral arrow for unchanged, dashed/gapped line for missing periods, muted outline for unavailable. SLE P85 is clearly labelled as `P85`; no P50/P70/P95 controls in this scope.

## 6. Figma handoff

Use the existing Executive Scrum Master Dashboard Make file referenced in `prompts/DESIGNER.md` as source of truth. No Figma mutation is required for this documentation-only task. Represent one `Historical trends` chart-card with variants for Team/Scrum Master, loading, valid/improving, valid/worsening, unchanged, insufficient, missing, partial, unavailable, error, hover/focus/pinned tooltip, and mobile stacked layout.

Annotate the selected period/team context, no-zero rule, gap behavior, current-point emphasis, keyboard point navigation, and text-summary/data-table alternative. Reuse existing components/tokens; do not create a new visual language.

## 7. Accessibility

- Give the chart card a heading and a concise `aria-label`/text summary that includes team, selected period, metric, direction, value/unit, and history coverage.
- Keep the shared period control as the only period selector and preserve logical focus after period or metric changes.
- Provide keyboard access to metric selector and every valid data point; support roving focus with Arrow/Home/End, Enter/Space pin, and Escape close.
- Tooltip content must be readable on focus as well as hover, remain visible while focused/pinned, and meet contrast requirements.
- Provide a semantic `View data table`/details alternative with period, as-of, value, unit, validity, and sample/usable count. Missing values are explicitly `No data`, not blank or zero.
- Announce selector changes and pinned-point summaries politely; do not announce every pointer movement or chart redraw.
- Use text, arrows, point shapes, and line gaps in addition to color. Ensure touch targets are at least the existing accessible control size.

## 8. Acceptance criteria for Developer/QA

1. Historical trends appears as one compact chart card in the existing Executive/Team Overview hierarchy and does not materially increase main-view height.
2. The selector supports Lead Time, Cycle Time, Implementation Time when available, SLE P85, and waiting-time percentage when historical data exists; no new metric formula is introduced.
3. Selected team, shared period, mode, and active tab context are preserved; the selected period is the sole authoritative historical-window endpoint/filter and no second period control is created.
4. Current-period direction is explicitly labelled Improving, Worsening, Unchanged, Insufficient history, or Unavailable, with comparison basis and lower-is-better meaning available; direction never crosses a missing/invalid period.
5. Missing, partial, invalid, or unavailable history is distinct from numeric zero; missing periods create visible gaps and do not create an implied interpolation or direction.
6. Loading, retrying, error, empty, insufficient, partial, unavailable, hover, focus, pinned, and mobile states match the matrix. Errors retain last-known valid data/current metrics and offer a safe retry.
7. Hover and keyboard point interaction expose the same period/value/unit/as-of/capturedAt/sample/usable/source detail. The text summary or data table is available without pointer input.
8. Improving/worsening meaning is not conveyed by color alone; tooltip and chart contrast remain readable in the existing light/dark treatments.
9. The card remains compact and responsive: mobile selector and summary stack, chart remains usable, and no page-level horizontal overflow or excessive vertical expansion occurs.
10. QA verifies the remediation contract: selected-period window/filter changes, adjacency-aware direction with no gap inference, one-valid-period N/A, complete point provenance fields, roving tabindex and ArrowLeft/Right plus orientation equivalents/Home/End/Enter/Space/Escape behavior, truthful loading/retrying/error/partial/unavailable states with last-known retention, responsive layout, and unchanged existing metric calculations/data boundaries.
