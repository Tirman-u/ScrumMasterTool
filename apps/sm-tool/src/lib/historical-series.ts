import { countMonthsInclusive, getMonthOffset, isMonthPeriod, parseRangePeriod } from "./period";
import { percentileInc } from "./metrics";

export type HistoricalObservationKind = "aggregate-period" | "point-in-time";
export type HistoricalGranularity = "month" | "quarter" | "year";
export type HistoricalSeriesState = "ready" | "partial" | "insufficient-history" | "unavailable-no-history" | "unavailable-no-compatible-period" | "conflict" | "error" | "stale";
export type HistoricalSeriesSource = "local-import" | "local-cache" | "local-recalculation";

export interface PeriodSnapshot { selection: string; startMonth: string | null; endMonth: string | null; granularity: HistoricalGranularity; timezone: string; calendarBasis: "calendar-month" | "calendar-quarter" | "calendar-year" | "named-rule" | "local-history-extent"; boundaryPolicy: "full-period" | "clip-to-selection"; semanticReference: string; }
export interface HistoricalMetricPoint { bucketKey: string; bucketStart: string; bucketEnd: string; value?: number | string; available: boolean; partial: boolean; boundaryClipped?: boolean; sampleCount?: number; usableCount?: number; unknownCount?: number; asOf?: string; capturedAt?: string; source?: HistoricalSeriesSource; semanticVersion?: string; statusConfigVersion?: string; state?: HistoricalSeriesState | string; coverageState?: "complete" | "partial" | "unavailable" | "conflict"; reason?: string; }
export interface HistoricalComparison { currentBucketKey: string; previousBucketKey?: string; currentValue?: number | string; previousValue?: number | string; currentBoundaryPolicy?: PeriodSnapshot["boundaryPolicy"]; previousBoundaryPolicy?: PeriodSnapshot["boundaryPolicy"]; currentBoundaryClipped?: boolean; previousBoundaryClipped?: boolean; currentSampleCount?: number; previousSampleCount?: number; currentUsableCount?: number; previousUsableCount?: number; currentUnknownCount?: number; previousUnknownCount?: number; currentSource?: HistoricalSeriesSource; previousSource?: HistoricalSeriesSource; currentAsOf?: string; previousAsOf?: string; currentCapturedAt?: string; previousCapturedAt?: string; delta?: number; direction: "improved" | "worsened" | "unchanged" | "changed" | "unavailable"; reason?: string; }
export interface HistoricalMetricSeries { metricId: string; observationKind: HistoricalObservationKind; unit: string; granularity: HistoricalGranularity; selectedPeriod: PeriodSnapshot; points: HistoricalMetricPoint[]; comparison: HistoricalComparison; semanticVersion: string; statusConfigVersion?: string; state: HistoricalSeriesState; source?: HistoricalSeriesSource; asOf?: string; capturedAt?: string; reason?: string; }
export interface HistoricalMetricInput { metricId: string; observationKind: HistoricalObservationKind; unit: string; value: number | string | null; period: string; capturedAt: string; asOf?: string; source?: HistoricalSeriesSource; sampleCount?: number; usableCount?: number; unknownCount?: number; rawEligibleValues?: number[]; rawEligibleComplete?: boolean; partial?: boolean; semanticVersion?: string; statusConfigVersion?: string; state?: HistoricalSeriesState | string; coverageState?: "complete" | "partial" | "unavailable" | "conflict"; }

export function resolveHistoricalPeriodSnapshot(selection: string, availablePeriods: string[], semanticReference = "task-017-v1"): PeriodSnapshot {
  const range = parseRangePeriod(selection);
  const validMonths = availablePeriods.filter(isMonthPeriod).sort();
  const quarter = selection.match(/^(\d{4})-Q([1-4])$/);
  const year = selection.match(/^(\d{4})$/);
  const namedStart = quarter ? `${quarter[1]}-${String((Number(quarter[2]) - 1) * 3 + 1).padStart(2, "0")}` : year ? `${year[1]}-01` : null;
  const namedEnd = quarter ? getMonthOffset(namedStart!, 2) : year ? `${year[1]}-12` : null;
  const startMonth = range?.startMonth ?? namedStart ?? (isMonthPeriod(selection) ? validMonths[0] ?? selection : validMonths[0] ?? null);
  const endMonth = range?.endMonth ?? namedEnd ?? (isMonthPeriod(selection) ? selection : validMonths.at(-1) ?? null);
  const span = startMonth && endMonth ? countMonthsInclusive(startMonth, endMonth) : validMonths.length;
  const namedGranularity: HistoricalGranularity | null = quarter || selection === "quarter" ? "quarter" : year || selection === "year" ? "year" : null;
  const granularity = namedGranularity ?? (span > 36 ? "year" : span > 12 ? "quarter" : "month");
  return { selection, startMonth, endMonth, granularity, timezone: "local", calendarBasis: selection === "all" ? "local-history-extent" : namedGranularity ? "named-rule" : granularity === "month" ? "calendar-month" : granularity === "quarter" ? "calendar-quarter" : "calendar-year", boundaryPolicy: range ? "clip-to-selection" : "full-period", semanticReference };
}

type Bucket = { key: string; start: string; end: string };
function bucketForMonth(month: string, granularity: HistoricalGranularity): Bucket {
  const [year, monthNumber] = month.split("-").map(Number);
  if (granularity === "year") return { key: `${year}`, start: `${year}-01`, end: `${year}-12` };
  if (granularity === "quarter") { const quarter = Math.floor((monthNumber - 1) / 3) + 1; const start = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}`; return { key: `${year}-Q${quarter}`, start, end: getMonthOffset(start, 2) }; }
  return { key: month, start: month, end: month };
}
function isWithinSelectedWindow(period: string, snapshot: PeriodSnapshot): boolean { return isMonthPeriod(period) && (!snapshot.startMonth || period >= snapshot.startMonth) && (!snapshot.endMonth || period <= snapshot.endMonth); }
function monthAxis(start: string | null, end: string | null): string[] { if (!start || !end || start > end) return []; const result: string[] = []; for (let current = start; current <= end && result.length < 2400; current = getMonthOffset(current, 1)) result.push(current); return result; }
function comparePrecedence(left: HistoricalMetricPoint, right: HistoricalMetricPoint): HistoricalMetricPoint | "conflict" { const leftTime = Date.parse(left.capturedAt ?? ""); const rightTime = Date.parse(right.capturedAt ?? ""); if (leftTime > rightTime) return left; if (rightTime > leftTime) return right; if (left.value === right.value && left.source === right.source) return left; return "conflict"; }
function isComparablePoint(point: HistoricalMetricPoint | undefined): boolean {
  return Boolean(point?.available && !point.partial && point.value !== undefined
    && (point.state === undefined || point.state === "ready" || point.state === "complete")
    && (point.coverageState === undefined || point.coverageState === "complete"));
}
function hasAdjacentPair(points: HistoricalMetricPoint[], currentIndex: number): boolean { const previous = currentIndex > 0 ? points[currentIndex - 1] : undefined; const current = points[currentIndex]; return Boolean(isComparablePoint(previous) && isComparablePoint(current)); }
function aggregateBucketValue(metricId: string, bucketInputs: HistoricalMetricInput[], granularity: HistoricalGranularity): number | string | null {
  const pointInTime = bucketInputs[0]?.observationKind === "point-in-time";
  if (pointInTime) return bucketInputs.slice().sort((left, right) => right.period.localeCompare(left.period) || right.capturedAt.localeCompare(left.capturedAt))[0]?.value ?? null;
  if (granularity === "month") return bucketInputs.slice().sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0]?.value ?? null;
  const numericInputs = bucketInputs.filter((item): item is HistoricalMetricInput & { value: number } => typeof item.value === "number" && Number.isFinite(item.value));
  if (numericInputs.length === 0) return bucketInputs[0]?.value ?? null;
  if (numericInputs.length === 1) return numericInputs[0].value;
  if (["stories-done", "throughput", "velocity"].includes(metricId)) return numericInputs.reduce((sum, item) => sum + item.value, 0);
  const weight = numericInputs.reduce((sum, item) => sum + (item.sampleCount ?? 1), 0);
  return numericInputs.reduce((sum, item) => sum + item.value * (item.sampleCount ?? 1), 0) / Math.max(1, weight);
}
function aggregateRangeValue(metricId: string, rangeInputs: HistoricalMetricInput[]): number | string | null {
  if (rangeInputs[0]?.observationKind === "point-in-time") return rangeInputs.slice().sort((left, right) => right.period.localeCompare(left.period) || right.capturedAt.localeCompare(left.capturedAt))[0]?.value ?? null;
  const numeric = rangeInputs.map((item) => item.value).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!numeric.length) return rangeInputs[0]?.value ?? null;
  if (["stories-done", "throughput", "velocity"].includes(metricId)) return numeric.reduce((sum, value) => sum + value, 0);
  const weight = rangeInputs.reduce((sum, item) => sum + (typeof item.value === "number" && Number.isFinite(item.value) ? item.sampleCount ?? 1 : 0), 0);
  return rangeInputs.reduce((sum, item) => sum + (typeof item.value === "number" && Number.isFinite(item.value) ? item.value * (item.sampleCount ?? 1) : 0), 0) / Math.max(1, weight);
}
function dedupeRangeInputs(rangeInputs: HistoricalMetricInput[]): HistoricalMetricInput[] {
  const byPeriod = new Map<string, HistoricalMetricInput>();
  rangeInputs.forEach((item) => { const existing = byPeriod.get(item.period); if (!existing || item.capturedAt > existing.capturedAt) byPeriod.set(item.period, item); });
  return Array.from(byPeriod.values());
}
function hasRangeConflict(rangeInputs: HistoricalMetricInput[]): boolean {
  const byPeriod = new Map<string, HistoricalMetricInput>();
  for (const item of rangeInputs) {
    const existing = byPeriod.get(item.period);
    if (existing && existing.capturedAt === item.capturedAt && (existing.value !== item.value || existing.source !== item.source)) return true;
    if (!existing || item.capturedAt > existing.capturedAt) byPeriod.set(item.period, item);
  }
  return false;
}
function requiredMonthsForBucket(bucket: Bucket): string[] {
  return monthAxis(bucket.start, bucket.end);
}
function hasRequiredCompleteMetadata(item: HistoricalMetricInput, metricId: string): boolean {
  return item.value !== null && item.value !== undefined && !item.partial && Boolean(item.semanticVersion && item.source && item.capturedAt)
    && (item.coverageState === undefined || item.coverageState === "complete")
    && (item.state === undefined || item.state === "ready" || item.state === "complete")
    && (!(["waiting-time-pct", "maintenance-pct"].includes(metricId)) || Boolean(item.statusConfigVersion));
}

export function buildHistoricalMetricSeries(inputs: HistoricalMetricInput[], selectedPeriod: PeriodSnapshot, direction: "higher" | "lower" | "categorical", semanticVersion = "task-017-v1"): HistoricalMetricSeries {
  const metricId = inputs[0]?.metricId ?? "unknown";
  const relevant = inputs.filter((input) => input.metricId === metricId && isWithinSelectedWindow(input.period, selectedPeriod));
  const grouped = new Map<string, HistoricalMetricInput[]>();
  relevant.forEach((input) => { const key = bucketForMonth(input.period, selectedPeriod.granularity).key; grouped.set(key, [...(grouped.get(key) ?? []), input]); });
  const byBucket = new Map<string, HistoricalMetricPoint | "conflict">();
  grouped.forEach((rawBucketInputs, bucketKey) => {
    const byPeriod = new Map<string, HistoricalMetricInput>();
    let hasConflict = false;
    rawBucketInputs.forEach((item) => {
      const existing = byPeriod.get(item.period);
      if (!existing) { byPeriod.set(item.period, item); return; }
      if (existing.capturedAt === item.capturedAt && (existing.value !== item.value || existing.source !== item.source)) { hasConflict = true; return; }
      if (item.capturedAt > existing.capturedAt) byPeriod.set(item.period, item);
    });
    const bucketInputs = Array.from(byPeriod.values());
    if (hasConflict) {
      byBucket.set(bucketKey, "conflict");
      return;
    }
    const latest = bucketInputs.slice().sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0];
    const bucket = bucketForMonth(latest.period, selectedPeriod.granularity);
    const clippedBoundary = selectedPeriod.boundaryPolicy === "clip-to-selection" && selectedPeriod.granularity !== "month" && Boolean(selectedPeriod.startMonth && selectedPeriod.endMonth && (bucket.start < selectedPeriod.startMonth || bucket.end > selectedPeriod.endMonth));
    const clippedStart = clippedBoundary && selectedPeriod.startMonth && bucket.start < selectedPeriod.startMonth ? selectedPeriod.startMonth : bucket.start;
    const clippedEnd = clippedBoundary && selectedPeriod.endMonth && bucket.end > selectedPeriod.endMonth ? selectedPeriod.endMonth : bucket.end;
    const rawEligibleValues = bucketInputs.flatMap((item) => item.rawEligibleValues ?? []).filter((value) => Number.isFinite(value) && value >= 0);
    const rawCoverageComplete = bucketInputs.length > 0 && requiredMonthsForBucket({ ...bucket, start: clippedStart, end: clippedEnd }).every((month) => bucketInputs.some((item) => item.period === month && item.rawEligibleComplete === true && (item.rawEligibleValues?.length ?? 0) > 0));
    const value = metricId === "sle-p85" && selectedPeriod.granularity !== "month" ? rawCoverageComplete ? percentileInc(rawEligibleValues, 0.85) : null : aggregateBucketValue(metricId, bucketInputs, selectedPeriod.granularity);
    const aggregateCounts = latest.observationKind === "point-in-time" ? [latest] : bucketInputs;
    const sampleCount = aggregateCounts.every((item) => item.sampleCount !== undefined) ? aggregateCounts.reduce((sum, item) => sum + (item.sampleCount ?? 0), 0) : undefined;
    const usableCount = aggregateCounts.every((item) => item.usableCount !== undefined) ? aggregateCounts.reduce((sum, item) => sum + (item.usableCount ?? 0), 0) : undefined;
    const unknownCount = aggregateCounts.every((item) => item.unknownCount !== undefined) ? aggregateCounts.reduce((sum, item) => sum + (item.unknownCount ?? 0), 0) : undefined;
    const point: HistoricalMetricPoint = { bucketKey, bucketStart: clippedStart, bucketEnd: clippedEnd, value: value ?? undefined, available: value !== null && value !== undefined && (typeof value === "string" || Number.isFinite(value)), partial: Boolean(latest.partial) || clippedBoundary, boundaryClipped: clippedBoundary, sampleCount, usableCount, unknownCount, asOf: latest.asOf, capturedAt: latest.capturedAt, source: latest.source, semanticVersion: latest.semanticVersion, statusConfigVersion: latest.statusConfigVersion, state: latest.state, coverageState: latest.coverageState, reason: value === null || value === undefined ? metricId === "sle-p85" && selectedPeriod.granularity !== "month" ? "P85 requires complete raw eligible durations for the whole bucket; persisted percentile summaries or partial raw coverage are not aggregated." : "No reproducible value for this period." : clippedBoundary ? "Partial period clipped to the selected range boundary." : undefined };
    const previous = byBucket.get(bucketKey); byBucket.set(bucketKey, previous ? previous === "conflict" ? previous : comparePrecedence(previous, point) : point);
  });
  const axisMonths = monthAxis(selectedPeriod.startMonth, selectedPeriod.endMonth);
  const axisBuckets = Array.from(new Map(axisMonths.map((month) => { const bucket = bucketForMonth(month, selectedPeriod.granularity); return [bucket.key, bucket] as const; })).values());
  let points: HistoricalMetricPoint[] = axisBuckets.map((bucket) => { const existing = byBucket.get(bucket.key); if (existing === "conflict") return { bucketKey: bucket.key, bucketStart: bucket.start, bucketEnd: bucket.end, available: false, partial: false, reason: "Conflicting same-period snapshots could not be reconciled." }; if (existing) return existing; return { bucketKey: bucket.key, bucketStart: bucket.start, bucketEnd: bucket.end, available: false, partial: false, reason: "No reproducible value for this calendar bucket." }; });
  const endpointKey = selectedPeriod.endMonth ? bucketForMonth(selectedPeriod.endMonth, selectedPeriod.granularity).key : axisBuckets.at(-1)?.key ?? "";
  let currentIndex = points.findIndex((point) => point.bucketKey === endpointKey); let current = currentIndex >= 0 ? points[currentIndex] : undefined; let previous = currentIndex > 0 ? points[currentIndex - 1] : undefined;
  const conflict = points.some((point) => point.reason?.startsWith("Conflicting")); let compatible = Boolean(isComparablePoint(current) && isComparablePoint(previous) && current?.semanticVersion && previous?.semanticVersion && current.semanticVersion === previous.semanticVersion && current.statusConfigVersion === previous.statusConfigVersion); let adjacent = currentIndex >= 0 && hasAdjacentPair(points, currentIndex);
  let comparison: HistoricalComparison = { currentBucketKey: endpointKey, direction: "unavailable", reason: current?.available ? "No adjacent compatible comparable period." : "Selected endpoint has no reproducible value." };
  const explicitRange = parseRangePeriod(selectedPeriod.selection);
  const selectedRangeInputs = explicitRange ? dedupeRangeInputs(relevant) : [];
  const selectedRangeMonths = explicitRange ? monthAxis(explicitRange.startMonth, explicitRange.endMonth) : [];
  const selectedRangeHasConflict = explicitRange ? hasRangeConflict(relevant) : false;
  const selectedRangeSemanticVersions = selectedRangeInputs.map((item) => item.semanticVersion).filter((version): version is string => Boolean(version));
  const selectedRangeConfigVersions = selectedRangeInputs.map((item) => item.statusConfigVersion).filter((version): version is string => Boolean(version));
  const selectedConfigRequired = ["waiting-time-pct", "maintenance-pct"].includes(metricId) || selectedRangeConfigVersions.length > 0;
  const selectedRangeMetadataCompatible = selectedRangeInputs.length > 0
    && selectedRangeSemanticVersions.length === selectedRangeInputs.length
    && new Set(selectedRangeSemanticVersions).size === 1
    && (!selectedConfigRequired || (selectedRangeConfigVersions.length === selectedRangeInputs.length && new Set(selectedRangeConfigVersions).size === 1));
  const selectedRangeMetadataConflict = selectedRangeInputs.length > 0 && !selectedRangeMetadataCompatible;
  const selectedRangeComplete = explicitRange && selectedRangeMonths.length > 0 && !selectedRangeHasConflict && selectedRangeMetadataCompatible
    ? selectedRangeMonths.every((month) => selectedRangeInputs.some((item) => item.period === month && hasRequiredCompleteMetadata(item, metricId)))
    : false;
  const selectedRaw = selectedRangeInputs.flatMap((item) => item.rawEligibleValues ?? []).filter((value) => Number.isFinite(value) && value >= 0);
  const selectedRawComplete = selectedRangeComplete && selectedRangeInputs.every((item) => item.rawEligibleComplete === true && (item.rawEligibleValues?.length ?? 0) > 0);
  const selectedAggregateValue = explicitRange && selectedRangeComplete
    ? metricId === "sle-p85" && selectedPeriod.granularity !== "month"
      ? selectedRawComplete ? percentileInc(selectedRaw, 0.85) : null
      : aggregateRangeValue(metricId, selectedRangeInputs)
    : null;
  const selectedRangeBoundaryPartial = Boolean(explicitRange && selectedPeriod.granularity !== "month" && selectedPeriod.startMonth && selectedPeriod.endMonth && (bucketForMonth(selectedPeriod.startMonth, selectedPeriod.granularity).start < selectedPeriod.startMonth || bucketForMonth(selectedPeriod.endMonth, selectedPeriod.granularity).end > selectedPeriod.endMonth));
  const selectedRangeSources = selectedRangeInputs.map((item) => item.source).filter((source): source is HistoricalSeriesSource => source !== undefined);
  const selectedRangeStates = selectedRangeInputs.map((item) => item.state).filter((state): state is string => Boolean(state));
  const selectedRangeCoverageStates = selectedRangeInputs.map((item) => item.coverageState).filter((state): state is NonNullable<HistoricalMetricInput["coverageState"]> => Boolean(state));
  const selectedRangeState = selectedRangeHasConflict ? "conflict"
    : selectedRangeMetadataConflict ? "needs-review"
    : metricId === "sle-p85" && selectedPeriod.granularity !== "month" && !selectedRawComplete ? "unavailable"
    : selectedRangeStates.find((state) => ["conflict", "error-with-retry", "error", "stale-last-known", "stale", "needs-review-config"].includes(state))
    ?? (selectedRangeStates.includes("partial") || selectedRangeCoverageStates.includes("partial") ? "partial" : selectedRangeCoverageStates.includes("conflict") ? "conflict" : selectedRangeComplete ? "ready" : "unavailable");
  const selectedRangeCoverage: HistoricalMetricPoint["coverageState"] = selectedRangeHasConflict || selectedRangeCoverageStates.includes("conflict") || selectedRangeState === "conflict" ? "conflict" : metricId === "sle-p85" && selectedPeriod.granularity !== "month" && !selectedRawComplete ? "unavailable" : selectedRangeComplete && !selectedRangeStates.includes("partial") ? "complete" : selectedRangeStates.includes("partial") || selectedRangeCoverageStates.includes("partial") ? "partial" : "unavailable";
  const selectedRangeReason = selectedAggregateValue === null || selectedAggregateValue === undefined
    ? selectedRangeHasConflict
      ? "Conflicting equal-precedence selected-range values or provenance could not be reconciled."
      : selectedRangeMetadataConflict
      ? "Selected range inputs have missing or incompatible semantic/configuration versions; aggregate comparison is unavailable."
      : metricId === "sle-p85" && selectedPeriod.granularity !== "month" && !selectedRawComplete
      ? "P85 requires complete raw eligible durations for the whole selected range; persisted percentile summaries or partial raw coverage are unavailable."
      : !selectedRangeComplete ? "Selected range aggregate is unavailable because one or more selected months lack complete reproducible metadata or value." : "No reproducible value for the selected range."
    : selectedRangeBoundaryPartial ? "Selected range aggregate uses the declared clipped boundary policy." : undefined;
  const selectedRangeAggregatePoint: HistoricalMetricPoint | undefined = explicitRange
    ? {
        bucketKey: `range:${explicitRange.startMonth}..${explicitRange.endMonth}`,
        bucketStart: explicitRange.startMonth,
        bucketEnd: explicitRange.endMonth,
        value: selectedAggregateValue ?? undefined,
        available: selectedAggregateValue !== null && selectedAggregateValue !== undefined && selectedRangeState === "ready" && selectedRangeCoverage === "complete",
        partial: selectedRangeBoundaryPartial,
        boundaryClipped: selectedRangeBoundaryPartial,
        sampleCount: selectedRangeInputs.every((item) => item.sampleCount !== undefined) ? selectedRangeInputs.reduce((sum, item) => sum + (item.sampleCount ?? 0), 0) : undefined,
        usableCount: selectedRangeInputs.every((item) => item.usableCount !== undefined) ? selectedRangeInputs.reduce((sum, item) => sum + (item.usableCount ?? 0), 0) : undefined,
        unknownCount: selectedRangeInputs.every((item) => item.unknownCount !== undefined) ? selectedRangeInputs.reduce((sum, item) => sum + (item.unknownCount ?? 0), 0) : undefined,
        asOf: selectedRangeInputs.map((item) => item.asOf).filter(Boolean).sort().at(-1),
        capturedAt: selectedRangeInputs.map((item) => item.capturedAt).filter(Boolean).sort().at(-1),
        source: selectedRangeSources.length === selectedRangeInputs.length && new Set(selectedRangeSources).size === 1 ? selectedRangeSources[0] : undefined,
        semanticVersion: selectedRangeSemanticVersions.length === selectedRangeInputs.length && new Set(selectedRangeSemanticVersions).size === 1 ? selectedRangeSemanticVersions[0] : undefined,
        statusConfigVersion: selectedRangeConfigVersions.length === selectedRangeInputs.length && new Set(selectedRangeConfigVersions).size === 1 ? selectedRangeConfigVersions[0] : undefined,
        state: selectedRangeState,
        coverageState: selectedRangeCoverage,
        reason: selectedRangeReason,
      }
    : undefined;
  if (selectedRangeAggregatePoint) {
    points = points.map((point) => point.bucketKey === endpointKey ? selectedRangeAggregatePoint : point);
    currentIndex = points.findIndex((point) => point.bucketKey === selectedRangeAggregatePoint.bucketKey);
    current = currentIndex >= 0 ? points[currentIndex] : undefined;
    previous = currentIndex > 0 ? points[currentIndex - 1] : undefined;
    compatible = Boolean(isComparablePoint(current) && isComparablePoint(previous) && current?.semanticVersion && previous?.semanticVersion && current.semanticVersion === previous.semanticVersion && current.statusConfigVersion === previous.statusConfigVersion);
    adjacent = currentIndex >= 0 && hasAdjacentPair(points, currentIndex);
  }
  const previousRangeInputs = explicitRange ? inputs.filter((input) => input.metricId === metricId && isMonthPeriod(input.period) && input.period >= getMonthOffset(explicitRange.startMonth, -countMonthsInclusive(explicitRange.startMonth, explicitRange.endMonth)) && input.period < explicitRange.startMonth) : [];
  if (explicitRange && previousRangeInputs.length > 0) {
    const previousStart = getMonthOffset(explicitRange.startMonth, -countMonthsInclusive(explicitRange.startMonth, explicitRange.endMonth));
    const previousEnd = getMonthOffset(explicitRange.startMonth, -1);
    const previousBoundaryClipped = selectedPeriod.granularity !== "month" && (bucketForMonth(previousStart, selectedPeriod.granularity).start < previousStart || bucketForMonth(previousEnd, selectedPeriod.granularity).end > previousEnd);
    const previousAxisKeys = Array.from(new Set(monthAxis(previousStart, previousEnd).map((month) => bucketForMonth(month, selectedPeriod.granularity).key)));
    const previousBuckets = new Map<string, HistoricalMetricInput[]>();
    previousRangeInputs.forEach((input) => { const key = bucketForMonth(input.period, selectedPeriod.granularity).key; previousBuckets.set(key, [...(previousBuckets.get(key) ?? []), input]); });
    const completePrevious = previousAxisKeys.every((key) => {
      const bucketInputs = previousBuckets.get(key) ?? [];
      const periods = new Map<string, HistoricalMetricInput>();
      let bucketConflict = false;
      bucketInputs.forEach((item) => { const existing = periods.get(item.period); if (!existing) periods.set(item.period, item); else if (existing.capturedAt === item.capturedAt && (existing.value !== item.value || existing.source !== item.source)) bucketConflict = true; else if (item.capturedAt > existing.capturedAt) periods.set(item.period, item); });
      const bucket = bucketForMonth(key.includes("-Q") ? `${key.slice(0, 4)}-${String((Number(key.slice(6)) - 1) * 3 + 1).padStart(2, "0")}` : key.length === 4 ? `${key}-01` : key, selectedPeriod.granularity);
      const clippedStart = selectedPeriod.boundaryPolicy === "clip-to-selection" && bucket.start < previousStart ? previousStart : bucket.start;
      const clippedEnd = selectedPeriod.boundaryPolicy === "clip-to-selection" && bucket.end > previousEnd ? previousEnd : bucket.end;
      return !bucketConflict && requiredMonthsForBucket({ ...bucket, start: clippedStart, end: clippedEnd }).every((month) => {
        const item = periods.get(month);
        return Boolean(item && hasRequiredCompleteMetadata(item, metricId));
      });
    });
    const previousByPeriod = new Map<string, HistoricalMetricInput>();
    previousRangeInputs.forEach((item) => { const existing = previousByPeriod.get(item.period); if (!existing || item.capturedAt > existing.capturedAt) previousByPeriod.set(item.period, item); });
    const previousDeduped = Array.from(previousByPeriod.values());
    const previousStates = new Set(previousDeduped.map((item) => item.state ?? "ready"));
    const previousCoverageStates = new Set(previousDeduped.map((item) => item.coverageState ?? "complete"));
    const previousSemanticVersions = new Set(previousDeduped.map((item) => item.semanticVersion));
    const previousConfigVersions = new Set(previousDeduped.map((item) => item.statusConfigVersion));
    const previousSources = previousDeduped.map((item) => item.source).filter((source): source is HistoricalSeriesSource => source !== undefined);
    const previousSampleCount = previousDeduped.every((item) => item.sampleCount !== undefined) ? previousDeduped.reduce((sum, item) => sum + (item.sampleCount ?? 0), 0) : undefined;
    const previousUsableCount = previousDeduped.every((item) => item.usableCount !== undefined) ? previousDeduped.reduce((sum, item) => sum + (item.usableCount ?? 0), 0) : undefined;
    const previousUnknownCount = previousDeduped.every((item) => item.unknownCount !== undefined) ? previousDeduped.reduce((sum, item) => sum + (item.unknownCount ?? 0), 0) : undefined;
    const previousMetadataCompatible = previousStates.size === 1 && previousCoverageStates.size === 1 && previousSemanticVersions.size === 1 && previousConfigVersions.size === 1;
    const previousRaw = previousDeduped.flatMap((item) => item.rawEligibleValues ?? []).filter((value) => Number.isFinite(value) && value >= 0);
    const previousRawComplete = previousDeduped.length > 0 && previousDeduped.every((item) => item.rawEligibleComplete === true && (item.rawEligibleValues?.length ?? 0) > 0);
    const previousValue = completePrevious && previousMetadataCompatible && (!(metricId === "sle-p85" && selectedPeriod.granularity !== "month") || previousRawComplete) ? metricId === "sle-p85" && selectedPeriod.granularity !== "month" ? percentileInc(previousRaw, 0.85) : aggregateRangeValue(metricId, previousDeduped) : null;
    const previousLatest = previousRangeInputs.slice().sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0];
    const currentRangeValue = selectedAggregateValue;
    if (currentRangeValue !== null && currentRangeValue !== undefined && previousValue !== null && previousValue !== undefined && previousLatest && current?.semanticVersion && previousLatest.semanticVersion === current.semanticVersion && current.statusConfigVersion === previousLatest.statusConfigVersion && previousMetadataCompatible && selectedPeriod.boundaryPolicy === "clip-to-selection" && selectedRangeBoundaryPartial === previousBoundaryClipped) {
      if (typeof currentRangeValue === "number" && typeof previousValue === "number") { const delta = currentRangeValue - previousValue; comparison = { currentBucketKey: `range:${explicitRange.startMonth}..${explicitRange.endMonth}`, previousBucketKey: `range:${previousStart}..${previousEnd}`, currentValue: currentRangeValue, previousValue, currentBoundaryPolicy: selectedPeriod.boundaryPolicy, previousBoundaryPolicy: selectedPeriod.boundaryPolicy, currentBoundaryClipped: selectedRangeBoundaryPartial, previousBoundaryClipped, currentSampleCount: current.sampleCount, previousSampleCount, currentUsableCount: current.usableCount, previousUsableCount, currentUnknownCount: current.unknownCount, previousUnknownCount, currentSource: current.source, previousSource: previousSources.length && new Set(previousSources).size === 1 ? previousSources[0] : undefined, currentAsOf: current.asOf, previousAsOf: previousLatest.asOf, currentCapturedAt: current.capturedAt, previousCapturedAt: previousLatest.capturedAt, delta, direction: direction === "categorical" ? delta === 0 ? "unchanged" : "changed" : delta === 0 ? "unchanged" : (direction === "higher" ? delta > 0 : delta < 0) ? "improved" : "worsened" }; }
    } else comparison.reason = "No compatible preceding equal-duration range.";
  } else if (current && previous && adjacent && compatible) {
    if (typeof current.value === "number" && typeof previous.value === "number") { const delta = current.value - previous.value; comparison = { currentBucketKey: current.bucketKey, previousBucketKey: previous.bucketKey, currentValue: current.value, previousValue: previous.value, delta, direction: direction === "categorical" ? delta === 0 ? "unchanged" : "changed" : delta === 0 ? "unchanged" : (direction === "higher" ? delta > 0 : delta < 0) ? "improved" : "worsened" }; }
    else if (direction === "categorical" && typeof current.value === "string" && typeof previous.value === "string") comparison = { currentBucketKey: current.bucketKey, previousBucketKey: previous.bucketKey, currentValue: current.value, previousValue: previous.value, direction: current.value === previous.value ? "unchanged" : "changed" };
  }
  const valid = points.filter((point) => point.available);
  const hasNonReadyPoint = points.some((point) =>
    (point.state !== undefined && !["ready", "complete"].includes(point.state))
    || (point.coverageState !== undefined && point.coverageState !== "complete"),
  );
  const state: HistoricalSeriesState = conflict ? "conflict" : valid.length === 0 ? "unavailable-no-history" : !current?.available ? "partial" : hasNonReadyPoint ? "partial" : valid.length < 2 || !adjacent ? "insufficient-history" : points.some((point) => point.partial || !point.available) ? "partial" : "ready";
  return { metricId, observationKind: inputs[0]?.observationKind ?? "aggregate-period", unit: inputs[0]?.unit ?? "", granularity: selectedPeriod.granularity, selectedPeriod, points, comparison, semanticVersion, statusConfigVersion: current?.statusConfigVersion, state, source: current?.source, asOf: current?.asOf, capturedAt: current?.capturedAt, reason: state === "insufficient-history" ? "Fewer than two adjacent comparable periods are available." : undefined };
}

export function historicalMetricDirectionLabel(comparison: HistoricalComparison): string { return comparison.direction === "unavailable" ? "Unavailable" : comparison.direction[0].toUpperCase() + comparison.direction.slice(1); }
