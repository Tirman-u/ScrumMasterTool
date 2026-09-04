# TASK 015 — Local lifecycle/maintenance work classification

## Status and boundary

Architecture-only handoff. This task defines a team-specific parent/EPIC key and one derived work-mix metric from already imported local CSV/cache data. It does not query Jira, add network/token/admin flows, change existing metric formulas, write customer/workspace files, or infer missing relationships. Designer is required for the configuration and metric presentation, then Developer, then independent QA.

Use TASK 012 naming, TASK 013 UnifiedFlowStatusConfig, and TASK 014 provenance/state conventions. Waiting Time % is not recalculated by this task.

## Configuration contract

Add an optional team-scoped field to the existing team configuration:

    type MaintenanceLifecycleConfig = {
      maintenanceLifecycleJiraKey?: string;
      source?: "native" | "legacy";
      migrationState?: "native" | "migrated-read" | "needs-review" | "conflict";
      warning?: string;
    };

The configured value identifies the Jira issue or, normally, EPIC whose direct child issues are in scope. Normalize input by trimming surrounding whitespace and matching Jira-key identity case-insensitively; preserve the user's display spelling for UI. An empty value means not configured, not all work and not zero maintenance.

Validation is local and syntactic only. Reject blank/whitespace, malformed key text, unsupported schema, or conflicting new/legacy values as configuration-invalid/conflict. Do not validate by calling Jira. A syntactically valid key with no matching parent in the imported CSV is configured-but-not-found and the metric is unavailable, not zero.

## Local CSV relationship boundary

The only authoritative relationship is a mapped imported field containing the direct parent/EPIC key. For each imported issue, normalize its parent/EPIC key and compare it to the configured key. Include only direct children whose normalized parent/EPIC key equals the configured key. Do not infer membership from issue summaries, issue type, labels, links, filename, team name, or status.

If the CSV has no mapped parent/EPIC field, the metric is unavailable with source-missing guidance. If the field exists but some rows lack it, those rows are out of scope when they cannot be proven children and increment a coverage/unknown diagnostic only for otherwise candidate completed work. Do not traverse arbitrary parent chains or synthesize descendants. The configured EPIC row itself is not a child and is excluded unless a future explicit contract says otherwise.

The selected period and existing completion/done semantics determine which in-scope issues are completed candidates. Use the canonical TASK 013 Done statuses and existing local period filter. Do not introduce a second definition of Done.

## Issue-type mapping

Normalize issue type by trimming, case-folding, and collapsing internal whitespace. Match exactly:

- Task -> Lifecycle
- Spike -> Lifecycle
- Bug -> Maintenance
- Production Bug -> Maintenance

Every other type, including Story, Sub-task, Epic, blank, malformed, or unknown future values, is Unknown and is never silently classified. The exact normalized issue type and parent relation are retained only as aggregate diagnostics; raw issue rows/keys are not presented to users.

Classification order is: first prove direct child relationship, then prove completed candidate under TASK 013, then normalize issue type, then assign Lifecycle/Maintenance/Unknown. An issue cannot be both categories. Unknown types are excluded from the percentage denominator and make a computed result partial.

## Metric and denominator

The primary metric is Maintenance % of classified completed work under the configured key:

    maintenancePct = maintenanceCount / (maintenanceCount + lifecycleCount) * 100

The denominator is the count of completed, direct-child, recognized Task/Spike/Bug/Production Bug issues in the selected period. It is not all team work, all imported rows, total story points, issue count including unknown types, or a duration metric. Unknown/out-of-scope rows are reported separately and excluded from the denominator. If the denominator is zero, the metric is unavailable, never 0%.

Expose Lifecycle count, Maintenance count, Unknown count, and eligible/candidate count where the existing contract supports them. Do not add an unrequested duration-weighted metric. This metric is a work-mix percentage, not a quality score and not a replacement for Done Bug Ratio.

Coverage is complete when the parent field is available and all completed direct-child candidates have recognized issue types and valid period/status data. It is partial when a result exists but candidates or issue types are unknown/missing. It is unavailable when the key is absent/invalid, parent field is missing, no matching children exist, no completed recognized child exists, or selected period/source cannot be established. It is conflict when configuration candidates disagree.

## Provenance and state

Use a typed snapshot consistent with existing metric contracts:

    type MaintenanceLifecycleSnapshot = {
      maintenanceCount?: number;
      lifecycleCount?: number;
      unknownCount?: number;
      candidateCount?: number;
      maintenancePct?: number;
      coverageState: "complete" | "partial" | "unavailable" | "conflict";
      asOf?: string;
      capturedAt?: string;
      source?: "local-import" | "local-cache" | "local-recalculation";
      reason?: string;
    };

asOf is the selected metric observation period endpoint. capturedAt is local calculation/snapshot time. source identifies local CSV/cache/recalculation only and never implies Jira access. Keep Last data update separate from Last calculated where the shell exposes both.

States include not-configured, invalid-key, source-missing-parent-field, configured-not-found, ready-complete, ready-partial-unknown-types, no-recognized-completed-work, conflict, stale-last-known, and error-with-retry. Retry is local-only. On failure, preserve last-known output with stale/configuration context; never substitute zero. A syntactically valid key with no local match is not evidence that Jira has no such issue.

## Comparison and presentation

Maintenance % is neutral by default: this task must not claim that more or less maintenance is intrinsically better. If product later approves a target or directional coaching policy, that is a separate scope. Show period-over-period change only for contiguous comparable periods with the same configured key, parent-field mapping, issue-type mapping version, and selected-period semantics. Otherwise show comparison unavailable.

If the card is enabled, place it in Executive Summary as one optional work-mix card using the TASK 010/011 shared metric registry and MetricInsightModal. Team view shows percentage/counts, concise meaning, asOf/source/coverage, and no raw issue detail. Scrum Master view may show candidate, classified, unknown counts, configured key presence (masked or safely displayed according to existing privacy policy), parent-field availability, exact mapping diagnostics, migration state, and excluded reasons. Do not expose raw customer issue keys or CSV content.

Do not add a standalone Visual Analytics panel. Any diagnostic view must reuse the same snapshot and be explicitly labelled as work-mix diagnostics, not a second metric owner.

## Configuration UI and migration safety

Team Workflow configuration presents a team-scoped optional field with plain guidance: use the parent/EPIC key already present in imported CSV data. It clearly states that no Jira lookup occurs and that missing parent data makes the metric unavailable. Team view is concise; Scrum Master view exposes validation and coverage detail.

Legacy config reads only through a non-destructive adapter. If an equivalent legacy field exists, map it to maintenanceLifecycleJiraKey; if no exact legacy source is known, retain it as unsupported/needs-review rather than guessing. New and legacy values that differ after normalization produce conflict and fail closed. Render and recalculate never rewrite persisted config. Explicit Save/Confirm is required for migration write-back; preserve backward-readable fields and the previous valid configuration if saving fails.

## Accessibility and responsive requirements

The field, info control, card, and popup are real labelled controls with visible focus, keyboard operation, screen-reader names, and no hover-only content. Explain unavailable, partial, conflict, and stale states in text, not color alone. Popup content follows TASK 010/011 focus, Escape, outside-dismiss, focus restoration, and modal rules. Long mapping/coverage text wraps without narrow columns; mobile stacks configuration and diagnostics, supports touch, keyboard-only use, 200% zoom, reduced motion, and reflow.

## Exact implementation surfaces

- apps/sm-tool/src/types/contracts.ts: team config and MaintenanceLifecycleSnapshot/state types.
- apps/sm-tool/src/lib/workspace.ts: non-destructive config adapter and local provenance/error handling.
- apps/sm-tool/src/lib/metrics.ts and existing CSV/status normalization: direct-parent filtering, done-period selection, exact issue-type mapping, and aggregate metric.
- apps/sm-tool/src/App.tsx: selected-team/period wiring and one shared snapshot.
- apps/sm-tool/src/components/ExecutiveViews.tsx, TeamDetail.tsx, and Workflow/config components: card, popup, setup, Team/Scrum Master states.
- apps/sm-tool/src/styles.css: field, card, popup, diagnostics, focus, and responsive states.
- Established synthetic tests only; no real exports, issue keys, team names, workspace files, or credentials.

## Risks and non-goals

Risks are missing parent-column mappings, EPIC key typos, direct-versus-transitive parent ambiguity, issue-type spelling drift, unknown rows creating false confidence, and accidental Jira lookup. Mitigate with local-only proof, exact normalization, explicit states/counts, fail-closed configuration, and provenance.

Non-goals are Jira API integration, network calls, token/admin changes, recursive issue graph resolution, automatic key discovery, reclassifying Story/Epic/Sub-task, changing Done/flow formulas, duration-weighted percentages, or writing customer/workspace files.

## Acceptance criteria

1. Configuration is team-scoped, optional, syntactically validated locally, and read through a non-destructive compatibility adapter.
2. Only direct imported parent/EPIC-key equality proves membership; no Jira/network/inference path exists.
3. Task and Spike classify Lifecycle; Bug and Production Bug classify Maintenance; all other types are Unknown.
4. Denominator is recognized completed direct children: Maintenance + Lifecycle. Unknown and unproven rows are excluded and visible in coverage diagnostics.
5. Zero denominator, missing key, invalid key, missing parent field, configured-not-found, conflict, partial, stale, and error states are truthful and never rendered as zero.
6. Snapshot includes truthful counts, maintenancePct, coverage, asOf, capturedAt, source, and reason.
7. Team/Scrum Master views and shared MetricInsightModal use one snapshot; no duplicate Visual Analytics owner or raw-data leakage.
8. No existing formulas, TASK 012/013 naming, TASK 014 Waiting Time semantics, Monday-Friday rules, or customer/workspace boundaries change.
9. Accessibility, responsive behavior, migration safety, and synthetic-only tests pass.

## Focused tests

- Key trim/case normalization, blank/malformed key, configured-not-found, missing parent field, direct parent match, and non-child exclusion.
- Exact issue-type mapping for Task, Spike, Bug, Production Bug and unknown variants; no Story/Epic/Sub-task guessing.
- Done/selected-period filtering through TASK 013 contract.
- Denominator/count fixtures, zero denominator, unknown/partial coverage, conflict, stale-last-known, and retry/error behavior.
- Legacy read compatibility, mixed conflict fail-closed, explicit Save/Confirm round trip, failed-save preservation, and no workspace-file rewrite.
- Snapshot provenance/asOf/capturedAt/source parity across Team, Scrum Master, card, popup, and diagnostics.
- Optional card/modal copy, neutral direction/comparison semantics, no duplicate Visual Analytics panel.
- Keyboard, screen-reader, focus, outside-dismiss, mobile/reflow, zoom, reduced-motion, and no-color-only state tests.
- Synthetic-only data-safety and no Jira/network/token/admin regression tests.
