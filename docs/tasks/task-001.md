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
