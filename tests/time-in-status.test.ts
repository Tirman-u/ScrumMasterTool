import { describe, expect, it } from "vitest";
import {
  buildAutoBottleneckEntriesFromIssueRows,
  buildAutoBottleneckEntriesFromTimeInStatus,
  isTimeInStatusCsv,
  parseTimeInStatusDurationDays,
} from "../apps/sm-tool/src/lib/time-in-status";

describe("time-in-status parser", () => {
  it("parses status duration strings into days", () => {
    expect(parseTimeInStatusDurationDays("2d 12h 30m")).toBeCloseTo(2.5208, 3);
    expect(parseTimeInStatusDurationDays("1w 2d")).toBe(9);
    expect(parseTimeInStatusDurationDays("-")).toBeNull();
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
    const headers = ["Issue key", "Resolution Date", "Updated", "In Progress", "Code Review", "Done"];
    const rows = [
      {
        "Issue key": "BW-1",
        "Resolution Date": "10.02.2026 10:00",
        Updated: "10.02.2026 10:00",
        "In Progress": "5d 0h 0m",
        "Code Review": "1d 0h 0m",
        Done: "0d 0h 0m",
      },
      {
        "Issue key": "BW-1",
        "Resolution Date": "11.02.2026 10:00",
        Updated: "11.02.2026 10:00",
        "In Progress": "10d 0h 0m",
        "Code Review": "2d 0h 0m",
        Done: "0d 0h 0m",
      },
      {
        "Issue key": "BW-2",
        "Resolution Date": "12.02.2026 10:00",
        Updated: "12.02.2026 10:00",
        "In Progress": "6d 0h 0m",
        "Code Review": "2d 0h 0m",
        Done: "1d 0h 0m",
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
          { name: "In Progress", avgDays: 5 },
          { name: "Code Review", avgDays: 2 },
        ],
      },
      {
        period: "2026-02",
        columns: [{ name: "In Progress", avgDays: 3 }],
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
          { name: "In Progress", avgDays: 8 },
          { name: "Code Review", avgDays: 4 },
        ],
      },
    ]);
  });
});
