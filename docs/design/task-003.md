# TASK 003 — Flow Time and Cycle Time scatter design handoff

## 1. User decision

The user needs to answer two related questions without leaving the current Executive Team View:

- Team view: “How much working time does delivery take, and does the recent work fit the delivery expectation?”
- Scrum Master view: “Where is the spread in delivery time, which data points explain it, and which items need data-quality review?”

This is a presentation-layer restoration. The experience must reuse the existing `flowTiming`, `ScatterPoint`, `SleValues`, period filter, and working-day contracts. It must not re-enable `.legacy-team-ui`, introduce new metrics, or recalculate aggregates in the component layer.

Minimum safe restoration and recommendation are the same for this task:

- Add a focused shared Flow Time card group and focused Cycle Time scatter panel inside the current `ExecutiveTeamView` flow.
- Reuse the existing `TeamDetail` scatter behavior through a focused current panel or extracted presentation component.
- Keep Team mode compact and presentation-safe; keep Scrum Master mode diagnostic.
- Do not add a new chart type, threshold, score, or filter dimension.

## 2. Information hierarchy

1. Context: selected team, selected period, view mode, and data freshness already shown by the Executive Team View header.
2. Flow Time: Lead Time, Active Time, and Cycle Time as three explicit cards.
3. Interpretation: each card shows average working days, sample count, a short definition, and unavailable reason when no value exists.
4. Cycle Time distribution: resolution-date scatter against Cycle Time in working days.
5. Delivery expectation: SLE reference line(s), with P85 as the only Team-view line and configurable percentile lines in Scrum Master view.
6. Diagnostics: selected point, issue data, issue-type inclusion, and anomaly exclusion/restore controls only in Scrum Master view.
7. Data-quality boundary: a persistent note states that Time in Status values are diagnostic averages and are not additive parts of Lead Time, Active Time, or Cycle Time.

The visual order must make the three flow-time cards understandable before the chart. Do not place the scatter above the cards or bury the cards inside the existing “Delivery Trends” chart grid.

## 3. Screen and flow specification

### 3.1 Team view placement

Inside `TeamDesignView`, preserve the current order and insert the restoration as follows:

1. Existing `Team Flow` section and current KPI cards.
2. New `Flow Time` section with three cards in this order:
   `Lead Time` → `Active Time` → `Cycle Time`.
3. A full-width, compact `Cycle Time` scatter panel directly below the cards.
4. Existing `FlowPipeline` section.
5. Existing `Delivery Trends` and quality cards.

The Flow Time section should use the existing `exec-figma-section-head` pattern. The section subtitle should identify the selected period and say `working days`; it must not imply that the three averages are additive.

Recommended panel copy:

- Section title: `Flow Time`
- Section subtitle: `Average duration for the selected period · working days`
- Diagnostic note: `Time in Status is diagnostic only and is not added to Lead, Active, or Cycle Time.`
- Scatter title: `Cycle Time`
- Scatter subtitle: `Completed items by resolution date · selected period · working days`

Team cards:

- Value: average from the selected-period `flowTiming` snapshot.
- Unit: `working days` in visible supporting text; use a compact `wd` suffix only when space requires it.
- Sample: `n={count} completed items` or the metric-specific sample count supplied by the snapshot.
- Definition: one short sentence that mirrors the existing domain meaning; do not invent a new metric interpretation.
- Missing value: `-` plus a reason such as `No eligible items in this period` or `Metric unavailable from current data`.

The Team scatter is presentation mode:

- Show resolution date on the x-axis and Cycle Time in working days on the y-axis.
- Show only the P85 SLE reference line when `p85` is non-null.
- Keep hover feedback, but do not expose issue exclusion, issue-type editing, restore actions, or governance controls.
- Point selection is disabled in the presentation view. The panel must remain useful when projected or screen-shared.
- If a tooltip includes an issue key, it must remain read-only and must not suggest an action. Prefer the compact tooltip: `Resolved`, `Cycle Time`, and `working days`; include the issue key only where the existing presentation context allows it.

### 3.2 Scrum Master view placement

Inside `ScrumMasterDesignView`, preserve the current order and insert the restoration as follows:

1. Existing `Executive Summary` section.
2. Existing `Team Health` section.
3. New `Flow Time` section with the same three cards in the same order.
4. Diagnostic note about Time in Status.
5. Full-width `Cycle Time` scatter panel.
6. Existing `Visual Analytics` section and its trend/secondary charts.
7. Existing `Drill Down` section.

Scrum Master cards retain the same primary average but add diagnostic detail:

- percentile detail in a compact line, for example `P50 / P85 / P95: 4.0 / 9.0 / 16.0 wd`;
- sample count;
- previous-period context where available, using the existing previous snapshot/trend data;
- explicit unavailable copy when a percentile or previous value is null.

The Scrum Master scatter retains full existing diagnostics:

- P50/P70/P85/P95 visibility toggles;
- issue-type inclusion controls;
- selectable points;
- issue data table;
- anomaly exclusion and restore callbacks;
- presentation of invalid-date filtering and unavailable percentile lines without drawing zero lines.

Keep controls in a compact control row below the panel header and above the chart. On narrow screens, wrap controls into stacked rows; do not create horizontal page overflow.

### 3.3 Shared panel structure

The focused panel should have this structure in both modes:

1. Panel header: title, selected-period subtitle, and mode-appropriate supporting label.
2. Legend row: completed item point plus visible SLE lines and their values.
3. Optional controls row: Scrum Master only.
4. Chart region.
5. Inline data note: selected-period basis, working-day basis, and invalid-date exclusion notice when applicable.
6. Scrum Master-only issue table and anomaly controls.

Do not render the hidden legacy wrapper or duplicate the old team-page header/tabs. The current Executive Team View owns page context and navigation.

## 4. Component and state matrix

| Component/state | Team view | Scrum Master view | Required behavior |
|---|---|---|---|
| Flow Time cards / normal | 3 compact cards | 3 diagnostic cards | Average from selected `flowTiming`; show unit and sample count. |
| Flow Time / unavailable | `-` + short reason | `-` + short reason; percentile subline may also be unavailable | Never render null as `0`. |
| Flow Time / previous period | Omit or keep to a restrained comparison line if already supported | Show previous-period value/trend where available | Do not add a new comparison calculation. |
| Flow Time / loading | Existing Executive loading treatment or skeleton panel | Same | No chart controls appear active while data is loading. |
| Flow Time / error | Inline error with retry/path supplied by existing shell | Same | Do not replace with zero-valued cards. |
| Flow Time / stale or incomplete data | Keep values visible with existing data-quality context | Keep values visible with diagnostic context | Distinguish unavailable from a valid zero; do not invent a new freshness model. |
| Diagnostic note | Visible below cards or in panel footer | Visible below cards or in panel footer | State that Time in Status is diagnostic and non-additive. |
| Scatter / normal | Compact, read-only presentation | Full diagnostic panel | Shared contracts and period filter. |
| Scatter / P85 | P85 line only when non-null | P85 line available through visibility control | Line label and dash pattern must accompany color. |
| Scatter / other percentiles | Hidden | Toggleable P50/P70/P85/P95 | Nullable values omit the line and legend item. |
| Scatter / no team | Explain that a team must be selected | Same | Do not show an empty chart frame as if data loaded. |
| Scatter / no metrics | `No Cycle Time data yet. Import data and run analysis.` | Same, with diagnostic context if appropriate | Keep next step actionable. |
| Scatter / no completed items in period | `No completed items in this period.` | Same | Preserve selected period in the message. |
| Scatter / invalid dates | Omit invalid points; show a small data note if any were omitted | Same, plus diagnostic count if available | Invalid dates must not distort the axis or become zero dates. |
| Scatter / selected point | No selection action in Team mode | Point selection updates the selected-point summary and issue controls | Keyboard/table alternative must exist for the selected point. |
| Tooltip | Read-only compact tooltip | Full tooltip with issue key, resolved date, Cycle Time, and working-day unit | Tooltip contrast must meet readable contrast; never rely on point color alone. |
| Issue table | Hidden | Collapsed/expandable below chart | Table is the accessible data alternative and uses the same filtered points. |
| Issue-type controls | Hidden | Visible above chart | Apply/reset semantics remain explicit and disabled while busy. |
| Anomaly controls | Hidden | Visible below table/selected-point summary | Preserve App-owned exclude/restore callbacks and reason requirement. |
| Permission/workspace unavailable | Handled by existing app shell | Handled by existing app shell | Panel must not claim data exists when workspace access is unavailable. |

## 5. Visual system and reusable tokens

Reuse the current Executive Team View styles; do not introduce a separate visual language.

- Surface: existing `#fff` card surface on `#f8fafc` page background.
- Border: existing `#e2e8f0`; use the existing 12 px card radius.
- Section heading: existing `.exec-figma-section-head`, uppercase 11 px label with muted supporting text.
- Flow cards: reuse `.exec-flow-metric-grid` and `.exec-flow-metric`.
- Card accent: existing 3 px left accent; use neutral/indigo for metric identity, not as the sole signal.
- Primary value: existing tabular numeric treatment; average values should be visually dominant.
- Secondary text: existing muted hierarchy; definitions and sample counts remain readable at desktop and mobile sizes.
- Chart panel: reuse `.exec-chart-card` padding/header conventions, but allow the scatter to span the available content width.
- Grid: 8 px internal card gap, 12 px section gap, and current `exec-figma-scroll` page padding.
- Responsive breakpoints: follow existing 980 px and 620 px Executive styles; cards stack to one column at narrow widths, and chart controls wrap without horizontal overflow.

Legend encoding must be redundant:

- Points: filled circular marker plus text `Completed item`.
- P50/P70/P85/P95: distinct dash pattern and text label/value; color may reinforce but cannot carry meaning alone.
- P85 Team presentation line: label it `P85 delivery expectation` rather than relying on a red/orange line.
- Unavailable percentile: omit the line and show `P85 unavailable` only when that context is useful; never draw a zero line.

## 6. Figma handoff

Visual source of truth: existing Figma Make file referenced by `prompts/DESIGNER.md`:

`https://www.figma.com/make/1tKoJpi3Qlbqao6uqh3pHl/Executive-Scrum-Master-Dashboard?t=xUpnKuK9zl2tXuc5-20&fullscreen=1`

No Figma node-specific URL was supplied, so this handoff uses the existing Executive Team View patterns in the repository as the implementation reference. No Figma nodes were changed.

Developer should map the design to the current component architecture as follows:

- `ExecutiveTeamView` remains the page owner.
- `TeamDesignView` and `ScrumMasterDesignView` receive the same focused Flow Time/scatter presentation contract, with mode-specific controls.
- The old `TeamDetail` behavior may be extracted into a focused shared panel, but the full legacy page wrapper must not return.
- App remains the owner of selected period, `flowTiming`, `SleValues`, issue-type draft/apply state, and exclude/restore callbacks.
- Do not move metric aggregation into `ExecutiveViews.tsx` or the new panel.

Figma QA frame recommendation: one desktop frame showing Team mode and one showing Scrum Master mode, plus a mobile stacked frame with the three cards, chart, and wrapped controls. Annotate the empty/no-data and unavailable percentile states in the same component set.

## 7. Accessibility

- Keep the existing tab semantics for the surrounding Team detail navigation: active tab uses `aria-selected`, and the tab panel has an associated accessible label.
- All buttons, checkboxes, select controls, table disclosure, and restore actions must be keyboard reachable with visible focus.
- The chart needs an accessible summary that names the selected team, selected period, x-axis (`Resolution date`), y-axis (`Cycle Time in working days`), visible SLE lines, and point count.
- The issue table is the primary keyboard-accessible alternative to SVG point interaction. Selecting a row must expose the same selected-point state as selecting a chart point in Scrum Master mode.
- Tooltip text must have sufficient contrast and must not be the only way to discover a value.
- Do not communicate percentile meaning or anomaly state through color alone; pair color with text and dash/shape differences.
- Use tabular numerals for days and counts. Keep labels explicit: `working days`, `sample`, `resolved`, and `Cycle Time`.
- Do not use issue-key-only labels for controls; action names must explain intent, such as `Exclude data error` and `Restore`.
- In Team presentation mode, keep the chart read-only and ensure focus does not enter hidden controls.

## 8. Acceptance criteria

Developer acceptance:

1. No `.legacy-team-ui` display rule is removed or bypassed to restore this experience.
2. Lead Time, Active Time, and Cycle Time appear in the current Executive Team View in that order, before the scatter panel.
3. Cards read the selected-period `flowTiming` snapshot and do not calculate a second aggregate.
4. Cards show average, working-day unit, sample count, short definition, and explicit unavailable reason where needed.
5. Team mode shows a compact read-only scatter with resolution-date x-axis, working-day y-axis, and only a non-null P85 line.
6. Scrum Master mode shows percentile/sample/previous-period detail where available and preserves the full existing scatter controls/callbacks.
7. Period changes update cards, scatter points, lines, legend, and table together.
8. Invalid dates are ignored; nullable percentile lines are omitted; missing values never display as zero.
9. Time in Status is explicitly described as diagnostic and non-additive.
10. Desktop and mobile layouts remain within the current Executive style and do not introduce horizontal overflow.
11. Accessible labels, keyboard operation, focus states, chart summary, and issue-table alternative are present.
12. No customer data, metric logic, import logic, or workspace files are changed.

QA acceptance:

1. Verify Team and Scrum Master modes independently with fixture data containing normal, empty, null-percentile, invalid-date, and unavailable states.
2. Verify the three card values and sample counts against the existing `flowTiming` snapshot for at least two selected periods.
3. Verify that P85 is the only Team line and that null P85 renders no line.
4. Verify Scrum Master percentile toggles, issue-type controls, point selection, table disclosure, exclusion, and restore behavior.
5. Verify the selected point remains synchronized between chart and table.
6. Verify chart and control behavior at desktop and mobile widths, including keyboard-only operation and visible focus.
7. Verify `.legacy-team-ui` remains hidden and no duplicate legacy header/tabs appear.
8. Verify no values are presented as zero solely because data is missing or invalid.

