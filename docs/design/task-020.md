# TASK 020 — Designer handoff: metric clarity and hierarchy

## 1. User decision

Use clear English copy in the existing cards and shared MetricInsightModal. Keep one Flow Time group, one SLE P85 / Delivery Expectation surface, and place Forecast P85, Flow Efficiency and Open Bug Ratio in supporting health/planning metrics. Do not change formulas, contracts or data.

## 2. Information hierarchy

1. FLOW TIME: Lead Time, Cycle Time, Implementation Time, then Waiting Time % when available.
2. DELIVERY EXPECTATION: SLE P85 / Delivery Expectation; SLE Compliance is a detail of open-work health, not a second primary SLE surface.
3. Supporting/planning/process/work health: Forecast P85, Flow Efficiency, Open Bug Ratio, SLE Compliance detail, Stories Done, Throughput, Velocity, Aging WIP, Done Bug Ratio, Bottleneck and Maintenance %.
4. Scrum Master diagnostics: formula inputs, sample/usable, exclusions, source, timestamps, state and Time in Status.

Forecast P85 is backlog completion confidence, not Cycle Time SLE/P85. Open Bug Ratio is open bugs divided by open WIP, not Done Bug Ratio. SLE Compliance is open work within the existing SLE threshold, not completed-work compliance.

## 3. Screen/flow specification

Desktop keeps the TASK 019 grouped order. The SLE card reads `SLE P85 / Delivery Expectation` and includes `within / eligible` and `over threshold` context in the insight, not a duplicate card.

Forecast card copy: `Estimated time to finish the currently open backlog, at the existing Monte Carlo simulation’s approximately 85% confidence level.` Add backlog count, simulation/sample context, forecast date where available, asOf, source and state. The Figma specimen uses `12 calendar days`; Developer must verify the helper’s actual unit before shipping and must not call it working days without proof.

Flow Efficiency copy and formula: `active time ÷ (active time + queue time) × 100`. Interpretation: higher means more observed flow time was active rather than waiting. Required components unavailable, conflicting or zero-denominator produce partial/unavailable, never zero.

Open Bug Ratio copy: `3 open bugs / 25 open WIP items` and `12%`. Open means currently in-flight in the configured WIP population. Missing/zero denominator or conflict is explicit unavailable/partial.

SLE Compliance copy: `Share of currently open work that is within the team’s existing SLE P85 delivery expectation.` Show threshold, `within SLE count / eligible open-WIP count`, percentage and over-threshold count. Excluded/unknown items reduce coverage.

Team shows short definition, value/unit, numerator/denominator and one interpretation. Scrum Master uses the same value and adds sample/usable, coverage, exclusions, formula inputs, asOf, capturedAt, source and state. All cards open the shared modal; tooltips are supplemental only.

## 4. Component/state matrix

| Metric | Ready state | Truthful non-ready treatment |
|---|---|---|
| Forecast P85 | Backlog completion estimate, confidence, unit, date, backlog count | Unit/inputs unavailable, stale or error shown explicitly; never present as SLE |
| Flow Efficiency | Formula, percentage, higher-is-more-active interpretation | Partial/unavailable for zero/conflicting components; never zero substitute |
| Open Bug Ratio | `open bugs / open WIP` plus percentage | Missing WIP, zero WIP or classification conflict is partial/unavailable |
| SLE Compliance | `within / eligible open WIP`, threshold and over count | Missing threshold/population or reduced coverage is unavailable/partial |
| Shared modal | value, meaning, calculation, comparison where valid, provenance | loading, empty, stale, conflict, unavailable, error and permission states retain truth/last-known label |

No P50 is a product requirement. It may remain internal compatibility only. No P85 target/trendline is introduced.

## 5. Visual system and reusable tokens

Reuse Inter, current slate palette, white cards, restrained blue status surface, existing radii, spacing and focus treatment. Signal direction (higher/lower) and data confidence/state use separate text labels and shapes; color is never the only cue. Keep card density presentation-safe; move long formula/provenance copy into the modal.

## 6. Figma handoff

Updated editable file: [ScrumMasterTool Executive redesign](https://www.figma.com/design/QoH9hUoVftQxr73YDvmmdU).

- Desktop hierarchy: [node 2:2](https://www.figma.com/design/QoH9hUoVftQxr73YDvmmdU?node-id=2-2). Updated cards: `5:45` SLE/Delivery Expectation, `5:51` Forecast P85, `5:53` Flow Efficiency, `5:55` Open Bug Ratio, `5:58` SLE Compliance.
- Shared insight specimen: [node 2:3](https://www.figma.com/design/QoH9hUoVftQxr73YDvmmdU?node-id=2-3), updated as Forecast P85 with calendar-day unit explicitly marked as a helper-verification gate.
- Mobile supporting copy: [node 2:4](https://www.figma.com/design/QoH9hUoVftQxr73YDvmmdU?node-id=2-4).

Desktop, modal and mobile remain populated editable auto-layout frames. Final screenshots were inspected after copy changes; the modal history labels were corrected from working days to calendar days for the Forecast specimen. Values are synthetic.

## 7. Accessibility

Each card is a real labelled button including canonical label, value, unit and period. Info names include the metric label. Modal keeps focus trap, visible focus, Escape/explicit close, focus restore, narrow single-column reflow and internal scroll. Formula and numerator/denominator copy wraps at word boundaries; no horizontal overflow or single-character columns at mobile/200% zoom. Announce state/value changes without duplicating full prose. Direction, confidence and stale/partial/unavailable state are expressed in text and not color alone.

## 8. Acceptance criteria

1. Forecast P85 is visibly distinct from Cycle Time SLE/P85 and states open-backlog completion at approximately 85% simulation confidence.
2. Forecast unit exactly matches the verified helper; no unverified working-day claim ships.
3. Flow Efficiency shows the exact active/(active+queue) formula and truthful zero/partial/unavailable states.
4. Open Bug Ratio uses the canonical label and displays open-bug/open-WIP numerator-denominator; Done Bug Ratio remains separate.
5. SLE Compliance says open work, shows within/eligible and over counts plus threshold, and never implies completed-work compliance.
6. Flow Time and Delivery Expectation have no duplicate primary surfaces; TASK 019 order remains intact.
7. Team is concise, Scrum Master diagnostic; both use identical values/provenance and the shared modal.
8. Loading, empty, stale, conflict, unavailable, error and permission states remain explicit; missing is not zero.
9. Keyboard, focus, touch, screen-reader names, responsive wrapping and 200% zoom meet TASK 010–019 contracts.
10. Developer/QA verify source formulas, helper unit, render order, duplicate inventory, numeric invariance, accessibility and data safety. No app code or customer/workspace data is changed by this handoff.
