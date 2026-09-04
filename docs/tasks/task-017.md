# TASK 017 — Period-aware shared historical metrics

## Main status

`in-progress`

Owner: Main/ScrumMaster
Current stage: Designer
Scope lock: shared period-aware history inside existing metric insight popup

## User objective

Make every metric popup show useful, truthful history for the same selected Month, Quarter, Range, All-time, or named period without adding standalone charts or changing metric formulas.

## Architect handoff

Use one shared typed historical series and immutable selected-period snapshot. Apply deterministic monthly/quarterly/yearly buckets, aggregate versus point-in-time treatment, adjacent compatible comparison, deduplication, gap/conflict/version rules, provenance, and explicit loading/partial/unavailable/error/stale states. Preserve TASK 010–016 contracts; no P50 or special P85 target/trendline.

## Designer handoff

Complete: [docs/design/task-017.md](../design/task-017.md). Defines shared modal placement, adaptive bucket presentation, aggregate/point-in-time treatment, selected endpoint and partial boundaries, gaps/no inference, current/previous context, provenance, Team/Scrum Master variants, keyboard/focus/modal lifecycle, mobile/200% reflow, loading/retry/empty states, and acceptance criteria.

## Developer handoff

Blocked until Main routes the approved Designer handoff. Reuse the existing insight modal; do not add standalone charts, formulas, routes, P50/P85 target UI, or customer/workspace changes.

## QA verdict

Not started. QA must independently verify period authority/granularity, inventory coverage, aggregate versus point-in-time semantics, dedupe/conflict/gap behavior, provenance/state truth, accessibility, responsive layout, and unchanged prior contracts.

## Open follow-ups

- TASK 016 filesystem recovery and pilot authorization remain separate; TASK 017 must not expand into those flows.

## QA verdict (2026-09-04)

`FAIL`

Independent review of the current checkout found core contract blockers:

- **P1 — selected-period/bucket contract is not implemented:** `resolveHistoricalPeriodSnapshot` falls back to the latest available month for named `quarter`/`year` selections, and the builder filters only month strings. Explicit range boundary buckets are never marked partial. For quarter/year adaptive ranges, `bucketForMonth` groups months but `buildHistoricalMetricSeries` resolves each bucket by timestamp precedence, so aggregate metrics use the latest monthly value rather than an aggregate of the bucket's eligible observations. This violates selected endpoint, partial-boundary, and aggregate-period requirements.
- **P1 — gaps and comparison can be false:** the builder only emits buckets represented by inputs and `hasAdjacentPair` checks array adjacency, not calendar bucket adjacency. If an intervening month/quarter is absent entirely, the first and third buckets can be compared as if contiguous. `current` is also the last available point, not necessarily the selected endpoint, so a missing selected-period result can be presented as the current historical point.
- **P1 — point-in-time Bottleneck is not usable in the rendered popup:** App supplies a string Bottleneck value, but the modal maps every non-number point value to `null`; therefore the typed categorical series is rendered as unavailable and cannot provide the required point details/comparison semantics.
- **P1 — inventory/source semantics are incomplete:** the App constructs `leadTime: null` for every history point and assigns both `cycleTime` and `implementationTime` from `avgCycleTimeDays`, which is the existing Implementation Time snapshot field. Thus Lead Time has no history and the new Cycle Time series is populated from the wrong legacy field rather than a reproducible Task 012 active+implementing value. Waiting/Maintenance are also only copied when present in the progress snapshot; no explicit unavailable/partial provenance model is built for absent historical detail.

Validation evidence:

- Focused historical-series tests: 4/4 passed.
- `npm run check`: passed typecheck, 36 test files / 204 tests, and production build. Build emitted existing dynamic-import and bundle-size warnings.
- `git diff --check`: passed.
- No production code, customer data, workspace data, commit, push, or deploy was performed by QA. Existing dirty `Teams/**`, `workspace.json`, cache/import/customer files were kept out of scope.

Required remediation: implement the production period/bucket contract and executable tests for selected endpoint, partial clipping, aggregate versus point-in-time behavior, missing bucket gaps, Bottleneck strings, and the complete metric inventory before re-review. Task progression is blocked until a new QA review passes.

## QA re-review after remediation (2026-09-04)

`FAIL`

Focused review confirms that named endpoints, a calendar axis, selected-endpoint addressing, and Bottleneck string preservation were added, but the implementation still has core blockers:

- **P1 — persisted history loses the new contract fields:** `normalizeTeamProgressSnapshot` in `apps/sm-tool/src/lib/workspace.ts` still reads only the old progress fields plus `waitingTime`. It drops persisted `leadTimeDays`, `activeTimeDays`, `cycleTimeDays`, `bottleneck`, and `maintenanceLifecycle`. Consequently a real workspace reload cannot reliably provide the exact Lead/Cycle/Implementation mapping or point-in-time Bottleneck history that the App builder now expects.
- **P1 — aggregate buckets are not a truthful aggregate contract:** `aggregateBucketValue` averages already-aggregated monthly P85 values for `sle-p85`, rather than retaining/recomputing an existing percentile from eligible observations or marking the bucket unavailable/limited when that source is insufficient. It also aggregates duplicate same-month snapshots before deterministic same-period deduplication, so repeated persisted renders/import snapshots can double-count. Every multi-observation non-month bucket is marked `partial`, even when the bucket is complete; sample/usable counts remain only the latest input's counts rather than bucket totals.
- **P1 — explicit range boundary semantics remain absent:** `bucketForMonth` retains calendar bucket starts/ends (for example, a February–April range produces an unlabelled Jan–Mar and Apr–Jun bucket). No point is marked partial for the selected-range clipping, and aggregate values can include only the available persisted months without recording the required boundary policy.
- **P2 — provenance/config compatibility is incomplete:** App inputs force `source: "local-cache"`, `asOf: point.period`, and default semantic version for every metric. Waiting/Maintenance semantic/config metadata and per-point source/count/unknown details are not carried into the shared series, making config-sensitive comparisons and coverage less reproducible than the handoff requires.
- **P2 — categorical Team interaction is incomplete:** Bottleneck strings survive the typed series and are listed in the diagnostic table, but the rendered point interaction is explicitly suppressed for Bottleneck and Team has no table fallback, so the required shared point detail is not available consistently across both presentation modes.

Validation evidence:

- Focused `tests/historical-series.test.ts`: 6/6 passed.
- `npm run check`: passed typecheck, 36 test files / 206 tests, and production build. Existing Vite dynamic-import and bundle-size warnings remain.
- `git diff --check`: passed.
- QA made no production-code edits, commit, push, or deploy. Existing Teams/workspace/customer files remain out of scope.

Required next remediation: preserve the new snapshot fields through workspace normalization, dedupe before aggregation, implement metric-specific valid aggregation/percentile handling and bucket counts, mark clipped range endpoints partial, carry truthful semantic/config/source/provenance metadata, and add Team-accessible categorical point fallback. Next task remains blocked pending QA re-review.

## QA re-review 2 (2026-09-04)

`FAIL`

Remediation 2 fixes are present for field persistence, per-period deduplication, named endpoints, calendar gaps, and categorical Bottleneck point rendering. Remaining findings:

- **P1 — non-month range boundary clipping is still wrong:** `clippedBoundary` compares the untrimmed calendar bucket start/end to the selected month. For a range such as `2026-02..2026-04` resolved to quarters, Q1 is Jan–Mar and Q2 is Apr–Jun, so neither boundary is marked partial even though both are clipped. The tests cover only a monthly range and do not catch the quarter boundary case.
- **P1 — persisted P85 is still accepted when a non-month bucket has one input:** the guard sets P85 unavailable only when `bucketInputs.length > 1`; a single monthly persisted percentile is then used as a quarterly/yearly percentile. Without raw eligible observations this is not a valid P85 and must remain unavailable/limited.
- **P1 — historical aggregate provenance/counts are not truthful in App:** every metric input receives `sampleCount` and `usableCount` from `doneCount`, including Aging WIP, Bottleneck, flow-time values, and ratios. Bottleneck is point-in-time but App still labels its counts from done items. The resulting shared series can claim counts that do not describe the metric observation.
- **P2 — metric-specific semantic/config provenance is incomplete:** App forwards one top-level `semanticVersion`/`statusConfigVersion` and does not forward nested Waiting Time/Maintenance semantic versions or their state/coverage/asOf/capturedAt/source fields into each historical input. A config-sensitive series can therefore compare points without the required metric-specific compatibility metadata.
- **P2 — range comparison policy is incomplete:** the series compares the selected endpoint to the immediately preceding bucket inside the selected axis. For explicit ranges the handoff requires an immediately preceding equal-duration comparable range with the same boundary policy; no such previous-range selection or boundary-compatible comparison is represented.

Validation evidence:

- Focused `tests/historical-series.test.ts`: 8/8 passed.
- `npm run check`: passed typecheck, 36 test files / 209 tests, and production build. Existing Vite dynamic-import and bundle-size warnings remain.
- `git diff --check`: passed.
- QA made no production-code edits, commit, push, or deploy. Existing Teams/workspace/customer files remain out of scope.

Required remediation: add quarter/year clipped-boundary fixtures, reject every non-month persisted P85 without raw eligible observations, derive counts/state/provenance from each metric’s actual snapshot contract, carry nested semantic/config metadata, and implement/test equal-duration range comparison. Task remains blocked pending another independent QA review.

## QA re-review 3 (2026-09-04)

`FAIL`

Remediation 3 independently verified that workspace normalization now retains the added metric fields and that the builder deduplicates each month before bucket construction, supports raw-duration P85 input, preserves categorical Bottleneck values, and exposes metric metadata. Remaining blockers:

- **P1 — explicit range clipping is semantically wrong at aligned boundaries:** `clippedBoundary` uses `bucket.start <= selected.startMonth || bucket.end >= selected.endMonth`. A monthly `range:2026-02..2026-04` consists of complete February–April buckets, but the first and last are still marked `partial`; `bucketStart`/`bucketEnd` are not evidence of an actually clipped bucket. For quarter/year ranges the broad predicate marks boundary buckets, but the tests do not prove the correct strict-overlap behavior for both aligned and clipped cases. This makes partial state and coverage misleading.
- **P1 — equal-duration range comparison does not fail closed on gaps/compatibility:** `previousRangeInputs` is aggregated from whatever raw inputs exist before the range, without constructing a complete prior-range axis, requiring every bucket, deduplicating that prior range, or rejecting missing/intervening buckets. It can compare a partial/incomplete preceding range and uses only the latest previous input for semantic/status compatibility. This violates the no-gap-inference and compatible-period requirements.
- **P1 — aggregate P85 raw-input completeness is not established:** non-month P85 is calculated whenever any `rawEligibleValues` exist in a bucket. The builder does not prove that all eligible observations for the bucket are present, does not carry raw sample/usable coverage for the percentile, and can present a partial raw subset as a valid P85. The App’s production progress snapshots do not populate `rawEligibleValues`, so all production non-month P85 history is unavailable; the synthetic raw fixture does not validate incomplete raw coverage.
- **P1 — App still fabricates or omits metric-specific counts:** `historicalTrend` has generic `sample`/`usable` values from `doneCount`, while `metricMetadata` is only created from `Object.keys(sampleCounts)`. `buildTeamProgressSnapshot` supplies no `unknownCounts` and no `sampleCounts`/`usableCounts` entries for Bottleneck, Waiting Time %, or Maintenance %. Those series therefore lack truthful metric-specific counts/unknown coverage despite the shared contract exposing them.
- **P2 — metric-specific provenance is flattened/incomplete:** App derives one `asOf`/semantic/status metadata shape and only special-cases Waiting/Maintenance when a count key happens to exist; nested state, coverage, source and captured timestamps are not uniformly carried for all inventory metrics. This weakens reproducibility and version-break handling.

Validation evidence:

- Focused `tests/historical-series.test.ts`: 9/9 passed.
- `npm run check`: passed typecheck, 36 test files / 210 tests, and production build. Existing Vite dynamic-import and bundle-size warnings remain.
- `git diff --check`: passed.
- No browser/File System Access smoke was run; this review was source/test focused. QA made no production-code edits, commit, push, or deploy. Existing Teams/workspace/customer files remain out of scope.

Required remediation: distinguish aligned versus truly clipped boundaries with strict bucket overlap, build and validate a complete deduped previous-range axis before comparison, require complete raw eligible coverage for non-month P85 or mark it partial/unavailable, and populate/propagate per-metric counts, unknowns, state and provenance for the full inventory. Task remains blocked pending another QA review.

## Developer implementation evidence (2026-09-04)

- Added the typed shared contract and deterministic builder in `apps/sm-tool/src/lib/historical-series.ts`: immutable `PeriodSnapshot`, aggregate/point-in-time observation kind, month/quarter/year adaptive granularity, selected-end filtering, provenance, same-bucket precedence/conflict handling, adjacent comparison and explicit insufficient/unavailable states. Missing values stay unavailable and zero remains valid.
- Extended the App-owned historical payload (`apps/sm-tool/src/App.tsx:6272-6355`) from the existing local progress snapshots and passed one `historicalSeries` record into both Executive presentation modes. No Jira/network/token path, formula path or customer/workspace data was changed.
- Updated the existing `MetricInsightModal` in `apps/sm-tool/src/components/ExecutiveViews.tsx:837-914` to read the shared series for the full Executive inventory, retain existing focus/pin/table behavior, exclude future points, and suppress trends when no adjacent comparable pair exists. No standalone chart or P85 target/trendline was added.
- Added synthetic executable coverage in `tests/historical-series.test.ts` for selected endpoint/future exclusion, adaptive range granularity, aggregate versus point-in-time typing, deterministic dedupe/conflict, gap suppression, provenance and valid zero. Existing modal regression tests remain green.
- Validation: focused series/modal tests passed (8 tests); full `npm run check` passed typecheck, 36 test files / 204 tests, and production build; `git diff --check` passed. Build emitted only existing Vite dynamic-import and bundle-size warnings. No version bump, commit, push, deploy or customer/workspace data changes were made.

## Developer remediation evidence (2026-09-04)

## Developer remediation 2 evidence (2026-09-04)

## Developer remediation 3 evidence (2026-09-04)

## Developer remediation 4 evidence (2026-09-04)

- Exact month-aligned ranges remain complete (`partial: false`); non-month buckets are clipped and marked partial only when their calendar bucket crosses the selected range boundary. Clipped points carry the selected start/end boundaries and `clip-to-selection` policy.
- Explicit range comparison now requires the complete deduped preceding equal-duration calendar axis, available compatible values, and compatible metadata. Incomplete or missing prior buckets remain unavailable; a valid prior range is represented as a range comparison rather than an interior current-axis point.
- Non-month P85 uses the existing percentile function only with complete raw eligible coverage for every contributing input/bucket and compatible metadata. Persisted monthly P85 summaries or incomplete raw coverage never produce a quarterly/yearly percentile.
- Metric-specific historical metadata no longer reuses generic done counts: flow metrics, ratios, aging, throughput/stories, SLE, Waiting %, and Maintenance % use their own available counts; Bottleneck remains unknown when no source count exists. Waiting/Maintenance semantic and status-config versions are carried into points and compatibility checks.
- Added executable aligned/non-aligned boundary, complete/incomplete prior-range, incomplete/raw P85, reload/provenance and inventory metadata fixtures. Focused tests: 22/22 passed; full `npm run check`: typecheck, 36 test files / 210 tests, and production build passed; `git diff --check` passed. No version bump, commit, push, deploy, or customer/workspace data changes.

- Reload normalization now retains all flow/history fields and metric-scoped metadata. Historical inputs no longer inherit `doneCount`; each metric uses its own persisted sample/usable/unknown counts and source/as-of/capturedAt/semantic/config metadata when available.
- Range points clip their visible bucket boundaries for monthly, quarterly, and yearly granularity and mark selected start/end buckets partial under the persisted `clip-to-selection` policy. Explicit ranges compare against the preceding equal-duration range, not an interior current-axis bucket.
- Historical P85 values are never averaged across non-month buckets. A non-month bucket is unavailable unless reproducible raw eligible durations are supplied, in which case the existing percentile function is applied. Counts are preserved only when supplied and deduplicated observations are counted once.
- Added executable fixtures for reload preservation, quarterly clipping, raw-versus-summary P85 behavior, per-source provenance, and preceding equal-duration range comparison. Full validation: 36 test files / 210 tests passed, typecheck and production build passed, `git diff --check` passed. Existing Vite warnings remain; no customer/workspace data, version, commit, push, or deploy changes.

- `normalizeTeamProgressSnapshot` now preserves persisted Lead/Cycle/Implementation fields (`leadTimeDays`, `activeTimeDays`, `cycleTimeDays`), categorical `bottleneck`, Maintenance snapshot, and supplied source/as-of/semantic/config metadata through reload normalization.
- Historical bucket input is deduplicated per original period before quarter/year aggregation. Aggregate counts are summed only when supplied; point-in-time counts remain tied to the endpoint snapshot. Persisted monthly P85 values are not averaged into larger buckets; without reproducible raw eligible observations they remain unavailable with an explicit reason.
- Explicit ranges carry `boundaryPolicy: clip-to-selection`; first/last selected buckets are marked partial with a boundary reason. Missing provenance is preserved as unknown rather than replaced with `local-cache` or fabricated bucket dates.
- Bottleneck categorical points remain interactive in the shared popup for Team and Scrum Master presentations, retaining string values and accessible point details/table fallback.
- Added reload, range clipping, P85 non-aggregation, and no-fabricated-provenance fixtures. Focused tests: 21/21 passed; full `npm run check`: typecheck, 36 test files / 209 tests, and production build passed; `git diff --check` passed. Existing Vite warnings remain. No customer/workspace data, commit, push, deploy or version bump.

- Preserved named quarter/year endpoints (`YYYY-Qn` and `YYYY`) and the canonical range grammar while resolving one immutable period snapshot. The series builder now creates a complete calendar bucket axis through the selected endpoint, emits unavailable gap points, excludes future points, and compares only the immediately preceding calendar bucket.
- Aggregate-period buckets use the existing persisted observations within the bucket; point-in-time buckets retain the canonical latest period-end observation. Selected-endpoint absence remains unavailable rather than falling back to the latest earlier observation.
- Bottleneck values remain typed categorical strings through the series and modal contract. Equal categorical values are `unchanged`; different adjacent categorical values are `changed`; no numeric trend line is rendered for Bottleneck, while point/table provenance remains available.
- App history wiring uses the Task 012 sources: Lead Time from `leadTimeDays`, Cycle Time from `activeTimeDays`, and Implementation Time from `cycleTimeDays`; it no longer duplicates `avgCycleTimeDays` across the three fields.
- Added executable fixtures for named periods, complete endpoint axes, missing endpoint behavior, categorical changed/unchanged states, and retained zero/conflict/gap semantics. Focused tests: 14/14 passed. Full `npm run check`: typecheck, 36 test files / 206 tests, and production build passed. `git diff --check` passed. Existing Vite dynamic-import and bundle-size warnings remain. No version bump, commit, push, deploy, or customer/workspace data changes.

## QA re-review 6 (2026-09-04)

`FAIL`

Remediation 5 adds selected-range aggregation, prior-range dedupe/axis checks, raw P85 completeness flags, point state/coverage fields, and nested metadata propagation. Remaining blockers:

- **P1 — range comparison still mixes current and previous semantics:** `selectedAggregateValue` is computed, but the `HistoricalMetricSeries` current point remains the final bucket point. The comparison stores a range key and delta from the selected aggregate, while the modal resolves `currentSnapshot` by that range key against `points`, which contain bucket keys only. The current range value/provenance therefore cannot be consistently rendered from the comparison contract; selected-period current display falls back to the card value while history/comparison refer to different observations.
- **P1 — non-ready current points can still produce direction:** `compatible` only checks available values, semanticVersion, and statusConfigVersion. It does not require current/previous `state` to be ready/complete and coverageState to be complete. A stale, error-with-retry, conflict, or needs-review point with a numeric last-known value can therefore receive improved/worsened/unchanged comparison, while the modal displays that direction instead of suppressing it as required.
- **P1 — previous clipped-range completeness uses un-clipped buckets:** `completePrevious` calls `requiredMonthsForBucket(bucket)` with the full calendar bucket, not the previous range’s clipped boundary. For a valid 13–36 month range whose preceding range starts/ends mid-quarter, it requires months outside the comparable range and can incorrectly mark the valid partial-boundary comparison unavailable. The completeness check also validates only values/metadata, not the previous point’s explicit partial/boundary policy.
- **P2 — selected aggregate provenance/counts are not fully represented:** `selectedAggregateValue` is calculated from deduped inputs, but the returned series-level `asOf`, `capturedAt`, `source`, status/config and counts remain based on `current` endpoint point. This can show the endpoint snapshot’s provenance for a range aggregate built from multiple months rather than the selected aggregate’s actual coverage/provenance.

Validation evidence:

- Focused `tests/historical-series.test.ts`: 9/9 passed.
- `npm run check`: passed typecheck, 36 test files / 210 tests, and production build. Existing Vite dynamic-import and bundle-size warnings remain.
- `git diff --check`: passed.
- Browser/File System Access smoke was not run; this is an environment limitation. QA made no production-code edits, commit, push, or deploy. Existing Teams/workspace/customer files remain out of scope.

Required remediation: represent selected-range current as a first-class range point/value with matching modal lookup and provenance, gate comparison on ready/complete states, validate previous ranges using their clipped boundaries and policy, and derive range-level metadata from the same aggregate inputs. Task remains blocked pending another QA review.

## QA re-review 5 (2026-09-04)

`FAIL`

Remediation 4 is present and independently confirms improved workspace round-trip, strict month-aligned boundaries, clipped non-month bucket display, prior-range scaffolding, raw-P85 gating, metric count maps, and Team/Scrum Master Bottleneck point controls. Remaining blockers:

- **P1 — explicit-range current comparison is mismatched:** the selected endpoint `current.value` remains the final bucket value, while the previous value is aggregated from the preceding equal-duration range. A selected multi-month range is therefore compared as one endpoint bucket against a full prior range; a selected-range aggregate/current value with the same boundary policy is never constructed. This can produce a false delta/direction.
- **P1 — preceding-range completeness is not calendar-gap safe:** `completePrevious` requires at least one input per derived bucket, but does not require all calendar months in each bucket or verify equivalent clipped-boundary/coverage shape. A quarter/year bucket with missing months can pass. The prior-range path also does not reject same-period equal-time conflicts before `aggregateRangeValue`.
- **P2 — metric state/coverage is dropped before series construction:** App passes counts, source, timestamps and versions, but does not pass Waiting Time/Maintenance `state` or `coverageState` into `HistoricalMetricInput`; the builder never sets point state from them. Conflict, stale, error, needs-review, or partial metric snapshots can become ordinary available points/ready history.
- **P2 — Maintenance status-config provenance is flattened:** `metricMetadata` uses top-level `snapshot.metrics.statusConfigVersion` for the specialized Maintenance snapshot instead of its nested version, allowing invalid compatibility across Maintenance configuration changes.

Validation evidence:

- Focused `tests/historical-series.test.ts`: 9/9 passed.
- `npm run check`: passed typecheck, 36 test files / 210 tests, and production build. Existing Vite dynamic-import and bundle-size warnings remain.
- `git diff --check`: passed.
- No browser/File System Access smoke was run; this is an environment limitation. QA made no production-code edits, commit, push, or deploy. Existing Teams/workspace/customer files remain out of scope.

Required remediation: construct a selected-range current aggregate for range comparison, validate the full deduped month axis and equal-time conflicts for the preceding range, and preserve metric state/coverage plus nested status-config provenance through points and series state. Task remains blocked pending another QA review.

## Developer remediation 5 evidence (2026-09-04)

- Explicit ranges now compute comparison current values from the complete selected-range aggregate, while point-in-time metrics retain the selected endpoint snapshot. The preceding comparison uses the same equal-duration range key and is unavailable unless every required calendar month and bucket has a compatible, non-conflicting, complete observation.
- Quarter/year P85 buckets require raw eligible durations for every underlying selected month after boundary clipping. Persisted monthly percentile summaries and incomplete raw coverage remain unavailable with a truthful explanation; no percentile mean is produced.
- Historical inputs and points now carry metric-specific state, coverage state, source, as-of/captured-at, counts and semantic/config versions. Waiting Time and Maintenance use nested status-config provenance, and non-ready states cannot produce a ready series.
- Added executable fixtures for selected-range aggregate delta, incomplete preceding ranges, state/coverage/provenance propagation, aligned yearly boundaries and quarter clipping. Focused historical/workspace tests passed (21 tests); full `npm run check` passed typecheck, 36 test files / 213 tests, and production build. `git diff --check` passed. Existing Vite dynamic-import and bundle-size warnings remain. No version bump, commit, push, deploy, or customer/workspace data changes.

## Developer remediation 6 evidence (2026-09-04)

- Explicit ranges now replace the endpoint bucket in the shared series with a first-class `range:start..end` `HistoricalMetricPoint`. Its aggregate value, counts, state/coverage, source, as-of, captured-at, semantic version and status-config version are derived from the full selected input set; the modal resolves this point directly and does not use endpoint provenance for the selected range.
- Comparison requires healthy complete-state/coverage points and compatible metadata. Stale, error, conflict, needs-review, unavailable and non-complete points suppress direction/delta. Previous equal-duration ranges validate clipped boundary months under the same `clip-to-selection` policy while still rejecting internal gaps/conflicts.
- Added executable assertions for range point identity, aggregate metadata differing from endpoint values/counts, stale comparison suppression, and valid clipped preceding ranges. Focused historical-series tests: 14 passed; full `npm run check`: typecheck, 36 test files / 215 tests, and production build passed. `git diff --check` passed. Existing Vite warnings remain; no version bump, commit, push, deploy, or customer/workspace data changes.

## Developer remediation 7 evidence (2026-09-04)

- Partial points are no longer eligible for ordinary adjacent comparisons. Explicit clipped range comparisons remain allowed only through the dedicated selected/prior equal-duration range path with matching `clip-to-selection` policy.
- Previous range validation now rejects mixed semantic/config versions, mixed state or coverage, partial inputs, and equal-time conflicts across the full deduplicated range before exposing a comparison. The comparison contract carries current/previous boundary policy, aggregate counts and provenance for modal diagnostics.
- Bucket weighting now filters complete value/input pairs before applying sample weights, preventing null observations from shifting weights to another numeric observation. Maintenance usable counts now use recognized completed `maintenanceCount + lifecycleCount`, excluding unknown candidates.
- Added null-first weighted aggregation, explicit partial suppression, clipped-range comparison and range metadata fixtures. Focused historical-series tests: 15 passed; full `npm run check`: typecheck, 36 test files / 216 tests, and production build passed; `git diff --check` passed. Existing Vite warnings remain. No version bump, commit, push, deploy, or customer/workspace data changes.

## Developer remediation 8 evidence (2026-09-04)

- Boundary clipping is now explicit (`boundaryClipped`) on historical points and on range comparison metadata; data completeness remains a separate readiness gate. Complete clipped aggregates may compare only when selected and preceding ranges share the same clipping policy/shape. Partial, stale, error, conflict, needs-review and incomplete data remain comparison-ineligible.
- MetricInsightModal now exposes previous range source, as-of, captured-at, sample/usable/unknown counts, and current/previous clipping policy when a range comparison exists; it uses comparison metadata rather than an endpoint fallback.
- Added executable assertions for partial suppression, complete clipped-range comparison, range point provenance/counts and previous-range policy metadata. Focused historical-series tests: 15 passed; full `npm run check`: typecheck, 36 test files / 216 tests, and production build passed; `git diff --check` passed. Existing Vite warnings remain. No version bump, commit, push, deploy, or customer/workspace data changes.

## Developer remediation 9 evidence (2026-09-04)

- Every explicit range now materializes a stable `range:START..END` point even when provenance is missing, input is partial, the selected range is incomplete, or non-month P85 raw coverage is unavailable. The point carries its truthful value/availability, state, reason, clipping policy, counts and available provenance; the modal does not fall back to the endpoint or card value.
- Explicit-range current metadata is range-owned, while comparison remains gated by complete compatible data and matching boundary policy. Added regressions for missing provenance, partial input and unavailable non-month P85 with endpoint-fallback assertions.
- Maintenance usable counts remain recognized completed direct-child work (`maintenanceCount + lifecycleCount`), and null-filtered weighted bucket aggregation keeps value/input weights aligned. Focused historical-series tests: 17 passed; full `npm run check`: typecheck, 36 test files / 218 tests, and production build passed; `git diff --check` passed. Existing Vite warnings remain. No version bump, commit, push, deploy, or customer/workspace data changes.

## Developer remediation 10 evidence (2026-09-04)

- Non-month P85 ranges without complete raw eligible observations now materialize an explicit range point with `available: false`, `state: unavailable`, `coverageState: unavailable`, and a raw-coverage reason; they cannot be represented as ready/complete or use persisted endpoint P85 data.
- Equal-precedence selected-range value/source conflicts now materialize an explicit `conflict` range point with `coverageState: conflict` and a reconciliation reason. The comparison remains unavailable and no endpoint fallback is possible.
- Added executable regressions for unavailable non-month P85, partial input, missing provenance and equal-time range conflicts. Focused historical-series tests: 18 passed; full `npm run check`: typecheck, 36 test files / 219 tests, and production build passed; `git diff --check` passed. Existing Vite warnings remain. No version bump, commit, push, deploy, or customer/workspace data changes.

## Developer remediation 11 evidence (2026-09-04)

- Selected-range aggregate points now require all contributing inputs to carry one compatible semantic version and, when supplied/relevant, one compatible status-config version. Mixed or missing versions fail closed at the selected range point as `needs-review`/`unavailable` with an explicit reason; no ready/complete point or comparison is exposed.
- Added an executable mixed-selected-version regression covering point state, coverage, reason and comparison suppression. Focused historical-series tests: 19 passed; full `npm run check`: typecheck, 36 test files / 220 tests, and production build passed; `git diff --check` passed. Existing Vite warnings remain. No version bump, commit, push, deploy, or customer/workspace data changes.

## QA re-review 7 (2026-09-04)

`FAIL`

The remediation was independently inspected in the current checkout. The complete selected-range path does create a first-class `range:START..END` point, and the modal reads `comparison.currentValue` plus that range key. Focused and full validation are green, but core historical correctness and provenance requirements remain blocked:

- **P1 — partial points can still produce a comparison:** `isComparablePoint()` checks `available`, state and coverage, but does not reject `point.partial`. The selected range deliberately sets `partial: true` for clipped non-month boundaries, and ordinary bucket points also carry `partial`; both can therefore participate in `hasAdjacentPair()` and receive direction/delta. The requirement is to suppress comparison for partial as well as stale/error/conflict/needs-review data.
- **P1 — previous-range compatibility is proved by one raw snapshot only:** `completePrevious` validates bucket completeness, but the comparison condition uses only `previousLatest` for semantic/config compatibility. A preceding range containing multiple complete buckets with mixed semantic or status-config versions can therefore compare as if it were compatible. The previous range needs a single validated, deduped compatibility decision across every contributing point.
- **P1 — quarter/year weighted aggregation can apply the wrong sample weight:** `aggregateBucketValue()` filters null/non-numeric values into `numeric`, then indexes `bucketInputs[index]` while weighting that filtered array. When an earlier input is unavailable and a later input is numeric, the later value receives the earlier input’s weight. This changes aggregate historical values and can change comparison direction.
- **P1 — Maintenance historical usable count is still the candidate count:** `buildTeamProgressSnapshot()` writes `maintenance-pct` `usableCounts` from `candidateCount`, while the Task 015 denominator is the recognized completed direct-child total (`maintenanceCount + lifecycleCount`). Unknown/unproven candidates must reduce coverage and cannot be reported as usable observations.
- **P2 — selected-range point has no explicit range-level boundary/policy field:** the point carries clipped dates and a reason, but the comparison contract does not carry the previous point’s boundary policy or range-level counts/provenance. This makes it difficult for the modal/data details to demonstrate that both comparable ranges used the same clipping policy.

Validation evidence:

- Focused `tests/historical-series.test.ts`: 14/14 passed.
- `npm run check`: passed typecheck, 36 test files / 215 tests, and production build. Existing Vite dynamic-import and bundle-size warnings remain.
- `git diff --check`: passed.
- No browser/File System Access smoke was run; this remains an environment limitation. QA made no production-code edits, version bump, commit, push, or deploy. Existing Teams/workspace/customer files remain out of scope.

Required remediation: include `partial` in comparability gating, validate one compatible metadata/state/policy contract over the entire deduped preceding range, correct aggregate weighting after filtering, and expose recognized Maintenance counts as usable/coverage. Task remains blocked; the next task may not proceed.

## QA re-review 8 (2026-09-04)

`FAIL`

Remediation 7 fixes are present and independently verified: `isComparablePoint()` rejects ordinary partial points; previous-range inputs are deduplicated and checked across the complete month/submonth axis with conflict and metadata compatibility; numeric weighting keeps value/input pairs aligned; Maintenance usable counts use recognized Maintenance plus Lifecycle work; and range comparison exposes boundary policy and aggregate counts/provenance fields. The following issue remains against the stated contract:

- **P1 — clipped partial range comparison is still enabled without a typed distinction:** the selected range point sets `partial: true` whenever a quarter/year bucket is clipped, but the dedicated range comparison path does not call `isComparablePoint()` or otherwise reject that partial point. It explicitly compares the clipped range when `selectedPeriod.boundaryPolicy` is `clip-to-selection`. The same `partial` flag is used for incomplete metric data, so the implementation cannot guarantee that every partial point suppresses direction/change as required; a boundary-clipped point can still render a delta and direction. Boundary-policy compatibility should be represented separately from metric completeness, or partial must suppress comparison consistently.
- **P2 — modal does not render all previous-range provenance carried by the contract:** the comparison stores `previousSource`, `previousAsOf`, and `previousCapturedAt`, but the modal’s range data details only renders previous sample/usable counts and policy. It does not expose the previous range’s source/as-of/captured-at, weakening the required historical reproducibility evidence.

Validation evidence:

- Focused `tests/historical-series.test.ts`: 15/15 passed.
- `npm run check`: passed typecheck, 36 test files / 216 tests, and production build. Existing Vite dynamic-import and bundle-size warnings remain.
- `git diff --check`: passed.
- No browser/File System Access smoke was run; this remains an environment limitation. QA made no production-code edits, version bump, commit, push, or deploy. Existing Teams/workspace/customer files remain out of scope.

Required remediation: separate boundary clipping from metric partiality and make comparison gating explicit for the required partial semantics; render or otherwise expose the previous range’s source/as-of/captured-at in the modal and add executable regressions. Task remains blocked; the next task may not proceed.

## QA re-review 9 (2026-09-04)

`FAIL`

Remediation 8 fixes the previously reported boundary-policy distinction and renders the comparison’s previous source, as-of, captured-at, counts, unknown count and clipping metadata. It also correctly allows a fully covered clipped range to compare only when the preceding range has the same clipping shape. A remaining P1 affects selected-range truthfulness:

- **P1 — incomplete/unavailable selected ranges still fall back to the endpoint/card:** `selectedRangeAggregatePoint` is created only when `selectedRangeComplete` is true and `selectedAggregateValue` is non-null. When selected-range inputs are partial, stale/error/needs-review, missing required provenance, or a non-month P85 lacks complete raw observations, no `range:START..END` point is inserted. The series then retains the endpoint bucket and the modal resolves its current snapshot/value/provenance from that endpoint or the card fallback. This can show a value and as-of/counts for the selected endpoint instead of the selected range’s truthful unavailable/partial state, and violates the first-class selected-range point contract.

The rest of the reviewed remediation is consistent with the handoff: ordinary partial/stale/error/conflict/needs-review inputs are excluded from range comparison, previous ranges require deduped complete calendar/submonth coverage and compatible metadata, weighting is aligned after null filtering, Maintenance usable counts are recognized direct-child counts, and range comparison diagnostics are carried through to the modal.

Validation evidence:

- Focused `tests/historical-series.test.ts`: 15/15 passed.
- `npm run check`: passed typecheck, 36 test files / 216 tests, and production build. Existing Vite dynamic-import and bundle-size warnings remain.
- `git diff --check`: passed.
- No browser/File System Access smoke was run; this remains an environment limitation. QA made no production-code edits, version bump, commit, push, or deploy. Existing Teams/workspace/customer files remain out of scope.

Required remediation: always materialize the selected `range:START..END` point, including unavailable/partial/error/needs-review outcomes, with selected-range state/reason and selected-range provenance/counts when available; ensure the modal never substitutes the endpoint/card for an explicit range. Add focused regression fixtures for incomplete provenance, partial input and unavailable non-month P85. Task remains blocked; the next task may not proceed.

## QA re-review 10 (2026-09-04)

`FAIL`

Remediation 9 fixes the prior P1: every explicit range now materializes a stable `range:START..END` point, including incomplete provenance, partial input and non-month P85 without raw observations, and the modal uses that point rather than endpoint/card fallback. The selected/previous range comparison gate, clipping policy, full deduplicated axis, weighting, Maintenance counts and prior inventory/path checks were also re-inspected.

Remaining core state/provenance findings:

- **P1 — unavailable non-month P85 is labeled `ready`:** when all selected monthly inputs have complete metadata but no reproducible raw eligible durations, `selectedRawComplete` is false and the range value is unavailable, yet `selectedRangeState` falls through to `ready` and `selectedRangeCoverage` to `complete`. The materialized point therefore combines `available: false` with `state: "ready"`/`coverageState: "complete"`, while the modal reports a ready history state alongside an unavailable P85. This is contradictory and violates truthful unavailable/limited P85 state handling.
- **P2 — selected-range conflict state is not preserved:** `hasRangeConflict(relevant)` prevents a range aggregate, but `selectedRangeState` does not consult that conflict flag unless an input already carries a conflict state. Equal-time conflicting values/sources can therefore materialize as `state: "unavailable"` with a generic missing-metadata reason rather than `conflict` and a conflict reason. Comparison is suppressed, but diagnostic provenance is not truthful.

Validation evidence:

- Focused `tests/historical-series.test.ts`: 17/17 passed.
- `npm run check`: passed typecheck, 36 test files / 218 tests, and production build. Existing Vite dynamic-import and bundle-size warnings remain.
- `git diff --check`: passed.
- No browser/File System Access smoke was run; this remains an environment limitation. QA made no production-code edits, version bump, commit, push, or deploy. Existing Teams/workspace/customer files remain out of scope.

Required remediation: classify non-month P85 without complete raw eligible coverage as unavailable/limited rather than ready/complete, preserve equal-time selected-range conflicts as conflict with a diagnostic reason, and add executable assertions for both states. Task remains blocked; the next task may not proceed.

## QA re-review 11 (2026-09-04)

`FAIL`

Remediation 10 fixes both prior findings: non-month P85 without raw coverage now materializes as unavailable with unavailable coverage and a specific reason; equal-precedence selected-range conflicts now materialize as conflict with a conflict reason and no comparison; explicit range points and modal lookup remain endpoint-fallback-safe.

Remaining blocker:

- **P1 — selected-range version breaks remain value-visible instead of fail-closed:** selected-range completeness checks each input’s metadata but do not require one semantic version and one status-config version across the selected range. Mixed versions leave `selectedRangeAggregatePoint` with undefined version metadata while retaining `state: "ready"`, `coverageState: "complete"`, `available: true`, and an aggregate value. The comparison is suppressed because the current version is undefined, but the modal still presents the mixed-version aggregate as a trustworthy current value. Historical version breaks must produce needs-review/unavailable state, not a ready aggregate.

This was not covered by the current focused fixtures, which cover prior-range mixed metadata but not mixed selected-range metadata.

Validation evidence:

- Focused `tests/historical-series.test.ts`: 18/18 passed.
- `npm run check`: passed typecheck, 36 test files / 219 tests, and production build. Existing Vite dynamic-import and bundle-size warnings remain.
- `git diff --check`: passed.
- No browser/File System Access smoke was run; this remains an environment limitation. QA made no production-code edits, version bump, commit, push, or deploy. Existing Teams/workspace/customer files remain out of scope.

Required remediation: validate selected-range semantic/config/source compatibility across all deduped inputs and materialize a truthful needs-review/unavailable point on mismatch, with an executable mixed-selected-version regression. Task remains blocked; the next task may not proceed.

## QA re-review 12 (2026-09-04)

`PASS WITH FOLLOW-UPS`

Remediation 11 is independently verified. Selected explicit ranges now require one compatible semantic version and, when applicable, one compatible status-config version across every contributing deduplicated input. Mixed or missing versions materialize the stable `range:START..END` point as `available: false`, `state: "needs-review"`, `coverageState: "unavailable"`, with an explicit reason; the modal resolves that range point exclusively and does not fall back to the endpoint/card. Compatible ranges remain ready and retain selected-range aggregate value, counts and provenance.

Prior TASK 017 requirements were rechecked: complete deduplicated preceding calendar/submonth axis; boundary clipping and matching policy; conflict/gap/no-future suppression; ready/complete comparison gate; null-safe weighted aggregation; raw-complete non-month P85 only; per-metric counts/provenance and nested Waiting/Maintenance metadata; Bottleneck categorical Team/Scrum Master access; selected endpoint and period authority; and Task 010–016 formulas, semantics and data safety. No Jira/network/token/admin, customer/workspace or unrelated data changes were made.

Validation evidence:

- Focused `tests/historical-series.test.ts`: 19/19 passed, including mixed selected-version fail-closed coverage.
- `npm run check`: passed typecheck, 36 test files / 220 tests, and production build. Existing Vite dynamic-import and bundle-size warnings remain.
- `git diff --check`: passed.
- Browser/File System Access smoke was not run because the environment does not provide that runtime; this is a follow-up only. QA made no production-code edits, version bump, commit, push or deploy.

Next step: task is QA-cleared with the browser/File System Access smoke follow-up recorded. The next task may begin.

## Release QA v0.5.12 (2026-09-04)

`PASS`

- Root `package.json`, root `package-lock.json`, app `apps/sm-tool/package.json` and app `apps/sm-tool/package-lock.json` are all `0.5.12`; both lockfile root package entries also match.
- The four release-file diffs contain version-only hunks. Dependency names, versions, lockfile structure and scripts are unchanged.
- The approved TASK 017 historical-series implementation remains present, including explicit range points, selected-range compatibility gating, range provenance and truthful unavailable/conflict states.
- Existing dirty `Teams/**`, imports/cache files, `workspace.json` and unrelated source/task files were inspected as pre-existing shared-checkout changes and excluded from the release bump scope. No token/customer data was added by the release files.
- `npm run check` passed: typecheck, 36 test files / 220 tests, and production build. Existing Vite dynamic-import and bundle-size warnings remain.
- `git diff --check` passed. QA made no production-code edits, commit, push or deploy.

Release verdict: PASS. The release bump is clear to proceed; no next-task block remains from this release QA.
