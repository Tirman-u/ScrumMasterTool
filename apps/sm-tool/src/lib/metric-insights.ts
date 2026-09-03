export type MetricInsightDirection = "higher" | "lower" | "categorical";

export interface MetricInsightDefinition {
  label: string;
  unit: string;
  direction: MetricInsightDirection;
  meaning: string;
  calculation: string;
}

const DEFINITIONS: Record<string, MetricInsightDefinition> = {
  "Stories Done": { label: "Stories Done", unit: "items", direction: "higher", meaning: "Completed items in the selected period.", calculation: "Count of items classified as done by the existing team configuration." },
  Throughput: { label: "Throughput", unit: "items / 30d", direction: "higher", meaning: "Completed items over the existing throughput window.", calculation: "Existing throughput count from imported Jira data; no new aggregation is applied here." },
  "Avg Cycle Time": { label: "Avg Cycle Time", unit: "working days", direction: "lower", meaning: "Average configured Cycle Time from implementation flow to Done.", calculation: "Existing flowTiming cycle-time average using Monday-Friday working days." },
  "SLE P85": { label: "SLE P85", unit: "working days", direction: "lower", meaning: "The duration within which 85% of valid completed items finished.", calculation: "Existing SLE P85 from the selected period and configured completed-item sample." },
  "Aging WIP": { label: "Aging WIP", unit: "working days", direction: "lower", meaning: "Average age of currently open work.", calculation: "Existing aging-WIP measure from imported open-item dates." },
  "Done Bug Ratio": { label: "Done Bug Ratio", unit: "%", direction: "lower", meaning: "Share of completed items classified as bugs.", calculation: "Existing completed-item bug count divided by completed-item count." },
  Velocity: { label: "Velocity", unit: "configured units", direction: "higher", meaning: "Existing team velocity measure for the selected period.", calculation: "Existing velocity configuration and snapshot; unit is not inferred or converted." },
  Bottleneck: { label: "Bottleneck", unit: "category", direction: "categorical", meaning: "The current queue or constraint category in the delivery flow.", calculation: "Existing Time in Status bottleneck diagnostic; categories are not treated as numeric values." },
  "Delivery Expectation": { label: "Delivery Expectation", unit: "working days", direction: "lower", meaning: "The team's current SLE P85 delivery expectation.", calculation: "Existing SLE P85 snapshot for the selected period." },
};

export function getMetricInsightDefinition(label: string): MetricInsightDefinition {
  return DEFINITIONS[label] ?? {
    label,
    unit: "existing metric unit",
    direction: "categorical",
    meaning: `${label} from the existing local metrics contract.`,
    calculation: "Existing persisted metric value; no additional calculation is performed by the insight view.",
  };
}

export function parseMetricPreviousValue(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function metricInsightDefinitions(): MetricInsightDefinition[] {
  return Object.values(DEFINITIONS);
}
