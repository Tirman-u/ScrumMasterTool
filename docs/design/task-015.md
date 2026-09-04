# TASK 015 — Designer handoff: maintenance lifecycle configuration and metric

## 1. User decision

Add one optional Team configuration field, `Maintenance lifecycle Jira key`, accepting a syntactically valid Jira issue key or EPIC key. The app validates syntax locally only; it does not look up Jira, verify existence, or fetch parent data. Saving is explicit and confirmable.

Add one `Maintenance %` Executive flow card using the existing Task 010/011 `MetricInsightModal`. Do not add a standalone history or duplicate Visual Analytics panel. Preserve Task 012/013 user-facing names/status roles and Task 014 modal/state conventions.

Classification is fixed: `Task`/`Spike` = `Lifecycle`; `Bug`/`Production Bug` = `Maintenance`; all other types = `Unknown`.

## 2. Information hierarchy

Configuration: field label and syntax hint; local validation; limitation; current saved value; explicit Save/Confirm consequence; configured-not-found/missing-parent/conflict status.

Metric card: `Maintenance %`, percentage value, concise meaning, coverage/state, and insight affordance.

Popup: current value; denominator and numerator; previous comparable change/direction; formula; classification rules; provenance (`asOf`, `capturedAt`, `source`); sample/usable/coverage; then state reason and Scrum Master diagnostics.

The denominator is: `completed direct-child recognized work = Maintenance + Lifecycle`. Unknown, non-direct-child, missing-parent, invalid, and unusable records are excluded and reduce coverage. A zero denominator is `Unavailable`, never `0%`.

## 3. Screen/flow specification

### Configuration field

Place the field in the existing Team Workflow/Team configuration surface near the flow and classification settings. Label: `Maintenance lifecycle Jira key (optional)`. Helper: `Enter a Jira key or EPIC key, for example ABC-123.`

Limitation copy, always visible near the field: `Validated locally only. The app does not look up Jira or verify that this key exists or has children.`

Local validation copy:

- Empty: valid optional state, `No maintenance lifecycle key configured.`
- Valid syntax: `Key format looks valid. Jira existence is not verified.`
- Invalid syntax: `Enter a valid Jira key, such as ABC-123.`
- Configured not found: `Configured key could not be verified locally. Jira lookup is not available.`
- Missing parent: `Some direct-child records have no usable parent relationship; they are excluded and reduce coverage.`
- Conflict: `Conflicting maintenance/lifecycle classification detected; review the mapping before saving.`

Use `Save configuration` then an explicit confirmation: `Confirm maintenance lifecycle key? This saves the key for local classification. No Jira lookup or network request will run.` Actions: `Confirm and save` / `Keep editing`. On success: `Maintenance lifecycle configuration saved.` On error: `Could not save maintenance lifecycle configuration. Previous configuration is unchanged.`

Do not silently normalize, clear, or replace an existing key. A changed key is shown as a draft until confirmation.

### Maintenance % card

Place `Maintenance %` in the existing Executive flow metric-card group alongside the current flow/quality cards. Use the same size, spacing, disclosure affordance, and selected team/period context. Card helper: `Recognized completed work classified as Maintenance`.

Current card value is `Maintenance numerator ÷ recognized completed direct-child denominator × 100`, formatted as a percentage. If unavailable, show `-` and a reason, never `0%`.

### MetricInsightModal content

Reuse the existing modal, not a second help system. Title: `Maintenance % insight`; context: `[Team] · [selected period]`.

Normative content:

- `Meaning`: `Share of completed direct-child recognized work classified as Maintenance.`
- `How calculated`: `Maintenance completed direct-child recognized work ÷ (Maintenance + Lifecycle completed direct-child recognized work) × 100.`
- `Classification`: `Task` and `Spike` are Lifecycle. `Bug` and `Production Bug` are Maintenance. All other types are Unknown.
- `Scope`: `Only completed direct-child recognized work is in the denominator. Unknown, non-direct-child, missing-parent, invalid, and unusable records are excluded and reduce coverage.`
- `Direction`: `Lower Maintenance % is generally better only when delivery scope and quality remain healthy; interpret with context.`
- `Data details`: `Sample`, `Usable`, `Coverage`, `As of`, `Captured`, `Source`.

Show current and previous comparable period. Direction is lower-is-better only when both adjacent comparable values are valid; gaps block inference. Same-period snapshots are deduplicated. No new historical chart is required for this card; if the shared modal’s optional history is shown, it follows Task 010/011 adjacency rules.

## 4. Component/state matrix

| State | Configuration | Card/modal |
|---|---|---|
| Not configured | `No maintenance lifecycle key configured.` | `Unavailable · configure a lifecycle key and provide usable direct-child data.` |
| Valid syntax | `Key format looks valid. Jira existence is not verified.` | Compute only from local recognized records; show source/coverage |
| Configured not found | `Configured key could not be verified locally. Jira lookup is not available.` | Keep `-`/last-known with explicit reason; never imply Jira absence |
| Missing parent | Child relationship unusable | Exclude records, reduce coverage, show partial/unavailable reason |
| Unknown types | Classification not recognized | Exclude from denominator, show unknown count/coverage in Scrum Master |
| Conflict | Incompatible parent/type/config signals | Do not present as authoritative; require review |
| Complete | Valid local classification and denominator > 0 | Current/previous/change, formula, provenance |
| Partial | Some records excluded or unusable | Value with `[usable] of [sample] recognized records`; partial label |
| Zero denominator | No usable Maintenance + Lifecycle duration/count | `Unavailable · no completed direct-child recognized work.` |
| Stale | Source newer than calculation | `Showing last-known Maintenance % · source is newer than this calculation.` |
| Loading/retrying | Preserve card/last-known value | `Loading/Retrying Maintenance % insight…` |
| Error | Preserve current/last-known value | `Could not load Maintenance % insight. Current metrics are unchanged.` + `Try again` |
| Team | Compact meaning, value, coverage/state | Presentation-safe popup |
| Scrum Master | Same value/provenance | Full classification counts, exclusions, conflict/source diagnostics |

## 5. Visual system

Reuse Task 012/013 configuration cards, Task 010/011 metric cards and modal, existing percentage formatter, borders, spacing, typography, buttons, status icons, and semantic tokens. Keep the new field and card visually native to the dense operational UI.

Use labels/icons/text for configured, unknown, partial, conflict, stale, and unavailable states; color is reinforcement only. Do not use a success style for syntactically valid input as if Jira existence were confirmed. Keep modal desktop two-column and mobile one-column reflow; no new Visual Analytics block.

## 6. Figma handoff

Use the existing Team Workflow configuration and Task 010/011 MetricInsightModal as source of truth. No Figma mutation is required for this docs-only task.

Represent variants for optional field empty/valid/invalid, configured-not-found, missing-parent, conflict, confirmation, save success/error, Maintenance % complete/partial/unavailable/stale/loading/retrying/error, Team concise, Scrum Master diagnostic, desktop, mobile, and 200% zoom. Annotate the no-Jira-lookup limitation and exact denominator/classification copy.

## 7. Accessibility

- Associate the field label, syntax hint, local-only limitation, validation error, and saved-state message programmatically.
- Save/Confirm uses labelled confirmation semantics; keyboard users can confirm, keep editing, retry, and return focus predictably. No silent save.
- The card is a real disclosure/button with an explicit `Open Maintenance percent insight` name; Enter/Space and touch activate it.
- Reuse modal labelled dialog, visible focus, focus trap, Escape/outside close, and focus restoration to the opening card.
- Popup formula, classification, denominator, coverage, provenance, and state reason are available without hover. Provide semantic text/table detail where the shared modal supports it.
- Announce meaningful validation/save/loading/error transitions politely; do not rely on color or tooltip.
- Desktop/mobile and 200% zoom reflow without clipping, vertical character wrapping, or page-level horizontal overflow. Respect reduced motion.

## 8. Acceptance criteria for Developer/QA

1. Optional `maintenanceLifecycleJiraKey` is editable in existing Team configuration with local syntactic validation only; no Jira lookup/network verification is implied.
2. Save/Confirm is explicit, preserves the previous value on error, and never silently clears, overwrites, or destructively migrates a key.
3. User-facing classification is exactly Task/Spike → Lifecycle, Bug/Production Bug → Maintenance, all other types → Unknown.
4. Exactly one Maintenance % Executive card exists and reuses Task 010/011 MetricInsightModal; no standalone history or duplicate Visual Analytics panel is added.
5. Denominator is completed direct-child recognized work (Maintenance + Lifecycle); unknown/unmapped, non-direct-child, Done where not recognized, invalid, and missing-parent records are excluded and reduce coverage. Zero denominator is unavailable, never 0%.
6. Card/modal show metric-specific meaning, local source/collection, existing calculation, %, current/previous comparable change, contextual lower-is-better interpretation, sample/usable/coverage, asOf, capturedAt, source, and truthful state reason.
7. Configured-not-found, missing-parent, conflict, unknown, partial, stale, loading/retrying, error, and unavailable states are distinct and do not claim Jira existence or freshness.
8. Team is concise; Scrum Master is richer with counts/exclusions/conflict diagnostics. Values and provenance are identical between modes.
9. Existing Task 012/013 terminology and status configuration remain intact; TASK 013’s unified roles are not duplicated or replaced. Desktop/mobile/200%/keyboard/touch/focus/reduced-motion behavior passes QA.
10. QA verifies formula/denominator/classification, explicit save/recovery, no-Jira limitation, coverage/zero rule, modal accessibility, selected context, unchanged local data boundaries, and no application/data/deploy changes outside approved scope.
