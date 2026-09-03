# TASK 013 — Architect specification: unified status-set configuration

## Scope and invariants

Introduce one typed, normalized status-role configuration for the Team Workflow surface. The customer-facing roles are exactly `Lead Time`, `Cycle Time`, `Implementation Time`, and terminal `Done`. This task defines the configuration and presentation boundary; it does not change existing metric formulas, Jira/import behavior, routes, or customer/workspace data.

The duration sets are nested: `Implementation Time ⊆ Cycle Time ⊆ Lead Time`. `Done` is terminal and excluded from duration sets. Expected overlap is valid when it preserves this containment. Classification precedence is `Done > Implementation > Cycle > Lead > Unmapped`.

All status identities are normalized and deduplicated before validation or calculation. Invalid nesting, Done overlap, malformed or unsupported payloads, and mixed new/legacy conflicts fail closed. Partial configurations are represented as `needs-review`; no inferred role or zero value is permitted.

## Legacy compatibility adapter

Legacy fields remain readable and backward-compatible through one typed presentation/configuration adapter. The exact non-destructive mapping is:

- legacy `Funnel + Active + Implementing` sets → new `Lead Time`;
- legacy `Active + Implementing` sets → new `Cycle Time`;
- legacy `Implementing` set → new `Implementation Time`.

Legacy `Active`, `Cycle`, and `Implementing` names are explanation-only. They must not appear as new selectable roles or as competing primary metric labels. Mixed or conflicting legacy data is surfaced with a comparability warning and fails closed for the affected role.

The adapter must preserve normalized ordering/deduplication, expose source/state/diagnostics, and never write during render or load. Write-back is allowed only after an explicit Save/Confirm action, preserves backward-readable fields, and must be recoverable with rollback to the previous configuration on save failure.

## Calculation and data boundary

Calculations consume one normalized role configuration. Existing Monday-Friday working-day semantics, Lead/Cycle/Implementation numeric behavior, SLE P85 behavior, provenance, and Team/Scrum Master value parity remain unchanged. SLE P85 remains an expectation based on Cycle Time; no P50 or special P85 target/trendline is introduced.

Waiting Time % is a presentation contract for TASK 014: `cycle-only usable duration outside Implementation Time / usable Cycle Time duration`. Lead-only, Done, unknown, and unmapped statuses are excluded and reduce coverage. A zero denominator is unavailable, never 0%.

## UI and state contract

The existing dense Team Workflow surface contains one role editor, not separate legacy and new editors. It shows the four current roles, the nesting explanation, role-impact descriptions, and explicit valid/partial/conflict/unknown/needs-review states. Team presentation is concise; Scrum Master shows source roles, affected statuses, consequences, coverage, and migration diagnostics.

Save is explicit and confirmable. The confirmation states that future calculations are relabelled/interpreted using the mapping, source files are unchanged, and review is required. `Confirm and save` and `Keep editing` are separate actions. Success instructs the user to recalculate; failure keeps the draft and states that the previous configuration is unchanged.

Required status semantics:

- valid: `Status roles are ready to save.`
- invalid/needs review: explain the affected role and why comparability is not proven;
- legacy: explain the exact mapping above without silently migrating;
- Waiting Time unavailable/partial: state the missing usable denominator or coverage reason, never zero.

Controls and diagnostics must remain keyboard/touch accessible, have programmatic labels and error relationships, and reflow at mobile widths and 200% zoom without horizontal overflow. Do not rely on color or hover-only content; respect reduced motion.

## Acceptance and verification

Verification must cover normalized nested-role validation, precedence, Done exclusion, exact legacy mapping, partial/conflict/unknown/needs-review states, explicit save/rollback boundaries, Waiting Time denominator/coverage semantics, visible label consistency, accessibility, responsive reflow, and unchanged metric calculations/data boundaries. Implementation remains gated by the approved Developer handoff; this specification alone authorizes no customer/workspace writes.
