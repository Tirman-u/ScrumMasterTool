import { describe, expect, it } from "vitest";
import {
  buildAvailableMonths,
  buildDataMonitorEntries,
  buildTimeInStatusRows,
  buildPeriodYearGroups,
  buildMetricDataIssues,
  buildProgressComparisonSummary,
  buildTeamHealthCheckSummary,
  buildTeamHealthSignals,
  computeTeamHealthSnapshot,
  describePeriod,
  getPreviousPeriodKey,
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
    expect(snapshot.leadTimeByType.map((item) => item.issueType)).toEqual(["Bug", "Story"]);
    expect(snapshot.leadTimeByType[0].avgDays).toBeCloseTo(9, 1);
    expect(snapshot.leadTimeByType[1].avgDays).toBeCloseTo(21, 1);
    expect(snapshot.wipRiskHeatmap.rows.length).toBeGreaterThan(0);
    expect(snapshot.forecast.backlogCount).toBe(3);
    expect(snapshot.forecast.p50Days).not.toBeNull();
    expect(snapshot.sleRisk.atRiskCount).toBe(3);
    expect(snapshot.sleRisk.totalWip).toBe(3);
    expect(snapshot.staleWip.staleCount).toBe(3);
    expect(snapshot.workMix.totalDone).toBe(2);
    expect(snapshot.workMix.topTypes.map((item) => item.issueType)).toEqual(["Bug", "Story"]);
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

    expect(snapshot.flowEfficiency.valuePct).toBeCloseTo(50, 1);
    expect(snapshot.queueTime.topStatuses[0]?.status).toBe("In Progress");
    expect(snapshot.bottleneckTrend.monthCount).toBe(2);
    expect(snapshot.bottleneckTrend.dominantStatus).toBe("Backlog");
    expect(snapshot.sprintPredictability.enabled).toBe(true);
    expect(snapshot.sprintPredictability.rows.length).toBeGreaterThan(0);
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

describe("buildTeamHealthCheckSummary", () => {
  it("counts tones and prioritizes action metrics first", () => {
    const summary = buildTeamHealthCheckSummary({
      doneBugRatio: { tone: "warn", label: "Watch", reason: "Bug share is moderate." },
      intakeVsThroughput: { tone: "bad", label: "Action", reason: "Intake outpaces delivery." },
      netFlow: { tone: "bad", label: "Action", reason: "Backlog growth is high." },
      throughputStability: { tone: "good", label: "Healthy", reason: "Stable weekly throughput." },
      wipAgeRisk: { tone: "warn", label: "Watch", reason: "Old open tickets are rising." },
      leadTimeByType: { tone: "neutral", label: "N/A", reason: "No completed issues." },
      flowEfficiency: { tone: "good", label: "Healthy", reason: "Good active-work share." },
      queueTimeByStatus: { tone: "warn", label: "Watch", reason: "Waiting time is moderate." },
      bottleneckTrend: { tone: "good", label: "Healthy", reason: "Bottleneck duration is short." },
      forecast: { tone: "bad", label: "Action", reason: "Forecast horizon is long." },
      sprintPredictability: { tone: "neutral", label: "N/A", reason: "No sprint baseline." },
    });

    expect(summary.totalMetrics).toBe(11);
    expect(summary.healthyCount).toBe(3);
    expect(summary.watchCount).toBe(3);
    expect(summary.actionCount).toBe(3);
    expect(summary.neutralCount).toBe(2);
    expect(summary.topActions.map((item) => item.label)).toEqual([
      "Created vs Delivered",
      "Backlog Flow",
      "Forecast (Monte Carlo lite)",
    ]);
    expect(summary.summary).toContain("critical");
  });

  it("returns healthy summary when no watch/action indicators exist", () => {
    const summary = buildTeamHealthCheckSummary({
      doneBugRatio: { tone: "good", label: "Healthy", reason: "Low bug share." },
      intakeVsThroughput: { tone: "good", label: "Healthy", reason: "Intake in control." },
      netFlow: { tone: "good", label: "Healthy", reason: "Backlog is stable." },
      throughputStability: { tone: "good", label: "Healthy", reason: "Stable throughput." },
      wipAgeRisk: { tone: "good", label: "Healthy", reason: "Low share of old open tickets." },
      leadTimeByType: { tone: "neutral", label: "N/A", reason: "No data." },
      flowEfficiency: { tone: "good", label: "Healthy", reason: "High active share." },
      queueTimeByStatus: { tone: "good", label: "Healthy", reason: "Low queue time." },
      bottleneckTrend: { tone: "good", label: "Healthy", reason: "No recurring bottleneck." },
      forecast: { tone: "neutral", label: "N/A", reason: "No forecast data." },
      sprintPredictability: { tone: "good", label: "Healthy", reason: "Balanced commitment." },
    });

    expect(summary.actionCount).toBe(0);
    expect(summary.watchCount).toBe(0);
    expect(summary.topActions).toEqual([]);
    expect(summary.summary).toBe("All scored indicators are healthy.");
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

    const issues = buildMetricDataIssues(snapshot, TEAM_CONFIG);
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

    const issues = buildMetricDataIssues(snapshot, TEAM_CONFIG);
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

    const issues = buildMetricDataIssues(snapshot, sprintConfig);
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

    expect(months).toEqual(["2026-04"]);
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

    expect(months).toEqual(["2023-02", "2026-03", "2026-04"]);
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

describe("buildTimeInStatusRows", () => {
  it("sorts status times and highlights the worst queue stages", () => {
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

    expect(rows.map((row) => row.name)).toEqual(["On Hold", "Open", "Development", "Testing", "Done"]);
    expect(rows[0]).toMatchObject({
      name: "On Hold",
      category: "queue",
      tone: "bad",
      highlight: true,
    });
    expect(rows[1]).toMatchObject({
      name: "Open",
      category: "queue",
      tone: "bad",
      highlight: true,
    });
    expect(rows[2]).toMatchObject({
      name: "Development",
      category: "active",
      tone: "good",
      highlight: false,
    });
    expect(rows[4]).toMatchObject({
      name: "Done",
      category: "done",
      tone: "neutral",
      highlight: false,
    });
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
    expect(rowByLabel.get("Avg Cycle Time")).toBe("improved");
    expect(rowByLabel.get("2+ Sprint %")).toBe("worsened");
    expect(rowByLabel.get("Velocity (latest)")).toBe("improved");
    expect(rowByLabel.get("Open ticket count")).toBe("worsened");
  });
});
