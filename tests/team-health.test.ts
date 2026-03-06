import { describe, expect, it } from "vitest";
import {
  buildMetricDataIssues,
  buildProgressComparisonSummary,
  buildTeamHealthCheckSummary,
  computeTeamHealthSnapshot,
} from "../apps/sm-tool/src/App";
import { type TeamProgressSnapshot } from "../apps/sm-tool/src/types/contracts";
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
    expect(snapshot.wipRisk.over30Pct).toBeCloseTo(66.7, 1);
    expect(snapshot.wipRisk.over30DeltaPpVs30dBaseline).toBeCloseTo(33.3, 1);
    expect(snapshot.leadTimeByType.map((item) => item.issueType)).toEqual(["Bug", "Story"]);
    expect(snapshot.leadTimeByType[0].avgDays).toBeCloseTo(9, 1);
    expect(snapshot.leadTimeByType[1].avgDays).toBeCloseTo(21, 1);
    expect(snapshot.wipRiskHeatmap.rows.length).toBeGreaterThan(0);
    expect(snapshot.forecast.backlogCount).toBe(3);
    expect(snapshot.forecast.p50Days).not.toBeNull();
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

describe("buildTeamHealthCheckSummary", () => {
  it("counts tones and prioritizes action metrics first", () => {
    const summary = buildTeamHealthCheckSummary({
      doneBugRatio: { tone: "warn", label: "Watch", reason: "Bug share is moderate." },
      intakeVsThroughput: { tone: "bad", label: "Action", reason: "Intake outpaces delivery." },
      netFlow: { tone: "bad", label: "Action", reason: "Backlog growth is high." },
      throughputStability: { tone: "good", label: "Healthy", reason: "Stable weekly throughput." },
      wipAgeRisk: { tone: "warn", label: "Watch", reason: "Aging WIP is rising." },
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
      wipAgeRisk: { tone: "good", label: "Healthy", reason: "Low aged WIP." },
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
  it("flags sprint predictability when sprint cadence is not enabled", () => {
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
    expect(issues.sprintPredictability?.tone).toBe("warn");
    expect(issues.sprintPredictability?.message).toContain("Sprint based story points");
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

  it("flags sprint predictability when latest sprint has no commitment baseline", () => {
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
    expect(issues.sprintPredictability?.tone).toBe("warn");
    expect(issues.sprintPredictability?.message).toContain("0 commitment baseline");
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
    expect(rowByLabel.get("Open WIP count")).toBe("worsened");
  });
});
