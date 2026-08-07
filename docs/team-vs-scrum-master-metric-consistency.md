# Team vs Scrum Master metric consistency

Pilot rule: if the same metric is visible in Team and Scrum Master views for the same team and selected period, the numeric value and health signal must be identical.

## Shared KPI source of truth

`ExecutiveTeamDesignData.kpis` is the canonical presentation source for the overlapping headline KPIs. Team view renders the first 6 entries and Scrum Master view renders the first 8, so these shared metrics must never be recalculated inside a view component:

- Stories Done
- Throughput
- Avg Cycle Time
- SLE P85
- Aging WIP
- Bug Ratio

Only wording/layout may differ between views; value, unit, trend and health tone must come from the same metric object.

## Time in Status / flow source of truth

The selected-period Time in Status rows and `selectedTeamHealth` are canonical. Team Flow must not create a second flow model from a latest-month bottleneck snapshot when the selected period is All time, YTD or a custom range.

For the same selected period:

- Team `Where Time Is Spent` rows must match Scrum Master `Avg Time in Status` rows.
- Queue/Active category must come from the same status classification.
- Status health colors must come from the same Time in Status tone.
- Team `Flow Efficiency` must use the same core Flow Efficiency value shown in Scrum Master Process Health, not a separately recalculated ratio under the same label.
- Team `Biggest Queue` must use the core Queue Time by Status ranking.
- Current Bottleneck displays must use the selected-period bottleneck, not historical dominant-status or flow-order values.

## Current pilot bridge

`public/team-flow-queue-consistency.js` temporarily aligns the new Team Flow presentation to the already-rendered core selected-period values for every team. It contains no team IDs or names and deliberately avoids MutationObserver/background polling.

`public/bottleneck-display-consistency.js` temporarily keeps current Bottleneck displays aligned with the selected-period bottleneck summary.

These bridges should be removed when the React data model is consolidated so both views consume the same canonical objects directly.
