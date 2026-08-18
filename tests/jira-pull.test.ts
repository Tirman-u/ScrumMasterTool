import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildJiraIssueCsv,
  buildTimeInStatusCsv,
  JiraClient,
  resolveSavedJql,
  type JiraIssue,
} from "../src/jira-pull.js";
import { parseCsv } from "../src/io/csv.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("jira pull csv builders", () => {
  it("prefers a real saved Jira query over the placeholder default", () => {
    const jql = resolveSavedJql(
      {
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
        jiraQuery: {
          defaultQueryId: "default",
          queries: [
            { id: "default", name: "Placeholder", jql: "project = YOURPROJECT ORDER BY updated DESC" },
            { id: "real", name: "Real", jql: "project = ABC ORDER BY updated DESC" },
          ],
        },
      },
      "issueQuery",
    );

    expect(jql).toBe("project = ABC ORDER BY updated DESC");
  });

  it("uses the root saved Jira query for Time in Status when no separate query exists", () => {
    const jql = resolveSavedJql(
      {
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
        jiraQuery: {
          defaultQueryId: "default",
          queries: [{ id: "default", name: "Team Import Query", jql: "project = ABC ORDER BY Rank ASC" }],
        },
      },
      "timeInStatusQuery",
    );

    expect(jql).toBe("project = ABC ORDER BY Rank ASC");
  });

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
          assignee: { displayName: "Mari Maasikas", name: "mmaasikas", emailAddress: "mari@example.test" },
          customfield_10002: 8,
          customfield_10020: [{ name: "Sprint 12" }, { name: "Sprint 13" }],
        },
        changelog: {
          total: 1,
          histories: [
            {
              id: "10",
              created: "2026-01-03T10:00:00.000Z",
              items: [{ fieldId: "key", fromString: "OLD-1", toString: "ABC-1" }],
            },
          ],
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
      "Previous issue keys": "OLD-1",
      "Project entered": "2026-01-03T10:00:00.000Z",
      Summary: 'Checkout "happy path"',
      "Issue Type": "Story",
      Assignee: "Mari Maasikas",
      "Story points": "8",
      Sprint: "Sprint 12, Sprint 13",
    });
  });

  it("loads every changelog page when Jira search returns a truncated expansion", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/rest/api/2/search")) {
        return Response.json({
          total: 1,
          issues: [
            {
              id: "10001",
              key: "NEW-1",
              fields: { summary: "Moved work" },
              changelog: {
                total: 2,
                histories: [
                  {
                    id: "1",
                    created: "2026-01-01T00:00:00.000Z",
                    items: [{ field: "status", fromString: "To Do", toString: "In Progress" }],
                  },
                ],
              },
            },
          ],
        });
      }

      if (url.includes("/rest/api/2/issue/10001/changelog?")) {
        return Response.json({
          startAt: 0,
          maxResults: 100,
          total: 2,
          values: [
            {
              id: "1",
              created: "2026-01-01T00:00:00.000Z",
              items: [{ field: "status", fromString: "To Do", toString: "In Progress" }],
            },
            {
              id: "2",
              created: "2026-01-02T00:00:00.000Z",
              items: [{ fieldId: "key", fromString: "OLD-1", toString: "NEW-1" }],
            },
          ],
        });
      }

      throw new Error(`Unexpected Jira request: ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new JiraClient({
      baseUrl: "https://example.atlassian.net",
      username: "user@example.com",
      token: "secret",
      authMode: "basic",
    });
    const result = await client.searchAll({
      jql: "project = NEW",
      fields: ["summary"],
      maxIssues: 10,
      expandChangelog: true,
    });

    expect(result.issues[0].changelog?.histories?.map((history) => history.id)).toEqual(["1", "2"]);
    expect(result.issues[0].changelog?.total).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("startAt=0");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      expand: ["changelog"],
    });
  });

  it("builds time in status rows from Jira status changelog", () => {
    const issues: JiraIssue[] = [
      {
        key: "ABC-2",
        fields: {
          summary: "Payment validation",
          created: "2026-01-05T00:00:00.000Z",
          updated: "2026-01-09T00:00:00.000Z",
          resolutiondate: "2026-01-09T00:00:00.000Z",
          status: { name: "Done" },
          issuetype: { name: "Story" },
        },
        changelog: {
          total: 2,
          maxResults: 100,
          histories: [
            {
              created: "2026-01-06T00:00:00.000Z",
              items: [{ field: "status", fromString: "To Do", toString: "In Progress" }],
            },
            {
              created: "2026-01-08T00:00:00.000Z",
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
      "Duration basis",
      "To Do",
      "In Progress",
      "Done",
    ]);
    expect(parsed.rows[0]).toMatchObject({
      Type: "Story",
      Key: "ABC-2",
      "Duration basis": "working-days",
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
            created: "2026-01-05T00:00:00.000Z",
            updated: "2026-01-06T00:00:00.000Z",
            status: { name: "Open" },
            issuetype: { name: "Task" },
          },
        },
      ],
      new Date("2026-01-07T00:00:00.000Z"),
    );
    const parsed = parseCsv(result.csvText);

    expect(result.missingChangelogIssueKeys).toEqual(["ABC-3"]);
    expect(parsed.rows[0]).toMatchObject({
      Type: "Task",
      Key: "ABC-3",
      "Duration basis": "working-days",
      Open: "2d",
    });
  });
});
