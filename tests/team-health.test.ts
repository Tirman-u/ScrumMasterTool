import { describe, expect, it } from "vitest";
import {
  aggregateTimeInStatusEntriesForPeriod,
  buildAvailableMonths,
  buildDataMonitorEntries,
  buildTimeInStatusRows,
  buildPeriodYearGroups,
  buildMetricDataIssues,
  buildProgressComparisonSummary,
  buildTeamHealthSignals,
  computeTeamHealthSnapshot,
  describePeriod,
  getPreviousPeriodKey,
  isIsoDateInPeriod,
  resolvePeriodReferenceDate,
} from "../apps/sm-tool/src/App";
import { type BottleneckEntry, type TeamProgressSnapshot } from "../apps/sm-tool/src/types/contracts";
import { type ParsedIssue, type TeamConfig } from "../src/types/contracts";

const TEAM_CONFIG: TeamConfig = {
  teamName: "Team",
  doneConfig: {
    useStatusCategoryDone: false,
    doneStatuses: ["Done"],
  },
  sleConfig: {
    percentiles: [50, 70, 85, 95],
    rounding: "ceil",
  },
  mapping: {
    key: "Issue key",
    created: "Created",
    resolutionDate: "Resolved",
    updated: "Updated",
    status: "Status",
    resolution: "Resolution",
    storyPoints: "Story points",
    sprint: "Sprint",
    issueType: "Issue Type",
  },
};

function issue(overrides: Partial<ParsedIssue>): ParsedIssue {
  return {
    issueKey: "ABC-1",
    created: new Date("2026-01-01T00:00:00.000Z"),
    resolutionDate: null,
    updated: new Date("2026-01-02T00:00:00.000Z"),
    status: "To Do",
    resolution: "",
    issueType: "Story",
    storyPoints: null,
    sprintRaw: "",
    sourceFile: "jira.csv",
    sourceRow: 2,
    ...overrides,
  };
}

describe("computeTeamHealthSnapshot", () => {
  it("excludes cancelled and done statuses from aging WIP", () => {
    const snapshot = computeTeamHealthSnapshot(
      [
        issue({ issueKey: "ABC-1", status: "To Do", created: new Date("2026-01-01T00:00:00.000Z") }),
        issue({ issueKey: "ABC-2", status: "Cancelled", created: new Date("2026-01-01T00:00:00.000Z") }),
        issue({ issueKey: "ABC-3", status: "Done", resolutionDate: new Date("2026-01-03T00:00:00.000Z") }),
        issue({ issueKey: "ABC-4", status: "In Progress", resolution: "Canceled", created: new Date("2026-01-02T00:00:00.000Z") }),
      ],
      TEAM_CONFIG,
      "all",
      new Date("2026-02-01T00:00:00.000Z"),
    );

    expect(snapshot.agingWip.total).toBe(1);
    expect(snapshot.agingWip.topOldest.map((item) => item.issueKey)).toEqual(["ABC-1"]);
    expect(snapshot.bugRatio.wipTotal).toBe(1);
  });

  it("anchors throughput this/last month to selected period", () => {
    const issues = [
      issue({ issueKey: "ABC-1", status: "Done", updated: new Date("2026-01-10T00:00:00.000Z") }),
      issue({ issueKey: "ABC-2", status: "Done", updated: new Date("2026-02-05T00:00:00.000Z") }),
      issue({ issueKey: "ABC-3", status: "Done", updated: new Date("2026-02-20T00:00:00.000Z") }),
    ];

    const jan = computeTeamHealthSnapshot(issues, TEAM_CONFIG, "2026-01", new Date("2026-03-01T00:00:00.000Z"));
    const feb = computeTeamHealthSnapshot(issues, TEAM_CONFIG, "2026-02", new Date("2026-03-01T00:00:00.000Z"));

    expect(jan.throughput.thisMonth).toBe(1);
    expect(jan.throughput.lastMonth).toBe(0);
    expect(feb.throughput.thisMonth).toBe(2);
    expect(feb.throughput.lastMonth).toBe(1);
  });

  it("anchors all-time throughput and flow metrics to latest available activity month", () => {
    const snapshot = computeTeamHealthSnapshot(
      [
        issue({
          issueKey: "ABC-1",
          status: "Done",
          created: new Date("2026-02-03T00:00:00.000Z"),
          updated: new Date("2026-02-25T00:00:00.000Z"),
          resolutionDate: new Date("2026-02-25T00:00:00.000Z"),
        }),
        issue({
          issueKey: "ABC-2",
          status: "Done",
          created: new Date("2026-02-08T00:00:00.000Z"),
          updated: new Date("2026-02-26T00:00:00.000Z"),
          resolutionDate: new Date("2026-02-26T00:00:00.000Z"),
        }),
        issue({
          issueKey: "ABC-3",
          status: "To Do",
          created: new Date("2026-02-20T00:00:00.000Z"),
          updated: new Date("2026-02-20T00:00:00.000Z"),
        }),
      ],
      TEAM_CONFIG,
      "all",
      new Date("2026-03-21T00:00:00.000Z"),
    );

    expect(snapshot.throughput.anchorMonth).toBe("2026-02");
    expect(snapshot.throughput.comparisonMonth).toBe("2026-01");
    expect(snapshot.throughput.thisMonth).toBe(2);
    expect(snapshot.throughput.lastMonth).toBe(0);
    expect(snapshot.intakeThroughput.anchorMonth).toBe("2026-02");
    expect(snapshot.intakeThroughput.intakeThisMonth).toBe(3);
    expect(snapshot.intakeThroughput.throughputThisMonth).toBe(2);
    expect(snapshot.netFlow.thisMonth).toBe(1);
  });

  it("uses delivery date instead of updated date for done-period throughput", () => {
    const doneMovedLater = issue({
      issueKey: "ABC-9",
      status: "Done",
      created: new Date("2026-02-01T00:00:00.000Z"),
      resolutionDate: new Date("2026-02-20T00:00:00.000Z"),
      updated: new Date("2026-03-05T00:00:00.000Z"),
    });

    const feb = computeTeamHealthSnapshot([doneMovedLater], TEAM_CONFIG, "2026-02", new Date("2026-03-21T00:00:00.000Z"));
    const mar = computeTeamHealthSnapshot([doneMovedLater], TEAM_CONFIG, "2026-03", new Date("2026-03-21T00:00:00.000Z"));

    expect(feb.throughput.thisMonth).toBe(1);
    expect(feb.bugRatio.doneTotal).toBe(1);
    expect(mar.throughput.thisMonth).toBe(0);
    expect(mar.bugRatio.doneTotal).toBe(0);
  });

  it("excludes configured issue keys from team health counters", () => {
    const configWithExclusions: TeamConfig = {
      ...TEAM_CONFIG,
      excludedIssueKeys: ["ABC-2"],
    };

    const snapshot = computeTeamHealthSnapshot(
      [
        issue({ issueKey: "ABC-1", status: "Done", updated: new Date("2026-02-05T00:00:00.000Z") }),
        issue({ issueKey: "ABC-2", status: "Done", updated: new Date("2026-02-05T00:00:00.000Z") }),
      ],
      configWithExclusions,
      "all",
      new Date("2026-02-26T00:00:00.000Z"),
    );

    expect(snapshot.throughput.thisMonth).toBe(1);
    expect(snapshot.bugRatio.doneTotal).toBe(1);
  });

  it("computes intake, net flow, stability, wip risk and lead time by type", () => {
    const snapshot = computeTeamHealthSnapshot(
      [
        issue({
          issueKey: "ABC-1",
          status: "Done",
          issueType: "Bug",
          created: new Date("2026-02-01T00:00:00.000Z"),
          resolutionDate: new Date("2026-02-10T00:00:00.000Z"),
          updated: new Date("2026-02-10T00:00:00.000Z"),
        }),
        issue({
          issueKey: "ABC-2",
          status: "Done",
          issueType: "Story",
          created: new Date("2026-01-25T00:00:00.000Z"),
          resolutionDate: new Date("2026-02-15T00:00:00.000Z"),
          updated: new Date("2026-02-15T00:00:00.000Z"),
        }),
        issue({
          issueKey: "ABC-3",
          status: "Done",
          issueType: "Task",
          created: new Date("2026-01-10T00:00:00.000Z"),
          resolutionDate: new Date("2026-01-20T00:00:00.000Z"),
          updated: new Date("2026-01-20T00:00:00.000Z"),
        }),
        issue({
          issueKey: "ABC-4",
          status: "In Progress",
          issueType: "Task",
          created: new Date("2026-02-01T00:00:00.000Z"),
          resolutionDate: null,
        }),
        issue({
          issueKey: "ABC-5",
          status: "To Do",
          issueType: "Story",
          created: new Date("2025-12-01T00:00:00.000Z"),
          resolutionDate: null,
        }),
        issue({
          issueKey: "ABC-6",
          status: "To Do",
          issueType: "Story",
          created: new Date("2026-01-20T00:00:00.000Z"),
          resolutionDate: null,
        }),
      ],
      TEAM_CONFIG,
      "2026-02",
      new Date("2026-02-26T00:00:00.000Z"),
    );

    expect(snapshot.intakeThroughput.intakeThisMonth).toBe(2);
    expect(snapshot.intakeThroughput.throughputThisMonth).toBe(2);
    expect(snapshot.netFlow.thisMonth).toBe(0);
    expect(snapshot.throughputStability.weeklyCvPct).not.toBeNull();
    expect(snapshot.throughputStability.weeklyPredictabilityPct).toBeCloseTo(
      Math.max(0, 100 - (snapshot.throughputStability.weeklyCvPct ?? 0)),
      1,
    );
    expect(snapshot.wipRisk.over30Pct).toBeCloseTo(66.7, 1);
    expect(snapshot.wipRisk.over30DeltaPpVs30dBaseline).toBeCloseTo(33.3, 1);
    expect(snapshot.leadTimeByType.map((item) => item.issueType)).toEqual(["Story", "Bug"]);
    expect(snapshot.leadTimeByType[0].avgDays).toBeCloseTo(21, 1);
    expect(snapshot.leadTimeByType[1].avgDays).toBeCloseTo(9, 1);
    expect(snapshot.wipRiskHeatmap.rows.length).toBeGreaterThan(0);
    expect(snapshot.forecast.backlogCount).toBe(3);
    expect(snapshot.forecast.p50Days).not.toBeNull();
    expect(snapshot.sleRisk.atRiskCount).toBe(3);
    expect(snapshot.sleRisk.totalWip).toBe(3);
    expect(snapshot.staleWip.staleCount).toBe(3);
    expect(snapshot.workMix.totalDone).toBe(2);
    expect(snapshot.workMix.topTypes.map((item) => item.issueType)).toEqual(["Bug", "Story"]);
  });

  it("limits SLE risk to configured issue types and prefers open Cycle Time", () => {
    const config: TeamConfig = {
      ...TEAM_CONFIG,
      sleConfig: {
        ...TEAM_CONFIG.sleConfig,
        issueTypes: ["Story"],
      },
    };
    const snapshot = computeTeamHealthSnapshot(
      [
        issue({
          issueKey: "ABC-1",
          issueType: "Story",
          status: "In Progress",
          created: new Date("2026-01-01T00:00:00.000Z"),
        }),
        issue({
          issueKey: "ABC-2",
          issueType: "Epic",
          status: "In Progress",
          created: new Date("2026-01-01T00:00:00.000Z"),
        }),
      ],
      config,
      "all",
      new Date("2026-02-01T00:00:00.000Z"),
      [],
      10,
      new Map([
        ["abc-1", 8],
        ["abc-2", 20],
      ]),
    );

    expect(snapshot.sleRisk).toEqual({
      thresholdDays: 10,
      atRiskCount: 0,
      totalWip: 1,
      atRiskPct: 0,
    });
  });

  it("uses project entry date for moved issue WIP age and intake", () => {
    const snapshot = computeTeamHealthSnapshot(
      [
        issue({
          issueKey: "NEW-8",
          previousIssueKeys: ["OLD-8"],
          created: new Date("2026-01-01T00:00:00.000Z"),
          projectEnteredAt: new Date("2026-03-20T00:00:00.000Z"),
          updated: null,
          resolutionDate: null,
          status: "In Progress",
        }),
      ],
      TEAM_CONFIG,
      "2026-03",
      new Date("2026-03-25T00:00:00.000Z"),
    );

    expect(snapshot.intakeThroughput.intakeThisMonth).toBe(1);
    expect(snapshot.agingWip.topOldest[0]?.agingDays).toBe(5);
    expect(snapshot.wipRisk.over30Pct).toBe(0);
  });

  it("builds exclusive WIP heatmap buckets that sum to total", () => {
    const snapshot = computeTeamHealthSnapshot(
      [
        issue({ issueKey: "ABC-1", status: "Open", created: new Date("2026-04-05T00:00:00.000Z") }),
        issue({ issueKey: "ABC-2", status: "Open", created: new Date("2026-02-25T00:00:00.000Z") }),
        issue({ issueKey: "ABC-3", status: "Open", created: new Date("2026-01-31T00:00:00.000Z") }),
        issue({ issueKey: "ABC-4", status: "Open", created: new Date("2025-12-31T00:00:00.000Z") }),
      ],
      TEAM_CONFIG,
      "2026-04",
      new Date("2026-04-10T00:00:00.000Z"),
    );

    expect(snapshot.wipRiskHeatmap.rows).toEqual([
      {
        status: "Open",
        total: 4,
        age0To30: 1,
        age31To60: 1,
        age61To90: 1,
        age91Plus: 1,
      },
    ]);
  });

  it("computes unestimated sprint work and delivered-outside-sprint ratios", () => {
    const snapshot = computeTeamHealthSnapshot(
      [
        issue({
          issueKey: "ABC-1",
          status: "Done",
          updated: new Date("2026-02-03T00:00:00.000Z"),
          resolutionDate: new Date("2026-02-03T00:00:00.000Z"),
          sprintRaw: "Sprint A",
          storyPoints: null,
        }),
        issue({
          issueKey: "ABC-2",
          status: "Done",
          updated: new Date("2026-02-04T00:00:00.000Z"),
          resolutionDate: new Date("2026-02-04T00:00:00.000Z"),
          sprintRaw: "",
          storyPoints: 5,
        }),
        issue({
          issueKey: "ABC-3",
          status: "In Progress",
          updated: new Date("2026-02-05T00:00:00.000Z"),
          sprintRaw: "Sprint A",
          storyPoints: 3,
        }),
      ],
      TEAM_CONFIG,
      "2026-02",
      new Date("2026-02-26T00:00:00.000Z"),
    );

    expect(snapshot.sprintWork.inSprintTotal).toBe(2);
    expect(snapshot.sprintWork.inSprintUnestimatedCount).toBe(1);
    expect(snapshot.sprintWork.inSprintUnestimatedPct).toBeCloseTo(50, 1);
    expect(snapshot.sprintWork.doneTotal).toBe(2);
    expect(snapshot.sprintWork.deliveredOutsideSprintCount).toBe(1);
    expect(snapshot.sprintWork.deliveredOutsideSprintPct).toBeCloseTo(50, 1);
  });

  it("treats backlog growth as positive net flow (Created - Delivered)", () => {
    const snapshot = computeTeamHealthSnapshot(
      [
        issue({
          issueKey: "ABC-1",
          status: "Done",
          issueType: "Story",
          created: new Date("2026-02-01T00:00:00.000Z"),
          resolutionDate: new Date("2026-02-10T00:00:00.000Z"),
          updated: new Date("2026-02-10T00:00:00.000Z"),
        }),
        issue({
          issueKey: "ABC-2",
          status: "In Progress",
          issueType: "Task",
          created: new Date("2026-02-12T00:00:00.000Z"),
          resolutionDate: null,
        }),
        issue({
          issueKey: "ABC-3",
          status: "To Do",
          issueType: "Story",
          created: new Date("2026-02-15T00:00:00.000Z"),
          resolutionDate: null,
        }),
      ],
      TEAM_CONFIG,
      "2026-02",
      new Date("2026-02-26T00:00:00.000Z"),
    );

    expect(snapshot.intakeThroughput.intakeThisMonth).toBe(3);
    expect(snapshot.intakeThroughput.throughputThisMonth).toBe(1);
    expect(snapshot.netFlow.thisMonth).toBe(2);
  });

  it("computes bottleneck insights and sprint predictability", () => {
    const snapshot = computeTeamHealthSnapshot(
      [
        issue({
          issueKey: "ABC-1",
          status: "Done",
          issueType: "Story",
          created: new Date("2026-01-02T00:00:00.000Z"),
          resolutionDate: new Date("2026-01-08T00:00:00.000Z"),
          updated: new Date("2026-01-08T00:00:00.000Z"),
        }),
        issue({
          issueKey: "ABC-2",
          status: "Done",
          issueType: "Task",
          created: new Date("2026-01-20T00:00:00.000Z"),
          resolutionDate: new Date("2026-02-03T00:00:00.000Z"),
          updated: new Date("2026-02-03T00:00:00.000Z"),
        }),
        issue({
          issueKey: "ABC-3",
          status: "In Progress",
          issueType: "Story",
          created: new Date("2026-02-01T00:00:00.000Z"),
          resolutionDate: null,
        }),
      ],
      {
        ...TEAM_CONFIG,
        velocityConfig: {
          mode: "sprint",
          sprintStartDate: "2026-01-01",
          sprintLengthWeeks: 2,
        },
      },
      "2026-02",
      new Date("2026-02-26T00:00:00.000Z"),
      [
        {
          period: "2026-01",
          columns: [
            { name: "In Progress", avgDays: 10 },
            { name: "Backlog", avgDays: 15 },
            { name: "Code Review", avgDays: 3 },
          ],
        },
        {
          period: "2026-02",
          columns: [
            { name: "In Progress", avgDays: 8 },
            { name: "Code Review", avgDays: 4 },
            { name: "To Do", avgDays: 12 },
          ],
        },
      ],
    );

    expect(snapshot.flowEfficiency.activeSharePct).toBeCloseTo(50, 1);
    expect(snapshot.flowEfficiency.valuePct).toBeCloseTo(55, 1);
    expect(snapshot.queueTime.topStatuses[0]?.status).toBe("To Do");
    expect(snapshot.bottleneckTrend.monthCount).toBe(2);
    expect(snapshot.bottleneckTrend.dominantStatus).toBe("Backlog");
  });

  it("does not count waiting-like active workflow statuses as flow efficiency value-add", () => {
    const snapshot = computeTeamHealthSnapshot(
      [],
      {
        ...TEAM_CONFIG,
        workflowConfig: {
          funnelStatuses: ["Refinement"],
          activeStatuses: ["Ready for Testing", "On Hold"],
          implementingStatuses: ["Development", "Testing"],
        },
      },
      "2026-02",
      new Date("2026-02-26T00:00:00.000Z"),
      [
        {
          period: "2026-02",
          columns: [
            { name: "Refinement", avgDays: 5 },
            { name: "Ready for Testing", avgDays: 10 },
            { name: "On Hold", avgDays: 2 },
            { name: "Development", avgDays: 4 },
            { name: "Testing", avgDays: 6 },
          ],
        },
      ],
    );

    expect(snapshot.flowEfficiency.activeDays).toBe(10);
    expect(snapshot.flowEfficiency.queueDays).toBe(17);
    expect(snapshot.flowEfficiency.activeSharePct).toBeCloseTo(37, 1);
    expect(snapshot.flowEfficiency.valuePct).toBeLessThan(75);
    expect(snapshot.flowEfficiency.limitingReason).toContain("Ready for Testing");
  });
});

describe("buildTeamHealthSignals", () => {
  it("treats low throughput predictability as action", () => {
    const snapshot = computeTeamHealthSnapshot(
      Array.from({ length: 8 }, (_, index) =>
        issue({
          issueKey: `ABC-${index + 1}`,
          status: "Done",
          updated: new Date("2026-02-24T00:00:00.000Z"),
          resolutionDate: new Date("2026-02-24T00:00:00.000Z"),
        }),
      ),
      TEAM_CONFIG,
      "2026-02",
      new Date("2026-02-26T00:00:00.000Z"),
    );

    expect(snapshot.throughputStability.weeklyPredictabilityPct).toBe(0);
    expect(buildTeamHealthSignals(snapshot).throughputStability.tone).toBe("bad");
  });
});

describe("buildMetricDataIssues", () => {
  it("does not require sprint cadence dates for sprint metrics", () => {
    const snapshot = computeTeamHealthSnapshot(
      [
        issue({
          issueKey: "ABC-1",
          status: "Done",
          created: new Date("2026-02-01T00:00:00.000Z"),
          updated: new Date("2026-02-05T00:00:00.000Z"),
          resolutionDate: new Date("2026-02-05T00:00:00.000Z"),
        }),
      ],
      TEAM_CONFIG,
      "2026-02",
      new Date("2026-02-26T00:00:00.000Z"),
    );

    const issues = buildMetricDataIssues(snapshot);
    expect(issues.sprintPredictability).toBeUndefined();
  });

  it("flags missing time-in-status and forecast prerequisites", () => {
    const snapshot = computeTeamHealthSnapshot(
      [
        issue({
          issueKey: "ABC-2",
          status: "In Progress",
          created: new Date("2026-02-10T00:00:00.000Z"),
          updated: new Date("2026-02-12T00:00:00.000Z"),
          resolutionDate: null,
        }),
      ],
      TEAM_CONFIG,
      "2026-02",
      new Date("2026-02-26T00:00:00.000Z"),
    );

    const issues = buildMetricDataIssues(snapshot);
    expect(issues.flowEfficiency?.tone).toBe("bad");
    expect(issues.queueTimeByStatus?.tone).toBe("bad");
    expect(issues.bottleneckTrend?.tone).toBe("warn");
    expect(issues.forecastMonteCarlo?.tone).toBe("bad");
  });

  it("does not flag missing sprint commitment baseline", () => {
    const sprintConfig: TeamConfig = {
      ...TEAM_CONFIG,
      velocityConfig: {
        mode: "sprint-story-points",
        sprintStartDate: "2026-01-01",
        sprintLengthWeeks: 2,
      },
    };

    const snapshot = computeTeamHealthSnapshot(
      [],
      sprintConfig,
      "2026-02",
      new Date("2026-02-26T00:00:00.000Z"),
    );

    const issues = buildMetricDataIssues(snapshot);
    expect(issues.sprintPredictability).toBeUndefined();
  });
});

describe("buildDataMonitorEntries", () => {
  it("surfaces source-field gaps and metric blockers in one list", () => {
    const sprintConfig: TeamConfig = {
      ...TEAM_CONFIG,
      velocityConfig: {
        mode: "sprint-story-points",
        sprintStartDate: "2026-01-01",
        sprintLengthWeeks: 2,
      },
    };

    const entries = buildDataMonitorEntries(
      [
        issue({
          issueKey: "ABC-1",
          status: "Done",
          created: null,
          updated: null,
          sprintRaw: "",
        }),
        issue({
          issueKey: "ABC-2",
          status: "In Progress",
          created: null,
          issueType: "",
          sprintRaw: "",
        }),
        issue({
          issueKey: "ABC-3",
          status: "Open",
          sprintRaw: "",
        }),
      ],
      sprintConfig,
      "2026-02",
      {
        flowEfficiency: {
          tone: "bad",
          message: "Time in Status data is missing for selected period.",
        },
      },
      [],
    );

    const titles = entries.map((entry) => entry.title);
    expect(titles).toContain("Flow Efficiency");
    expect(titles).toContain("Delivery date missing on done items");
    expect(titles).toContain("Created missing on open items");
    expect(titles).toContain("Issue Type missing");
    expect(titles).toContain("Done Story estimate missing");
    expect(titles).toContain("Sprint field missing");
    expect(titles).toContain("Time in Status missing");

    const deliveryDateEntry = entries.find((entry) => entry.title === "Delivery date missing on done items");
    expect(deliveryDateEntry?.sampleIssueKeys).toEqual(["ABC-1"]);
    const storyEstimateEntry = entries.find((entry) => entry.title === "Done Story estimate missing");
    expect(storyEstimateEntry?.tone).toBe("warn");
    expect(storyEstimateEntry?.sampleIssueKeys).toEqual(["ABC-1"]);
    const sprintEntry = entries.find((entry) => entry.title === "Sprint field missing");
    expect(sprintEntry?.sampleIssueKeys).toEqual(["ABC-1", "ABC-2"]);
  });

  it("treats task estimates as optional and ignores bug estimates", () => {
    const entries = buildDataMonitorEntries(
      [
        issue({
          issueKey: "ABC-20",
          status: "Done",
          issueType: "Task",
          storyPoints: null,
          resolutionDate: new Date("2026-02-05T00:00:00.000Z"),
        }),
        issue({
          issueKey: "ABC-21",
          status: "Done",
          issueType: "Bug",
          storyPoints: null,
          resolutionDate: new Date("2026-02-06T00:00:00.000Z"),
        }),
      ],
      TEAM_CONFIG,
      "2026-02",
      {},
      [],
    );

    const taskEntry = entries.find((entry) => entry.title === "Done Task estimate optional");
    expect(taskEntry?.tone).toBe("info");
    expect(taskEntry?.sampleIssueKeys).toEqual(["ABC-20"]);
    expect(entries.some((entry) => entry.sampleIssueKeys.includes("ABC-21") && entry.title.includes("estimate"))).toBe(false);
  });

  it("respects custom sprint scope statuses for missing sprint warnings", () => {
    const entries = buildDataMonitorEntries(
      [
        issue({
          issueKey: "ABC-10",
          status: "QA Ready",
          sprintRaw: "",
        }),
        issue({
          issueKey: "ABC-11",
          status: "Open",
          sprintRaw: "",
        }),
      ],
      {
        ...TEAM_CONFIG,
        sprintScopeConfig: {
          statuses: ["QA Ready"],
        },
      },
      "2026-02",
      {},
      [],
    );

    const sprintEntry = entries.find((entry) => entry.title === "Sprint field missing");
    expect(sprintEntry?.sampleIssueKeys).toEqual(["ABC-10"]);
  });
});

describe("period comparison helpers", () => {
  it("does not compare all-time cumulative view against a month", () => {
    expect(getPreviousPeriodKey("all", ["2026-01", "2026-02"])).toBeNull();
    expect(describePeriod("all", ["2026-01", "2026-02"]).comparisonLabel).toContain("cumulative all-time view");
  });

  it("keeps month-over-month comparison for monthly periods", () => {
    expect(getPreviousPeriodKey("2026-02", ["2026-01", "2026-02"])).toBe("2026-01");
    expect(describePeriod("2026-02", ["2026-01", "2026-02"]).comparisonLabel).toContain("month-over-month");
  });

  it("anchors YTD labels to the provided reference date", () => {
    const febAnchor = new Date(2026, 1, 28, 12, 0, 0);
    const summary = describePeriod("ytd", ["2026-01", "2026-02"], febAnchor);

    expect(summary.currentLabel).toBe("YTD 2026 (Jan-Feb)");
    expect(summary.comparisonLabel).toContain("YTD 2025 (Jan-Feb)");
  });

  it("compares custom month ranges against the previous same-length range", () => {
    const summary = describePeriod(
      "range:2026-01..2026-03",
      ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"],
      new Date("2026-03-31T00:00:00.000Z"),
    );

    expect(summary.currentLabel).toContain("Jan");
    expect(summary.currentLabel).toContain("Mar");
    expect(summary.comparisonLabel).toContain("Oct");
    expect(summary.comparisonLabel).toContain("Dec");
  });

  it("includes only dates inside a selected month range", () => {
    const period = "range:2026-01..2026-03";

    expect(isIsoDateInPeriod("2026-01-01T00:00:00.000Z", period)).toBe(true);
    expect(isIsoDateInPeriod("2026-03-31T23:59:59.000Z", period)).toBe(true);
    expect(isIsoDateInPeriod("2025-12-31T23:59:59.000Z", period)).toBe(false);
    expect(isIsoDateInPeriod("2026-04-01T00:00:00.000Z", period)).toBe(false);
  });
});

describe("period month helpers", () => {
  it("builds available months from updated, delivered and bottleneck rows", () => {
    const months = buildAvailableMonths([
      {
        metrics: null,
        parsedIssues: [
          issue({ created: new Date("2026-03-03T00:00:00.000Z"), updated: null, resolutionDate: null }),
        ],
        autoBottleneck: [{ period: "2026-04", columns: [], notes: "" }],
        manualBottleneck: [],
        importFiles: [],
      },
    ]);

    expect(months).toEqual(["2026-03", "2026-04"]);
  });

  it("uses real activity months instead of import folder months", () => {
    const months = buildAvailableMonths([
      {
        metrics: null,
        parsedIssues: [
          issue({
            created: new Date("2018-07-03T00:00:00.000Z"),
            updated: new Date("2026-03-03T00:00:00.000Z"),
            resolutionDate: new Date("2023-02-15T00:00:00.000Z"),
          }),
        ],
        autoBottleneck: [{ period: "2026-04", columns: [], notes: "" }],
        manualBottleneck: [],
        importFiles: [
          {
            name: "open.csv",
            relativePath: "2026-02/open.csv",
            bucket: "2026-02",
            updatedAt: "2026-03-21T09:55:02.000Z",
            rowCount: 10,
          },
          {
            name: "closed.csv",
            relativePath: "2026-03/closed.csv",
            bucket: "2026-03",
            updatedAt: "2026-03-21T09:55:10.000Z",
            rowCount: 10,
          },
        ],
      },
    ]);

    expect(months).toEqual(["2018-07", "2023-02", "2026-03", "2026-04"]);
  });

  it("uses project entry instead of the original creation month for moved issues", () => {
    const months = buildAvailableMonths([
      {
        metrics: null,
        parsedIssues: [
          issue({
            created: new Date("2018-07-03T00:00:00.000Z"),
            projectEnteredAt: new Date("2026-02-10T00:00:00.000Z"),
            updated: null,
            resolutionDate: null,
          }),
        ],
      },
    ]);

    expect(months).toEqual(["2026-02"]);
  });

  it("shows the latest years first in period year groups", () => {
    const groups = buildPeriodYearGroups(["2023-02", "2025-12", "2026-01", "2026-03"]);

    expect(groups).toEqual([
      {
        year: "2026",
        months: ["2026-03", "2026-01"],
      },
      {
        year: "2025",
        months: ["2025-12"],
      },
    ]);
  });

  it("resolves period reference date from the latest available month", () => {
    const reference = resolvePeriodReferenceDate(["2026-01", "2026-02"], new Date("2026-03-21T00:00:00.000Z"));
    expect(reference.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("falls back to the current date when available months are still in the previous year", () => {
    const fallback = new Date("2026-03-25T00:00:00.000Z");
    const reference = resolvePeriodReferenceDate(["2025-11", "2025-12"], fallback);

    expect(reference.toISOString()).toBe(fallback.toISOString());
  });
});

describe("range Time in Status aggregation", () => {
  it("weights monthly averages by their issue sample sizes", () => {
    const entry = aggregateTimeInStatusEntriesForPeriod(
      [
        {
          period: "2026-01",
          columns: [{ name: "Review", avgDays: 10, sampleCount: 10 }],
        },
        {
          period: "2026-02",
          columns: [{ name: "Review", avgDays: 30, sampleCount: 2 }],
        },
      ],
      "range:2026-01..2026-02",
      new Date("2026-02-28T00:00:00.000Z"),
    );

    expect(entry?.columns[0].sampleCount).toBe(12);
    expect(entry?.columns[0].avgDays).toBeCloseTo(13.33, 2);
  });
});

describe("buildTimeInStatusRows", () => {
  it("keeps Time in Status column order and highlights the worst queue stages", () => {
    const entry: BottleneckEntry = {
      period: "2026-03",
      columns: [
        { name: "Development", avgDays: 6.6 },
        { name: "On Hold", avgDays: 18.9 },
        { name: "Done", avgDays: 1.2 },
        { name: "Open", avgDays: 14.5 },
        { name: "Testing", avgDays: 4.5 },
      ],
    };

    const rows = buildTimeInStatusRows(entry, new Map());

    expect(rows.map((row) => row.name)).toEqual(["Development", "On Hold", "Done", "Open", "Testing"]);
    expect(rows[1]).toMatchObject({
      name: "On Hold",
      category: "queue",
      tone: "bad",
      highlight: true,
    });
    expect(rows[3]).toMatchObject({
      name: "Open",
      category: "queue",
      tone: "bad",
      highlight: true,
    });
    expect(rows[0]).toMatchObject({
      name: "Development",
      category: "active",
      tone: "good",
      highlight: false,
    });
    expect(rows[2]).toMatchObject({
      name: "Done",
      category: "done",
      tone: "neutral",
      highlight: false,
    });
  });

  it("orders Time in Status rows by configured workflow for team presentation", () => {
    const entry: BottleneckEntry = {
      period: "2026-03",
      columns: [
        { name: "Code review", avgDays: 3.2 },
        { name: "Open", avgDays: 33.8 },
        { name: "Done", avgDays: 10.2 },
        { name: "Ready for Testing", avgDays: 7.5 },
        { name: "To Do", avgDays: 19.7 },
      ],
    };

    const rows = buildTimeInStatusRows(entry, new Map(), {
      ...TEAM_CONFIG,
      workflowConfig: {
        backlogStatuses: ["Open"],
        funnelStatuses: ["To Do"],
        activeStatuses: ["Ready for Testing"],
        implementingStatuses: ["Code review"],
      },
    });

    expect(rows.map((row) => row.name)).toEqual(["Open", "To Do", "Ready for Testing", "Code review", "Done"]);
    expect(rows.map((row) => row.flowRole)).toEqual(["backlog", "funnel", "active", "implementation", "done"]);
  });
});

describe("buildProgressComparisonSummary", () => {
  it("returns baseline mode when there is less than two snapshots", () => {
    const summary = buildProgressComparisonSummary([
      {
        capturedAt: "2026-02-01T00:00:00.000Z",
        importSignature: "sig-1",
        metrics: {
          avgCycleTimeDays: 20,
          sleP85Days: 40,
          multiSprintPct: 12,
          velocityLatest: 30,
          doneBugRatioPct: 10,
          openWipCount: 22,
          openWipAvgAgeDays: 18,
        },
      },
    ]);

    expect(summary.hasBaseline).toBe(false);
    expect(summary.rows).toHaveLength(0);
  });

  it("counts improved and worsened metrics between two snapshots", () => {
    const snapshots: TeamProgressSnapshot[] = [
      {
        capturedAt: "2026-02-01T00:00:00.000Z",
        importSignature: "sig-1",
        metrics: {
          avgCycleTimeDays: 24,
          sleP85Days: 52,
          multiSprintPct: 18,
          velocityLatest: 21,
          doneBugRatioPct: 16,
          openWipCount: 40,
          openWipAvgAgeDays: 28,
        },
      },
      {
        capturedAt: "2026-03-01T00:00:00.000Z",
        importSignature: "sig-2",
        metrics: {
          avgCycleTimeDays: 19,
          sleP85Days: 48,
          multiSprintPct: 21,
          velocityLatest: 26,
          doneBugRatioPct: 12,
          openWipCount: 43,
          openWipAvgAgeDays: 24,
        },
      },
    ];

    const summary = buildProgressComparisonSummary(snapshots);
    expect(summary.hasBaseline).toBe(true);
    expect(summary.improvedCount).toBe(5);
    expect(summary.worsenedCount).toBe(2);
    expect(summary.unchangedCount).toBe(0);

    const rowByLabel = new Map(summary.rows.map((row) => [row.label, row.trend]));
    expect(rowByLabel.get("Avg Implementation Time")).toBe("improved");
    expect(rowByLabel.get("2+ Sprint %")).toBe("worsened");
    expect(rowByLabel.get("Velocity (latest)")).toBe("improved");
    expect(rowByLabel.get("Open ticket count")).toBe("worsened");
  });
});
