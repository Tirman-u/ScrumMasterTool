# TASK 010 — Designer handoff: Executive Summary metric insights

## 1. User decision

Replace the large inline `Historical trends` block with one compact insight modal/popover opened from every important existing metric card where data exists. Eligible cards include Stories Done, Throughput, Avg Cycle Time, SLE P85, Aging WIP, Done Bug Ratio, Velocity, Bottleneck, and other existing cards with a valid historical contract.

This is an insight interaction, not a new dashboard or metric calculation. Preserve the selected team, shared period, mode, existing formulas, and current card hierarchy. Do not add P50 or a special P85 trendline status. Missing data is never shown as zero.

## 2. Information hierarchy

Inside the popup, show: metric name, current value, unit, selected team and period; change versus the previous comparable period with explicit `Improving`, `Worsening`, `Unchanged`, `N/A`, or `Unavailable`; an optional small line trend only with real comparable history; sample/usable count, `as-of`, `capturedAt`, and source; concise meaning and collection/calculation explanation; and missing/unavailable/partial/insufficient reason with safe last-known/retry state where applicable.

The selected period is the sole authoritative historical-window endpoint/filter across Team, Scrum Master, cards, popup, chart, and table. There is no period control inside the popup.

## 3. Screen/flow specification

### Card entry point

Make each eligible metric card a keyboard-operable disclosure entry point. Use a real button or card button pattern with an accessible name such as `Open Avg Cycle Time insight`. Preserve the existing card value, unit, trend badge, and layout. A subtle `View insight` affordance may be used, but is not color-only.

Card activation opens one popup anchored to the card on desktop and as a bottom sheet/full-width dialog on narrow mobile. Only one popup is open at a time. Opening another card replaces content in the same popup and keeps selected team/period unchanged.

### Popup anatomy and copy

Header: `[Metric name] insight` plus `[Team name] · [selected period]`. Body order: `Current` value/unit; `Change` versus previous comparable period; optional `Trend`; `Meaning`; `How calculated`; and `Data details`.

Normative change copy:

- `Improving · 4.2 working days, down from 5.0 in the previous comparable period.`
- `Worsening · 7.1 working days, up from 5.8 in the previous comparable period.`
- `Unchanged · within the existing neutral threshold.`
- `N/A · one valid period is available.`
- `Unavailable · no comparable historical data for this metric.`

Metric meaning/copy:

| Metric | Meaning and direction |
|---|---|
| Stories Done | Completed items in the selected period. Higher is better with scope/context. |
| Throughput | Completed items per the existing throughput unit. Higher is better. |
| Avg Cycle Time | Average configured Cycle Time in working days. Lower is better. |
| SLE P85 | 85% of valid completed items finished within this working-day duration. Lower is better. |
| Aging WIP | Existing aging-WIP measure. Lower is better. |
| Done Bug Ratio | Share of completed items classified as bugs. Lower is better. |
| Velocity | Existing velocity measure and unit. Higher is better. |
| Bottleneck | Existing categorical bottleneck state/measure. Compare category movement, not numeric magnitude. |

`How calculated` uses the existing metric contract and source wording; no new formula is invented. Point detail includes `period`, value/unit, `as-of`, `capturedAt`, sample, usable, and source when available. Missing provenance is labelled unavailable, never fabricated.

### Optional trend interaction

Render the small trend only when at least two adjacent valid comparable periods exist in the selected window. Gaps remain gaps; never connect or compare across a missing/invalid period. One valid period shows value/provenance but `N/A · one valid period is available.` No duplicate same-period points may appear.

Hover and focus expose the same detail: metric, period, value/unit, `as-of`, `capturedAt`, sample, usable, source. Clicking or Enter/Space pins the detail. Escape or outside click closes/unpins the current layer.

### Team versus Scrum Master

Team popup is presentation-safe: current value, one-line interpretation, short meaning, optional small trend, and compact data detail. Scrum Master popup is richer: full calculation/source note, sample versus usable count, coverage/gap explanation, last-known/error detail, and optional data table. Both use the same selected context and truth rules.

## 4. Component/state matrix

| State | Card | Popup behavior |
|---|---|---|
| Valid current/history | Current value and existing trend affordance | Value, change, optional line trend, meaning, calculation, provenance |
| Valid current/no history | Current value | `Unavailable · no comparable historical data for this metric.`; no trendline |
| One valid period | Current value | `N/A · one valid period is available.`; no direction claim |
| Partial history | Current value with coverage if supported | Gapped line; `3 of 6 comparable periods available.`; direction only for adjacent valid pair |
| Missing current | `-` with reason | `Unavailable · no valid value for [selected period].`; no zero |
| Loading | Existing card skeleton/quiet loading | `Loading [metric] insight…`; context visible; no placeholder zeros |
| Retrying | Existing value/last-known card remains | `Retrying [metric] insight…`; last-known labelled; no false freshness |
| Error | Existing card/current last-known value remains | `Could not load [metric] insight. Current metrics are unchanged.` + `Try again` |
| Bottleneck categorical | Existing category | Explain category transition/current category; no numeric higher/lower semantics |
| Popup closed | Existing card unchanged | Focus returns to opening card |
| Mobile | Existing card remains compact/tappable | Bottom sheet/full-width dialog; internal scroll if needed |

Loading, retrying, error, partial, unavailable, and one-valid-period states are explicit. Current/last-known data is retained during failure; status must not rewrite metric values or timestamps.

## 5. Visual system

Reuse existing Executive metric cards, trend pills/arrows, chart-card, tooltip, dialog/popover, border, spacing, typography, and semantic status tokens. Remove the large inline trend block from the main view; the popup is the sole historical insight surface.

Keep the popup compact: target desktop width 360–480px and a small trend plot 120–160px high. Use a clear divider between interpretation and provenance. Higher-is-better applies to Stories Done/Throughput/Velocity; lower-is-better applies to Avg Cycle Time/SLE P85/Aging WIP/Done Bug Ratio; Bottleneck is categorical.

## 6. Figma handoff

Use the existing Executive Scrum Master Dashboard Make file referenced by `prompts/DESIGNER.md` as source of truth. No Figma mutation is required for this documentation-only task. Represent one reusable `Metric insight popup` with card-entry, Team/Scrum Master, valid/history, no-history, one-period, partial, unavailable, loading, retrying, error, pinned-point, desktop-popover, and mobile-bottom-sheet variants.

Annotate focus return, focus trap, Escape/outside close, selected-period authority, no-zero/no-duplicate rules, provenance fields, and gap-aware optional trend behavior. Do not retain the old inline Historical trends block in the design handoff.

## 7. Accessibility

- Metric cards expose real button/disclosure semantics and explicit names; keyboard Enter/Space opens the insight.
- Popup uses dialog semantics with a labelled title, visible focus, focus trap while open, Escape close, and outside-click close when it does not conflict with an active control.
- On close, return focus to the exact opening card. Opening another card replaces popup content without losing focus context.
- Optional trend points use roving `tabIndex`: ArrowLeft/Right and orientation-equivalent keys move points, Home/End jump to bounds, Enter/Space pins detail, and Escape unpins. Leading gaps must not leave zero reachable points.
- Tooltip/detail is available on focus as well as hover and includes the same provenance fields. Provide `View data table` or semantic text summary.
- Announce popup opening, metric selection, meaningful state changes, and pinned-point summaries politely; do not announce pointer movement or repeated redraws.
- Use visible labels, icons/shapes, line gaps, and text so direction/state never rely on color. Meet contrast and touch-target requirements.

## 8. Acceptance criteria for Developer/QA

1. The large inline Historical trends block is removed/replaced; no duplicate trend surface is added to the main view.
2. Every specified existing metric card with data is clickable and keyboard-operable, opens the same reusable compact insight popup, and preserves team/period/mode context.
3. Popup content includes meaning, collection/calculation, current value, change versus previous comparable period, explicit interpretation, units, sample/usable, as-of, capturedAt, and source where available.
4. Optional trend appears only with real comparable history; no duplicate same-period points, no interpolation/inference across gaps, and one valid period is `N/A`.
5. Selected period is the sole authoritative historical-window endpoint/filter across all cards, modes, popup content, chart, and table; no popup period selector exists.
6. Direction semantics are correct: Stories Done/Throughput/Velocity higher is better; Avg Cycle Time/SLE P85/Aging WIP/Done Bug Ratio lower is better; Bottleneck is categorical. P85 has no special trendline status.
7. Missing, unavailable, zero, partial, loading, retrying, error, and one-valid-period states are distinct; no unavailable value is substituted with 0, and errors retain last-known/current data with retry.
8. Team popup is concise/presentation-safe; Scrum Master popup provides richer diagnostic/provenance/coverage detail without returning to a tall inline layout.
9. Card keyboard entry, dialog focus trap, Escape/outside close, focus return, point roving tabindex/navigation/pin/unpin, hover/focus detail, and text/table fallback work on desktop and mobile.
10. QA verifies responsive popup sizing/scroll, contrast/non-color semantics, selected-period changes, gap/duplicate handling, provenance completeness, state truthfulness, and unchanged existing formulas/data boundaries. No application code is part of this Designer handoff.
