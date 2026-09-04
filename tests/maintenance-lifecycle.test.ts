import { describe, expect, it } from "vitest";
import {
  buildMaintenanceLifecycleSnapshot,
  classifyMaintenanceLifecycleIssueType,
  isValidMaintenanceLifecycleJiraKey,
  validateMaintenanceLifecycleConfigForSave,
} from "../apps/sm-tool/src/lib/metrics";
import { buildMetricTrustMetadata } from "../apps/sm-tool/src/lib/metric-trust";
import type { MaintenanceLifecycleSnapshot } from "../apps/sm-tool/src/types/contracts";
import type { ParsedIssue, TeamConfig } from "../apps/sm-tool/src/types/contracts";
import { readFileSync } from "node:fs";

const appSource = readFileSync("apps/sm-tool/src/App.tsx", "utf8");
const viewsSource = readFileSync("apps/sm-tool/src/components/ExecutiveViews.tsx", "utf8");
const insightSource = readFileSync("apps/sm-tool/src/lib/metric-insights.ts", "utf8");

const config: TeamConfig = {
  teamName: "Fixture team",
  doneConfig: { useStatusCategoryDone: false, doneStatuses: ["Done"] },
  sleConfig: { percentiles: [50, 70, 85, 95], rounding: "ceil" },
  mapping: { key: "Key", created: "Created", resolutionDate: "Resolved", updated: "Updated", status: "Status", resolution: "Resolution", parent: "Parent" },
  maintenanceLifecycle: { maintenanceLifecycleJiraKey: "abc-123" },
};

const issue = (issueKey: string, issueType: string, parentIssueKey: string | undefined): ParsedIssue => ({
  issueKey,
  issueType,
  parentIssueKey,
  created: new Date("2026-03-01T00:00:00Z"),
  projectEnteredAt: null,
  updated: new Date("2026-03-10T00:00:00Z"),
  resolutionDate: new Date("2026-03-10T00:00:00Z"),
  status: "Done",
  resolution: "Done",
  storyPoints: null,
  sprintRaw: "",
  sourceFile: "fixture.csv",
  sourceRow: 2,
});

describe("maintenance lifecycle classification", () => {
  it("validates keys locally and applies the exact issue-type mapping", () => {
    expect(isValidMaintenanceLifecycleJiraKey(" abc-123 ")).toBe(true);
    expect(isValidMaintenanceLifecycleJiraKey("not-a-key")).toBe(false);
    expect(classifyMaintenanceLifecycleIssueType("Task")).toBe("Lifecycle");
    expect(classifyMaintenanceLifecycleIssueType(" Spike ")).toBe("Lifecycle");
    expect(classifyMaintenanceLifecycleIssueType("Production Bug")).toBe("Maintenance");
    expect(classifyMaintenanceLifecycleIssueType("Story")).toBe("Unknown");
  });

  it("rejects malformed save input without replacing the previous config and accepts valid input", () => {
    const previous = { maintenanceLifecycleJiraKey: "OLD-7", source: "native" as const, migrationState: "native" as const };
    const rejected = validateMaintenanceLifecycleConfigForSave("not-a-key", previous);
    expect(rejected).toMatchObject({ accepted: false, config: previous });
    const accepted = validateMaintenanceLifecycleConfigForSave(" NEW-42 ", previous);
    expect(accepted).toMatchObject({ accepted: true, config: { maintenanceLifecycleJiraKey: "NEW-42" } });
    expect(validateMaintenanceLifecycleConfigForSave("", previous)).toMatchObject({ accepted: true, config: undefined });
  });

  it("requires direct parent equality and excludes unknown types from the denominator", () => {
    const snapshot = buildMaintenanceLifecycleSnapshot([
      issue("ABC-1", "Task", "ABC-123"),
      issue("ABC-2", "Bug", "abc-123"),
      issue("ABC-3", "Story", "ABC-123"),
      issue("ABC-4", "Bug", "ABC-999"),
    ], config, "2026-03", new Date("2026-03-31T00:00:00Z"), "2026-03", "2026-03-31T12:00:00Z", "local-recalculation");
    expect(snapshot).toMatchObject({ lifecycleCount: 1, maintenanceCount: 1, unknownCount: 2, candidateCount: 4, maintenancePct: 50, coverageState: "partial", state: "ready-partial-unknown-types", asOf: "2026-03", source: "local-recalculation" });
  });

  it("fails closed for missing configuration and zero recognized work", () => {
    expect(buildMaintenanceLifecycleSnapshot([], { ...config, maintenanceLifecycle: undefined }, "2026-03").state).toBe("not-configured");
    expect(buildMaintenanceLifecycleSnapshot([issue("ABC-1", "Story", "ABC-123")], config, "2026-03").state).toBe("no-recognized-completed-work");
    expect(buildMaintenanceLifecycleSnapshot([issue("ABC-1", "Task", "ABC-999")], config, "2026-03").state).toBe("configured-not-found");
  });

  it("preserves every maintenance snapshot state through the MetricTrust contract", () => {
    const states: Array<NonNullable<MaintenanceLifecycleSnapshot["state"]>> = [
      "not-configured",
      "invalid-key",
      "source-missing-parent-field",
      "configured-not-found",
      "no-recognized-completed-work",
      "ready-complete",
      "ready-partial-unknown-types",
      "conflict",
      "stale-last-known",
      "error-with-retry",
    ];
    const baseInput = {
      flowTiming: {
        leadTime: { avgDays: null, p50: null, p70: null, p85: null, p95: null, count: 0 },
        activeTime: { avgDays: null, p50: null, p70: null, p85: null, p95: null, count: 0 },
        cycleTime: { avgDays: null, p50: null, p70: null, p85: null, p95: null, count: 0 },
      },
      flowDetails: [],
      periodLabel: "2026-03",
      sleP85: null,
      sleEligibleCount: 0,
      sleUsableCount: 0,
      cycleFallbackUsed: false,
    };
    for (const state of states) {
      const trust = buildMetricTrustMetadata({
        ...baseInput,
        maintenanceLifecycleSnapshot: {
          state,
          coverageState: state === "conflict" ? "conflict" : state === "ready-partial-unknown-types" ? "partial" : state === "ready-complete" ? "complete" : "unavailable",
          reason: `fixture-${state}`,
          maintenancePct: state === "ready-complete" || state === "ready-partial-unknown-types" ? 25 : undefined,
          asOf: "2026-03",
          source: "local-cache",
        },
      }).find((item) => item.key === "maintenancePct");
      expect(trust?.state, state).toBe(state === "ready-complete" ? "complete" : state === "ready-partial-unknown-types" ? "partial" : state);
      expect(trust?.reason).toBe(`fixture-${state}`);
    }
  });

  it("wires one shared card/modal contract for both presentation modes", () => {
    expect(appSource).toContain('executiveMetric("Maintenance %"');
    expect(appSource).toContain("maintenanceLifecycleSnapshot: maintenanceSnapshot");
    expect(appSource).toContain("validateMaintenanceLifecycleConfigForSave(");
    expect(appSource).toContain("Your previous settings are unchanged.");
    expect(viewsSource).toContain("metricTrust?: MetricTrust");
    expect(viewsSource).toContain("MetricInsightModal");
    expect(insightSource).toContain("Maintenance completed direct-child recognized work");
    expect(insightSource).toContain("Task/Spike are Lifecycle; Bug/Production Bug are Maintenance");
  });
});
