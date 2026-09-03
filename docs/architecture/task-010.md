# TASK 010 — Architect contract: Executive metric-card insight modal

Replace the prior standalone inline Historical Trends block with one compact reusable insight modal/popover opened from eligible existing Executive metric cards. Preserve the selected team, shared selected period, mode, card hierarchy, formulas, and local-only data boundaries. Add no route, formula, Jira/network call, or data source.

Eligible stable cards include Stories Done, Throughput, Avg Cycle Time, SLE P85, Aging WIP, Done Bug Ratio, Velocity, Bottleneck, and other cards only where the existing metric contract is stable. Cards retain their current values, units, badges, and layout while becoming keyboard-operable disclosure controls. One modal is shared; opening another card replaces its content. Desktop uses a compact popover/modal and mobile uses a bottom-sheet/reflow layout.

The modal shows metric meaning, existing collection/calculation wording, current value, previous comparable-period value/change, explicit Improving/Worsening/Unchanged/N/A/Unavailable interpretation, unit, sample/usable, as-of, capturedAt, and source where available. Missing or unavailable remains `-`/unavailable, never zero. Direction is higher-is-better for Stories Done/Throughput/Velocity, lower-is-better for time/Aging WIP/Done Bug Ratio, and categorical for Bottleneck. SLE P85 is shown without a special target/trendline status.

Optional metric-specific history is rendered only when real adjacent comparable snapshots exist in the selected-period window. Same-period snapshots are deduplicated deterministically; gaps stay gaps and never support inferred direction; one valid point is N/A. The selected period is the sole window/filter authority and there is no modal period control. Point hover/focus/click/Enter/Space exposes and pins provenance-rich detail; text/table fallback remains available.

Loading, retrying, error, partial, insufficient, missing, and unavailable states are explicit. Errors preserve last-known/current values and expose a safe retry where the existing local operation supports it. Modal focus is trapped while open, Escape/outside click closes, and focus returns to the exact opening card. Team content is concise and presentation-safe; Scrum Master content may include richer source, coverage, calculation, and table diagnostics. Responsive layout must not clip or create page-level overflow.

Do not modify Teams/**, teams/**, workspace.json, exports, cache, tokens, or customer data. Preserve existing metric calculations and Monday-Friday working-day semantics.
