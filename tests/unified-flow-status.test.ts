import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyUnifiedFlowStatus,
  adaptLegacyWorkflowConfig,
  classifyWorkflowStatusForReport,
  normalizeUnifiedFlowStatusConfig,
  unifiedConfigFromLegacy,
  validateUnifiedFlowStatusConfig,
} from "../apps/sm-tool/src/lib/flow-presentation";
import { getMetricInsightDefinition } from "../apps/sm-tool/src/lib/metric-insights";
import type { TeamConfig } from "../apps/sm-tool/src/types/contracts";
import { buildFlowStatusClassifier } from "../apps/sm-tool/src/lib/metrics";

const metricsSource = readFileSync("apps/sm-tool/src/lib/metrics.ts", "utf8");
const appSource = readFileSync("apps/sm-tool/src/App.tsx", "utf8");
const trustSource = readFileSync("apps/sm-tool/src/lib/metric-trust.ts", "utf8");
const insightSource = readFileSync("apps/sm-tool/src/lib/metric-insights.ts", "utf8");

function teamConfig(): TeamConfig {
  return {
    teamName: "Fixture",
    doneConfig: { useStatusCategoryDone: true, doneStatuses: ["Done"] },
    sleConfig: { percentiles: [85], rounding: "ceil" },
    mapping: { key: "Key", created: "Created", resolutionDate: "Resolved", updated: "Updated", status: "Status", resolution: "Resolution" },
    workflowConfig: { funnelStatuses: ["Ready"], activeStatuses: ["Doing"], implementingStatuses: ["Build"] },
  };
}

describe("unified flow status contract", () => {
  it("normalizes identities and enforces nested roles with precedence", () => {
    const config = normalizeUnifiedFlowStatusConfig({
      leadStatuses: ["Ready", "Doing", "Build", "BUILD"],
      cycleStatuses: ["Doing", "Build"],
      implementationStatuses: ["Build"],
      doneStatuses: ["Done"],
    });
    expect(config?.leadStatuses).toEqual(["Ready", "Doing", "Build"]);
    expect(validateUnifiedFlowStatusConfig(config).state).toBe("valid");
    expect(classifyUnifiedFlowStatus("Done", config)).toBe("done");
    expect(classifyUnifiedFlowStatus("Build", config)).toBe("implementation");
    expect(classifyUnifiedFlowStatus("Doing", config)).toBe("cycle");
    expect(classifyUnifiedFlowStatus("Ready", config)).toBe("lead");
    expect(classifyUnifiedFlowStatus("Unknown", config)).toBe("unmapped");
  });

  it("fails closed for malformed, invalid nesting, and Done overlap", () => {
    expect(validateUnifiedFlowStatusConfig({ leadStatuses: [], cycleStatuses: [], implementationStatuses: [], doneStatuses: [] }).state).toBe("needs-review");
    expect(validateUnifiedFlowStatusConfig({ leadStatuses: ["Ready"], cycleStatuses: ["Build"], implementationStatuses: ["Build"], doneStatuses: ["Done"] }).state).toBe("needs-review");
    expect(validateUnifiedFlowStatusConfig({ leadStatuses: ["Ready"], cycleStatuses: [], implementationStatuses: ["Build"], doneStatuses: [] }).config).toBeNull();
    expect(validateUnifiedFlowStatusConfig({ leadStatuses: ["Ready"], cycleStatuses: [], implementationStatuses: [], doneStatuses: ["Ready"] }).errors.join(" ")).toContain("Done statuses");
    expect(normalizeUnifiedFlowStatusConfig({ leadStatuses: ["Ready"], cycleStatuses: [], implementationStatuses: [], doneStatuses: [4 as unknown as string] })).toBeNull();
  });

  it("keeps the exact legacy mapping and production classifier boundary", () => {
    expect(unifiedConfigFromLegacy(teamConfig())).toEqual({
      leadStatuses: ["Ready", "Doing", "Build"],
      cycleStatuses: ["Doing", "Build"],
      implementationStatuses: ["Build"],
      doneStatuses: ["Done"],
    });
    expect(metricsSource).toContain("validateUnifiedFlowStatusConfig");
    expect(metricsSource).toContain("classifyUnifiedFlowStatus");
    expect(appSource).toContain("const mapping = adaptLegacyWorkflowConfig(teamConfig);");
    expect(appSource).toContain("classifyUnifiedFlowStatus(statusName");
    expect(appSource).toContain("statusSets: unifiedValidation.config");
    expect(appSource).toContain("Confirm and save");
    expect(appSource).toContain("draftDisplayUnifiedStatusConfig");
    expect(appSource).toContain("const [unifiedStatusDraft, setUnifiedStatusDraft]");
    expect(appSource).toContain("mutateUnifiedStatusDraft");
    expect(appSource).not.toContain("setFunnelStatusesInput");
    expect(appSource).not.toContain("setSprintScopeStatusesInput");
    expect(appSource).not.toContain("setImplementingStatusesInput");
    expect(appSource).not.toContain("setDoneStatusesInput");
    expect(appSource).not.toContain('description: "Active + Implementing flow time to Done."');
    expect(appSource).not.toContain('description: "Implementing-to-Done flow time."');
    expect(trustSource).not.toContain("Active + Implementing durations to Done");
    expect(trustSource).not.toContain("Implementing durations to Done");
    expect(insightSource).toContain("Average working days through the Cycle Time flow before Implementation Time completes.");
    expect(insightSource).toContain('"Cycle Time": { metricId: "cycle-time", collection: "Local imported issue history and configured Cycle Time statuses."');
  });

  it("uses canonical-only mappings and includes terminal Done in the validated adapter", () => {
    const canonical: TeamConfig = {
      ...teamConfig(),
      workflowConfig: {
        statusSets: { leadStatuses: ["Ready", "Doing", "Build"], cycleStatuses: ["Doing", "Build"], implementationStatuses: ["Build"], doneStatuses: ["Done"] },
      },
    };
    expect(adaptLegacyWorkflowConfig(canonical)).toMatchObject({
      state: "complete",
      source: "unified",
      leadStatuses: ["Ready", "Doing", "Build"],
      cycleStatuses: ["Doing", "Build"],
      implementationStatuses: ["Build"],
      doneStatuses: ["Done"],
    });
  });

  it("keeps Cycle Time meaning canonical and backlog classification explicit", () => {
    const cycle = getMetricInsightDefinition("Cycle Time");
    expect(cycle.meaning).toContain("Cycle Time flow before Implementation Time completes");
    expect(cycle.source).toBe("Local flowTiming snapshot");
    expect(cycle.meaning).not.toContain("Active Time");
    expect(cycle.calculation).not.toContain("activeTime");
    const canonical: TeamConfig = {
      ...teamConfig(),
      workflowConfig: {
        backlogStatuses: ["Queued"],
        statusSets: { leadStatuses: ["Ready", "Build"], cycleStatuses: ["Build"], implementationStatuses: ["Build"], doneStatuses: ["Done"] },
      },
    };
    expect(classifyWorkflowStatusForReport("Queued", canonical)).toBe("backlog");
    expect(classifyWorkflowStatusForReport("Done", canonical)).toBe("done");
  });

  it("fails closed for malformed canonical Done and mixed legacy conflicts", () => {
    const invalid = adaptLegacyWorkflowConfig({
      ...teamConfig(),
      workflowConfig: {
        statusSets: { leadStatuses: ["Ready"], cycleStatuses: [], implementationStatuses: [], doneStatuses: ["Ready"] },
      },
    });
    expect(invalid.state).toBe("conflict");
    expect(invalid.doneStatuses).toBeNull();
    expect(invalid.diagnostics.join(" ")).toContain("conflict");

    const mixed = adaptLegacyWorkflowConfig({
      ...teamConfig(),
      workflowConfig: {
        funnelStatuses: ["Ready"], activeStatuses: ["Doing"], implementingStatuses: ["Build"],
        statusSets: { leadStatuses: ["Ready", "Doing", "Build"], cycleStatuses: ["Doing", "Build"], implementationStatuses: ["Build"], doneStatuses: ["Closed"] },
      },
    });
    expect(mixed.state).toBe("conflict");
    expect(mixed.leadStatuses).toBeNull();
    const classifier = buildFlowStatusClassifier(mixedTeamConfig());
    expect(classifier.isLead("Ready")).toBe(false);
    expect(classifier.isActive("Doing")).toBe(false);
  });

  function mixedTeamConfig(): TeamConfig {
    return {
      ...teamConfig(),
      workflowConfig: {
        funnelStatuses: ["Ready"], activeStatuses: ["Doing"], implementingStatuses: ["Build"],
        statusSets: { leadStatuses: ["Ready", "Doing"], cycleStatuses: ["Doing"], implementationStatuses: [], doneStatuses: ["Done"] },
      },
    };
  }

  it("keeps production workflow summaries and saves on the canonical adapter boundary", () => {
    expect(appSource).toContain("const executiveWorkflowMapping = adaptLegacyWorkflowConfig");
    expect(appSource).toContain("buildUnifiedFlowStatusConfigFromLegacyGroups");
    expect(appSource).toContain("statusSets: unifiedValidation.config");
    expect(appSource).toContain("Confirm and save");
    expect(appSource).toContain("No Implementation Time statuses configured.");
    expect(appSource).not.toContain("Add active status");
    expect(appSource).not.toContain("Add implementing status");
  });
});
