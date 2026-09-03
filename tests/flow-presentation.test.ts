import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adaptLegacyWorkflowConfig,
  FLOW_PRESENTATION_METRICS,
  mapFlowTimingPresentation,
} from "../apps/sm-tool/src/lib/flow-presentation";
import type { TeamConfig } from "../apps/sm-tool/src/types/contracts";

const appSource = readFileSync("apps/sm-tool/src/App.tsx", "utf8");
const teamDetailSource = readFileSync("apps/sm-tool/src/components/TeamDetail.tsx", "utf8");

const metric = (avgDays: number | null) => ({ count: 2, avgDays, p50: 1, p70: 2, p85: 3, p95: 4 });
const config = (workflowConfig?: TeamConfig["workflowConfig"]): TeamConfig => ({
  teamName: "Fixture team",
  doneConfig: { useStatusCategoryDone: true },
  sleConfig: { percentiles: [85], rounding: "ceil" },
  mapping: { key: "Key", created: "Created", resolutionDate: "Resolved", updated: "Updated", status: "Status", resolution: "Resolution" },
  workflowConfig,
});

describe("flow presentation terminology adapter", () => {
  it("maps new labels to the unchanged legacy flowTiming values", () => {
    const mapped = mapFlowTimingPresentation({ leadTime: metric(11), activeTime: metric(7), cycleTime: metric(3) });
    expect(mapped.map(({ metric: definition, value }) => [definition.label, value.avgDays])).toEqual([
      ["Lead Time", 11],
      ["Cycle Time", 7],
      ["Implementation Time", 3],
    ]);
    expect(FLOW_PRESENTATION_METRICS.map((definition) => definition.direction)).toEqual(["lower-is-better", "lower-is-better", "lower-is-better"]);
  });

  it("derives complete legacy status roles without mutating config", () => {
    const original = config({ funnelStatuses: ["Ready"], activeStatuses: ["Doing"], implementingStatuses: ["Coding"] });
    const before = structuredClone(original);
    const result = adaptLegacyWorkflowConfig(original);
    expect(result).toMatchObject({
      state: "complete",
      source: "legacy",
      leadStatuses: ["Ready", "Doing", "Coding"],
      cycleStatuses: ["Doing", "Coding"],
      implementationStatuses: ["Coding"],
    });
    expect(original).toEqual(before);
  });

  it("fails closed and reports partial legacy mappings", () => {
    const result = adaptLegacyWorkflowConfig(config({ funnelStatuses: ["Ready"], implementingStatuses: ["Coding"] }));
    expect(result.state).toBe("partial");
    expect(result.leadStatuses).toBeNull();
    expect(result.cycleStatuses).toBeNull();
    expect(result.implementationStatuses).toEqual(["Coding"]);
    expect(result.diagnostics[0]).toContain("incomplete");
  });

  it("fails closed when unified and legacy status sets conflict", () => {
    const result = adaptLegacyWorkflowConfig(config({
      funnelStatuses: ["Ready"],
      activeStatuses: ["Doing"],
      implementingStatuses: ["Coding"],
      statusSets: { leadStatuses: ["Ready", "Doing"], cycleStatuses: ["Doing", "Coding"], implementationStatuses: ["Coding"] },
    } as TeamConfig["workflowConfig"]));
    expect(result.state).toBe("conflict");
    expect(result.leadStatuses).toBeNull();
    expect(result.diagnostics[0]).toContain("conflict");
  });

  it("keeps an absent mapping explicitly unknown", () => {
    expect(adaptLegacyWorkflowConfig(config())).toMatchObject({ state: "unknown", source: "unknown", leadStatuses: null, cycleStatuses: null, implementationStatuses: null });
  });

  it("wires production cards through the adapter and keeps the migrated surface truthful", () => {
    expect(appSource).toContain("getFlowPresentationValue(selectedTeamRow.current.flowTiming, \"cycle\")");
    expect(appSource).toContain("getFlowPresentationValue(selectedTeamRow.current.flowTiming, \"implementation\")");
    expect(appSource).toContain("SLE is the existing P85 of eligible completed Cycle Time observations");
    expect(appSource).not.toContain("eligible completed implementation-duration observations");
    expect(teamDetailSource).toContain("y-axis: Implementation Time in working days");
    expect(teamDetailSource).toContain("Implementation Time: {point.cycleTimeDays.toFixed(1)} working days");
    expect(teamDetailSource).not.toContain("y-axis: Cycle Time");
  });

  it("keeps every listed presentation path on the adapter and renames the old cycle distribution", () => {
    expect(appSource).toContain("formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, \"lead\")?.avgDays ?? null)");
    expect(appSource).toContain("formatWorkingDays(getFlowPresentationValue(row.current.flowTiming, \"lead\")?.avgDays ?? null)");
    expect(appSource).toContain("getFlowPresentationValue(row.current.flowTiming, \"cycle\")?.avgDays ?? null");
    expect(appSource).toContain("getFlowPresentationValue(row.current.flowTiming, \"implementation\")?.avgDays ?? null");
    expect(appSource).not.toContain("Cycle Time Distribution");
    expect(appSource).toContain('label: "Implementation Time Distribution"');
    expect(appSource).toContain('title: "Implementation Time Distribution"');
    expect(appSource).toContain("Implementation Time spread across short, normal and long-tail delivery bands.");
    expect(appSource).not.toContain("Cycle Time spread across short, normal and long-tail delivery bands.");
  });
});
