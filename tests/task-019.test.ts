import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const views = readFileSync("apps/sm-tool/src/components/ExecutiveViews.tsx", "utf8");
const app = readFileSync("apps/sm-tool/src/App.tsx", "utf8");

describe("TASK 019 executive metric hierarchy", () => {
  test("uses one ordered flow-time group followed by one delivery expectation group", () => {
    expect(views).toContain('title="FLOW TIME"');
    expect(views).toContain('trust.key === "leadTime" || trust.key === "activeTime" || trust.key === "cycleTime"');
    expect(views).toContain("function DeliveryExpectation");
    expect(views).toContain('title="DELIVERY EXPECTATION"');
    expect(views.indexOf("<FlowTimeCards")).toBeLessThan(views.indexOf("<DeliveryExpectation"));
    expect(views.indexOf("<DeliveryExpectation")).toBeLessThan(views.indexOf("<SupportingMetrics"));
  });

  test("keeps the supporting surface free of duplicate flow and SLE cards", () => {
    expect(views).toContain('"Avg Implementation Time"');
    expect(views).toContain('"SLE P85"');
    expect(views).toContain('"Work Past Expectation"');
    expect(views).toContain("const metrics = data.kpis.filter((metric) => !duplicateLabels.has(metric.label));");
    expect(views).not.toContain("function FlowPipeline");
    expect(views).not.toContain("{data.kpis.map((metric) => <FlowMetricCard");
  });

  test("uses the approved expectation and waiting-time copy", () => {
    expect(app).toContain("Older than SLE (${formatWorkingDays(selectedTeamHealth.sleRisk.thresholdDays)})");
    expect(app).toContain("Open work older than this expectation.");
    expect(app).toContain("Cycle-only waiting share · Implementation Time excluded · lower is better");
    expect(app).toContain('sub: "Cycle-only waiting share · Implementation Time excluded · lower is better"');
  });

  test("does not expose the removed special P85 visual surface", () => {
    expect(views).not.toContain("Delivery Expectation ReferenceLine");
    expect(views).not.toContain("Combined SLE P85");
    expect(views).not.toContain('title="Visual Analytics"');
  });
});
