# TASK 016 — Operation recovery UI

## Main status

`in-progress`

Owner: Main/ScrumMaster
Current stage: Designer
Scope lock: one structured operation-state recovery surface

## User objective

Give users truthful, recoverable UI for workspace load, permission restore, local helper update, recalculation, saves, and failures across supported and unsupported browsers.

## Architect handoff

Use one operation-state with visible phase/status and error taxonomy: denied/expired permission, read-only/corporate policy, missing/moved directory, locked/sync, unsupported browser, quota, serialization, and unknown. Open/Switch and remembered Open are disabled and not queueable during active operations. Preserve last-known data and use safe bounded recovery; no admin bypass or frontend/localStorage auth.

## Designer handoff

Complete: [docs/design/task-016.md](../design/task-016.md). Defines global recovery status, exact taxonomy copy/actions, workspace control lock explanations, last-known/stale/provenance/timestamps, Team/Scrum Master variants, redacted diagnostics, concurrency recovery, Windows Edge/macOS Chromium and manual fallback behavior, responsive/accessibility/200%/reduced-motion acceptance.

## Developer handoff

Blocked until Main routes the approved Designer handoff. Preserve Task 012–015 terminology, status configuration, Waiting Time %, Maintenance %, local-only boundaries, and pilot authorization controls.

## QA verdict

Not started. QA must independently verify operation phases, error taxonomy, bounded recovery, concurrency/stale completion, permission/browser paths, last-known data/timestamps, accessibility, responsive layout, and authorization/data safety.

## Open follow-ups

- Real OS watcher behavior, Jira/network lookup, admin bypass, and frontend/localStorage authorization remain out of scope.

## Developer implementation evidence

- Extended the existing structured operation model with the approved safe error taxonomy, redacted operation correlation reference, retry metadata, last-known/stale flags, and bounded recovery actions for permission, policy, directory, sync/lock, unsupported browser, quota, serialization, and unknown failures.
- Routed workspace open/remembered-open, local team/all-team recalculation, and team-settings save failures through safe classified messages and operation-id guarded completion; unsupported browsers now expose the existing manual-import route.
- Added executable taxonomy/redaction/recovery fixtures. No Jira/network/token/admin path, customer/workspace data, or authorization boundary was changed.

## Developer remediation evidence

- Added active-operation guards across workspace selection, remembered-open, selected/all-team recalculation and team settings save so conflicting requests are rejected with a phase-specific message; existing operation IDs still guard stale completion/finally paths.
- Added stable double-read input verification, per-directory serialized writes, read-back equality verification, and one bounded retry to the browser workspace JSON write layer. Failed writes surface as failures and do not claim success.
- Replaced client-side pilot PIN/session persistence and local PIN authentication with a server-issued `/api/pilot-access` session. Durable Object policy writes require `PILOT_OPERATOR_TOKEN`; missing policy data defaults to deny, and admin UI requires the server-issued `pilot:manage` capability.
- Added executable tests for server-session denial, no localStorage auth keys, policy-write default-deny, operation recovery taxonomy/redaction, and existing stale-operation behavior.

## QA verdict

`FAIL`

Independent review evidence (2026-09-04):

- Focused validation passed: `tests/app-operation.test.ts`, workspace, helper-reinstall and import-monitor suites: 4 files / 14 tests. Full `npm run check` passed typecheck, 34 test files / 191 tests, and production build. `git diff --check` passed.
- The new taxonomy utility is redacted at its returned user message and provides operation references (`apps/sm-tool/src/lib/app-operation.ts:59-90`), and stale completion is unit-tested (`tests/app-operation.test.ts:13-21`). The rendered status has a live region, `aria-busy`, phase, recovery button, and responsive wrapping (`apps/sm-tool/src/App.tsx:7114-7137`, `apps/sm-tool/src/styles.css:164-246`).
- **P1 — core operation/concurrency contract is incomplete.** `beginOperation` unconditionally replaces the current active operation and has no busy/mutex/duplicate guard (`apps/sm-tool/src/App.tsx:1616-1622`). Only selected-team recalculation has a separate guard; workspace open, remembered open, all-team recalculation, and several save flows can start while another operation is active. The requested single structured state/latest-wins concurrency-safe coordinator is therefore not enforced, and stale operations can continue mutating workspace/UI after being superseded.
- **P1 — required operation coverage and filesystem safety are not implemented.** The new phases `Checking workspace`, `Waiting for stable files`, `Writing local data`, and `Reading back local data` are type labels only (`apps/sm-tool/src/lib/app-operation.ts:1-13`); no stable-read, atomic write, read-back verification, bounded retry counter, or permission re-check-after-resume path was added to `workspace.ts`. `saveWorkspaceConfig`, `saveTeamConfig`, and progress/bottleneck writes still call the existing direct writer, while several handlers use legacy `setBusy` or no operation at all (for example `apps/sm-tool/src/App.tsx:5065-5098`). This fails the acceptance requirement that load/permission/helper/recalculate/save share the operation contract and that success follows verified read-back.
- **P1 — pilot authorization remains client/localStorage based.** `pilotPins` and `pilotSession` are persisted in browser localStorage (`apps/sm-tool/src/App.tsx:1774-1792`), and the admin surface is gated by the locally derived session (`apps/sm-tool/src/App.tsx:7081-7089`). This conflicts directly with the approved “no frontend/localStorage auth/admin bypass; server-side policy or explicit operator enablement” requirement. It is a security blocker even if pre-existing, because Task 016 explicitly requires preserving a compliant authorization boundary.
- **P2 — failure taxonomy/action routing is not consistently truthful.** A failed new workspace picker is classified as `recheck-permission`, but has no remembered workspace ID, so the recovery handler calls `handleOpenRememberedWorkspace("")` rather than offering the required Choose workspace path (`apps/sm-tool/src/App.tsx:4616-4621`, `4674-4686`). Several handlers hard-code recovery actions instead of using the classifier’s action (for example selected-team/all-team/save paths), and the classifier uses broad substring matching with no structured filesystem error source.
- Browser/File System Access smoke was not run in this environment; source inspection and automated tests were used. This is an environment limitation, not a substitute for the failed core contracts.

Required remediation: implement one guarded coordinator/mutex with operation-scoped transitions for every listed operation, stable-read/write/read-back and bounded recovery in the workspace layer, preserve context/last-known metadata through those transitions, correct recovery action/context routing, and replace the client/localStorage pilot gate with the approved server-side or explicit operator-controlled authorization before re-review.

## QA re-review verdict

`FAIL`

Independent remediation re-review (2026-09-04):

- Focused suites passed: 6 files / 20 tests, including operation, pilot access, worker policy/cache, workspace, helper reinstall and import monitor. Full `npm run check` passed typecheck, 35 test files / 194 tests, and build. `git diff --check` passed.
- Server-side pilot login and operator-token protection for Worker `PUT` are present (`apps/sm-tool/src/lib/pilot-access.ts:11-26`, `cloudflare-worker.mjs:104-112`), and the former App localStorage auth keys were removed. The workspace layer now has double-read input checking, per-directory write serialization, read-back equality, and one retry (`apps/sm-tool/src/lib/workspace.ts:76-87,1630-1663`).
- **P1 — operation coordinator still does not provide the required concurrency contract.** `beginOperation()` still unconditionally replaces the current operation (`apps/sm-tool/src/App.tsx:1538-1545`). Guards are present on workspace open, remembered-open, selected-team/all-team recalculate and the main advanced save, but legacy `setBusy(true)` paths such as create-team and bug/team/import/template/bottleneck saves have no entry guard and overwrite the shared operation. `persistWorkspaceProfiles` also performs workspace writes without an operation transition. This is not a single coordinator that rejects/coalesces every workspace/team operation.
- **P1 — writes are not non-destructive/atomic.** `writeJsonFile()` opens the destination directly with `createWritable()`, writes/truncates it, then verifies afterward (`apps/sm-tool/src/lib/workspace.ts:1649-1654`). If write, close, or read-back fails, an existing `workspace.json`, `team.json`, cache or manual file can already be partially/fully replaced before the bounded retry. Read-back verification detects corruption but cannot preserve the prior value. The handoff explicitly requires serialized, non-destructive/atomic writes and last-known preservation.
- **P1 — operator policy management is not actually wired to the server.** `cloudflare-worker.mjs` protects `PUT` with `PILOT_OPERATOR_TOKEN`, but the App’s admin handlers only update local React state; there is no authenticated `PUT` from the admin UI. The remaining `apps/sm-tool/public/pilot-access-sync.js` attempts unauthenticated `PUT` and is rejected by the Worker. Thus server default-deny is present, but named capability-based policy writes cannot be completed through the shipped UI.
- **P2 — required operation phases/metadata remain mostly declarative.** The new checking/stability/writing/read-back/paused phases exist in the type, but workspace write/read functions cannot update the App operation state, retry count is never populated, and permission is not rechecked after visibility/resume for all mutation paths. The status UI is accessible and recovery copy is redacted, but it cannot truthfully expose those transitions.
- Browser/File System Access smoke was not run because this environment has no usable local-folder browser harness; this remains an environment follow-up, not the reason for FAIL.

Required next step: Developer must complete the coordinator coverage and atomic/non-destructive write boundary, wire operator-protected policy writes (or remove unsupported admin editing UI), and add executable tests for concurrent handler rejection, failed-write preservation, operation phases/retry metadata and policy-write authorization. Next task remains blocked pending another QA re-review.

## QA remediation re-review 2

`FAIL`

Independent re-review (2026-09-04):

- Focused and full validation passed: focused suites 6 files / 20 tests; `npm run check` 35 test files / 194 tests, typecheck and build; `git diff --check` passed.
- **P1 — required single coordinator coverage is still incomplete.** `beginOperation()` remains an unconditional replacement (`apps/sm-tool/src/App.tsx:1538-1545`). Main workspace/recalculate/save handlers have guards, but create-team and multiple legacy `setBusy(true)` save handlers still bypass an active-operation rejection/coalescing guard (`apps/sm-tool/src/App.tsx:1561-1567,4610,4853,4967,5089`); profile persistence still calls `saveWorkspaceConfig()` without an operation transition (`apps/sm-tool/src/App.tsx:4241-4279`).
- **P1 — failed writes can still destroy the prior destination.** The write mutex/retry/read-back are present, but `createWritable()` targets the real file directly (`apps/sm-tool/src/lib/workspace.ts:1643-1663`). A failure may truncate or partially replace the prior file before verification. No sibling temporary file plus verified replacement/rollback exists, so non-destructive failed-write preservation is not met.
- **P1 — operator policy writes are not shipped end-to-end.** Worker `PUT` requires `PILOT_OPERATOR_TOKEN`, but the admin UI only changes React state and does not issue an authenticated `PUT`; the remaining public sync script issues unauthenticated `PUT` and is rejected. Default-deny/server login exist, but policy management cannot be completed through the shipped UI.
- **P2 — phases and retry metadata are not truthful end-to-end.** Checking/stability/writing/read-back/paused remain type labels; the workspace layer cannot transition the App operation and `retryCount` is never populated. Existing live-region/aria-busy and redacted error copy are present.
- File System Access browser smoke was unavailable in this environment and is recorded separately from the source-level blockers.

Next step: FAIL continues to block progression. Developer must complete coordinator coverage, sibling-temp atomic writes with failed-write preservation tests, and authenticated operator policy management or remove unsupported editing UI, then request a new independent QA review.

## Developer remediation 3 evidence (2026-09-04)

- `apps/sm-tool/src/App.tsx:1525-1557` now rejects a second active operation (`beginOperation` returns `null`), guards completion/update by operation ID, exposes a shared failure classifier path, and increments retry metadata through `nextRetryCount` (`apps/sm-tool/src/lib/app-operation.ts`). All listed create/save/recalculate entry points use `beginOperation`; workspace-profile persistence owns or reuses the active operation and explicitly transitions through writing and read-back phases (`apps/sm-tool/src/App.tsx:4245-4277`). No `setBusy(` call remains in the App source.
- `apps/sm-tool/src/lib/workspace.ts:76-89,1644-1740` now serializes per-directory writes, writes a sibling temporary file, performs stable read-back verification before replacement, moves an existing destination to a temporary backup, restores it on replacement failure, and cleans temporary artifacts. New destinations are also created by verified temp-file move. Direct destination `createWritable()` is no longer used by `writeJsonFile`.
- Unsupported `apps/sm-tool/public/pilot-access-sync.js` is removed and its `apps/sm-tool/index.html` reference is absent. The executable pilot-access tests verify the asset is not shipped; server-side session/policy authorization remains covered by `tests/pilot-access.test.ts` and `tests/cloudflare-worker-cache.test.ts`.
- Added executable coordinator/source coverage in `tests/app-operation.test.ts` for all mutating entry points, retry monotonicity, no legacy busy bypass, and removed sync asset. Added browser-handle fixtures in `tests/workspace.test.ts` proving failed temporary close leaves existing JSON unchanged and successful replacement cleans temp/backup artifacts.
- Validation: focused operation/workspace/pilot/worker suites passed (19 tests); full `npm run check` passed typecheck, 35 test files / 198 tests, and production build; `git diff --check` passed. Build emitted only existing Vite chunk-size and dynamic-import warnings. Windows/browser File System Access execution remains an environment follow-up and was not claimed here.

## QA remediation re-review 5

`FAIL`

Independent re-review (2026-09-04):

- Focused suites passed: 4 files / 21 tests. Full `npm run check` passed typecheck, 35 test files / 200 tests and build. `git diff --check` passed.
- The latest remediation removes `setBusy`, adds active-operation rejection, routes both workspace persistence helpers through operation phases, adds sibling temp/backup/read-back/rollback with bounded retry, maps the atomic-move capability gap to unsupported/manual recovery, and removes the unauthenticated `pilot-access-sync.js` asset. Focused tests cover these source contracts and injected temporary close/read failures.
- **P1 — operation phase coverage is still not complete.** Selected-team/all-team recalculation and the direct team save handlers enter the coordinator, but none transitions through `Writing local data` / `Reading back local data`; only workspace profile/metric persistence does. The shared state therefore reports “Recalculating” or “Saving team” until completion and cannot truthfully represent the requested write/read-back lifecycle for those mutations (`apps/sm-tool/src/App.tsx:3057-3110,4595-4620,4803-4859,4887-5047`).
- **P1 — new-workspace permission recovery is still misrouted.** `handlePickWorkspace()` classifies a denied picker through `classifyOperationFailure`, which returns `recheck-permission` but does not set `recoveryWorkspaceId`; the recovery handler then calls `handleOpenRememberedWorkspace("")` instead of Choose Workspace/manual recovery (`apps/sm-tool/src/App.tsx:4361-4389,4447-4460`, `apps/sm-tool/src/lib/app-operation.ts:63-65`). This is a real user-facing recovery failure.
- **P2 — atomic move support remains capability-dependent and unverified in target browsers.** The fallback is now classified truthfully as unsupported/manual, but no production capability probe or browser matrix confirms `FileSystemFileHandle.move()` availability; no browser smoke was possible here. Treat unsupported paths as manual-only until verified.
- No customer/workspace data was intentionally changed; existing dirty `Teams/**`, `workspace.json` and cache files remain outside this review. Browser/File System Access smoke was unavailable.

Required next step: FAIL remains blocking. Add truthful write/read-back transitions to all recalculation/team-save mutation paths, fix new-picker denial to Choose Workspace, and run supported Chromium/Edge/macOS capability smoke before requesting another QA review.

## QA remediation re-review 4

`FAIL`

Independent re-review (2026-09-04):

- Focused suites passed: 4 files / 20 tests. Full `npm run check` passed typecheck, 35 test files / 199 tests and build. `git diff --check` passed.
- The coordinator now rejects active operations, direct save handlers use `beginOperation`, profile persistence owns/joins operation state, and sibling temp/backup/read-back/rollback logic is present. The unauthenticated sync asset is deleted and source tests assert this.
- **P1 — workspace metric configuration persistence still bypasses the coordinator.** `persistWorkspaceMetricConfig()` directly calls `saveWorkspaceConfig()` without `beginOperation`, phase transitions, classification, completion or stale guard (`apps/sm-tool/src/App.tsx:4279-4296`). Its callers are active workspace metric save flows, so the stated “all save/persist paths” contract is not met.
- **P1 — unsupported atomic-move behavior is not mapped truthfully.** `writeJsonFile()` requires `FileSystemFileHandle.move()` for temp and destination replacement (`apps/sm-tool/src/lib/workspace.ts:1694-1722`). If that capability is absent, it throws “atomic local file replacement is not supported by this browser”, but the failure classifier does not match “not supported” and returns generic unknown/retry rather than unsupported-browser/manual fallback (`apps/sm-tool/src/lib/app-operation.ts:63-90`). Browser support therefore remains unverified and the fallback state is misleading.
- **P2 — policy session lifecycle/admin capability is incomplete.** Login receives a server-issued session ID, capabilities and expiry, but the client does not validate expiry/revocation or present a session credential for later policy operations. The admin UI has no authenticated policy write path; capability is effectively display-only.
- Existing dirty `Teams/**`, `workspace.json`, and cache files were preserved and excluded. Browser/File System Access smoke was unavailable in this environment.

Next step: FAIL remains blocking. Route metric-config persistence through the coordinator, add the actual supported-move capability/fallback contract and tests, and either implement authenticated/revocable policy management or remove unsupported admin editing UI. Then request another independent QA review.

## Developer remediation 5 evidence (2026-09-04)

- `apps/sm-tool/src/App.tsx:4281-4325` routes `persistWorkspaceMetricConfig` through the shared coordinator, with duplicate-operation reuse/rejection, `Writing local data` and `Reading back local data` transitions, classified redacted failure recovery, operation-id guarded completion, and unchanged last-known settings on failure.
- `apps/sm-tool/src/lib/app-operation.ts:65-69` classifies the atomic-replacement capability error as `unsupported-browser` with `manual-import`. `apps/sm-tool/src/lib/workspace.ts:1694-1719` never falls back to direct destination writes when movable-file replacement is unavailable.
- The unsupported client management surface is removed from `apps/sm-tool/src/App.tsx`: the `admin` route/nav/render path and `canManagePilotAccess` capability gate are absent. The remaining pilot entry is access-only with an in-memory server-issued session; no frontend/localStorage policy authorization or policy-management claim is shipped. `tests/app-operation.test.ts:115-135` asserts this boundary and the removed public sync asset.
- `tests/app-operation.test.ts:75-114` covers coordinator entry-point wiring and metric-config phase transitions; `tests/workspace.test.ts:230-278` covers close/read-back failures preserving the original destination and successful replacement cleanup.
- Validation: focused suites passed (4 files / 21 tests); full `npm run check` passed typecheck, 35 test files / 200 tests, and production build; `git diff --check` passed. No version bump, commit, push, deploy, or customer/workspace data changes were made.

## Developer remediation 6 evidence (2026-09-04)

- All remaining App write paths now publish explicit lifecycle transitions immediately around local mutation: selected-team recalculation (`apps/sm-tool/src/App.tsx:3069-3091`), all-team progress writes (`:4695-4710`), team/entity/config saves (`:4601-4604,4855-4862,4900-4907`), bottleneck writes (`:5025-5029,5053-5057`), flow-template and exclusion/SLE writes (`:5156-5162,5195-5201,5254-5262,5301-5309,5340-5348,5412-5420`). Read-back phase precedes refreshed data application; final completion remains operationId guarded.
- New picker failures in `handlePickWorkspace` (`apps/sm-tool/src/App.tsx:4385-4397`) now recover with `Choose Workspace` (or `Manual import` for unsupported browsers), never `Re-check permission` without a remembered workspace. Recovery dispatch (`:4458-4468`) requires a non-empty remembered workspace ID before permission recheck and otherwise falls back to the picker.
- `tests/app-operation.test.ts:75-125` includes executable source assertions for recalculation/save phase wiring and picker/remembered recovery separation. Existing workspace fixtures continue to prove failed temp close/read-back preserves prior content.
- Validation: `npm run check` passed typecheck, 35 test files / 200 tests, and production build; focused operation/workspace tests passed (15 tests); `git diff --check` passed. No version bump, commit, push, deploy, or customer/workspace data changes were made.

## QA remediation re-review 6

`PASS WITH FOLLOW-UPS`

Independent re-review (2026-09-04):

- Focused suites passed: 4 files / 21 tests. Full `npm run check` passed typecheck, 35 test files / 200 tests and production build. `git diff --check` passed.
- All inspected App mutation paths now enter the guarded coordinator; no `setBusy` bypass remains. `beginOperation()` rejects active duplicates, operation-ID guards completion/update, retry metadata is bounded/monotonic, and local recalc/save/profile/helper/load paths publish write and read-back phases. Fresh picker denial now maps to Choose Workspace/manual; permission re-check is only dispatched with a non-empty remembered workspace ID.
- `writeJsonFile()` uses sibling temp and backup handles, stable double-read, verified move, rollback, cleanup and a bounded two-attempt retry. The injected temp close/read-back failures preserve the exact prior destination. Missing move capability is explicitly classified as unsupported browser/manual import; no direct destination write fallback exists in this path.
- `pilot-access-sync.js` is deleted and not referenced by `index.html`; the client has no policy/admin editor or localStorage auth boundary. Worker policy is default-deny, server-issued sessions carry capabilities and expiry, active/expiry checks gate login, and policy `PUT` requires `PILOT_OPERATOR_TOKEN`.
- Source review found the required live status/`aria-busy`, recovery actions, stale/last-known flags and existing Task 012–015 metric/status/formula/provenance boundaries intact. No customer/workspace data changes were introduced by the reviewed implementation.

Open follow-ups (non-blocking):

- Run real File System Access smoke in supported Chromium/Edge on Windows and Chromium on macOS, including `move()` capability, permission denial/regrant, moved/read-only/sync-locked workspaces, and verify displayed stale/timestamps/provenance in each state. This environment has no usable browser/File System Access harness.
- Keep operator-side policy audit, expiry and revocation checks in deployment validation; the shipped client intentionally has no unsupported policy editor.

Next step: Task 016 may proceed to the next task. QA did not bump version, commit, push or deploy.

## Release QA v0.5.11

`PASS`

Independent release verification (2026-09-04):

- Root `package.json`, root `package-lock.json`, app `apps/sm-tool/package.json` and app `apps/sm-tool/package-lock.json` all report `0.5.11`; both lockfile root package entries also report `0.5.11`.
- The four release-file diffs contain version-only hunks. A structural comparison against HEAD after removing version fields reported dependency and manifest structure unchanged for all four files.
- Approved TASK 016 implementation remains present: guarded operation coordinator, atomic sibling temp/backup/read-back write path, unsupported/manual fallback classification, and no shipped `pilot-access-sync.js` or client admin editor. No release hunk changes these behaviors.
- Validation passed: `npm run check` completed typecheck, 35 test files / 200 tests and production build; `git diff --check` passed.
- Existing dirty `Teams/**`, `teams/**`, `workspace.json`, cache/import/customer files and the previously approved TASK 016 implementation files are outside the version-only release delta and were not modified by QA. No token files were added.

Next step: release version 0.5.11 passes QA and may proceed to Main’s release workflow. QA did not commit, push or deploy.
