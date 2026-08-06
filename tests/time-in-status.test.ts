import { describe, expect, it } from "vitest";
import {
  buildAutoBottleneckEntriesFromIssueRows,
  buildAutoBottleneckEntriesFromTimeInStatus,
  isTimeInStatusCsv,
  parseTimeInStatusDurationDays,
  parseTimeInStatusIssueRows,
} from "../apps/sm-tool/src/lib/time-in-status";

describe("time-in-status parser", () => {
  it("parses status duration strings into days", () => {
    expect(parseTimeInStatusDurationDays("2d 12h 30m")).toBeCloseTo(2.5208, 3);
    expect(parseTimeInStatusDurationDays("1w 2d")).toBe(9);
    expect(parseTimeInStatusDurationDays("-")).toBeNull();
  });

  it("preserves the working-day basis emitted by the Jira pull", () => {
    const headers = ["Issue key", "Resolution Date", "Duration basis", "In Progress"];
    const rows = [
      {
        "Issue key": "BW-11",
        "Resolution Date": "10.02.2026 10:00",
        "Duration basis": "working-days",
        "In Progress": "3d 4h",
      },
    ];

    const issueRows = parseTimeInStatusIssueRows({
      headers,
      rows,
      fallbackPeriod: "2026-02",
      includeAllStatuses: true,
    });

    expect(issueRows[0].durationBasis).toBe("working-days");
    expect(issueRows[0].durations[0].days).toBeCloseTo(3.1667, 3);
  });

  it("builds one bottleneck entry from summary row and respects flow status filter", () => {
    const headers = ["Type", "Summary", "Resolution Date", "In Progress", "Code Review", "Done"];
    const rows = [
      {
        Type: "Average time taken (from table)",
        Summary: "",
        "Resolution Date": "",
        "In Progress": "12d 0h 0m",
        "Code Review": "2d 12h 0m",
        Done: "0d 0h 0m",
      },
    ];

    expect(isTimeInStatusCsv(headers, rows)).toBe(true);

    const entries = buildAutoBottleneckEntriesFromTimeInStatus({
      headers,
      rows,
      fallbackPeriod: "2026-02",
      flowStatuses: ["In Progress", "Code Review", "Test"],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].period).toBe("2026-02");
    expect(entries[0].columns).toEqual([
      { name: "In Progress", avgDays: 12 },
      { name: "Code Review", avgDays: 2.5 },
    ]);
  });

  it("dedupes issue rows by latest Updated and excludes terminal status columns by default", () => {
    const headers = ["Issue key", "Resolution Date", "Updated", "Backlog", "In Progress", "Code Review", "Done", "Abandoned"];
    const rows = [
      {
        "Issue key": "BW-1",
        "Resolution Date": "10.02.2026 10:00",
        Updated: "10.02.2026 10:00",
        Backlog: "20d 0h 0m",
        "In Progress": "5d 0h 0m",
        "Code Review": "1d 0h 0m",
        Done: "0d 0h 0m",
        Abandoned: "40d 0h 0m",
      },
      {
        "Issue key": "BW-1",
        "Resolution Date": "11.02.2026 10:00",
        Updated: "11.02.2026 10:00",
        Backlog: "25d 0h 0m",
        "In Progress": "10d 0h 0m",
        "Code Review": "2d 0h 0m",
        Done: "0d 0h 0m",
        Abandoned: "45d 0h 0m",
      },
      {
        "Issue key": "BW-2",
        "Resolution Date": "12.02.2026 10:00",
        Updated: "12.02.2026 10:00",
        Backlog: "30d 0h 0m",
        "In Progress": "6d 0h 0m",
        "Code Review": "2d 0h 0m",
        Done: "1d 0h 0m",
        Abandoned: "50d 0h 0m",
      },
    ];

    const entries = buildAutoBottleneckEntriesFromTimeInStatus({
      headers,
      rows,
      fallbackPeriod: "2026-02",
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].period).toBe("2026-02");
    expect(entries[0].columns.map((column) => column.name)).toEqual(["In Progress", "Code Review"]);

    const inProgress = entries[0].columns.find((column) => column.name === "In Progress");
    const codeReview = entries[0].columns.find((column) => column.name === "Code Review");

    expect(inProgress?.avgDays).toBeCloseTo(8, 2);
    expect(codeReview?.avgDays).toBeCloseTo(2, 2);
  });

  it("excludes abandoned and backlog statuses from issue-row aggregation by default", () => {
    const entries = buildAutoBottleneckEntriesFromIssueRows({
      issueRows: [
        {
          issueKey: "BW-8",
          resolvedDate: null,
          periodHint: "2026-02",
          durations: [
            { status: "Backlog", days: 30 },
            { status: "Abandoned", days: 60 },
            { status: "In Progress", days: 6 },
          ],
        },
      ],
      issuePeriodByKey: new Map([["bw-8", "2026-02"]]),
    });

    expect(entries).toEqual([
      {
        period: "2026-02",
        columns: [{ name: "In Progress", avgDays: 6, sampleCount: 1 }],
      },
    ]);
  });

  it("keeps configured funnel statuses in issue-row aggregation", () => {
    const entries = buildAutoBottleneckEntriesFromIssueRows({
      issueRows: [
        {
          issueKey: "BW-9",
          resolvedDate: null,
          periodHint: "2026-02",
          durations: [
            { status: "Refinement", days: 5 },
            { status: "Ready for Testing", days: 3 },
            { status: "Development", days: 2 },
            { status: "Done", days: 1 },
          ],
        },
      ],
      issuePeriodByKey: new Map([["bw-9", "2026-02"]]),
      flowStatuses: ["Refinement", "Ready for Testing", "Development"],
    });

    expect(entries[0].columns.map((column) => column.name)).toEqual([
      "Refinement",
      "Ready for Testing",
      "Development",
    ]);
  });

  it("can keep every Time in Status duration column for the detailed status view", () => {
    const headers = [
      "Issue key",
      "Resolution Date",
      "Updated",
      "Think it",
      "Choose It",
      "Initial discovery",
      "Analysing",
      "Backlog",
      "Implementing",
      "Funnel",
      "Reviewing",
      "Delivery",
      "Cancelled",
    ];
    const rows = [
      {
        "Issue key": "BW-10",
        "Resolution Date": "10.02.2026 10:00",
        Updated: "10.02.2026 10:00",
        "Think it": "1d 0h 0m",
        "Choose It": "2d 0h 0m",
        "Initial discovery": "3d 0h 0m",
        Analysing: "4d 0h 0m",
        Backlog: "5d 0h 0m",
        Implementing: "6d 0h 0m",
        Funnel: "7d 0h 0m",
        Reviewing: "8d 0h 0m",
        Delivery: "9d 0h 0m",
        Cancelled: "100d 0h 0m",
      },
    ];

    const issueRows = parseTimeInStatusIssueRows({
      headers,
      rows,
      fallbackPeriod: "2026-02",
      includeAllStatuses: true,
    });

    expect(issueRows[0].durations.map((duration) => duration.status)).toEqual([
      "Think it",
      "Choose It",
      "Initial discovery",
      "Analysing",
      "Backlog",
      "Implementing",
      "Funnel",
      "Reviewing",
      "Delivery",
    ]);

    const entries = buildAutoBottleneckEntriesFromIssueRows({
      issueRows,
      issuePeriodByKey: new Map([["bw-10", "2026-02"]]),
      includeAllStatuses: true,
    });

    expect(entries[0].columns.map((column) => column.name)).toEqual([
      "Think it",
      "Choose It",
      "Initial discovery",
      "Analysing",
      "Backlog",
      "Implementing",
      "Funnel",
      "Reviewing",
      "Delivery",
    ]);
    expect(entries[0].columns.map((column) => column.name)).not.toContain("Cancelled");
  });

  it("maps issue rows to month by matched done issue and keeps latest row per key", () => {
    const rows = [
      {
        issueKey: "BW-1",
        resolvedDate: null,
        periodHint: "2026-01",
        durations: [
          { status: "In Progress", days: 2 },
          { status: "Code Review", days: 1 },
        ],
      },
      {
        issueKey: "BW-2",
        resolvedDate: null,
        periodHint: "2026-01",
        durations: [
          { status: "In Progress", days: 3 },
          { status: "Done", days: 9 },
        ],
      },
      {
        issueKey: "BW-1",
        resolvedDate: null,
        periodHint: "2026-02",
        durations: [
          { status: "In Progress", days: 5 },
          { status: "Code Review", days: 2 },
        ],
      },
      {
        issueKey: "BW-3",
        resolvedDate: null,
        periodHint: "2026-02",
        durations: [{ status: "In Progress", days: 10 }],
      },
    ];

    const entries = buildAutoBottleneckEntriesFromIssueRows({
      issueRows: rows,
      issuePeriodByKey: new Map([
        ["bw-1", "2026-01"],
        ["bw-2", "2026-02"],
      ]),
    });

    expect(entries).toEqual([
      {
        period: "2026-01",
        columns: [
          { name: "In Progress", avgDays: 5, sampleCount: 1 },
          { name: "Code Review", avgDays: 2, sampleCount: 1 },
        ],
      },
      {
        period: "2026-02",
        columns: [{ name: "In Progress", avgDays: 3, sampleCount: 1 }],
      },
    ]);
  });

  it("respects configured flow statuses in aggregation", () => {
    const entries = buildAutoBottleneckEntriesFromIssueRows({
      issueRows: [
        {
          issueKey: "BW-7",
          resolvedDate: null,
          periodHint: "2026-02",
          durations: [
            { status: "Backlog", days: 12 },
            { status: "Code Review", days: 4 },
            { status: "In Progress", days: 8 },
          ],
        },
      ],
      issuePeriodByKey: new Map([["bw-7", "2026-02"]]),
      flowStatuses: ["In Progress", "Code Review"],
    });

    expect(entries).toEqual([
      {
        period: "2026-02",
        columns: [
          { name: "In Progress", avgDays: 8, sampleCount: 1 },
          { name: "Code Review", avgDays: 4, sampleCount: 1 },
        ],
      },
    ]);
  });

  it("keeps configured active statuses but still blocks cancelled statuses", () => {
    const entries = buildAutoBottleneckEntriesFromIssueRows({
      issueRows: [
        {
          issueKey: "BW-9",
          resolvedDate: null,
          periodHint: "2026-02",
          durations: [
            { status: "Reopened", days: 9 },
            { status: "Abandoned", days: 60 },
            { status: "In Progress", days: 5 },
          ],
        },
      ],
      issuePeriodByKey: new Map([["bw-9", "2026-02"]]),
      flowStatuses: ["Reopened", "Abandoned", "In Progress"],
    });

    expect(entries).toEqual([
      {
        period: "2026-02",
        columns: [
          { name: "Reopened", avgDays: 9, sampleCount: 1 },
          { name: "In Progress", avgDays: 5, sampleCount: 1 },
        ],
      },
    ]);
  });
});
