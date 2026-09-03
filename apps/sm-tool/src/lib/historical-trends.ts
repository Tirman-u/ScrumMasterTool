export type HistoricalTrendDirection = "Improving" | "Worsening" | "Unchanged" | "Insufficient history" | "Unavailable";

export interface HistoricalPeriodValue {
  period: string;
  value: number | null;
}

export function dedupeHistoricalPeriods<T extends { period: string; capturedAt: string }>(items: T[]): T[] {
  const byPeriod = new Map<string, T>();
  for (const item of items) {
    const previous = byPeriod.get(item.period);
    if (!previous || item.capturedAt > previous.capturedAt) byPeriod.set(item.period, item);
  }
  return [...byPeriod.values()].sort((left, right) => left.period.localeCompare(right.period));
}

export type HistoricalTrendLoadState = "loading" | "retrying" | "error" | "partial" | "unavailable" | "insufficient" | "ready";

export function normalizeHistoricalPointIndex(points: HistoricalPeriodValue[], currentIndex: number): number {
  const current = points[currentIndex];
  if (current && current.value !== null && Number.isFinite(current.value)) return currentIndex;
  return points.findIndex((point) => point.value !== null && Number.isFinite(point.value));
}

export function hasAdjacentValidPair(points: HistoricalPeriodValue[]): boolean {
  return points.some((point, index) => index > 0 && point.value !== null && Number.isFinite(point.value) && points[index - 1].value !== null && Number.isFinite(points[index - 1].value));
}

export function resolveHistoricalTrendState(input: {
  loading: boolean;
  retrying?: boolean;
  error: boolean;
  pointCount: number;
  validPointCount: number;
}): HistoricalTrendLoadState {
  if (input.retrying) return "retrying";
  if (input.loading) return "loading";
  if (input.error && input.validPointCount > 0) return "partial";
  if (input.error) return "error";
  if (input.validPointCount === 0) return input.pointCount === 0 ? "unavailable" : "partial";
  if (input.validPointCount === 1) return "insufficient";
  if (input.validPointCount < input.pointCount) return "partial";
  return "ready";
}

function periodBounds(period: string, referencePeriod: string): { start: string | null; end: string | null } {
  if (period === "all") return { start: null, end: null };
  if (/^\d{4}-\d{2}$/.test(period)) return { start: null, end: period };
  const range = period.match(/^range:(\d{4}-\d{2})\.\.(\d{4}-\d{2})$/);
  if (range) return { start: range[1], end: range[2] };
  if (period === "ytd") return { start: `${referencePeriod.slice(0, 4)}-01`, end: referencePeriod };
  if (period === "last-24m") return { start: null, end: referencePeriod };
  return { start: null, end: null };
}

export function filterHistoricalPeriods<T extends { period: string }>(items: T[], selectedPeriod: string): T[] {
  if (items.length === 0 || selectedPeriod === "all") return items;
  const latest = items.map((item) => item.period).sort().at(-1) ?? selectedPeriod;
  const bounds = periodBounds(selectedPeriod, latest);
  const filtered = items.filter((item) => (!bounds.start || item.period >= bounds.start) && (!bounds.end || item.period <= bounds.end));
  if (/^\d{4}-\d{2}$/.test(selectedPeriod) || selectedPeriod === "last-24m") return filtered.slice(-6);
  return filtered;
}

export function resolveHistoricalTrendDirection(values: Array<number | null>): HistoricalTrendDirection {
  const current = values.at(-1);
  const previous = values.at(-2);
  if (current === null || current === undefined || !Number.isFinite(current)) return values.some((value) => value !== null) ? "Unavailable" : "Unavailable";
  if (previous === null || previous === undefined || !Number.isFinite(previous)) {
    return values.filter((value): value is number => value !== null && Number.isFinite(value)).length === 1
      ? "Insufficient history"
      : "Unavailable";
  }
  return current < previous ? "Improving" : current > previous ? "Worsening" : "Unchanged";
}

export function resolveAdjacentHistoricalDirection(points: HistoricalPeriodValue[]): HistoricalTrendDirection {
  const valid = points.filter((point) => point.value !== null && Number.isFinite(point.value));
  if (valid.length === 0) return "Unavailable";
  if (valid.length === 1) return "Insufficient history";
  const current = points.at(-1);
  const previous = points.at(-2);
  if (!current || !previous || current.value === null || previous.value === null) return "Unavailable";
  return current.value < previous.value ? "Improving" : current.value > previous.value ? "Worsening" : "Unchanged";
}
