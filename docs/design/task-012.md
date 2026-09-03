# TASK 012 — Designer handoff: flow-time terminology migration

## 1. User decision

Adopt one consistent customer-facing vocabulary while preserving the approved metric formulas:

- `Lead Time` = existing Funnel + Active + Implementing semantics;
- `Cycle Time` = old Active semantics (Active + Implementing);
- `Implementation Time` = old Cycle semantics (Implementing only);
- `SLE P85` remains unchanged; no P50 and no special P85 target/trendline.

The migration is presentation/contract terminology only. Do not silently relabel a value with a different formula. Team is concise and presentation-safe; Scrum Master is diagnostic. TASK 013 will provide unified status configuration; this task must make the future mapping direction clear without implementing that redesign.

## 2. Information hierarchy

Every visible surface follows this order: metric name; value/unit; short semantic definition; source/calculation basis; sample/as-of/freshness when present; and configuration state/reason if partial, conflicting, unknown, or unavailable.

Use `Implementation Time` for the implementing-only measure everywhere new terminology is shown. Retain `Active Time` only where it is an intentional diagnostic/configuration concept or historical compatibility label, and pair it with an explicit definition: `Active Time = Active + Implementing; this is the legacy name for the metric now shown as Cycle Time.`

Never imply that Time in Status rows add up to Lead/Active/Cycle/Implementation. Facts, calculations, interpretations, and recommendations remain separate.

## 3. Screen/flow specification

### Visible metric cards and summaries

Flow cards, Executive Summary cards, summary KPIs, selected-team tables, chart titles, legends, and detail rows use the new names and definitions. The three-card order is `Lead Time`, `Cycle Time`, `Implementation Time`. Values and existing working-day formatters remain unchanged apart from the label/semantic mapping.

Required concise helper copy:

- `Lead Time · Funnel + Active + Implementing to Done`
- `Cycle Time · Active + Implementing to Done`
- `Implementation Time · Implementing to Done`
- `SLE P85 · 85% of eligible completed items finished within this Cycle Time`

If a surface must expose the migration during transition, use a quiet info note, not a competing card: `Terminology updated: Cycle Time now uses the former Active Time definition. Implementation Time uses the former Cycle Time definition.`

### Metric insight popup

Reuse the TASK 010 metric insight modal. Current and previous values, units, source, as-of/capturedAt, sample/usable, and calculation are identical between Team and Scrum Master. The popup must be metric-specific:

| Metric | Meaning/calculation copy | Unit/direction |
|---|---|---|
| Lead Time | `Working days from Funnel entry through Active and Implementing to Done.` | Working days; lower is better |
| Cycle Time | `Working days from the configured active flow through Active and Implementing to Done.` | Working days; lower is better |
| Implementation Time | `Working days in Implementing statuses before Done.` | Working days; lower is better |
| SLE P85 | `The existing P85 of eligible completed Cycle Time observations.` | Working days; expectation, not target/trendline |

For migrated legacy snapshots, show a compact diagnostic note: `This value uses the legacy configuration adapter: [legacy label] → [current label]. Formula and source are unchanged.` If the adapter cannot prove equivalence, show `Legacy mapping is incomplete; this value is not comparable to the current terminology.` Do not conceal the ambiguity.

### Team Workflow setup

Until TASK 013’s unified status configuration exists, preserve the current controls but update their explanatory hierarchy:

1. Section intro: `Map statuses once. Lead Time includes Funnel, Active, and Implementing; Cycle Time includes Active and Implementing; Implementation Time includes Implementing.`
2. Group labels: `Funnel`, `Active`, `Implementing`, `Done`, with helper descriptions showing which current metrics consume each group.
3. Add a read-only `Current metric mapping` summary beside the controls; do not add a second set of editable fields.
4. Legacy adapter note: `Existing teams may load legacy Active/Cycle labels. We preserve their configured status sets while showing the current terminology above.`
5. Unknown/overlap/conflict callouts appear next to the affected group and explain the impact before save.

TASK 013 should replace these legacy group controls with one unified status-role model. Design the current note so it can be removed without changing card or popup terminology; do not preview unapproved TASK 013 controls here.

### Status role buttons, legends, exports, docs

Use role labels `Funnel`, `Active`, `Implementing`, and `Done` consistently in status chips, legends, configuration buttons, chart annotations, table headers, CSV/PDF export headers, and user-facing docs. Where a legacy export must retain an old column for compatibility, label it `Legacy Active Time (now Cycle Time)` and include a migration note; never silently produce two columns with indistinguishable meanings.

## 4. Component/state matrix

| State | UI treatment/copy |
|---|---|
| Current unified mapping | New terminology, exact definitions, normal value/unit/source |
| Legacy adapter active | `Legacy configuration mapped to current terminology. Formula and source are unchanged.` |
| Partial mapping | `Partial status mapping · [metric] may be incomplete.` Show affected metric as `-`/unavailable, never zero |
| Conflicting roles | `Status mapping conflict · review [status/group] before treating this metric as comparable.` Do not present a confident interpretation |
| Unknown role | `Unknown status role · cannot verify the metric definition.` Preserve last-known value only with an explicit caveat |
| Missing source/data | `Unavailable · no valid [metric] value for this period.` Keep as `-`, never 0 |
| Stale snapshot | `Showing last-known [metric] · source is newer than this calculation.` Keep as-of and capturedAt distinct |
| SLE P85 | Existing P85 behavior, explicit Cycle Time basis; no P50/target/trendline |
| Time in Status | `Diagnostic only · not additive to Lead Time, Cycle Time, or Implementation Time.` |
| Team | Short definitions and one migration note where needed |
| Scrum Master | Full legacy mapping, role overlap, source, sample/usable, conflict and comparability diagnostics |

## 5. Visual system

Reuse existing dense executive cards, metric insight modal, configuration cards, status chips, legends, table/export typography, spacing, borders, and semantic state tokens. New terminology should look like a label correction, not a new visual theme.

Use text and icons in addition to color for partial/conflict/unknown/stale states. Keep legacy notes muted but readable; warnings must not be visually hidden. Do not add a new metric card, a P85 target line, a P50 control, or a tall explanatory hero.

## 6. Figma handoff

Use the existing Executive Scrum Master Dashboard and Task 010 insight component as source of truth. No Figma mutation is required for this documentation-only task.

Represent variants for the renamed flow cards, metric insight popup, legacy adapter note, partial mapping, conflict, unknown role, stale data, Team concise, Scrum Master diagnostic, Team Workflow current mapping, legends, and export/documentation labels. Include desktop, mobile, and 200% reflow annotations. Mark TASK 013 unified status-role controls as a future replacement boundary, not a component to implement here.

## 7. Accessibility

- Metric labels and helper text are programmatically associated with values, units, and definitions; do not rely on color or abbreviations alone.
- Reuse TASK 010 card-button and modal semantics: visible focus, Enter/Space activation, labelled dialog, focus trap, Escape/outside close, and focus restoration.
- Preserve reading order: current label/value, definition/calculation, provenance, then warning/conflict/legacy detail.
- Status role buttons and legends have explicit accessible names and descriptions of metric impact. Overlap/conflict messages are announced politely and remain visible.
- Popup and configuration content reflows at 200% zoom and mobile widths without clipping, horizontal page overflow, or character-by-character wrapping.
- Exports and accessible summaries use the same terminology as the visual UI; legacy compatibility labels include their current equivalent.
- Reduced-motion users receive no required animated migration cue; any transition respects `prefers-reduced-motion`.

## 8. Acceptance criteria for Developer/QA

1. Lead/Cycle/Implementation labels and definitions are consistent across cards, summaries, popups, charts/legends, Team Workflow, exports, docs, and accessible names.
2. Values preserve approved semantics: Lead = Funnel + Active + Implementing; Cycle = Active + Implementing; Implementation = Implementing. No metric formula or SLE P85 behavior changes.
3. Active Time is not presented as a competing customer-facing flow card; when shown for compatibility/diagnostics it explicitly identifies the legacy/current relationship.
4. Task 010 insight popup is reused, with identical Team/Scrum Master values and provenance and mode-appropriate detail. It includes meaning, local source, calculation, unit, direction, current/previous, as-of/capturedAt, sample/usable, and state reasons.
5. Legacy adapter state is explained without confusing users; partial, conflict, unknown, missing, stale, and unsupported states are explicit and never substituted with zero or a confident interpretation.
6. Team Workflow preserves current controls and shows one read-only current mapping summary plus the TASK 013 migration boundary; no duplicate editable status configuration is introduced.
7. Status role buttons, legends, exports, and docs use Funnel/Active/Implementing/Done consistently. Compatibility output is explicitly labelled legacy and current-equivalent.
8. SLE P85 remains an expectation based on Cycle Time, with no P50 and no special target/trendline. Time in Status remains diagnostic and non-additive.
9. Desktop, mobile, keyboard, touch, focus relationships, Escape/outside close, 200% zoom, contrast, and reduced-motion behavior pass accessibility review.
10. QA verifies terminology/value parity, legacy mapping and conflict states, export/accessibility copy, selected period/source provenance, unchanged calculations, and no customer/workspace data changes.
