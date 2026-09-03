import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricTrustMetadata, type MetricTrustInput } from "../apps/sm-tool/src/lib/metric-trust";

const viewsSource = readFileSync("apps/sm-tool/src/components/ExecutiveViews.tsx", "utf8");
const appSource = readFileSync("apps/sm-tool/src/App.tsx", "utf8");
const trustSource = readFileSync("apps/sm-tool/src/lib/metric-trust.ts", "utf8");
const stylesSource = readFileSync("apps/sm-tool/src/styles.css", "utf8");

describe("Executive metric trust affordance", () => {
  const trustFixture = [
    { key: "leadTime", value: 12.4, p85: 18, eligible: 42, usable: 42, state: "complete" },
    { key: "activeTime", value: 8.1, p85: 13, eligible: 42, usable: 38, state: "partial" },
    { key: "cycleTime", value: null, p85: null, eligible: 0, usable: 0, state: "unavailable" },
    { key: "sleP85", value: 18, p85: 18, eligible: 42, usable: 42, state: "complete" },
  ] as const;

  it("keeps the four cards ordered and exposes only P85 in the new trust surface", () => {
    const flowStart = viewsSource.indexOf("function FlowTimeCards");
    const flowEnd = viewsSource.indexOf("function CycleTimePanel");
    const flowSource = viewsSource.slice(flowStart, flowEnd === -1 ? viewsSource.length : flowEnd);
    expect(trustFixture.map((metric) => metric.key)).toEqual(["leadTime", "activeTime", "cycleTime", "sleP85"]);
    expect(flowSource).toContain("data.metricTrust.map");
    expect(flowSource).not.toContain("P50");
    expect(flowSource).not.toContain("P70");
    expect(flowSource).not.toContain("P95");
    expect(viewsSource).toContain("<dt>P85</dt>");
  });

  const snapshotFlowTiming = {
    leadTime: { avgDays: 12, p50: 10, p70: 14, p85: 18, p95: 22, count: 4 },
    activeTime: { avgDays: 7, p50: 6, p70: 9, p85: 11, p95: 14, count: 4 },
    cycleTime: { avgDays: 5, p50: 4, p70: 6, p85: 8, p95: 10, count: 4 },
  };
  const detail = (issueKey: string, cycleTimeDays: number | null) => ({
    issueKey,
    anchorDate: "2026-03-10",
    scope: "closed" as const,
    leadTimeDays: cycleTimeDays === null ? null : cycleTimeDays + 4,
    activeTimeDays: cycleTimeDays === null ? null : cycleTimeDays + 2,
    cycleTimeDays,
  });
  const input = (overrides: Partial<MetricTrustInput>): MetricTrustInput => ({
    flowTiming: snapshotFlowTiming,
    flowDetails: [detail("SM-1", 5), detail("SM-2", 6), detail("SM-3", 4), detail("SM-4", 7)],
    periodLabel: "March 2026",
    sleP85: 8,
    sleEligibleCount: 4,
    sleUsableCount: 4,
    cycleFallbackUsed: false,
    ...overrides,
  });

  it("keeps snapshot-only values and trust metadata consistent", () => {
    const trust = buildMetricTrustMetadata(input({ flowDetails: [] }));
    expect(trust.map((metric) => metric.value)).toEqual([12, 7, 5, 8]);
    expect(trust.every((metric) => metric.state === "partial")).toBe(true);
    expect(trust.every((metric) => metric.source.includes("Persisted flowTiming snapshot"))).toBe(true);
    expect(trust.every((metric) => metric.coveragePct === null)).toBe(true);
    expect(trust.find((metric) => metric.key === "sleP85")?.usableCount).toBeNull();
    expect(trust.every((metric) => metric.periodLabel === "March 2026")).toBe(true);
    expect(trust.map((metric) => metric.label)).toEqual(["Lead Time", "Cycle Time", "Implementation Time", "SLE P85"]);
  });

  it("reports complete, partial, fallback, unavailable, and selected-period states from fixtures", () => {
    const complete = buildMetricTrustMetadata(input({}));
    expect(complete.map((metric) => metric.state)).toEqual(["complete", "complete", "complete", "complete"]);
    expect(complete.every((metric) => metric.coveragePct === 100)).toBe(true);

    const partial = buildMetricTrustMetadata(input({ flowDetails: [detail("SM-1", 5), detail("SM-2", null)], sleEligibleCount: 2, sleUsableCount: 1 }));
    expect(partial.find((metric) => metric.key === "cycleTime")?.state).toBe("partial");
    expect(partial.find((metric) => metric.key === "cycleTime")?.usableCount).toBe(1);
    expect(partial.find((metric) => metric.key === "cycleTime")?.fallback).toBe("None used.");
    expect(partial.find((metric) => metric.key === "cycleTime")?.reason).not.toContain("fallback");

    const fallback = buildMetricTrustMetadata(input({ cycleFallbackUsed: true }));
    expect(fallback.find((metric) => metric.key === "cycleTime")?.state).toBe("partial");
    expect(fallback.find((metric) => metric.key === "cycleTime")?.fallback).toContain("Elapsed working-day fallback");
    expect(fallback.find((metric) => metric.key === "sleP85")?.state).toBe("partial");
    expect(fallback.find((metric) => metric.key === "sleP85")?.fallback).toContain("fallback");

    const unavailable = buildMetricTrustMetadata(input({
      flowTiming: {
        leadTime: { avgDays: null, p50: null, p70: null, p85: null, p95: null, count: 0 },
        activeTime: { avgDays: null, p50: null, p70: null, p85: null, p95: null, count: 0 },
        cycleTime: { avgDays: null, p50: null, p70: null, p85: null, p95: null, count: 0 },
      },
      flowDetails: [],
      sleP85: null,
      sleEligibleCount: 0,
      sleUsableCount: 0,
    }));
    expect(unavailable.every((metric) => metric.state === "unavailable" && metric.value === null)).toBe(true);

    const anotherPeriod = buildMetricTrustMetadata(input({ periodLabel: "February 2026" }));
    expect(new Set(anotherPeriod.map((metric) => metric.periodLabel))).toEqual(new Set(["February 2026"]));
  });

  it("wires accessible disclosure behavior and trust metadata without inventing missing values", () => {
    expect(trustFixture.find((metric) => metric.key === "cycleTime")?.value).toBeNull();
    expect(trustFixture.find((metric) => metric.key === "cycleTime")?.state).toBe("unavailable");
    expect(appSource).toContain("buildExecutiveMetricTrust(");
    expect(appSource).toContain("cycleFallbackUsed: fallbackUsed");
    expect(trustSource).toContain("eligibleCount:");
    expect(trustSource).toContain("coveragePct:");
    expect(viewsSource).toContain('aria-label={`Explain ${trust.label}`}');
    expect(viewsSource).toContain("aria-expanded={open}");
    expect(viewsSource).toContain("aria-controls={popoverId}");
    expect(viewsSource).toContain("event.key !== \"Escape\"");
    expect(viewsSource).toContain("buttonRefs.current[openKey]?.focus()");
    expect(viewsSource).toContain("data-metric-trust-key");
    expect(stylesSource).toContain(".metric-trust-grid");
    expect(stylesSource).toContain("@media (max-width: 620px)");
    expect(trustSource).not.toContain('? "Active Time" : "Cycle Time"');
    expect(appSource).toContain("getWorkflowCompatibilityBuckets(team.config).excludedStatuses");
    expect(appSource).not.toContain("...(team.config.workflowConfig?.funnelStatuses ?? [])");
  });
});
