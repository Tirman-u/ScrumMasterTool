import { describe, expect, it } from "vitest";
import { buildJiraIssueCsv, buildTimeInStatusCsv, type JiraIssue } from "../src/jira-pull.js";
import { parseCsv } from "../src/io/csv.js";

describe("jira pull csv builders", () => {
  it("exports issue rows with story points and sprint custom fields", () => {
    const issues: JiraIssue[] = [
      {
        key: "ABC-1",
        fields: {
          summary: 'Checkout "happy path"',
          created: "2026-01-01T08:00:00.000+0200",
          updated: "2026-01-05T08:00:00.000+0200",
          resolutiondate: "2026-01-04T08:00:00.000+0200",
          status: { name: "Done" },
          resolution: { name: "Done" },
          issuetype: { name: "Story" },
          customfield_10002: 8,
          customfield_10020: [{ name: "Sprint 12" }, { name: "Sprint 13" }],
        },
      },
    ];

    const csv = buildJiraIssueCsv(issues, {
      storyPointsField: "customfield_10002",
      sprintField: "customfield_10020",
    });
    const parsed = parseCsv(csv);

    expect(parsed.rows[0]).toMatchObject({
      "Issue key": "ABC-1",
      Summary: 'Checkout "happy path"',
      "Issue Type": "Story",
      "Story points": "8",
      Sprint: "Sprint 12, Sprint 13",
    });
  });

  it("builds time in status rows from Jira status changelog", () => {
    const issues: JiraIssue[] = [
      {
        key: "ABC-2",
        fields: {
          summary: "Payment validation",
          created: "2026-01-01T00:00:00.000Z",
          updated: "2026-01-05T00:00:00.000Z",
          resolutiondate: "2026-01-05T00:00:00.000Z",
          status: { name: "Done" },
          issuetype: { name: "Story" },
        },
        changelog: {
          total: 2,
          maxResults: 100,
          histories: [
            {
              created: "2026-01-02T00:00:00.000Z",
              items: [{ field: "status", fromString: "To Do", toString: "In Progress" }],
            },
            {
              created: "2026-01-04T00:00:00.000Z",
              items: [{ fieldId: "status", fromString: "In Progress", toString: "Done" }],
            },
          ],
        },
      },
    ];

    const result = buildTimeInStatusCsv(issues, new Date("2026-01-10T00:00:00.000Z"));
    const parsed = parseCsv(result.csvText);

    expect(result.statusCount).toBe(3);
    expect(result.missingChangelogIssueKeys).toEqual([]);
    expect(parsed.headers).toEqual([
      "Type",
      "Key",
      "Summary",
      "Created",
      "Updated",
      "Resolution Date",
      "To Do",
      "In Progress",
      "Done",
    ]);
    expect(parsed.rows[0]).toMatchObject({
      Type: "Story",
      Key: "ABC-2",
      "To Do": "1d",
      "In Progress": "2d",
      Done: "1d",
    });
  });

  it("marks issues where Jira did not return status changelog", () => {
    const result = buildTimeInStatusCsv(
      [
        {
          key: "ABC-3",
          fields: {
            created: "2026-01-01T00:00:00.000Z",
            updated: "2026-01-02T00:00:00.000Z",
            status: { name: "Open" },
            issuetype: { name: "Task" },
          },
        },
      ],
      new Date("2026-01-03T00:00:00.000Z"),
    );
    const parsed = parseCsv(result.csvText);

    expect(result.missingChangelogIssueKeys).toEqual(["ABC-3"]);
    expect(parsed.rows[0]).toMatchObject({
      Type: "Task",
      Key: "ABC-3",
      Open: "2d",
    });
  });
});
