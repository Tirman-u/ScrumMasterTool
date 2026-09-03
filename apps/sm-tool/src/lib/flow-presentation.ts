import type { FlowTimingMetric, FlowTimingMetrics, TeamConfig } from "../types/contracts";

export type FlowPresentationMetricId = "lead" | "cycle" | "implementation";

export interface FlowPresentationMetric {
  id: FlowPresentationMetricId;
  label: "Lead Time" | "Cycle Time" | "Implementation Time";
  legacyField: keyof FlowTimingMetrics;
  definition: string;
  unit: "working days";
  sourceMetric: string;
  direction: "lower-is-better";
}

export const FLOW_PRESENTATION_METRICS: readonly FlowPresentationMetric[] = [
  {
    id: "lead",
    label: "Lead Time",
    legacyField: "leadTime",
    definition: "Working days from Funnel entry through Active and Implementing to Done.",
    unit: "working days",
    sourceMetric: "flowTiming.leadTime",
    direction: "lower-is-better",
  },
  {
    id: "cycle",
    label: "Cycle Time",
    legacyField: "activeTime",
    definition: "Working days from the configured active flow through Active and Implementing to Done.",
    unit: "working days",
    sourceMetric: "flowTiming.activeTime",
    direction: "lower-is-better",
  },
  {
    id: "implementation",
    label: "Implementation Time",
    legacyField: "cycleTime",
    definition: "Working days in Implementing statuses before Done.",
    unit: "working days",
    sourceMetric: "flowTiming.cycleTime",
    direction: "lower-is-better",
  },
];

export type FlowPresentationValue = {
  metric: FlowPresentationMetric;
  value: FlowTimingMetric;
};

export function mapFlowTimingPresentation(flowTiming: FlowTimingMetrics): FlowPresentationValue[] {
  return FLOW_PRESENTATION_METRICS.map((metric) => ({ metric, value: flowTiming[metric.legacyField] }));
}

export type StatusMappingState = "complete" | "partial" | "conflict" | "unknown";
export type StatusMappingSource = "unified" | "legacy" | "legacy+unified" | "unknown";

export interface UnifiedStatusSets {
  leadStatuses?: string[];
  cycleStatuses?: string[];
  implementationStatuses?: string[];
}

export interface FlowStatusMapping {
  leadStatuses: string[] | null;
  cycleStatuses: string[] | null;
  implementationStatuses: string[] | null;
  state: StatusMappingState;
  source: StatusMappingSource;
  diagnostics: string[];
}

type WorkflowConfigWithUnifiedSets = NonNullable<TeamConfig["workflowConfig"]> & {
  statusSets?: UnifiedStatusSets;
};

function normalizeStatuses(statuses: string[] | undefined): string[] | null {
  if (!Array.isArray(statuses)) return null;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const status of statuses) {
    const normalized = status.trim();
    const key = normalized.toLocaleLowerCase();
    if (normalized && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result.length > 0 ? result : null;
}

function sameStatusSet(left: string[] | null, right: string[] | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.length !== right.length) return false;
  const rightKeys = new Set(right.map((value) => value.toLocaleLowerCase()));
  return left.every((value) => rightKeys.has(value.toLocaleLowerCase()));
}

function deriveLegacyMapping(config: WorkflowConfigWithUnifiedSets | undefined): {
  mapping: Omit<FlowStatusMapping, "state" | "source" | "diagnostics">;
  complete: boolean;
} {
  const funnel = normalizeStatuses(config?.funnelStatuses);
  const active = normalizeStatuses(config?.activeStatuses);
  const implementing = normalizeStatuses(config?.implementingStatuses);
  return {
    mapping: {
      leadStatuses: funnel && active && implementing ? [...funnel, ...active, ...implementing] : null,
      cycleStatuses: active && implementing ? [...active, ...implementing] : null,
      implementationStatuses: implementing,
    },
    complete: funnel !== null && active !== null && implementing !== null,
  };
}

export function adaptLegacyWorkflowConfig(config?: TeamConfig): FlowStatusMapping {
  const workflow = config?.workflowConfig as WorkflowConfigWithUnifiedSets | undefined;
  const unified = workflow?.statusSets;
  const legacy = deriveLegacyMapping(workflow);
  const normalizedUnified = unified
    ? {
        leadStatuses: normalizeStatuses(unified.leadStatuses),
        cycleStatuses: normalizeStatuses(unified.cycleStatuses),
        implementationStatuses: normalizeStatuses(unified.implementationStatuses),
      }
    : null;
  const diagnostics: string[] = [];

  if (normalizedUnified) {
    const unifiedComplete = Object.values(normalizedUnified).every((value) => value !== null);
    const legacyPresent = workflow?.funnelStatuses !== undefined || workflow?.activeStatuses !== undefined || workflow?.implementingStatuses !== undefined;
    const conflicts = legacyPresent && (
      !sameStatusSet(legacy.mapping.leadStatuses, normalizedUnified.leadStatuses) ||
      !sameStatusSet(legacy.mapping.cycleStatuses, normalizedUnified.cycleStatuses) ||
      !sameStatusSet(legacy.mapping.implementationStatuses, normalizedUnified.implementationStatuses)
    );
    if (conflicts) {
      diagnostics.push("Unified and legacy status mappings conflict; metric comparability is not proven.");
      return { leadStatuses: null, cycleStatuses: null, implementationStatuses: null, state: "conflict", source: "legacy+unified", diagnostics };
    }
    if (unifiedComplete) {
      diagnostics.push("Unified status mapping is authoritative; legacy fields remain readable.");
      return { ...normalizedUnified, state: "complete", source: legacyPresent ? "legacy+unified" : "unified", diagnostics };
    }
    diagnostics.push("Unified status mapping is incomplete; affected metrics are unavailable until roles are defined.");
    return { ...normalizedUnified, state: "partial", source: legacyPresent ? "legacy+unified" : "unified", diagnostics };
  }

  if (!legacy.complete) {
    if (workflow?.funnelStatuses !== undefined || workflow?.activeStatuses !== undefined || workflow?.implementingStatuses !== undefined) {
      diagnostics.push("Legacy status mapping is incomplete; affected metrics are unavailable.");
      return { ...legacy.mapping, state: "partial", source: "legacy", diagnostics };
    }
    diagnostics.push("No status mapping is available to verify flow metric semantics.");
    return { leadStatuses: null, cycleStatuses: null, implementationStatuses: null, state: "unknown", source: "unknown", diagnostics };
  }
  diagnostics.push("Legacy status mapping was read without changing persisted configuration.");
  return { ...legacy.mapping, state: "complete", source: "legacy", diagnostics };
}
