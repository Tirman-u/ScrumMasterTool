# TASK 001 — README Windows/macOS Jira refresh support

## Main status

`PASS WITH FOLLOW-UPS`

Owner: Main/ScrumMaster  
Current stage: Main — closed after QA verdict  
Scope lock: approved for documentation-only implementation

## User objective

Document Jira refresh support for macOS and Windows while retaining the direct CLI fallback.

## Architect handoff

See [`docs/architecture/task-001.md`](../architecture/task-001.md).

Decision: the generator already creates both `renew-team.command` and `renew-team.ps1`. Only README clarification is required in the developer scope, especially a Windows PowerShell CLI fallback example.

## Designer handoff

Not required. This task does not affect UI or Figma.

## Developer handoff

Implemented in `README.md`. The README now clarifies that the generator owns both `renew-team.command` and `renew-team.ps1`, documents Windows PowerShell `$env:` variables and `npm.cmd`, explains backtick line continuation, and retains the macOS/POSIX and Windows execution-policy fallback instructions.

### Files changed

- `README.md` — Jira refresh documentation only.
- `docs/tasks/task-001.md` — this implementation and QA handoff record.

### Validation

- `npm run check` — passed: root and UI typechecks, 17 test files / 113 tests, and production build.
- `git diff --check` — passed.
- README review — examples use placeholders only; no credentials, real Jira URLs, issue keys, team names, JQL, CSV contents, cache data, or workspace data were added.
- Scope review — no application code, helper implementation, generator logic, UI/Figma files, tests, or workspace data were changed for the implementation.

### Known limitations

- The working tree contains pre-existing changes, including a pre-existing broad README diff and workspace/cache changes. These were preserved and are outside this task’s implementation.
- The Vite build reports an existing chunk-size warning; the build still succeeds.

### QA handoff

QA should independently verify the README examples against `src/generate-renew-launchers.ts`, confirm the macOS and Windows helper names, inspect the Windows PowerShell continuation and execution-policy guidance, and confirm that only the approved documentation scope changed. The task remains open pending QA verdict in this record and Main/ScrumMaster.

## QA verdict

### PASS WITH FOLLOW-UPS

Independent review completed against the approved documentation-only scope.

#### Findings

- No P0/P1/P2 blockers found for TASK 001.
- README examples use placeholders only (`jira.company.net`, `yourname`, `your-token`, `user@example.com`); no credentials, issue keys, customer team names, CSV contents, or cache data were added.
- README documents both helper names and explicitly attributes ownership to `npm run generate:renew-launchers`.
- macOS/POSIX instructions use `zsh`, POSIX environment variable syntax, and `renew-team.command` consistently.
- Windows instructions use PowerShell `$env:` syntax, `renew-team.ps1`, `npm.cmd`, correct backtick continuation guidance, and an execution-policy bypass fallback.
- The tracked diff for the task is limited to `README.md`; application code, generator/helper implementation, tests, UI/Figma, and workspace/cache data were not changed by the task implementation. Existing broad worktree changes were preserved as documented in the handoff.

#### Evidence and checks

- `npm run check` — PASS: 17 test files, 113 tests, root/UI typechecks, and production build.
- `git diff --check` — PASS.
- `zsh -n renew-team.command` — PASS.
- Generator/helper inspection — `src/generate-renew-launchers.ts` owns both `renew-team.command` and `renew-team.ps1`; the checked helper names and workspace/repository environment variables match the README.
- PowerShell runtime smoke test — not available on this macOS host; syntax and command structure were reviewed statically.

#### Follow-ups

- Add a cross-platform helper smoke-test task on Windows PowerShell when available.
- Decide separately whether generated Windows helper invocations should use `npm.cmd` explicitly; this is outside TASK 001's approved README-only scope.

**Final verdict: PASS WITH FOLLOW-UPS.** The task is closed; the next task may begin.

## Open follow-ups

- Decide whether to add `npm.cmd` as a Windows CLI fallback variant.
- Consider a separate cross-platform helper smoke-test task.

## QA follow-up — workspace installer change

Review scope: `apps/sm-tool/public/workspace-bootstrap.js`,
`apps/sm-tool/public/workspace-installer-v2.js`, and
`apps/sm-tool/public/workspace-installer-v3.js`.

### Verdict

`FAIL`

### Findings

- **P1 — v3 installer fails before writing any helper.** In
  `apps/sm-tool/public/workspace-installer-v3.js:76`, `durationFormatter` is
  an outer template literal containing unescaped `${wholeDays}`, `${hours}`,
  and `${minutes}`. Calling the exposed v3 install function therefore throws
  `ReferenceError: wholeDays is not defined` while `patchRunner()` runs. The
  subsequent writes at lines 183–185 are never reached. `index.html` loads v3
  after v2, so the effective picker install path is blocked even though v2
  alone can write the files.

### Evidence and checks

- Read-only mocked File System Access test: v2 wrote root
  `renew-team.command`, root `renew-team.ps1`, and `sm-tool/jira-pull.mjs`;
  v3 threw the ReferenceError before writing.
- `LAUNCHER_CONTENT` decoded content is exactly equal to the HEAD version
  (4155 bytes), so the macOS helper remains unchanged.
- `WINDOWS_LAUNCHER_CONTENT` decoded successfully (5127 bytes); PowerShell
  stop mode, SecureString token input, BSTR zeroing, backtick continuations,
  Jira pull/analyze commands, and placeholder Jira URL were present.
- v2 and v3 source syntax compilation passed, but this did not exercise the
  runtime interpolation failure.
- `npm run check` passed: 19 test files / 117 tests, typechecks, and
  production build. `git diff --check` passed. The build emitted only the
  existing chunk-size warning.
- The target diff is limited to the three approved installer files. Existing
  `Teams/**` and `workspace.json` changes are outside this target diff and
  were preserved; no Cloudflare files are in the target diff.

### Required fix

Developer must escape the nested duration-format placeholders (or construct
the string without nested template interpolation), then rerun the mocked v2/v3
install test and full validation. Confirm all three files are written through
the effective v3 path before resubmitting to QA.

**Current task status: blocked. Next task may not begin until Developer
remediation and a new QA review.**

## QA re-review — bundled-runner remediation

### Verdict

`PASS`

### Evidence

- macOS helper now initializes `SELECTED_IDS=()` and appends each validated
  `TEAM_ID` before invoking `node "$RUNNER" "$WORKSPACE_DIR"
  "${SELECTED_IDS[@]}"`.
- The macOS runner is workspace-local at
  `$SCRIPT_DIR/sm-tool/jira-pull.mjs`; neither macOS nor Windows payloads
  retain `SM_TOOL_REPO_DIR`, repo-path prompting, or `npm --prefix` in the
  normal flow.
- Windows invokes `node $Runner $WorkspaceDir @SelectedTeamIds` and retains
  SecureString token handling. Both helpers document the Recalculate next
  step.
- Focused mocked installer test passed: 1 test file / 1 test, including the
  macOS selected-ID assertions.
- `node --check` passed for workspace bootstrap and both installer scripts.
- `npm run check` passed: 21 test files / 119 tests, typechecks, and
  production build. `git diff --check` passed.
- Scope review found no new Teams/workspace data changes; existing data
  changes were preserved.

### Follow-ups

- Native macOS and Windows Jira execution remains an environment-dependent
  smoke-test recommendation; no blocker was found in the generated command
  flow.

**Final verdict: PASS. Next task may begin.**

## QA re-review — Windows smoke prompt/race remediation

### Verdict

`PASS WITH FOLLOW-UPS`

### Findings

- **P3 cleanup hygiene:** `launchedProcessIds` retains PIDs after their child
  processes close, and the final `finally` block calls `taskkill` for every
  retained PID. Normal successful/error completion therefore still invokes
  the fallback command against already-closed PIDs. This is harmless in the
  observed flow but is not strictly “taskkill only fallback” and could become
  unsafe if a PID were reused. Remove PIDs on `close` and reserve final
  `taskkill` for still-active processes.

### Evidence

- Prompt input is now driven by observed output: URL is sent initially, team
  selection after `Team number(s)`, and token after `Jira token` appears.
- Success waits for the actual `Done. Open Scrum Master Tool` marker, then
  waits for `runner-success.json`, sends the blank line for the script’s final
  `Read-Host`, sends `exit` to close `-NoExit` PowerShell, and supplies the
  wrapper pause input. The success assertion then reads and validates the file.
- Failure waits for visible `[ERROR]`, supplies the error prompt and wrapper
  pause input, and resolves only after the process closes; exit code/log/
  redaction assertions remain active.
- Timeout and wait failure use `taskkill /T /F` as the controlled fallback.
- Production generator and live payload are unchanged by this race-test
  remediation; the real `.cmd` → PowerShell → Node → runner chain remains
  exercised.
- Delegated Windows run `32146743887` supplied the prior race evidence. Local
  `node --check` passed; the smoke test skipped safely off Windows.
- `npm run check` passed: 23 test files / 122 tests, typechecks, and build.
  `git diff --check` passed.
- Scope is limited to `scripts/windows-renew-smoke.mjs`; no production,
  Jira analytics, Teams/workspace data, or Cloudflare changes were introduced.

### Coverage

- Output-driven prompts, success marker/file synchronization, NoExit closure,
  failure visibility, async process completion, timeout cleanup, production
  chain preservation, full validation, and scope safety checked.

### Risk assessment

Low. The core race is addressed; the remaining issue is isolated to smoke-test
cleanup PID bookkeeping.

### Required fixes

- None blocking the production task. Correct PID bookkeeping before relying on
  the smoke script as a reusable test harness.

### Follow-up tests

- Run the smoke test on `windows-latest` after PID cleanup and confirm no
  EBUSY, no lingering process, and no taskkill invocation on normal completion.

### Recommended next task

The next task may begin. Carry the P3 smoke cleanup follow-up forward.

**Final verdict: PASS WITH FOLLOW-UPS. Next task may begin.**

## QA final check — Windows smoke PID cleanup

### Verdict

`PASS`

### Evidence

- `runLauncher()` removes each child PID from `launchedProcessIds` on both
  `error` and normal `close` events. The final cleanup loop therefore targets
  only still-active processes; `taskkill /T /F` remains a timeout/wait-failure
  fallback rather than normal completion behavior.
- Output-driven prompt sequencing, success marker/file wait, explicit `exit`
  to close `-NoExit` PowerShell, failure error visibility, and awaited process
  close remain intact.
- The real `.cmd` → PowerShell → Node → bundled runner assertions and
  production launcher behavior are unchanged.
- `node --check` passed; the smoke command skipped safely off Windows.
- `npm run check` passed: 23 test files / 122 tests, typechecks, and build.
  `git diff --check` passed.
- Scope is limited to `scripts/windows-renew-smoke.mjs`; no production,
  Jira analytics, Teams/workspace data, or Cloudflare changes were introduced.

**Final verdict: PASS. Next task may begin.**

## QA final check — Windows smoke EBUSY cleanup remediation

### Verdict

`PASS`

### Evidence

- `scripts/windows-renew-smoke.mjs` now uses asynchronous `spawn` with streamed
  stdout/stderr capture and awaited launcher completion instead of blocking
  `spawnSync` capture for the real Windows chain.
- A 30-second timeout invokes a controlled `taskkill /PID /T /F` fallback via
  the Windows command shell, and the final cleanup repeats the process-tree
  safeguard before removing the temporary fixture. This addresses the prior
  Windows EBUSY cleanup failure.
- The generated wrapper assertion still requires
  `powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File
  "%~dp0renew-team.ps1" %*`. Production generator, live bootstrap payload, and
  runner behavior are unchanged by this cleanup-only remediation.
- Existing success, failure, exit-code, log metadata, token/auth redaction,
  missing runner, invalid workspace, invalid selection, and separate runner
  argument assertions remain present.
- The delegated Windows run `32146223947` provides native evidence for the
  remediation. Local `node --check` passed; the smoke command skipped safely
  off Windows.
- `npm run check` passed: 23 test files / 122 tests, typechecks, and build.
  `git diff --check` passed.
- Scope is limited to `scripts/windows-renew-smoke.mjs`; no production
  launcher, Jira analytics, Teams/workspace data, or Cloudflare changes were
  introduced.

**Final verdict: PASS. Next task may begin.**

## QA final check — version 0.2.5 bump

### Verdict

`PASS`

### Evidence

- Root `package.json` and `package-lock.json` are `0.2.5`; app
  `package.json` and both app lockfile version entries are also `0.2.5`.
- Generator `LAUNCHER_VERSION`, generated/live Windows payload metadata, and
  smoke log assertion are all `0.2.5`.
- Cache-bust `20260818-5` is consistent in `index.html`, installer v2, installer
  v3, and the focused installer test.
- Separated runner invocation remains
  `& node -- "$Runner" "$WorkspaceDir" @SelectedTeamIds` in generator, live
  bootstrap payload, installer output assertion, and smoke fixture assertion.
- `npm run check` passed: 23 test files / 122 tests, typechecks, and build.
  `node --check` for smoke/bootstrap/installers and `git diff --check` passed.
- Scope review found only version/payload/cache-bust/test-related changes; no
  Jira analytics, Teams/workspace data, or Cloudflare changes were introduced.

**Final verdict: PASS. Next task may begin.**

## Developer implementation — Windows CI renew smoke coverage

### Implemented

- Added a separate `windows-latest` GitHub Actions job while preserving the
  existing Ubuntu job.
- Added `scripts/windows-renew-smoke.mjs`, which generates real workspace
  helpers, uses a fixture workspace under a path containing spaces, and runs
  the actual `renew-team.cmd` → PowerShell → Node → workspace-local runner
  chain without Jira network access.
- The smoke fixture automates Jira URL, team selection, token, and pause input
  and covers success, missing runner, missing Teams/invalid workspace,
  invalid selection, runner exit-code propagation, `%~dp0` quoting, and
  persistent sanitized error logs.
- Updated the generated/live Windows launcher to capture native runner output,
  sanitize token and Authorization/Bearer/Basic material, and keep the error
  available to the existing error log/visible diagnostics.
- Documented CURRENT/PARTIAL/MISSING Node.js distribution status; end users
  still need Node.js 18+ available on PATH and no runtime is bundled.

### Validation

- `npm run check` — PASS: 23 test files / 122 tests, typechecks, and build.
- `npx vitest run tests/workspace-installer-v3.test.ts tests/workspace-helper-reinstall.test.ts` — PASS.
- `node --check scripts/windows-renew-smoke.mjs` — PASS.
- Workflow YAML parsed successfully with Ruby YAML parser.
- `git diff --check` — PASS.
- Windows smoke script skips safely on non-Windows; the real execution is
  assigned to the `windows-latest` CI job because this environment has no
  `cmd.exe` or Windows PowerShell.

### QA handoff

QA should inspect the workflow and run the Windows job, then verify the
space-containing fixture chain, automated prompts, non-zero exit propagation,
absence of false success, and that `logs/renew-team-error.log` contains
timestamp/version/exit-code metadata without the fixture token or auth header.
The task remains open pending independent QA review.

## QA review — robust Windows launcher and diagnostics

### Verdict

`FAIL`

### Findings

- **P1 — Diagnostics are bypassed on explicit failure exits** (`src/generate-renew-launchers.ts:270-375`, live payload in `apps/sm-tool/public/workspace-bootstrap.js`). The launcher defines `Write-RenewErrorLog` only inside a `trap`, but missing Node.js, unsupported Node version, missing runner, missing teams, invalid selection, empty selection, and missing saved JQL branches call `exit 1` directly. Those exits do not execute the trap, so `logs/renew-team-error.log` is not guaranteed to contain the required timestamp, version, exit code, and sanitized error for these user-visible failures. The same paths only call `Write-Host`.

- **P1 — Bundled runner failure is not propagated or logged** (`src/generate-renew-launchers.ts` near the final `node $Runner $WorkspaceDir @SelectedTeamIds` call; same live payload). The script prints `Done...` immediately after the native Node process without checking `$LASTEXITCODE` and without throwing/logging when it is non-zero. Under Windows PowerShell, `$ErrorActionPreference = "Stop"` does not reliably convert a native process non-zero exit code into a terminating PowerShell error. A Jira refresh failure can therefore produce a false success message and no diagnostics log entry.

### Evidence

- Focused installer test passed: 1 test file / 1 test. It verifies generated/live payload strings, wrapper arguments, redaction patterns, and file writes, but does not execute PowerShell failure paths or a failing bundled runner.
- `npm run check` passed: 22 test files / 120 tests, typechecks, and production build. The existing chunk-size warning is non-blocking.
- `git diff --check` passed.
- Positive checks passed: wrapper uses `powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "%~dp0renew-team.ps1" %*`; workspace path is derived from the quoted script path; errors are displayed; the log path is workspace-local; token/Authorization/Bearer/Basic redaction patterns are present; bootstrap and v2/v3 installers write the current command, PowerShell, and bundled runner payloads; no admin or repository-path prompt is used.

### Coverage

- Generated and live payload parity, quoted workspace path, PowerShell flags, error visibility, redaction implementation, bootstrap/reinstall file writes, no-admin/no-repository-path flow, focused test, full check, and whitespace validation were reviewed.
- Native Windows execution was not available; failure-path behavior was independently established from the generated PowerShell control flow.

### Risk assessment

High for Windows troubleshooting and refresh correctness. A user can receive a false successful completion and lose the required sanitized diagnostic record when the actual Jira runner fails. This is a core launcher behavior issue and blocks progression.

### Required fixes

- Route every user-facing failure through one logging/error-reporting function before exiting, or replace direct `exit 1` branches with terminating errors handled by the trap.
- Check `$LASTEXITCODE` immediately after `node $Runner ...`; on non-zero, throw/log the exit code and do not print the success/“Done” message. Preserve the non-zero process exit code.
- Add focused tests covering at least one explicit validation failure and a simulated non-zero runner exit, asserting the log metadata, sanitized message, no false success, and exit code propagation.
- Regenerate/update the live bootstrap payload and v2/v3 installer sources, then rerun the installer test and full validation.

### Follow-up tests

- Native Windows PowerShell execution from a workspace path containing spaces.
- Missing Node/runner/teams, invalid team selection, and missing-JQL paths verify log creation and visible errors.
- Stubbed failing `jira-pull.mjs` verifies `renew-team-error.log`, redaction, wrapper error output, and preserved exit code.

### Recommended next task

Developer remediation is required; the next task is blocked until a new QA review passes.

**Final verdict: FAIL. Next task is blocked.**

## QA re-review — README remediation for full Windows reliability

### Verdict

`PASS WITH FOLLOW-UPS`

### Findings

- No P0/P1/P2 blockers found.
- P3 documentation consistency follow-up: the README opening summary and
  generator sentence mention `renew-team.ps1` but do not name the Windows
  primary `renew-team.cmd`. The dedicated Windows section is correct and
  clearly establishes `.cmd` as primary and `.ps1` as fallback; this is not a
  workflow blocker.

### Evidence

- No `SM_TOOL_REPO_DIR`, repo-split, or repo-path prerequisite remains in the
  normal README helper flow. The optional direct repo CLI fallback is clearly
  labeled as an advanced fallback, not a helper requirement.
- Windows documentation now makes `renew-team.cmd` the primary double-click
  flow, identifies `renew-team.ps1` as the direct PowerShell fallback, and
  documents the workspace-local bundled `sm-tool/jira-pull.mjs` runner.
- macOS helper flow, bundled runner placement, and the post-refresh
  **Recalculate** step are documented.
- CURRENT/PARTIAL/MISSING Node notes are truthful: development/CI use Node 22,
  helpers require Node 18+, the workspace contains the runner but not the Node
  runtime, and runtime installation is not automatic.
- Token examples remain placeholders (`your-token`), no customer identifiers
  or credentials were found, and README preserves the token-not-written-to-file
  guidance.
- CI still preserves Ubuntu verification and adds the `windows-latest` smoke
  plus full check job. The smoke script covers the real `.cmd` → PowerShell →
  Node → bundled runner chain, spaces-containing fixture, automated stdin,
  success, missing runner, invalid workspace/selection, exit propagation,
  quoting, `-NoExit`, and log/output redaction without Jira network access.
- `node --check` passed for smoke/bootstrap/v2/v3 scripts; workflow YAML parsed
  successfully with Ruby. `npm run check` passed: 23 test files / 122 tests,
  typechecks, and production build. `git diff --check` passed.
- `npm run test:windows:renew` safely skipped on this non-Windows host; actual
  Windows execution remains assigned to the configured CI job.
- Scope review found no Jira analytics, Teams/workspace data, or Cloudflare
  changes in this task.

### Coverage

- README flow correctness, Node status, token safety/placeholders, Windows CI
  topology, smoke design, syntax, full validation, and scope safety checked.

### Risk assessment

Low. The prior contradictory repo-path instructions are removed from the
normal flow. Remaining risk is limited to unobserved native Windows CI runtime
and minor summary wording consistency.

### Required fixes

- None blocking this task.

### Follow-up tests

- Observe one successful `windows-latest` smoke run when CI is available.
- Optionally mention `renew-team.cmd` alongside `renew-team.ps1` in the README
  opening summary/generator sentence for complete terminology consistency.

### Recommended next task

The next task may begin. Carry the P3 README wording and native Windows CI
observation follow-ups forward.

**Final verdict: PASS WITH FOLLOW-UPS. Next task may begin.**

## QA re-review — Windows runner argument quoting after CI run

### Verdict

`PASS`

### Findings

- No P0/P1/P2/P3 findings.

### Evidence

- `src/generate-renew-launchers.ts` now emits
  `& node -- "$Runner" "$WorkspaceDir" @SelectedTeamIds`, so PowerShell
  passes the runner path, workspace path, and selected IDs as separate
  arguments. The `--` terminator prevents path/argument interpretation issues.
- `apps/sm-tool/public/workspace-bootstrap.js` contains the matching generated
  live payload, and the installer test asserts the same command in the
  installed `renew-team.ps1` output.
- `scripts/windows-renew-smoke.mjs` generates the helper, asserts the generated
  command, then runs the real `.cmd` → PowerShell → Node → bundled runner chain
  with a workspace path containing spaces. Existing success, selected-team and
  exact-workspace assertions remain in place.
- Existing failure assertions remain intact for exit code 23, error-log
  metadata, token/Authorization redaction, visible error, false-success
  suppression, missing runner, invalid workspace, and invalid selection.
- The delegated real Windows CI run `32145624821` provides native execution
  evidence for the corrected chain.
- Local validation passed: `node --check` for the smoke script,
  `npm run test:windows:renew` platform guard, `npm run check` with 23 test
  files / 122 tests plus typechecks/build, and `git diff --check`.
- Scope is limited to generator/live payload/smoke assertion/test updates. No
  Jira analytics, Teams/workspace data, or Cloudflare changes were introduced.

### Coverage

- Separate PowerShell argument forwarding, generated/live payload parity,
  spaces fixture, actual launcher chain, success/failure/log/redaction/exit
  assertions, native CI evidence, full validation, and scope safety checked.

### Risk assessment

Low. The previous path-quoting failure is addressed at the production helper
invocation and covered by the fixture plus native Windows run.

### Required fixes

- None.

### Follow-up tests

- None required for this remediation.

### Recommended next task

The next task may begin.

**Final verdict: PASS. Next task may begin.**

## QA re-review — Windows generator quoting remediation

### Verdict

`PASS WITH FOLLOW-UPS`

### Findings

- No P0/P1/P2 blockers found.
- P3 environment follow-up: native Windows execution is unavailable in this
  review environment, so the CI smoke job remains the final runtime evidence.

### Evidence

- `generateHelpers()` no longer invokes `npm` through `cmd.exe` and no longer
  embeds the spaces-containing fixture path in a command string. It invokes the
  repository Node executable (`process.execPath`) directly with the installed
  `tsx/dist/cli.mjs`, generator path, and fixture path as separate arguments.
- The fixture path assertion explicitly requires `workspace with spaces`, so
  generator setup still tests argument-safe path handling.
- The actual launcher test remains unchanged: `runLauncher()` invokes
  `cmd.exe /d /c renew-team.cmd`, feeds automated stdin, and verifies the real
  `.cmd` → PowerShell → Node → workspace-local runner chain.
- Success still verifies selected team and exact space-containing workspace
  path. Failure coverage still verifies runner exit code 23, error log metadata,
  token/Authorization redaction, visible error, suppressed false success,
  missing runner, invalid workspace, and invalid selection.
- `node --check scripts/windows-renew-smoke.mjs` passed; the smoke command
  skipped safely on non-Windows.
- `npm run check` passed: 23 test files / 122 tests, typechecks, and production
  build. The existing chunk-size warning is non-blocking.
- `git diff --check` passed. The remediation diff is limited to the smoke
  script; no CI, generator, payload, Jira analytics, Teams/workspace data, or
  Cloudflare changes were introduced.

### Coverage

- Generator setup argument safety, spaces fixture, actual Windows launcher
  chain, failure/log/redaction/exit assertions, syntax, full validation, and
  scope safety checked.

### Risk assessment

Low. The generator setup no longer depends on Windows shell quoting; the
runtime launcher chain remains explicitly exercised by the smoke script.

### Required fixes

- None blocking this remediation.

### Follow-up tests

- Confirm the updated smoke script passes on `windows-latest`, including the
  generated fixture under a path containing spaces.

### Recommended next task

The next task may begin. Carry native Windows CI observation as a P3 follow-up.

**Final verdict: PASS WITH FOLLOW-UPS. Next task may begin.**

## QA re-review — Windows CI npm invocation remediation

### Verdict

`PASS WITH FOLLOW-UPS`

### Findings

- No P0/P1/P2 blockers found.
- P3 environment follow-up: this macOS/Linux review cannot execute
  `cmd.exe` or Windows PowerShell. The real chain remains delegated to the
  configured `windows-latest` CI job.

### Evidence

- `scripts/windows-renew-smoke.mjs` now resolves
  `process.env.ComSpec || process.env.COMSPEC || "cmd.exe"` and invokes
  `npm run generate:renew-launchers -- "<fixture path>"` through that command
  shell. This avoids the prior direct `npm.cmd` spawn issue while preserving
  the Windows command resolution path.
- The smoke test still generates helpers in a fixture whose path contains
  spaces, then runs the real `renew-team.cmd` via `cmd.exe /d /c` and feeds
  stdin through the `.cmd` → PowerShell → Node → workspace-local runner chain.
- Success checks still verify selected team and exact space-containing
  workspace path. Failure checks still cover runner exit code 23, timestamp/
  versioned log metadata, redaction of token and Authorization/Bearer content,
  visible errors, suppressed false success, missing runner, invalid workspace,
  and invalid selection.
- `node --check scripts/windows-renew-smoke.mjs` passed.
- `npm run test:windows:renew` safely skipped on this non-Windows host with the
  documented platform guard.
- `npm run check` passed: 23 test files / 122 tests, typechecks, and production
  build. The existing chunk-size warning is non-blocking.
- `git diff --check` passed. The remediation diff is limited to the smoke
  script; no Jira analytics, Teams/workspace data, or Cloudflare changes were
  introduced.

### Coverage

- Windows npm shell resolution, fixture/path quoting, actual launcher chain
  assertions, success/failure/log/redaction/exit behavior, syntax, full
  validation, and scope safety checked.

### Risk assessment

Low. The prior Windows `npm` process-launch issue is addressed without
weakening the smoke assertions. Residual risk is limited to not observing a
native Windows run in this environment.

### Required fixes

- None blocking this remediation.

### Follow-up tests

- Confirm one successful `windows-latest` CI run and retain its smoke output as
  release evidence.

### Recommended next task

The next task may begin. Carry the native Windows CI observation as a P3
follow-up.

**Final verdict: PASS WITH FOLLOW-UPS. Next task may begin.**

## QA re-review — Windows diagnostics remediation

### Verdict

`PASS WITH FOLLOW-UPS`

### Findings

- No P0/P1/P2 blockers found.
- P3 follow-up: the new focused coverage is structural/source-level validation
  of failure paths. It does not execute a Windows PowerShell launcher with a
  failing native Node process and inspect the resulting log file. A native
  Windows smoke test remains environment-dependent.

### Evidence

- `Fail-Renew` now calls `Write-RenewErrorLog`, displays the sanitized message,
  waits for user visibility, and exits with the supplied code.
- Early Windows failures for missing Node, unsupported Node version, missing
  runner, missing teams, empty team list, invalid selection, and missing saved
  JQL route through `Fail-Renew`. The only remaining direct `exit 1` is inside
  the trap after logging.
- Team-list and bundled-runner native process exit codes are captured from
  `$LASTEXITCODE`. Non-zero values call `Fail-Renew` with that exact code;
  success output occurs only after the runner check.
- Log entries include ISO timestamp, launcher version, exit code, and error.
  Token, `Authorization`, `Bearer`, and `Basic` values remain redacted.
- `apps/sm-tool/public/workspace-bootstrap.js` contains the updated Windows
  payload. v2/v3 installers fetch/use the bootstrap payload and the focused
  installer test verifies the generated failure-handling content and writes.
- Focused installer/failure-path test passed: 1 test file / 1 test.
- `npm run check` passed: 22 test files / 120 tests, typechecks, and
  production build. The existing chunk-size warning is non-blocking.
- `git diff --check` passed. Target diff is limited to the generator, live
  bootstrap payload, and focused installer test; no workspace/data scope was
  changed.

### Coverage

- All requested failure branches, log metadata, exit-code propagation,
  success suppression, credential redaction, live payload update, installer
  coverage, full validation, and scope safety checked.

### Risk assessment

Low after remediation. Static and source-level checks now prevent the prior
false-success and missing-log paths. Remaining uncertainty is limited to
native Windows runtime behavior.

### Required fixes

- None blocking this task.

### Follow-up tests

- On Windows, run a workspace-path-with-spaces smoke test with a failing
  `jira-pull.mjs`; verify `renew-team-error.log` metadata/redaction, visible
  error, suppressed success message, and preserved exit code.

### Recommended next task

The next task may begin. Carry the native Windows smoke test as a P3 follow-up.

**Final verdict: PASS WITH FOLLOW-UPS. Next task may begin.**

## QA review — full Windows reliability task

### Verdict

`FAIL`

### Findings

- **P1 — README still documents the removed repo-path workflow** (`README.md:75,
  95, 104, 112, 182`). It says users must set `SM_TOOL_REPO_DIR` when the
  repository and workspace differ and presents that variable in the Windows
  helper/CLI examples. The generated Windows helper now invokes the
  workspace-local `sm-tool\\jira-pull.mjs` directly and does not use
  `SM_TOOL_REPO_DIR`; the documentation therefore sends users through an
  obsolete dependency and does not document the double-clickable
  `renew-team.cmd` flow. This is a core Windows reliability/documentation
  mismatch and blocks the task.

### Evidence

- `.github/workflows/ci.yml` preserves the Ubuntu `verify` job and adds a
  `windows-latest` job with Node 22, both dependency installs, the Windows
  smoke command, and full `npm run check`.
- `scripts/windows-renew-smoke.mjs` creates a fixture under a path containing
  spaces, generates real helpers, feeds stdin to `cmd.exe /c renew-team.cmd`,
  and exercises success, missing runner, missing Teams/invalid workspace,
  invalid selection, runner exit-code propagation, `%~dp0` quoting,
  `-NoExit`, and sanitized log/output redaction without Jira network access.
- Generator and live bootstrap payload use the real `.cmd` → PowerShell →
  Node → workspace-local runner chain. The smoke fixture runner is local and
  performs no Jira request.
- README CURRENT/PARTIAL/MISSING Node notes are present and correctly state
  that Node 18+ is required on the user PATH and is not bundled.
- `node --check` passed for the smoke script, bootstrap, and v2/v3 installers.
  Ruby YAML parsing passed for `.github/workflows/ci.yml`.
- `npm run test:windows:renew` safely skipped on this non-Windows host because
  `cmd.exe`/Windows PowerShell are unavailable; the actual execution is
  assigned to the Windows CI job.
- Focused installer and reinstall coverage remains passing. `npm run check`
  passed: 23 test files / 122 tests, typechecks, and production build.
  `git diff --check` passed.
- Target diff contains CI, README, smoke script, generator/bootstrap, and
  installer test changes; no Jira analytics, Teams/workspace data, or
  Cloudflare changes were introduced by this task.

### Coverage

- Windows CI topology, fixture path quoting, automated stdin, helper chain,
  success/failure/invalid workspace/selection behavior, exit propagation,
  NoExit, log redaction, Node notes, YAML/Node syntax, Linux CI preservation,
  and scope safety checked.
- Real Windows execution could not be run locally; CI coverage is present but
  has not been observed in this environment.

### Risk assessment

High for first-run Windows usability because the README gives contradictory
repo-path instructions and omits the intended `.cmd` entry point. The runtime
chain itself is well covered by the Windows CI smoke design.

### Required fixes

- Update README Windows/helper/CLI instructions to remove `SM_TOOL_REPO_DIR`
  from the bundled-runner flow, document `renew-team.cmd` as the
  double-clickable entry point, and clearly distinguish the direct PowerShell
  fallback. Keep the CURRENT/PARTIAL/MISSING Node notes.
- Re-run README validation, `npm run check`, and `git diff --check` after the
  documentation correction.

### Follow-up tests

- Observe the Windows CI smoke job on `windows-latest`, including success,
  failing runner, missing runner, invalid workspace, invalid selection, and
  path-with-spaces cases.

### Recommended next task

Developer must correct the stale Windows documentation; the next task is
blocked until a new QA review passes.

**Final verdict: FAIL. Next task is blocked.**

## QA review — explicit workspace helper reinstall

### Verdict

`PASS WITH FOLLOW-UPS`

### Findings

- No P0/P1/P2 blockers found.
- P3 follow-up: the focused reinstall test validates permission decisions and
  source-flow invariants, but does not mount the React UI or execute every
  success/denied/unavailable/failed status branch end-to-end in a browser.

### Evidence

- `pickWorkspaceDirectory()` is called from the user-triggered Choose/Switch
  actions with `mode: "readwrite"`. The selected handle then passes through
  `ensureWorkspaceWritePermission`, which queries readwrite and requests it
  only when needed.
- Remembered-workspace Open is also an explicit user action. Its handle is
  opened/read-checked by the workspace library, then the app requests
  readwrite only for helper reinstall. Background `restoreWorkspace()` does
  not call `reinstallWorkspaceHelper` and remains prompt-free.
- The app calls `window.__smInstallWorkspaceHelperV3` and maps results to clear
  status text for installed, permission-denied, unavailable, and failed cases;
  File System Access API unavailability and open errors have explicit status
  messages.
- v3 installer writes only `sm-tool/jira-pull.mjs`, `renew-team.command`,
  `renew-team.ps1`, and `renew-team.cmd`. The app-side reinstall path does not
  save workspace/team/import/cache data; it only handles the helper installer
  and normal workspace loading.
- Focused reinstall test passed: 1 test file / 2 tests.
- `npm run check` passed: 23 test files / 122 tests, typechecks, and
  production build. The existing chunk-size warning is non-blocking.
- `git diff --check` passed. Target implementation changes are limited to
  `App.tsx` and `lib/workspace.ts`, with the focused test added; unrelated
  workspace/data changes were preserved.

### Coverage

- User-gesture permission flow, readwrite request behavior, v3 installer call,
  status mapping, background restore prompt avoidance, helper-only writes,
  focused tests, full validation, and scope safety checked.

### Risk assessment

Low. The explicit flow safely refreshes helper payloads while preserving
workspace data. Remaining risk is limited to browser-specific permission and
status rendering behavior.

### Required fixes

- None blocking this task.

### Follow-up tests

- Add a browser/component-level test for each helper result status and a real
  user-gesture permission-denied path when the UI test harness supports the
  File System Access API.

### Recommended next task

The next task may begin. Carry the P3 UI/browser coverage follow-up forward.

**Final verdict: PASS WITH FOLLOW-UPS. Next task may begin.**

## QA review — version marker placement fix

### Verdict

`PASS`

### Findings

- No P0/P1/P2/P3 findings requiring follow-up.

### Evidence

- `apps/sm-tool/src/App.tsx` now renders the marker as normal-flow
  `<small className="build-marker">` immediately below `Local workspace data`
  inside the sidebar footer.
- The old fixed lower-left render was removed. `.build-marker` has no
  `position`, viewport offsets, or z-index; `.main-area` no longer adds marker
  compensation padding. No marker-specific overlay or absolute positioning
  remains.
- Visible version/build text remains accessible as ordinary text, with the
  existing readable opaque background, dark text, border, and shadow. The
  `overflow-wrap: anywhere` and `max-width: 100%` rules preserve wrapping on
  narrow desktop/mobile layouts.
- `npm run check` passed: 22 test files / 120 tests, typechecks, and production
  build. The existing chunk-size warning is non-blocking.
- `git diff --check` passed.
- Scope is limited to moving the marker and simplifying its CSS; pre-existing
  workspace/data/dashboard changes were preserved and not treated as task
  changes.

### Coverage

- DOM order, normal-flow behavior, fixed/absolute/overlay removal, viewport
  offset/z-index removal, accessibility/readability, responsive wrapping,
  build, tests, whitespace, and scope safety checked.

### Risk assessment

Low. The marker is informational and the fix removes viewport overlap risk
without changing application or data behavior.

### Required fixes

- None.

### Follow-up tests

- None required for this scope.

### Recommended next task

The next task may begin.

**Final verdict: PASS. Next task may begin.**

## QA review — version/build marker

### Verdict

`PASS WITH FOLLOW-UPS`

### Findings

- No P0/P1/P2 blockers found.
- P3 follow-up: `tests/build-info.test.ts` verifies the `local` fallback but
  does not assert a non-empty `VITE_BUILD_SHA` value. The implementation path
  is present and trims/uses the injected SHA; add an explicit injected-SHA test
  for regression coverage.

### Evidence

- `apps/sm-tool/src/lib/build-info.ts` derives the label from the root package
  version and `VITE_BUILD_SHA`, falling back to `local` when absent or blank.
- `apps/sm-tool/src/App.tsx` renders the visible `v0.2.0 · build ...` marker and
  supplies the same label through `aria-label`.
- `.build-marker` is fixed with opaque white background, border, shadow, and
  readable dark text. Desktop positioning clears the navigation; mobile rules
  move it to `12px` from the lower-left. `.main-area` has `56px` bottom
  padding in both layouts, preventing normal content overlap; navigation has a
  higher z-index.
- Root `package.json`, `apps/sm-tool/package.json`, and both version entries in
  `apps/sm-tool/package-lock.json` are `0.2.0`.
- Focused build-info test passed: 1 test file / 1 test.
- `npm run check` passed: 22 test files / 120 tests, typechecks, and
  production build. The existing chunk-size warning is non-blocking.
- `git diff --check` passed. Review found only the marker/version files in the
  requested implementation scope; pre-existing unrelated workspace/data and
  dashboard changes were not altered.

### Coverage

- Version parity, runtime label construction, local fallback, visible render,
  aria labeling, responsive fixed positioning, opaque styling, content
  spacing, navigation layering, build, and whitespace validation checked.
- Native browser visual inspection and non-local SHA assertion remain follow-up
  coverage items.

### Risk assessment

Low. The marker is informational and has no financial, security, provenance,
or data-path impact. Current static/layout evidence and full validation show no
core behavior regression.

### Required fixes

- None blocking this task. Add the non-empty SHA assertion in the next suitable
  test-maintenance task.

### Follow-up tests

- Stub `VITE_BUILD_SHA` to a representative SHA and assert the exact marker
  label; optionally perform a browser smoke check at desktop and mobile widths.

### Recommended next task

The next task may begin. Carry the P3 SHA-branch test follow-up forward.

**Final verdict: PASS WITH FOLLOW-UPS. Next task may begin.**

## QA review — stale installer and closing-window remediation

### Verdict

`PASS`

### Evidence

- `apps/sm-tool/index.html` cache-busts the bootstrap, compatibility,
  installer, manager, period-picker, access-sync, and Readme assets with
  `?v=20260818-3`. v3 also fetches the matching versioned bootstrap source.
- The generated and live `renew-team.cmd` payloads both print an `[OK]` or
  `[ERROR]` result, always execute exactly one `pause`, and return the captured
  PowerShell exit code through `endlocal & exit /b %EXIT_CODE%`.
- v2/v3 installers and bootstrap write the latest `renew-team.cmd` and
  `renew-team.ps1` payloads.
- Focused installer test passed: 1 test file / 1 test, including cache-bust,
  latest payload, success/error, pause count, and exit-code assertions.
- `node --check` passed for bootstrap and both installer scripts.
- `npm run check` passed: 21 test files / 119 tests, typechecks, and
  production build. `git diff --check` passed.
- Generator smoke-test regenerated the wrapper in a temporary workspace and
  confirmed the success/error/pause/exit-code lines.
- Scope review found no new Teams/workspace data changes; existing worktree
  data was preserved.

### Follow-ups

- Native Windows double-click smoke-test remains a recommended environment
  follow-up.

**Final verdict: PASS. Next task may begin.**

## QA re-review — installer remediation

### Verdict

`PASS`

### Evidence

- `apps/sm-tool/public/workspace-installer-v3.js:76` now escapes the nested
  duration formatter placeholders; the prior `ReferenceError: wholeDays is
  not defined` no longer occurs.
- Effective v3 mock File System Access install passed and wrote
  `renew-team.command`, `renew-team.ps1`, and `sm-tool/jira-pull.mjs`.
- Added `tests/workspace-installer-v3.test.ts`; `npm test` passed with 20 test
  files and 118 tests.
- `npm run check` passed, including typechecks, 20/118 tests, and production
  build. The existing chunk-size warning remains non-blocking.
- `git diff --check` passed.
- macOS `LAUNCHER_CONTENT` remains byte-identical to HEAD. Windows payload
  still decodes correctly and retains SecureString token input, BSTR zeroing,
  and PowerShell backtick continuation.
- No installer diff includes Teams/workspace.json/Cloudflare changes;
  existing workspace data changes remain outside scope.

### Follow-ups

- Windows PowerShell runtime smoke test remains recommended when a Windows
  host is available.

**Final verdict: PASS. Next task may begin.**

## QA review — bundled-runner simplification

### Verdict

`FAIL`

### Findings

- **P1 — macOS helper never passes the selected team IDs to the bundled
  runner.** In `src/generate-renew-launchers.ts:205-206` and the live
  `apps/sm-tool/public/workspace-bootstrap.js` payload, the helper collects
  selections in `SELECTED_INDEXES`, but invokes `${SELECTED_IDS[@]}` without
  ever defining or populating `SELECTED_IDS`. Because the helper starts with
  `set -euo pipefail`, the normal refresh flow aborts at that expansion before
  `node "$RUNNER" ...` can run. The same issue is present in the generated
  macOS `renew-team.command`.

### Evidence and checks

- Static payload inspection: macOS has `RUNNER="$SCRIPT_DIR/sm-tool/jira-pull.mjs"`
  and no `SM_TOOL_REPO_DIR`, `RepoDir`, or `npm --prefix`, but has six
  `SELECTED_INDEXES` references and only two undefined `SELECTED_IDS`
  references.
- Windows payload points directly to `sm-tool\jira-pull.mjs`, has no repo-path
  prompt or `npm --prefix`, and retains Jira URL, team selection, and
  `Read-Host -AsSecureString` token flow.
- Live Readme includes `renew-team.cmd` and the Recalculate next step.
- Focused installer test passed: 1 test file / 1 test, but it checks file
  content and not macOS helper execution with selected teams.
- `npm run check` passed: 21 test files / 119 tests, typechecks, and build.
- `git diff --check` passed.
- Scope review: target files are generator/bootstrap/Readme/test; existing
  workspace data changes remain outside scope.

### Required fix

Populate a selected-team ID array from `SELECTED_INDEXES` before invoking the
workspace-local runner, or invoke the runner directly using the indexed team
IDs. Add a macOS helper smoke-test that feeds a team selection and verifies the
runner receives the selected ID. Re-run focused test and full validation.

**Current task status: blocked. Next task may not begin until Developer
remediation and a new QA review.**

## QA review — standalone Role Workflow removal

### Verdict

`PASS`

### Evidence

- `App.tsx` no longer imports or renders `RoleWorkflow`, and the `workflow`
  page value was removed from the `Page` union.
- The standalone Role Workflow nav item is absent from the shared primary
  navigation used by both desktop and mobile layouts. Remaining Workspace,
  dashboard scopes, Metrics, Import, and admin navigation retain their order
  and spacing structure.
- Direct `/workflow` access safely resolves through the Firebase catch-all
  rewrite to `/index.html`; App initializes to the `workspace` page and has no
  pathname-based workflow route.
- `apps/sm-tool/src/components/RoleWorkflow.tsx`,
  `apps/sm-tool/src/lib/role-workflow.ts`, and `tests/role-workflow.test.ts`
  remain present and unchanged. Domain `workflowConfig` and dashboard/team
  workflow UI remain in `App.tsx` and `ExecutiveViews.tsx`.
- Focused navigation test passed: 1 test file / 1 test.
- `npm run check` passed: 21 test files / 119 tests, typechecks, and
  production build. `git diff --check` passed.
- Scope review distinguished pre-existing metric/dashboard worktree changes
  from the targeted navigation removal; no Role Workflow domain files or
  workspace data were removed.

### Follow-ups

- None required for this scope.

**Final verdict: PASS. Next task may begin.**

## QA review — Windows wrapper error handling

### Verdict

`PASS`

### Evidence

- Generated and live bootstrap `renew-team.cmd` contents match after
  regeneration.
- The wrapper invokes PowerShell with `-NoProfile -ExecutionPolicy Bypass`,
  captures `%ERRORLEVEL%`, displays an explicit error and exit code, pauses
  only for non-zero exit, and returns the captured code via
  `endlocal & exit /b %EXIT_CODE%`.
- Normal flow has no `pause` because the pause is inside the non-zero branch.
- Focused installer test passed: 1 test file / 1 test.
- `npm run check` passed: 20 test files / 118 tests, typechecks, and
  production build. `git diff --check` passed.
- macOS helper content remains unchanged and scope remains limited to the
  approved generator/bootstrap/installer/test files; existing workspace data
  changes were preserved.

### Follow-ups

- A native Windows double-click smoke-test remains recommended when a Windows
  host is available.

**Final verdict: PASS. Next task may begin.**

## QA review — Windows non-technical UX

### Verdict

`PASS`

### Evidence

- `src/generate-renew-launchers.ts` generates `renew-team.cmd` with CRLF
  batch content that invokes `powershell.exe -NoProfile
  -ExecutionPolicy Bypass -File "%~dp0renew-team.ps1" %*` and propagates the
  exit code.
- Generator smoke-test in a temporary workspace produced valid
  `renew-team.cmd` and `renew-team.ps1` files. The repository itself was not
  used as the output workspace.
- Windows PowerShell helper prompts for a missing Jira URL, validates an
  `http`/`https` URL, asks for a valid repository path when `package.json` is
  absent, offers team selection, and reads the Jira token with
  `Read-Host -AsSecureString` followed by BSTR cleanup.
- No placeholder filesystem path is used: the initial repository fallback is
  the selected workspace directory, and the user can enter a repository path.
- Effective v3 mock install wrote `renew-team.command`, `renew-team.ps1`,
  `renew-team.cmd`, and `sm-tool/jira-pull.mjs`.
- macOS helper content remains byte-identical to HEAD.
- `npm run check` passed: 20 test files / 118 tests, typechecks, and
  production build. `git diff --check` passed. The existing chunk-size
  warning remains non-blocking.
- Scope review covered only the approved generator, bootstrap/installers, and
  installer test. Existing Teams/workspace data modifications were preserved
  and are outside the target diff; no Cloudflare changes were introduced.

### Follow-ups

- A real Windows PowerShell execution smoke-test remains recommended when a
  Windows host is available; macOS cannot execute PowerShell here.

**Final verdict: PASS. Next task may begin.**

## Developer remediation handoff — bundled-runner README flow

### Implemented

- Updated `README.md` to document `renew-team.cmd` as the primary Windows
  entry point and `renew-team.ps1` as the direct PowerShell fallback.
- Documented Jira URL/team/token prompts, the workspace-local
  `sm-tool/jira-pull.mjs` runner, the post-pull **Recalculate** step, and the
  Node.js 18+ `PATH` requirement.
- Removed the obsolete `SM_TOOL_REPO_DIR` and repo/workspace split guidance
  from the normal helper flow while retaining the optional advanced CLI
  fallback with placeholder-only values.

### Validation

- `npm run check`
- `git diff --check`
- `node --check scripts/windows-renew-smoke.mjs`
- Workflow YAML parse check
- Windows smoke script invoked; skipped safely on this macOS host.

### QA handoff

Please verify that the README no longer instructs users to set
`SM_TOOL_REPO_DIR`, presents double-click `renew-team.cmd` as the normal
Windows flow, retains both helper names and token-safety language, and does
not imply that Node.js is bundled. The changed product documentation is ready
for QA review; the task remains open pending QA verdict.

## Developer remediation handoff — 0.2.4 Windows reliability release

### Implemented

- Bumped synchronized root/app package versions and lockfile package entries
  from 0.2.3 to 0.2.4.
- Updated generated and browser-installed Windows launcher version metadata to
  0.2.4.
- Advanced asset cache-bust marker from `20260818-3` to `20260818-4` so the
  updated bootstrap/installers are fetched after deployment.
- Updated the Windows smoke assertion to require 0.2.4 log metadata.

### Validation

- `npm run check` — PASS: 23 test files / 122 tests, typechecks, and build.
- Focused `workspace-installer-v3` test — PASS.
- Node syntax checks for bootstrap, v2/v3 installers, and Windows smoke script
  — PASS.
- `git diff --check` — PASS.

### QA handoff

Please verify package/lockfile parity, generated Windows error-log version
metadata, and cache-busted bootstrap/installers. No commit was created and the
task remains pending Main/QA workflow decisions.

## Developer remediation handoff — Windows smoke harness invocation

### Implemented

- Updated `scripts/windows-renew-smoke.mjs` to invoke launcher generation via
  the Windows `ComSpec`/`cmd.exe` shell instead of direct `npm.cmd` spawning.
- Preserved the real `cmd.exe` → PowerShell → Node → workspace-local bundled
  runner execution and all existing assertions, including paths with spaces.

### Validation

- `node --check scripts/windows-renew-smoke.mjs` — PASS.
- `node scripts/windows-renew-smoke.mjs` — safely skipped on macOS; Windows
  execution requires `cmd.exe` and PowerShell.
- `npm run check` — PASS: 23 test files / 122 tests, typechecks, and build.
- `git diff --check` — PASS.

### QA handoff

Please rerun the Windows workflow and confirm the ComSpec invocation reaches
launcher generation and then executes the full smoke chain. No commit was
created and no customer/workspace data was changed.

## Developer remediation handoff — Windows smoke generator path forwarding

### Implemented

- Replaced the smoke harness generator setup's `cmd.exe`/npm argument
  forwarding with direct `process.execPath` invocation of the repository-local
  `tsx` CLI and `src/generate-renew-launchers.ts`.
- Kept the fixture workspace path containing spaces and added an explicit
  assertion for that setup condition.
- Preserved the actual launcher test chain through `cmd.exe`, PowerShell,
  Node, and the workspace-local bundled runner.

### Validation

- `node --check scripts/windows-renew-smoke.mjs` — PASS.
- `node scripts/windows-renew-smoke.mjs` — safely skipped on macOS.
- `npm run check` — PASS: 23 test files / 122 tests, typechecks, and build.
- `git diff --check` — PASS.

### QA handoff

Please rerun the Windows workflow and verify generator setup succeeds with the
space-containing fixture path before the full launcher-chain assertions run.
No commit was created and no customer/workspace data was changed.

## Developer remediation handoff — 0.2.5 final Windows launcher release

### Implemented

- Bumped synchronized root/app package versions and lockfile package entries
  from 0.2.4 to 0.2.5.
- Bumped generated/live Windows launcher metadata to 0.2.5.
- Advanced installer/bootstrap cache-bust markers from `20260818-4` to
  `20260818-5`.
- Preserved the verified quoted invocation:
  `node -- "$Runner" "$WorkspaceDir" @SelectedTeamIds`.

### Validation

- Focused workspace installer test — PASS.
- `npm run check` — PASS: 23 test files / 122 tests, typechecks, and build.
- Node checks for bootstrap/installers/smoke harness — PASS.
- `git diff --check` — PASS.

### QA handoff

Please verify 0.2.5 package/lock parity, launcher metadata, cache-busted
installer assets, and that the quoted runner invocation remains unchanged.
No commit was created and customer/workspace data was not touched.

## Developer remediation handoff — Windows smoke process cleanup

### Implemented

- Updated the Windows smoke harness to run launcher invocations asynchronously,
  capture their process IDs and output, and send controlled stdin including the
  PowerShell exit command.
- Added a targeted `taskkill /T /F` fallback for timed-out or lingering
  launcher process trees, plus final cleanup before removing the temporary
  fixture directory.
- Kept the production `-NoExit` wrapper assertion and all success, failure,
  exit-code, redaction, and error-log assertions unchanged.

### Validation

- `node --check scripts/windows-renew-smoke.mjs` — PASS.
- `node scripts/windows-renew-smoke.mjs` — safely skipped on macOS.
- `npm run check` — PASS: 23 test files / 122 tests, typechecks, and build.
- `git diff --check` — PASS.

### QA handoff

Please rerun the Windows workflow and verify the smoke fixture is removed
without EBUSY while `-NoExit` remains asserted. No commit or customer/workspace
data change was made.

## Developer remediation handoff — Windows smoke completion evidence

### Implemented

- Changed smoke launcher execution to interactive stdin sequencing: URL,
  selection, and token are sent only when their prompts are observed.
- The harness now waits for the actual runner completion output and, for the
  success case, waits for `runner-success.json` to exist before releasing the
  `-NoExit` PowerShell process with `exit` and allowing cleanup.
- Failure cases release only after visible `[ERROR]` evidence, preserving exit,
  redaction, and error-log assertions. Process-tree cleanup remains a final
  fallback rather than the success path.

### Validation

- `node --check scripts/windows-renew-smoke.mjs` — PASS.
- `node scripts/windows-renew-smoke.mjs` — safely skipped on macOS.
- `npm run check` — PASS: 23 test files / 122 tests, typechecks, and build.
- `git diff --check` — PASS.

### QA handoff

Please rerun the Windows workflow and verify success evidence is observed
before PowerShell termination and fixture cleanup; no sleep-only workaround or
assertion removal was introduced. No commit or customer/workspace data change
was made.

## Developer remediation handoff — smoke PID lifecycle P3

### Implemented

- Removed launcher process IDs from the active cleanup set on both `error` and
  `close` events.
- `finally` now taskkills only processes that are still active, avoiding stale
  PID reuse risk while preserving the prompt/output synchronization and all
  smoke assertions.

### Validation

- `npm run check` — PASS: 23 test files / 122 tests, typechecks, and build.
- `node --check scripts/windows-renew-smoke.mjs` — PASS.
- Windows smoke skipped safely on macOS.
- `git diff --check` — PASS.

### QA handoff

Please verify active PID cleanup on Windows; no commit or customer/workspace
data change was made.

## Developer remediation handoff — Windows runner workspace argument quoting

### Implemented

- Updated the generated Windows helper and matching bootstrap payload to invoke
  Node as `node -- "$Runner" "$WorkspaceDir" @SelectedTeamIds`, preserving
  the workspace path as one argument when it contains spaces.
- Updated focused installer and smoke assertions for the quoted runner
  contract and retained the real `.cmd` → PowerShell → Node → runner chain.

### Validation

- Focused workspace installer test — PASS.
- `npm run check` — PASS: 23 test files / 122 tests, typechecks, and build.
- Node syntax checks for bootstrap and smoke harness — PASS.
- `git diff --check` — PASS.
- Windows smoke execution remains environment-dependent on this macOS host.

### QA handoff

Please rerun the Windows workflow and verify the success marker is written in
the space-containing workspace, followed by the existing exit, redaction, and
error-log assertions. No commit or customer/workspace data change was made.
