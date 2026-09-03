import {
  type FlowTimingIssueDetail,
  type FlowTimingMetric,
  type ParsedIssue,
  type SleValues,
  type TeamConfig,
  type TeamMetrics,
  type WaitingTimeSnapshot,
  type VelocityPoint,
} from "../types/contracts";
import { type TimeInStatusIssueRow } from "./time-in-status";
import { calendarDurationToWorkingDays, workingDaysBetween } from "./working-days";
import { adaptLegacyWorkflowConfig, classifyUnifiedFlowStatus, validateUnifiedFlowStatusConfig } from "./flow-presentation";

export const DEFAULT_SLE_ISSUE_TYPES = ["Task", "Bug", "Story"] as const;

export function buildWaitingTimeSnapshot(
  details: FlowTimingIssueDetail[],
  asOf?: string,
  capturedAt?: string,
  source: WaitingTimeSnapshot["source"] = "local-recalculation",
  semanticVersion?: string,
): WaitingTimeSnapshot {
  const sampleCount = details.length;
  const usable = details.filter((detail) => {
    const cycle = detail.activeTimeDays;
    const implementation = detail.cycleTimeDays;
    return cycle !== null && implementation !== null
      && Number.isFinite(cycle) && Number.isFinite(implementation)
      && cycle >= 0 && implementation >= 0 && implementation <= cycle;
  });
  const cycleDurationWorkingDays = usable.reduce((sum, detail) => sum + (detail.activeTimeDays ?? 0), 0);
  const waitingDurationWorkingDays = usable.reduce((sum, detail) => sum + ((detail.activeTimeDays ?? 0) - (detail.cycleTimeDays ?? 0)), 0);
  const waitingPct = cycleDurationWorkingDays > 0 ? (waitingDurationWorkingDays / cycleDurationWorkingDays) * 100 : undefined;
  const invariantValid = waitingPct === undefined || (Number.isFinite(waitingPct) && waitingPct >= 0 && waitingPct <= 100);
  const usableCount = usable.length;
  const state: WaitingTimeSnapshot["state"] = !invariantValid || usableCount === 0
    ? "unavailable"
    : usableCount < sampleCount ? "partial" : "complete";
  return {
    waitingDurationWorkingDays,
    cycleDurationWorkingDays,
    waitingPct: invariantValid ? waitingPct : undefined,
    sampleCount,
    usableCount,
    unknownCount: sampleCount - usableCount,
    coverageState: !invariantValid || usableCount === 0 ? "unavailable" : usableCount < sampleCount ? "partial" : "complete",
    state,
    asOf,
    capturedAt,
    source,
    semanticVersion,
    reason: !invariantValid
      ? "Unavailable · waiting and Cycle Time durations violate the expected range."
      : usableCount === 0
        ? cycleDurationWorkingDays === 0 && sampleCount > 0
          ? "Unavailable · usable Cycle Time duration is zero."
          : "Unavailable · no usable Cycle Time denominator for this period."
        : usableCount < sampleCount
          ? `${usableCount} of ${sampleCount} observations usable; excluded or invalid observations reduce coverage.`
          : undefined,
  };
}

export function dedupeIssuesByLatestUpdate(issues: ParsedIssue[]): ParsedIssue[] {
  const byKey = new Map<string, ParsedIssue>();
  const canonicalKeyByAlias = buildCanonicalIssueKeyMap(issues);

  for (const issue of issues) {
    const issueKey = resolveCanonicalIssueKey(issue.issueKey, canonicalKeyByAlias);
    if (!issueKey) {
      continue;
    }

    const existing = byKey.get(issueKey);
    if (!existing) {
      byKey.set(issueKey, issue);
      continue;
    }

    const issueUpdated = issue.updated?.getTime() ?? Number.NEGATIVE_INFINITY;
    const existingUpdated = existing.updated?.getTime() ?? Number.NEGATIVE_INFINITY;

    if (issueUpdated >= existingUpdated) {
      byKey.set(issueKey, issue);
    }
  }

  return Array.from(byKey.values());
}

function buildCanonicalIssueKeyMap(issues: ParsedIssue[]): Map<string, string> {
  const byAlias = new Map<string, string>();

  for (const issue of issues) {
    const currentKey = normalize(issue.issueKey);
    if (!currentKey) {
      continue;
    }

    for (const previousKey of issue.previousIssueKeys ?? []) {
      const alias = normalize(previousKey);
      if (alias && alias !== currentKey) {
        byAlias.set(alias, currentKey);
      }
    }
  }

  return byAlias;
}

function resolveCanonicalIssueKey(issueKey: string, canonicalKeyByAlias: Map<string, string>): string {
  let current = normalize(issueKey);
  const visited = new Set<string>();

  while (current && canonicalKeyByAlias.has(current) && !visited.has(current)) {
    visited.add(current);
    current = canonicalKeyByAlias.get(current) ?? current;
  }

  return current;
}

export interface BuildMetricsOptions {
  timeInStatusIssueRows?: TimeInStatusIssueRow[];
}

export function buildMetrics(
  teamConfig: TeamConfig,
  allRowsCount: number,
  dedupedIssues: ParsedIssue[],
  options: BuildMetricsOptions = {},
): TeamMetrics {
  const excludedIssueKeys = new Set(
    [
      ...(teamConfig.excludedIssueKeys ?? []),
      ...(teamConfig.issueExclusions ?? []).map((exclusion) => exclusion.issueKey),
    ].map(normalize).filter(Boolean),
  );
  const includedIssues = dedupedIssues.filter(
    (issue) => !getIssueKeyAliases(issue).some((issueKey) => excludedIssueKeys.has(issueKey)),
  );
  const doneIssues = includedIssues.filter((issue) => isDone(issue, teamConfig));
  const latestTimeInStatusRows = dedupeTimeInStatusRowsByLatest(options.timeInStatusIssueRows ?? [], includedIssues);
  const flowTimingDetails = buildFlowTimingIssueDetails(includedIssues, teamConfig, latestTimeInStatusRows);

  const cycleTimeIssues = flowTimingDetails
    .filter(
      (detail): detail is FlowTimingIssueDetail & { cycleTimeDays: number } =>
        detail.scope === "closed" &&
        detail.cycleTimeDays !== null &&
        Number.isFinite(detail.cycleTimeDays) &&
        detail.cycleTimeDays >= 0,
    )
    .map((detail) => ({
      issueKey: detail.issueKey,
      resolutionDate: detail.anchorDate,
      cycleTimeDays: detail.cycleTimeDays,
      issueType: detail.issueType ?? "",
    }))
    .sort((a, b) => a.resolutionDate.localeCompare(b.resolutionDate));

  const sleIssueTypeSet = new Set(
    resolveEffectiveSleIssueTypes(
      teamConfig.sleConfig.issueTypes,
      cycleTimeIssues.map((item) => item.issueType),
    ).map(normalize),
  );
  const cycleTimes = cycleTimeIssues.map((item) => item.cycleTimeDays);
  const sleCycleTimes = cycleTimeIssues
    .filter((item) => sleIssueTypeSet.has(normalize(item.issueType)))
    .map((item) => item.cycleTimeDays);
  const sleValues = buildSleValues(sleCycleTimes, teamConfig.sleConfig.rounding);

  const multiSprintIssueKeys = doneIssues
    .filter((issue) => countSprints(issue.sprintRaw) >= 2)
    .map((issue) => issue.issueKey);
  const multiSprintCount = multiSprintIssueKeys.length;
  const multiSprintPercentage = doneIssues.length === 0 ? 0 : (multiSprintCount / doneIssues.length) * 100;

  const cycleTimeByIssueKey = new Map(cycleTimeIssues.map((item) => [normalize(item.issueKey), item.cycleTimeDays]));
  const generatedAt = new Date().toISOString();
  const metrics: TeamMetrics = {
    generatedAt,
    teamName: teamConfig.teamName,
    totalImportedRows: allRowsCount,
    uniqueIssues: includedIssues.length,
    doneIssues: doneIssues.length,
    cycleTimeCount: cycleTimes.length,
    cycleTimeDays: cycleTimes,
    avgCycleTimeDays: cycleTimes.length === 0 ? null : cycleTimes.reduce((sum, value) => sum + value, 0) / cycleTimes.length,
    sle: {
      percentiles: teamConfig.sleConfig.percentiles,
      rounding: teamConfig.sleConfig.rounding,
      values: sleValues,
    },
    scatter: cycleTimeIssues,
    scatterOverlay: sleValues,
    velocityMonthly: buildVelocityMonthly(doneIssues, teamConfig),
    doneIssueDetails: doneIssues.map((issue) => ({
      issueKey: issue.issueKey,
      resolutionDate: issue.resolutionDate?.toISOString() ?? "",
      cycleTimeDays: cycleTimeByIssueKey.get(normalize(issue.issueKey)) ?? null,
      issueType: issue.issueType,
      storyPoints: resolveVelocityStoryPoints(issue, teamConfig),
      sprintCount: countSprints(issue.sprintRaw),
    })),
    flowTiming: summarizeFlowTimingDetails(flowTimingDetails, teamConfig),
    flowTimingBasis: "working-days",
    flowTimingDetails,
    waitingTime: buildWaitingTimeSnapshot(flowTimingDetails, undefined, generatedAt),
    multiSprint: {
      count: multiSprintCount,
      percentage: multiSprintPercentage,
    },
    multiSprintIssueKeys,
  };

  return metrics;
}

function buildFlowTimingIssueDetails(
  includedIssues: ParsedIssue[],
  teamConfig: TeamConfig,
  timeInStatusIssueRows: TimeInStatusIssueRow[] | undefined,
): FlowTimingIssueDetail[] {
  const byIssueKey = new Map((timeInStatusIssueRows ?? []).map((row) => [normalize(row.issueKey), row]));
  const details: FlowTimingIssueDetail[] = [];

  includedIssues.forEach((issue) => {
    const done = isDone(issue, teamConfig);
    if (!done && isCancelledIssue(issue)) {
      return;
    }

    const row = findTimeInStatusRow(issue, byIssueKey);
    const anchorDate = done ? issue.resolutionDate : issue.updated ?? issue.created;
    if (!anchorDate) {
      return;
    }

    const rawValues = row
      ? buildIssueFlowTiming(row.durations, teamConfig)
      : { leadTime: null, activeTime: null, cycleTime: null };
    const toWorkingDays = (value: number | null): number | null =>
      row?.durationBasis === "working-days" ? value : calendarDurationToWorkingDays(value, anchorDate);
    const cycleTimeDays =
      toWorkingDays(rawValues.cycleTime) ?? (done ? resolveElapsedCycleTimeWorkingDays(issue) : null);
    if (cycleTimeDays === null) {
      return;
    }

    details.push({
      issueKey: issue.issueKey,
      issueType: issue.issueType,
      anchorDate: anchorDate.toISOString(),
      scope: done ? "closed" : "open",
      leadTimeDays: toWorkingDays(rawValues.leadTime),
      activeTimeDays: toWorkingDays(rawValues.activeTime),
      cycleTimeDays,
    });
  });

  return details.sort((a, b) => a.anchorDate.localeCompare(b.anchorDate));
}

function summarizeFlowTimingDetails(details: FlowTimingIssueDetail[], teamConfig: TeamConfig): TeamMetrics["flowTiming"] {
  const scope = resolveFlowTimingIssueScope(teamConfig);
  const scopedDetails = details.filter((detail) =>
    detail.scope === "closed" ? scope.includeClosedTickets : scope.includeOpenTickets,
  );
  const leadValues: number[] = [];
  const activeValues: number[] = [];
  const cycleValues: number[] = [];

  scopedDetails.forEach((detail) => {
    pushIfUsable(leadValues, detail.leadTimeDays);
    pushIfUsable(activeValues, detail.activeTimeDays);
    pushIfUsable(cycleValues, detail.cycleTimeDays);
  });

  return {
    leadTime: summarizeFlowTiming(leadValues),
    activeTime: summarizeFlowTiming(activeValues),
    cycleTime: summarizeFlowTiming(cycleValues),
  };
}

function resolveFlowTimingIssueScope(teamConfig: TeamConfig): { includeClosedTickets: boolean; includeOpenTickets: boolean } {
  const includeClosedTickets = teamConfig.flowTimingConfig?.includeClosedTickets !== false;
  const includeOpenTickets = teamConfig.flowTimingConfig?.includeOpenTickets === true;

  if (!includeClosedTickets && !includeOpenTickets) {
    return { includeClosedTickets: true, includeOpenTickets: false };
  }

  return { includeClosedTickets, includeOpenTickets };
}

export function isCancelledIssue(issue: ParsedIssue): boolean {
  return isCancelledLikeText(issue.status) || isCancelledLikeText(issue.resolution);
}

function isCancelledLikeText(value: string | undefined): boolean {
  const normalized = normalize(value ?? "");
  return ["cancel", "abandon", "won't do", "wont do", "reject", "declin", "duplicate", "obsolete"].some((hint) =>
    normalized.includes(hint),
  );
}

function buildIssueFlowTiming(
  durations: TimeInStatusIssueRow["durations"],
  teamConfig: TeamConfig,
): { leadTime: number | null; activeTime: number | null; cycleTime: number | null } {
  const flowClassifier = buildFlowStatusClassifier(teamConfig);
  const leadTime = sumDurations(durations, flowClassifier.isLead);
  const activeTime = sumDurations(durations, flowClassifier.isActive);
  const cycleTime = sumDurations(durations, flowClassifier.isImplementation);

  return {
    leadTime: normalizeFlowTimingValue(leadTime),
    activeTime: normalizeFlowTimingValue(activeTime),
    cycleTime: normalizeFlowTimingValue(cycleTime),
  };
}

function sumDurations(
  durations: TimeInStatusIssueRow["durations"],
  include: (status: string) => boolean,
): number | null {
  const total = durations.reduce((sum, duration) => {
    if (!Number.isFinite(duration.days) || duration.days <= 0 || !include(duration.status)) {
      return sum;
    }
    return sum + duration.days;
  }, 0);

  return total > 0 ? total : null;
}

function normalizeFlowTimingValue(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value <= 5000 ? value : null;
}

function summarizeFlowTiming(values: number[]): FlowTimingMetric {
  return {
    count: values.length,
    avgDays: values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length,
    ...buildSleValues(values, "ceil"),
  };
}

function pushIfUsable(target: number[], value: number | null): void {
  if (value !== null && Number.isFinite(value) && value > 0) {
    target.push(value);
  }
}

export function buildFlowStatusClassifier(teamConfig: TeamConfig): {
  isLead: (status: string) => boolean;
  isActive: (status: string) => boolean;
  isImplementation: (status: string) => boolean;
} {
  const workflow = teamConfig.workflowConfig;
  const unifiedValidation = workflow?.statusSets === undefined ? null : validateUnifiedFlowStatusConfig(workflow.statusSets);
  const adapted = adaptLegacyWorkflowConfig(teamConfig);
  const hasLegacyConfiguration = Boolean(
    workflow && [workflow.funnelStatuses, workflow.implementingStatuses]
      .some((statuses) => (statuses?.length ?? 0) > 0),
  );
  const unified = unifiedValidation?.config ?? (hasLegacyConfiguration && adapted.state === "complete"
    ? {
        leadStatuses: adapted.leadStatuses ?? [],
        cycleStatuses: adapted.cycleStatuses ?? [],
        implementationStatuses: adapted.implementationStatuses ?? [],
        doneStatuses: adapted.doneStatuses ?? [],
      }
    : null);
  if (workflow?.statusSets !== undefined && (unifiedValidation?.state !== "valid" || adapted.state !== "complete")) {
    return {
      isLead: () => false,
      isActive: () => false,
      isImplementation: () => false,
    };
  }
  if (hasLegacyConfiguration && adapted.state !== "complete") {
    return {
      isLead: () => false,
      isActive: () => false,
      isImplementation: () => false,
    };
  }
  if (unified) {
    return {
      isLead: (status) => {
        const role = classifyUnifiedFlowStatus(status, unified);
        return role === "lead" || role === "cycle" || role === "implementation";
      },
      isActive: (status) => {
        const role = classifyUnifiedFlowStatus(status, unified);
        return role === "cycle" || role === "implementation";
      },
      isImplementation: (status) => classifyUnifiedFlowStatus(status, unified) === "implementation",
    };
  }
  const backlogSet = buildStatusSet(workflow?.backlogStatuses);
  const funnelSet = buildStatusSet(workflow?.funnelStatuses);
  const configuredActiveStatuses =
    workflow?.activeStatuses && workflow.activeStatuses.length > 0
      ? workflow.activeStatuses
      : teamConfig.sprintScopeConfig?.statuses;
  const activeSet = buildStatusSet(configuredActiveStatuses);
  const implementingSet = buildStatusSet(workflow?.implementingStatuses);
  const doneSet = buildStatusSet(teamConfig.doneConfig.doneStatuses);
  const hasConfiguredFlowStatuses =
    backlogSet.size > 0 || funnelSet.size > 0 || activeSet.size > 0 || implementingSet.size > 0;
  const hasImplementationStatuses = implementingSet.size > 0;

  if (!hasConfiguredFlowStatuses) {
    return {
      isLead: isLeadFlowStatus,
      isActive: isActiveFlowStatus,
      isImplementation: isImplementationFlowStatus,
    };
  }

  const isDone = (status: string): boolean => {
    const key = normalize(status);
    return doneSet.has(key) || isTerminalFlowStatus(status);
  };

  return {
    isLead: (status: string) => {
      const key = normalize(status);
      return Boolean(key) && !isDone(status) && (funnelSet.has(key) || activeSet.has(key) || implementingSet.has(key));
    },
    isActive: (status: string) => {
      const key = normalize(status);
      return Boolean(key) && !isDone(status) && (activeSet.has(key) || implementingSet.has(key));
    },
    isImplementation: (status: string) => {
      const key = normalize(status);
      if (!key || isDone(status)) {
        return false;
      }

      return hasImplementationStatuses ? implementingSet.has(key) : activeSet.has(key) || isImplementationFlowStatus(status);
    },
  };
}

function buildStatusSet(statuses: string[] | undefined): Set<string> {
  return new Set((statuses ?? []).map(normalize).filter(Boolean));
}

function isLeadFlowStatus(status: string): boolean {
  return !isTerminalFlowStatus(status) && !isPreFunnelStatus(status);
}

function isActiveFlowStatus(status: string): boolean {
  return isLeadFlowStatus(status) && !isFunnelStatus(status);
}

function isImplementationFlowStatus(status: string): boolean {
  const key = normalize(status);
  if (!key || isTerminalFlowStatus(status) || isFunnelStatus(status) || key.includes("analys")) {
    return false;
  }

  return (
    key.includes("implement") ||
    key.includes("development") ||
    key.includes("in progress") ||
    key.includes("review") ||
    key.includes("test") ||
    key.includes("acceptance") ||
    key.includes("code review")
  );
}

function isFunnelStatus(status: string): boolean {
  return normalize(status).includes("funnel");
}

function isPreFunnelStatus(status: string): boolean {
  const key = normalize(status);
  return key === "backlog" || key === "open" || key === "to do" || key === "todo" || key.includes("idea box");
}

function isTerminalFlowStatus(status: string): boolean {
  const key = normalize(status);
  return ["done", "closed", "resolved", "abandoned", "cancelled", "canceled", "won't do", "wont do"].includes(key);
}

function resolveElapsedCycleTimeWorkingDays(issue: ParsedIssue): number | null {
  const cycleStart = resolveIssueStartDate(issue);
  if (!cycleStart || !issue.resolutionDate) {
    return null;
  }

  return workingDaysBetween(cycleStart, issue.resolutionDate);
}

function resolveIssueStartDate(issue: ParsedIssue): Date | null {
  if (!issue.projectEnteredAt || !issue.created) {
    return issue.projectEnteredAt ?? issue.created;
  }

  return issue.projectEnteredAt.getTime() > issue.created.getTime() ? issue.projectEnteredAt : issue.created;
}

function findTimeInStatusRow<T>(issue: ParsedIssue, byIssueKey: Map<string, T>): T | undefined {
  for (const key of getIssueKeyAliases(issue)) {
    const row = byIssueKey.get(key);
    if (row) {
      return row;
    }
  }

  return undefined;
}

function getIssueKeyAliases(issue: ParsedIssue): string[] {
  return [issue.issueKey, ...(issue.previousIssueKeys ?? [])].map(normalize).filter(Boolean);
}

export function isDone(issue: ParsedIssue, teamConfig: TeamConfig): boolean {
  if (isCancelledIssue(issue)) {
    return false;
  }

  const status = normalize(issue.status);
  const resolution = normalize(issue.resolution);
  const hasResolutionDate = Boolean(issue.resolutionDate);
  const hasResolvedValue = Boolean(resolution) && !["unresolved", "none", "null", "na", "n/a"].includes(resolution);

  const doneStatuses = new Set((teamConfig.doneConfig.doneStatuses ?? []).map(normalize).filter(Boolean));

  if (teamConfig.doneConfig.useStatusCategoryDone) {
    if (doneStatuses.size > 0 && doneStatuses.has(status)) {
      return true;
    }
    if (["done", "resolved", "closed"].includes(status)) {
      return true;
    }
    return hasResolutionDate || hasResolvedValue;
  }

  if (doneStatuses.size > 0) {
    return doneStatuses.has(status);
  }

  return hasResolutionDate || hasResolvedValue;
}

export function buildSleValues(cycleTimes: number[], rounding: "ceil"): SleValues {
  return {
    p50: roundValue(percentileInc(cycleTimes, 0.5), rounding),
    p70: roundValue(percentileInc(cycleTimes, 0.7), rounding),
    p85: roundValue(percentileInc(cycleTimes, 0.85), rounding),
    p95: roundValue(percentileInc(cycleTimes, 0.95), rounding),
  };
}

export function normalizeSleIssueTypes(issueTypes: string[] | undefined): string[] {
  const source = issueTypes && issueTypes.length > 0 ? issueTypes : [...DEFAULT_SLE_ISSUE_TYPES];
  const normalized = normalizeIssueTypeList(source);

  return normalized.length > 0 ? normalized : [...DEFAULT_SLE_ISSUE_TYPES];
}

export function resolveEffectiveSleIssueTypes(
  configuredIssueTypes: string[] | undefined,
  observedIssueTypes: Array<string | undefined>,
): string[] {
  void observedIssueTypes;
  return normalizeSleIssueTypes(configuredIssueTypes);
}

export function dedupeTimeInStatusRowsByLatest(
  rows: TimeInStatusIssueRow[],
  issues: ParsedIssue[],
): TimeInStatusIssueRow[] {
  const canonicalKeyByAlias = new Map<string, string>();

  issues.forEach((issue) => {
    const canonicalKey = normalize(issue.issueKey);
    if (!canonicalKey) {
      return;
    }

    getIssueKeyAliases(issue).forEach((alias) => canonicalKeyByAlias.set(alias, canonicalKey));
  });

  const latestByCanonicalKey = new Map<string, TimeInStatusIssueRow>();
  rows.forEach((row) => {
    const rawKey = normalize(row.issueKey);
    if (!rawKey) {
      return;
    }

    const canonicalKey = canonicalKeyByAlias.get(rawKey) ?? rawKey;
    latestByCanonicalKey.set(canonicalKey, {
      ...row,
      issueKey: canonicalKey,
    });
  });

  return Array.from(latestByCanonicalKey.values());
}

export function isIssueTypeIncludedInSle(issueType: string | undefined, sleIssueTypes: string[] | undefined): boolean {
  const normalizedIssueType = normalize(issueType);
  if (!normalizedIssueType) {
    return false;
  }

  const allowed = new Set(normalizeSleIssueTypes(sleIssueTypes).map(normalize));
  return allowed.has(normalizedIssueType);
}

export function percentileInc(values: number[], percentile: number): number | null {
  if (values.length === 0) {
    return null;
  }

  if (percentile <= 0) {
    return Math.min(...values);
  }

  if (percentile >= 1) {
    return Math.max(...values);
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * percentile;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = rank - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

function roundValue(value: number | null, rounding: "ceil"): number | null {
  if (value === null) {
    return null;
  }

  if (rounding === "ceil") {
    return Math.ceil(value);
  }

  return value;
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeIssueTypeList(issueTypes: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  issueTypes.forEach((value) => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) {
      return;
    }

    const key = normalize(trimmed);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push(trimmed);
  });

  return normalized;
}

export function resolveVelocityStoryPoints(
  issue: Pick<ParsedIssue, "storyPoints" | "issueType">,
  teamConfig: Pick<TeamConfig, "bugConfig">,
): number | null {
  if (issue.storyPoints !== null && Number.isFinite(issue.storyPoints)) {
    return issue.storyPoints;
  }

  const defaultStoryPoints = teamConfig.bugConfig?.defaultStoryPoints;
  if (defaultStoryPoints === undefined || defaultStoryPoints === null || !Number.isFinite(defaultStoryPoints)) {
    return null;
  }

  const bugSet = new Set((teamConfig.bugConfig?.issueTypes ?? ["Bug"]).map(normalize).filter(Boolean));
  return bugSet.has(normalize(issue.issueType)) ? defaultStoryPoints : null;
}

function buildVelocityMonthly(doneIssues: ParsedIssue[], teamConfig: TeamConfig): VelocityPoint[] {
  const monthly = new Map<string, number>();

  for (const issue of doneIssues) {
    if (!issue.resolutionDate) {
      continue;
    }

    const month = issue.resolutionDate.toISOString().slice(0, 7);
    const amount = resolveVelocityStoryPoints(issue, teamConfig) ?? 1;
    const current = monthly.get(month) ?? 0;
    monthly.set(month, current + amount);
  }

  return Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value }));
}

export function countSprints(rawValue: string): number {
  if (!rawValue || rawValue.trim().length === 0) {
    return 0;
  }

  const greenhopperIds = rawValue.match(/id=\d+/gi);
  if (greenhopperIds && greenhopperIds.length > 0) {
    return new Set(greenhopperIds.map((id) => id.toLowerCase())).size;
  }

  const sprintNames = rawValue
    .split(/[,;]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return new Set(sprintNames.map((name) => name.toLowerCase())).size;
}
