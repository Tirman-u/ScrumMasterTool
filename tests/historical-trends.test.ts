import { describe, expect, it } from "vitest";
import { dedupeHistoricalPeriods, filterHistoricalPeriods, hasAdjacentValidPair, normalizeHistoricalPointIndex, resolveAdjacentHistoricalDirection, resolveHistoricalTrendDirection, resolveHistoricalTrendState } from "../apps/sm-tool/src/lib/historical-trends";

describe("historical metric trends", () => {
  it("uses lower-is-better direction and ignores missing periods", () => {
    expect(resolveHistoricalTrendDirection([5, null, 4])).toBe("Unavailable");
    expect(resolveAdjacentHistoricalDirection([{ period: "2026-01", value: 5 }, { period: "2026-02", value: null }, { period: "2026-03", value: 4 }])).toBe("Unavailable");
    expect(resolveHistoricalTrendDirection([4, null, 5])).toBe("Unavailable");
    expect(resolveHistoricalTrendDirection([4, null, 4])).toBe("Unavailable");
  });

  it("uses the selected period as the historical window endpoint", () => {
    const points = ["2026-01", "2026-02", "2026-03", "2026-04"].map((period) => ({ period }));
    expect(filterHistoricalPeriods(points, "2026-03").map((point) => point.period)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(filterHistoricalPeriods(points, "range:2026-02..2026-03").map((point) => point.period)).toEqual(["2026-02", "2026-03"]);
  });

  it("keeps missing distinct from a valid zero", () => {
    expect(resolveHistoricalTrendDirection([null, 0])).toBe("Insufficient history");
    expect(resolveHistoricalTrendDirection([1, 0])).toBe("Improving");
    expect(resolveHistoricalTrendDirection([null, null])).toBe("Unavailable");
  });

  it("normalizes roving focus to the first rendered point, including after leading gaps", () => {
    const points = [
      { period: "2026-01", value: null },
      { period: "2026-02", value: null },
      { period: "2026-03", value: 0 },
      { period: "2026-04", value: 2 },
    ];
    expect(normalizeHistoricalPointIndex(points, 0)).toBe(2);
    expect(normalizeHistoricalPointIndex(points, 3)).toBe(3);
    expect(normalizeHistoricalPointIndex(points.map((point) => ({ ...point, value: null })), 0)).toBe(-1);
  });

  it("keeps loading/error/partial/insufficient states truthful without substituting data", () => {
    expect(resolveHistoricalTrendState({ loading: true, error: false, pointCount: 3, validPointCount: 0 })).toBe("loading");
    expect(resolveHistoricalTrendState({ loading: false, error: true, pointCount: 3, validPointCount: 2 })).toBe("partial");
    expect(resolveHistoricalTrendState({ loading: false, error: true, pointCount: 0, validPointCount: 0 })).toBe("error");
    expect(resolveHistoricalTrendState({ loading: false, error: false, pointCount: 3, validPointCount: 1 })).toBe("insufficient");
    expect(resolveHistoricalTrendState({ loading: false, error: false, pointCount: 3, validPointCount: 0 })).toBe("partial");
  });

  it("deduplicates same-period snapshots by the newest capture deterministically", () => {
    expect(dedupeHistoricalPeriods([
      { period: "2026-02", capturedAt: "2026-02-01T00:00:00Z", value: 9 },
      { period: "2026-02", capturedAt: "2026-02-02T00:00:00Z", value: 7 },
      { period: "2026-01", capturedAt: "2026-01-31T00:00:00Z", value: 8 },
    ])).toEqual([
      { period: "2026-01", capturedAt: "2026-01-31T00:00:00Z", value: 8 },
      { period: "2026-02", capturedAt: "2026-02-02T00:00:00Z", value: 7 },
    ]);
  });

  it("requires an immediately adjacent valid pair before rendering a trend", () => {
    expect(hasAdjacentValidPair([{ period: "2026-01", value: 4 }, { period: "2026-02", value: null }, { period: "2026-03", value: 3 }])).toBe(false);
    expect(hasAdjacentValidPair([{ period: "2026-02", value: null }, { period: "2026-03", value: 3 }, { period: "2026-04", value: 2 }])).toBe(true);
  });
});
