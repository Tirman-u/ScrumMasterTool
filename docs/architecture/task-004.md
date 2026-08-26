# TASK 004 — Metric Trust & Coverage

## Decision

Add an accessible information affordance to Lead Time, Active Time, Cycle Time, and SLE P85. Preserve existing formulas and working-day semantics. P85 is the only percentile exposed by this task; do not add or display P50, P70, or P95.

## Scope

- Add one info button/popover per flow metric in the current Team and Scrum Master presentation.
- Explain source, calculation, meaning, Monday-Friday working-day basis, and unavailable/partial behavior.
- Surface descriptive trust metadata: P85 where relevant, eligible/usable count, coverage, source, fallback, selected period, and data-quality state.
- Keep Team view concise and customer-safe; keep Scrum Master view diagnostic.
- Missing data stays unavailable; fallback-derived Cycle Time is visibly partial.

## Metric semantics

- Lead Time: Funnel + Active + Implementing durations to Done.
- Active Time: Active + Implementing durations to Done.
- Cycle Time: Implementing durations to Done, with the existing elapsed working-day fallback where already permitted.
- SLE P85: existing P85 of eligible completed Cycle Time observations; an expectation, not a guarantee.

All values retain the existing Monday-Friday working-day basis and selected-period filtering. Time in Status rows remain diagnostic, not additive replacements for these metrics.

## Trust contract

Expose only the minimal UI metadata needed for `complete`, `partial`, and `unavailable` state, source, fallback, period, working-day basis, eligible/usable counts, coverage, P85, and explicit data-quality messages. Do not fabricate denominators or turn missing values into zero. Do not surface internal P50/P70/P95 fields.

## UI and accessibility

Team popovers show a concise definition, calculation summary, working-day basis, selected period, usable count, and state/reason. Scrum Master popovers additionally show source, fallback, eligible count, coverage, P85, and data-quality detail. Use real buttons with accessible names, `aria-expanded`, `aria-controls`, visible focus, Escape/outside dismissal, focus return, unique IDs, and narrow-screen inline/full-width behavior without horizontal scrolling.

## Acceptance and verification

Test semantics/copy, P85-only output, complete/partial/unavailable/fallback states, period consistency, Team vs Scrum Master content, keyboard interaction, unique IDs, responsive behavior, unchanged formulas, and customer-data safety. Run `npm run check`; QA must record the final verdict before the next task.

No Jira exports, tokens, workspace files, or customer data may be created or committed.
