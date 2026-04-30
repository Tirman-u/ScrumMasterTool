import { type SafeConfig, type SafeEntityType, type SafeMetricId } from "../types/contracts";

export type SafeMetricDomain = "Outcomes" | "Flow" | "Competency";
export type SafeMetricSupport = "supported" | "partial" | "external";

export interface SafeMetricDefinition {
  id: SafeMetricId;
  domain: SafeMetricDomain;
  label: string;
  description: string;
  support: SafeMetricSupport;
  mappedMetrics: string[];
  note?: string;
}

export const SAFE_ENTITY_LABELS: Record<SafeEntityType, string> = {
  team: "Agile Team",
  "agile-release-train": "Agile Release Train",
  "development-value-stream": "Development Value Stream",
  "operational-value-stream": "Operational Value Stream",
  "solution-train": "Solution Train",
  portfolio: "Portfolio",
};

export const SAFE_METRIC_CATALOG: Record<SafeMetricId, SafeMetricDefinition> = {
  "business-outcomes": {
    id: "business-outcomes",
    domain: "Outcomes",
    label: "Business Outcomes",
    description: "Value-stream or solution level business result measures tied to OKRs or KPIs.",
    support: "external",
    mappedMetrics: [],
    note: "Needs business KPI or OKR feed outside Jira CSV imports.",
  },
  "flow-time": {
    id: "flow-time",
    domain: "Flow",
    label: "Flow Time",
    description: "Elapsed time from work start to completion for a work item.",
    support: "supported",
    mappedMetrics: ["SLE P85", "Avg Cycle Time", "Lead Time by Type"],
  },
  "flow-velocity": {
    id: "flow-velocity",
    domain: "Flow",
    label: "Flow Velocity",
    description: "Completed work items over a given period.",
    support: "supported",
    mappedMetrics: ["Stories Done", "Velocity", "Throughput"],
  },
  "flow-load": {
    id: "flow-load",
    domain: "Flow",
    label: "Flow Load",
    description: "Number of work items currently in progress or waiting.",
    support: "supported",
    mappedMetrics: ["Aging WIP", "WIP Age Risk", "Forecast Backlog"],
  },
  "flow-efficiency": {
    id: "flow-efficiency",
    domain: "Flow",
    label: "Flow Efficiency",
    description: "Share of total flow time spent in value-adding work.",
    support: "supported",
    mappedMetrics: ["Flow Efficiency", "Queue Time by Status", "Bottleneck"],
  },
  "flow-predictability": {
    id: "flow-predictability",
    domain: "Flow",
    label: "Flow Predictability",
    description: "How consistently teams and trains meet commitments.",
    support: "supported",
    mappedMetrics: ["Throughput Stability", "Sprint Predictability", "Forecast"],
  },
  "flow-distribution": {
    id: "flow-distribution",
    domain: "Flow",
    label: "Flow Distribution",
    description: "Proportion of work item types moving through the system.",
    support: "partial",
    mappedMetrics: ["Done Issue Type Mix", "Lead Time by Type"],
    note: "Derived from Jira issue types; stronger if your Jira taxonomy matches SAFe work item types.",
  },
  "art-predictability": {
    id: "art-predictability",
    domain: "Outcomes",
    label: "ART Predictability Measure",
    description: "PI-level commitment versus actual business value delivered by an ART.",
    support: "external",
    mappedMetrics: [],
    note: "Needs PI objective commitment and actual business value input, which current CSV imports do not contain.",
  },
  "built-in-quality": {
    id: "built-in-quality",
    domain: "Competency",
    label: "Built-In Quality",
    description: "Quality signals that show whether teams are building quality in continuously.",
    support: "partial",
    mappedMetrics: ["Done Bug Ratio", "Sprint Predictability", "Queue Time by Status"],
    note: "Useful proxy only; full SAFe quality view also needs test automation and defect escape metrics.",
  },
  "competency-assessment": {
    id: "competency-assessment",
    domain: "Competency",
    label: "Competency Assessment",
    description: "Measure and Grow assessment for team, train, or enterprise capability maturity.",
    support: "external",
    mappedMetrics: [],
    note: "Requires manual assessment data from SAFe Measure and Grow, not Jira delivery data alone.",
  },
  "employee-engagement": {
    id: "employee-engagement",
    domain: "Outcomes",
    label: "Employee Engagement",
    description: "People and culture signal used in SAFe outcomes-oriented improvement.",
    support: "external",
    mappedMetrics: [],
    note: "Needs survey or HR feedback source outside the current tool.",
  },
};

const ENTITY_METRICS: Record<SafeEntityType, SafeMetricId[]> = {
  team: [
    "flow-time",
    "flow-velocity",
    "flow-load",
    "flow-efficiency",
    "flow-predictability",
    "flow-distribution",
    "built-in-quality",
    "competency-assessment",
  ],
  "agile-release-train": [
    "business-outcomes",
    "flow-time",
    "flow-velocity",
    "flow-load",
    "flow-efficiency",
    "flow-predictability",
    "flow-distribution",
    "art-predictability",
    "built-in-quality",
    "competency-assessment",
    "employee-engagement",
  ],
  "development-value-stream": [
    "business-outcomes",
    "flow-time",
    "flow-velocity",
    "flow-load",
    "flow-efficiency",
    "flow-predictability",
    "flow-distribution",
    "art-predictability",
    "competency-assessment",
    "employee-engagement",
  ],
  "operational-value-stream": [
    "business-outcomes",
    "flow-time",
    "flow-velocity",
    "flow-load",
    "flow-efficiency",
    "flow-predictability",
    "flow-distribution",
    "competency-assessment",
    "employee-engagement",
  ],
  "solution-train": [
    "business-outcomes",
    "flow-time",
    "flow-velocity",
    "flow-load",
    "flow-efficiency",
    "flow-predictability",
    "art-predictability",
    "competency-assessment",
    "employee-engagement",
  ],
  portfolio: [
    "business-outcomes",
    "flow-time",
    "flow-velocity",
    "flow-load",
    "flow-efficiency",
    "flow-predictability",
    "art-predictability",
    "competency-assessment",
    "employee-engagement",
  ],
};

const SAFE_METRIC_IDS = new Set<SafeMetricId>(Object.keys(SAFE_METRIC_CATALOG) as SafeMetricId[]);

export function normalizeSafeMetricIds(
  metricIds: SafeMetricId[] | undefined,
  entityType: SafeEntityType,
): SafeMetricId[] {
  const source = Array.isArray(metricIds) && metricIds.length > 0 ? metricIds : ENTITY_METRICS[entityType];
  const seen = new Set<SafeMetricId>();
  const normalized: SafeMetricId[] = [];

  source.forEach((metricId) => {
    if (!SAFE_METRIC_IDS.has(metricId) || seen.has(metricId)) {
      return;
    }

    seen.add(metricId);
    normalized.push(metricId);
  });

  return normalized.length > 0 ? normalized : [...ENTITY_METRICS[entityType]];
}

export function buildSafeConfigForEntityType(
  entityType: SafeEntityType,
  current?: SafeConfig,
): SafeConfig {
  const normalized = normalizeSafeConfig(current);

  return {
    ...normalized,
    entityType,
    metricIds: [...ENTITY_METRICS[entityType]],
  };
}

export function normalizeSafeConfig(config: SafeConfig | undefined): SafeConfig {
  const entityType = isSafeEntityType(config?.entityType) ? config.entityType : "team";

  return {
    enabled: Boolean(config?.enabled),
    entityType,
    metricIds: normalizeSafeMetricIds(config?.metricIds, entityType),
  };
}

export function getSafeMetricDefinitions(config: SafeConfig | undefined): SafeMetricDefinition[] {
  const normalized = normalizeSafeConfig(config);
  const metricIds = Array.isArray(normalized.metricIds) ? normalized.metricIds : [];

  return metricIds
    .map((metricId) => SAFE_METRIC_CATALOG[metricId])
    .filter((metric): metric is SafeMetricDefinition => Boolean(metric));
}

function isSafeEntityType(value: SafeConfig["entityType"] | undefined): value is SafeEntityType {
  return typeof value === "string" && value in ENTITY_METRICS;
}
