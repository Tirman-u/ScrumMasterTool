import { type TeamRuntime } from "../types/contracts";

export interface PeriodYearGroup {
  year: string;
  months: string[];
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isMonthPeriod(value: string): boolean {
  const match = value.match(/^\d{4}-(\d{2})$/);
  if (!match) {
    return false;
  }

  const month = Number(match[1]);
  return month >= 1 && month <= 12;
}

export function parseRangePeriod(period: string): { startMonth: string; endMonth: string } | null {
  const match = period.match(/^range:(\d{4}-\d{2})\.\.(\d{4}-\d{2})$/);
  if (!match || !isMonthPeriod(match[1]) || !isMonthPeriod(match[2])) {
    return null;
  }

  const [startMonth, endMonth] = match[1] <= match[2] ? [match[1], match[2]] : [match[2], match[1]];
  return { startMonth, endMonth };
}

export function isRangePeriod(period: string): boolean {
  return parseRangePeriod(period) !== null;
}

export function buildRangePeriod(startMonth: string, endMonth: string): string {
  if (!isMonthPeriod(startMonth) || !isMonthPeriod(endMonth)) {
    return "all";
  }

  const [start, end] = startMonth <= endMonth ? [startMonth, endMonth] : [endMonth, startMonth];
  return `range:${start}..${end}`;
}

export function getPreviousMonth(month: string): string {
  return getMonthOffset(month, -1);
}

export function getMonthOffset(month: string, offset: number): string {
  const date = startOfMonthByKey(month);
  if (!date) {
    return month;
  }

  return monthKey(new Date(date.getFullYear(), date.getMonth() + offset, 1));
}

export function countMonthsInclusive(startMonth: string, endMonth: string): number {
  const start = startOfMonthByKey(startMonth);
  const end = startOfMonthByKey(endMonth);
  if (!start || !end) {
    return 1;
  }

  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
}

export function formatMonthLabel(month: string): string {
  const date = startOfMonthByKey(month);
  return date ? date.toLocaleDateString(undefined, { year: "numeric", month: "short" }) : month;
}

export function formatMonthShortLabel(month: string): string {
  const date = startOfMonthByKey(month);
  return date ? date.toLocaleDateString(undefined, { month: "short" }) : month;
}

export function buildAvailableMonths(
  teams: Array<
    Pick<TeamRuntime, "metrics" | "parsedIssues"> &
      Partial<
        Pick<TeamRuntime, "manualBottleneck" | "autoBottleneck" | "autoTimeInStatus" | "importFiles">
      >
  >,
): string[] {
  const values = new Set<string>();
  const addMonthToken = (value: string | null | undefined): void => {
    if (value && isMonthPeriod(value)) {
      values.add(value);
    }
  };
  const addIssueDate = (value: Date | null | undefined): void => {
    if (value && !Number.isNaN(value.getTime())) {
      values.add(monthKey(value));
    }
  };

  teams.forEach((team) => {
    team.metrics?.velocityMonthly.forEach((item) => addMonthToken(item.month));
    team.metrics?.doneIssueDetails.forEach((item) => addMonthToken(item.resolutionDate.slice(0, 7)));
    team.parsedIssues.forEach((issue) => {
      if (issue.projectEnteredAt && (!issue.created || issue.projectEnteredAt.getTime() > issue.created.getTime())) {
        addIssueDate(issue.projectEnteredAt);
      } else {
        addIssueDate(issue.created);
      }
      addIssueDate(issue.updated);
      addIssueDate(issue.resolutionDate);
    });
    (team.autoBottleneck ?? []).forEach((entry) => addMonthToken(entry.period));
    (team.autoTimeInStatus ?? []).forEach((entry) => addMonthToken(entry.period));
    (team.manualBottleneck ?? []).forEach((entry) => addMonthToken(entry.period));
  });

  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

export function buildPeriodYearGroups(availableMonths: string[], maxYears = 2): PeriodYearGroup[] {
  const grouped = new Map<string, string[]>();

  availableMonths.forEach((month) => {
    if (!isMonthPeriod(month)) {
      return;
    }
    const year = month.slice(0, 4);
    grouped.set(year, [...(grouped.get(year) ?? []), month]);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, Math.max(1, maxYears))
    .map(([year, months]) => ({
      year,
      months: months.sort((left, right) => right.localeCompare(left)),
    }));
}

export function formatPeriodLabel(period: string, referenceDate: Date = new Date()): string {
  if (period === "all") {
    return "All time";
  }
  if (period === "ytd" || period === "ytd-prev") {
    const year = referenceDate.getFullYear() - (period === "ytd-prev" ? 1 : 0);
    return `YTD ${year} (${getYtdWindowLabel(referenceDate)})`;
  }
  if (period === "last-24m") {
    return "Last 24 months";
  }
  if (period === "last-24m-prev") {
    return "Previous 24 months";
  }

  const range = parseRangePeriod(period);
  if (range) {
    return `${formatMonthLabel(range.startMonth)} - ${formatMonthLabel(range.endMonth)}`;
  }
  return isMonthPeriod(period) ? formatMonthLabel(period) : period;
}

export function getPreviousPeriodKey(period: string, availableMonths: string[]): string | null {
  const sortedMonths = availableMonths.filter(isMonthPeriod).sort((left, right) => left.localeCompare(right));
  if (period === "all") {
    return null;
  }
  if (period === "ytd") {
    return "ytd-prev";
  }
  if (period === "last-24m") {
    return "last-24m-prev";
  }

  const range = parseRangePeriod(period);
  if (range) {
    const monthCount = countMonthsInclusive(range.startMonth, range.endMonth);
    const previousEnd = getMonthOffset(range.startMonth, -1);
    const previousStart = getMonthOffset(previousEnd, -(monthCount - 1));
    if (sortedMonths.length > 0 && previousEnd < sortedMonths[0]) {
      return null;
    }
    return buildRangePeriod(previousStart, previousEnd);
  }

  if (isMonthPeriod(period)) {
    const directPrevious = getPreviousMonth(period);
    if (sortedMonths.includes(directPrevious)) {
      return directPrevious;
    }
    return sortedMonths.filter((month) => month < period).at(-1) ?? null;
  }

  return null;
}

export function resolvePeriodReferenceDate(availableMonths: string[], fallbackDate: Date): Date {
  const latestMonth = availableMonths.filter(isMonthPeriod).sort((left, right) => left.localeCompare(right)).at(-1);
  const latestMonthEnd = latestMonth ? endOfMonthByKey(latestMonth) : null;
  if (!latestMonthEnd || latestMonthEnd.getFullYear() < fallbackDate.getFullYear()) {
    return fallbackDate;
  }
  return latestMonthEnd.getTime() > fallbackDate.getTime() ? fallbackDate : latestMonthEnd;
}

export function describePeriod(
  period: string,
  availableMonths: string[],
  referenceDate: Date = new Date(),
): { currentLabel: string; comparisonLabel: string } {
  const previousPeriod = getPreviousPeriodKey(period, availableMonths);
  const currentLabel = formatPeriodLabel(period, referenceDate);

  if (!previousPeriod) {
    return {
      currentLabel,
      comparisonLabel:
        period === "all" ? "No comparison period for the cumulative all-time view" : "No complete comparison period",
    };
  }

  const suffix = isRangePeriod(period)
    ? "same-length previous range"
    : isMonthPeriod(period)
      ? "month-over-month"
      : period === "ytd"
        ? "same YTD window"
        : "previous window";
  return {
    currentLabel,
    comparisonLabel: `Compared with ${formatPeriodLabel(previousPeriod, referenceDate)} (${suffix})`,
  };
}

export function isIsoDateInPeriod(isoDate: string, period: string, referenceDate: Date = new Date()): boolean {
  if (!isoDate) {
    return false;
  }
  if (period === "all") {
    return true;
  }

  const monthToken = isoDate.slice(0, 7);
  if (!isMonthPeriod(monthToken)) {
    return false;
  }
  if (isMonthPeriod(period)) {
    return monthToken === period;
  }

  const range = parseRangePeriod(period);
  if (range) {
    return monthToken >= range.startMonth && monthToken <= range.endMonth;
  }

  if (period === "ytd" || period === "ytd-prev") {
    const year = Number.parseInt(monthToken.slice(0, 4), 10);
    const month = Number.parseInt(monthToken.slice(5, 7), 10);
    const targetYear = referenceDate.getFullYear() - (period === "ytd-prev" ? 1 : 0);
    return year === targetYear && month <= referenceDate.getMonth() + 1;
  }

  if (period === "last-24m" || period === "last-24m-prev") {
    const window = getRollingMonthWindow(period, referenceDate, 24);
    return monthToken >= window.startMonth && monthToken <= window.endMonth;
  }

  return false;
}

export function getRollingMonthWindow(
  period: "last-24m" | "last-24m-prev",
  referenceDate: Date,
  months: number,
): { startMonth: string; endMonth: string } {
  const offset = period === "last-24m" ? 0 : months;
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - offset, 1);
  const start = new Date(end.getFullYear(), end.getMonth() - months + 1, 1);
  return { startMonth: monthKey(start), endMonth: monthKey(end) };
}

export function startOfMonthByKey(month: string): Date | null {
  if (!isMonthPeriod(month)) {
    return null;
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1, 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function endOfMonthByKey(month: string): Date | null {
  const start = startOfMonthByKey(month);
  return start ? new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999) : null;
}

function getYtdWindowLabel(referenceDate: Date): string {
  return `Jan-${referenceDate.toLocaleDateString(undefined, { month: "short" })}`;
}
