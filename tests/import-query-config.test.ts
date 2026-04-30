import { describe, expect, it } from "vitest";
import { composeQueryWithTimeWindow, normalizeJiraQueryConfig } from "../apps/sm-tool/src/App";

describe("composeQueryWithTimeWindow", () => {
  it("builds a combined activity window for issues queries", () => {
    const jql = composeQueryWithTimeWindow(
      'project = ABC AND issuetype in (Bug, Story) ORDER BY updated DESC',
      "ytd",
    );

    expect(jql).toContain("created >= startOfYear()");
    expect(jql).toContain("updated >= startOfYear()");
    expect(jql).toContain("resolved >= startOfYear()");
    expect(jql).toContain("ORDER BY updated DESC");
  });

  it("keeps last-month windows across created, updated, and resolved", () => {
    const jql = composeQueryWithTimeWindow("project = ABC", "last-month");

    expect(jql).toContain("created >= startOfMonth(-1)");
    expect(jql).toContain("updated >= startOfMonth(-1)");
    expect(jql).toContain("resolved >= startOfMonth(-1)");
    expect(jql).toContain("created < startOfMonth()");
    expect(jql).toContain("updated < startOfMonth()");
    expect(jql).toContain("resolved < startOfMonth()");
  });
});

describe("normalizeJiraQueryConfig", () => {
  it("keeps legacy top-level queries working as issue-query config", () => {
    const normalized = normalizeJiraQueryConfig({
      defaultQueryId: "legacy",
      queries: [
        {
          id: "legacy",
          name: "Legacy Query",
          jql: "project = LEGACY ORDER BY updated DESC",
        },
      ],
    });

    expect(normalized.issueQuery?.defaultQueryId).toBe("legacy");
    expect(normalized.issueQuery?.queries[0]?.name).toBe("Legacy Query");
    expect(normalized.timeInStatusQuery?.queries[0]?.jql).toBe("project = LEGACY ORDER BY updated DESC");
    expect(normalized.defaultQueryId).toBe("legacy");
    expect(normalized.queries[0]?.name).toBe("Legacy Query");
  });

  it("preserves dedicated time-in-status queries when present", () => {
    const normalized = normalizeJiraQueryConfig({
      defaultQueryId: "issues",
      queries: [
        {
          id: "issues",
          name: "Issues",
          jql: "project = ABC ORDER BY updated DESC",
        },
      ],
      issueQuery: {
        defaultQueryId: "issues",
        queries: [
          {
            id: "issues",
            name: "Issues",
            jql: "project = ABC ORDER BY updated DESC",
          },
        ],
      },
      timeInStatusQuery: {
        defaultQueryId: "tis",
        queries: [
          {
            id: "tis",
            name: "Time in Status",
            jql: "project = ABC AND status changed >= startOfYear() ORDER BY updated DESC",
          },
        ],
      },
    });

    expect(normalized.issueQuery?.queries[0]?.name).toBe("Issues");
    expect(normalized.timeInStatusQuery?.defaultQueryId).toBe("tis");
    expect(normalized.timeInStatusQuery?.queries[0]?.name).toBe("Time in Status");
  });
});
