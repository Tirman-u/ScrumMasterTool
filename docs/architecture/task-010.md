# TASK 010 — Architect contract: historical metric trends

## Approved scope

Add one compact, presentation-safe Historical trends card to the current Executive/Team Overview. It consumes existing persisted historical snapshots only; it does not add routes, formulas, network calls, Jira flow, or new data sources. Team and Scrum Master share the selected team and the App-owned period snapshot. The selected period is the sole historical-window endpoint and filter.

## Data and truth rules

- Candidate metrics are Lead Time, Cycle Time, Implementation Time only after its semantic migration, SLE P85, and waiting-time percentage when the existing snapshot contract provides them. P85 is the only exposed SLE percentile.
- Missing, invalid, or unavailable values remain unavailable (`-`/gap), never zero. Valid zero remains numeric zero.
- Direction is lower-is-better and compares only the selected window's immediately adjacent valid current and previous periods. Missing intervening periods prevent inference. One valid period is `Insufficient history`/N/A.
- Point provenance retains period, value/unit, as-of/capturedAt, sample, usable, and source where available. No provenance is invented.

## Presentation and interaction

Use one compact chart card. Team mode is concise; Scrum Master may add coverage and source-quality detail. Loading, retrying, error, partial, unavailable, empty, and insufficient-history states are explicit. Errors preserve last-known valid trend data and expose a safe retry when the existing local operation supports it.

Valid points are keyboard-operable with roving tabindex. ArrowLeft/Right and ArrowUp/Down move between valid points; Home/End jump to boundaries; Enter/Space pins detail; Escape unpins. Hover and focus expose the same accessible detail, and pointer exit removes unpinned detail. A semantic summary and data-table fallback provide team, selected period, axes/units, direction, gaps, and provenance without pointer input.

Preserve existing metric calculations, Monday-Friday semantics, selected team/mode/tab/period, import/cache boundaries, and customer-data safety. Do not re-enable legacy UI or modify workspace/customer files.
