import { describe, expect, it } from "vitest";
import {
  buildMetrics,
  countSprints,
  dedupeIssuesByLatestUpdate,
  dedupeTimeInStatusRowsByLatest,
  percentileInc,
} from "../src/domain/metrics.js";
import { type ParsedIssue, type TeamConfig } from "../src/types/contracts.js";
import { workingDaysBetween } from "../apps/sm-tool/src/lib/working-days.js";

const TEAM_CONFIG: TeamConfig = {
  teamName: "Team 1",
  doneConfig: {
    useStatusCategoryDone: false,
    doneStatuses: ["Done"],
  },
  sleConfig: {
    percentiles: [50, 70, 85, 95],
    rounding: "ceil",
  },
  mapping: {
    key: "Key",
    created: "Created",
    resolutionDate: "Resolved",
    updated: "Updated",
    status: "Status",
    resolution: "Resolution",
    storyPoints: "Story Points",
    sprint: "Sprint",
  },
};

function issue(overrides: Partial<ParsedIssue>): ParsedIssue {
  return {
    issueKey: "ABC-1",
    created: new Date("2026-01-01T00:00:00.000Z"),
    resolutionDate: new Date("2026-01-04T00:00:00.000Z"),
    updated: new Date("2026-01-05T00:00:00.000Z"),
    status: "Done",
    resolution: "Done",
    issueType: "Story",
    storyPoints: 5,
    sprintRaw: "Sprint 1,Sprint 2",
    sourceFile: "jira.csv",
    sourceRow: 2,
    ...overrides,
  };
}

describe("dedupeIssuesByLatestUpdate", () => {
  it("keeps the latest updated row for same key", () => {
    const older = issue({ updated: new Date("2026-01-02T00:00:00.000Z"), storyPoints: 3 });
    const newer = issue({ updated: new Date("2026-01-03T00:00:00.000Z"), storyPoints: 8 });

    const deduped = dedupeIssuesByLatestUpdate([older, newer]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].storyPoints).toBe(8);
  });

  it("dedupes issue keys case-insensitively", () => {
    const upper = issue({ issueKey: "ABC-1", updated: new Date("2026-01-02T00:00:00.000Z"), storyPoints: 3 });
    const lower = issue({ issueKey: "abc-1", updated: new Date("2026-01-03T00:00:00.000Z"), storyPoints: 8 });

    const deduped = dedupeIssuesByLatestUpdate([upper, lower]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].issueKey).toBe("abc-1");
    expect(deduped[0].storyPoints).toBe(8);
  });

  it("dedupes moved Jira issues by previous issue key alias", () => {
    const oldProjectIssue = issue({
      issueKey: "OLD-1",
      updated: new Date("2026-01-10T00:00:00.000Z"),
      storyPoints: 3,
    });
    const newProjectIssue = issue({
      issueKey: "NEW-1",
      previousIssueKeys: ["OLD-1"],
      updated: new Date("2026-02-10T00:00:00.000Z"),
      storyPoints: 8,
    });

    const deduped = dedupeIssuesByLatestUpdate([oldProjectIssue, newProjectIssue]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].issueKey).toBe("NEW-1");
    expect(deduped[0].storyPoints).toBe(8);
  });
});

describe("percentileInc", () => {
  it("calculates interpolated inclusive percentile", () => {
    const values = [1, 2, 3, 4, 5];
    expect(percentileInc(values, 0.7)).toBe(3.8);
  });
});

describe("dedupeTimeInStatusRowsByLatest", () => {
  it("treats old and new Jira keys as one issue and keeps the latest imported row", () => {
    const movedIssue = issue({ issueKey: "NEW-1", previousIssueKeys: ["OLD-1"] });

    const rows = dedupeTimeInStatusRowsByLatest(
      [
        { issueKey: "OLD-1", durations: [{ status: "In Progress", days: 12 }] },
        { issueKey: "NEW-1", durations: [{ status: "In Progress", days: 3 }] },
      ],
      [movedIssue],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      issueKey: "new-1",
      durations: [{ status: "In Progress", days: 3 }],
    });
  });
});

describe("buildMetrics", () => {
  it("calculates velocity with story points fallback to count", () => {
    const doneWithSp = issue({ issueKey: "ABC-1", storyPoints: 8, resolutionDate: new Date("2026-01-10T00:00:00.000Z") });
    const doneWithoutSp = issue({
      issueKey: "ABC-2",
      storyPoints: null,
      resolutionDate: new Date("2026-01-15T00:00:00.000Z"),
    });

    const metrics = buildMetrics(TEAM_CONFIG, 2, [doneWithSp, doneWithoutSp]);

    expect(metrics.velocityMonthly).toEqual([{ month: "2026-01", value: 9 }]);
    expect(metrics.avgCycleTimeDays).toBeCloseTo(metrics.flowTiming.cycleTime.avgDays ?? 0, 8);
    expect(metrics.doneIssueDetails).toHaveLength(2);
    expect(metrics.multiSprint).toEqual({
      count: 2,
      percentage: 100,
    });
    expect(metrics.sle.values.p85).toBe(metrics.flowTiming.cycleTime.p85);
    expect(metrics.flowTimingBasis).toBe("working-days");
  });

  it("uses bug default story points when bug items are unestimated", () => {
    const configWithBugDefault: TeamConfig = {
      ...TEAM_CONFIG,
      bugConfig: {
        issueTypes: ["Bug"],
        defaultStoryPoints: 2,
      },
    };

    const doneBugWithoutEstimate = issue({
      issueKey: "ABC-3",
      issueType: "Bug",
      storyPoints: null,
      resolutionDate: new Date("2026-01-12T00:00:00.000Z"),
    });
    const doneTaskWithoutEstimate = issue({
      issueKey: "ABC-4",
      issueType: "Task",
      storyPoints: null,
      resolutionDate: new Date("2026-01-13T00:00:00.000Z"),
    });

    const metrics = buildMetrics(configWithBugDefault, 2, [doneBugWithoutEstimate, doneTaskWithoutEstimate]);

    expect(metrics.velocityMonthly).toEqual([{ month: "2026-01", value: 3 }]);
    expect(metrics.doneIssueDetails.find((item) => item.issueKey === "ABC-3")?.storyPoints).toBe(2);
    expect(metrics.doneIssueDetails.find((item) => item.issueKey === "ABC-4")?.storyPoints).toBeNull();
  });

  it("filters out excluded issue keys from all metrics", () => {
    const configWithExclusions: TeamConfig = {
      ...TEAM_CONFIG,
      excludedIssueKeys: ["ABC-2"],
    };

    const keptIssue = issue({ issueKey: "ABC-1", storyPoints: 3, resolutionDate: new Date("2026-01-10T00:00:00.000Z") });
    const excludedIssue = issue({ issueKey: "ABC-2", storyPoints: 8, resolutionDate: new Date("2026-01-15T00:00:00.000Z") });

    const metrics = buildMetrics(configWithExclusions, 2, [keptIssue, excludedIssue]);

    expect(metrics.uniqueIssues).toBe(1);
    expect(metrics.doneIssues).toBe(1);
    expect(metrics.scatter.map((item) => item.issueKey)).toEqual(["ABC-1"]);
    expect(metrics.velocityMonthly).toEqual([{ month: "2026-01", value: 3 }]);
  });

  it("applies a recorded exclusion through a moved issue's previous Jira key", () => {
    const configWithExclusion: TeamConfig = {
      ...TEAM_CONFIG,
      issueExclusions: [
        {
          issueKey: "OLD-2",
          reason: "Migration date is known to be corrupt",
          category: "data-quality",
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
    };
    const movedIssue = issue({
      issueKey: "NEW-2",
      previousIssueKeys: ["OLD-2"],
      resolutionDate: new Date("2026-03-10T00:00:00.000Z"),
    });
    const keptIssue = issue({ issueKey: "NEW-3" });

    const metrics = buildMetrics(configWithExclusion, 2, [movedIssue, keptIssue]);

    expect(metrics.uniqueIssues).toBe(1);
    expect(metrics.scatter.map((item) => item.issueKey)).toEqual(["NEW-3"]);
  });

  it("uses active Time in Status durations for cycle time when workflow statuses are configured", () => {
    const config: TeamConfig = {
      ...TEAM_CONFIG,
      workflowConfig: {
        backlogStatuses: ["Backlog", "Ready"],
        activeStatuses: ["In Progress", "Review"],
      },
      sprintScopeConfig: {
        statuses: ["In Progress", "Review"],
      },
      cycleTimeConfig: {
        endDateSource: "resolvedOrUpdated",
        durationSource: "timeInStatus",
      },
    };
    const doneIssue = issue({
      issueKey: "ABC-9",
      created: new Date("2026-01-01T00:00:00.000Z"),
      resolutionDate: new Date("2026-01-20T00:00:00.000Z"),
    });

    const metrics = buildMetrics(config, 1, [doneIssue], {
      timeInStatusIssueRows: [
        {
          issueKey: "ABC-9",
          durationBasis: "working-days",
          durations: [
            { status: "Backlog", days: 10 },
            { status: "Ready", days: 2 },
            { status: "In Progress", days: 4 },
            { status: "Review", days: 1 },
            { status: "Done", days: 3 },
          ],
        },
      ],
    });

    expect(metrics.avgCycleTimeDays).toBe(5);
    expect(metrics.scatter[0].cycleTimeDays).toBe(5);
  });

  it("uses project entry date as cycle-time start for moved Jira issues", () => {
    const movedIssue = issue({
      issueKey: "NEW-2",
      previousIssueKeys: ["OLD-2"],
      created: new Date("2026-01-01T00:00:00.000Z"),
      projectEnteredAt: new Date("2026-03-01T00:00:00.000Z"),
      resolutionDate: new Date("2026-03-10T00:00:00.000Z"),
    });

    const metrics = buildMetrics(TEAM_CONFIG, 1, [movedIssue]);

    const expectedWorkingDays = workingDaysBetween(
      movedIssue.projectEnteredAt as Date,
      movedIssue.resolutionDate as Date,
    );
    expect(metrics.avgCycleTimeDays).toBeCloseTo(expectedWorkingDays, 8);
    expect(metrics.scatter[0].cycleTimeDays).toBeCloseTo(expectedWorkingDays, 8);
  });

  it("can calculate flow timing from closed tickets, open tickets, or both", () => {
    const config: TeamConfig = {
      ...TEAM_CONFIG,
      workflowConfig: {
        funnelStatuses: ["Funnel"],
        activeStatuses: ["Analysing"],
        implementingStatuses: ["Implementing"],
      },
    };
    const closedIssue = issue({ issueKey: "ABC-11", status: "Done", resolutionDate: new Date("2026-01-10T00:00:00.000Z") });
    const openIssue = issue({ issueKey: "ABC-12", status: "Implementing", resolution: "", resolutionDate: null });
    const timeInStatusIssueRows = [
      {
        issueKey: "ABC-11",
        durationBasis: "working-days" as const,
        durations: [
          { status: "Funnel", days: 10 },
          { status: "Analysing", days: 5 },
          { status: "Implementing", days: 2 },
        ],
      },
      {
        issueKey: "ABC-12",
        durationBasis: "working-days" as const,
        durations: [
          { status: "Funnel", days: 20 },
          { status: "Analysing", days: 6 },
          { status: "Implementing", days: 4 },
        ],
      },
    ];

    const closedOnly = buildMetrics(config, 2, [closedIssue, openIssue], { timeInStatusIssueRows });
    const openOnly = buildMetrics(
      { ...config, flowTimingConfig: { includeClosedTickets: false, includeOpenTickets: true } },
      2,
      [closedIssue, openIssue],
      { timeInStatusIssueRows },
    );
    const closedAndOpen = buildMetrics(
      { ...config, flowTimingConfig: { includeClosedTickets: true, includeOpenTickets: true } },
      2,
      [closedIssue, openIssue],
      { timeInStatusIssueRows },
    );

    expect(closedOnly.flowTiming.cycleTime.count).toBe(1);
    expect(closedOnly.flowTiming.cycleTime.avgDays).toBe(2);
    expect(openOnly.flowTiming.cycleTime.count).toBe(1);
    expect(openOnly.flowTiming.cycleTime.avgDays).toBe(4);
    expect(closedAndOpen.flowTiming.cycleTime.count).toBe(2);
    expect(closedAndOpen.flowTiming.cycleTime.avgDays).toBe(3);
    expect(closedAndOpen.flowTiming.leadTime.avgDays).toBe(23.5);
  });

  it("falls back to elapsed working-day cycle time when Time in Status duration is implausible", () => {
    const doneIssue = issue({
      issueKey: "ABC-10",
      created: new Date("2026-01-01T00:00:00.000Z"),
      resolutionDate: new Date("2026-01-11T00:00:00.000Z"),
    });

    const metrics = buildMetrics(TEAM_CONFIG, 1, [doneIssue], {
      timeInStatusIssueRows: [
        {
          issueKey: "ABC-10",
          durations: [{ status: "In Progress", days: 1000000 }],
        },
      ],
    });

    const expectedWorkingDays = workingDaysBetween(doneIssue.created as Date, doneIssue.resolutionDate as Date);
    expect(metrics.avgCycleTimeDays).toBeCloseTo(expectedWorkingDays, 8);
    expect(metrics.scatter[0].cycleTimeDays).toBeCloseTo(expectedWorkingDays, 8);
  });

  it("builds SLE from the same working-day Cycle Time values instead of Created-to-Done age", () => {
    const oldStory = issue({
      issueKey: "ABC-20",
      created: new Date("2025-01-01T00:00:00.000Z"),
      resolutionDate: new Date("2026-01-09T00:00:00.000Z"),
      issueType: "Story",
    });
    const oldBug = issue({
      issueKey: "ABC-21",
      created: new Date("2025-06-01T00:00:00.000Z"),
      resolutionDate: new Date("2026-01-09T00:00:00.000Z"),
      issueType: "Bug",
    });

    const metrics = buildMetrics(TEAM_CONFIG, 2, [oldStory, oldBug], {
      timeInStatusIssueRows: [
        {
          issueKey: "ABC-20",
          durationBasis: "working-days",
          durations: [{ status: "In Progress", days: 2 }],
        },
        {
          issueKey: "ABC-21",
          durationBasis: "working-days",
          durations: [{ status: "In Progress", days: 10 }],
        },
      ],
    });

    expect(metrics.cycleTimeDays).toEqual([2, 10]);
    expect(metrics.sle.values.p85).toBe(9);
    expect(metrics.sle.values.p85).toBe(metrics.flowTiming.cycleTime.p85);
  });

  it("finds issues that were in 2+ sprints", () => {
    const oneSprint = issue({ issueKey: "ABC-1", sprintRaw: "Sprint A" });
    const twoSprintPlain = issue({ issueKey: "ABC-2", sprintRaw: "Sprint A,Sprint B" });
    const twoSprintGreenhopper = issue({
      issueKey: "ABC-3",
      sprintRaw:
        "com.atlassian.greenhopper.service.sprint.Sprint@123[id=12],com.atlassian.greenhopper.service.sprint.Sprint@456[id=22]",
    });

    const metrics = buildMetrics(TEAM_CONFIG, 3, [oneSprint, twoSprintPlain, twoSprintGreenhopper]);

    expect(metrics.multiSprintIssueKeys).toEqual(["ABC-2", "ABC-3"]);
  });
});

describe("countSprints", () => {
  it("parses greenhopper sprint strings", () => {
    const input =
      "com.atlassian.greenhopper.service.sprint.Sprint@123[id=12],com.atlassian.greenhopper.service.sprint.Sprint@456[id=12],com.atlassian.greenhopper.service.sprint.Sprint@999[id=22]";
    expect(countSprints(input)).toBe(2);
  });
});
