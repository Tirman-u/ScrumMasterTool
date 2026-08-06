import { describe, expect, it } from "vitest";
import {
  calendarDurationToWorkingDays,
  workingDaysBetween,
} from "../apps/sm-tool/src/lib/working-days.js";

describe("working-day durations", () => {
  it("counts Monday-Friday and excludes weekends", () => {
    const monday = new Date(2026, 0, 5, 9, 0, 0);
    const nextMonday = new Date(2026, 0, 12, 9, 0, 0);

    expect(workingDaysBetween(monday, nextMonday)).toBe(5);
  });

  it("keeps fractional weekday time while skipping the weekend", () => {
    const fridayNoon = new Date(2026, 0, 9, 12, 0, 0);
    const mondayNoon = new Date(2026, 0, 12, 12, 0, 0);

    expect(workingDaysBetween(fridayNoon, mondayNoon)).toBe(1);
    expect(calendarDurationToWorkingDays(3, mondayNoon)).toBe(1);
  });
});
