export type MetricInsightDirection = "higher" | "lower" | "categorical";

export interface MetricInsightDefinition {
  metricId?: string;
  label: string;
  unit: string;
  direction: MetricInsightDirection;
  meaning: string;
  calculation: string;
  collection?: string;
  source?: string;
  unavailable?: string;
  teamDetail?: string;
  diagnosticDetail?: string;
  compatibilityNote?: string;
}

const DEFINITIONS: Record<string, MetricInsightDefinition> = {
  "Stories Done": { label: "Stories Done", unit: "items", direction: "higher", meaning: "Completed items in the selected period.", calculation: "Count of items classified as done by the existing team configuration." },
  Throughput: { label: "Throughput", unit: "items / 30d", direction: "higher", meaning: "Completed items over the existing throughput window.", calculation: "Existing throughput count from imported Jira data; no new aggregation is applied here." },
  "Avg Implementation Time": { label: "Avg Implementation Time", unit: "working days", direction: "lower", meaning: "Average Implementation Time from the implementation flow to Done.", calculation: "Existing flowTiming cycle-time average using Monday-Friday working days." },
  "Avg Cycle Time": { label: "Avg Cycle Time", unit: "working days", direction: "lower", meaning: "Average Cycle Time through the configured delivery flow to Done.", calculation: "Average working days through the configured Cycle Time flow, measured Monday-Friday." },
  "SLE P85": { label: "SLE P85", unit: "working days", direction: "lower", meaning: "The duration within which 85% of valid completed items finished.", calculation: "Existing SLE P85 from the selected period and configured completed-item sample." },
  "Aging WIP": { label: "Aging WIP", unit: "working days", direction: "lower", meaning: "Average age of currently open work.", calculation: "Existing aging-WIP measure from imported open-item dates." },
  "Done Bug Ratio": { label: "Done Bug Ratio", unit: "%", direction: "lower", meaning: "Share of completed items classified as bugs.", calculation: "Existing completed-item bug count divided by completed-item count." },
  Velocity: { label: "Velocity", unit: "configured units", direction: "higher", meaning: "Existing team velocity measure for the selected period.", calculation: "Existing velocity configuration and snapshot; unit is not inferred or converted." },
  Bottleneck: { label: "Bottleneck", unit: "category", direction: "categorical", meaning: "The current queue or constraint category in the delivery flow.", calculation: "Existing Time in Status bottleneck diagnostic; categories are not treated as numeric values." },
  "Delivery Expectation": { label: "Delivery Expectation", unit: "working days", direction: "lower", meaning: "The team's current SLE P85 delivery expectation.", calculation: "Existing SLE P85 snapshot for the selected period." },
};

const DEFINITION_DETAILS: Record<string, Pick<MetricInsightDefinition, "metricId" | "collection" | "source" | "unavailable" | "teamDetail" | "diagnosticDetail" | "compatibilityNote">> = {
  "Stories Done": { metricId: "stories-done", collection: "Local imported issue data and the configured Done statuses.", source: "Local imported issue snapshot", unavailable: "Unavailable · no valid completed-item value exists for the selected period.", teamDetail: "Output volume, read with scope and quality context.", diagnosticDetail: "Selected-period completed-item count from the existing issue snapshot." },
  Throughput: { metricId: "throughput", collection: "Local imported issue data and the existing throughput snapshot.", source: "Local throughput snapshot", unavailable: "Unavailable · the existing throughput snapshot has no valid value for this period.", teamDetail: "Recent delivery volume, interpreted with scope and quality context.", diagnosticDetail: "Existing throughput window and period boundary; no Jira request is made." },
  "Avg Implementation Time": { metricId: "avg-implementation-time", collection: "Local imported issue history and status-transition snapshot.", source: "Local flowTiming snapshot", unavailable: "Unavailable · no valid Implementation Time average exists for the selected period.", teamDetail: "Shorter implementation time is generally better.", diagnosticDetail: "Existing flowTiming sample and Monday-Friday working-day calculation." },
  "Avg Cycle Time": { metricId: "avg-cycle-time", collection: "Local imported issue history and configured Implementation Time statuses.", source: "Local flowTiming snapshot", unavailable: "Unavailable · no valid Implementation Time value exists for the selected period.", teamDetail: "Shorter Implementation Time is generally better.", diagnosticDetail: "The selected card uses the existing Implementation Time presentation contract." },
  "SLE P85": { metricId: "sle-p85", collection: "Local Cycle Time and completed-item snapshot.", source: "Local SLE snapshot", unavailable: "Unavailable · there are not enough valid completed Cycle Time observations for SLE P85.", teamDetail: "A working-day delivery expectation, not a target line.", diagnosticDetail: "Existing P85 percentile and working-day basis; no P50 or special target is introduced." },
  "Aging WIP": { metricId: "aging-wip", collection: "Local imported open-item data and existing age calculation.", source: "Local open-work snapshot", unavailable: "Unavailable · no valid open-item age value exists for the selected period.", teamDetail: "Lower age usually means less delivery risk.", diagnosticDetail: "Existing open-item population and age fields; unknown counts remain unknown." },
  "Done Bug Ratio": { metricId: "done-bug-ratio", collection: "Local imported issue types and completed-item snapshot.", source: "Local issue-type snapshot", unavailable: "Unavailable · no valid completed-item denominator exists for this period.", teamDetail: "A lower share generally means less bug rework in completed output.", diagnosticDetail: "Existing issue-type mapping and completed-item denominator; missing is not zero." },
  Velocity: { metricId: "velocity", collection: "Local period snapshot and the configured velocity mode.", source: "Local velocity snapshot", unavailable: "Unavailable · the configured velocity source has no valid value for this period.", teamDetail: "Higher delivery volume is useful only with stable quality and aging.", diagnosticDetail: "Configured velocity mode and unit remain authoritative; no alternative formula is introduced." },
  Bottleneck: { metricId: "bottleneck", collection: "Local Time in Status bottleneck diagnostic.", source: "Local Time in Status diagnostic", unavailable: "Unavailable · no valid bottleneck category exists for the selected period.", teamDetail: "A category to discuss, not a ranked numeric score.", diagnosticDetail: "Category and supporting status data remain separate from additive flow metrics." },
  "Delivery Expectation": { metricId: "delivery-expectation", collection: "Local Cycle Time and SLE snapshot.", source: "Local SLE snapshot", unavailable: "Unavailable · the selected period has no valid SLE P85 expectation.", teamDetail: "An existing expectation in working days, not a target trendline.", diagnosticDetail: "Existing SLE sample and P85 remain authoritative." },
  "Lead Time": { metricId: "lead-time", collection: "Local imported issue history and configured workflow statuses.", source: "Local flowTiming snapshot", unavailable: "Unavailable · no valid Lead Time value exists for the selected period.", teamDetail: "Shorter end-to-end flow is generally better.", diagnosticDetail: "Existing Lead Time sample, percentile detail, and workflow configuration remain authoritative." },
  "Work Past Expectation": { metricId: "work-past-expectation", collection: "Local open-item and existing SLE snapshots.", source: "Local open-work/SLE snapshot", unavailable: "Unavailable · the existing open-work or SLE prerequisite is unavailable.", teamDetail: "An aging-risk indicator, not a new percentile calculation.", diagnosticDetail: "Existing at-risk count and threshold are retained." },
  "Completion Rate": { metricId: "completion-rate", collection: "Local imported issue data and existing throughput snapshot.", source: "Local throughput snapshot", unavailable: "Unavailable · no valid recent completion value exists.", teamDetail: "Recent output rate with period and scope context.", diagnosticDetail: "Uses the existing throughput value supplied by App." },
  "Cycle Time": { metricId: "cycle-time", collection: "Local imported issue history and configured Cycle Time statuses.", source: "Local flowTiming snapshot", unavailable: "Unavailable · no valid Cycle Time value exists for the selected period.", teamDetail: "Shorter Cycle Time is generally better.", diagnosticDetail: "Current Cycle Time uses the approved existing flow-time definition.", compatibilityNote: "Compatibility mapping: this canonical Cycle Time value retains the existing activeTime calculation across Active + Implementing statuses." },
  "SLE Compliance": { metricId: "sle-compliance", collection: "Local completed-item and SLE snapshots.", source: "Local SLE health snapshot", unavailable: "Unavailable · the existing SLE compliance prerequisites are unavailable.", teamDetail: "A health signal interpreted with sample context.", diagnosticDetail: "Existing compliance result and denominator are unchanged." },
  "Open Tickets": { metricId: "open-tickets", collection: "Local imported issue data and existing WIP snapshot.", source: "Local open-work snapshot", unavailable: "Unavailable · the existing open-item count is not available.", teamDetail: "Open scope should be read with age and delivery context.", diagnosticDetail: "Existing WIP population; missing data is not substituted with zero." },
  "Oldest Ticket": { metricId: "oldest-ticket", collection: "Local imported open-item data.", source: "Local open-work snapshot", unavailable: "Unavailable · no valid oldest open item is available.", teamDetail: "Existing item context for flow risk, not a team score.", diagnosticDetail: "Existing oldest-open-item selection from the health model." },
  "WIP Bug Ratio": { metricId: "wip-bug-ratio", collection: "Local imported issue types and open-item snapshot.", source: "Local issue-type snapshot", unavailable: "Unavailable · no valid open-item denominator exists.", teamDetail: "Lower generally means less bug pressure in in-flight work.", diagnosticDetail: "Existing open-item mapping and denominator remain authoritative." },
  "Flow Efficiency": { metricId: "flow-efficiency", collection: "Local flowTiming and Time in Status snapshots.", source: "Local flow health snapshot", unavailable: "Unavailable · active and waiting-time prerequisites are incomplete.", teamDetail: "Higher active share generally means less waiting.", diagnosticDetail: "Existing flow-health result; Time in Status remains diagnostic and non-additive." },
  "Work Distribution": { metricId: "work-distribution", collection: "Local imported issue types and work-mix snapshot.", source: "Local work-mix snapshot", unavailable: "Unavailable · no valid work-mix categories are available.", teamDetail: "Context for comparing output mix, not individual performance.", diagnosticDetail: "Existing issue-type mapping is descriptive, not a numeric score." },
  "Forecast P85": { metricId: "forecast-p85", collection: "Local throughput and open-backlog forecast snapshot.", source: "Local forecast snapshot", unavailable: "Unavailable · forecast prerequisites are incomplete.", teamDetail: "A forecast signal, distinct from the Cycle Time SLE expectation.", diagnosticDetail: "Existing forecast result with no special target/trendline treatment." },
  "Implementation Time": { metricId: "implementation-time", collection: "Local imported issue history and configured Implementation Time statuses.", source: "Local flowTiming snapshot", unavailable: "Unavailable · no valid Implementation Time value exists for the selected period.", teamDetail: "Shorter implementation flow is generally better.", diagnosticDetail: "Uses the approved existing implementation-flow contract when available; no fallback formula is introduced." },
  "Waiting Time %": { metricId: "waiting-time-percent", collection: "Local status-transition and flowTiming detail snapshot.", source: "Local flowTiming detail snapshot", unavailable: "Unavailable · waiting-time coverage is not available for this period.", teamDetail: "Lower waiting share generally means smoother flow.", diagnosticDetail: "Uses the existing waiting-time share only when its approved contract is available." },
  "Maintenance %": { metricId: "maintenance-percent", collection: "Local imported issue data and the mapped parent/EPIC field.", source: "Local imported CSV classification", unavailable: "Unavailable · configure a lifecycle key and provide usable direct-child data.", teamDetail: "A work-mix context measure; it is not intrinsically better or worse.", diagnosticDetail: "Task/Spike are Lifecycle; Bug/Production Bug are Maintenance; other types are Unknown." },
};

Object.assign(DEFINITIONS, {
  "Work Past Expectation": { label: "Work Past Expectation", unit: "open items", direction: "lower", meaning: "Open items already beyond the existing SLE P85 delivery expectation.", calculation: "Existing count of open items beyond the configured SLE P85 threshold." },
  "Completion Rate": { label: "Completion Rate", unit: "tickets / 30d", direction: "higher", meaning: "The existing recent completed-item rate shown for the team.", calculation: "Existing recent completion value; this insight adds no second rate formula." },
  "Cycle Time": { label: "Cycle Time", unit: "working days", direction: "lower", meaning: "Average working days through the Cycle Time flow before Implementation Time completes.", calculation: "Existing Cycle Time semantics measured on Monday-Friday working days; this is distinct from Implementation Time." },
  "SLE Compliance": { label: "SLE Compliance", unit: "%", direction: "higher", meaning: "Share of completed work within the existing SLE expectation.", calculation: "Existing SLE compliance value supplied by the selected-period health model." },
  "Open Tickets": { label: "Open Tickets", unit: "items", direction: "lower", meaning: "Items that remain open in the selected period.", calculation: "Existing open-item count from the health model." },
  "Oldest Ticket": { label: "Oldest Ticket", unit: "item", direction: "categorical", meaning: "The open item with the greatest existing age in the selected period.", calculation: "Existing oldest-open-item selection from the health model." },
  "WIP Bug Ratio": { label: "WIP Bug Ratio", unit: "%", direction: "lower", meaning: "Share of open items classified as bugs.", calculation: "Existing open-item bug count divided by open-item count." },
  "Flow Efficiency": { label: "Flow Efficiency", unit: "%", direction: "higher", meaning: "The existing share of flow time spent active rather than waiting.", calculation: "Existing flow-efficiency value from the selected-period flow health model." },
  "Work Distribution": { label: "Work Distribution", unit: "category mix", direction: "categorical", meaning: "The existing selected-period mix of delivered work categories.", calculation: "Existing work-mix grouping; categories are descriptive, not a numeric score." },
  "Forecast P85": { label: "Forecast P85", unit: "working days", direction: "lower", meaning: "The existing probabilistic forecast for the open backlog.", calculation: "Existing forecast result; this insight does not create a new P85 metric." },
  "Lead Time": { label: "Lead Time", unit: "working days", direction: "lower", meaning: "Total flow time from intake or project entry until Done.", calculation: "Existing flowTiming Lead Time average using Monday-Friday working days." },
  "Implementation Time": { label: "Implementation Time", unit: "working days", direction: "lower", meaning: "Time spent in the configured Implementation Time flow before Done.", calculation: "Existing Implementation Time average using Monday-Friday working days." },
  "Waiting Time %": { label: "Waiting Time %", unit: "%", direction: "lower", meaning: "Share of usable Cycle Time spent waiting outside Implementation Time.", calculation: "Summed usable Cycle-only waiting duration outside Implementation Time ÷ summed usable Cycle Time duration × 100." },
  "Maintenance %": { label: "Maintenance %", unit: "%", direction: "categorical", meaning: "Share of completed direct-child recognized work classified as Maintenance.", calculation: "Maintenance completed direct-child recognized work ÷ (Maintenance + Lifecycle completed direct-child recognized work) × 100." },
});

// Compatibility-only aliases are intentionally kept out of the ordinary registry
// copy. They remain resolvable for persisted legacy card labels without changing
// the canonical terminology shown to users.
const COMPATIBILITY_DEFINITION_DETAILS: Record<string, Pick<MetricInsightDefinition, "metricId" | "collection" | "source" | "unavailable" | "teamDetail" | "diagnosticDetail">> = {
  "Active Time": { metricId: "active-time-legacy", collection: "Local imported issue history and status-transition snapshot.", source: "Local flowTiming snapshot", unavailable: "Unavailable · no valid compatibility value exists for the selected period.", teamDetail: "Compatibility alias for current Cycle Time; not a separate metric.", diagnosticDetail: "Legacy field is presented through the canonical Cycle Time contract." },
};

const COMPATIBILITY_DEFINITIONS: Record<string, MetricInsightDefinition> = {
  "Active Time": { label: "Active Time", unit: "working days", direction: "lower", meaning: "Compatibility alias for current Cycle Time.", calculation: "Existing Cycle Time average using Monday-Friday working days; no separate formula is introduced.", ...COMPATIBILITY_DEFINITION_DETAILS["Active Time"] },
};

export function getMetricInsightDefinition(label: string): MetricInsightDefinition {
  const definition = DEFINITIONS[label] ?? COMPATIBILITY_DEFINITIONS[label];
  const details = DEFINITION_DETAILS[label] ?? COMPATIBILITY_DEFINITION_DETAILS[label];
  if (definition) return { ...definition, ...details };
  return {
    metricId: `unsupported-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label,
    unit: "unavailable",
    direction: "categorical",
    meaning: `${label} has no approved metric insight contract in this release.`,
    collection: "No approved local collection contract is available.",
    source: "Unsupported metric contract",
    unavailable: `Unavailable · ${label} is not supported by the metric insight contract.`,
    teamDetail: "This card remains presentation-safe without an invented interpretation.",
    diagnosticDetail: "Add an approved contract before adding diagnostic claims.",
    calculation: "No approved calculation explanation is available; the existing card value is not recalculated here.",
  };
}

export function parseMetricPreviousValue(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const normalized = value.trim();
  if (normalized === "-") return null;
  const match = normalized.match(/^-?(?:\d+(?:\.\d+)?|\.\d+)(?=\s|$|\/|%|[a-zA-Z])/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function metricInsightDefinitions(): MetricInsightDefinition[] {
  return [...Object.values(DEFINITIONS), ...Object.values(COMPATIBILITY_DEFINITIONS)];
}
