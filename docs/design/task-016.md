# TASK 016 — Designer handoff: operation recovery UI

## 1. User decision

Use one operation-state recovery surface for workspace load, permission restore, local helper update, recalculate, and save. The global status area shows the current phase, scope, safe error category, and next action. Open/Switch Workspace and remembered-workspace `Open` remain disabled during an active operation and are never queued.

Windows Edge and supported macOS Chromium are primary paths. Unsupported browsers receive truthful manual import/Choose Workspace fallback; there is no admin bypass. Pilot authorization remains server-side, default-deny, named-capability, expiry/revocation/audit controlled. No frontend/localStorage auth is introduced.

## 2. Information hierarchy

1. Current phase and affected scope: `Opening workspace`, `Restoring access`, `Updating local helper`, `Recalculating team/all teams`, or `Saving settings`.
2. What is blocked and why.
3. Error taxonomy and safe consequence.
4. Recovery action: bounded `Retry`, `Re-check permission`, `Choose Workspace`, or manual-import fallback.
5. Data trust: last-known metrics, stale/provenance/timestamps, and whether current data is unchanged.
6. Scrum Master diagnostic detail; never raw paths, tokens, customer CSV contents, or stack traces.

## 3. Screen/flow specification

### Global status area

Keep the existing compact global status toast at the top of main content. Render one structured status with phase eyebrow, plain-language message, status icon, and at most one primary recovery action plus a secondary manual fallback. Active operations persist until completion/error; errors and recovery-required warnings persist until recovery or a newer status.

Normative active copy: `Opening workspace — Loading workspace and teams…`; `Restoring access — Workspace permission is required to continue.`; `Updating local helper — Updating the local Jira helper…`; `Recalculating team — Recalculating this team locally…`; `Recalculating all teams — Recalculating teams locally…`; `Saving settings — Saving workspace/team settings…`.

### Error taxonomy and recovery

| Error | Team/compact copy | Scrum Master detail | Recovery |
|---|---|---|---|
| Denied/expired permission | `Workspace permission is required. Choose Workspace to continue.` | `Read/write permission was denied or expired for this workspace.` | `Re-check permission`, then `Choose Workspace` |
| Read-only/corporate policy | `Workspace is read-only. Changes were not saved.` | `The browser or corporate policy blocks local writes.` | `Choose Workspace` or manual import; no admin bypass |
| Missing/moved directory | `Workspace folder could not be found. Choose Workspace again.` | `The remembered directory is unavailable or moved.` | `Choose Workspace` |
| Locked/sync | `Workspace files are unavailable while syncing. Try again.` | `A file or sync provider is locked/unstable; no partial data was used.` | Bounded `Retry`, then manual import fallback |
| Unsupported browser | `This browser cannot access local folders. Use manual import.` | `File System Access is unavailable on this browser.` | `Manual import`; no repeated prompts |
| Quota | `Could not save local settings. Local storage is full.` | `The browser denied or exhausted local storage quota.` | `Retry` after user frees space; manual export/import if available |
| Serialization | `Could not save settings. Your previous configuration is unchanged.` | `The local configuration could not be serialized safely.` | `Retry`; preserve draft where safe |
| Unknown | `Something went wrong. Existing data is unchanged.` | Redacted safe diagnostic category/correlation reference only | Bounded `Retry`; manual fallback if relevant |

Recovery actions are bounded: one user activation runs one attempt, no automatic infinite retry loop, and repeated failure retains the last-known state. `Retry` repeats the same safe operation; `Re-check permission` requests the existing permission only; `Choose Workspace` starts manual selection; manual import is the browser fallback, not a network/Jira flow.

### Workspace panel and remembered workspaces

Keep `Choose Workspace`/`Switch Workspace` and remembered `Open` buttons in their current locations. During an active operation, disable them and place adjacent text: `Unavailable while Opening workspace is in progress.` They are not queueable. On remembered-open permission failure, keep the current workspace/page where possible and offer `Re-check permission` plus `Choose Workspace`.

### Data trust and stale state

During load/recovery/save/recalculate failure, preserve last-known valid metrics and timestamps. Show `Last data update` and `Last calculated` distinctly; do not advance either on failed or partial work. If source is newer, show `Showing last-known data · source is newer than this calculation.` No success message may imply freshness before a successful operation.

Team view shows the phase and one-line recovery. Scrum Master view may expand a `Details` region with error category, operation scope, redacted diagnostic reference, last-known/stale status, and retry attempt count, but never customer data.

## 4. Component/state matrix

| Component | Idle | Active | Error/recovery | Success |
|---|---|---|---|---|
| Global status | Hidden/neutral | Phase, scope, live message, busy state | Taxonomy, consequence, bounded action | Action-specific complete message; no longer busy |
| Choose/Switch | Enabled if supported | Disabled + reason; not queued | Enabled for manual recovery | Restored |
| Remembered Open | Enabled | Disabled + reason; not queued | Re-check/Choose fallback | Restored |
| Recalculate/save | Enabled when valid | Action-specific `…` label, conflicting controls disabled | `Retry` and preserved-state explanation | Enabled; state updated only on success |
| Last-known data | Current | Retained | Retained and labelled stale/unchanged | Replaced only by successful result |
| Team | Quiet one-line status | Minimal phase/recovery | One-line safe error + action | Concise completion |
| Scrum Master | Same baseline | Scope/detail | Taxonomy, redacted diagnostics, retry detail | Completion plus scope |

## 5. Visual system

Reuse existing `status-toast`, operation-status, compact buttons, section headers, status icons, Data status panel, and dense operational tokens. Use a two-line hierarchy: small phase label, then readable message; recovery button aligns at the end on desktop and becomes full-width on mobile.

Use icon/text/shape plus restrained semantic color: progress for active, lock/folder for permission, warning for policy/sync, error for failure, check for success. Never use color alone. Keep status footprint stable and avoid modal overlays for ordinary operations; confirmation/recovery dialogs are allowed only where the existing action requires a user decision.

## 6. Figma handoff

Use the existing operation-status/global toast, workspace panel, remembered-workspace row, and Data status components as source of truth. No Figma mutation is required for this documentation-only handoff.

Represent variants for every operation phase, all error taxonomy states, retry/re-check/choose/manual-import actions, active disabled workspace controls, Team compact, Scrum Master diagnostic, success, desktop inline, mobile stacked, 200% reflow, and redacted diagnostic detail. Do not represent an admin bypass or frontend/localStorage authorization state.

## 7. Accessibility

- Use one polite live status region for meaningful phase/error/recovery transitions; `aria-busy="true"` only while the matching operation is active.
- Keep buttons as real controls with explicit names: `Retry`, `Re-check permission`, `Choose Workspace`, `Manual import`, `Switch Workspace`, and `Open [workspace]`.
- Disabled Open/Switch controls expose the reason with adjacent text and/or `aria-describedby`; they do not accept queued activation.
- Preserve focus on the triggering action during progress. After error, move focus predictably to the recovery action only when appropriate; after completion restore/retain logical focus without stealing focus for passive status.
- Recovery dialog/confirmation, if used, has labelled dialog semantics, focus trap, Escape/cancel, outside-close only when safe, and focus restoration.
- Error summaries and details are readable without color, hover, tooltip, raw diagnostics, or motion. Redacted diagnostic references are not the only explanation.
- At mobile widths and 200% zoom, phase/message/action stack and wrap normally with no horizontal overflow or character-by-character text. Respect `prefers-reduced-motion`; no recovery meaning depends on animation.

## 8. Acceptance criteria for Developer/QA

1. One structured operation-state UI covers workspace load, permission restore, local helper update, team/all-team recalculate, save, success, and error with distinct phase/status copy.
2. Error taxonomy distinguishes denied/expired permission, read-only/policy, missing/moved directory, locked/sync, unsupported browser, quota, serialization, and unknown, with bounded recovery actions.
3. Retry, Re-check permission, Choose Workspace, and manual-import fallback are explicit, safe, bounded, and never create an infinite retry loop or admin bypass.
4. Open/Switch and remembered Open remain disabled and explain why during active operations; no second workspace operation is queued.
5. Last-known metrics, stale status, provenance, `Last data update`, and `Last calculated` remain truthful; failed/partial work does not advance timestamps or claim freshness.
6. Team is concise; Scrum Master exposes richer redacted diagnostics and operation scope. Values/provenance remain identical and customer data is never shown in diagnostics.
7. Windows Edge and supported macOS Chromium primary paths work; unsupported browsers clearly offer manual import/Choose Workspace without false local-folder support claims.
8. Operation concurrency and stale completion are guarded by the structured operation identity; an old completion/finally cannot clear or overwrite a newer operation status.
9. Keyboard, live region, focus, responsive/mobile, 200% zoom, contrast, reduced-motion, and recovery-dialog semantics meet this handoff.
10. Pilot authorization remains server-side/default-deny/named-capability/expiry/revocation/audit; no frontend/localStorage auth or default admin is introduced. QA verifies all error paths, recovery, data safety, and no deploy/customer-data changes.
