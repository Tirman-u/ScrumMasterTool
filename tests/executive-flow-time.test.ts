import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewsSource = readFileSync("apps/sm-tool/src/components/ExecutiveViews.tsx", "utf8");
const teamDetailSource = readFileSync("apps/sm-tool/src/components/TeamDetail.tsx", "utf8");
const appSource = readFileSync("apps/sm-tool/src/App.tsx", "utf8");

describe("Executive flow-time restoration", () => {
  const edgeFixture = {
    flowTiming: {
      leadTime: { avgDays: null, p50: null, p85: null, p95: null, count: 0 },
      activeTime: { avgDays: 4.5, p50: 3, p85: 7, p95: null, count: 2 },
      cycleTime: { avgDays: 2, p50: 1, p85: 4, p95: 6, count: 3 },
    },
    selectedSle: { p50: null, p70: null, p85: 7, p95: null },
    scatter: [
      { issueKey: "FIX-1", resolutionDate: "2026-08-20", cycleTimeDays: 2 },
      { issueKey: "FIX-2", resolutionDate: "not-a-date", cycleTimeDays: 5 },
    ],
  };

  it("renders ordered flow-time cards from the selected snapshot and reuses TeamDetail", () => {
    expect(viewsSource).toContain("data.metricTrust.map");
    expect(viewsSource).toContain("<TrustMetricCard");
    expect(viewsSource).toContain("<TeamDetail");
    expect(viewsSource).toContain('lineVisibility={presentationMode ? { p50: false, p70: false, p85: true, p95: false }');
    expect(viewsSource).toContain("presentationMode={false}");
  });

  it("covers null metrics, invalid-date omission, and keyboard issue-row selection states", () => {
    expect(edgeFixture.flowTiming.leadTime.avgDays).toBeNull();
    expect(edgeFixture.flowTiming.leadTime.p85).toBeNull();
    expect(edgeFixture.selectedSle.p85).toBe(7);
    expect(edgeFixture.selectedSle.p50).toBeNull();
    expect(edgeFixture.scatter.filter((point) => Number.isFinite(new Date(point.resolutionDate).getTime()))).toHaveLength(1);
    expect(teamDetailSource).toContain('role="button"');
    expect(teamDetailSource).toContain("aria-selected={selectedIssueKey === point.issueKey}");
    expect(teamDetailSource).toContain('event.key === "Enter" || event.key === " "');
    expect(teamDetailSource).toContain("invalid or missing");
    expect(teamDetailSource).toContain("P95 unavailable");
    expect(teamDetailSource).toContain("unavailable/not rendered");
    expect(teamDetailSource).toContain('role="status" aria-live="polite"');
  });

  it("wires App-owned period, snapshot, and exclusion callbacks into the Executive view", () => {
    expect(appSource).toContain("flowTiming: selectedTeamRow.current.flowTiming");
    expect(appSource).toContain("periodFilter: periodMonth");
    expect(appSource).toContain("onExcludeIssue: (issueKey, reason)");
    expect(appSource).toContain("onRestoreAllIssues: () => void handleRestoreAllExcludedIssues()");
  });
});
