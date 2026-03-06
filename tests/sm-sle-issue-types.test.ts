import { describe, expect, it } from "vitest";
import {
  buildMetrics,
  isIssueTypeIncludedInSle,
  normalizeSleIssueTypes,
} from "../apps/sm-tool/src/lib/metrics";
import { type ParsedIssue, type TeamConfig } from "../apps/sm-tool/src/types/contracts";

const TEAM_CONFIG: TeamConfig = {
  teamName: "Web",
  doneConfig: {
    useStatusCategoryDone: false,
    doneStatuses: ["Done"],
  },
  sleConfig: {
    percentiles: [50, 70, 85, 95],
    rounding: "ceil",
    issueTypes: ["Task", "Bug", "Story"],
  },
  mapping: {
    key: "Issue key",
    created: "Created",
    resolutionDate: "Resolved",
    updated: "Updated",
    status: "Status",
    resolution: "Resolution",
    issueType: "Issue Type",
  },
};

function issue(overrides: Partial<ParsedIssue>): ParsedIssue {
  return {
    issueKey: "WEB-1",
    created: new Date("2026-01-01T00:00:00.000Z"),
    resolutionDate: new Date("2026-01-05T00:00:00.000Z"),
    updated: new Date("2026-01-05T00:00:00.000Z"),
    status: "Done",
    resolution: "Done",
    issueType: "Story",
    storyPoints: null,
    sprintRaw: "",
    sourceFile: "jira.csv",
    sourceRow: 2,
    ...overrides,
  };
}

describe("SLE issue type filtering", () => {
  it("uses Task/Bug/Story defaults when config is empty", () => {
    expect(normalizeSleIssueTypes(undefined)).toEqual(["Task", "Bug", "Story"]);
  });

  it("dedupes issue type list case-insensitively", () => {
    expect(normalizeSleIssueTypes(["Story", "story", " Bug ", "Task"])).toEqual(["Story", "Bug", "Task"]);
  });

  it("excludes non-selected issue types from SLE while keeping cycle-time metrics intact", () => {
    const metrics = buildMetrics(TEAM_CONFIG, 2, [
      issue({
        issueKey: "WEB-1",
        issueType: "Story",
        created: new Date("2026-01-01T00:00:00.000Z"),
        resolutionDate: new Date("2026-01-11T00:00:00.000Z"),
      }),
      issue({
        issueKey: "WEB-2",
        issueType: "Epic",
        created: new Date("2026-01-01T00:00:00.000Z"),
        resolutionDate: new Date("2026-02-10T00:00:00.000Z"),
      }),
    ]);

    // Avg cycle time still includes all done issues.
    expect(metrics.avgCycleTimeDays).toBe(25);
    expect(metrics.cycleTimeCount).toBe(2);

    // SLE includes Story only here (Epic excluded by config).
    expect(metrics.sle.values.p50).toBe(10);
    expect(metrics.sle.values.p95).toBe(10);
  });

  it("matches issue types case-insensitively", () => {
    expect(isIssueTypeIncludedInSle("story", ["Story"])).toBe(true);
    expect(isIssueTypeIncludedInSle("EPIC", ["Story", "Task"])).toBe(false);
  });
});

