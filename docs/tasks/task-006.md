# TASK 006 — Automatic import change detection and local recalculate

## Main status

`in-progress`

Owner: Main/ScrumMaster
Current stage: Designer
Scope lock: selected-team polling, local-only recalculate

## User objective

Automatically detect new/changed/deleted selected-team CSV imports and locally recalculate through the existing analysis path, without Jira/network/token/admin flows.

## Architect handoff

See `docs/architecture/task-006.md`. Polling is deliberately bounded and best-effort because browser file handles do not offer portable reliable change events.

## Designer handoff

Complete: [docs/design/task-006.md](../design/task-006.md). Defines the compact Team and diagnostic Scrum Master data-status panel, exact detection/stability/recalculation/error/permission/unsupported copy, timestamp and stale semantics, manual fallback, sync edge cases, accessibility, responsive behavior, and Developer/QA acceptance criteria.

## Developer handoff

Blocked until Designer handoff is complete. Preserve local-only behavior, existing cache path, and no-customer-data boundary.

## QA verdict

Not started. QA must independently verify stability, selected-team scope, concurrency, permission lifecycle, timestamps, failure behavior, accessibility, and data safety.

## Open follow-ups

- Real-time OS/file-system events and background watching remain out of scope; polling is intentionally best-effort within browser File System Access limits.

## Developer implementation notes

### Implemented

- Added an in-memory selected-team CSV manifest with normalized relative paths, size, modified time, SHA-256 digest when Web Crypto is available, and ready/unstable/unavailable read states. Cache and progress files are not scanned.
- Added bounded 30-second polling only while a workspace/team handle is open, read-permitted, the document is visible, and session auto-update is not paused. Visibility and focus trigger one immediate non-overlapping scan; lifecycle cleanup stops polling on team/workspace change.
- Added a two-consecutive-stable-scan gate with a one-second debounce. New, changed, deleted, and renamed files are aggregated without displaying names, paths, hashes, or CSV content. Zero-byte, locked, unavailable, and still-changing files cannot trigger analysis.
- Reused the existing local `analyzeTeam` path for automatic and manual recalculation. A shared in-memory active-run guard and one queued automatic follow-up prevent duplicate/overlapping selected-team runs. Success commits the observed manifest baseline; failure keeps last-known metrics and shows retry guidance.
- Extended the existing Data status panel with compact Team status and diagnostic Scrum Master counts/stability detail, session-only Pause/Resume, permission/unsupported fallback, accessible live status, and a Cycle Time pending notice. Last data update excludes unusable/zero-row imports; Last calculated remains sourced from `metrics.generatedAt`.
- Added executable monitor fixtures for normalized fingerprints, baseline/lifecycle, changed and renamed/deleted files, two-scan/debounce stability, unusable-file deferral, baseline commit/no-loop, and empty/watching/permission/failure presentation states.

### Validation

- Focused tests: PASS — 10 tests across import-monitor, TASK 005, and executive flow fixtures.
- `npm run check`: PASS — 27 test files / 136 tests, typecheck, and production build.
- `git diff --check`: PASS.
- Existing non-blocking build warnings remain: `TeamDetail.tsx` has both dynamic and static imports, and the main bundle exceeds the warning threshold.

### QA handoff

QA must independently verify browser File System Access polling with real fixture files, two-scan/debounce behavior for sync changes, cache-write exclusion, workspace/team lifecycle cleanup, permission loss/recovery, manual/automatic concurrency, timestamp freshness, Team versus Scrum Master states, live announcements, keyboard/focus order, responsive stacking, and absence of Jira/token/network/admin paths. No commit or push was performed.

## Developer implementation notes

### Implemented

- Added an in-memory selected-team CSV manifest with normalized relative paths, size, modified time, SHA-256 digest when the browser provides Web Crypto, and safe ready/unstable/unavailable states. Cache and progress files are outside this manifest.
- Added bounded 30-second polling while the workspace is open, selected-team access is permitted, the document is visible, and session auto-update is not paused. Visibility and focus trigger one immediate non-overlapping scan; cleanup stops timers/listeners on team or workspace change.
- Added a two-consecutive-stable-scan gate. New, changed, deleted, and renamed files are aggregated without exposing names or paths; zero-byte, locked, unavailable, or still-changing files remain in stability wait and cannot trigger analysis.
- Shared the existing local `analyzeTeam` path with manual recalculation through a per-session mutex, generation guard, and one queued automatic follow-up. Successful analysis advances the in-memory baseline; failures retain the existing team metrics and expose retry guidance.
- Extended the existing Data status panel with compact Team status and diagnostic Scrum Master counts/stability detail plus session-only Pause/Resume, permission/unsupported fallback, accessible live status, and Cycle Time pending notice. `Last data update` ignores unusable/zero-row imports; `Last calculated` remains sourced from `metrics.generatedAt`.
- Added executable monitor lifecycle and presentation fixtures covering fingerprints, baseline, stable gate, partial/locked deferral, additions/removals/renames, baseline commit, empty/watching/permission/failure copy, and existing selected-team recalculate behavior.

### Validation

- Focused tests: PASS — 10 tests across monitor, TASK 005, and executive flow fixtures.
- `npm run check`: PASS — 27 test files / 136 tests, typecheck, and production build.
- `git diff --check`: PASS.
- Existing non-blocking build warnings remain: `TeamDetail.tsx` dynamic import is also static and the main bundle exceeds the warning threshold.

### QA handoff

QA must independently verify browser File System Access polling with real selected-team fixture files, two-scan stability under OneDrive/network-like changes, no cache-write loops, team/workspace lifecycle cleanup, permission loss/recovery, manual/automatic concurrency, timestamp freshness, Team versus Scrum Master copy, live announcements, keyboard use, responsive stacking, and no Jira/token/network/admin path. No commit or push was performed.

## QA review — independent automatic import change detection

### Verdict

PASS WITH FOLLOW-UPS

### Verified behavior

- `scanTeamImportManifest()` recursively scans only the selected team's `imports` directory, normalizes relative paths, captures size/mtime and optional SHA-256 digest, marks zero-byte/locked reads unstable or unavailable, and excludes cache/progress files by construction. Manifest comparison detects additions, changes, removals, and rename effects as aggregate added/removed changes without persisting content, names, hashes, or watcher state.
- The App lifecycle creates a bounded 30-second interval only when workspace/team handles and File System Access support exist; scans require visible document state, read permission, and no overlapping scan. Focus/visibility handlers trigger an immediate scan, cleanup cancels the lifecycle and timer, and generation checks suppress stale results after team/workspace changes.
- The pure monitor gate requires two equal usable scans separated by the one-second debounce before analysis. Unusable entries defer the gate. Baseline/team initialization does not recalculate; successful analysis commits a baseline and cache writes do not enter the imports manifest.
- Automatic and manual paths use the existing local `analyzeTeam` flow. The active-run ref plus queued automatic manifest provide mutex/generation protection and at most one follow-up; failures preserve existing metrics and expose retry guidance. No Jira, network, token, admin, source-file copy/delete/overwrite, or persistence path was added.
- Data status keeps `Last data update` based on valid non-empty imported files distinct from `Last calculated` based on `metrics.generatedAt`; stale, detecting, stability, recalculating, success, error, permission, unsupported, paused, no-import, and no-metrics text states are represented. Team copy is compact; Scrum Master exposes aggregate counts/stability detail and Pause/Resume. The Cycle Time pending notice, live region, labels, disabled/busy buttons, and mobile stacking remain present.
- Existing TASK 005 route/period/tab/mode behavior, TASK 004 trust UI, formulas, P85/SLE and working-day semantics, hidden legacy subtree, and customer/workspace boundaries remain intact in the reviewed scope. Dirty `Teams/**` and workspace files are pre-existing and were not modified by QA.

### Findings

- No P0/P1/P2 blocker found.

### Validation

- Focused `npm test -- --run tests/import-monitor.test.ts tests/task-005.test.ts tests/executive-flow-time.test.ts tests/workspace.test.ts`: PASS, 4 files / 15 tests.
- `npm run check`: PASS, typecheck, 27 test files / 136 tests, and production build.
- `git diff --check`: PASS.
- Browser/File System Access smoke attempted, but Vite could not bind localhost in this restricted environment (`listen EPERM ::1:5173`). Real fixture-file permission, visibility, and desktop/mobile interaction smoke remains environment-unverified.
- Existing non-blocking build warnings remain: `TeamDetail.tsx` is both dynamically and statically imported, and the main bundle exceeds the warning threshold.

### Follow-up

- When a browser-capable environment is available, perform real selected-team file add/change/delete/rename and permission-loss recovery smoke at desktop/mobile widths, including live announcement and pause/resume focus checks.

### Next step

Task 006 is closed with follow-ups. The next task may begin.

## Release QA — version 0.5.0

### Verdict

PASS

### Evidence

- Root `package.json` and `package-lock.json` are `0.5.0`; app `apps/sm-tool/package.json` and `apps/sm-tool/package-lock.json` are also `0.5.0`. Both lockfiles have the root package entry `packages[""].version` set to `0.5.0`.
- The four release files contain only version changes: package manifests change `0.4.0` to `0.5.0`, and each lockfile changes only its top-level and root-package version entries. Dependency structure is unchanged.
- No `apps/sm-tool/public` file changed in the release diff. No `Teams/**` or `workspace.json` change is part of this version bump; existing dirty customer/workspace files remain out of scope and were not modified by QA.
- `npm run check`: PASS — typecheck, 27 test files / 136 tests, and production build.
- `git diff --check`: PASS.
- Existing non-blocking build warnings remain unchanged: the `TeamDetail.tsx` dynamic/static import warning and the large main bundle warning.

### Next step

The 0.5.0 release bump is QA-approved. The next task may begin. No commit or push was performed.
