# TASK 008 — Status-toast auto-dismiss

## Main status

`in-progress`

Owner: Main/ScrumMaster
Current stage: Designer
Scope lock: presentation-only status-toast dismissal timing and focus behavior

## User objective

Automatically clear completed workspace and informational status messages after a readable interval while keeping active operations, errors, and recovery-required warnings visible.

## Architect handoff

Workspace-loaded success auto-dismisses after 5 seconds; general info after 6 seconds. Timers start after render, pause on hover/focus, cancel on newer status/unmount, and clear only matching `statusId`/generation. Auto-dismiss must not alter operation, data, or timestamp state. Live-region announcements remain.

## Designer handoff

Complete: [docs/design/task-008.md](../design/task-008.md). Defines toast anatomy, exact copy examples, state/duration matrix, timer lifecycle, persistent error/recovery behavior, focus/keyboard/live-region semantics, responsive treatment, Figma notes, and QA acceptance criteria.

## Developer handoff

Blocked until Main routes the approved Designer handoff. Implement only presentation/timer behavior within the Architect scope; preserve structured operation state and existing data behavior.

## QA verdict

Not started. QA must independently verify timing, render-based start, pause/resume, replacement/unmount cancellation, statusId/generation race safety, persistence of active/error/warning states, accessibility, and responsive layout.

## Open follow-ups

- No toast redesign, notification stack, application data change, or operation-state change is included in TASK 008.

## Developer implementation notes

- Added typed status classification with 5-second workspace-success and 6-second informational durations; persistent operation/error/recovery messages are not dismissible.
- Timers begin from mounted status state, pause while the toast or descendants are hovered/focused, cancel on replacement/unmount, and clear only the matching status generation.
- Preserved the existing polite live region and structured operation state; auto-dismiss only clears toast presentation.
- Added executable classification and generation-guard coverage in `tests/status-toast.test.ts`.
- Validation pending; no commit or push is performed by Developer.

## QA remediation notes

- Context changes now cancel pending transient timers without clearing the rendered message, preventing the batched workspace open/restore success update from being removed by its own page/team transition.
- Added immediate replacement cancellation coverage alongside fake-timer pause/resume and unmount/generation checks.
- Added explicit status-revision/context tracking: same-transition workspace success survives its page/team update, while later ordinary navigation removes the prior transient toast; persistent statuses remain mounted.

## QA review — independent status-toast lifecycle review

### Verdict

FAIL

### Findings

- P1 — The unsupported File System Access fallback is incorrectly transient. `handlePickWorkspace()` and `handleOpenRememberedWorkspace()` publish `File System Access API is not available in this browser.` (`apps/sm-tool/src/App.tsx:4510-4512,4542-4544`), but `classifyToastStatus()` only marks `this browser cannot`, `this browser does not`, and related prefixes persistent (`apps/sm-tool/src/lib/status-toast.ts:8-16`). This message is classified as general info and auto-dismisses after 6 seconds, violating the requirement that unsupported/unavailable recovery guidance persist.
- P2 — Restored workspace success uses the general 6-second duration instead of workspace-success 5 seconds. The restore effect publishes `Workspace restored: ...` (`apps/sm-tool/src/App.tsx:1977-1979`), while workspace-success classification only recognizes `Workspace loaded:` or `Workspace ready` (`apps/sm-tool/src/lib/status-toast.ts:10-16`).
- P2 — SPA navigation does not cancel a transient timer. The dismissal effect depends only on `toastStatus` and `toastPaused` (`apps/sm-tool/src/App.tsx:1720-1722`); it has no page/context dependency or navigation cancellation path. A toast can therefore continue counting down and disappear after the user changes page, contrary to the handoff’s navigation-cancellation requirement.
- P2 — Focused tests cover pure classification and generation matching only; they do not exercise fake-timer render start, pause/resume, unmount/navigation cleanup, or App status wiring. Browser interaction remains environment-unverified.

### Verified

- `ToastStatus` correctly distinguishes workspace-success (5,000 ms), general info (6,000 ms), and recognized persistent active/error/recovery messages. `canDismissToast()` protects against a replaced status generation.
- The App timer starts from the rendered `toastStatus` effect, clears/recomputes remaining time on hover/focus pause, resumes after hover/focus leaves, and clears only when the captured status ID still matches the current ID.
- Active structured operations remain rendered independently of transient status timers, with one polite live region and `aria-busy` only while the operation is active. Recovery actions remain outside the transient classifier when represented by active/error operation state.
- No operation, workspace, metric, timestamp, customer-data, token, Teams, cache, `workspace.json`, or public asset mutation was introduced by the reviewed status-toast changes. Existing dirty customer/workspace files remain out of scope.

### Validation

- Focused test: PASS — `tests/status-toast.test.ts`, 1 file / 3 tests.
- `npm run check`: PASS — typecheck, 28 test files / 139 tests, and production build.
- `git diff --check`: PASS.
- Existing non-blocking build warnings remain: `TeamDetail.tsx` has both dynamic and static imports, and the main bundle exceeds the warning threshold.
- Browser smoke was not run because the restricted environment cannot provide a reliable local browser/File System Access session; desktop/mobile layout and real hover/focus interaction remain unverified.

### Required fixes

- Classify the exact unsupported/unavailable File System Access copy as persistent, or use a persistent unsupported status type; add a regression test.
- Treat `Workspace restored:` as workspace-success (5 seconds) or align its copy with the workspace-success contract; add a timing assertion.
- Cancel or invalidate transient timers on SPA page/context navigation while preserving generation and unmount guards.
- Add fake-timer/App-level tests for render-start timing, hover/focus remaining-time behavior, navigation/unmount cancellation, and persistent unsupported/error/recovery states.

### Next step

Task 008 is blocked. Developer remediation is required, followed by a new QA review. No commit or push was performed.

## QA final re-review — lifecycle remediation

### Verdict

FAIL

### Findings

- P1 — Navigation invalidation can clear a newly published transient status immediately. The navigation effect clears any current dismissible `toastStatus` whenever `page`, team, tab, mode, or period changes (`apps/sm-tool/src/App.tsx:1720-1729`). Workspace open/restore publishes the success status while also changing page and selected-team state (`apps/sm-tool/src/App.tsx:1984-1988,4524-4527,4560-4564`). React batches those updates, so the effect can observe the new success toast in the changed context and clear it immediately instead of showing the required 5-second workspace success message.
- P2 — The replacement/unmount fake-timer test does not genuinely assert immediate replacement cancellation: it changes the current generation, waits 5 seconds, then calls `timer.cancel()` itself (`tests/status-toast.test.ts:55-73`). It validates generation safety and manual cancellation, but not that replacement cancels the old timer at replacement time, nor React unmount/navigation integration.
- P2 — Browser smoke remains environment-unverified because the restricted environment cannot provide a reliable local browser/File System Access session; desktop/mobile layout and real hover/focus behavior are not independently observed.

### Verified

- Unsupported File System Access copy is now persistent (`durationMs: null`) and covered by an assertion (`apps/sm-tool/src/lib/status-toast.ts:10-18`, `tests/status-toast.test.ts:12-16`).
- `Workspace restored:` is classified as workspace-success with a 5,000 ms duration and covered by a test (`apps/sm-tool/src/lib/status-toast.ts:12-18`, `tests/status-toast.test.ts:18-23`).
- The timer controller starts on creation (matching post-render use), pauses/resumes with remaining time, rejects a newer generation at expiry, and supports cancellation. The App effect still has unmount cleanup and page/team/tab/mode/period invalidation wiring.
- Active/error/recovery operation status remains persistent and separate from transient status dismissal; aria-live and active-only aria-busy remain present. No operation, metric, workspace/customer-data, token, Teams, cache, or public asset mutation was introduced.

### Validation

- Focused test: PASS — `tests/status-toast.test.ts`, 1 file / 6 tests.
- `npm run check`: PASS — typecheck, 29 test files / 145 tests, and production build.
- `git diff --check`: PASS.
- Existing non-blocking build warnings remain: `TeamDetail.tsx` has both dynamic and static imports, and the main bundle exceeds the warning threshold.

### Required fixes

- Make navigation/context invalidation distinguish the previous toast context from a newly set status in the same render, or invalidate the old timer before publishing the new workspace-success status, so workspace open/restore success remains visible for the full 5 seconds.
- Add a regression test that simulates status publication and page/team context change in the same update and confirms the new status survives and the old timer cannot dismiss it.
- Strengthen replacement/unmount tests to assert immediate old-timer cancellation and, where feasible, App-level effect behavior. Run browser smoke at desktop/mobile widths when the environment permits.

### Next step

Task 008 remains blocked. Developer remediation is required, followed by another QA review. No commit or push was performed.

## QA final re-review 4 — context tracking remediation

### Verdict

PASS WITH FOLLOW-UPS

### Verified

- Same-batched workspace open/restore success is allowed through by the revision guard: the navigation effect observes the newly incremented status revision and does not clear the new toast, while the normal toast effect starts its 5-second workspace-success timer (`apps/sm-tool/src/App.tsx:1574-1579,1688-1721,1723-1742`).
- A later ordinary page/team/tab/mode/period context change now clears both the timer and mounted transient presentation via `setStatusValue("")` and `setToastStatus(null)` (`apps/sm-tool/src/App.tsx:1733-1742`). Persistent active/error/recovery/unsupported states are protected by `shouldClearForContextChange()` and remain visible.
- Unsupported-browser copy remains persistent; `Workspace loaded:` and `Workspace restored:` remain 5-second workspace-success classifications (`apps/sm-tool/src/lib/status-toast.ts:10-18`).
- Fake-timer coverage verifies render-start duration, hover/focus pause-resume, generation replacement protection, explicit cancellation, and the context decision helper (`tests/status-toast.test.ts:6-106`).
- No operation, metric, timestamp, workspace/customer-data, token, Teams, cache, or public asset mutation was introduced; existing dirty customer/workspace files remain out of scope.

### Findings / follow-ups

- No P0/P1/P2 blocker found.
- P2 follow-up: the context test models mounted-state removal with a local variable after calling `shouldClearForContextChange()` (`tests/status-toast.test.ts:24-33`); it would not fail if App only changed timer/remaining state and omitted `setStatusValue("")`/`setToastStatus(null)`. Add an App-level mounted regression (or an extracted state transition helper) that asserts the actual presentation state is cleared while same-batch workspace success remains.
- P2 follow-up: browser desktop/mobile smoke remains environment-unverified in this restricted environment, including real focus/hover and responsive layout.

### Validation

- Focused test: PASS — `tests/status-toast.test.ts`, 1 file / 8 tests.
- `npm run check`: PASS — typecheck, 29 test files / 147 tests, and production build.
- `git diff --check`: PASS.
- Existing non-blocking build warnings remain: `TeamDetail.tsx` has both dynamic and static imports, and the main bundle exceeds the warning threshold.

### Next step

Task 008 passes with follow-ups. The next task may begin. No commit or push was performed.

## QA final re-review 3 — context tracking remediation

### Verdict

FAIL

### Findings

- P1 — Ordinary SPA context changes still do not remove the previous transient toast. The new revision guard correctly distinguishes a status published in the same transition (`statusRevision !== observedContextStatusRevisionRef.current`), but the later-change branch only clears the timer and sets `remainingMs = 0` (`apps/sm-tool/src/App.tsx:1723-1740`). It never clears `status` or `toastStatus`. Because no subsequent timer is scheduled when remaining time is zero, the old transient toast stays mounted indefinitely after ordinary page/team/tab/mode/period navigation. This fails the requested “later ordinary SPA navigation actually removes old transient toast” behavior.
- P2 — Tests now meaningfully cover the pure context decision helper and fake-timer pause/resume, generation mismatch, and explicit cancellation, but still do not mount App or assert the actual state removal. The test named “preserves same-transition ... but clears it on later navigation” only checks `shouldClearForContextChange()` booleans (`tests/status-toast.test.ts:24-33`), so it cannot catch the missing `setStatusValue("")` / `setToastStatus(null)` in the App effect.
- P2 — Browser desktop/mobile smoke remains unavailable in the restricted environment; real 5-second display, navigation removal, focus/hover and responsive behavior are unverified.

### Verified

- Unsupported browser status remains persistent; `Workspace loaded:` and `Workspace restored:` remain 5-second workspace-success classifications (`apps/sm-tool/src/lib/status-toast.ts:10-18`, `tests/status-toast.test.ts:8-23`).
- Same-batched status publication is now intentionally allowed to keep its own timer by the revision guard, avoiding the previous immediate-clear race. The timer controller’s render-start, pause/resume, replacement-generation, and cancel behavior remains correct in isolation.
- Persistent active/error/recovery statuses remain outside transient dismissal. No operation, metric, timestamp, workspace/customer-data, token, Teams, cache, or public asset mutation was introduced; existing dirty customer/workspace files remain out of scope.

### Validation

- Focused test: PASS — `tests/status-toast.test.ts`, 1 file / 8 tests.
- `npm run check`: PASS — typecheck, 29 test files / 147 tests, and production build.
- `git diff --check`: PASS.
- Existing non-blocking build warnings remain: `TeamDetail.tsx` has both dynamic and static imports, and the main bundle exceeds the warning threshold.

### Required fixes

- On a later ordinary context change, clear the prior transient toast presentation as well as its timer, while retaining the revision guard that lets same-batched workspace success run for 5 seconds.
- Add an App-level or equivalent stateful regression test proving same-batch workspace success survives and dismisses at 5s, while later page/team/tab/mode/period navigation removes the previous transient toast. Keep persistent statuses untouched.

### Next step

Task 008 remains blocked. Developer remediation is required, followed by another QA review. No commit or push was performed.

## QA final re-review 2 — batched navigation race remediation

### Verdict

FAIL

### Findings

- P1 — Ordinary context changes no longer dismiss/cancel the prior transient toast presentation. The navigation effect clears the timer and sets `remainingMs = 0`, but deliberately leaves `status` and `toastStatus` mounted (`apps/sm-tool/src/App.tsx:1720-1730`). With no subsequent `toastPaused` transition, the old transient toast remains visible indefinitely rather than being canceled/removed. This preserves the same-batch workspace success toast, but fails the required ordinary navigation/context cancellation behavior.
- P2 — The new replacement test is meaningful for the standalone timer controller’s explicit `cancel()` path, but there is still no App-level test proving same-batched workspace success survives context changes while an ordinary context change removes the prior transient toast. The unmount path is likewise represented only by a manually invoked controller cancel, not a mounted component unmount.
- P2 — Browser desktop/mobile smoke remains unavailable in the restricted environment; real hover/focus, responsive wrapping, and navigation interaction are unverified.

### Verified

- Unsupported-browser status remains persistent, and both `Workspace loaded:` and `Workspace restored:` classify as workspace-success with a 5-second duration (`apps/sm-tool/src/lib/status-toast.ts:10-18`; `tests/status-toast.test.ts:8-23`).
- Render-start timing and hover/focus remaining-time behavior are covered by fake timers. Generation mismatch prevents dismissal of replaced statuses, and explicit timer cancellation prevents later callbacks.
- The navigation effect now avoids clearing a newly published workspace success in the same React batch, but its implementation does not clear the old transient status after invalidation. Active/error/persistent statuses remain outside transient timer dismissal.
- No operation, metric, timestamp, workspace/customer-data, token, Teams, cache, or public asset mutation was introduced; existing dirty customer/workspace files remain out of scope.

### Validation

- Focused test: PASS — `tests/status-toast.test.ts`, 1 file / 7 tests.
- `npm run check`: PASS — typecheck, 29 test files / 146 tests, and production build.
- `git diff --check`: PASS.
- Existing non-blocking build warnings remain: `TeamDetail.tsx` has both dynamic and static imports, and the main bundle exceeds the warning threshold.

### Required fixes

- Track the status/context associated with each transient toast (or invalidate before publishing the new workspace success) so same-batched workspace load/restore success remains for 5 seconds, while a later ordinary page/team/tab/mode/period change actually removes or otherwise cancels the prior transient toast without leaving it indefinitely visible.
- Add an App-level regression test for both cases: same-batched success survives and times out at 5s; ordinary context navigation removes the old transient toast. Add a mounted unmount cleanup test where feasible.

### Next step

Task 008 remains blocked. Developer remediation is required, followed by another QA review. No commit or push was performed.
