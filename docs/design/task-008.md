# TASK 008 — Designer handoff: status-toast auto-dismiss

## 1. User decision

Make transient status messages self-clearing without changing operation, workspace, metric, timestamp, or error state. Workspace-loaded success remains visible for 5 seconds; general informational messages remain visible for 6 seconds. Active operations, errors, and recovery-required warnings persist until the underlying state changes or the user completes recovery.

Dismissal is presentation-only. The timer starts after the toast has rendered, pauses while the toast or any control inside it is hovered or focused, cancels on a newer status, unmount, or navigation, and may clear only the matching `statusId`/generation.

## 2. Information hierarchy

1. Phase/state: active, success, informational, warning, or error.
2. Short message describing the completed/current action.
3. Recovery action or required next step, if any.
4. Optional non-interactive timing affordance; never make the user depend on timing to understand the message.

Do not hide an active operation just because its text resembles an informational message. A workspace-loaded success is dismissible only after the load operation has completed. A success toast disappearing does not mean the workspace, save, or recalculation is undone.

## 3. Screen/flow specification

### Placement and anatomy

Retain the existing compact `status-toast` placement at the top of the main content: desktop may use the current right-aligned/sticky treatment; mobile uses the current full-width content flow. The toast contains, in reading order:

1. status/phase label when available;
2. message;
3. recovery action for persistent warning/error;
4. no mandatory close button for transient success/info.

Do not add a blocking modal, overlay, or toast stack. A newer status replaces the previous toast and receives a new `statusId`/generation. It cancels the previous timer immediately.

### Normative copy examples

- Workspace success: `Workspace ready — [workspace name] loaded.` (auto-dismiss after 5s.)
- General success/info: `Workspace settings saved.` / `Team recalculated.` / `Import check complete.` (auto-dismiss after 6s when no recovery is required.)
- Active operation: `Opening workspace — Loading workspace and teams…` (persistent.)
- Error: `Could not save workspace settings. Your previous settings are unchanged.` with `Try again` (persistent.)
- Recovery warning: `Workspace permission is required to continue.` with `Restore access` or `Choose Workspace` (persistent.)

The message remains readable while a timer is running. A timer must never dismiss a message containing an actionable recovery or warning, even if its operation has technically ended.

### Timer lifecycle

1. Render the new status and announce it through the existing live region.
2. Start the 5s/6s timer only after the matching toast is mounted/rendered, not when the async operation begins.
3. Pause on pointer hover, keyboard focus, or focus entering a descendant action; resume with the remaining time after both are absent.
4. Cancel when a newer status arrives, the component unmounts, or the page/context changes.
5. At expiry, clear only if the current status still has the same `statusId`/generation and remains dismissible.
6. Never call dismissal as an operation cleanup side effect that could clear a newer active status.

If the user focuses a transient toast action, it cannot disappear beneath focus. If a status is replaced while focused, move focus only according to the existing action workflow; do not steal focus for a passive replacement.

## 4. Component/state matrix

| Status kind | Example | Duration | Hover/focus | Dismissal |
|---|---|---:|---|---|
| Workspace-loaded success | `Workspace ready — … loaded.` | 5s | Pause | Matching statusId/generation only |
| General info/success | `Settings saved.` | 6s | Pause | Matching statusId/generation only |
| Active operation | `Recalculating team…` | Persistent | N/A | Operation completion/error replaces it |
| Error | `Could not open workspace…` + retry | Persistent | N/A | Recovery/newer status only |
| Recovery warning | `Permission is required…` + action | Persistent | N/A | Recovery/newer status only |
| Unsupported/unavailable | `This browser cannot…` + fallback | Persistent | N/A | User fallback/newer status only |
| No status | — | — | — | Toast unmounted |

Loading/active status must keep `aria-busy` and live status semantics until the operation ends. Auto-dismiss must not clear stale/error indicators elsewhere in the page or alter last-known data.

## 5. Visual system

Reuse existing toast dimensions, border radius, spacing, typography, shadow, semantic border/background, and operation phase treatment. Maintain the compact dense operational style. Active, success, warning, and error states must remain distinguishable by text and icon/shape, not color alone.

Do not add a visible countdown that creates urgency or consumes layout space. If a progress cue is used, it is optional, secondary, and must pause with the timer. The toast has a stable minimum height; mobile content wraps and action buttons remain within the viewport.

## 6. Figma handoff

Use the existing Scrum Master Tool status-toast component as the design source of truth. No Figma mutation is required for this documentation-only task. Represent variants for transient workspace success (5s), transient general info (6s), active operation, persistent error, persistent recovery warning, and mobile stacked layout. Annotate timer-start-after-render, pause-on-hover/focus, and matching-statusId dismissal behavior as interaction notes.

## 7. Accessibility

- Keep the toast as one polite live/status region for meaningful messages; auto-dismiss must not suppress the initial announcement.
- Do not re-announce the same message merely because the timer pauses/resumes or because it is dismissed.
- Persistent errors and recovery warnings must expose their action in normal keyboard order with an explicit name such as `Try again`, `Restore access`, or `Choose Workspace`.
- Focus or hover pauses a transient timer. A focused descendant must never be removed by timeout.
- Do not move focus for automatic dismissal. If a focused recovery action completes and produces success, follow the existing action’s focus behavior and announce the replacement status.
- Ensure phase/message/action contrast and state distinction meet existing accessibility requirements without relying on color, hover, or timing.
- On mobile, the toast must not cover the app bar, navigation controls, build marker, or the focused action; allow text to wrap and remain zoomable.

## 8. Acceptance criteria

1. Workspace-loaded success auto-dismisses after 5 seconds measured from rendered toast state; general info auto-dismisses after 6 seconds measured from rendered toast state.
2. Active operation, error, recovery-required warning, and unsupported/unavailable fallback statuses persist and cannot be cleared by a transient timer.
3. Hover and keyboard focus pause the matching timer; the remaining duration resumes only after the toast and descendants are neither hovered nor focused.
4. A newer status cancels the previous timer. Unmount/navigation cancels timers. A timer can clear only its matching `statusId`/generation and can never clear a newer operation/status.
5. Auto-dismiss changes presentation only: it does not change operation state, workspace/data state, timestamps, metrics, or error/recovery state.
6. Live-region announcements still occur for meaningful status changes; timer events and repeated unchanged statuses are not announced.
7. Persistent error/warning recovery actions are keyboard reachable, explicitly named, focus-safe, and remain visible until recovery or replacement.
8. Existing desktop sticky/right-aligned and mobile responsive toast behavior remains compact, readable, contrast-safe, and free of overlap or horizontal overflow.
9. QA verifies fake-timer timing from render, hover/focus pause and resume, replacement/unmount cancellation, race-safe statusId/generation matching, live announcements, and active/error persistence. No application code is changed by this handoff.
