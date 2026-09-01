# TASK 007 — Designer handoff: structured application operation status

## 1. User decision

Replace the ambiguous global busy state with a visible, structured operation status. Users must know what the app is doing, which action is blocked, whether it succeeded, and how to recover. Open/Switch Workspace and remembered-workspace `Open` remain disabled during any active operation and are never queued.

This is a presentation-layer handoff only. Preserve existing workspace, metric, import, cache, permission, and data-safety behavior; do not add network/Jira/token/admin flows or customer-data displays.

## 2. Information hierarchy

1. Current operation phase and plain-language consequence.
2. Scope/action: workspace, all teams, selected team, helper update, save, or permission restore.
3. Progress/loading state, if known; never invent percentages.
4. Recovery action and what remains unchanged after failure.
5. Existing page content and last-known valid data.

The global status must distinguish active operation, completed result, and error. A completed message must not remain visually indistinguishable from an active busy state. Every operation has an `operationId`; only the current operation may clear or replace its status, preventing stale `finally` cleanup from making a newer operation appear idle.

## 3. Screen and flow specification

### Global status area

Keep the existing compact global status area at the top of the main content (`status-toast` placement), but render structured status with a phase label, message, and action-specific recovery where applicable. The status area is reserved for the current operation and its immediate result; it is not a log and must not expose raw stack traces, paths, CSV contents, or secrets.

Active status format:

`[Phase label]` — `[plain-language message]`

Examples:

- `Opening workspace` — `Loading workspace and teams…`
- `Restoring access` — `Workspace permission is required to continue.`
- `Updating local helper` — `Updating the local Jira helper…`
- `Recalculating all teams` — `Recalculating 4 teams locally…`
- `Recalculating team` — `Recalculating this team locally…`
- `Saving workspace` — `Saving workspace settings…`

Use the exact action-specific button labels below. While active, controls that conflict with the operation are disabled and explain the reason through adjacent text or an accessible description.

### Workspace page and navigation

The workspace panel keeps `Choose Workspace` / `Switch Workspace` in its current header/footer locations. During an active operation, retain the button in place with disabled styling and a nearby compact explanation: `Unavailable while [phase] is in progress.`

Recent workspace rows keep their `Open` buttons in place. Disabled button accessible names should include scope, for example `Open Marketing workspace — unavailable while Opening workspace is in progress`. Do not queue a second workspace open. If a user activates a disabled control through an alternate input, no operation starts and no misleading success message appears.

Remembered Open during permission restore shows the active phase in the global status, not a second dialog. On permission failure, keep the current workspace and last-known page/data intact where possible and show `Restore workspace access` or `Choose Workspace` as the recovery action.

### Operation phases and copy

| Phase/state | Phase label and primary copy | Controls/recovery |
|---|---|---|
| Workspace loading | `Opening workspace` / `Loading workspace and teams…` | Open/Switch and remembered Open disabled; no cancel or queue. |
| Permission restore | `Restoring access` / `Workspace permission is required to continue.` | Show `Try again` when a permission request can be retried and `Choose Workspace` as manual fallback. |
| Local helper update | `Updating local helper` / `Updating the local Jira helper…` | Workspace navigation remains blocked for the transaction; on non-fatal helper failure, explain workspace load result separately. |
| All-team recalculate | `Recalculating all teams` / `Recalculating [known count] teams locally…` | Disable conflicting saves, open/switch, and recalculate controls; do not show fake percent. On success: `All teams recalculated.` |
| Team recalculate | `Recalculating team` / `Recalculating this team locally…` | Disable conflicting actions; preserve current selection. On success: `Team recalculated.` |
| Save | `Saving [workspace/team]` / `Saving settings…` | Disable the relevant save and conflicting navigation; on success: `[Workspace/Team] settings saved.` |
| Success | `Complete` / action-specific completion, e.g. `Workspace opened: [name].` | Return controls to enabled state; success may remain briefly as a status message but is not busy. |
| Error | `Could not complete [action]` / concise safe error message | Preserve last-known valid state. Show `Try again` when safe, otherwise the action-specific fallback. Never claim data was saved/opened/recalculated. |

If one workflow contains sequential phases, keep one operation card/status with the current phase and a short completed context only when useful, e.g. `Opening workspace` → `Updating local helper` → `Workspace ready`. Do not show parallel spinners or multiple global busy messages.

### Recovery and stale-state behavior

Errors are actionable and scoped: `Could not open remembered workspace. Permission was not granted. Choose Workspace manually.` or `Could not save workspace settings. Your previous settings are unchanged.` Keep the triggering page, selection, and last-known metrics unless the existing behavior explicitly requires replacing them. Clear active status only in the matching operation’s guarded completion path. A later operation must never be cleared by an earlier operation’s `finally` block.

## 4. Component/state matrix

| Component | Idle | Active | Success | Error/recovery |
|---|---|---|---|---|
| Global status | Hidden or existing neutral status | Phase label, message, progress indicator without fake percentage, live announcement | Complete label and action-specific result | Error label, safe detail, retry/fallback |
| Choose/Switch Workspace | Enabled if supported | Disabled with `Unavailable while [phase] is in progress.` | Enabled | Enabled for manual recovery when applicable |
| Remembered Open | Enabled per row | Disabled; no queue | Enabled | Retry or manual Choose Workspace |
| Header save/action | Enabled when valid | Relevant action disabled and named | Enabled | Retry preserves draft/previous data as specified |
| Recalculate all/team | Enabled when eligible | Disabled; label `Recalculating…` | Enabled | `Try again` / action-specific recovery |
| Page content | Current data/page | Keep last-known content; loading indicator is local to operation scope | Updated only after success | Keep last-known content; mark unchanged if relevant |
| Mobile navigation | Enabled when idle | Disable conflicting workspace navigation; do not trap focus | Restored | Restored with visible recovery |

## 5. Visual system

Reuse existing `status-toast`, compact buttons, section headers, muted text, spinner/progress icon, and dense operational spacing. Use a two-line status treatment: small uppercase/eyebrow phase label and readable message below or beside it. On desktop, phase and message align horizontally where space permits; action sits at the end. On mobile, stack phase, message, and recovery button without covering content.

Use text plus icon/shape for status semantics: progress indicator for active, check for success, warning/error icon for failure, lock/folder icon for permission. Color is reinforcement only. Do not use a full-screen modal, marketing banner, or blocking overlay for ordinary operations.

The status area should have a stable minimum footprint so an operation does not move the primary page controls unexpectedly. Detail may wrap; it must not overlap navigation, build marker, or content.

## 6. Figma handoff

Use the existing Scrum Master Tool workspace/dashboard source of truth referenced by `prompts/DESIGNER.md`; no Figma mutation is required for this documentation-only handoff. Add or represent a compact global status component with variants:

- idle/hidden;
- workspace loading;
- permission restore and permission error;
- local helper update and helper error;
- all-team recalculate and team recalculate;
- save active and save error;
- success;
- generic safe error with retry/manual fallback.

Show desktop inline and mobile stacked frames. Keep existing workspace panel and recent-workspace row components; variants change labels/disabled state only. Normative copy and action labels are defined above.

## 7. Accessibility

- Use one `role="status"`/`aria-live="polite"` region for meaningful operation transitions; do not announce every internal phase unless it changes user-visible work.
- Mark active status with `aria-busy="true"`; remove busy state on matching completion/error only. Do not leave stale `aria-busy` after an operation ends.
- Buttons remain actual buttons with visible disabled state and explicit accessible names. Explain disabled Open/Switch controls in adjacent text or `aria-describedby`; do not rely on disabled styling alone.
- Active labels are action-specific: `Recalculating team…`, `Saving settings…`, `Opening workspace…`. Do not label every operation simply `Loading…`.
- Keep focus on the triggering control when possible. After success/error, return focus to that control or move it to the retry/fallback action only when the triggering control no longer exists. Do not steal focus on passive status updates.
- Keyboard users can reach recovery actions in reading order. Disabled controls are skipped naturally, while their reason remains in the status region.
- Error copy is understandable without color, hover, tooltip, path, or console output. Ensure status text and controls meet existing contrast requirements.

## 8. Acceptance criteria for Developer and QA

1. Global `busy` presentation is replaced by structured operation/status semantics with phase, scope/action, active/result/error state, and an operationId/finally guard against stale cleanup.
2. Workspace loading, permission restore, local helper update, all-team recalculate, selected-team recalculate, saves, success, and errors have distinct visible phase labels and action-specific copy.
3. Choose/Switch Workspace and every remembered-workspace Open button are disabled during any active operation, are not queueable, and visibly explain why.
4. Active operations expose an accessible live status and busy state; completion/error clears them reliably even when operations resolve out of order or a later operation starts first.
5. Errors preserve last-known valid page/data where possible, do not claim success, expose a safe retry/manual fallback, and do not leak customer data, raw paths, tokens, or stack traces.
6. Recalculate and save controls show operation-specific busy labels, prevent conflicting concurrent actions, and restore correctly after success or failure.
7. Workspace/helper permission failures distinguish retry, manual Choose Workspace, and unsupported/unavailable recovery; no repeated implicit permission prompt loop is introduced.
8. Existing layout and dense visual style are preserved. Desktop status remains compact; mobile status stacks without horizontal overflow, overlay, or disruptive content displacement.
9. Keyboard focus order, disabled semantics, live announcements, contrast, and screen-reader wording meet this handoff. Passive polling or internal progress does not spam announcements.
10. Existing behavior, formulas, selected team/period/tab/mode, local-only boundaries, and customer-data protections remain unchanged. QA independently verifies concurrency/race recovery, all operation phases, error paths, responsive layout, and `npm run check`.
