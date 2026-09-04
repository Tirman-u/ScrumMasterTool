import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricTrustMetadata, type MetricTrustInput } from "../apps/sm-tool/src/lib/metric-trust";
import { getMetricInsightDefinition, parseMetricPreviousValue } from "../apps/sm-tool/src/lib/metric-insights";

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
    expect(flowSource).toContain('data.metricTrust.filter((trust) => trust.key !== "waitingTimePct" && trust.key !== "maintenancePct").map');
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
    expect(trust.map((metric) => metric.value)).toEqual([12, 7, 5, 8, null, null]);
    expect(trust.slice(0, 4).every((metric) => metric.state === "partial")).toBe(true);
    expect(trust.slice(0, 4).every((metric) => metric.source.includes("Persisted flowTiming snapshot"))).toBe(true);
    expect(trust.slice(0, 4).every((metric) => metric.coveragePct === null)).toBe(true);
    expect(trust.find((metric) => metric.key === "waitingTimePct")?.state).toBe("unavailable");
    expect(trust.find((metric) => metric.key === "sleP85")?.usableCount).toBeNull();
    expect(trust.every((metric) => metric.periodLabel === "March 2026")).toBe(true);
    expect(trust.map((metric) => metric.label)).toEqual(["Lead Time", "Cycle Time", "Implementation Time", "SLE P85", "Waiting Time %", "Maintenance %"]);
  });

  it("keeps the Waiting Time modal contract percent-based and does not invent a previous comparison", () => {
    const definition = getMetricInsightDefinition("Waiting Time %");
    expect(definition.unit).toBe("%");
    expect(definition.meaning).toContain("Cycle Time spent waiting outside Implementation Time");
    expect(definition.calculation).toBe("Summed usable Cycle-only waiting duration outside Implementation Time ÷ summed usable Cycle Time duration × 100.");
    expect(definition.source).toBe("Local flowTiming detail snapshot");
    expect(parseMetricPreviousValue("-")).toBeNull();
    expect(parseMetricPreviousValue("0%")).toBe(0);
  });

  it("reports complete, partial, fallback, unavailable, and selected-period states from fixtures", () => {
    const complete = buildMetricTrustMetadata(input({}));
    expect(complete.map((metric) => metric.state)).toEqual(["complete", "complete", "complete", "complete", "complete", "unavailable"]);
    expect(complete.slice(0, 5).every((metric) => metric.coveragePct === 100)).toBe(true);
    expect(complete.find((metric) => metric.key === "waitingTimePct")?.value).toBeCloseTo((8 / 30) * 100);

    const partial = buildMetricTrustMetadata(input({ flowDetails: [detail("SM-1", 5), detail("SM-2", null)], sleEligibleCount: 2, sleUsableCount: 1 }));
    expect(partial.find((metric) => metric.key === "cycleTime")?.state).toBe("partial");
    expect(partial.find((metric) => metric.key === "cycleTime")?.usableCount).toBe(1);
    expect(partial.find((metric) => metric.key === "cycleTime")?.fallback).toBe("None used.");
    expect(partial.find((metric) => metric.key === "cycleTime")?.reason).not.toContain("fallback");
    expect(partial.find((metric) => metric.key === "waitingTimePct")?.state).toBe("partial");

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

  it("uses an aggregate Cycle-only ratio, excludes invalid rows, and never substitutes zero", () => {
    const waiting = buildMetricTrustMetadata(input({
      flowDetails: [
        detail("SM-1", 5),
        detail("SM-2", 0),
        { ...detail("SM-3", 4), activeTimeDays: 3 },
        { ...detail("SM-4", null), activeTimeDays: 6 },
      ],
    })).find((metric) => metric.key === "waitingTimePct");
    expect(waiting?.value).toBeCloseTo(4 / 9 * 100);
    expect(waiting?.eligibleCount).toBe(4);
    expect(waiting?.usableCount).toBe(2);
    expect(waiting?.state).toBe("partial");

    const zero = buildMetricTrustMetadata(input({
      flowDetails: [{ ...detail("SM-0", 0), activeTimeDays: 0, cycleTimeDays: 0 }],
    })).find((metric) => metric.key === "waitingTimePct");
    expect(zero).toMatchObject({ value: null, state: "unavailable" });
    expect(zero?.reason).toContain("duration is zero");
  });

  it("carries typed Waiting Time provenance and only reports a real adjacent predecessor", () => {
    const current = buildMetricTrustMetadata(input({
      flowDetails: [detail("SM-1", 5)],
      waitingTimeSnapshot: {
        waitingDurationWorkingDays: 2,
        cycleDurationWorkingDays: 7,
        waitingPct: 2 / 7 * 100,
        sampleCount: 1,
        usableCount: 1,
        unknownCount: 0,
        coverageState: "complete",
        asOf: "2026-03",
        capturedAt: "2026-03-31T12:00:00Z",
        source: "local-recalculation",
        semanticVersion: "flow-status-v1:fixture",
      },
      previousWaitingTimeSnapshot: {
        waitingDurationWorkingDays: 3,
        cycleDurationWorkingDays: 7,
        waitingPct: 3 / 7 * 100,
        sampleCount: 1,
        usableCount: 1,
        unknownCount: 0,
        coverageState: "complete",
        asOf: "2026-02",
        capturedAt: "2026-02-28T12:00:00Z",
        source: "local-cache",
        semanticVersion: "flow-status-v1:fixture",
      },
    })).find((metric) => metric.key === "waitingTimePct");
    expect(current).toMatchObject({ value: (2 / 7) * 100, previousValue: (3 / 7) * 100, asOf: "2026-03", capturedAt: "2026-03-31T12:00:00Z", source: "local-recalculation" });
    expect(viewsSource).toContain("metricTrust?: MetricTrust");
    expect(viewsSource).toContain("const trust = metric.metricTrust");
    expect(viewsSource).toContain("trust?.capturedAt");
  });

  it("preserves authoritative snapshot source and distinct operational states", () => {
    const states = [
      ["conflict", "conflict"],
      ["stale-last-known", "stale-last-known"],
      ["needs-review-config", "needs-review-config"],
      ["unavailable-no-source", "unavailable-no-source"],
      ["error-with-retry", "error-with-retry"],
    ] as const;
    for (const [snapshotState, expectedState] of states) {
      const trust = buildMetricTrustMetadata(input({
        waitingTimeSnapshot: {
          waitingPct: 12,
          sampleCount: 4,
          usableCount: 3,
          unknownCount: 1,
          coverageState: snapshotState === "conflict" ? "conflict" : "partial",
          state: snapshotState,
          source: "local-cache",
          asOf: "2026-03",
          capturedAt: "2026-03-31T12:00:00Z",
          reason: `fixture ${snapshotState}`,
        },
      })).find((metric) => metric.key === "waitingTimePct");
      expect(trust).toMatchObject({ state: expectedState, source: "local-cache", reason: `fixture ${snapshotState}`, value: 12, eligibleCount: 4, usableCount: 3 });
    }
    const contradictory = buildMetricTrustMetadata(input({
      waitingTimeSnapshot: { waitingPct: 12, sampleCount: 4, usableCount: 4, coverageState: "conflict", state: "complete", source: "local-cache", reason: "conflicting configuration" },
    })).find((metric) => metric.key === "waitingTimePct");
    expect(contradictory?.state).toBe("conflict");
    expect(contradictory?.coverageState).toBe("conflict");
  });

  it("does not invent a previous comparison when the persisted predecessor is not comparable", () => {
    const trust = buildMetricTrustMetadata(input({
      waitingTimeSnapshot: { waitingPct: 10, sampleCount: 2, usableCount: 2, coverageState: "complete", source: "local-recalculation", asOf: "2026-03", semanticVersion: "flow-status-v1:a" },
      previousWaitingTimeSnapshot: { waitingPct: 4, sampleCount: 2, usableCount: 2, coverageState: "complete", source: "local-cache", asOf: "2026-02", semanticVersion: "flow-status-v1:b" },
    })).find((metric) => metric.key === "waitingTimePct");
    expect(trust?.previousValue).toBeNull();
    expect(trust?.previousPeriodLabel).toBeNull();
    expect(appSource).toContain("item.semanticVersion === semanticVersion");
    expect(appSource).not.toContain("previousMonthKeyForWaiting");
  });

  it("hides Waiting Time change when current value is unavailable even if previous is valid", () => {
    const trust = buildMetricTrustMetadata(input({
      waitingTimeSnapshot: { waitingPct: undefined, sampleCount: 2, usableCount: 0, coverageState: "unavailable", state: "unavailable", source: "local-cache", semanticVersion: "flow-status-v1:fixture", reason: "no denominator" },
      previousWaitingTimeSnapshot: { waitingPct: 12, sampleCount: 2, usableCount: 2, coverageState: "complete", state: "complete", source: "local-cache", semanticVersion: "flow-status-v1:fixture", asOf: "2026-02" },
    })).find((metric) => metric.key === "waitingTimePct");
    expect(trust).toMatchObject({ value: null, previousValue: 12, state: "unavailable" });
    expect(appSource).toContain("Number.isFinite(waitingTimeCurrentValue) && Number.isFinite(waitingTimePreviousValue)");
    expect(viewsSource).toContain("!currentValueUnavailable && Number.isFinite(previousValue)");
  });

  it("wires accessible disclosure behavior and trust metadata without inventing missing values", () => {
    expect(trustFixture.find((metric) => metric.key === "cycleTime")?.value).toBeNull();
    expect(trustFixture.find((metric) => metric.key === "cycleTime")?.state).toBe("unavailable");
    expect(appSource).toContain("buildExecutiveMetricTrust(");
    expect(appSource).toContain('executiveMetric("Waiting Time %"');
    expect(viewsSource).toContain('filter((trust) => trust.key !== "waitingTimePct" && trust.key !== "maintenancePct")');
    expect(appSource).toContain("const executiveMetricTrust = selectedTeam && selectedTeamRow");
    expect(viewsSource).toContain("{data.kpis.map((metric) => <FlowMetricCard key={metric.label} metric={metric} />)}");
    expect(viewsSource).toContain("{data.kpis.map((metric) => <KpiCard key={metric.label} metric={metric} />)}");
    expect(trustSource).toContain("Summed usable Cycle-only waiting duration outside Implementation Time ÷ summed usable Cycle Time duration × 100.");
    expect(trustSource).toContain('label: "Waiting Time %"');
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
