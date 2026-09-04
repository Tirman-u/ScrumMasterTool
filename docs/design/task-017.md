# TASK 017 — Designer handoff: shared period-aware metric history

## 1. User decision

Extend the existing Task 010–016 `MetricInsightModal` so every Executive metric popup uses one shared period-aware historical series. Do not add standalone charts, per-metric ad hoc graphs, a P50, or a special P85 target/trendline. The current card value remains the exact selected-period result; history is context only.

## 2. Information hierarchy

Popup order: metric/team/selected period context; current value and unit; previous comparable period and direction; compact history; meaning/calculation; `As of`, `Captured`, `Source`, sample/usable and coverage; then partial/gap/stale/error/unavailable reason.

The selected period is the sole endpoint/filter. Show the resolved granularity and window label, e.g. `Quarter · Q2 2026 · 6 comparable quarters`. Aggregate-period metrics (Stories Done, Throughput, Avg Cycle Time, SLE P85, Done Bug Ratio, Velocity, Lead/Cycle/Implementation, Waiting Time %, Maintenance %) are summarized within buckets. Point-in-time metrics (Aging WIP, Bottleneck) show the canonical snapshot/end-of-period state and are never summed or averaged unless their existing contract says so.

## 3. Screen/flow specification

### Placement and shared context

Keep one insight affordance on each existing Executive card and one shared modal. Do not render a historical panel under the cards. Month, Quarter, Range, All-time, and named filters resolve one immutable period snapshot consumed by card, Team modal, Scrum Master modal, and optional chart. No modal-level period selector exists.

Adaptive history buckets: Month selection uses calendar months; Quarter uses calendar quarters; explicit spans up to 12 months use months, 13–36 months use quarters, and above 36 months use years. Named filters retain their canonical granularity. All-time ends at the reproducible local history extent, never today. Explicit range boundary buckets are labelled `Partial period` and use only the selected-range portion.

### Compact history presentation

Use a 120–160px metric-specific sparkline/line with points only when it adds real comparable history. Highlight the selected endpoint/current bucket, show bucket labels appropriate to granularity, and leave unavailable buckets as visible gaps. Keep a one-line summary: `Current: 4.2 working days · Previous comparable: 5.0 · Improving · 6 of 6 buckets available.`

Team shows current/previous, direction, unit, as-of, one coverage note, and concise sparkline/text summary. Scrum Master uses the same series/value and may add a compact bucket table, sample/usable/unknown counts, semantic/config versions, source, boundary partiality, and backfill limitations.

### Comparison and gaps

Compare only the immediately preceding equal-duration compatible period: prior month/quarter for those selections, or the preceding equal-length range with the same boundary policy. A missing intervening bucket, incompatible semantic/config version, or incompatible boundary makes direction `Unavailable`; do not compare to a distant point. One valid point is `N/A · one comparable period is available.`

Same-period snapshots are deduplicated deterministically. Equal-precedence conflicting values show `Conflict · values could not be reconciled.`; never average them. Future buckets after the selected endpoint are excluded.

### Point details and interaction

Hover, focus, click, or Enter/Space on a valid point exposes the same detail: bucket period, value/unit, `As of`, `Captured`, `Source`, sample, usable, partial/unknown status, and semantic/config compatibility where available. A click or Enter/Space pins the detail; Escape unpins/closes it; outside click closes when safe. Missing buckets say `No data for this bucket`, never zero.

## 4. Component/state matrix

| State | Team popup | Scrum Master popup |
|---|---|---|
| Loading | `Loading [metric] history…`; current card/value context retained | Same plus series scope |
| Ready complete | Compact sparkline, current/previous, direction, unit, provenance | Same plus bucket table/counts |
| Partial | `Partial history · [n] of [total] buckets available.` | Add missing buckets, boundary and unknown counts |
| Insufficient | `N/A · one comparable period is available.` | Add exact valid-point count and reason |
| Unavailable/no history | `Unavailable · no reproducible history for this metric.` | Add source/backfill limitation |
| Unavailable/no compatible period | `Unavailable · no compatible previous period.` | Add granularity/semantic/config reason |
| Stale last-known | `Showing last-known data · source is newer than this calculation.` | Add source snapshot/capturedAt detail |
| Error with retry | `Could not load [metric] history. Current metrics are unchanged.` + `Try again` | Same plus safe diagnostic category |
| Conflict | `Conflict · historical values could not be reconciled.` | Add affected bucket/source detail, never raw customer content |
| Partial boundary | `Partial period · comparison may not be like-for-like.` | Add selected-range boundary dates |
| Aggregate metric | Bucket aggregate using existing formula | Same value/series and richer counts |
| Point-in-time metric | `Snapshot at [period end]`; no trend aggregation claim | Add point-in-time contract/source |

`As of` is the metric observation/bucket endpoint; `Captured`/`capturedAt` is local snapshot/calculation time; `Source` is local import/cache/recalculation. Unknown counts are shown only when supplied by the source. Zero is valid; missing/unavailable is not zero.

## 5. Visual system

Reuse existing Executive cards, Task 010/011 modal, trend pill/arrow, chart/tooltip, table, borders, typography, spacing, and semantic status tokens. Keep the modal compact and the sparkline secondary to current/change meaning. Use gaps, point shapes, labels, and text in addition to restrained color. Current endpoint gets a stronger outline, partial buckets a partial marker, and conflicts an explicit warning icon/text.

## 6. Figma handoff

Use the existing Executive metric insight modal as design source of truth. No Figma mutation is required for this documentation-only task. Represent variants for Month/Quarter/Range/All-time granularity, complete/partial/partial-boundary/insufficient/unavailable/no-compatible-period/stale/error/conflict, aggregate versus point-in-time, Team concise, Scrum Master diagnostic, point focus/pin, desktop, mobile, and 200% reflow.

Annotate the one shared period snapshot, selected endpoint, no-future/no-gap-inference/no-duplicate rules, provenance fields, and current-value-versus-history distinction.

## 7. Accessibility

- Reuse card-button and labelled dialog semantics: Enter/Space opens, focus trap while open, Escape/outside close, and focus restoration to the exact card.
- Provide a text summary and semantic `View data table` with bucket, value/unit, validity, partiality, as-of, capturedAt, source, sample, and usable fields; no meaning is hover-only.
- Optional points use roving `tabIndex`, visible focus, ArrowLeft/Right and orientation equivalents, Home/End, Enter/Space pin, and Escape unpin. Leading gaps must not make valid points unreachable.
- Announce popup/metric changes and meaningful loading/retry/error states politely, not pointer movement or redraws.
- Preserve accessible relationships among selected period, current value, comparison, direction, history, and provenance. Do not use color alone.
- At mobile and 200% zoom, modal content reflows to one column without clipping, vertical character wrapping, or page-level overflow. Respect reduced motion.

## 8. Acceptance criteria for Developer/QA

1. All listed inventory metrics use one shared period-aware series/modal; no standalone or per-metric ad hoc history charts are introduced.
2. Month, Quarter, Range, All-time, and named selections use deterministic granularity and the selected period as the sole endpoint/filter; future history is excluded and partial boundaries are labelled.
3. Aggregate-period and point-in-time metrics are visibly/semantically distinguished and not incorrectly aggregated.
4. Current card values remain selected-period results; history is context only. Team and Scrum Master show identical values/series/provenance, with Scrum Master diagnostic detail.
5. Previous comparison uses the adjacent equal-duration compatible period. Gaps, incompatible semantic/config versions, and incompatible boundaries prevent inference; same-period duplicates are deterministic and conflicts are not averaged.
6. Popup includes current/previous, direction, unit, `asOf`, `capturedAt`, source, sample/usable, coverage, and truthful partial/stale/error/unavailable reasons. Zero remains valid; missing does not become zero.
7. Loading, retrying, ready, partial, insufficient, unavailable, stale, conflict, point-in-time, hover/focus/pinned, and empty states retain last-known/current data and match the matrix.
8. Team remains concise/presentation-safe; Scrum Master adds counts, bucket table, semantic/config/source diagnostics without a tall main view.
9. Card/modal focus lifecycle, point keyboard model, text/table fallback, mobile/200% reflow, contrast, non-color semantics, touch targets, and reduced-motion behavior pass QA.
10. TASK 010–016 formulas, terminology, status/Waiting/Maintenance contracts, local-only provenance, and customer-data boundaries remain unchanged; QA verifies all inventory metrics and no P50/P85 target/trendline additions.
