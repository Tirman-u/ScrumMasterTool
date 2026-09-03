import type { FlowTimingIssueDetail, TeamMetrics } from "../types/contracts";

export type MetricTrustKey = "leadTime" | "activeTime" | "cycleTime" | "sleP85";
export type MetricTrustState = "complete" | "partial" | "unavailable" | "loading" | "error";

export interface MetricTrust {
  key: MetricTrustKey;
  label: string;
  value: number | null;
  p85: number | null;
  definition: string;
  calculation: string;
  source: string;
  fallback: string;
  periodLabel: string;
  basis: string;
  eligibleCount: number | null;
  usableCount: number | null;
  coveragePct: number | null;
  state: MetricTrustState;
  reason: string;
  interpretation?: string;
}

export interface MetricTrustInput {
  flowTiming: TeamMetrics["flowTiming"];
  flowDetails: FlowTimingIssueDetail[];
  periodLabel: string;
  sleP85: number | null;
  sleEligibleCount: number;
  sleUsableCount: number;
  cycleFallbackUsed: boolean;
}

const BASIS = "Monday-Friday working days";
const FLOW_SOURCE = "Jira issue history/status transitions and configured workflow mapping.";
const SNAPSHOT_SOURCE = "Persisted flowTiming snapshot; detail rows were unavailable.";

function flowMetricTrust(
  input: MetricTrustInput,
  key: "leadTime" | "activeTime" | "cycleTime",
  metric: TeamMetrics["flowTiming"]["leadTime"],
  definition: string,
  calculation: string,
): MetricTrust {
  const detailRowsAvailable = input.flowDetails.length > 0;
  const valueKey = key === "leadTime" ? "leadTimeDays" : key === "activeTime" ? "activeTimeDays" : "cycleTimeDays";
  const usableFromDetails = input.flowDetails.filter((detail) => {
    const value = detail[valueKey];
    return value !== null && Number.isFinite(value) && value > 0;
  }).length;
  const eligibleCount = detailRowsAvailable ? input.flowDetails.length : metric.count;
  const usableCount = detailRowsAvailable ? usableFromDetails : metric.avgDays === null ? 0 : metric.count;
  const snapshotOnly = !detailRowsAvailable && metric.avgDays !== null;
  const state: MetricTrustState = metric.avgDays === null || (!snapshotOnly && usableCount === 0)
    ? "unavailable"
    : snapshotOnly
      ? "partial"
      : key === "cycleTime" && input.cycleFallbackUsed
        ? "partial"
      : usableCount < eligibleCount
        ? "partial"
        : "complete";
  const reason = state === "complete"
    ? `Coverage: ${usableCount} usable observations.`
    : state === "partial" && snapshotOnly
      ? "Persisted snapshot retained; detail-level coverage is unavailable."
      : state === "partial" && key === "cycleTime" && input.cycleFallbackUsed
        ? "Elapsed working-day fallback was used for some observations."
      : state === "partial"
        ? "Some eligible observations did not have complete status history."
        : "No eligible completed observations in this period.";

  return {
    key,
    label: key === "leadTime" ? "Lead Time" : key === "activeTime" ? "Cycle Time" : "Implementation Time",
    value: metric.avgDays,
    p85: metric.p85,
    definition,
    calculation,
    source: snapshotOnly ? SNAPSHOT_SOURCE : FLOW_SOURCE,
    fallback: key === "cycleTime" && input.cycleFallbackUsed
      ? "Elapsed working-day fallback was used for some observations."
      : snapshotOnly
        ? "Persisted snapshot used; detail fallback cannot be verified."
        : "None used.",
    periodLabel: input.periodLabel,
    basis: BASIS,
    eligibleCount,
    usableCount,
    coveragePct: detailRowsAvailable && eligibleCount > 0 ? (usableCount / eligibleCount) * 100 : null,
    state,
    reason,
  };
}

export function buildMetricTrustMetadata(input: MetricTrustInput): MetricTrust[] {
  const flowDetailsAvailable = input.flowDetails.length > 0;
  const flowMetrics = [
    flowMetricTrust(input, "leadTime", input.flowTiming.leadTime, "Working days from the configured Lead Time start to Done.", "Lead Time durations to Done."),
    flowMetricTrust(input, "activeTime", input.flowTiming.activeTime, "Working days through the configured Cycle Time flow before Done.", "Cycle Time durations to Done."),
    flowMetricTrust(input, "cycleTime", input.flowTiming.cycleTime, "Working days in the configured Implementation Time flow before Done.", "Implementation Time durations to Done."),
  ];
  const snapshotOnlySle = !flowDetailsAvailable && input.sleP85 !== null;
  const sleState: MetricTrustState = input.sleP85 === null || (!snapshotOnlySle && input.sleUsableCount === 0)
    ? "unavailable"
    : snapshotOnlySle || input.cycleFallbackUsed
      ? "partial"
      : input.sleUsableCount < input.sleEligibleCount
        ? "partial"
        : "complete";
  const sleReason = sleState === "complete"
    ? `Coverage: ${input.sleUsableCount} usable observations.`
    : sleState === "partial" && !flowDetailsAvailable
      ? "Persisted snapshot retained; detail-level coverage is unavailable."
    : sleState === "partial" && input.cycleFallbackUsed
      ? "Elapsed working-day fallback was used for some observations."
      : sleState === "partial"
        ? "Some eligible observations did not have complete status history."
      : "No eligible completed Cycle Time observations in this period.";
  return [
    ...flowMetrics,
    {
      key: "sleP85",
      label: "SLE P85",
      value: input.sleP85,
      p85: input.sleP85,
      definition: "The working-day expectation that 85% of eligible completed Cycle Time observations finish within.",
      calculation: "P85 of eligible completed Cycle Time observations in the selected period.",
      interpretation: "An expectation, not a guarantee for every item.",
      source: flowDetailsAvailable ? "Derived from the selected-period eligible Cycle Time observations." : SNAPSHOT_SOURCE,
      fallback: input.cycleFallbackUsed ? "Cycle Time fallback observations are included where permitted." : flowDetailsAvailable ? "None used." : "Persisted snapshot used; detail fallback cannot be verified.",
      periodLabel: input.periodLabel,
      basis: BASIS,
      eligibleCount: flowDetailsAvailable ? input.sleEligibleCount : null,
      usableCount: flowDetailsAvailable ? input.sleUsableCount : null,
      coveragePct: flowDetailsAvailable && input.sleEligibleCount > 0 ? (input.sleUsableCount / input.sleEligibleCount) * 100 : null,
      state: sleState,
      reason: sleReason,
    },
  ];
}
