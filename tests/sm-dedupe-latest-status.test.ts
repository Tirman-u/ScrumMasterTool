import { describe, expect, it } from "vitest";
import { dedupeIssuesByLatestUpdate } from "../apps/sm-tool/src/lib/metrics";
import { type ParsedIssue } from "../apps/sm-tool/src/types/contracts";

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
    sourceFile: "import-1.csv",
    sourceRow: 2,
    ...overrides,
  };
}

describe("dedupeIssuesByLatestUpdate", () => {
  it("keeps freshest status when a newer Updated value exists", () => {
    const olderOpen = issue({
      issueKey: "BW-100",
      updated: new Date("2026-02-01T08:00:00.000Z"),
      status: "In Progress",
    });
    const newerClosed = issue({
      issueKey: "BW-100",
      updated: new Date("2026-02-05T08:00:00.000Z"),
      status: "Done",
      resolution: "Done",
      resolutionDate: new Date("2026-02-05T08:00:00.000Z"),
    });

    const deduped = dedupeIssuesByLatestUpdate([olderOpen, newerClosed]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].status).toBe("Done");
  });

  it("uses later row when Updated timestamp is equal", () => {
    const firstRow = issue({
      issueKey: "BW-200",
      updated: new Date("2026-02-10T08:00:00.000Z"),
      status: "To Do",
      sourceFile: "older-export.csv",
    });
    const secondRow = issue({
      issueKey: "BW-200",
      updated: new Date("2026-02-10T08:00:00.000Z"),
      status: "Done",
      resolution: "Done",
      sourceFile: "newer-export.csv",
      resolutionDate: new Date("2026-02-10T08:00:00.000Z"),
    });

    const deduped = dedupeIssuesByLatestUpdate([firstRow, secondRow]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].status).toBe("Done");
  });
});
