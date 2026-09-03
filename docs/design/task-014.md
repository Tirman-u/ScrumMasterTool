# TASK 014 — Designer handoff: Waiting Time %

## 1. User decision

Add exactly one Executive flow card, `Waiting Time %`, and make it open the existing Task 010/011 `MetricInsightModal`. Do not add a standalone history view, a second help system, or a duplicate Visual Analytics panel.

User-facing definition: `Waiting Time % = summed usable Cycle-only waiting duration outside Implementation ÷ summed usable Cycle Time duration × 100.` New Cycle Time uses the old Active Time semantics. Lead-only, Done, unknown/unmapped, invalid, and missing observations are excluded and reduce coverage. A zero denominator is `Unavailable`, never `0%`.

## 2. Information hierarchy

Card: metric name, percentage value/unit, concise lower-is-better cue, and existing insight affordance. Popup: current value; previous comparable period/change; direction; formula/meaning; coverage and sample/usable; `As of`, `Captured`, `Source`; then state reason or diagnostic detail.

Team and Scrum Master use identical value, formula, provenance, and state semantics. Scrum Master may expose fuller coverage exclusions and calculation diagnostics. Do not surface raw legacy role confusion as the primary explanation.

## 3. Screen/flow specification

### Placement

Place `Waiting Time %` in the existing Executive flow metric-card group alongside Lead Time, Cycle Time, and Implementation Time. Keep the same card dimensions, spacing, and `View insight` interaction. The popup is the only history/detail surface; do not render a separate Waiting Time chart or Visual Analytics panel.

### Card and modal copy

Card helper: `Cycle-only waiting share · lower is better`.

Popup title: `Waiting Time % insight`; context: `[Team] · [selected period]`.

Normative content:

- `Current`: `[value]%` or `-`;
- `Change`: `Improving/Worsening/Unchanged` versus previous comparable period, or `N/A`/`Unavailable`;
- `Meaning`: `Share of usable Cycle Time spent waiting outside Implementation Time.`;
- `How calculated`: `Summed usable Cycle-only waiting duration outside Implementation Time ÷ summed usable Cycle Time duration × 100.`;
- `Scope`: `Lead-only, Done, unknown/unmapped, invalid, and missing observations are excluded and reduce coverage.`;
- `Data details`: `Sample`, `Usable`, `Coverage`, `As of`, `Captured`, `Source`.

Use `Lower Waiting Time % generally indicates less queue and handoff delay.` Direction is lower-is-better. The popup must not imply that Waiting Time % is an additional status role or additive component of Lead/Cycle/Implementation Time.

If legacy data is encountered, use only: `Legacy status mapping is used for compatibility; excluded or unmapped observations reduce coverage. Review status roles if coverage is incomplete.` Do not expose a raw legacy formula as current truth.

### Optional history

Reuse the modal’s optional small trend only when at least two adjacent valid comparable Waiting Time % snapshots exist in the selected-period window. The shared selected period remains the sole window authority. Same-period snapshots are deduplicated; gaps remain gaps and block direction inference. One valid point is `N/A · one valid period is available.` No standalone history or special target line.

## 4. Component/state matrix

| State | Card | Popup copy/behavior |
|---|---|---|
| Complete | Numeric percentage and lower-is-better cue | Formula, current/previous, direction, full provenance/coverage |
| Partial | Numeric value with coverage cue | `[n] of [total] observations usable.` Explain exclusions; retain value with partial label |
| Unavailable | `-` and unavailable cue | `Unavailable · no usable Cycle Time denominator for this period.` |
| Zero denominator | `-`, never `0%` | `Unavailable · usable Cycle Time duration is zero.` |
| Missing/invalid | `-` | `Unavailable · valid Waiting Time % data is not available for this period.` |
| Stale | Existing value retained | `Showing last-known Waiting Time % · source is newer than this calculation.` |
| Conflict | Value not presented as authoritative | `Conflict · waiting and Cycle Time sources do not agree; review coverage before interpreting this value.` |
| Loading/retrying | Existing card/skeleton, no zero placeholder | `Loading/Retrying Waiting Time % insight…` with context retained |
| Error | Current/last-known value retained | `Could not load Waiting Time % insight. Current metrics are unchanged.` + `Try again` |
| Insufficient history | Current value if valid | `N/A · one valid comparable period is available.` No direction/trend claim |
| Team | Compact formula/coverage note | Presentation-safe summary |
| Scrum Master | Same value/provenance | Full exclusion, sample/usable, coverage, source diagnostics/table |

## 5. Visual system

Reuse the existing Executive flow card and Task 010/011 modal tokens: card dimensions, border, typography, spacing, disclosure affordance, tooltip, modal, status icons, and restrained semantic colors. Use `%` consistently and do not format unavailable as `0%`.

Use visible text, icons, and coverage labels in addition to color. A partial state is not a success state; stale/conflict/unavailable must remain visually distinct. Keep the modal compact with the existing desktop two-column details and mobile one-column reflow.

## 6. Figma handoff

Use the existing Executive flow-card and MetricInsightModal source of truth from Tasks 010/011. No Figma mutation is required for this documentation-only task.

Represent `Waiting Time %` card and modal variants for complete, partial, unavailable, zero denominator, stale, conflict, loading, retrying, error, insufficient history, Team concise, Scrum Master diagnostic, desktop, mobile, 200% zoom, and optional adjacent-history detail. Do not create a standalone chart or duplicate Visual Analytics surface.

## 7. Accessibility

- Card is a real button/disclosure with an explicit name such as `Open Waiting Time percent insight`; Enter/Space and touch activate it.
- Modal reuses labelled dialog semantics, visible focus, focus trap, Escape/outside close, and focus restoration to the opening card.
- Associate formula, unit, current value, direction, provenance, coverage, and state reason with semantic labels. Do not make formula or warning content hover-only.
- Optional points reuse the established roving `tabIndex`, directional/Home/End, Enter/Space pin, and Escape unpin behavior; focus detail equals hover detail.
- Announce opening and meaningful loading/retry/error/state transitions politely; do not announce chart pointer movement or redraws.
- At mobile widths and 200% zoom, content reflows without clipping, character-by-character wrapping, or page-level horizontal overflow. Respect reduced motion.

## 8. Acceptance criteria for Developer/QA

1. Exactly one Waiting Time % Executive flow card exists and reuses Task 010/011 MetricInsightModal; no standalone history or duplicate Visual Analytics panel is added.
2. Formula is exactly summed usable Cycle-only waiting outside Implementation divided by summed usable Cycle Time duration times 100; new Cycle Time uses old Active semantics.
3. Lead-only, Done, unknown/unmapped, invalid, and missing observations are excluded and reduce coverage; zero denominator is unavailable, never `0%`.
4. Card/modal provide current, previous comparable change, lower-is-better direction, formula/meaning, unit, sample/usable, coverage, asOf, capturedAt, source, and truthful state reason.
5. Optional history appears only for adjacent valid comparable snapshots in the selected-period window; same-period duplicates are removed, gaps block inference, and one valid point is N/A.
6. Complete, partial, unavailable, zero-denominator, stale, conflict, loading, retrying, error, and insufficient-history states match the matrix; errors retain current/last-known data and offer retry where supported.
7. Team and Scrum Master show identical values/provenance; Team is concise and Scrum Master exposes richer exclusion/coverage diagnostics without changing semantics.
8. Desktop/mobile/200% reflow, keyboard/touch activation, modal focus trap/Escape/outside close/focus restore, optional point accessibility, non-hover content, contrast, and reduced-motion behavior pass QA.
9. No raw legacy terminology is presented as the current formula; compatibility explanation is concise and does not imply Waiting Time % is a selectable role or additive metric.
10. QA verifies formula, denominator/coverage exclusions, period/gap behavior, provenance parity, no-zero rule, responsive layout, accessibility, unchanged formulas, and no customer/workspace data changes.
