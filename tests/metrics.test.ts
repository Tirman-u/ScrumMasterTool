import { describe, expect, it } from "vitest";
import { buildMetrics, countSprints, dedupeIssuesByLatestUpdate, percentileInc } from "../src/domain/metrics.js";
import { type ParsedIssue, type TeamConfig } from "../src/types/contracts.js";

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
});

describe("percentileInc", () => {
  it("calculates interpolated inclusive percentile", () => {
    const values = [1, 2, 3, 4, 5];
    expect(percentileInc(values, 0.7)).toBe(3.8);
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
    expect(metrics.avgCycleTimeDays).toBe(11.5);
    expect(metrics.doneIssueDetails).toHaveLength(2);
    expect(metrics.multiSprint).toEqual({
      count: 2,
      percentage: 100,
    });
    expect(metrics.sle.values.p70).toBe(13);
    expect(metrics.sle.values.p85).toBe(14);
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
