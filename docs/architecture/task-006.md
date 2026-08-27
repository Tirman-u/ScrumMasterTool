# TASK 006 — Automatic import change detection and local recalculate

## Decision

Use bounded polling of the selected team’s imports directory. Browser File System Access does not provide a portable reliable change event, so polling is primary and manual Recalculate remains the fallback.

Each scan builds an in-memory manifest. New, changed, deleted, renamed, zero-byte, locked, or partially synced CSVs must be stable across two scans before recalculation. Only the selected team is recalculated through existing local `analyzeTeam`; no Jira, network, token, or admin flow is reachable.

Polling runs every 30 seconds while a workspace is open, visible, permitted, and auto-updates are not paused. Initial/team-change scans establish a baseline without recalculation. Visibility/focus triggers one immediate non-overlapping scan. Stop on workspace switch/unmount.

Use an in-memory manifest keyed by normalized relative CSV path with size, mtime, digest where available, read status, fingerprint and observed time. Do not persist raw content, manifest, hashes, or watcher state. Require stable consecutive scans and debounce; defer partial/locked/zero-byte files. Cache writes are excluded from the import manifest.

Use one per-team mutex, run generation guard and at most one queued follow-up when a change arrives during analysis. Automatic and manual Recalculate share the mutex. A successful run advances the committed manifest; failure retains last-known metrics and shows retry guidance. Permission loss pauses safely without repeated prompts. Unsupported File System Access falls back to manual Recalculate.

Show distinct `Last data update` from latest valid imported-file `updatedAt` and `Last calculated` from `TeamMetrics.generatedAt`. If source is newer, show stale guidance. Team shows compact status; Scrum Master shows changed-file counts, stability wait, errors, permission limits and session-only Pause/Resume.

Primary implementation areas are `App.tsx`, existing workspace scan/analyze helpers, Team/Scrum Master shell, scoped CSS and pure executable tests for manifest changes, stability, lifecycle, concurrency, timestamps, permissions, failure and no-Jira behavior. Preserve all formulas, P85/SLE, period/tab/mode state, and customer-data safety.

## Acceptance criteria

Stable selected-team CSV changes automatically invoke only local `analyzeTeam`, never read partial files, never loop on cache writes, and preserve selection/period/tab/mode/last-known data. Statuses, stale timestamps, pause/manual fallback, accessibility and responsive behavior are explicit. `npm run check` passes and QA records the final verdict.

## Excluded

No Jira/API/network/token/admin changes, background watching after workspace close, server/service-worker watchers, source-file copying/deletion, formula/calendar changes, customer data, `Teams/**`, `teams/**`, `workspace.json`, or storage-schema redesign.
