import { describe, expect, it } from "vitest";
import {
  buildAutoBottleneckEntriesFromIssueRows,
  parseTimeInStatusDurationDays,
} from "../apps/sm-tool/src/lib/time-in-status";

describe("hosted Time in Status compatibility", () => {
  it("accepts decimal working-day values emitted by Jira helper", () => {
    expect(parseTimeInStatusDurationDays("6.1675")).toBeCloseTo(6.1675, 4);
    expect(parseTimeInStatusDurationDays("22.8826")).toBeCloseTo(22.8826, 4);
  });

  it("keeps historical Time in Status rows when issues CSV period join is missing", () => {
    const entries = buildAutoBottleneckEntriesFromIssueRows({
      issueRows: [
        {
          issueKey: "SOL-123",
          resolvedDate: new Date("2026-08-05T10:00:00.000Z"),
          periodHint: "2026-08",
          durationBasis: "working-days",
          durations: [
            { status: "In Development", days: 4.5 },
            { status: "In Testing", days: 8.25 },
          ],
        },
      ],
      issuePeriodByKey: new Map(),
      includeAllStatuses: true,
    });

    expect(entries).toEqual([
      {
        period: "2026-08",
        columns: [
          { name: "In Development", avgDays: 4.5, sampleCount: 1 },
          { name: "In Testing", avgDays: 8.25, sampleCount: 1 },
        ],
      },
    ]);
  });
});
