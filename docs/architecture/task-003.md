# TASK 003 — Restore flow-time visibility and Cycle Time scatter

## Decision

Restore the missing views in the current `ExecutiveTeamView` as a presentation-layer migration. Do not re-enable the hidden `.legacy-team-ui` subtree and do not change metric calculations.

Extract or reuse the existing `TeamDetail` scatter presentation in a focused panel. Lead Time, Active Time, and Cycle Time cards must read the existing period-aware `flowTiming` snapshot.

## Scope

- Make Lead Time, Active Time, and Cycle Time visible as explicit flow-time cards.
- Add a first-class Cycle Time scatter panel using existing scatter points and SLE values.
- Preserve working-day semantics, period filtering, SLE lines, tooltips, and existing App-owned exclusion/configuration callbacks.
- Team view stays compact and presentation-safe; Scrum Master view keeps diagnostic controls.
- Add UI and regression tests; do not add metrics or recalculate aggregates in the component layer.

## Excluded

- No changes to metric, SLE, working-day, import, Jira, workspace, or customer-data logic.
- Do not show the complete legacy team UI.
- No new thresholds, scoring, confidence rules, export, or filter dimensions.

## Data and UI contract

- Cards use `TeamMetrics.flowTiming.leadTime`, `activeTime`, and `cycleTime` from the existing selected-period snapshot.
- Scatter uses `ScatterPoint`, `SleValues`, and the existing period utility; invalid dates are ignored.
- Display `working days` consistently. Nullable values are unavailable (`-`), never zero.
- Team mode: compact cards and a reduced scatter with the presentation SLE line; hide issue exclusion and governance controls.
- Scrum Master mode: cards include percentile/sample detail and the scatter keeps SLE toggles, issue-type controls, issue table, and exclusion/restore callbacks.
- Empty states must explain missing team, missing metrics, or no completed items in the selected period.
- Explain that Time in Status rows are diagnostic and are not additive parts of Lead/Active/Cycle Time.

## Handoff and acceptance

Designer must specify placement, responsive behavior, accessible controls, tooltip/legend treatment, and empty states. Developer must keep aggregation in App/domain code and wire typed props/callbacks. QA must verify both modes, period changes, null/empty data, working-day labels, SLE lines, keyboard/accessibility behavior, and that hidden legacy UI remains hidden.
