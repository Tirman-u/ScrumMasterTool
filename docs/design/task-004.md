# TASK 004 — Metric Trust & Coverage Designer Handoff

## 1. User decision

The user should be able to understand what each displayed metric means, how it was collected, how it was calculated, and whether the value is complete enough to trust—without leaving the current Executive Team View.

The four cards are always ordered:

`Lead Time` → `Active Time` → `Cycle Time` → `SLE P85`

P85 is the only percentile exposed in this experience. Do not add any other percentile labels, controls, or contract fields to the UI.

This is a presentation-layer trust affordance only. Existing formulas, Monday-Friday working-day semantics, selected-period filtering, source contracts, and fallback behavior remain unchanged.

## 2. Information hierarchy

### Card surface

Each card shows only the decision-relevant summary:

1. Metric label.
2. Info button.
3. Primary value, or `-` when unavailable.
4. Unit: `working days`.
5. Usable sample count.
6. Compact state label when the value is partial or unavailable.

The card must not imply that Lead Time, Active Time, and Cycle Time are additive. Keep the existing diagnostic note nearby:

> Time in Status is diagnostic only. These per-status averages are not additive parts of Lead Time, Active Time, or Cycle Time.

### Popover surface

The popover uses the same structure for every metric:

1. What it measures.
2. How it is calculated.
3. Data basis: selected period and Monday-Friday working days.
4. Usable/eligible count and coverage, when available.
5. State and reason: complete, partial, or unavailable.
6. Scrum Master-only provenance: source, fallback, and data-quality detail.

The Team popover is concise and presentation-safe. The Scrum Master popover exposes the diagnostic metadata needed to investigate trust without exposing customer issue rows or internal identifiers.

## 3. Screen and interaction specification

### 3.1 Placement

Place the four cards in the existing Executive Team View `Flow Time` section, using the same section heading and card tokens already established for TASK 003.

Desktop:

- Four equal cards in one row when the content area permits.
- Card header places the label on the left and a 20–24 px circular `i` info button on the right.
- Keep the info button inside the card header; it must not change card height when closed.

Medium widths:

- Use a two-column grid.
- Popover width is constrained to the available card/viewport width.

Mobile:

- Stack cards in the existing single-column Executive layout.
- The popover becomes an inline full-width disclosure immediately below the card header/value, not a viewport-fixed overlay.
- Opening one popover may increase only that card’s height; it must not cause horizontal scrolling.

### 3.2 Opening and dismissal

- Use a real `<button type="button">` with an accessible name: `Explain Lead Time`, `Explain Active Time`, `Explain Cycle Time`, or `Explain SLE P85`.
- The button toggles one popover at a time. Opening another metric closes the previous one.
- Use a stable unique `id` per metric, for example `metric-trust-lead-time`.
- The button exposes `aria-expanded` and `aria-controls`.
- The popover is an informational disclosure, not a modal dialog; do not trap focus.
- Escape closes the open popover and returns focus to its info button.
- Clicking/tapping outside the metric anchor closes it.
- If the popover would leave the viewport on desktop, flip or align it within the card/section bounds. Never clip the copy.
- On mobile, render it inline/full width under the card content rather than using absolute positioning.

### 3.3 Team view variant

Team view card content remains compact:

```text
Lead Time                         [i]
12.4 working days
Based on 42 usable items
Complete
```

The Team popover contains four short blocks:

```text
What it measures
Working days from the configured lead-time start to Done.

How it is calculated
Funnel + Active + Implementing durations to Done.

Data basis
Selected period · Monday-Friday working days · 42 usable observations.

State
Complete. Coverage: 42 usable observations.
```

Team view must not show raw source paths, fallback implementation detail, internal data-quality IDs, or issue-level customer data. If the value is partial, show a short reason but keep the explanation understandable in a presentation:

```text
State
Partial. Some eligible observations did not have complete status history.
```

For SLE P85, the Team copy is:

```text
What it measures
The working-day expectation that 85% of eligible completed Cycle Time observations finish within.

How it is calculated
P85 of eligible completed Cycle Time observations in the selected period.

Interpretation
An expectation, not a guarantee for every item.

Data basis
Selected period · Monday-Friday working days · {usable} usable observations.
```

### 3.4 Scrum Master view variant

The Scrum Master card keeps the same compact primary surface but opens a richer diagnostic popover:

```text
Cycle Time                         [i]
6.8 working days
Based on 58 usable items
Partial
```

The richer popover uses a compact two-column metadata list after the definition/calculate blocks:

```text
What it measures
Working days spent in Implementing statuses before Done.

How it is calculated
Implementing durations to Done. Where the existing contract permits it,
elapsed working-day fallback is used for observations without usable status timing.

Data basis
Selected period: {period}
Working-day basis: Monday-Friday

Coverage
Eligible: {eligible}
Usable: {usable}
Coverage: {coverage}

Source
Jira issue history/status transitions and the configured workflow mapping.

Fallback
{fallback copy, or “None used.”}

Data quality
{complete/partial/unavailable reason}
```

For SLE P85, the Scrum Master popover additionally includes:

```text
Interpretation
85% of eligible completed Cycle Time observations finished within this value.
This is an expectation, not a guarantee.

Source
Derived from the selected-period eligible Cycle Time observations.

Fallback
Cycle Time fallback observations are included only where the existing contract permits them;
their presence is disclosed in the state/data-quality line.
```

Do not expose any other percentile in the card or popover.

## 4. Exact metric content

The following copy is the canonical content source. `{period}`, `{eligible}`, `{usable}`, `{coverage}`, and `{fallback}` are existing typed metadata values; if a value is unavailable, omit the row or show the specified unavailable reason rather than inventing a denominator.

| Metric | What it measures | How it is calculated | Source | Fallback / partial explanation |
|---|---|---|---|---|
| Lead Time | Working days from the configured lead-time start to Done. | Funnel + Active + Implementing durations to Done. | Jira issue history/status transitions and configured workflow mapping. | `Partial. Some eligible observations did not have complete status history.` Do not imply a fallback unless the existing contract provides one. |
| Active Time | Working days spent in Active and Implementing statuses before Done. | Active + Implementing durations to Done. | Jira issue history/status transitions and configured workflow mapping. | `Partial. Some eligible observations did not have complete status history.` |
| Cycle Time | Working days spent in Implementing statuses before Done. | Implementing durations to Done; use the existing elapsed working-day fallback only where already permitted. | Jira issue history/status transitions and configured workflow mapping. | `Partial. Elapsed working-day fallback was used for some observations.` If no fallback was used: `None used.` |
| SLE P85 | The working-day expectation within which 85% of eligible completed Cycle Time observations finish. | P85 of eligible completed Cycle Time observations for the selected period. | Derived from the selected-period eligible Cycle Time observations. | `Partial. The expectation is based on incomplete coverage.` If no eligible observations exist: `Unavailable. No eligible completed Cycle Time observations in this period.` |

Every metric also shows:

- `Working-day basis: Monday-Friday`.
- `Selected period: {period}`.
- `Usable: {usable} observations` when available.
- `Coverage: {coverage}` only when the denominator is supplied by the trust contract.

## 5. State matrix

| State | Card | Team popover | Scrum Master popover |
|---|---|---|---|
| Complete | Value + `working days` + usable count + `Complete` | Definition, calculation, period, basis, usable count, complete statement | All Team content plus source, eligible count, coverage, fallback `None used`, data-quality detail |
| Partial | Value remains visible + `Partial` label | One concise reason; do not expose implementation internals | Reason plus eligible/usable/coverage and exact fallback statement where applicable |
| Unavailable | `-` + `Unavailable` label | Exact reason, for example `No eligible observations in this period.` | Exact reason, source/data-quality context, and next safe action if known, for example `Import or renew data, then recalculate.` |
| Loading | Skeleton/placeholder; info button may remain available only if definitions are static | Static definition may be shown; dynamic counts/state are omitted | Same; no stale dynamic metadata shown as current |
| Error | `-` + `Unable to verify` | `The metric explanation is available, but current data quality could not be verified.` | Include existing error context; do not fabricate source, coverage, or fallback values |
| Permission/workspace unavailable | Handled by existing shell; card does not claim a value | Explain that workspace access is required | Same; no customer data in the message |
| No eligible observations | `-` + `Unavailable` | `No eligible completed observations in this period.` | Same, plus eligible/usable rows only when their values are known |
| Partial fallback (Cycle Time) | Value + `Partial` | `Elapsed working-day fallback was used for some observations.` | Same plus fallback/source/data-quality detail |

Valid zero is not treated as missing, but the card must still show the existing metric unit and sample context. Missing, invalid, or unverified values are never rendered as `0`.

## 6. Visual system and reusable tokens

Reuse the existing trust affordance patterns already present in the app:

- `.metric-help-anchor` for the button/popover anchor behavior.
- `.metric-help-btn` for the circular `i` button, visible focus, hover, and pressed state.
- `.metric-help-popover` for the compact surface, border, shadow, and text hierarchy.
- Existing Executive card tokens: white surface, `#f8fafc` page background, `#e2e8f0` border, 12 px radius, and current muted text hierarchy.

The info button is an affordance, not a health signal. Keep it neutral; do not color it green/yellow/red based on metric state. State labels must include text (`Complete`, `Partial`, `Unavailable`) and may use existing restrained state backgrounds as reinforcement.

Popover content hierarchy:

- Metric title: 13–14 px semibold.
- Section labels: 10–11 px uppercase or semibold muted text.
- Body copy: at least the existing 0.78 rem popover size; line-height around 1.4 or higher.
- Metadata values: tabular numerals for counts and coverage.
- On narrow screens, use full available width with 12–16 px horizontal inset.

Do not use a tooltip-only implementation for the required explanation; hover alone is inaccessible to keyboard and touch users.

## 7. Figma handoff

Visual source of truth remains the existing Figma Make file from `prompts/DESIGNER.md`:

`https://www.figma.com/make/1tKoJpi3Qlbqao6uqh3pHl/Executive-Scrum-Master-Dashboard?t=xUpnKuK9zl2tXuc5-20&fullscreen=1`

No node-specific Figma URL was supplied and no Figma nodes are changed in this documentation-only task. The Developer should place the four cards in the current Executive `Flow Time` section and use the existing metric-help visual pattern rather than creating a new component language.

Recommended Figma states to represent:

- Team: four closed cards, one open compact popover, one partial card, one unavailable card.
- Scrum Master: four closed cards, one open rich popover with metadata rows, fallback Cycle Time state, unavailable SLE P85 state.
- Mobile: one card with inline/full-width popover and no horizontal overflow.

## 8. Accessibility and responsive acceptance

- Every info control is a real button with a unique accessible name and `aria-expanded`/`aria-controls`.
- Each popover has a unique ID and is associated only with its owning button.
- Keyboard flow: Tab reaches each info button; Enter/Space toggles; Escape closes and returns focus; outside pointer interaction dismisses without trapping focus.
- Visible focus must remain clear against the white card surface and muted border.
- Popovers must not depend on hover and must be usable with touch.
- On mobile, popover content is inline/full-width within the card/section and never creates horizontal scrolling or clipped text.
- The button remains reachable when the popover is open, and opening one metric closes any other open metric.
- State and interpretation must be communicated with text, not color alone.
- Screen-reader output should include metric name, current value/state, and the popover’s explanation when expanded.
- No issue keys, team names, JQL, tokens, CSV content, or other customer data may be added to static copy or examples.

## 9. Acceptance criteria

Developer:

1. Add one info button to each of Lead Time, Active Time, Cycle Time, and SLE P85 cards in the current Executive Team View.
2. Preserve the exact card order and existing formulas/working-day semantics.
3. Team popovers contain concise definition, calculation, basis, selected period, usable count, and state/reason.
4. Scrum Master popovers additionally contain source, eligible count, usable count, coverage, fallback, P85 interpretation where relevant, and data-quality detail.
5. Expose only SLE P85; no other percentile appears in UI copy, controls, or newly introduced contracts.
6. Keep missing values as `-` and distinguish complete, partial, unavailable, loading, and error states.
7. Disclose Cycle Time fallback as partial whenever the existing fallback is used.
8. Use the existing metric-help button/popover patterns and Executive tokens; do not introduce a modal or hover-only tooltip.
9. Implement responsive inline/full-width popovers on narrow screens without horizontal overflow.
10. Do not change metric calculations, import logic, customer data, or workspace files.

QA:

1. Verify all four controls and their unique IDs/`aria-controls` relationships.
2. Verify Team and Scrum Master copy/content differences and exact P85-only scope.
3. Verify complete, partial, unavailable, loading, error, no-eligible, and Cycle Time fallback states.
4. Verify selected-period/basis/count/coverage values match the existing trust metadata and do not invent denominators.
5. Verify keyboard Enter/Space/Escape, focus return, outside dismissal, and touch behavior.
6. Verify desktop, tablet, and mobile placement, including popover clipping and horizontal overflow.
7. Verify formulas and working-day calculations are unchanged.
8. Verify no customer data or secrets appear in source copy, fixtures, or documentation examples.

