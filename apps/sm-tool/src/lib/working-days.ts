const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DurationBasis = "calendar-days" | "working-days";

export function workingDaysBetween(start: Date, end: Date): number {
  if (!isValidDate(start) || !isValidDate(end) || end.getTime() <= start.getTime()) {
    return 0;
  }

  let cursor = new Date(start);
  let totalDays = 0;

  while (cursor.getTime() < end.getTime()) {
    const nextDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const segmentEndMs = Math.min(nextDay.getTime(), end.getTime());
    const dayOfWeek = cursor.getDay();

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      totalDays += (segmentEndMs - cursor.getTime()) / MS_PER_DAY;
    }

    cursor = nextDay;
  }

  return Math.round(totalDays * 1_000_000_000) / 1_000_000_000;
}

export function calendarDurationToWorkingDays(calendarDays: number | null, end: Date): number | null {
  if (calendarDays === null || !Number.isFinite(calendarDays) || calendarDays < 0 || !isValidDate(end)) {
    return null;
  }

  if (calendarDays === 0) {
    return 0;
  }

  const start = new Date(end.getTime() - calendarDays * MS_PER_DAY);
  return workingDaysBetween(start, end);
}

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}
