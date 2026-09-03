import type { FlowTimingMetric, FlowTimingMetrics, TeamConfig, UnifiedFlowStatusConfig } from "../types/contracts";

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
    definition: "Working days from upstream intake through Cycle Time and Implementation Time to Done.",
    unit: "working days",
    sourceMetric: "flowTiming.leadTime",
    direction: "lower-is-better",
  },
  {
    id: "cycle",
    label: "Cycle Time",
    legacyField: "activeTime",
    definition: "Working days through the configured Cycle Time flow and Implementation Time to Done.",
    unit: "working days",
    sourceMetric: "flowTiming.activeTime",
    direction: "lower-is-better",
  },
  {
    id: "implementation",
    label: "Implementation Time",
    legacyField: "cycleTime",
    definition: "Working days in configured Implementation Time statuses before Done.",
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

export type UnifiedFlowStatusState = "valid" | "needs-review";

export interface UnifiedFlowStatusValidation {
  config: UnifiedFlowStatusConfig | null;
  state: UnifiedFlowStatusState;
  errors: string[];
}

export type FlowStatusRole = "lead" | "cycle" | "implementation" | "done" | "unmapped";

export function normalizeStatusIdentities(values: unknown): string[] | null {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) return null;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase();
    if (normalized && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}

export function normalizeUnifiedFlowStatusConfig(input: Partial<UnifiedFlowStatusConfig> | null | undefined): UnifiedFlowStatusConfig | null {
  if (!input) return null;
  const leadStatuses = normalizeStatusIdentities(input.leadStatuses);
  const cycleStatuses = normalizeStatusIdentities(input.cycleStatuses);
  const implementationStatuses = normalizeStatusIdentities(input.implementationStatuses);
  const doneStatuses = normalizeStatusIdentities(input.doneStatuses);
  if (!leadStatuses || !cycleStatuses || !implementationStatuses || !doneStatuses) return null;
  return { leadStatuses, cycleStatuses, implementationStatuses, doneStatuses };
}

export function validateUnifiedFlowStatusConfig(input: Partial<UnifiedFlowStatusConfig> | null | undefined): UnifiedFlowStatusValidation {
  const config = normalizeUnifiedFlowStatusConfig(input);
  if (!config) return { config: null, state: "needs-review", errors: ["Status mapping is malformed or incomplete."] };
  const lead = new Set(config.leadStatuses.map((status) => status.toLocaleLowerCase()));
  const cycle = new Set(config.cycleStatuses.map((status) => status.toLocaleLowerCase()));
  const implementation = new Set(config.implementationStatuses.map((status) => status.toLocaleLowerCase()));
  const done = new Set(config.doneStatuses.map((status) => status.toLocaleLowerCase()));
  const errors: string[] = [];
  if (config.leadStatuses.length === 0) errors.push("Lead Time must contain at least one status.");
  if (config.cycleStatuses.length === 0) errors.push("Cycle Time must contain at least one status.");
  if (config.implementationStatuses.length === 0) errors.push("Implementation Time must contain at least one status.");
  if (config.doneStatuses.length === 0) errors.push("Done must contain at least one terminal status.");
  if ([...implementation].some((status) => !cycle.has(status))) errors.push("Implementation Time must be contained within Cycle Time.");
  if ([...cycle].some((status) => !lead.has(status))) errors.push("Cycle Time must be contained within Lead Time.");
  if ([...done].some((status) => lead.has(status) || cycle.has(status) || implementation.has(status))) errors.push("Done statuses are terminal and excluded from duration roles.");
  return { config: errors.length === 0 ? config : null, state: errors.length === 0 ? "valid" : "needs-review", errors };
}

export function classifyUnifiedFlowStatus(status: string, config: UnifiedFlowStatusConfig | null): FlowStatusRole {
  if (!config) return "unmapped";
  const key = status.trim().toLocaleLowerCase();
  const done = new Set(config.doneStatuses.map((value) => value.toLocaleLowerCase()));
  const implementation = new Set(config.implementationStatuses.map((value) => value.toLocaleLowerCase()));
  const cycle = new Set(config.cycleStatuses.map((value) => value.toLocaleLowerCase()));
  const lead = new Set(config.leadStatuses.map((value) => value.toLocaleLowerCase()));
  if (done.has(key)) return "done";
  if (implementation.has(key)) return "implementation";
  if (cycle.has(key)) return "cycle";
  if (lead.has(key)) return "lead";
  return "unmapped";
}

export function unifiedConfigFromLegacy(config: TeamConfig | undefined): UnifiedFlowStatusConfig | null {
  const workflow = config?.workflowConfig;
  const funnel = normalizeStatusIdentities(workflow?.funnelStatuses);
  const active = normalizeStatusIdentities(workflow?.activeStatuses);
  const implementation = normalizeStatusIdentities(workflow?.implementingStatuses);
  const done = normalizeStatusIdentities(config?.doneConfig.doneStatuses) ?? [];
  if (!funnel || !active || !implementation) return null;
  return {
    leadStatuses: normalizeStatusIdentities([...funnel, ...active, ...implementation]) ?? [],
    cycleStatuses: normalizeStatusIdentities([...active, ...implementation]) ?? [],
    implementationStatuses: implementation,
    doneStatuses: done,
  };
}

export interface FlowStatusMapping {
  leadStatuses: string[] | null;
  cycleStatuses: string[] | null;
  implementationStatuses: string[] | null;
  doneStatuses: string[] | null;
  state: StatusMappingState;
  source: StatusMappingSource;
  diagnostics: string[];
}

export type ReportFlowStatusRole = FlowStatusRole | "backlog";

export interface WorkflowCompatibilityBuckets {
  /** Legacy backlog statuses are excluded from canonical duration roles. */
  excludedStatuses: string[];
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

function deriveLegacyMapping(config: WorkflowConfigWithUnifiedSets | undefined, doneStatuses: string[] | undefined): {
  mapping: Omit<FlowStatusMapping, "state" | "source" | "diagnostics">;
  complete: boolean;
} {
  const funnel = normalizeStatuses(config?.funnelStatuses);
  const active = normalizeStatuses(config?.activeStatuses);
  const implementing = normalizeStatuses(config?.implementingStatuses);
  const done = normalizeStatuses(doneStatuses) ?? [];
  return {
    mapping: {
      leadStatuses: funnel && active && implementing ? [...funnel, ...active, ...implementing] : null,
      cycleStatuses: active && implementing ? [...active, ...implementing] : null,
      implementationStatuses: implementing,
      doneStatuses: done,
    },
    complete: funnel !== null && active !== null && implementing !== null,
  };
}

export function buildUnifiedFlowStatusConfigFromLegacyGroups(input: {
  funnelStatuses?: string[];
  activeStatuses?: string[];
  implementingStatuses?: string[];
  doneStatuses?: string[];
}): UnifiedFlowStatusValidation {
  return validateUnifiedFlowStatusConfig({
    leadStatuses: [...(input.funnelStatuses ?? []), ...(input.activeStatuses ?? []), ...(input.implementingStatuses ?? [])],
    cycleStatuses: [...(input.activeStatuses ?? []), ...(input.implementingStatuses ?? [])],
    implementationStatuses: input.implementingStatuses ?? [],
    doneStatuses: input.doneStatuses ?? [],
  });
}

export function legacyGroupsFromUnifiedFlowStatusConfig(config: UnifiedFlowStatusConfig): {
  funnelStatuses: string[];
  activeStatuses: string[];
  implementingStatuses: string[];
} {
  const implementation = new Set(config.implementationStatuses.map((value) => value.toLocaleLowerCase()));
  const cycle = new Set(config.cycleStatuses.map((value) => value.toLocaleLowerCase()));
  return {
    funnelStatuses: config.leadStatuses.filter((value) => !cycle.has(value.toLocaleLowerCase())),
    activeStatuses: config.cycleStatuses.filter((value) => !implementation.has(value.toLocaleLowerCase())),
    implementingStatuses: [...config.implementationStatuses],
  };
}

export function adaptLegacyWorkflowConfig(config?: TeamConfig): FlowStatusMapping {
  const workflow = config?.workflowConfig as WorkflowConfigWithUnifiedSets | undefined;
  const unified = workflow?.statusSets;
  const legacy = deriveLegacyMapping(workflow, config?.doneConfig.doneStatuses);
  const diagnostics: string[] = [];

  if (unified !== undefined) {
    const validation = validateUnifiedFlowStatusConfig({
      ...unified,
      doneStatuses: unified.doneStatuses ?? config?.doneConfig.doneStatuses ?? [],
    });
    const normalizedUnified = validation.config;
    const legacyPresent = workflow?.funnelStatuses !== undefined || workflow?.activeStatuses !== undefined || workflow?.implementingStatuses !== undefined;
    const conflicts = legacyPresent && (
      !sameStatusSet(legacy.mapping.leadStatuses, normalizedUnified?.leadStatuses ?? null) ||
      !sameStatusSet(legacy.mapping.cycleStatuses, normalizedUnified?.cycleStatuses ?? null) ||
      !sameStatusSet(legacy.mapping.implementationStatuses, normalizedUnified?.implementationStatuses ?? null)
    );
    const doneConflict = config?.doneConfig.doneStatuses !== undefined && !sameStatusSet(legacy.mapping.doneStatuses, normalizedUnified?.doneStatuses ?? null);
    if (validation.state !== "valid") {
      diagnostics.push("Unified status mapping conflict: " + validation.errors.join(" "));
      diagnostics.push("Unified status mapping is invalid; metrics and reports are unavailable until roles are corrected.");
      return { leadStatuses: null, cycleStatuses: null, implementationStatuses: null, doneStatuses: null, state: "conflict", source: legacyPresent ? "legacy+unified" : "unified", diagnostics };
    }
    if (conflicts || doneConflict) {
      diagnostics.push("Unified and legacy status mappings conflict; metric comparability is not proven.");
      return { leadStatuses: null, cycleStatuses: null, implementationStatuses: null, doneStatuses: null, state: "conflict", source: "legacy+unified", diagnostics };
    }
    if (normalizedUnified) {
      diagnostics.push("Unified status mapping is authoritative; legacy fields remain readable.");
      return { ...normalizedUnified, state: "complete", source: legacyPresent ? "legacy+unified" : "unified", diagnostics };
    }
  }

  if (!legacy.complete) {
    if (workflow?.funnelStatuses !== undefined || workflow?.activeStatuses !== undefined || workflow?.implementingStatuses !== undefined) {
      diagnostics.push("Legacy status mapping is incomplete; affected metrics are unavailable.");
      return { ...legacy.mapping, state: "partial", source: "legacy", diagnostics };
    }
    diagnostics.push("No status mapping is available to verify flow metric semantics.");
    return { leadStatuses: null, cycleStatuses: null, implementationStatuses: null, doneStatuses: null, state: "unknown", source: "unknown", diagnostics };
  }
  const legacyCanonical = unifiedConfigFromLegacy(config);
  const legacyValidation = validateUnifiedFlowStatusConfig(legacyCanonical);
  if (legacyValidation.state !== "valid" || !legacyValidation.config) {
    diagnostics.push("Legacy status mapping conflict: canonical role nesting or terminal Done exclusion is invalid.");
    return { leadStatuses: null, cycleStatuses: null, implementationStatuses: null, doneStatuses: null, state: "conflict", source: "legacy", diagnostics };
  }
  diagnostics.push("Legacy status mapping was read without changing persisted configuration.");
  return { ...legacyValidation.config, state: "complete", source: "legacy", diagnostics };
}

export function classifyWorkflowStatusForReport(status: string, config?: TeamConfig): ReportFlowStatusRole {
  const mapping = adaptLegacyWorkflowConfig(config);
  if (mapping.state !== "complete") return "unmapped";
  // backlogStatuses is a legacy compatibility input. It is an excluded/unmapped
  // reporting bucket, not a second canonical flow role decision.
  const excluded = new Set(getWorkflowCompatibilityBuckets(config).excludedStatuses.map((value) => value.toLocaleLowerCase()));
  if (excluded.has(status.trim().toLocaleLowerCase())) return "backlog";
  return classifyUnifiedFlowStatus(status, {
    leadStatuses: mapping.leadStatuses ?? [],
    cycleStatuses: mapping.cycleStatuses ?? [],
    implementationStatuses: mapping.implementationStatuses ?? [],
    doneStatuses: mapping.doneStatuses ?? [],
  });
}

export function validatedWorkflowStatusOrder(config?: TeamConfig): string[] {
  const mapping = adaptLegacyWorkflowConfig(config);
  if (mapping.state !== "complete") return [];
  const compatibility = getWorkflowCompatibilityBuckets(config);
  return [
    ...compatibility.excludedStatuses,
    ...(mapping.leadStatuses ?? []),
    ...(mapping.doneStatuses ?? []),
  ];
}

/** Convert legacy backlog input into the single excluded compatibility bucket. */
export function getWorkflowCompatibilityBuckets(config?: TeamConfig): WorkflowCompatibilityBuckets {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of config?.workflowConfig?.backlogStatuses ?? []) {
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return { excludedStatuses: result };
}

export function hasExplicitWorkflowStatusConfiguration(config?: TeamConfig): boolean {
  const workflow = config?.workflowConfig;
  return Boolean(workflow && (
    workflow.statusSets !== undefined ||
    (workflow.funnelStatuses?.length ?? 0) > 0 ||
    (workflow.activeStatuses?.length ?? 0) > 0 ||
    (workflow.implementingStatuses?.length ?? 0) > 0 ||
    (workflow.backlogStatuses?.length ?? 0) > 0
  ));
}
