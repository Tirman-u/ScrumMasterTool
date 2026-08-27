# TASK 006 — Designer handoff: selected-team CSV change detection

## 1. User decision

Expose automatic selected-team import monitoring as a quiet trust/status layer around the existing local Recalculate action. Automatic detection is best-effort polling, not a freshness guarantee. A file change is not presented as new metrics until the import is stable across two scans and local analysis succeeds.

Scope is local-only: no Jira, token, network, admin, background-after-close, or customer-data flow. Do not add metrics or alter Lead Time, Active Time, Cycle Time, SLE/P85, period, or tab calculations.

## 2. Information hierarchy

1. Data trust: `Last data update` (latest valid imported-file update) and `Last calculated` (successful `TeamMetrics.generatedAt`).
2. Current watcher state: whether this selected team is being checked, waiting for sync stability, recalculating, paused, unavailable, or failed.
3. Consequence: whether displayed metrics are current, stale, unchanged, or not yet available.
4. Action: `Recalculate team`, `Try again`, or `Resume auto-update`.
5. Scrum Master diagnostics: aggregate counts of new/changed/removed files and stability detail. Never display file names, paths, hashes, CSV contents, or customer data.

`Last data update` must not advance for zero-byte, locked, partially synced, invalid, or otherwise unusable files. `Last calculated` must not advance until analysis succeeds.

## 3. Screen and flow specification

### Shared placement

On Team Overview, place a `Data status` panel above the flow metric cards, containing the existing `Last data update` / `Last calculated` values. It uses the dense executive card treatment and is not a hero/banner. The order is: timestamp row; stale/pending explanation; auto-update status; action row.

The selected team, period, active tab, and mode remain unchanged by detection or recalculation. On Cycle Time, do not duplicate the full panel; while a change is pending, show a compact inline notice under the shared period control: `Data changed since last calculation.` The full detail/action remains in Overview.

### Team view — compact/presentation-safe

Use one status line and one contextual action. Default: `Auto-update on · Watching this team’s imports`.

When source data is newer than the last successful calculation, show: `New import data detected. Metrics are not recalculated yet.` Keep old metrics and old `Last calculated` visible. Actions are limited to `Recalculate team`, `Try again`, or `Resume auto-update` only when required. Do not show file counts, file names, stability internals, or a persistent pause control.

### Scrum Master view — diagnostic

Use the same panel location, with a status row followed by a details row. Show counts only as aggregate labels, for example `2 new · 1 changed · 1 removed`; never show paths or customer content. For stability, show `Waiting for a second stable scan (1 of 2)` and, when useful, `The import may still be syncing.`

Provide `Pause auto-update` / `Resume auto-update`. Pause is session-only, affects the watcher only, does not discard detected changes, and is labelled `Auto-update paused for this session`. Resume performs an immediate non-overlapping check; it does not claim freshness or recalculate until the stable-change gate is satisfied.

### State copy and behavior

| State | Team view | Scrum Master view | Behavior/action |
|---|---|---|---|
| Baseline / watching | `Auto-update on · Watching this team’s imports` | Same, plus `Checks every 30 seconds while this workspace is open.` | Initial/team-change scan establishes baseline; no automatic recalculation. |
| Detecting | `Checking for import changes…` | Same, plus `Comparing the selected team’s import manifest.` | Do not run overlapping scans. |
| Change detected | `Changes detected · waiting before recalculating` | Same, plus aggregate changed-file counts | Keep old metrics; do not advance timestamps. |
| Stability wait | `Waiting for files to finish syncing…` | `Waiting for a second stable scan (1 of 2)` | Defer zero-byte, locked, changing, or partial files; show no partial metrics. |
| Recalculating | `Recalculating this team…` | Same, plus `Local analysis in progress.` | Disable conflicting actions; preserve last-known metrics. |
| Success | `Auto-update complete · metrics recalculated just now` | Same, plus final changed-file counts | Advance `Last calculated` only after success. |
| Error | `Auto-update could not recalculate. Existing metrics are unchanged.` | Same, plus actionable error detail without raw paths/data | Show `Recalculate team`; retain stale/error guidance. |
| Permission | `Cannot check for import changes. Workspace permission is required.` | Same, plus `The browser denied access to the selected imports folder.` | Show `Try again` and `Recalculate team` when usable; avoid repeated prompts. |
| Unsupported | `Automatic change detection is not available in this browser. Use Recalculate team to update metrics.` | Same, plus `Manual recalculation is available.` | Hide watcher-only controls; keep manual fallback. |
| Paused | `Auto-update paused for this session.` | Same | Team shows Resume only if pause was initiated elsewhere; SM owns Pause/Resume. |
| No imports | `No CSV imports found for this team. Auto-update is waiting for the first import.` | Same | Recalculate is disabled until imports are available. |
| No metrics | `No calculated metrics yet. Recalculate team after imports are available.` | Same, plus diagnostic detail | Explicit empty state; never render unavailable as 0. |

Deleted and renamed files are manifest changes and may be included in counts. OneDrive/network sync files that continue changing remain in stability wait. The UI must not present an intermediate file set, partial CSV, or false fresh state.

## 4. Component/state matrix

| Component | Team | Scrum Master | Required states |
|---|---|---|---|
| Timestamp row | Two labelled values | Same | known, unavailable (`-` + reason), stale |
| Stale notice | One sentence | Sentence plus aggregate change detail | hidden/current, pending, stale, error |
| Watch status | Single text status with icon/text | Text status plus detail row | watching, detecting, changed, stability wait, recalculating, success, error, permission, unsupported, paused |
| Changed-file detail | Hidden | Aggregate counts only | none, new, changed, removed/renamed, unstable |
| Primary action | Recalculate / Try again | Recalculate / Try again | idle, loading/disabled, success, error, permission, unsupported |
| Session control | Not persistent | Pause / Resume | enabled, focused, paused, resuming/disabled |
| Metric content | Existing cards/table/chart | Existing richer diagnostics | loading, empty, valid, stale, unchanged-after-error |

Detection/recalculation must not blank valid last-known metrics. An error leaves the stale/error explanation until a later successful run.

## 5. Visual system

Reuse existing ExecutiveTeamView card, border, spacing, typography, button, and status treatments. Keep the panel compact: desktop rows may be horizontal; warning/action content may wrap. Semantic colors reinforce visible text and icons/shapes; color alone never communicates freshness or failure.

Recommended reinforcement: neutral/watch, amber/clock for stale or stability wait, blue/progress for detecting/recalculating, green/check only after successful analysis, red/error for failure, lock/folder for permission, muted unavailable for unsupported. Changed-file counts are secondary metadata. No new metric card, chart, hero, or customer-data preview.

## 6. Figma handoff

The existing Executive Scrum Master Dashboard Make file linked from `prompts/DESIGNER.md` remains the design source of truth. No Figma mutation is required for this documentation-only task. Represent the existing `Data status` panel as variants for Team and Scrum Master states above, plus desktop horizontal and mobile stacked layouts. Map to existing components/tokens; the copy in this document is normative.

## 7. Accessibility

- Expose meaningful status transitions in one `aria-live="polite"` region; unchanged 30-second polls are silent.
- Give the panel a `Data status` heading and timestamps explicit labels, not unlabeled numbers.
- Use explicit names: `Recalculate team`, `Try again`, `Pause auto-update`, `Resume auto-update`. During a run, show `Recalculating…`, set the status region busy, and disable conflicting actions.
- Permission/unsupported explanations appear before their action in reading order.
- Keyboard order is timestamps/status, guidance, primary action, then Scrum Master Pause/Resume. Keep focus stable through transitions and return it to the triggering action after completion.
- Adjacent icons are decorative. Required information never depends on color, hover, or tooltip.
- Announce the Cycle Time pending notice once when it appears; it is not interactive unless it contains an action.

## 8. Acceptance criteria for Developer and QA

1. Data status is above Team Overview flow metrics with both timestamps; Cycle Time does not duplicate the full panel.
2. Team is compact and hides counts/details and persistent Pause/Resume. Scrum Master shows aggregate new/changed/removed counts, stability detail, error/permission detail, and session-only Pause/Resume.
3. All matrix states and copy are represented, including detecting, stability wait, recalculating, success, error, permission, unsupported, paused, no imports, and no metrics.
4. New/changed/deleted/renamed, zero-byte, locked, or partially synced files never produce intermediate metrics; two stable consecutive scans are required.
5. Automatic analysis is limited to the selected team and existing local path. Cache writes do not trigger detection; workspace close/switch stops watching; no Jira/network/token/admin flow is reachable.
6. During detection, waiting, errors, permission loss, and recalculation, last-known metrics remain visible. Unavailable data is never rendered as 0.
7. `Last data update` advances only from valid imports; `Last calculated` advances only after successful analysis. Pending/error states visibly communicate stale or unchanged data.
8. Manual `Recalculate team` remains available for unsupported detection or permission failure, and is disabled only when no imports exist or a run is active.
9. OneDrive/network sync remains in stability wait until stable; no partial-file presentation or false freshness claim occurs.
10. Live announcements, labels, focus, busy/disabled behavior, contrast, keyboard use, mobile stacking, and no horizontal overflow/layout disruption meet this handoff.
11. Existing formulas, working-day semantics, P85/SLE, period/tab/mode selection, and customer-data boundaries remain unchanged. QA independently verifies lifecycle, concurrency, permission recovery, timestamps, responsive behavior, and `npm run check`.
