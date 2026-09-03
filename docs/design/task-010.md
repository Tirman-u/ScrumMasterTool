# TASK 010 — Designer handoff: Executive Summary metric insight popup

## 1. User decision

Replace the large inline Historical trends and duplicate Visual Analytics treatment with one compact reusable metric insight popup. Every eligible Executive Summary metric card is a keyboard-operable disclosure: Stories Done, Throughput, Avg Cycle Time, SLE P85, Aging WIP, Done Bug Ratio, Velocity, Bottleneck, and any other stable-contract card with data.

The popup explains what changed. It does not add formulas, routes, data sources, P50, or a special P85 target/trendline. Preserve selected team, shared selected period, current card values, existing units/formulas, local-only boundaries, and Monday–Friday working-day semantics.

## 2. Information hierarchy

Popup reading order:

1. Metric name, selected team, selected period, and current value/unit.
2. Change versus the previous comparable period.
3. Explicit interpretation: `Improving`, `Worsening`, `Unchanged`, `N/A`, or `Unavailable`.
4. Optional small metric-specific history only when comparable adjacent history exists.
5. Meaning and existing collection/calculation explanation.
6. `Sample`, `Usable`, `As of`, `Captured`, and `Source`.
7. Missing/unavailable/partial/insufficient explanation and retry, when applicable.

The selected period is the sole historical-window endpoint/filter across every card, mode, popup, optional chart, and table. The popup has no period control. Facts, calculations, interpretations, and recommendations/guidance remain visually separated.

## 3. Screen/flow specification

### Card entry

Preserve the current card layout and value. Add a quiet, consistently placed `View insight` affordance or disclosure icon with visible text/label. The card is a real button/disclosure control with an accessible name such as `Open Avg Cycle Time insight`. Enter/Space opens the shared popup; card selection does not change team, period, or dashboard mode.

### Desktop popup: robust two-column layout

Use one centered compact modal/popover, anchored to the card when space allows and falling back to centered modal placement when anchoring would clip. Minimum width is 360px; target width is 440–560px; maximum width is `min(560px, calc(100vw - 32px))`. Never allow the dialog to shrink into an ultra-narrow column.

The body uses a readable two-column detail grid:

| Left column | Right column |
|---|---|
| Current value/unit | Change vs previous comparable period |
| Interpretation/direction | History coverage or optional mini-trend |
| Meaning | How collected/calculated |
| Sample / usable | As of / captured / source |

Each label/value pair has a minimum usable width; the grid uses `minmax(0, 1fr)` columns with a clear gap and stacks to one column below the mobile breakpoint. Long source strings may wrap normally, but no column may be narrower than its readable minimum, no horizontal page overflow is allowed, and no vertical writing/character-by-character wrapping is permitted. The popup body scrolls internally if needed; header and close control remain reachable.

### Mobile drawer

At narrow widths, use a bottom sheet/full-width dialog with a visible drag/top boundary only as a visual affordance, not the sole close mechanism. Use one-column detail sections, full-width close/retry buttons, and internal vertical scrolling. Keep metric name/context sticky at the top when scrolling. No horizontal overflow, clipped source text, or collapsed detail columns.

### Typed metric content

| Card | Meaning / calculation copy | Direction |
|---|---|---|
| Stories Done | `Completed items in the selected period, from the existing completion data.` | Higher is better, interpreted with scope/context. |
| Throughput | `Completed items per the existing throughput unit and period.` | Higher is better. |
| Avg Cycle Time | `Average configured Cycle Time, measured in working days using the existing flow definition.` | Lower is better. |
| SLE P85 | `85% of valid completed items finished within this working-day duration, using the existing SLE calculation.` | Lower is better. No target/trendline status. |
| Aging WIP | `Existing aging-WIP measure for work still in progress.` | Lower is better. |
| Done Bug Ratio | `Share of completed items classified as bugs under the existing bug mapping.` | Lower is better. |
| Velocity | `Existing velocity measure for the selected period and configured unit.` | Higher is better. |
| Bottleneck | `Existing categorical bottleneck result from the configured flow diagnostics.` | Categorical movement only; do not calculate numeric direction. |
| Stable-contract card | Use its existing metric meaning, source, unit, and calculation wording. | Use only its approved contract direction. |

Current value, previous comparable value, delta/direction, unit, sample/usable counts, as-of/capturedAt, and source are explicit fields. If a field is not available, show `Unavailable` with reason rather than inventing a value.

### Optional history and change

Show a small line/point history only when at least two adjacent valid comparable snapshots exist within the selected-period window. Deduplicate same-period snapshots deterministically before display. Gaps remain gaps; no comparison or inferred direction crosses a missing/invalid period. One valid point is `N/A · one valid period is available.`

Point hover/focus/click/Enter/Space exposes the same detail fields as the popup and may pin the detail. The optional chart is secondary and never becomes a P85-specific target/trendline feature.

Normative change copy: `Improving · 4.2 working days, down from 5.0 in the previous comparable period.`; `Worsening · 7.1 working days, up from 5.8 in the previous comparable period.`; `Unchanged · within the existing neutral threshold.`; `N/A · one valid period is available.`; `Unavailable · no comparable historical data for this metric.`

### Team versus Scrum Master

Team popup: concise current value, change, interpretation, short meaning/calculation, and essential provenance. Scrum Master popup: same hierarchy with fuller calculation/source text, sample versus usable, coverage/gaps, unavailable reason, last-known/error context, and `View data table`. Both remain the same size class and share semantics.

### Visual Analytics reconciliation

Remove the old standalone `Visual Analytics` sections and any large inline historical trend blocks that duplicate this insight. Existing non-historical analytics that answer a distinct approved question may remain, but must not repeat the same metric history, direction, or popup content. The Executive Summary card popup is the single source for metric-card historical insight.

## 4. Component/state matrix

| State | Card | Popup |
|---|---|---|
| Valid current/history | Current value and disclosure affordance | Two-column details, explicit change/direction, optional adjacent-history mini-trend |
| Valid current/no history | Current value | `Unavailable · no comparable historical data for this metric.`; no trendline |
| One valid period | Current value | `N/A · one valid period is available.`; no direction claim |
| Partial history | Current/last-known value | `3 of 6 comparable periods available.`; gaps visible; no cross-gap inference |
| Missing current | `-` plus reason | `Unavailable · no valid value for [selected period].`; never zero |
| Loading | Existing value/skeleton without zero placeholder | `Loading [metric] insight…`; context remains visible |
| Retrying | Last-known value retained and labelled | `Retrying [metric] insight…`; no false freshness |
| Error | Last-known/current value retained | `Could not load [metric] insight. Current metrics are unchanged.` + `Try again` |
| Bottleneck | Existing category | Category meaning/current-to-previous category change; no numeric direction |
| Closed | Card unchanged | Focus returns to opening card |
| Mobile | Compact card | One-column bottom sheet/full-width dialog with internal scroll |

## 5. Visual system

Reuse existing Executive card, trend pill/arrow, popover/dialog, chart, tooltip, border, spacing, typography, and semantic status tokens. Desktop popup: 440–560px target, 360px minimum, 16–24px internal padding, 2-column grid with readable label/value pairs. Mobile: `calc(100vw - 24px)` or full-width bottom sheet, one-column stack, internal scroll.

Use visible labels, arrows, point shapes, line gaps, and text in addition to restrained color. Higher-is-better: Stories Done, Throughput, Velocity. Lower-is-better: Avg Cycle Time, SLE P85, Aging WIP, Done Bug Ratio. Bottleneck is categorical. No special P85 trendline status and no P50 control.

## 6. Figma handoff

Use the existing Executive Scrum Master Dashboard Make file referenced by `prompts/DESIGNER.md`. No Figma mutation is required for this docs-only task. Represent one reusable `Metric insight popup` with variants for each typed metric, Team/Scrum Master density, valid/history, no-history, one-period, partial, unavailable, loading, retrying, error, desktop two-column, mobile one-column drawer, point focus/pin, and focus-trap states.

Annotate the 360px minimum, 440–560px desktop target, two-column grid minimums, normal wrapping/no vertical text, selected-period authority, no duplicate same-period points, gap-aware history, exact provenance fields, old Visual Analytics removal/reconciliation, and focus return.

## 7. Accessibility

- Cards are real buttons/disclosures with explicit names and visible focus; Enter/Space opens the popup.
- Popup has dialog semantics, labelled title, initial focus on close or first meaningful control, focus trap, Escape close, and outside-click close when it does not conflict with an active control.
- Close restores focus to the exact opening card. Opening another card replaces the shared popup content without losing modal context.
- Optional trend points use roving `tabIndex`: ArrowLeft/Right and orientation-equivalent keys, Home/End, Enter/Space pin, Escape unpin; leading gaps must not leave no valid point reachable.
- Tooltip/detail works on focus as well as hover and includes period, value/unit, as-of, capturedAt, sample, usable, and source. Provide a semantic text summary or `View data table`.
- Announce popup opening, metric change, and meaningful loading/error/retry state politely; do not announce pointer movement or repeated redraws.
- Two-column layout must remain readable at zoom/reflow. Do not use CSS/markup that causes character-by-character vertical wrapping. Mobile controls are full-width and keyboard/touch reachable.
- State/direction is conveyed with text, icons/shapes, and line gaps, never color alone. Meet contrast and touch-target requirements.

## 8. Acceptance criteria for Developer/QA

1. The large inline Historical trends and duplicative old Visual Analytics metric-history sections are removed or reconciled; one metric-card insight popup is the single historical insight surface.
2. Every eligible Executive Summary card with stable data is clickable and keyboard-operable, opens the shared popup, and preserves team, selected period, mode, and card hierarchy.
3. Desktop popup has a robust readable 2-column detail grid, 360px minimum width and 440–560px target width; no collapsed ultra-narrow columns, vertical word wrapping, clipped content, or page-level horizontal overflow.
4. Mobile uses a readable stacked bottom sheet/reflow dialog with internal scroll, full-width actions, no clipping/overflow, and preserved focus/close behavior.
5. Typed content exists for Stories Done, Throughput, Avg Cycle Time, SLE P85, Aging WIP, Done Bug Ratio, Velocity, Bottleneck, and stable-contract cards: meaning, collection/calculation, unit, current, previous comparable change, interpretation, source/as-of/sample/usable.
6. Optional history appears only for real adjacent comparable snapshots in the sole selected-period window; same-period points are deduplicated, gaps never support inference, and one valid point is N/A. SLE P85 has no special trendline/target status.
7. Direction semantics are correct: higher-is-better for Stories Done/Throughput/Velocity; lower-is-better for time/Aging WIP/Done Bug Ratio; Bottleneck is categorical.
8. Missing, unavailable, loading, retrying, error, partial, and insufficient states are truthful and distinct; unavailable is never zero, and errors retain current/last-known data with safe retry.
9. Team popup is concise/presentation-safe; Scrum Master popup is richer with diagnostic/provenance/coverage detail without recreating a tall inline block.
10. Card keyboard activation, modal focus trap, Escape/outside close, focus restoration, hover/focus/pinned point detail, semantic summary/table, responsive reflow, and contrast/non-color semantics pass QA. Existing formulas, data boundaries, and local-only scope remain unchanged.
