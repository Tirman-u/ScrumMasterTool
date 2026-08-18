import { describe, expect, it } from "vitest";
import { normalizeTeamMetrics } from "../apps/sm-tool/src/lib/workspace";

describe("normalizeTeamMetrics", () => {
  it("builds missing UI fields from legacy metrics payload", () => {
    const normalized = normalizeTeamMetrics({
      generatedAt: "2026-02-01T00:00:00.000Z",
      teamName: "Alpha",
      totalImportedRows: 2,
      uniqueIssues: 2,
      doneIssues: 2,
      cycleTimeCount: 2,
      cycleTimeDays: [3, 5],
      sle: {
        percentiles: [50, 70, 85, 95],
        rounding: "ceil",
        values: {
          p50: 4,
          p70: 5,
          p85: 5,
          p95: 5,
        },
      },
      scatter: [
        { issueKey: "ALPHA-1", resolutionDate: "2026-01-03T00:00:00.000Z", cycleTimeDays: 3 },
        { issueKey: "ALPHA-2", resolutionDate: "2026-01-05T00:00:00.000Z", cycleTimeDays: 5 },
      ],
      scatterOverlay: {
        p50: 4,
        p70: 5,
        p85: 5,
        p95: 5,
      },
      velocityMonthly: [{ month: "2026-01", value: 5 }],
      multiSprintIssueKeys: ["ALPHA-2"],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.avgCycleTimeDays).toBe(4);
    expect(normalized?.doneIssueDetails).toEqual([
      {
        issueKey: "ALPHA-1",
        resolutionDate: "2026-01-03T00:00:00.000Z",
        cycleTimeDays: 3,
        issueType: "",
        storyPoints: null,
        sprintCount: 0,
      },
      {
        issueKey: "ALPHA-2",
        resolutionDate: "2026-01-05T00:00:00.000Z",
        cycleTimeDays: 5,
        issueType: "",
        storyPoints: null,
        sprintCount: 0,
      },
    ]);
    expect(normalized?.multiSprint).toEqual({
      count: 1,
      percentage: 50,
    });
  });

  it("returns null when metrics payload is structurally invalid", () => {
    expect(normalizeTeamMetrics(null)).toBeNull();
    expect(normalizeTeamMetrics({})).toBeNull();
    expect(
      normalizeTeamMetrics({
        teamName: "",
      }),
    ).toBeNull();
  });

  it("migrates legacy flow details and scatter points to working days", () => {
    const normalized = normalizeTeamMetrics({
      teamName: "Legacy",
      cycleTimeDays: [7],
      scatter: [
        { issueKey: "LEG-1", resolutionDate: "2026-01-12T09:00:00.000Z", cycleTimeDays: 365 },
      ],
      flowTimingDetails: [
        {
          issueKey: "LEG-1",
          anchorDate: "2026-01-12T09:00:00.000Z",
          scope: "closed",
          leadTimeDays: 7,
          activeTimeDays: 7,
          cycleTimeDays: 7,
        },
      ],
    });

    expect(normalized?.flowTimingBasis).toBe("working-days");
    expect(normalized?.flowTimingDetails?.[0].cycleTimeDays).toBe(5);
    expect(normalized?.scatter).toEqual([
      {
        issueKey: "LEG-1",
        resolutionDate: "2026-01-12T09:00:00.000Z",
        cycleTimeDays: 5,
      },
    ]);
    expect(normalized?.avgCycleTimeDays).toBe(5);
  });
});
