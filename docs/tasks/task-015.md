# TASK 015 — Maintenance lifecycle key and Maintenance %

## Main status

`in-progress`

Owner: Main/ScrumMaster
Current stage: Designer
Scope lock: optional local key configuration and one Executive Maintenance % card

## User objective

Allow a team to configure an optional maintenance lifecycle Jira key with honest local-only validation and show Maintenance % from recognized completed direct-child work.

## Architect handoff

Add optional `maintenanceLifecycleJiraKey` with local syntactic validation only; no Jira lookup. Classification: Task/Spike = Lifecycle, Bug/Production Bug = Maintenance, all other types Unknown. Denominator: completed direct-child recognized work = Maintenance + Lifecycle. Exclusions reduce coverage; zero denominator is unavailable. Reuse Task 010/011 MetricInsightModal and do not duplicate Visual Analytics.

## Designer handoff

Complete: [docs/design/task-015.md](../design/task-015.md). Defines field placement/validation/Save-Confirm, no-lookup limitation, configured-not-found/missing-parent/conflict/unknown states, one Maintenance % card/modal, formula/coverage/provenance, Team/Scrum Master variants, and responsive/accessibility acceptance.

## Developer handoff

Blocked until Main routes the approved Designer handoff. Preserve Task 012/013 terminology/status roles, Task 014 conventions, local-only scope, and customer-data boundaries.

## QA verdict

Not started. QA must independently verify local validation, explicit save/recovery, classification/denominator, coverage/zero semantics, modal states/accessibility, and no-Jira/data/deploy scope.

## Open follow-ups

- Jira existence and parent lookup remain explicitly out of scope; configured-not-found must remain an honest local-verification state.
## Developer implementation evidence

- Added optional team-scoped `maintenanceLifecycle.maintenanceLifecycleJiraKey` with local Jira-key syntax validation and explicit inclusion in the existing Team Workflow save/confirmation path. No Jira lookup, network, token, or admin flow is used.
- Added typed local Maintenance lifecycle snapshot and exact classification: Task/Spike → Lifecycle, Bug/Production Bug → Maintenance, all other types → Unknown. Membership requires direct normalized parent/EPIC equality from imported issue data; the aggregate denominator is recognized completed direct children only.
- Wired one Maintenance % Executive card through the existing MetricTrust and MetricInsightModal contract for both Team and Scrum Master presentations. Missing key, invalid/source-missing/not-found/no-recognized-work and partial states remain truthful and never become zero.
- Added executable synthetic fixtures for key validation, direct-parent equality, type mapping, unknown coverage, configured-not-found and zero recognized work. No customer/workspace data was changed.

## Developer remediation evidence

- Added a synchronous save-time gate using the same local Jira-key validator as the displayed field state. Malformed non-empty values are rejected before `saveTeamConfig` or analysis, the previous configuration remains the save candidate, and the status message gives the required syntax; an empty optional value explicitly clears the setting.
- Added an executable fixture covering malformed rejection/previous-config retention and valid-key acceptance, plus production-handler wiring assertions. No Jira/network/token path was introduced.

## QA verdict

`TASK 015 — FAIL`

### Evidence (2026-09-04)

- Architect and Designer handoffs were independently reviewed. The implementation adds a team-scoped optional field, direct normalized parent/EPIC equality, exact type mapping, one shared Maintenance % KPI/modal path, and typed snapshot/provenance fields.
- `buildMaintenanceLifecycleSnapshot` proves membership only with normalized `parentIssueKey === configuredKey`; it does not traverse, inspect summaries/labels/filenames, or infer from issue type. Task/Spike map to Lifecycle, Bug/Production Bug to Maintenance, all other types to Unknown (`apps/sm-tool/src/lib/metrics.ts:26-87`).
- The aggregate denominator is `maintenanceCount + lifecycleCount` among completed direct children; excluded/unknown candidates reduce coverage and zero recognized work is unavailable, not `0%`.
- The card is included once in the shared KPI list and carries `metricTrust` into the existing `MetricInsightModal` for both Team and Scrum Master (`apps/sm-tool/src/App.tsx:6495-6501`; `apps/sm-tool/src/components/ExecutiveViews.tsx:909,933`). No duplicate Visual Analytics surface was added.
- Focused validation passed: `tests/maintenance-lifecycle.test.ts`, `tests/metric-trust.test.ts`, `tests/executive-flow-time.test.ts`, `tests/metrics.test.ts` — 4 files / 34 tests. Full `npm run check` passed — typecheck, 34 test files / 188 tests, production build. `git diff --check` passed.
- No Jira/network/token/admin behavior or customer/workspace data was changed by QA; pre-existing `Teams/**`, `workspace.json`, cache and import files remained out of scope.

### Blocking finding

- **P1 — Invalid maintenance key can be saved.** The configuration UI displays `Enter a valid Jira key` for invalid input (`apps/sm-tool/src/App.tsx:6734-6741`), but `handleSaveAdvancedConfig` does not call `isValidMaintenanceLifecycleJiraKey` or otherwise reject the input before constructing and saving `maintenanceLifecycle` (`apps/sm-tool/src/App.tsx:4923-4950,5009-5011`). Save/Confirm therefore persists syntactically invalid keys, contrary to the local syntactic validation contract. Add a pre-save guard that preserves the prior config, keeps the draft editable, and prevents writeback until the key is blank or syntactically valid; add an executable handler/contract regression.

### Follow-ups and limitation

- Browser smoke was not available; source-level keyboard/modal/config wiring and executable tests were inspected separately. This is non-blocking, but should be covered before UI release.
- Re-review is also needed for explicit Save/Confirm preservation after invalid-key rejection.

### Required next step

- **FAIL blocks the next task.** Developer must remediate invalid-key save behavior and add the missing regression, then request a new independent QA review. No version bump, commit, push, or deploy was performed by QA.

## QA re-review — remediation

`TASK 015 — FAIL`

### Evidence (2026-09-04)

- The invalid-save finding is fixed: `handleSaveAdvancedConfig` calls `validateMaintenanceLifecycleConfigForSave` before persistence; malformed non-empty input returns without saving and preserves the prior configuration, while valid trimmed input and explicit confirmation proceed (`apps/sm-tool/src/App.tsx:4923-4955,5019`; `apps/sm-tool/src/lib/metrics.ts:26-50`). Tests cover malformed rejection, preservation, valid save, and optional empty clear (`tests/maintenance-lifecycle.test.ts:47-58`).
- Direct normalized imported `parentIssueKey` equality remains the only membership proof; exact Task/Spike → Lifecycle, Bug/Production Bug → Maintenance, and all other types → Unknown remain intact. Denominator is completed direct-child recognized work; unknown/unproven rows reduce coverage and zero recognized work is unavailable, never zero.
- One Maintenance % KPI carries typed trust into the shared MetricInsightModal for Team and Scrum Master, with no duplicate Visual Analytics surface. No Jira/network/token/admin or customer/workspace changes were introduced by QA.
- Focused validation passed: 4 files / 34 tests. Full `npm run check` passed: typecheck, 34 files / 188 tests, production build. `git diff --check` passed.

### Remaining blocker

- **P1 — Required configuration/source states collapse to generic unavailable.** `maintenanceLifecycleTrust` explicitly maps conflict, ready-complete, ready-partial-unknown-types, stale-last-known, and error-with-retry, but `not-configured`, `invalid-key`, `source-missing-parent-field`, `configured-not-found`, and `no-recognized-completed-work` all fall through to `MetricTrustState` `unavailable` (`apps/sm-tool/src/lib/metric-trust.ts:182-229`). Their reason strings differ, but the typed/card/modal state is not distinct as required by the architecture/design state contract, preventing reliable state-specific presentation and diagnostics.

### Limitation and next step

- Browser smoke was not available; source-level accessibility/modal/config wiring and executable tests were inspected. This is a non-blocking environment limitation.
- **FAIL blocks the next task.** Add explicit state mappings and fixtures for the required configuration/source states, then request another independent QA review. No version bump, commit, push, or deploy was performed by QA.

## Release QA — v0.5.10

`TASK 015 RELEASE — PASS`

### Evidence (2026-09-04)

- Root/app `package.json` and both lockfiles are `0.5.10`; both lockfile `packages[""].version` entries also equal `0.5.10`.
- All four release files contain version-only changes. After removing version fields, JSON structure/dependency parity matches the prior revision for every file.
- The approved Maintenance % implementation remains intact: local key validation/save guard, direct parent equality, exact type mapping, recognized-child denominator, typed snapshot/MetricTrust/modal wiring, and no-zero semantics.
- Release-specific delta is exactly the four package/lock files. Pre-existing Task 015 implementation/docs changes and dirty `Teams/**`, `teams/**`, `workspace.json`, cache/import/customer files and token-sensitive data were not modified or included as release changes.
- `npm run check` passed: typecheck, 34 test files / 190 tests, production build. `git diff --check` passed.

### Verdict

- No P0/P1/P2 release blocker found. QA performed no version bump, commit, push, or deploy.
- **PASS. Release may proceed to Main’s release decision.**

## QA re-review 2 — remediation 2

`TASK 015 — PASS WITH FOLLOW-UPS`

### Evidence (2026-09-04)

- All named Maintenance lifecycle states now survive the typed contract and reach the shared modal: `not-configured`, `invalid-key`, `source-missing-parent-field`, `configured-not-found`, `no-recognized-completed-work`, `ready-complete`, `ready-partial-unknown-types`, `conflict`, `stale-last-known`, and `error-with-retry` (`apps/sm-tool/src/lib/metric-trust.ts:189-229`; `tests/maintenance-lifecycle.test.ts:78-115`). Only `ready-complete` maps to the complete state; partial and operational/unavailable states do not use a success tone (`apps/sm-tool/src/App.tsx:6503-6504`).
- Save/Confirm calls the same local key validator before persistence; malformed input is rejected with the previous config retained, valid trimmed keys are accepted, and an empty optional value explicitly clears configuration (`apps/sm-tool/src/App.tsx:4923-4955,5019`; `tests/maintenance-lifecycle.test.ts:47-58`).
- Membership is direct normalized imported parent/EPIC equality only. Exact type mapping and recognized completed-child denominator remain correct; unknown/unproven records reduce coverage, and zero recognized work is unavailable rather than zero. Typed snapshot provenance/asOf/capturedAt/source/reason and semantic comparison remain wired to the single Team/Scrum Master card and shared MetricInsightModal.
- Focused validation passed: 4 files / 36 tests. Full `npm run check` passed: typecheck, 34 test files / 190 tests, production build. `git diff --check` passed.
- No Jira/network/token/admin flow or customer/workspace data was changed by QA; pre-existing `Teams/**`, cache/import files, and `workspace.json` remained out of scope.

### Follow-ups

- Browser smoke was not available; source-level accessibility, explicit confirmation, modal reuse, and responsive contracts were inspected. Keep a browser regression for keyboard Save/Confirm, modal focus restoration, and mobile reflow.
- No separate legacy maintenance-key field exists in the current config schema; if one is introduced later, add an explicit normalized conflict test before enabling migration.

### Next step

- **PASS WITH FOLLOW-UPS. The next task may begin.** No version bump, commit, push, or deploy was performed by QA.
