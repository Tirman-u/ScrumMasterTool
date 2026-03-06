import { describe, expect, it } from "vitest";
import { getBottleneckForPeriod } from "../apps/sm-tool/src/App";
import { type BottleneckEntry } from "../apps/sm-tool/src/types/contracts";

const ENTRIES: BottleneckEntry[] = [
  {
    period: "2026-01",
    columns: [
      { name: "In Progress", avgDays: 20 },
      { name: "Code Review", avgDays: 4 },
    ],
  },
  {
    period: "2026-03",
    columns: [
      { name: "In Progress", avgDays: 17 },
      { name: "Test", avgDays: 6 },
    ],
  },
];

describe("getBottleneckForPeriod", () => {
  it("returns exact period bottleneck when available", () => {
    expect(getBottleneckForPeriod(ENTRIES, "2026-01")).toBe("In Progress (20.0 days)");
  });

  it("falls back to latest previous month when selected month has no entry", () => {
    expect(getBottleneckForPeriod(ENTRIES, "2026-02")).toBe("In Progress (20.0 days, Jan 2026)");
  });

  it("falls back to latest known month for non-month periods", () => {
    expect(getBottleneckForPeriod(ENTRIES, "all")).toBe("In Progress (17.0 days, Mar 2026)");
  });

  it("returns dash when no entries exist", () => {
    expect(getBottleneckForPeriod([], "2026-02")).toBe("-");
  });
});
