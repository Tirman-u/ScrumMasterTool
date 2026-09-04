import type { FlowTimingIssueDetail, MaintenanceLifecycleSnapshot, TeamMetrics, WaitingTimeSnapshot, WaitingTimeSnapshotState } from "../types/contracts";

export type MetricTrustKey = "leadTime" | "activeTime" | "cycleTime" | "sleP85" | "waitingTimePct" | "maintenancePct";
export type MetricTrustState =
  | "complete"
  | "partial"
  | "unavailable"
  | "unavailable-no-source"
  | "loading"
  | "error"
  | "error-with-retry"
  | "conflict"
  | "stale-last-known"
  | "needs-review-config"
  | "not-configured"
  | "invalid-key"
  | "source-missing-parent-field"
  | "configured-not-found"
  | "no-recognized-completed-work"
  | "ready-complete"
  | "ready-partial-unknown-types";

export interface MetricTrust {
  key: MetricTrustKey;
  label: string;
  unit: "working days" | "%";
  asOf: string | null;
  capturedAt: string | null;
  unknownCount: number | null;
  previousValue: number | null;
  previousPeriodLabel: string | null;
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
  coverageState?: WaitingTimeSnapshot["coverageState"];
  retryAvailable?: boolean;
  semanticVersion?: string;
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
  waitingTimeSnapshot?: WaitingTimeSnapshot;
  previousWaitingTimeSnapshot?: WaitingTimeSnapshot;
  maintenanceLifecycleSnapshot?: MaintenanceLifecycleSnapshot;
  previousMaintenanceLifecycleSnapshot?: MaintenanceLifecycleSnapshot;
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
    unit: "working days",
    asOf: input.periodLabel,
    capturedAt: null,
    unknownCount: detailRowsAvailable ? Math.max(0, eligibleCount - usableCount) : null,
    previousValue: null,
    previousPeriodLabel: null,
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

function waitingTimeTrust(input: MetricTrustInput): MetricTrust {
  const snapshot = input.waitingTimeSnapshot;
  const eligibleCount = snapshot?.sampleCount ?? input.flowDetails.length;
  const usableDetails = input.flowDetails.filter((detail) => {
    const cycleDays = detail.activeTimeDays;
    const implementationDays = detail.cycleTimeDays;
    return cycleDays !== null && implementationDays !== null
      && Number.isFinite(cycleDays) && Number.isFinite(implementationDays)
      && cycleDays >= 0 && implementationDays >= 0 && implementationDays <= cycleDays;
  });
  const usableCount = snapshot?.usableCount ?? usableDetails.length;
  const cycleDuration = snapshot?.cycleDurationWorkingDays ?? usableDetails.reduce((sum, detail) => sum + (detail.activeTimeDays ?? 0), 0);
  const waitingDuration = snapshot?.waitingDurationWorkingDays ?? usableDetails.reduce((sum, detail) => sum + ((detail.activeTimeDays ?? 0) - (detail.cycleTimeDays ?? 0)), 0);
  const value = snapshot?.waitingPct ?? (usableCount > 0 && cycleDuration > 0 ? (waitingDuration / cycleDuration) * 100 : null);
  const snapshotState = snapshot ? mapWaitingSnapshotState(snapshot.state, snapshot.coverageState, snapshot.source) : null;
  const state: MetricTrustState = snapshotState ?? (value === null ? "unavailable" : usableCount < eligibleCount ? "partial" : "complete");
  const comparablePrevious = snapshot?.semanticVersion !== undefined
    && input.previousWaitingTimeSnapshot?.semanticVersion === snapshot.semanticVersion;
  const source = snapshot?.source ?? (snapshot ? "Unavailable source" : "Local flowTiming detail snapshot");
  const reason = snapshot?.reason ?? (value === null
    ? eligibleCount === 0
      ? "Unavailable · valid Waiting Time % detail is not available for this period."
      : cycleDuration === 0
        ? "Unavailable · usable Cycle Time duration is zero."
        : "Unavailable · no usable Cycle Time denominator for this period."
    : state === "partial"
      ? `${usableCount} of ${eligibleCount} observations usable; excluded or invalid observations reduce coverage.`
      : `Coverage: ${usableCount} usable observations.`);
  return {
    key: "waitingTimePct",
    label: "Waiting Time %",
    unit: "%",
    asOf: snapshot?.asOf ?? input.periodLabel,
    capturedAt: snapshot?.capturedAt ?? null,
    unknownCount: snapshot?.unknownCount ?? Math.max(0, eligibleCount - usableCount),
    previousValue: comparablePrevious ? input.previousWaitingTimeSnapshot?.waitingPct ?? null : null,
    previousPeriodLabel: comparablePrevious ? input.previousWaitingTimeSnapshot?.asOf ?? null : null,
    value,
    p85: null,
    definition: "Share of usable Cycle Time spent waiting outside Implementation Time.",
    calculation: "Summed usable Cycle-only waiting duration outside Implementation Time ÷ summed usable Cycle Time duration × 100.",
    source,
    fallback: snapshot?.reason ?? "None used.",
    periodLabel: input.periodLabel,
    basis: BASIS,
    eligibleCount,
    usableCount,
    coveragePct: eligibleCount > 0 ? (usableCount / eligibleCount) * 100 : null,
    coverageState: snapshot?.coverageState,
    retryAvailable: snapshot?.retryAvailable,
    semanticVersion: snapshot?.semanticVersion,
    state,
    reason,
  };
}

function maintenanceLifecycleTrust(input: MetricTrustInput): MetricTrust {
  const snapshot = input.maintenanceLifecycleSnapshot;
  const value = snapshot?.maintenancePct ?? null;
  const state: MetricTrustState = snapshot?.coverageState === "conflict" || snapshot?.state === "conflict"
    ? "conflict"
    : snapshot?.state === "ready-complete"
      ? "complete"
      : snapshot?.state === "ready-partial-unknown-types"
        ? "partial"
        : snapshot?.state === "stale-last-known"
          ? "stale-last-known"
          : snapshot?.state === "error-with-retry"
            ? "error-with-retry"
            : snapshot?.state ?? (value === null ? "unavailable" : snapshot?.coverageState === "partial" ? "partial" : "complete");
  const previous = input.previousMaintenanceLifecycleSnapshot;
  const previousValue = previous?.maintenancePct ?? null;
  const comparablePrevious = previous?.asOf !== undefined && snapshot?.asOf !== undefined && previous.asOf !== snapshot.asOf && previous.semanticVersion !== undefined && previous.semanticVersion === snapshot.semanticVersion ? previousValue : null;
  return {
    key: "maintenancePct",
    label: "Maintenance %",
    unit: "%",
    asOf: snapshot?.asOf ?? input.periodLabel,
    capturedAt: snapshot?.capturedAt ?? null,
    unknownCount: snapshot?.unknownCount ?? null,
    previousValue: comparablePrevious,
    previousPeriodLabel: comparablePrevious === null ? null : previous?.asOf ?? null,
    value,
    p85: null,
    definition: "Share of completed direct-child recognized work classified as Maintenance.",
    calculation: "Maintenance completed direct-child recognized work ÷ (Maintenance + Lifecycle completed direct-child recognized work) × 100.",
    source: snapshot?.source ?? "Unavailable source",
    fallback: snapshot?.reason ?? "None used.",
    periodLabel: input.periodLabel,
    basis: "Local imported CSV parent/EPIC equality and exact issue-type classification.",
    eligibleCount: snapshot?.candidateCount ?? null,
    usableCount: snapshot ? (snapshot.maintenanceCount ?? 0) + (snapshot.lifecycleCount ?? 0) : null,
    coveragePct: snapshot?.candidateCount && snapshot.candidateCount > 0 ? (((snapshot.maintenanceCount ?? 0) + (snapshot.lifecycleCount ?? 0)) / snapshot.candidateCount) * 100 : null,
    coverageState: snapshot?.coverageState,
    semanticVersion: snapshot?.semanticVersion,
    retryAvailable: snapshot?.state === "error-with-retry",
    state,
    reason: snapshot?.reason ?? "Unavailable · no maintenance lifecycle snapshot is available.",
  };
}

function mapWaitingSnapshotState(
  state: WaitingTimeSnapshotState | undefined,
  coverageState: WaitingTimeSnapshot["coverageState"],
  source: WaitingTimeSnapshot["source"],
): MetricTrustState | null {
  if (coverageState === "conflict") return "conflict";
  if (!source) return "unavailable-no-source";
  if (state) return state;
  return null;
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
      unit: "working days",
      asOf: input.periodLabel,
      capturedAt: null,
      unknownCount: flowDetailsAvailable ? Math.max(0, input.sleEligibleCount - input.sleUsableCount) : null,
      previousValue: null,
      previousPeriodLabel: null,
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
    waitingTimeTrust(input),
    maintenanceLifecycleTrust(input),
  ];
}
