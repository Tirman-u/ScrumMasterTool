import { describe, expect, it } from "vitest";
import {
  buildCycleTimeDistributionSnapshot,
  buildWorkloadDistributionSnapshot,
  inferWorkflowConfig,
} from "../apps/sm-tool/src/App";
import { type ParsedIssue, type TeamConfig, type TeamMetrics } from "../apps/sm-tool/src/types/contracts";

describe("workflow auto-detection", () => {
  it("classifies Iron-style board statuses into flow timing roles", () => {
    const workflow = inferWorkflowConfig(
      [
        { status: "OPEN" },
        { status: "ANALYSIS" },
        { status: "REFINEMENT" },
        { status: "TO DO" },
        { status: "ON HOLD" },
        { status: "DEVELOPMENT" },
        { status: "CODE REVIEW" },
        { status: "READY FOR TESTING" },
        { status: "TESTING" },
        { status: "BUSINESS ACCEPTANCE TEST" },
        { status: "RELEASE TESTING" },
        { status: "DONE" },
      ],
      ["DONE"],
    );

    expect(workflow.backlogStatuses).toEqual(["OPEN"]);
    expect(workflow.funnelStatuses).toEqual(["ANALYSIS", "REFINEMENT", "TO DO"]);
    expect(workflow.activeStatuses).toEqual(["ON HOLD", "READY FOR TESTING", "RELEASE TESTING"]);
    expect(workflow.implementingStatuses).toEqual(["DEVELOPMENT", "CODE REVIEW", "TESTING", "BUSINESS ACCEPTANCE TEST"]);
  });
});

const TEAM_CONFIG: TeamConfig = {
  teamName: "Alpha",
  doneConfig: { useStatusCategoryDone: false, doneStatuses: ["Done"] },
  sleConfig: { percentiles: [50, 70, 85, 95], rounding: "ceil" },
  mapping: {
    key: "Issue key",
    created: "Created",
    resolutionDate: "Resolved",
    updated: "Updated",
    status: "Status",
    resolution: "Resolution",
  },
};

function metricsWithCycleTimes(values: number[]): TeamMetrics {
  return {
    generatedAt: "2026-08-05T00:00:00.000Z",
    teamName: "Alpha",
    totalImportedRows: values.length,
    uniqueIssues: values.length,
    doneIssues: values.length,
    cycleTimeCount: values.length,
    cycleTimeDays: values,
    avgCycleTimeDays: values.reduce((sum, value) => sum + value, 0) / values.length,
    sle: {
      percentiles: [50, 70, 85, 95],
      rounding: "ceil",
      values: { p50: null, p70: null, p85: null, p95: null },
    },
    scatter: [],
    scatterOverlay: { p50: null, p70: null, p85: null, p95: null },
    velocityMonthly: [],
    doneIssueDetails: [],
    flowTiming: {
      leadTime: { count: 0, avgDays: null, p50: null, p70: null, p85: null, p95: null },
      activeTime: { count: 0, avgDays: null, p50: null, p70: null, p85: null, p95: null },
      cycleTime: { count: values.length, avgDays: null, p50: null, p70: null, p85: null, p95: null },
    },
    flowTimingDetails: values.map((value, index) => ({
      issueKey: `ABC-${index + 1}`,
      issueType: index === values.length - 1 ? "Bug" : "Story",
      anchorDate: "2026-01-10T00:00:00.000Z",
      scope: "closed",
      leadTimeDays: value,
      activeTimeDays: value,
      cycleTimeDays: value,
    })),
    multiSprint: { count: 0, percentage: 0 },
    multiSprintIssueKeys: [],
  };
}

describe("cycle time and workload distribution", () => {
  it("builds Cycle Time distribution bands without replacing SLE", () => {
    const snapshot = buildCycleTimeDistributionSnapshot(
      metricsWithCycleTimes([2, 5, 10, 20]),
      "2026-01",
      TEAM_CONFIG,
      [],
      new Date("2026-01-31T00:00:00.000Z"),
    );

    expect(snapshot.bins.map((bin) => bin.count)).toEqual([1, 1, 1, 1]);
    expect(snapshot.over14Pct).toBe(25);
    expect(snapshot.p85).toBe(16);
    expect(snapshot.topTypes[0]).toMatchObject({ issueType: "Bug", over14Count: 1 });
  });

  it("builds workload distribution from assignee data when available", () => {
    const issues: ParsedIssue[] = [
      {
        issueKey: "ABC-1",
        created: new Date("2026-01-01T00:00:00.000Z"),
        resolutionDate: new Date("2026-01-10T00:00:00.000Z"),
        updated: new Date("2026-01-10T00:00:00.000Z"),
        status: "Done",
        resolution: "Done",
        assignee: "Mari",
        issueType: "Story",
        storyPoints: null,
        sprintRaw: "",
        sourceFile: "jira.csv",
        sourceRow: 1,
      },
      {
        issueKey: "ABC-2",
        created: new Date("2026-01-02T00:00:00.000Z"),
        resolutionDate: null,
        updated: new Date("2026-01-11T00:00:00.000Z"),
        status: "In Progress",
        resolution: "",
        assignee: "Mari",
        issueType: "Story",
        storyPoints: null,
        sprintRaw: "",
        sourceFile: "jira.csv",
        sourceRow: 2,
      },
      {
        issueKey: "ABC-3",
        created: new Date("2026-01-03T00:00:00.000Z"),
        resolutionDate: null,
        updated: new Date("2026-01-12T00:00:00.000Z"),
        status: "To Do",
        resolution: "",
        assignee: "Jaan",
        issueType: "Bug",
        storyPoints: null,
        sprintRaw: "",
        sourceFile: "jira.csv",
        sourceRow: 3,
      },
    ];

    const snapshot = buildWorkloadDistributionSnapshot(
      issues,
      metricsWithCycleTimes([4]),
      TEAM_CONFIG,
      "2026-01",
      new Date("2026-01-31T00:00:00.000Z"),
    );

    expect(snapshot.assignedTotal).toBe(3);
    expect(snapshot.topAssignee).toBe("Mari");
    expect(snapshot.rows[0]).toMatchObject({ assignee: "Mari", total: 2, done: 1, open: 1 });
  });
});
