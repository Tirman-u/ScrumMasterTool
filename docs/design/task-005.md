# TASK 005 — First-class Overview/Cycle Time tabs and team data status

## 1. User decision

The active team route must make the following decisions obvious:

- `Overview`: Is this team’s data current, and what is the current delivery picture?
- `Cycle Time`: Which completed items produced the Cycle Time distribution for the selected period?

The route becomes a first-class two-tab experience:

`Overview` → aggregate cards, approved diagnostics, timestamps, stale guidance, and local team recalculation.

`Cycle Time` → period-filtered scatter, issue table, and mode-appropriate diagnostics.

No scatter, issue table, anomaly controls, or Cycle Time configuration controls remain in Overview. Do not re-enable or delete the hidden legacy subtree in this task.

## 2. Information hierarchy

1. Team context: back action, selected team, selected view mode, and latest data label.
2. Primary tabs: Overview and Cycle Time.
3. Shared period context: one period control that applies identically to both tabs and both modes.
4. Data status: Last data update, Last calculated, stale guidance, and local Recalculate action. This is prominent in Overview and remains discoverable when returning from Cycle Time.
5. Overview content: aggregate flow/delivery cards and approved Team/Scrum Master diagnostics.
6. Cycle Time content: chart first, then legend/controls, then the issue table and Scrum Master-only data-quality actions.

The interface must distinguish source freshness from calculation freshness:

- `Last data update` = latest valid imported CSV update for the selected team.
- `Last calculated` = timestamp from the selected team’s calculated metrics cache.

Never label these as a single generic “updated” timestamp.

## 3. Screen and flow specification

### 3.1 Shared route shell

Within the existing `exec-team-page`:

1. Keep the current Executive topbar with team context, view-mode switch, Back, and Export.
2. Add a first-class tab bar directly below the topbar and above the scrollable content.
3. Add one shared context row immediately below the tab bar. The row contains the period control in both tabs and modes.
4. Render exactly one active tab panel below the context row.

Tab labels and order:

```text
Overview    Cycle Time
```

Recommended supporting copy:

- Overview tab: `Team delivery summary`
- Cycle Time tab: `Completed work by resolution date`
- Period label: `Period`
- Period helper: `All period-sensitive metrics use this selection.`

The shared period control must remain in the same visual location on both tabs. Changing it updates Overview cards, Cycle Time scatter/table, SLE/P85, trends, and data-quality messaging together. Switching tabs never resets the period.

### 3.2 Tab semantics and route behavior

- Use a real `tablist` with two `tab` buttons and one active `tabpanel`.
- Active tab has `aria-selected="true"`; inactive tab has `aria-selected="false"`.
- Each tab controls a stable panel ID, for example `team-overview-panel` and `team-cycle-time-panel`.
- Keyboard: Left/Right arrows move between tabs, Home/End move to first/last tab, Enter/Space activates when selection-follows-focus is not used.
- Preserve the existing team ID, mode, and period when changing tabs.
- Validated query parameters may represent team, mode, tab, and period. Invalid tab values fall back to Overview without changing data.
- Back/popstate restores the validated tab and period without triggering recalculation.
- Deep links never invoke local analysis, network access, Jira access, or token prompts.

### 3.3 Overview panel

Place a compact `Data status` panel at the top of Overview, before the aggregate cards. The panel contains:

```text
Data status
Last data update     {timestamp / Unavailable}
Last calculated      {timestamp / Unavailable}
[Recalculate team]
```

Team view is concise:

- one horizontal status strip on desktop;
- a short stale banner only when source data is newer than calculated data;
- one local `Recalculate team` button;
- no Jira, token, admin, or network language.

Scrum Master view is diagnostic:

- the same two timestamps;
- explicit source/calculation relationship;
- stale reason and last-known-data behavior;
- local action status and error detail;
- no new metric or data source.

Recommended timestamp copy:

- `Last data update: 21 Aug 2026, 14:32`
- `Last calculated: 21 Aug 2026, 14:35`
- Missing update: `Last data update: Unavailable — no valid imported file timestamp.`
- Missing calculation: `Last calculated: Unavailable — metrics have not been calculated.`

Stale warning copy:

```text
Data changed after the last calculation. Recalculate this team to refresh the metrics.
```

The stale banner must say which relationship is stale; do not use only a yellow dot or “out of date” label.

Overview content remains mode-specific:

- Team: compact Team Flow, Flow Time, approved presentation-safe diagnostics.
- Scrum Master: richer Executive Summary, Team Health, Flow Time, and approved diagnostic panels.

Cycle Time scatter, issue data table, issue-type controls, SLE-line controls, and anomaly governance are not rendered in Overview.

### 3.4 Recalculate states

The button label is always `Recalculate team` when idle. It operates only on the selected loaded team through the existing local `analyzeTeam` path.

Idle/available:

```text
Recalculate team
```

Loading:

```text
Recalculating team…
```

- Disable duplicate activation.
- Preserve the last-known metrics and timestamps while work is in progress.
- Show a non-color-only status announcement: `Recalculating {team} metrics.`

Success:

```text
Team recalculated just now.
```

- Update `Last calculated` from the resulting metrics timestamp.
- Re-evaluate stale state.
- Preserve current team, mode, tab, and period.

Error:

```text
Could not recalculate this team. Existing calculated data is still shown. Try again.
```

- Keep last-known metrics visible.
- Keep the action available.
- Do not imply Jira refresh, token access, or network activity.
- In Scrum Master view, expose the existing actionable local error detail if available.

Unavailable action:

```text
Recalculate team
Workspace access is required to recalculate this team.
```

- The button is disabled only when the existing workspace precondition is unavailable.
- Explain the reason in text and preserve current data.

### 3.5 Cycle Time panel

Cycle Time starts with:

```text
Cycle Time
Completed items by resolution date · {selected period} · working days
```

Team mode:

- Compact read-only scatter.
- Resolution date x-axis and Cycle Time working-day y-axis.
- P85 presentation line only when a valid P85 exists.
- Read-only hover tooltip; no issue exclusion, issue-type editing, restore, or governance controls.
- No table in the primary presentation surface; if the existing accessibility alternative is retained, keep it compact and non-governance.

Scrum Master mode:

- Same chart and period basis.
- Full SLE line visibility controls for the approved P85-only contract.
- Existing issue-type inclusion controls.
- Selectable points and selected-point summary.
- Expandable issue data table.
- Existing anomaly exclude/restore callbacks and data-quality diagnostics.

The Cycle Time tab owns all of these details. Overview must not duplicate them.

### 3.6 Cycle Time states

No team:

```text
Cycle Time
Select a team to view completed work for this period.
```

Metrics unavailable:

```text
Cycle Time data is unavailable for this team. Import or calculate team data first.
```

No completed items in selected period:

```text
No completed items in {selected period}.
Try another period or recalculate the team if the source data has changed.
```

Loading tab content:

```text
Loading Cycle Time for {selected period}…
```

The loading state must preserve the tab, period control, and panel title. It must not show zero-valued axes or fake points.

Malformed/invalid data:

```text
Some records could not be plotted because their resolution date is invalid.
Valid records remain visible.
```

If no valid points remain, use the no-data state rather than an empty chart frame.

## 4. Component and state matrix

| Area/state | Team view | Scrum Master view | Required behavior |
|---|---|---|---|
| Tabs / normal | Overview and Cycle Time | Overview and Cycle Time | Same order, active state, period, and route behavior. |
| Period / normal | Shared selected-period control | Same control and value | One App-owned period; tab switches preserve it. |
| Overview / normal | Compact data status + cards | Diagnostic data status + cards | Timestamps remain distinct and visible. |
| Overview / stale | Short text warning + Recalculate team | Richer stale explanation + same action | Staleness is data update newer than calculation. |
| Overview / loading recalculate | Preserve old values; button busy | Same plus local diagnostic status | Duplicate clicks ignored. |
| Overview / recalculate success | Inline success confirmation | Same plus updated timestamp | Route state and period preserved. |
| Overview / recalculate error | Old values remain; retry action | Same plus existing local error detail | No network/Jira/token copy. |
| Overview / no data | Explicit unavailable state | Explicit unavailable state | Never replace unavailable with zero. |
| Cycle Time / normal | Compact read-only scatter | Full diagnostic scatter | Details live only on this tab. |
| Cycle Time / empty period | Period-specific empty copy | Same plus diagnostic context | Keep title, unit, and period visible. |
| Cycle Time / invalid dates | Omit invalid points and explain | Same, with diagnostic count if known | No invalid date becomes zero/epoch. |
| Cycle Time / mobile | Chart fits container; controls hidden/omitted per Team mode | Controls wrap; table scrolls within its own region | No page-level horizontal overflow. |
| Permission/workspace unavailable | Existing shell handles access | Existing shell handles access | Do not claim recalculation is available. |

## 5. Visual system and reusable tokens

Reuse the current Executive styles and dense operational visual language:

- Existing `exec-figma-topbar` for team/mode context.
- New tab strip uses the existing segmented/tab treatment: white surface, `#e2e8f0` border, active indigo/neutral emphasis, visible underline or active fill.
- Shared context row uses the current compact control spacing; period control is visually primary, not duplicated in each panel.
- Data status panel reuses existing Executive card surfaces, 12 px radius, 8–12 px gaps, and muted metadata text.
- Timestamp labels are secondary; timestamp values use tabular numerals.
- Stale/error/success labels require text and may use restrained background/border reinforcement; color is never the only signal.
- Recalculate button uses the existing primary/soft button pattern and retains a visible focus ring.
- Cycle Time panel reuses the TASK 003 scatter/legend/tooltip tokens.

Suggested status hierarchy:

- Normal: neutral text and border.
- Stale: warning text plus `Data is stale` label.
- Loading: muted progress text and disabled button.
- Success: explicit `Recalculated just now` text.
- Error: explicit error text and retry action; no red-only badge.

## 6. Figma handoff

Visual source of truth remains the existing Figma Make file referenced by `prompts/DESIGNER.md`:

`https://www.figma.com/make/1tKoJpi3Qlbqao6uqh3pHl/Executive-Scrum-Master-Dashboard?t=xUpnKuK9zl2tXuc5-20&fullscreen=1`

No node-specific URL was supplied and no Figma nodes are changed in this documentation-only task.

Recommended frames/states for implementation QA:

1. Desktop Team mode — Overview active, fresh data.
2. Desktop Team mode — Overview active, stale warning and Recalculate idle.
3. Desktop Scrum Master mode — Cycle Time active with diagnostic controls.
4. Mobile Team mode — tabs, period control, stacked status/timestamps, and no overflow.
5. Mobile Scrum Master mode — Cycle Time controls wrapped and issue table contained.
6. Loading, success, error, no-data, and missing-timestamp annotations.

## 7. Accessibility and responsive behavior

- Tabs use real tab semantics, stable `aria-controls`, `aria-selected`, visible focus, and keyboard navigation.
- The period control has an explicit accessible name such as `Selected period` and announces changes through the existing status/live region.
- Recalculate has an explicit accessible name including the selected team where useful, e.g. `Recalculate Gold team`.
- Loading and success/error messages use `role="status"`/live announcement behavior without stealing focus.
- Focus remains on Recalculate after success/error unless the user explicitly navigates away; a disabled loading button must not lose its label.
- Do not use timestamps, stale state, or tab state as color-only information.
- At mobile widths, tabs remain fully readable and tappable, the period control expands to available width, timestamps stack, and Recalculate becomes full-width when needed.
- The Cycle Time chart remains within the panel width. Only the issue table may use an internal horizontal scroll when its columns require it.
- In Team mode, hidden Scrum Master controls must not be keyboard-focusable or present in the accessibility tree.
- Empty and unavailable panels retain descriptive headings and selected-period context.

## 8. Acceptance criteria

Developer:

1. The active team route has exactly two first-class tabs: Overview and Cycle Time.
2. Scatterplot, issue table, and mode-appropriate Cycle Time diagnostics render only in Cycle Time.
3. One App-owned period control drives both tabs, both modes, SLE/P85, trends, scatter, table, and data-quality copy.
4. Tab switches preserve team, mode, and period; validated URL/popstate state restores without recalculation.
5. Overview shows distinct Last data update and Last calculated timestamps using their authoritative sources.
6. Overview shows stale guidance only when data update is newer than calculation, with explicit text and a local Recalculate team action.
7. Recalculate affects only the selected team, ignores duplicate clicks, preserves last-known data during loading/error, and never invokes Jira, token, or network flows.
8. Success, error, loading, missing timestamp, permission, and unavailable states are explicit and never represented as zero data.
9. Team Cycle Time remains compact/presentation-safe; Scrum Master Cycle Time retains diagnostics and governance callbacks.
10. Existing formulas, working-day semantics, P85/SLE behavior, and metric contracts are unchanged.
11. Legacy markup is not re-enabled or deleted in this task.
12. Desktop and mobile layouts preserve the dense operational style and avoid page-level horizontal overflow.

QA:

1. Verify both tabs in Team and Scrum Master modes, including direct valid/invalid tab URLs and browser Back/popstate.
2. Verify period persistence and consistency across Overview and Cycle Time after tab/mode changes.
3. Verify timestamp provenance and stale comparison with fresh, stale, missing, and invalid timestamp fixtures.
4. Verify selected-team-only recalculation, duplicate-click prevention, success, failure, and preservation of old data.
5. Verify no Jira, token, network, admin, or customer-data path is introduced.
6. Verify Cycle Time content is absent from Overview and present in Cycle Time with correct Team/Scrum Master differences.
7. Verify loading, empty, malformed, unavailable, and error copy does not render fake zeros or zero axes.
8. Verify tab keyboard behavior, period control naming, Recalculate status announcements, visible focus, mobile layout, and internal-only table overflow.
9. Verify formulas, SLE/P85, working-day basis, and legacy hidden subtree behavior remain unchanged.
