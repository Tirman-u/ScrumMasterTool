# TASK 013 — Unified status-set configuration

## Main status

`in-progress`

Owner: Main/ScrumMaster
Current stage: Designer
Scope lock: simplified unified Team Workflow role configuration

## User objective

Let users configure flow roles with a clear nested model while retaining safe compatibility for legacy status fields and avoiding silent destructive migration.

## Architect handoff

Approved roles: Lead Time, Cycle Time, Implementation Time, and Done where needed. Nested relationship: Implementation ⊆ Cycle ⊆ Lead; Done terminal/excluded. Legacy Active/Cycle/Implementing are explanation-only. Save/Confirm is explicit. Waiting Time % is cycle-only waiting outside Implementation/usable Cycle and has truthful coverage states.

## Designer handoff

Complete: [docs/design/task-013.md](../design/task-013.md). Defines role grouping, nested visualization, legacy adapter explanation, mixed/conflict/unknown/needs-review states, explicit Save/Confirm semantics, Waiting Time % boundary, Team/Scrum Master variants, responsive/keyboard/touch/200%/reduced-motion behavior, and QA acceptance criteria.

## Developer handoff

Blocked until Main routes the approved Designer handoff. Do not add a duplicate legacy editor, silently migrate/delete configuration, change formulas, or modify customer/workspace data outside approved write-back semantics.

## QA verdict

Not started. QA must independently verify role nesting, legacy/conflict states, confirm-save/rollback behavior, Waiting Time boundary, accessibility, responsive reflow, and unchanged calculations/data boundaries.

## Open follow-ups

- Legacy compatibility messaging may be retired only after migration coverage is proven; TASK 013 does not introduce a separate admin or network flow.

## QA verdict

`TASK 013 — FAIL`

### Findings

- **P1 — Unified configuration is not the single production presentation/configuration contract.** `apps/sm-tool/src/lib/metrics.ts:318-338` validates and classifies `workflow.statusSets`, but the rendered Workflow setup initializes and edits the legacy `funnelStatuses`, `activeStatuses`, and `implementingStatuses` fields (`apps/sm-tool/src/App.tsx:2091-2126`, `:6730-6762`, and `:8756-8877`). The executive workflow/report items also read those legacy fields directly (`apps/sm-tool/src/App.tsx:6330-6336`). `unifiedConfigFromLegacy` is only defined and covered by tests; it has no production caller. Expected: the one normalized `UnifiedFlowStatusConfig` is consumed by workflow UI, migration, calculations, and reports, with mixed/invalid state consistently surfaced and failed closed.
- **P1 — UI/migration does not fail closed for all canonical invalidity.** `adaptLegacyWorkflowConfig` drops `doneStatuses` while evaluating canonical status sets (`apps/sm-tool/src/lib/flow-presentation.ts:197-223`), so a canonical Done overlap or malformed Done set can appear complete in the Workflow UI even though metrics separately reject it. The UI status/category preview is also computed from legacy arrays rather than the validated canonical classifier.
- **P2 — Legacy terminology remains in visible user-facing controls.** The current-labeled editor contains placeholders and empty-state text `Add active status`, `Add implementing status`, and `No implementing statuses configured.` (`apps/sm-tool/src/App.tsx:6749-6761`); the parallel Team editor has the same old terminology (`:8850`, `:8867-8875`). These should be compatibility-only explanatory text, not primary controls.

### Validation evidence

- Focused `tests/unified-flow-status.test.ts tests/flow-presentation.test.ts tests/metrics.test.ts`: **28/28 passed**.
- `npm run check`: **33 test files / 172 tests passed**, root and app typecheck passed, production build passed. Build emitted only the existing ineffective dynamic-import and chunk-size warnings.
- `git diff --check`: passed.
- Scope inspection: unrelated dirty `Teams/**` files and `workspace.json` were preserved and not treated as TASK 013 changes; no production data files were modified. Browser/File System Access smoke was not available in this review environment.

### Required fixes

- Route Workflow setup, compatibility/migration diagnostics, and report/configuration presentation through one validated normalized `UnifiedFlowStatusConfig`; include canonical Done in validation and fail closed consistently for malformed, partial, mixed, and conflicting payloads.
- Remove old Active/Implementing terminology from selectable/editor labels and placeholders; retain it only in the explicit compatibility explanation.
- Add executable production-path tests proving canonical-only, invalid Done-overlap, malformed/partial, mixed/conflict, UI/report consumption, and explicit-save-only behavior.

### Next step

Developer remediation is required. The next task is **blocked** until a new QA review passes these fixes.

## Developer implementation evidence

Implemented the unified status-set boundary in the application. `UnifiedFlowStatusConfig` now carries normalized/deduplicated Lead Time, Cycle Time, Implementation Time, and Done identities; validation enforces `Implementation ⊆ Cycle ⊆ Lead`, terminal Done exclusion, and needs-review/fail-closed behavior. Status classification applies Done > Implementation > Cycle > Lead > Unmapped precedence. Exact legacy Funnel+Active+Implementing, Active+Implementing, and Implementing mappings remain readable through the Task 012 adapter. Valid canonical configs are consumed by the metrics classifier while malformed/invalid canonical payloads fail closed; legacy fields remain preserved for compatibility.

Updated Team Workflow controls to expose canonical role labels, nested-set explanation, compatibility diagnostics, and explicit Save role mapping / Confirm and save / Keep editing actions. Save writes the normalized status set alongside backward-readable legacy fields; no render-time or destructive migration is performed. Added executable normalization, nesting, precedence, malformed/conflict, legacy mapping, and production-wiring tests. Waiting Time % remains a defined boundary for TASK 014 and no new metric was added.

Validation: focused unified-flow, flow-presentation, and metrics tests passed (28 tests); `npm run check` passed (33 test files / 172 tests plus build); `git diff --check` passed. No commit, push, or deploy performed; QA verdict remains pending.

## QA re-review — remediation

`TASK 013 — FAIL`

### Re-review findings

- **P1 — Mixed/conflicting canonical and legacy configuration still does not fail closed in metrics.** `apps/sm-tool/src/lib/metrics.ts:318-348` computes `adapted`, but when `workflow.statusSets` validates it selects `unifiedValidation.config` without checking `adapted.state`. `adaptLegacyWorkflowConfig` reports mixed/Done conflicts at `apps/sm-tool/src/lib/flow-presentation.ts:224-258`, and UI/report presentation can show `Needs review`, but the metric classifier can continue calculating from canonical sets. Expected: the same mixed/conflict state must make metrics unavailable/fail closed.
- **P1 — The visible editor remains a legacy-group editor behind a canonical conversion boundary, not a canonical role editor.** App state and controls still use `funnelStatuses`, `activeStatuses`, and `implementingStatuses` (`apps/sm-tool/src/App.tsx:1679-1680`, `:2094-2142`, `:6730-6782`, `:8821-8877`). Canonical config is converted to legacy groups on load and back on save; canonical-only invalid/needs-review configuration renders empty role inputs instead of an explicit affected-role state.
- **P2 — Legacy labels remain in user-facing detail copy outside an explicit compatibility note.** Visible metric descriptions include `Active + Implementing` and `Implementing` (`apps/sm-tool/src/App.tsx:7555-7560`, `:8048-8050`), while the handoff restricts legacy names to compatibility explanation.

### Re-review validation evidence

- Focused unified-flow, flow-presentation, and metrics tests: **31/31 passed**.
- `npm run check`: **33 test files / 175 tests passed**, root/app typecheck and production build passed. Build emitted only existing dynamic-import and chunk-size warnings.
- `git diff --check`: passed.
- Unrelated `Teams/**` and `workspace.json` dirt remains out of scope; no customer/workspace data was changed by QA. Browser smoke was unavailable in this environment.

### Required remediation and next step

- Make mixed canonical/legacy conflicts block metrics classification, not only UI/report presentation.
- Make the Workflow UI authoritative state a validated `UnifiedFlowStatusConfig`, with explicit needs-review rendering; use legacy fields only for compatibility projection.
- Move legacy Active/Implementing wording to compatibility explanation only and add rendered-path tests.

FAIL remains blocking. Developer remediation and another independent QA review are required before the next task.

## QA final re-review — remediation 9

`TASK 013 — PASS WITH FOLLOW-UPS`

### Findings

- No P0/P1 blockers found in the reviewed scope.
- **P2 follow-up — Browser accessibility/responsive smoke was unavailable** in this environment; source-level semantic controls and existing test/build validation passed.

### Verified evidence

- Primary trust UI now maps `flowTiming.activeTime` to visible `Cycle Time` (`apps/sm-tool/src/lib/metric-trust.ts:76`); legacy Active + Implementing wording is confined to the explicit compatibility note in `metric-insights.ts:45` and the compatibility alias entry.
- Cycle Time ordinary insight text is canonical and distinct from Implementation Time (`metric-insights.ts:59`); the prior “Existing Cycle Time average” phrase is absent.
- `getWorkflowCompatibilityBuckets` is the typed excluded/backlog compatibility boundary; report classification/order and bottleneck fallback consume that bucket, and invalid mappings fail closed (`flow-presentation.ts:287-325`, `App.tsx:11426-11463`).
- Strict validator rejects empty roles, invalid nesting and Done overlap; canonical invalid payloads remain needs-review on load, editor state is canonical, and Save/Confirm is the only compatibility projection writeback (`flow-presentation.ts:98-110`, `App.tsx:2098-2112`, `:4964-5010`).
- Exact Task 012 mapping, numeric/formula/Monday-Friday semantics and Waiting Time boundary remain unchanged; no customer/workspace data changes were introduced.

### Validation

- Focused tests: **34/34 passed**.
- `npm run check`: **33 test files / 178 tests passed**, typecheck and production build passed; only existing dynamic-import/chunk-size warnings.
- `git diff --check`: passed.
- Browser smoke was not available; this remains a non-blocking follow-up.

### Next step

`PASS WITH FOLLOW-UPS` — the next task may begin. Retain browser desktop/mobile accessibility smoke as a follow-up when a runnable browser environment is available.

## Release QA — v0.5.8

`TASK 013 — PASS`

### Release evidence

- Root `package.json` and `package-lock.json` are `0.5.8`; app `apps/sm-tool/package.json` and `apps/sm-tool/package-lock.json` are also `0.5.8`, including both lockfile root package entries.
- The four release diffs are version-only: root/app package manifests change only their version field; root/app lockfiles change only top-level and `packages[""]` version fields. Dependency structure is unchanged.
- The approved Task 013 canonical status implementation remains present; no release-only changes affect its wiring.
- No `Teams/**`, `teams/**`, `workspace.json`, cache, customer or token files are part of the release delta. Existing dirty workspace/customer files were preserved and excluded.

### Validation

- `npm run check`: **33 test files / 178 tests passed**, typecheck and production build passed; only existing dynamic-import/chunk-size warnings.
- `git diff --check`: passed.

### Next step

`PASS` — release version bump is QA-cleared and the next task may begin.

## QA final re-review — remediation 8

`TASK 013 — FAIL`

### Findings

- **P1 — Rendered trust UI still exposes a legacy primary label.** `apps/sm-tool/src/lib/metric-trust.ts:76` maps the `flowTiming.activeTime` key to the visible label `Active Time`; `ExecutiveViews.tsx:342-373` renders that label in the Team/Scrum Master trust card and explanation. The requirement is canonical primary terminology only, with Active Time/Implementing/legacy field names restricted to compatibility explanation. This is a live rendered-surface violation even though the metric-insights Cycle Time definition is now canonical.
- **P1 — Cycle Time source copy is still incomplete for the frozen mapping.** `apps/sm-tool/src/lib/metric-insights.ts:45,59` uses canonical wording and a compatibility note, but the ordinary rendered trust card is sourced from `buildMetricTrustMetadata` and has `activeTime` → `Active Time`; the visible canonical Cycle Time explanation therefore does not consistently identify old `activeTime` semantics while avoiding the legacy label. The shared presentation contract is not fully unified.
- **P2 — Bottleneck candidate filtering still has a direct legacy fallback.** `apps/sm-tool/src/App.tsx:11445-11463` reads `doneConfig`, `workflowConfig.backlogStatuses`, and `workflowConfig.funnelStatuses` directly when no configured cycle set is available. This is separate from `getWorkflowCompatibilityBuckets` and leaves a second legacy decision path in the bottleneck diagnostic.

### Verified acceptance / regression checks

- Exact Task 012 mapping is preserved in `flow-presentation.ts`; strict canonical validation rejects empty roles, invalid nesting and Done overlap; canonical raw invalid payloads remain needs-review and Save/Confirm validates before projection.
- Backlog is represented as an explicit compatibility bucket for the main report helper; no Waiting Time metric or new formula/data source was introduced. Numeric and Monday-Friday semantics remain unchanged.

### Validation evidence

- Focused tests: **34/34 passed**.
- `npm run check`: **33 test files / 178 tests passed**, typecheck and production build passed; only existing dynamic-import/chunk-size warnings.
- `git diff --check`: passed.
- Unrelated `Teams/**` and `workspace.json` changes remain preserved/out of scope; no customer/workspace data changed. Browser smoke was unavailable.

### Required remediation / next step

- Rename the rendered `activeTime` trust surface to canonical Cycle Time and expose the old Active + Implementing semantics only in the compatibility note/details; ensure all ordinary trust/insight copy uses the same canonical registry.
- Route bottleneck fallback through the typed compatibility bucket/canonical adapter and add rendered trust + bottleneck-path assertions.

FAIL remains blocking. Developer remediation and another independent QA review are required before the next task.

## QA final re-review — remediation 7

`TASK 013 — FAIL`

### Findings

- **P1 — Cycle Time insight copy still does not state the frozen Task 012 underlying semantics.** `apps/sm-tool/src/lib/metric-insights.ts:59` says `Existing Cycle Time average using Monday-Friday working days`. The canonical Task 012 mapping is new Cycle Time = legacy `activeTime` (Active + Implementing), while legacy `cycleTime` is presented as Implementation Time. The current copy omits that distinction and can still cause the wrong source field/formula to be inferred. The prior misleading wording was not corrected to the required activeTime explanation.
- **P2 — Legacy terminology remains in ordinary shared insight definitions.** `metric-insights.ts:76` exposes the Active Time compatibility alias in the shared registry. Although the text calls it an alias, the task requirement limits legacy names to an explicit compatibility explanation; the ordinary Cycle Time definition also remains adjacent to this legacy registry content.
- **P2 — Backlog is documented as an excluded compatibility bucket, but remains a separate input to report ordering/classification.** `flow-presentation.ts:282-303` directly consumes `workflowConfig.backlogStatuses` after canonical validation. This is acceptable only if the product explicitly treats backlog as non-role compatibility data; the current task handoff requires the single canonical decision for all report/diagnostic/order/backlog classification, so this boundary needs a clearer typed contract or consolidation.

### Verified acceptance / regressions

- Strict validator rejects empty roles, invalid nesting and Done overlap as `needs-review`; canonical raw payloads are preserved on load; Save/Confirm validates the canonical draft before compatibility projection.
- Exact role nesting/precedence and legacy mapping helpers remain present; no new Waiting Time metric, formula, numeric, Monday-Friday, Jira, or customer/workspace data behavior was introduced.

### Validation evidence

- Focused tests: **34/34 passed** (flow presentation 11, unified status 7, metrics 16).
- `npm run check`: **33 test files / 178 tests passed**, typecheck and production build passed; only existing dynamic-import/chunk-size warnings.
- `git diff --check`: passed.
- Unrelated `Teams/**` and `workspace.json` changes remain preserved/out of scope; no customer/workspace data changed. Browser smoke was unavailable.

### Required remediation / next step

- Make Cycle Time insight meaning/calculation explicitly describe the legacy `activeTime` / Active + Implementing semantics without presenting it as the existing legacy Cycle Time average; keep legacy wording isolated to compatibility explanation.
- Consolidate or formally type the backlog compatibility bucket so report/order/classification demonstrably uses one validated canonical decision.

FAIL remains blocking. Developer remediation and another independent QA review are required before the next task.

## QA re-review 6 — remediation 6

`TASK 013 — FAIL`

### Findings

- **P1 — Canonical validator and load/save guard are now strict, but a user-facing Task 012 semantic regression remains.** `apps/sm-tool/src/lib/metric-insights.ts:61` describes the new `Cycle Time` calculation as the “Existing Cycle Time average”. The frozen Task 012 mapping requires new Cycle Time to present the old `activeTime` semantics (`Active + Implementing`) and old `cycleTime` to present as Implementation Time. This copy can lead a user to interpret the wrong underlying field/formula, so the exact mapping is not preserved in the insight contract.
- **P2 — Legacy terminology remains in ordinary/compatibility insight definitions.** `apps/sm-tool/src/lib/metric-insights.ts:44-45,60-61` still exposes Active Time/Implementing in the definitions used by the shared insight registry. Some entries are explicitly compatibility aliases, but the normal Cycle Time entry still contains legacy wording and should say only the canonical role semantics; legacy names belong in the isolated compatibility explanation.
- **P2 — Backlog remains an independent legacy field in report/order filtering.** `apps/sm-tool/src/lib/flow-presentation.ts:278-300` validates the canonical role mapping but separately reads `workflowConfig.backlogStatuses`. This may be acceptable only if backlog is explicitly documented as an unmapped/excluded compatibility projection; otherwise it violates the requirement that all classification/order decisions use one validated canonical decision.

### Verified fixes

- `validateUnifiedFlowStatusConfig` now rejects empty role sets and reports `needs-review` (`flow-presentation.ts:98-110`).
- Canonical payloads are preserved as raw role arrays on load rather than replaced by inferred legacy config (`App.tsx:2092-2112`); Save/Confirm validates the canonical draft before projecting compatibility fields (`App.tsx:4964-4969`).
- Editor handlers mutate `unifiedStatusDraft` and use nested role updates (`App.tsx:5647-5725`).
- Metrics and report helper paths use validated adapter state and fail closed for invalid/conflict mappings.

### Validation evidence

- Focused unified-flow, flow-presentation, and metrics tests: **31/31 passed**.
- `npm run check`: **33 test files / 175 tests passed**, root/app typecheck and production build passed; only existing dynamic-import/chunk-size warnings.
- `git diff --check`: passed.
- Unrelated `Teams/**` and `workspace.json` changes remain preserved/out of scope; no customer/workspace data changed. Browser smoke was unavailable.

### Required remediation / next step

- Correct Cycle Time insight meaning/calculation/source wording to the frozen Task 012 activeTime mapping, and remove legacy terminology from normal insight copy.
- Clarify or fold backlog/unmapped filtering into the canonical adapter so the single decision is demonstrable across report/order paths.

FAIL remains blocking. Developer remediation and another independent QA review are required before the next task.

## QA re-review 5 — remediation 5

`TASK 013 — FAIL`

### Findings

- **P1 — Empty/partial canonical payloads are still treated as valid.** `apps/sm-tool/src/lib/flow-presentation.ts:88-109` accepts empty arrays for all four roles and returns `state: "valid"`; no non-empty/partial-role guard exists. The App load path preserves raw malformed arrays (`apps/sm-tool/src/App.tsx:2098-2105`), but an all-empty or otherwise partial canonical payload can therefore become a valid editable draft and be saved. Expected: malformed/partial canonical payloads must remain `needs-review`, fail closed, and not be silently replaced or written back.
- **P1 — Canonical invalid-state preservation is incomplete.** Although valid canonical payloads now initialize `unifiedStatusDraft` and handlers mutate that state (`App.tsx:2098-2112`, `:5647-5725`), invalid payloads are represented as raw arrays and then passed to the permissive validator on Save (`:4964-4969`). A canonical payload with empty role arrays can bypass needs-review and produce a compatibility projection, violating the explicit correction-only writeback boundary.
- **P1 — Backlog/report paths are not fully canonicalized.** `classifyWorkflowStatusForReport` validates the role mapping but then independently checks `config.workflowConfig.backlogStatuses` (`apps/sm-tool/src/lib/flow-presentation.ts:278-289`), and `validatedWorkflowStatusOrder` independently concatenates those legacy backlog values (`:292-300`). `buildBottleneckCandidateStatusFilter` also falls back to direct legacy backlog/funnel fields (`apps/sm-tool/src/App.tsx:11445-11463`). These paths do not consume only the same validated canonical role config and can expose different classification/ordering behavior.
- **P2 — Legacy terms remain in compatibility-oriented insight copy used outside a clearly isolated migration panel.** `apps/sm-tool/src/lib/metric-insights.ts:44-45,61` still includes Active/Implementing in ordinary Cycle Time definitions. The frozen Task 012 metric-field mapping and Monday-Friday formula semantics otherwise remain unchanged.

### Validation evidence

- Focused unified-flow, flow-presentation, and metrics tests: **31/31 passed**.
- `npm run check`: **33 test files / 175 tests passed**, root/app typecheck and production build passed; only existing dynamic-import/chunk-size warnings.
- `git diff --check`: passed.
- Unrelated `Teams/**` and `workspace.json` changes remain preserved and out of scope; no customer/workspace data changed. Browser smoke was unavailable in this environment.

### Required remediation / next step

- Make empty/partial canonical role sets explicitly `needs-review`; preserve invalid raw payloads and block Save/Confirm until a user correction is made.
- Ensure backlog/unmapped handling is an explicit compatibility boundary and all report/diagnostic/order classification uses one validated canonical decision.
- Remove legacy terminology from ordinary insight definitions; retain it only in an explicit compatibility explanation.

FAIL remains blocking. Developer remediation and another independent QA review are required before the next task.

## QA re-review 4 — remediation 4

`TASK 013 — FAIL`

### Findings

- **P1 — Invalid canonical-only payloads can still be replaced without an explicit correction.** During team load, `apps/sm-tool/src/App.tsx:2095-2114` initializes `unifiedStatusDraft` with `canonicalValidation.config ?? buildUnifiedFlowStatusConfigFromLegacyGroups(...).config`. Thus an invalid/partial/Done-overlap canonical payload is discarded in favor of a valid legacy-derived draft whenever legacy fields are present. The editor can subsequently Save/Confirm that replacement. Expected: preserve the invalid canonical state as `needs-review`; only a deliberate user correction followed by Save/Confirm may write a replacement.
- **P1 — Canonical editor mutations are present, but canonical invalid-state handling remains misleading.** Handlers now call `mutateUnifiedStatusDraft` (`apps/sm-tool/src/App.tsx:5650-5750`), and canonical projection is written back only in `handleSaveAdvancedConfig` (`:4954-5010`). However, the invalid-state fallback above means the authoritative draft is not the invalid canonical payload, and the user is not shown the affected canonical roles that need review.
- **P1 — Production report/order paths still mix canonical adapter output with direct legacy backlog data.** `getTimeInStatusFlowRole` checks `workflow.backlogStatuses` before adapter state (`apps/sm-tool/src/App.tsx:11333-11358`); `buildWorkflowStatusOrder` and board status construction likewise directly include legacy backlog (`:11001-11010`, `:13276-13280`). This is not a single validated canonical status contract for all report/diagnostic classification paths.
- **P2 — Legacy terminology remains in ordinary user-facing metric/trust copy.** `apps/sm-tool/src/lib/metric-trust.ts:100-101` still says “Active and Implementing” and “Active + Implementing durations”; `apps/sm-tool/src/lib/metric-insights.ts:61` includes the same legacy terms outside the dedicated compatibility diagnostic entries.

### Validation evidence

- Focused unified-flow, flow-presentation, and metrics tests: **31/31 passed**.
- `npm run check`: **33 test files / 175 tests passed**, root/app typecheck and production build passed; only existing dynamic-import/chunk-size warnings.
- `git diff --check`: passed.
- Unrelated `Teams/**` and `workspace.json` changes remain preserved and out of scope; no customer/workspace data changed. Browser smoke was unavailable in this environment.

### Required remediation / next step

- Preserve canonical invalid/partial/Done-overlap payloads as explicit needs-review state; never substitute legacy/inferred config on load. Permit replacement only after intentional correction and Save/Confirm.
- Route every report/diagnostic/order path through the validated adapter, with a clearly defined compatibility-only projection for unmapped/backlog statuses.
- Remove legacy names from ordinary trust/insight copy and retain them only in compatibility explanations.

FAIL remains blocking. Developer remediation and another independent QA review are required before the next task.

## QA re-review 3 — remediation 3

`TASK 013 — FAIL`

### Findings

- **P1 — The editor still has legacy-group state as its mutation source.** Although `unifiedStatusDraft` is now initialized and used for display (`apps/sm-tool/src/App.tsx:1692-1693`, `:2095-2118`, `:6638-6703`), every add/remove/classify handler still mutates `funnelStatusesInput`, `sprintScopeStatusesInput`, `implementingStatusesInput`, and `doneStatusesInput`, then reconstructs the canonical draft from those lists (`:5648-5750`). The canonical object is not the authoritative editable state required by the handoff. More importantly, invalid canonical-only input falls back to legacy fields/inferred groups during initialization (`:2107-2114`), and a later explicit save can replace that invalid canonical payload with a newly derived valid mapping without an explicit correction/review of the original payload.
- **P1 — Canonical-only invalid/partial/Done-overlap state is not consistently protected from silent replacement.** `draftUnifiedStatusConfig` is initialized with `canonicalValidation.config ?? buildUnifiedFlowStatusConfigFromLegacyGroups(...).config` (`App.tsx:2104-2114`). For an invalid canonical payload with valid legacy fields, this creates a valid draft fallback; `handleSaveAdvancedConfig` validates and writes that fallback after confirmation. Expected: invalid canonical state remains needs-review and cannot be silently overwritten; only an intentional user correction followed by Save/Confirm may write a replacement.
- **P1 — At least one report/diagnostic classification still does not consume the same canonical config.** `getTimeInStatusFlowRole` now uses `adaptLegacyWorkflowConfig` and the canonical classifier (`App.tsx:11385-11425`), but it checks `workflow.backlogStatuses` directly before the mapping state and `buildWorkflowStatusOrder`/`buildBoardStatusMap` continue to mix direct legacy backlog fields with adapted roles (`:11338-11357`, `:11053-11067`, `:13270-13280`). Canonical-only configurations with legacy backlog fields can therefore produce report ordering/role output that is not derived from the single validated status-role config.
- **P2 — Ordinary metric definitions still include legacy terminology.** `apps/sm-tool/src/lib/flow-presentation.ts:20-38` retains Funnel/Active/Implementing definitions, despite the requirement that those terms appear only in compatibility explanation. Task 012 semantic mapping itself remains unchanged.

### Validation evidence

- Focused unified-flow, flow-presentation, and metrics tests: **31/31 passed**.
- `npm run check`: **33 test files / 175 tests passed**, root/app typecheck and production build passed; only existing dynamic-import/chunk-size warnings.
- `git diff --check`: passed.
- Unrelated `Teams/**` and `workspace.json` dirt was preserved and not changed by QA. Browser smoke was unavailable in this environment.

### Required remediation / next step

- Make canonical draft the sole editable source and preserve invalid canonical payloads as needs-review until an explicit correction is made; Save/Confirm must be the only compatibility projection writeback.
- Route all report/diagnostic role/order paths through one validated canonical adapter, including backlog/excluded handling, with consistent fail-closed behavior.
- Remove legacy terms from ordinary metric definitions/copy and add executable rendered-path tests for invalid canonical preservation and save behavior.

FAIL remains blocking. Developer remediation and another independent QA review are required before the next task.

## QA re-review 2 — remediation 2

`TASK 013 — FAIL`

### Findings

- **P1 — Canonical/legacy conflict is blocked in the primary metrics classifier, but not consistently across all production classification/report paths.** `apps/sm-tool/src/lib/metrics.ts:318-348` now requires `adapted.state === "complete"` when `statusSets` is present, which is correct. However, `apps/sm-tool/src/App.tsx:11312-11386` (`getTimeInStatusFlowRole`) still determines role membership directly from legacy `funnelStatuses`, `activeStatuses`, and `implementingStatuses`, bypassing the canonical adapter/classifier. That leaves report/diagnostic classification inconsistent with metric calculation for canonical-only, mixed, or conflict states.
- **P1 — The Workflow editor still does not use a single canonical state for editing.** The rendered role chips are displayed from `displayUnifiedStatusConfig` (`apps/sm-tool/src/App.tsx:6612-6619`, `:6780-6811`), but their input state and all add/remove/classify handlers remain separate legacy-group states (`funnelStatusesInput`, `sprintScopeStatusesInput`, `implementingStatusesInput`; `:1679-1690`, `:5701-5740`). `draftUnifiedStatusConfig` is rebuilt from those legacy groups (`:2678-2683`) and can override a raw canonical payload. For canonical-only invalid/partial/Done-overlap data, the fallback raw arrays can still be rendered as role values while the top message says review is required, rather than presenting a validated canonical draft with affected-role state. This does not satisfy the requirement that the editor truly edits authoritative validated `UnifiedFlowStatusConfig`.
- **P2 — Legacy compatibility wording remains in normal metric UI copy.** `apps/sm-tool/src/lib/flow-presentation.ts:20-38` contains user-facing definitions with “Funnel”, “Active” and “Implementing”, and App metric detail copy still includes “Active + Implementing” / “Implementing” (`:7555-7560`, `:8048-8050`). These should be limited to the explicit compatibility explanation under the handoff.

### Validation evidence

- Focused unified-flow, flow-presentation, and metrics tests: **31/31 passed**.
- `npm run check`: **33 test files / 175 tests passed**, root/app typecheck and production build passed; only existing dynamic-import/chunk-size warnings.
- `git diff --check`: passed.
- Unrelated `Teams/**` and `workspace.json` changes remain untouched and out of scope. Browser smoke was unavailable in this environment.

### Required fixes / next step

- Route all production status classification/report paths through the same validated canonical adapter and fail closed for conflict/partial/invalid states.
- Make canonical config the authoritative editor state; retain legacy groups only as compatibility projection and explicit write-back.
- Remove legacy terminology from ordinary metric copy and add rendered-path tests for invalid canonical UI, report classification, and conflict handling.

FAIL remains blocking. Developer remediation and another independent QA review are required before the next task.

## Developer remediation evidence

The production boundary now validates canonical `statusSets` including terminal Done, fails closed on malformed/nested/Done-overlap and mixed legacy conflicts, and exposes the same canonical role sets through `adaptLegacyWorkflowConfig`. Legacy configuration remains readable through the exact Task 012 mapping; no write-back occurs during initialization or presentation. Metrics, executive workflow summaries, board-status ordering, bottleneck filtering, and Time-in-Status presentation now consume the validated adapter where configured. Workflow initialization derives editor state from valid canonical sets, while invalid canonical payloads do not fall back to a visually complete legacy mapping. Role editors display only Lead Time, Cycle Time, Implementation Time, Done, or Unmapped terminology; legacy names remain compatibility-only implementation details.

Added executable fixtures for canonical-only mappings, Done validation/overlap, mixed conflicts, legacy numeric mapping, and explicit canonical save/wiring. Focused validation passed: `tests/unified-flow-status.test.ts`, `tests/flow-presentation.test.ts`, and `tests/metrics.test.ts` (31 tests). Full `npm run check` passed (33 test files / 175 tests, typechecks, and production build); `git diff --check` passed. No commit, push, deploy, or customer/workspace data changes performed.

## Developer remediation 2 evidence

Metrics now requires the validated adapter to report a complete state before using canonical or configured legacy roles; mixed canonical/legacy conflicts therefore fail closed instead of using a structurally valid `statusSets` payload. The Workflow editor keeps canonical status sets authoritative for initialization and visible draft chips, preserves raw affected canonical roles for needs-review display, and blocks write-back until the existing explicit confirmation flow receives a valid canonical draft. Primary metric descriptions now use Lead Time, Cycle Time, and Implementation Time terminology; legacy role names are not used in those metric surfaces.

Executable coverage added for mixed-conflict classifier unavailability and canonical/invalid editor/report wiring. Validation: focused tests passed (31/31); `npm run check` passed (33 test files / 175 tests, typechecks, and production build); `git diff --check` passed. No commit, push, deploy, or customer/workspace data changes performed; QA re-review is required.

## Developer remediation 3 evidence

Time-in-Status/report flow-role classification now uses `adaptLegacyWorkflowConfig` plus `classifyUnifiedFlowStatus`; explicit invalid, partial, mixed/conflicting, or Done-overlap mappings return an unclassified result consistently instead of reading legacy role arrays directly. The editor now owns an in-memory canonical `UnifiedFlowStatusConfig` draft, initializes it from canonical configuration when present, updates it through role edits, and derives backward-readable legacy fields only during explicit confirmed save. Invalid canonical payloads retain affected raw roles for needs-review visibility and cannot be silently replaced by an inferred projection. Ordinary metric definitions/detail copy use canonical terminology; legacy names remain compatibility-only.

Validation: focused tests passed (31/31); `npm run check` passed (33 test files / 175 tests, typechecks, and production build); `git diff --check` passed. No commit, push, deploy, or customer/workspace data changes performed; QA re-review is required.

## Developer remediation 6 evidence

Canonical validation now rejects empty Lead Time, Cycle Time, Implementation Time, or Done role sets as needs-review; invalid/partial canonical data remains preserved for correction and cannot pass Save/Confirm projection. A single `classifyWorkflowStatusForReport` decision now covers canonical role, compatibility backlog, and unmapped outcomes, and validated order/board/bottleneck paths use that boundary. Ordinary insight entries use canonical terminology; compatibility aliases are explicitly identified and do not describe legacy status-role combinations.

Validation: focused tests passed (31/31); `npm run check` passed (33 test files / 175 tests, typechecks, and production build); `git diff --check` passed. No commit, push, deploy, or customer/workspace data changes performed; QA re-review is required.

## Developer remediation 5 evidence

Canonical initialization now preserves a present raw `statusSets` payload—even when malformed, partial, conflicting, or Done-overlapping—as normalized needs-review draft state; only the no-canonical-field legacy path adapts from legacy groups. The canonical draft remains the sole editable state and Save/Confirm is blocked by validation. Report ordering, board status construction, and Time-in-Status classification use the shared validated adapter helpers, with compatibility backlog semantics handled inside that boundary. Ordinary trust and insight copy now uses canonical Lead/Cycle/Implementation terminology; legacy terms remain compatibility explanations only.

Validation: focused tests passed (31/31); `npm run check` passed (33 test files / 175 tests, typechecks, and production build); `git diff --check` passed. No commit, push, deploy, or customer/workspace data changes performed; QA re-review is required.

## Developer remediation 4 evidence

The workflow editor now uses `unifiedStatusDraft` as the sole editable state for canonical roles. Add/remove/classify, preset, reset, and clear actions mutate canonical sets directly; legacy role input state/setters were removed. Initialization preserves valid canonical sets and retains normalized raw invalid/partial/Done-overlap sets for needs-review display without inferred replacement. Legacy arrays are generated only from the validated canonical config during explicit confirmed save.

Time-in-Status role classification, ordering, board status mapping, bottleneck filters, and report diagnostics use the same validated adapter/classifier boundary. Ordinary flow presentation definitions contain only canonical terminology. Executable source/fixture assertions cover canonical draft wiring, mixed-conflict fail-closed behavior, report classification parity, and legacy-copy absence.

Validation: focused tests passed (31/31); `npm run check` passed (33 test files / 175 tests, typechecks, and production build); `git diff --check` passed. No commit, push, deploy, or customer/workspace data changes performed; QA re-review is required.

## Developer remediation 7 evidence

Cycle Time insight copy now describes the canonical configured Cycle Time flow and existing Monday-Friday working-day average without exposing legacy field names in ordinary user-facing meaning/calculation/source text. The legacy Active Time alias remains resolvable only through an explicitly separated compatibility registry so persisted older labels remain readable. Report classification treats `backlogStatuses` only as an excluded compatibility bucket before applying the validated canonical precedence; invalid or conflicting mappings remain `unmapped`, and validated status ordering is empty for those mappings.

Executable regression coverage now verifies canonical Cycle Time meaning/source wording, backlog/excluded classification, canonical role classification, ordering, and fail-closed invalid behavior. Focused tests passed; full validation and `git diff --check` are required for this remediation before QA re-review. No commit, push, deploy, version bump, or customer/workspace data changes were performed.

## Developer remediation 8 evidence

Removed the exact ordinary-registry phrase “Existing Cycle Time average”. The visible Cycle Time insight now states that it measures average working days through the Cycle Time flow before Implementation Time completes and explicitly distinguishes the metric from Implementation Time. The existing `activeTime` mapping and Active + Implementing detail is retained only as a labelled compatibility note. Legacy Active Time remains outside the primary registry and is available only through the compatibility alias path.

Added the typed `WorkflowCompatibilityBuckets` adapter. Report classification and validated ordering consume its normalized excluded backlog bucket; no direct ad hoc backlog role decision is used, and invalid/conflicting canonical mappings still fail closed. Executable tests cover the exact old-phrase absence, canonical Cycle Time copy/source, compatibility detail, normalized backlog bucket, canonical classification, ordering, and invalid behavior. No version bump, commit, push, deploy, or customer/workspace data changes were performed.

## Developer remediation 9 evidence

The primary trust surface now renders the existing `flowTiming.activeTime` value under the canonical **Cycle Time** label; the internal key and numeric calculation are unchanged. Bottleneck fallback exclusion now uses validated adapter Done statuses and `getWorkflowCompatibilityBuckets`, with no direct funnel/backlog/done legacy-array decision in that path. Regression tests cover trust-label parity, canonical Cycle Time presentation, compatibility backlog behavior, and removal of the direct legacy funnel path. No version bump, commit, push, deploy, or customer/workspace data changes were performed.
