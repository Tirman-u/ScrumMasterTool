# TASK 016 — Filesystem write recovery and pilot authorization policy

## Status and boundary

Architecture-only handoff. This task defines recovery for local/shared workspace writes and a safe pilot access policy. It does not implement code, change metric/status contracts from TASK 012–015, modify customer/workspace data, deploy, or add Jira/network/token flows except the minimum server-side authorization mechanism explicitly approved for pilot access.

Designer is required for recovery and authorization UI, then Developer, then independent QA. No frontend localStorage flag, PIN, hidden route, or client-only role check is an authorization boundary.

## Current failure model

A write/recalculate failure does not prove that imported data or metrics are invalid. The operation layer must classify failure cause and preserve the last valid output. Supported failure classes are:

- permission-denied or permission-expired;
- read-only file/directory or corporate policy restriction;
- directory missing, moved, or replaced by a sync client;
- file locked/busy or transient sharing violation;
- sync-in-progress or partially written source;
- unsupported browser/File System Access capability;
- quota/disk/resource failure;
- serialization/validation failure;
- unknown failure.

The UI must not claim success until the intended write or approved local recalculation has completed and the result is verifiably readable.

## Operation state contract

Use one typed operation state for workspace load, permission restore, helper update, recalculation, and save:

    type WorkspaceOperationState = {
      operationId: string;
      kind: "load" | "permission" | "recalculate" | "helper" | "save";
      phase: "idle" | "checking" | "waiting-stability" | "writing" | "reading-back" | "success" | "error" | "paused";
      busy: boolean;
      retryable: boolean;
      lastKnownAvailable: boolean;
      stale: boolean;
      errorKind?: string;
      safeMessage?: string;
      nextAction?: "retry" | "choose-workspace" | "regrant-permission" | "manual-import" | "contact-admin";
    };

Only one mutating operation per workspace/team may run at a time. A new request is rejected with an actionable busy message or safely coalesced by operation kind; it must not race or overwrite another result. Every completion/error is guarded by operationId so an older event cannot clear a newer busy/error state.

Preserve current team, tab/mode, selected period, selected issue, last data, Last data update, Last calculated, and provenance while busy or after failure whenever safe. A failed write never clears the last-known result or marks it freshly calculated. A successful recalculation updates Last calculated; source/import freshness updates Last data update only when the source/import actually changed.

## Safe write and recovery flow

Before writing, verify the selected handle still identifies the intended workspace/team directory and that the source snapshot is stable. Write to the existing approved cache/output contract only, using the existing atomic/temporary-write strategy if available. Verify read-back before announcing success. Never delete or overwrite imported CSVs as recovery.

Recovery actions are explicit:

1. Retry: bounded retry for transient lock/sync failures, with backoff and no duplicate operation.
2. Re-grant permission: ask the user to reselect or reauthorize the existing directory/file handle through the browser permission prompt; explain what access is needed.
3. Choose workspace: let the user select a different local/shared folder, retaining last-known data until successful load.
4. Manual import fallback: allow the existing CSV import/recalculate path without persistent workspace write; show that the current result is local/session-only or stale until saved.
5. Contact admin/policy: only for corporate policy or read-only restrictions; do not ask users to elevate the app or expose credentials.

If permission is denied or expired, do not retry silently in a loop. If a shared/sync folder is unstable, pause automatic writes, show the source freshness and last-known calculation, and offer manual fallback. If a helper installation/update is blocked, keep the current workspace behavior and explain that the helper is unavailable; do not treat helper failure as metric failure.

## Browser and filesystem support

Primary supported paths are Chromium-based Edge on Windows and a supported Chromium browser on macOS with File System Access enabled. Permission grants are browser-origin and user mediated; reload, tab closure, moved folders, OS policy, and sync replacement may invalidate handles. Permission must be rechecked before read/write and after visibility/resume events.

For browsers without the required File System Access APIs, use the existing user-selected file/folder/manual-import fallback. Do not claim persistent shared-folder monitoring or write support there. Shared OneDrive/network folders are best-effort: sync placeholders, delayed propagation, file locks, and concurrent edits are reported as transient/partial/stale. The app never bypasses OS permissions or corporate policy.

## Pilot authorization policy

Do not make all users admin by default and do not use frontend/localStorage auth. The preferred pilot design is a server-side Durable Object/access policy if such an existing policy service is available:

- pilot policy has explicit cohort/user identifiers, capabilities, start/end or expiry, environment/workspace scope, and audit metadata;
- default deny outside the pilot;
- grant only the minimum pilot capabilities, such as local workspace configuration/recalculation, not master-admin or credential-management rights;
- if all pilot users truly need an admin capability, grant that named capability explicitly and time-box it, with visible pilot banner, revocation/expiry, and audit trail;
- separate master-admin/policy-management capability from ordinary pilot capabilities;
- server response is authoritative for authorization; UI only reflects it.

If no approved Durable Object/access policy exists, use explicit manual enablement by an authorized operator for named pilot identities/environment, documented with expiry and revocation. Do not ship a client-side workaround. Pilot access does not bypass browser/OS File System Access permission, read-only folders, sync locks, customer-data rules, or local-only metric boundaries.

## Diagnostic logging and redaction

User-facing diagnostics contain operation kind, safe error class, actionable next step, and a short correlation/operation ID. Redact or omit directory paths, filenames, workspace names, issue keys, team names, CSV values, tokens, account identifiers, and full exception messages. Internal telemetry, if already approved, stores only normalized error kind, browser/OS capability, operation timing, and correlation ID under the existing privacy policy. Never log raw File System Access handles or customer file contents.

## Team/Scrum Master UI

Team view gets a concise status banner: what is busy, whether last-known data is shown, one primary next action, and distinct Last data update versus Last calculated. It should not expose policy internals.

Scrum Master view may show error class, permission/support capability, retry count, source freshness, stale reason, and operation ID for support. Both views preserve the selected period and metric values. Buttons have truthful labels: Re-check permission, Retry write, Choose workspace, Use manual import, or View recovery details. Open/Switch controls are disabled during a conflicting workspace load/write, with an accessible explanation; they are not silently queued unless the operation contract guarantees safe ordering.

## Accessibility and responsive requirements

Busy state is announced via an accessible live region and remains visible next to the affected action. Do not rely on a spinner or cursor alone. Each action has a labelled button, disabled/aria-disabled semantics, tooltip/help text, keyboard access, visible focus, and error text linked to the relevant control. Recovery dialogs trap focus when modal, support Escape where safe, restore focus, and do not dismiss unresolved errors automatically.

On mobile/narrow screens actions stack with the primary recovery action first; long diagnostics wrap and can be expanded. Support 200% zoom, keyboard-only navigation, touch targets, reduced motion, and color-independent state cues.

## Exact implementation surfaces

- apps/sm-tool/src/types/contracts.ts: operation state, error kind, recovery action, capability/policy response, and redacted diagnostic types.
- apps/sm-tool/src/lib/workspace.ts: permission/read/write verification, stable-read, atomic approved cache write, read-back, error classification, and manual fallback boundary.
- apps/sm-tool/src/App.tsx: operation coordinator, last-known/timestamp preservation, selected-context preservation, recovery actions, and capability display.
- apps/sm-tool/src/components/ExecutiveViews.tsx, TeamDetail.tsx, and workspace/config components: Team/Scrum Master status UX and recovery dialogs.
- apps/sm-tool/src/styles.css: banners, buttons, dialogs, responsive/error states.
- Existing approved server-side Durable Object/access-policy surface, if present: pilot policy only; otherwise an operator-controlled enablement record, never localStorage auth.
- Synthetic tests and safe capability fixtures only.

## Risks and non-goals

Risks include stale busy state, concurrent writes, sync races, permission loops, false success, diagnostic data leakage, and accidental privilege escalation. Mitigate with operation IDs, per-workspace mutex, read-back verification, bounded retries, explicit fallback, redaction, server-side default-deny policy, expiry, and audit.

Non-goals are Jira integration, new tokens, bypassing OS/corporate permissions, automatic admin elevation, arbitrary filesystem writes, rewriting imported CSVs, deleting files, changing metric formulas/status sets, or persisting customer data outside the existing approved cache contract.

## Acceptance criteria

1. Each failure class has a truthful user-facing state and actionable recovery path.
2. Last-known data and both timestamps remain correct through loading, denial, lock/sync failure, policy refusal, retry, and manual fallback.
3. Writes are bounded, non-destructive, read-back verified, operation-id guarded, and concurrency-safe.
4. Windows Edge and supported macOS Chromium behavior is defined; unsupported browsers get a truthful manual fallback.
5. Shared/sync/read-only/corporate-policy cases never trigger silent loops or unsafe overwrites.
6. Diagnostics are redacted and contain no paths, raw CSV/customer data, tokens, or handles.
7. Pilot authorization is server-side Durable Object/access policy or explicit operator enablement; default deny, named capabilities, expiry/revocation, and audit are present. No frontend/localStorage admin authority exists.
8. Team and Scrum Master UI requirements, keyboard/accessibility, responsive behavior, and recovery states pass.
9. TASK 012–015 metric, formula, status, provenance, and local-only boundaries remain unchanged.
10. No Jira/network/token expansion or customer/workspace/deploy change is introduced.

## Focused tests

- Error classification for permission denied/expired, read-only/policy, missing/moved, locked, sync/partial-write, unsupported browser, quota, serialization, and unknown.
- Stable-read and read-back verification; transient retry bound; no duplicate/concurrent writes; operation-id latest-wins.
- Last-known value, selected context, timestamps, stale state, and manual-import fallback retention.
- Windows Edge and macOS supported/unsupported capability fixtures; permission regrant and handle invalidation.
- Shared-folder sync/lock and corporate policy behavior without unsafe overwrite.
- Redaction tests proving no paths, filenames, issue keys, team names, CSV content, tokens, or handles in user diagnostics/log payloads.
- Pilot policy default-deny, named capability, expiry/revocation, audit, operator enablement fallback, and rejection of client-only admin flags.
- Accessibility tests for live region, labels, disabled/aria-disabled controls, focus, dialogs, mobile/reflow, zoom, and reduced motion.
- Regression tests proving TASK 012–015 formulas/status/provenance and no Jira/network/customer-data scope changes.
