# TASK 020 — Metric and UI clarity architecture

Status: Architect handoff; documentation only. Designer → Developer → QA follows.

## Decision

Retain the existing metric calculations and typed `MetricInsightModal` path. Make the four screenshot-confusing metrics explicit in their existing cards, modal, and tooltip copy, and simplify the Executive hierarchy to one Flow Time group followed by one Delivery Expectation group. Do not add a second metric, a second P85 line, or a new dashboard surface.

## Frozen semantics and copy contract

### Forecast P85

The label is **Forecast P85** and its meaning is: “Estimated time to finish the currently open backlog, at the existing Monte Carlo simulation’s approximately 85% confidence level.” It is a backlog-completion forecast, not Cycle Time SLE/P85 and not a promise for one item. The card and modal must show backlog count, simulation/sample context when available, value and forecast date when available, `asOf`, source and state.

The implementation currently exposes `p50Days`, `p85Days`, dates and simulation inputs. This task does not remove persisted fields or change the simulation, but the user-facing card/modal must not present P50 as a required product metric. P50 may remain an internal compatibility field only if needed by existing code. The time unit must be taken from the actual forecast helper: Developer must trace whether `p85Days` advances calendar days or Monday–Friday working days and use exactly that wording everywhere; no copy may call it “working days” until verified. A mismatch is a release blocker.

### Flow Efficiency

Use the existing active/queue inputs and present the formula plainly:

`active time ÷ (active time + queue time) × 100`

Explain that a higher percentage means more observed flow time was active rather than waiting. Keep the existing health score and supporting queue/age/freshness inputs separate; they must not be described as part of this formula. If the denominator is zero, or either required component is unavailable/conflicted, show unavailable or partial with the reason; never show zero as a substitute. Retain the existing local Time in Status boundary and its non-additive diagnostic rule.

### Open Bug Ratio

Canonical presentation label: **Open Bug Ratio**. This is a terminology clarification of the existing WIP Bug Ratio surface, not a formula change. Display the existing numerator and denominator together: `open bug items / open WIP items`, with percent when available. The current source shape is `wipBugCount / wipTotal × 100`; preserve configured bug issue-type mapping and unknown handling. “Open” means currently open/in-flight in the existing WIP population, not completed bug output. Missing denominator, zero WIP, or conflicted classification is unavailable/partial, never zero.

Persisted legacy labels remain readable through the compatibility adapter, but new user-facing labels, accessible names, exports and modal headings use Open Bug Ratio. Done Bug Ratio remains a separate completed-output metric.

### SLE Compliance

The card/modal must say: “Share of currently open work that is within the team’s existing SLE P85 delivery expectation.” It is an open-work health signal, **not** completed-work compliance. Show the existing threshold, `within SLE count / eligible open-WIP count`, percentage, and the existing over-threshold count. The current source exposes `atRiskCount`, `totalWip`, `atRiskPct`, and derives compliance as `100 - atRiskPct`; the UI may derive only this display complement, not a new metric. If the threshold or eligible population is unavailable, show unavailable; excluded/unknown items reduce coverage and must be disclosed.

## Presentation hierarchy

Executive Overview keeps one compact Flow Time group in canonical order: Lead Time, Cycle Time, Implementation Time, Waiting Time % when available. Delivery Expectation contains one SLE P85/Delivery Expectation surface and its insight affordance. Forecast P85 belongs in supporting planning/process health and must be visually distinct from SLE. Open Bug Ratio belongs in work health; Flow Efficiency in process health. Remove duplicate labels/surfaces that imply Active Time, combined SLE/P85, or a second Flow Time calculation. Existing diagnostic charts remain only where their current view contract requires them; this task does not revive the obsolete inline trend panels.

Team view: short definition, value, unit, numerator/denominator where relevant, and one actionable interpretation. Scrum Master view: the same definition plus threshold, sample/usable counts, coverage, exclusions, source, as-of/captured-at, formula inputs and data-quality reason.

All cards use the shared `MetricInsightModal`; no metric-specific modal or duplicate calculation is introduced.

## Data, provenance and states

Use existing snapshot fields and `metricTrust`/historical contracts. Every insight exposes value, unit, direction, comparison where available, sample/usable count, `asOf` (data observation period), `capturedAt` (local calculation/import capture), source, and state: complete, partial, stale, unavailable, error, or conflict. Last-known values may remain visible only with a prominent stale label and current reason. No guessed values, empty generic “existing metric” copy, or silent fallback is allowed.

Forecast unit verification is an explicit implementation gate. All other time metrics retain established Monday–Friday semantics; this task does not extend that rule to Forecast until source code proves it.

## Responsive and accessibility contract

Metric cards remain keyboard operable with a real button/name and visible focus. Info affordances have an accessible name containing the canonical metric label. Modal content uses a single readable column on narrow screens, a minimum readable line length on desktop, responsive wrapping for formula and numerator/denominator, focus trap, Escape and explicit close, and announcement of value/state without duplicating long prose. Do not rely on color for improved/worsened or state. Tooltips are supplemental; the modal is the authoritative explanation.

## Exact implementation boundary

Likely touch points, to be confirmed by Developer without broad refactor:

- `apps/sm-tool/src/lib/metric-insights.ts`: canonical labels, metric-specific meaning/calculation/unit/state copy and legacy label resolution.
- `apps/sm-tool/src/App.tsx`: Executive/team card labels, Forecast P85 subcopy, Open Bug Ratio numerator/denominator, SLE count wording, and removal of visible P50 copy from the required surface.
- `apps/sm-tool/src/components/ExecutiveViews.tsx`: hierarchy/duplicate-surface cleanup while preserving existing data contracts.
- Existing `metric-trust`, flow/health helpers and typed contracts: read-only integration; do not redesign formulas.
- Relevant CSS/component styles for wrapping and modal/card responsive behavior.
- `docs/architecture/task-020.md` and `docs/tasks/task-020.md` only for this Architect slice.

## Tests and acceptance criteria

1. Static/source tests prove Forecast P85 is described as open-backlog completion confidence and is distinct from Cycle Time SLE; required user-facing Forecast surfaces contain no P50 requirement.
2. A focused metric-contract test verifies Flow Efficiency copy and formula exactly, including zero denominator and partial/unavailable states.
3. Open Bug Ratio renders the canonical label and exact `wipBugCount / wipTotal` context; legacy WIP Bug Ratio remains readable through compatibility only.
4. SLE Compliance renders within/over counts and threshold and explicitly says open work; a test proves it is not described as completed-work compliance.
5. Snapshot tests verify no duplicate Flow Time/Delivery Expectation cards and canonical ordering.
6. Modal tests cover keyboard opening, focus, Escape/close, narrow viewport wrapping, screen-reader names, stale/error/unavailable copy, and no color-only status.
7. A source-level unit test or fixture verifies the Forecast P85 day unit against its helper’s actual calendar/working-day behavior. If not provable, the feature is blocked rather than guessed.
8. `npm run check` and `git diff --check` pass; no Teams/**, teams/**, workspace.json, CSV/cache/customer files, tokens, network/Jira calls, or deploy changes are present.

## Risks and non-goals

Risks are semantic drift from legacy labels, accidentally treating SLE as completed compliance, mislabeling forecast days, and duplicate Executive surfaces. QA must inspect rendered behavior and source contracts independently. Non-goals: changing formulas, status configuration, historical aggregation, P50/P85 trendline work, Jira integration, network/token/admin behavior, authorization, filesystem recovery, or customer data.
