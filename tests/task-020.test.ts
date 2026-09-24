import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const app = readFileSync("apps/sm-tool/src/App.tsx", "utf8");
const insights = readFileSync("apps/sm-tool/src/lib/metric-insights.ts", "utf8");
const views = readFileSync("apps/sm-tool/src/components/ExecutiveViews.tsx", "utf8");

describe("TASK 020 metric clarity", () => {
  test("documents Forecast P85 as a calendar-day backlog forecast, distinct from SLE", () => {
    expect(insights).toContain("currently open backlog at approximately 85% Monte Carlo confidence");
    expect(insights).toContain('unit: "calendar days"');
    expect(insights).toContain("not Cycle Time SLE/P85");
    expect(app).toContain("calendar days · ~85% Monte Carlo confidence");
    expect(app).toContain("distinct from Cycle Time SLE");
    expect(app).not.toContain('sub: "Monte Carlo · 85% confidence"');
  });

  test("uses the exact Flow Efficiency formula and interpretation", () => {
    expect(insights).toContain("Active time ÷ (active time + queue time) × 100.");
    expect(insights).toContain("Higher means more observed flow time was active rather than waiting.");
    expect(app).toContain("active time ÷ (active time + queue time) × 100");
  });

  test("uses Open Bug Ratio with both numerator and denominator", () => {
    expect(app).toContain('executiveMetric("Open Bug Ratio"');
    expect(app).toContain("open bugs / ${selectedTeamHealth.bugRatio.wipTotal} open WIP items");
    expect(insights).toContain('"Open Bug Ratio": { label: "Open Bug Ratio"');
    expect(insights).toContain("Open bug items ÷ open WIP items × 100.");
  });

  test("makes SLE Compliance explicitly about open work and preserves one delivery surface", () => {
    expect(app).toContain("Share of currently open work within the team’s existing SLE P85 delivery expectation.");
    expect(app).toContain("within SLE / ${snapshot.totalWip} eligible open WIP");
    expect(insights).toContain("Share of currently open work that is within the team’s existing SLE P85 delivery expectation.");
    expect(insights).not.toContain("Share of completed work within the existing SLE expectation.");
    expect(views).toContain('metric.label === "SLE P85 / Delivery Expectation"');
    expect(views).toContain('"SLE P85 / Delivery Expectation"');
  });

  test("routes all four clarified metrics through clickable shared KPI cards in both modes", () => {
    for (const label of ["SLE Compliance", "Open Bug Ratio", "Flow Efficiency", "Forecast P85"]) {
      expect(app).toContain(`executiveMetric("${label}"`);
    }
    expect(app.match(/executiveMetric\("SLE Compliance"/g)?.length).toBe(1);
    expect(app.match(/executiveMetric\("Open Bug Ratio"/g)?.length).toBe(1);
    expect(app.match(/executiveMetric\("Flow Efficiency"/g)?.length).toBe(1);
    expect(app.match(/executiveMetric\("Forecast P85"/g)?.length).toBe(1);
    expect(views).toContain("function InsightCardButton");
    expect(views.match(/<SupportingMetrics data=\{data\} \/>/g)?.length).toBe(2);
    expect(views).toContain("<MetricInsightModal data={data} metric={metric} diagnostic={diagnostic}");
  });
});
