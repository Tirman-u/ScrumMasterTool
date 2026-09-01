# TASK 007 — Structured application operation status

## Main status

`in-progress`

Owner: Main/ScrumMaster
Current stage: Designer
Scope lock: structured AppOperation/AppStatus presentation and guarded operation lifecycle

## User objective

Replace the global busy boolean with clear operation phases and recoverable status for workspace loading, permission restore, local helper update, all/team recalculate, saves, and errors.

## Architect handoff

Architect decision: use structured `AppOperation`/`AppStatus`; Open/Switch and remembered Open remain disabled during active operations and are not queueable. Preserve existing behavior and data safety. Use an operationId/finally guard so stale completion cannot clear a newer operation.

## Designer handoff

Complete: [docs/design/task-007.md](../design/task-007.md). Defines global status placement, phase labels, action-specific copy, disabled Open/Switch behavior, recovery, success/error semantics, desktop/mobile treatment, keyboard/focus/live-region behavior, and Developer/QA acceptance criteria.

## Developer handoff

Blocked until Main routes the approved Designer handoff. Application code changes must remain within the Architect scope; no customer data, formulas, or network/Jira/token/admin flow.

## QA verdict

Not started. QA must independently verify operation phases, stale-state/race recovery, disabled/non-queueable workspace controls, error recovery, accessibility, responsive layout, and data safety.

## Open follow-ups

- No additional operation scope, background workflow, or visual redesign is included in TASK 007.

## Developer implementation notes

- Added a typed `AppOperation` model with explicit phase, active/complete/error state, recovery copy, and guarded operation IDs.
- Workspace open, remembered-workspace open, helper update, all-team recalculation, selected-team recalculation, and team settings updates now expose structured status phases while preserving existing local-only behavior and last-known data.
- Workspace navigation controls remain disabled during active operations and expose the active phase in accessible names/descriptions; the global status region exposes the phase, message, and `aria-busy` only while active.
- Added executable tests for operation creation and stale completion protection in `tests/app-operation.test.ts`.
- Validation is pending focused tests, `npm run check`, and `git diff --check`; no commit or push is performed by Developer.

## QA remediation notes

- Error recovery now carries a typed action and renders a real `Try again` or `Choose Workspace` button only when a safe retry is available.
- Sidebar, metrics/empty-state, workspace-page header, and remembered-workspace controls expose adjacent phase-specific lock hints while an operation is active, with matching accessible descriptions.
- Focused executable coverage now verifies actionable versus informational recovery and recovery action identity.
- Team-save failures now retain a dedicated retry-team-save action; remembered-open and all-team recalculation failures expose only their corresponding actionable recovery.
- Remembered Open controls in the metrics panel now include workspace identity and phase-specific disabled explanations.

## QA review — independent structured operation status review

### Verdict

FAIL

### Findings

- P1 — Recovery is not actionable. Recalculation and save failures pass `"Try again"` as `operation.recovery`, and workspace failures pass `"Choose Workspace"`, but the global status renders recovery as a plain `<span>` rather than a button or link with an action handler (`apps/sm-tool/src/App.tsx:6833-6836`). The user cannot activate the advertised retry/manual fallback from the operation status, so the required recoverable error flow is incomplete.
- P1 — Workspace controls do not consistently provide a visible phase-specific lock explanation. The sidebar footer `Switch/Choose Workspace` has a visible `operation-lock-hint`, but the workspace-page header button and empty-state button have no adjacent visible explanation, and remembered-workspace `Open` rows only add the reason to `aria-label` (`apps/sm-tool/src/App.tsx:6822-6825,6844-6865,6884-6916`). This fails the handoff requirement that every disabled Open/Switch control visibly explain why it is unavailable; an accessible name alone is not visible UI.
- P2 — Focused executable coverage is limited to the pure operation helper (two tests). It does not exercise App wiring, phase transitions, disabled-control explanations, recovery activation, or responsive/keyboard behavior. Browser smoke was not available in this environment, so those behaviors remain unverified in addition to the concrete blockers above.

### Verified

- `AppOperation` has explicit operation ID, phase, active/complete/error state, and `finishOperation()` ignores stale operation IDs (`apps/sm-tool/src/lib/app-operation.ts:1-37`). Workspace open, remembered open, helper update, selected/all-team recalculation, and named save flows are wired to the structured operation model.
- Active status uses one `role="status"` / `aria-live="polite"` region and `aria-busy` while active. Operation completion/error transitions clear the active lock through the operation state; stale `finally` paths are ID-guarded.
- The reviewed target diff is limited to the operation-status implementation plus its helper/test/task documentation. No Teams/customer exports, cache files, `workspace.json`, or public assets were modified by this task review.

### Validation

- Focused test: PASS — `tests/app-operation.test.ts`, 1 file / 2 tests.
- `npm run check`: PASS — typecheck, 27 test files / 136 tests, and production build.
- `git diff --check`: PASS.
- Existing non-blocking build warnings remain: `TeamDetail.tsx` has both dynamic and static imports, and the main bundle exceeds the warning threshold.
- Browser smoke was not run because the local environment cannot provide a reliable browser/File System Access session; responsive and real focus interaction remain unverified.

### Required fixes

- Replace recovery text with a real, keyboard-operable action (or wire the status action to the existing safe control) for `Try again` and `Choose Workspace`; keep recovery scoped to the current operation and preserve last-known data.
- Add a visible phase-specific lock hint adjacent to every disabled workspace Choose/Switch and remembered Open control, including workspace-page and empty-state variants; retain the accessible description/name.
- Add executable App-level fixtures/tests for phase transitions, action recovery, all workspace-control variants, and operation completion/error unlock behavior.

### Next step

Task 007 is blocked. Developer remediation is required, followed by a new QA review. No commit or push was performed.

## QA re-review — remediation

### Verdict

FAIL

### Findings

- P1 — Team-settings save retry invokes the wrong scoped action. `handleUpdateTeamEntityType()` sets recovery text `Try again` with `retry-recalculate-all` (`apps/sm-tool/src/App.tsx:4665-4669`), while `handleOperationRecovery()` dispatches that action to `handleRecalculateAll()` (`apps/sm-tool/src/App.tsx:4524-4533`). A failed team save therefore offers a recovery that recalculates every team instead of retrying the failed save, violating scoped recovery and potentially changing unrelated team data.
- P1 — Some advertised recovery states still render as non-actionable text. The remembered-workspace `catch` path calls `completeOperation(..., "Choose Workspace")` without a recovery action (`apps/sm-tool/src/App.tsx:4514-4519`), and all-team recalculation errors call `completeOperation(..., "Try again")` without one (`apps/sm-tool/src/App.tsx:4770-4775`). The status consequently renders a `<span>` instead of a keyboard-operable button for these failures (`apps/sm-tool/src/App.tsx:6854-6860`).
- P2 — Metrics-panel remembered-workspace `Open` buttons have no workspace-specific accessible name or `aria-describedby` (`apps/sm-tool/src/App.tsx:3364-3372`), unlike the other Open variants. The visible lock hint is present during busy state, but assistive technology receives only `Open`, without the workspace identity or phase-specific reason.
- P2 — Focused tests verify the helper’s recovery metadata only; they do not execute the App handlers or assert save/all-team/remembered-workspace dispatch, so the above wiring regressions were not caught. Browser interaction remains environment-unverified.

### Verified

- Recovery rendering now creates a real button when `recoveryAction` is set, and `handleOperationRecovery()` blocks actions unless the current operation is an error and no newer operation is active.
- Sidebar, metrics panel, empty state, workspace header, and remembered Open variants now render visible `Unavailable while [phase] is in progress.` hints while busy, with `aria-describedby` on the primary Choose/Switch controls.
- `AppOperation` operationId stale-completion protection remains intact; active status uses `role="status"`, `aria-live="polite"`, and `aria-busy`.
- No Teams/customer exports, cache files, `workspace.json`, or public assets were modified by this task. Existing dirty customer/workspace files remain out of scope.

### Validation

- Focused test: PASS — `tests/app-operation.test.ts`, 1 file / 3 tests.
- `npm run check`: PASS — typecheck, 28 test files / 139 tests, and production build.
- `git diff --check`: PASS.
- Existing non-blocking build warnings remain: `TeamDetail.tsx` has both dynamic and static imports, and the main bundle exceeds the warning threshold.
- Browser smoke was not run because the local environment cannot provide a reliable browser/File System Access session; real keyboard recovery and responsive interaction remain unverified.

### Required fixes

- Map team-settings save failure to a dedicated save retry action, or implement a save retry callback; it must not dispatch all-team recalculation.
- Add the correct recovery action to remembered-workspace catch and all-team recalculation error paths, or remove the recovery copy when no safe action exists. Ensure each displayed recovery button invokes the intended scoped operation.
- Add workspace identity and busy-phase accessible descriptions to the metrics-panel remembered Open buttons.
- Add executable App-level tests for each recovery path and dispatch mapping, including failed team save, remembered open failure, and all-team recalculation failure.

### Next step

Task 007 remains blocked. Developer remediation is required, followed by another QA review. No commit or push was performed.

## QA final re-review — recovery and workspace-control remediation

### Verdict

PASS WITH FOLLOW-UPS

### Verified

- Team-settings save failures now use the dedicated `retry-team-save` action. The retry callback retains the original team/entity or advanced-config save context and `handleOperationRecovery()` invokes that callback; it does not route save recovery to all-team recalculation (`apps/sm-tool/src/App.tsx:4527-4538,4659-4674,4828-4881`).
- Remembered-workspace failure paths and all-team recalculation failure paths now carry correctly mapped recovery actions. The global status renders a real keyboard-operable button for each actionable recovery; the handler is guarded to error state and current operation state (`apps/sm-tool/src/App.tsx:4516-4523,4775-4781,6854-6870`).
- Metrics-panel remembered Open controls now include the workspace name and busy phase in `aria-label`, reference the busy hint with `aria-describedby`, and render a visible phase-specific hint adjacent to the button. Sidebar, empty-state, workspace-header, and workspace-page remembered Open variants retain matching visible hints and descriptions (`apps/sm-tool/src/App.tsx:3342-3375,6851-6903,6922-6958`).
- `AppOperation` still keeps explicit phase/state/operationId; stale completion is ignored by ID and active status unlocks after matching success/error completion. Status remains one polite live region with `aria-busy` only for active operations.
- No Teams/customer exports, cache files, `workspace.json`, or public assets were modified by TASK 007; existing dirty customer/workspace files remain out of scope.

### Findings / follow-ups

- No P0/P1/P2 blocker found.
- P2 follow-up: focused tests cover operation helper and recovery metadata (3 tests), but do not mount App or execute every recovery handler/control variant. Add App-level fixtures for team-save, remembered-workspace, and all-team recovery dispatch plus disabled-control descriptions.
- Browser/File System Access smoke remains environment-unverified because this restricted environment cannot provide a reliable local browser session. Validate desktop/mobile keyboard recovery and responsive status layout when available.

### Validation

- Focused test: PASS — `tests/app-operation.test.ts`, 1 file / 3 tests.
- `npm run check`: PASS — typecheck, 28 test files / 139 tests, and production build.
- `git diff --check`: PASS.
- Existing non-blocking build warnings remain: `TeamDetail.tsx` has both dynamic and static imports, and the main bundle exceeds the warning threshold.

### Next step

Task 007 passes with follow-ups. The next task may begin. No commit or push was performed.
