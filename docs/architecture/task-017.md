# TASK 017 — Period-aware shared historical metrics

## Status and boundary

Architecture-only handoff. This task defines one shared historical snapshot/series contract for all metric insight popups and cards. It does not change metric formulas, Jira/network/token/admin flows, or customer/workspace data. TASK 016 filesystem recovery and pilot authorization remains separate and in progress.

Designer is required for popup presentation and responsive/a11y behavior, then Developer, then independent QA. No per-metric ad hoc history graphs are permitted.

## Objective and metric inventory

All Executive metric insight popups use the same period-aware history service and typed series model. The inventory is:

- Stories Done
- Throughput
- Avg Cycle Time
- SLE P85
- Aging WIP
- Done Bug Ratio
- Velocity
- Bottleneck
- Lead Time
- Cycle Time using TASK 012 new presentation semantics
- Implementation Time using TASK 012 new presentation semantics
- Waiting Time % using TASK 014 semantics
- Maintenance % using TASK 015 semantics, when configured and available

A metric without reproducible history still gets its current value and explanation; its history state is unavailable with a reason. Do not add P50 or a special P85 target/trendline.

## Selected-period authority and granularity

The selected period/filter is resolved once into an immutable PeriodSnapshot containing canonical start, end, selection kind, timezone/calendar basis, granularity, and semantic reference. Team, Scrum Master, cards, and MetricInsightModal receive that same snapshot. No surface may use current date or latest history as an implicit endpoint.

Granularity is deterministic:

- Month selection: calendar-month buckets, including the selected month and the existing historical window ending there.
- Quarter selection: calendar-quarter buckets, including the selected quarter and the existing historical window ending there.
- Explicit range: use monthly buckets for a span of 12 calendar months or fewer; quarterly buckets for 13–36 months; yearly buckets above 36 months. The same thresholds apply to all-time, using the reproducible local history extent as its end, not today.
- Explicit range boundaries are preserved. A boundary bucket that is only partly covered is labelled partial and its aggregate uses only the selected-range portion; it is not silently compared with a full bucket.
- If an existing named filter already specifies a granularity, that canonical named rule wins over the adaptive threshold and is persisted in the PeriodSnapshot.

Each series declares its granularity and bucket keys. The current card value remains the exact selected-period result; a bucket series is used only for historical context. Historical points after the selected end are excluded even when present in cache.

For current-versus-previous comparison, use the immediately preceding comparable period with the same duration/granularity and compatible metric/config semantics. For a selected month or quarter, this is the prior calendar month/quarter. For a range, it is the immediately preceding range of equal calendar length and the same boundary policy. If such a period is unavailable or non-contiguous, show comparison unavailable rather than infer from a distant point.

## Aggregate versus point-in-time metrics

Every registry entry declares observationKind:

- Aggregate-period: Stories Done, Throughput, Avg Cycle Time, SLE P85, Done Bug Ratio, Velocity, Lead Time, Cycle Time, Implementation Time, Waiting Time %, and Maintenance %. Values summarize eligible observations/durations/items inside the bucket using the existing formulas and TASK 012–015 semantics.
- Point-in-time: Aging WIP and Bottleneck. Values represent the selected period's canonical snapshot/end-of-period state, using the existing source contract. They must not be summed or averaged across time unless an existing metric contract already defines that behavior.

SLE P85 remains the existing percentile calculation on the existing sample and working-day basis; this task only assigns it to an aggregate bucket and adds provenance. No formula redesign or target line is introduced. For sparse point-in-time history, show gaps/partial states rather than turning an end snapshot into an aggregate.

## Shared typed contract

The shared normalized model should be additive and versioned:

    type HistoricalMetricSeries = {
      metricId: StableMetricId;
      observationKind: "aggregate-period" | "point-in-time";
      unit: string;
      granularity: "month" | "quarter" | "year";
      selectedPeriod: PeriodSnapshot;
      points: HistoricalMetricPoint[];
      comparison?: HistoricalComparison;
      semanticVersion: string;
      statusConfigVersion?: string;
      state: "ready" | "partial" | "unavailable" | "error" | "stale";
      source: "local-import" | "local-cache" | "local-recalculation";
      asOf?: string;
      capturedAt?: string;
      reason?: string;
    };

    type HistoricalMetricPoint = {
      bucketKey: string;
      bucketStart: string;
      bucketEnd: string;
      value?: number | string;
      available: boolean;
      partial: boolean;
      sampleCount?: number;
      usableCount?: number;
      unknownCount?: number;
      asOf?: string;
      capturedAt?: string;
      source?: string;
      semanticVersion?: string;
      statusConfigVersion?: string;
      reason?: string;
    };

    type HistoricalComparison = {
      currentBucketKey: string;
      previousBucketKey?: string;
      delta?: number;
      direction: "improved" | "worsened" | "unchanged" | "unavailable";
      reason?: string;
    };

A numeric metric's unit/formatter and lower-is-better/higher-is-better/categorical direction remain in the TASK 010/011 registry. Bottleneck is categorical and compares changed/unchanged only. Zero is valid; missing/unavailable is not zero. sampleCount and usableCount are unknown when the source cannot provide them.

The series identity includes team scope, metricId, granularity, selected-period semantic, import signature/source snapshot, metric semanticVersion, and TASK 013 statusConfigVersion where relevant. This prevents mixing differently configured values.

## Deduplication, gaps, and semantic compatibility

Normalize legacy and new snapshots by team/metric/bucketKey, then apply TASK 010 deterministic same-period precedence. One canonical point per bucket is allowed. Equal-precedence conflicting values are conflict/unavailable, not averaged.

A point is comparable only if its bucket is adjacent under the same granularity, period boundaries are compatible, and semanticVersion/statusConfigVersion are compatible. Missing intervening buckets produce a gap and no direction claim. A config/status semantic-version change creates a series break; keep both histories labelled but do not compare across the break. Changed import signature alone does not make a metric incomparable if the metric semantics and bucket are otherwise compatible, but provenance must show the source snapshot.

## Backfill and forward persistence

Backfill is allowed only from existing local imported CSV-derived caches or legacy progressHistory when the bucket, metric identity, formula semantics, and source timestamp are reproducible. Reuse existing normalized fields and dedupe; do not recompute with a new formula merely to populate history. If a legacy snapshot lacks period, observation kind, asOf, counts, or semantic version, retain it as legacy/limited or unavailable for comparison and never fabricate metadata.

On successful approved local recalculation, persist one normalized snapshot/series point per team, metric, bucket, selected-period semantic, and compatible status configuration. Repeated renders do not create history. Failed recalculation does not replace the last-known point. Persistence remains inside the existing approved local cache/output boundary.

## State, provenance, and last-known behavior

States are loading, ready-complete, partial, insufficient-history, unavailable-no-history, unavailable-no-compatible-period, conflict, error-with-retry, and stale-last-known. The current card value and popup explanation remain available while history is loading or failing. Retry is local-only. asOf is the metric observation/bucket endpoint; capturedAt is local snapshot/calculation time; source is local import/cache/recalculation. Last data update and Last calculated remain distinct.

Partial means a value exists but one or more source rows, buckets, counts, or boundary periods are missing. Insufficient-history means fewer than two comparable points; one point may be shown without direction. Unavailable means no truthful point can be produced. Error retains last-known series with explicit stale/error context.

## Presentation and accessibility

Team view uses the shared MetricInsightModal with a concise line/sparkline or text summary, selected/current value, previous comparable period, direction, unit, asOf, and one data-quality note. Scrum Master view uses the same values/series and may add bucket table, counts, semantic/config versions, source, partial gaps, and backfill limitations. No duplicate trend panel is introduced.

The card and popup remain keyboard/touch operable under TASK 010/011: labelled info/insight control, focus trap, Escape/outside-close, focus restoration, point Arrow/Home/End navigation, pinned detail, visible focus, text/table fallback, no hover-only meaning, 200% zoom, mobile reflow, reduced motion, and color-independent states.

## Exact implementation surfaces

- apps/sm-tool/src/types/contracts.ts: PeriodSnapshot, HistoricalMetricSeries/Point/Comparison, observation kind, semantic/config versions, and state metadata.
- apps/sm-tool/src/lib/period.ts: canonical month/quarter/year bucket and preceding-period helpers.
- apps/sm-tool/src/lib/metrics.ts and existing history normalization: shared series construction, aggregate versus point-in-time handling, dedupe, compatibility, and no formula duplication.
- apps/sm-tool/src/lib/workspace.ts: local legacy backfill/read and forward persistence within approved cache boundaries.
- apps/sm-tool/src/App.tsx: resolve selected period once and pass one series payload to all views.
- apps/sm-tool/src/components/ExecutiveViews.tsx and MetricInsightModal/current insight component: card-specific rendering from shared series.
- apps/sm-tool/src/styles.css: chart/table, popup, responsive, focus, and state styling.
- Existing synthetic unit/component/browser test locations: fixtures only, no customer/workspace data.

## Risks and non-goals

Risks include wrong adaptive boundaries, partial range comparison, mixing aggregate and point-in-time values, duplicate legacy snapshots, semantic changes across status/config versions, false metadata, and future data leaking into historical views. Mitigate with immutable PeriodSnapshot, explicit observationKind, versioned series identity, deterministic dedupe, gap-aware comparison, and state/provenance fields.

Non-goals are changing any metric formula, adding P50 or P85 target/trendline, Jira/network/token/admin integration, arbitrary history reconstruction, direct customer-data writes, or changing TASK 012–016 contracts.

## Acceptance criteria

1. Month, quarter, explicit range, and all-time selections resolve deterministic granularity and use the selected period as the authoritative endpoint.
2. All cards and both Team/Scrum Master views consume one shared typed series contract and consistent selected-period snapshot.
3. Aggregate-period and point-in-time metrics are explicitly distinguished and never incorrectly aggregated.
4. Legacy progressHistory is backfilled only when reproducible; forward recalculation persists compatible points without duplicate render writes.
5. Same-period snapshots dedupe deterministically; conflicts, gaps, and semantic/config-version breaks prevent false comparisons.
6. Previous comparison uses the adjacent equal-duration compatible period; no gap inference or future data leakage.
7. asOf, capturedAt, source, sampleCount, usableCount, unknown/partial state, and last-known/stale semantics are truthful.
8. Team concise and Scrum Master diagnostic presentations have identical values/series and meet accessibility/responsive requirements.
9. Executive inventory is covered: Stories Done, Throughput, Avg Cycle Time, SLE P85, Aging WIP, Done Bug Ratio, Velocity, Bottleneck, Lead/Cycle/Implementation, Waiting Time %, and Maintenance % when available.
10. No P50, special P85 target/trendline, formula, status semantics, Jira/network/token/admin flow, or customer/workspace boundary is changed.

## Focused tests

- Month/quarter/range/all-time PeriodSnapshot and adaptive granularity threshold tests, including explicit selected period before latest history.
- Boundary month/quarter/range clipping and equal-duration previous comparison.
- Aggregate versus point-in-time fixtures for every inventory metric.
- Legacy progressHistory backfill, missing metadata, forward persistence, render idempotence, and current-value retention on failure.
- Same-period deterministic dedupe, equal-precedence conflict, missing gap, one-point, incompatible semantic/config version, and no-future-point tests.
- Shared series identity/payload parity across Team, Scrum Master, cards, and MetricInsightModal.
- asOf/capturedAt/source/count/partial/stale/error/unavailable state tests.
- Keyboard/focus/modal/table fallback and responsive/accessibility regressions.
- Formula, TASK 012–015 semantic, local-only provenance, no-P50/special-P85, and synthetic-only data-safety regressions.
