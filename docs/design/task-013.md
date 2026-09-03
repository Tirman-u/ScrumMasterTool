# TASK 013 — Designer handoff: unified status-set configuration

## 1. User decision

Simplify Team Workflow setup to one user-facing role model. Selectable roles are exactly `Lead Time`, `Cycle Time`, `Implementation Time`, and `Done` where terminal classification is needed. Legacy `Active`, `Cycle`, and `Implementing` appear only in a concise compatibility/migration explanation when an existing configuration contains them; they are not new selectable roles.

The role sets visualize `Implementation Time ⊆ Cycle Time ⊆ Lead Time`; `Done` is terminal and excluded from all duration sets. Saving is explicit and confirmable. No legacy mapping is silently overwritten or destructively migrated.

## 2. Information hierarchy

1. Current status-role model and nested-set relationship.
2. Status assignment controls and current assignments.
3. Validation state: valid, mixed legacy, overlap, conflict, unknown, or needs review.
4. Metric impact: what Lead/Cycle/Implementation and Done include/exclude.
5. Waiting Time % boundary and data availability.
6. Save/Confirm consequence and recovery.

Team sees a concise map and one actionable warning. Scrum Master sees legacy source labels, affected status names, overlap/conflict detail, and migration diagnostics. Values/formulas remain identical across modes.

## 3. Screen/flow specification

### Setup layout

Keep the existing dense `Team workflow setup` configuration surface. Replace the current user-facing status-role choices with four role sections/chips: `Lead Time`, `Cycle Time`, `Implementation Time`, and `Done`. A status may be selected for a role only through the approved nesting relationship; do not show `Backlog`, `Active`, or `Implementing` as new role choices.

At the top of the setup, show a compact explainer:

`Implementation Time is inside Cycle Time. Cycle Time is inside Lead Time. Done is terminal and excluded from duration metrics.`

Render a nested set visualization: `Lead Time` contains `Cycle Time`, which contains `Implementation Time`; `Done` sits beside the nested duration sets as terminal/excluded. Use containment lines/indentation and labels, not color alone.

### Assignment and validation

Each detected status has one clearly labelled assignment control. Show selected role, not legacy terminology, in the primary control. A status assigned outside the nesting rules produces an inline error and an error summary at the top; do not allow a misleading valid-looking preview.

Required state copy:

- Valid: `Status roles are ready to save.`
- Mixed legacy: `Legacy status roles detected. Review the mapping before saving.`
- Overlap: `A status is assigned to incompatible roles. Review [status].`
- Invalid nesting: `Implementation Time must be contained within Cycle Time, and Cycle Time within Lead Time.`
- Unknown: `Some statuses have no recognized role. Assign a role or leave them outside the flow.`
- Needs review: `Review required · existing metric labels may not be comparable until this mapping is confirmed.`

Scrum Master may expand a diagnostic panel with legacy role name → current role mapping and affected metric consequence. Team sees `Legacy mapping detected · Review in Workflow setup.` without raw config detail.

### Legacy compatibility explanation

When encountered, show one non-editable note:

`Compatibility note: this workspace uses legacy status roles. Funnel + Active + Implementing map to Lead Time; Active + Implementing map to Cycle Time; Implementing maps to Implementation Time. Review and confirm the current roles before saving.`

Do not claim exact equivalence when the legacy configuration is mixed/conflicting. Use `Mapping is partial; comparability is not confirmed.` Keep legacy labels out of the primary card/metric vocabulary.

### Save/Confirm flow

`Save role mapping` is enabled only when the draft is valid and changes exist. Clicking it opens an inline confirm region or dialog:

`Confirm status-role mapping? This updates how future calculations are labelled and may change metric interpretation. Existing source files are unchanged. Review before saving.`

Actions: `Confirm and save` and `Keep editing`. Never auto-save, auto-confirm, delete legacy fields, or silently rewrite a workspace. On success: `Status-role mapping saved. Recalculate to apply it to metrics.` On error: `Could not save status-role mapping. Previous configuration is unchanged.` Keep draft edits for retry when safe.

### Waiting Time % boundary

Place a concise explanatory note near flow roles, not inside the nested set:

`Waiting Time % describes cycle-only waiting outside Implementation Time, using usable Cycle Time observations. It is not an additional status role and is not added to Lead, Cycle, or Implementation Time.`

States: `Unavailable · no usable Cycle Time observations.`; `Partial coverage · some Cycle Time observations cannot classify waiting.`; `Needs review · status mapping prevents a trustworthy waiting-time calculation.` Never display unavailable as 0%.

### TASK 013 boundary

This screen is the unified status-role destination. Legacy adapter messaging can be removed once migrated, but the user-facing roles and nested visualization remain stable. No separate legacy editor or duplicate current/legacy form is introduced.

## 4. Component/state matrix

| Component | Valid | Mixed/conflict/unknown | Saving/error |
|---|---|---|---|
| Role selector | Four current roles only | Legacy labels in read-only note; affected role flagged | Disabled while save runs |
| Nested visualization | Implementation ⊆ Cycle ⊆ Lead; Done terminal | Broken edge/overlap visibly annotated | Preserve draft/current map |
| Error summary | Hidden | `Review required` with linked status controls | Remains until fixed or dismissed by valid correction |
| Legacy note | Hidden | Compatibility mapping and comparability caveat | Not silently removed on save |
| Save action | `Save role mapping` | Disabled until valid; explain why | `Confirm and save`, then success/error copy |
| Waiting Time % | Value and coverage if usable | Partial/unavailable reason | No zero substitution |
| Team view | Compact map/warning | One-line migration guidance | Concise success/error |
| Scrum Master view | Full mapping detail | Status-level diagnostics and impact | Full recovery detail |

## 5. Visual system

Reuse existing Team Workflow/configuration cards, chip editors, segmented controls, validation banners, buttons, typography, spacing, and semantic state tokens. The nested set is a lightweight diagram inside the existing panel, not a new page or hero.

Use indentation, containment connectors, role labels, icons, and text in addition to color. `Done` uses a terminal/check treatment; nested roles use aligned containers; conflict/unknown/needs-review use warning/error icons and explicit text. Keep desktop dense and mobile stacked; avoid wide role matrices that force horizontal scrolling.

## 6. Figma handoff

Use the existing Team Workflow setup and Task 010 metric insight design source of truth. No Figma mutation is required for this documentation-only task.

Represent variants for valid nested mapping, legacy adapter, mixed legacy, overlap, invalid nesting, unknown role, needs review, Waiting Time unavailable/partial, confirm-save, saving, save success, save error, Team concise, Scrum Master diagnostic, desktop, mobile, and 200% reflow. Mark legacy selectors as prohibited primary controls and TASK 013 as the replacement boundary for old role editors.

## 7. Accessibility

- Group assignments in labelled fieldsets: `Lead Time`, `Cycle Time`, `Implementation Time`, and `Done`; provide descriptions of inclusion/exclusion and nesting.
- The nested visualization has a text equivalent: `Implementation Time is contained by Cycle Time, which is contained by Lead Time. Done is terminal and excluded.`
- Every status assignment control has a programmatic label and error relationship. Provide a top error summary that links to invalid controls and is announced politely.
- Save/confirm uses labelled dialog or inline confirmation with focus moved predictably to the confirmation heading/action; `Keep editing` returns focus to the triggering save control.
- Keyboard and touch users can assign roles, inspect legacy explanations, navigate errors, confirm/cancel, and retry save. No required information is hover-only.
- At mobile widths and 200% zoom, role sections stack, labels wrap normally, and controls remain reachable with no horizontal page overflow or character-by-character wrapping.
- Use text/icons/containment structure, not color alone, for valid/conflict/unknown/needs-review states. Respect reduced motion for any map/confirmation transition.

## 8. Acceptance criteria for Developer/QA

1. User-facing selectable roles are exactly Lead Time, Cycle Time, Implementation Time, and Done where needed; legacy Active/Cycle/Implementing are compatibility text only.
2. UI clearly visualizes `Implementation Time ⊆ Cycle Time ⊆ Lead Time`; Done is terminal and excluded from duration metrics.
3. Valid, overlap, invalid nesting, mixed legacy, unknown, conflict, and needs-review states are explicit, understandable, and not color-only.
4. Team is concise/presentation-safe; Scrum Master is richer with status-level legacy mapping, consequences, coverage, and diagnostics. Values/provenance/formulas remain identical.
5. Save/Confirm is explicit, preserves draft on recoverable error, and never silently destructively migrates or rewrites legacy configuration. Success and error copy are truthful.
6. Waiting Time % is explained as cycle-only waiting outside Implementation Time/usable Cycle Time, is not a selectable role, and has truthful unavailable/partial/needs-review states without zero substitution.
7. Existing dense visual style is preserved across desktop/mobile/200% reflow; no horizontal overflow or duplicate legacy/current editor is introduced.
8. Keyboard/touch grouping, error summary links, focus relationships, confirmation focus, Escape/cancel behavior, no-hover-only content, contrast, and reduced-motion behavior pass accessibility QA.
9. QA verifies terminology, nested-set validation, legacy compatibility states, save rollback/error, Waiting Time boundary, responsive layout, and unchanged metric formulas/data/customer boundaries.
