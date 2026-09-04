import { describe, expect, it } from "vitest";
import { buildHistoricalMetricSeries, resolveHistoricalPeriodSnapshot, type PeriodSnapshot } from "../apps/sm-tool/src/lib/historical-series";

const periods = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

function input(period: string, value: number | null, capturedAt = `${period}-28T12:00:00.000Z`) {
  return { metricId: "cycle-time", observationKind: "aggregate-period" as const, unit: "working days", period, value, capturedAt, source: "local-cache" as const, sampleCount: 4, usableCount: value === null ? 0 : 4, semanticVersion: "fixture-v1" };
}

function categoricalInput(period: string, value: string, capturedAt = `${period}-28T12:00:00.000Z`) {
  return { metricId: "bottleneck", observationKind: "point-in-time" as const, unit: "status", period, value, capturedAt, source: "local-cache" as const, sampleCount: 2, usableCount: 2, semanticVersion: "fixture-v1" };
}
function monthSequence(start: string, count: number): string[] {
  const [year, month] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const offset = month - 1 + index;
    return `${year + Math.floor(offset / 12)}-${String((offset % 12) + 1).padStart(2, "0")}`;
  });
}

describe("shared historical metric series", () => {
  it("uses the selected month as the endpoint and adapts range granularity", () => {
    const month = resolveHistoricalPeriodSnapshot("2026-04", periods);
    expect(month).toMatchObject({ startMonth: "2026-01", endMonth: "2026-04", granularity: "month" });
    expect(resolveHistoricalPeriodSnapshot("range:2025-01..2026-06", ["2025-01", "2026-06"]).granularity).toBe("quarter");
  });

  it("keeps aggregate and point-in-time observation kinds and excludes future points", () => {
    const selected = resolveHistoricalPeriodSnapshot("2026-03", periods);
    const aggregate = buildHistoricalMetricSeries([input("2026-01", 5), input("2026-02", 4), input("2026-03", 3), input("2026-04", 1)], selected, "lower");
    expect(aggregate.observationKind).toBe("aggregate-period");
    expect(aggregate.points.map((point) => point.bucketKey)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(aggregate.comparison.direction).toBe("improved");
  });

  it("deduplicates by captured time and fails closed on equal-time conflicts", () => {
    const selected = resolveHistoricalPeriodSnapshot("2026-03", periods);
    const series = buildHistoricalMetricSeries([input("2026-01", 5), input("2026-02", 4, "2026-02-27T12:00:00.000Z"), input("2026-02", 3), input("2026-03", 2)], selected, "lower");
    expect(series.points.find((point) => point.bucketKey === "2026-02")?.value).toBe(3);
    const conflict = buildHistoricalMetricSeries([input("2026-01", 5, "2026-01-28T12:00:00.000Z"), input("2026-01", 4, "2026-01-28T12:00:00.000Z")], selected, "lower");
    expect(conflict.state).toBe("conflict");
    expect(conflict.comparison.direction).toBe("unavailable");
  });

  it("does not infer across missing buckets and preserves zero as valid", () => {
    const selected = resolveHistoricalPeriodSnapshot("2026-03", periods);
    const gap = buildHistoricalMetricSeries([input("2026-01", 5), input("2026-02", null), input("2026-03", 0)], selected, "lower");
    expect(gap.state).toBe("insufficient-history");
    expect(gap.comparison.direction).toBe("unavailable");
    expect(gap.points.at(-1)).toMatchObject({ value: 0, available: true, source: "local-cache", sampleCount: 4, usableCount: 4 });
  });

  it("keeps named quarter/year endpoints and builds the complete calendar axis", () => {
    expect(resolveHistoricalPeriodSnapshot("2026-Q2", periods)).toMatchObject({ startMonth: "2026-04", endMonth: "2026-06", granularity: "quarter" });
    expect(resolveHistoricalPeriodSnapshot("2026", periods)).toMatchObject({ startMonth: "2026-01", endMonth: "2026-12", granularity: "year" });
    const selected = resolveHistoricalPeriodSnapshot("2026-04", periods);
    const afterLatest = buildHistoricalMetricSeries([input("2026-01", 4), input("2026-02", 3)], selected, "lower");
    expect(afterLatest.points.map((point) => point.bucketKey)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(afterLatest.comparison.currentBucketKey).toBe("2026-04");
    expect(afterLatest.points.at(-1)).toMatchObject({ available: false });
  });

  it("preserves categorical Bottleneck values and reports changed or unchanged", () => {
    const selected = resolveHistoricalPeriodSnapshot("2026-03", periods);
    const changed = buildHistoricalMetricSeries([categoricalInput("2026-02", "Review"), categoricalInput("2026-03", "Build")], selected, "categorical");
    expect(changed.points.at(-1)).toMatchObject({ value: "Build", available: true });
    expect(changed.comparison.direction).toBe("changed");
    const unchanged = buildHistoricalMetricSeries([categoricalInput("2026-02", "Review"), categoricalInput("2026-03", "Review")], selected, "categorical");
    expect(unchanged.comparison.direction).toBe("unchanged");
  });

  it("clips explicit range boundaries and does not average persisted P85 values", () => {
    const selected = resolveHistoricalPeriodSnapshot("range:2026-02..2026-04", periods);
    expect(selected.boundaryPolicy).toBe("clip-to-selection");
    const series = buildHistoricalMetricSeries([input("2026-02", 4), input("2026-03", 5), input("2026-04", 6)], selected, "lower");
    expect(series.points[0]).toMatchObject({ partial: false });
    expect(series.points.at(-1)).toMatchObject({ partial: false });

    const longSelection = resolveHistoricalPeriodSnapshot("range:2025-01..2026-06", Array.from({ length: 18 }, (_, index) => `2025-${String(index + 1).padStart(2, "0")}`));
    const p85 = buildHistoricalMetricSeries(
      ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"].map((period, index) => ({ ...input(period, index + 1), metricId: "sle-p85" })),
      longSelection,
      "lower",
    );
    expect(p85.granularity).toBe("quarter");
    expect(p85.points.every((point) => !point.available)).toBe(true);
    expect(p85.reason).toBeUndefined();
    expect(p85.points.some((point) => point.reason?.includes("requires complete raw eligible durations"))).toBe(true);

    const quarterlyRange: PeriodSnapshot = { ...selected, granularity: "quarter" };
    const clippedQuarter = buildHistoricalMetricSeries([input("2026-02", 4), input("2026-04", 6)], quarterlyRange, "lower");
    expect(clippedQuarter.points.map((point) => [point.bucketKey, point.bucketStart, point.bucketEnd, point.partial])).toEqual([["2026-Q1", "2026-02", "2026-03", true], ["range:2026-02..2026-04", "2026-02", "2026-04", true]]);

    const rawP85 = buildHistoricalMetricSeries([{ ...input("2026-02", 99), metricId: "sle-p85", rawEligibleValues: [1, 2, 3, 4], rawEligibleComplete: true }, { ...input("2026-03", 99), metricId: "sle-p85", rawEligibleValues: [2, 3, 4, 5], rawEligibleComplete: true }, { ...input("2026-04", 99), metricId: "sle-p85", rawEligibleValues: [5, 6, 7, 8], rawEligibleComplete: true }], quarterlyRange, "lower");
    expect(rawP85.points.some((point) => point.available)).toBe(true);
  });

  it("does not fabricate source or timestamps when persisted provenance is absent", () => {
    const selected = resolveHistoricalPeriodSnapshot("2026-02", periods);
    const series = buildHistoricalMetricSeries([{ metricId: "stories-done", observationKind: "aggregate-period", unit: "items", period: "2026-02", value: 2, capturedAt: "", }], selected, "higher");
    expect(series.source).toBeUndefined();
    expect(series.asOf).toBeUndefined();
    expect(series.capturedAt).toBe("");
  });

  it("compares an explicit range with the preceding equal-duration range", () => {
    const selected = resolveHistoricalPeriodSnapshot("range:2026-03..2026-04", periods);
    const series = buildHistoricalMetricSeries([input("2026-01", 8), input("2026-02", 6), input("2026-03", 5), input("2026-04", 4)], selected, "lower");
    expect(series.comparison.previousBucketKey).toBe("range:2026-01..2026-02");
    expect(series.comparison.currentBucketKey).toBe("range:2026-03..2026-04");
    expect(series.comparison.currentValue).toBe(4.5);
    expect(series.points.at(-1)).toMatchObject({ bucketKey: "range:2026-03..2026-04", value: 4.5, sampleCount: 8, usableCount: 8, source: "local-cache", boundaryClipped: false });
    expect(series.comparison.direction).toBe("improved");
    expect(series.comparison.delta).toBe(-2.5);
    expect(series.comparison).toMatchObject({ currentBoundaryPolicy: "clip-to-selection", previousBoundaryPolicy: "clip-to-selection", currentSampleCount: 8, previousSampleCount: 8, currentSource: "local-cache", previousSource: "local-cache" });
  });

  it("requires every underlying month in the preceding range", () => {
    const selected = resolveHistoricalPeriodSnapshot("range:2026-04..2026-06", periods);
    const series = buildHistoricalMetricSeries([
      input("2026-01", 8), input("2026-03", 6),
      input("2026-04", 5), input("2026-05", 4), input("2026-06", 3),
    ], selected, "lower");
    expect(series.comparison.direction).toBe("unavailable");
    expect(series.comparison.reason).toContain("compatible preceding");
  });

  it("preserves point state, coverage and provenance without falsely reporting ready", () => {
    const selected = resolveHistoricalPeriodSnapshot("2026-02", periods);
    const series = buildHistoricalMetricSeries([
      { ...input("2026-01", 5), state: "stale-last-known", coverageState: "partial" as const, statusConfigVersion: "workflow-v2", asOf: "2026-01-31" },
      { ...input("2026-02", 4), state: "stale-last-known", coverageState: "partial" as const, statusConfigVersion: "workflow-v2", asOf: "2026-02-28" },
    ], selected, "lower");
    expect(series.points.at(-1)).toMatchObject({ state: "stale-last-known", coverageState: "partial", source: "local-cache", asOf: "2026-02-28", statusConfigVersion: "workflow-v2" });
    expect(series.state).toBe("partial");
  });

  it("does not compare stale or incomplete aggregate points", () => {
    const selected = resolveHistoricalPeriodSnapshot("2026-03", periods);
    const series = buildHistoricalMetricSeries([
      { ...input("2026-01", 5), state: "stale-last-known", coverageState: "partial" as const },
      { ...input("2026-02", 4), state: "stale-last-known", coverageState: "partial" as const },
      { ...input("2026-03", 3), state: "ready", coverageState: "complete" as const },
    ], selected, "lower");
    expect(series.comparison.direction).toBe("unavailable");
  });

  it("keeps weighted values aligned with their numeric inputs after nulls", () => {
    const selected: PeriodSnapshot = { ...resolveHistoricalPeriodSnapshot("2026-01", periods), startMonth: "2026-01", endMonth: "2026-03", granularity: "quarter" };
    const series = buildHistoricalMetricSeries([
      input("2026-01", null), { ...input("2026-02", 10), sampleCount: 2 }, { ...input("2026-03", 20), sampleCount: 1 },
    ], selected, "lower");
    expect(series.points[0]).toMatchObject({ value: 13.333333333333334, available: true });
  });

  it("clips quarter and year boundary buckets only when selection cuts them", () => {
    const selected: PeriodSnapshot = { ...resolveHistoricalPeriodSnapshot("range:2026-02..2026-04", periods), granularity: "quarter" };
    const quarter = buildHistoricalMetricSeries([input("2026-02", 4), input("2026-03", 5), input("2026-04", 6)], selected, "lower");
    expect(quarter.points.map((point) => [point.bucketKey, point.bucketStart, point.bucketEnd, point.partial])).toEqual([
      ["2026-Q1", "2026-02", "2026-03", true], ["range:2026-02..2026-04", "2026-02", "2026-04", true],
    ]);
    const aligned: PeriodSnapshot = { ...selected, selection: "range:2026-01..2026-12", startMonth: "2026-01", endMonth: "2026-12", granularity: "year" };
    const year = buildHistoricalMetricSeries(Array.from({ length: 12 }, (_, index) => input(`2026-${String(index + 1).padStart(2, "0")}`, index + 1)), aligned, "lower");
    expect(year.points[0]).toMatchObject({ bucketStart: "2026-01", bucketEnd: "2026-12", partial: false });
  });

  it("accepts a complete clipped preceding range with the same boundary policy", () => {
    const months = [...monthSequence("2025-01", 14), ...monthSequence("2026-02", 13)];
    const selected = resolveHistoricalPeriodSnapshot("range:2026-02..2027-02", months);
    const series = buildHistoricalMetricSeries(months.map((period, index) => input(period, index < 13 ? 8 : 4)), selected, "lower");
    expect(selected.granularity).toBe("quarter");
    expect(series.points.at(-1)).toMatchObject({ bucketKey: "range:2026-02..2027-02", partial: true });
    expect(series.comparison.previousBucketKey).toBe("range:2025-01..2026-01");
    expect(series.comparison.direction).toBe("improved");
  });

  it("materializes an unavailable range point without endpoint fallback", () => {
    const selected = resolveHistoricalPeriodSnapshot("range:2026-03..2026-04", periods);
    const series = buildHistoricalMetricSeries([
      { ...input("2026-03", 2), source: undefined, capturedAt: "2026-03-28T12:00:00.000Z" },
      input("2026-04", 1),
    ], selected, "lower");
    expect(series.points.at(-1)).toMatchObject({ bucketKey: "range:2026-03..2026-04", available: false, state: "unavailable" });
    expect(series.points.at(-1)?.value).toBeUndefined();
  });

  it("materializes partial input and non-month P85 failures as range points", () => {
    const selected = resolveHistoricalPeriodSnapshot("range:2025-01..2026-06", monthSequence("2025-01", 18));
    const partial = buildHistoricalMetricSeries([
      { ...input("2025-01", 2), partial: true, state: "partial", coverageState: "partial" as const },
      ...monthSequence("2025-02", 17).map((period) => input(period, 2)),
    ], selected, "lower");
    expect(partial.points.at(-1)).toMatchObject({ bucketKey: "range:2025-01..2026-06", available: false, state: "partial" });
    const p85 = buildHistoricalMetricSeries(monthSequence("2025-01", 18).map((period) => ({ ...input(period, 99), metricId: "sle-p85" })), selected, "lower");
    expect(p85.points.at(-1)).toMatchObject({ bucketKey: "range:2025-01..2026-06", available: false, state: "unavailable", coverageState: "unavailable" });
    expect(p85.points.at(-1)?.reason).toContain("complete raw eligible durations");
  });

  it("materializes equal-precedence range conflicts as conflict, not generic unavailable", () => {
    const selected = resolveHistoricalPeriodSnapshot("range:2026-03..2026-04", periods);
    const capturedAt = "2026-03-28T12:00:00.000Z";
    const series = buildHistoricalMetricSeries([
      input("2026-03", 2, capturedAt), input("2026-03", 3, capturedAt), input("2026-04", 1),
    ], selected, "lower");
    expect(series.points.at(-1)).toMatchObject({ bucketKey: "range:2026-03..2026-04", available: false, state: "conflict", coverageState: "conflict" });
    expect(series.points.at(-1)?.reason).toContain("Conflicting equal-precedence");
    expect(series.comparison.direction).toBe("unavailable");
  });

  it("fails closed when selected-range inputs have incompatible semantic versions", () => {
    const selected = resolveHistoricalPeriodSnapshot("range:2026-03..2026-04", periods);
    const series = buildHistoricalMetricSeries([
      { ...input("2026-03", 2), semanticVersion: "fixture-v1" },
      { ...input("2026-04", 1), semanticVersion: "fixture-v2" },
    ], selected, "lower");
    expect(series.points.at(-1)).toMatchObject({ bucketKey: "range:2026-03..2026-04", available: false, state: "needs-review", coverageState: "unavailable" });
    expect(series.points.at(-1)?.reason).toContain("incompatible semantic/configuration versions");
    expect(series.comparison.direction).toBe("unavailable");
  });
});
