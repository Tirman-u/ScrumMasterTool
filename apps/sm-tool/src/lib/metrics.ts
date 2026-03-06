import { type ParsedIssue, type SleValues, type TeamConfig, type TeamMetrics, type VelocityPoint } from "../types/contracts";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
export const DEFAULT_SLE_ISSUE_TYPES = ["Task", "Bug", "Story"] as const;

export function dedupeIssuesByLatestUpdate(issues: ParsedIssue[]): ParsedIssue[] {
  const byKey = new Map<string, ParsedIssue>();

  for (const issue of issues) {
    const existing = byKey.get(issue.issueKey);
    if (!existing) {
      byKey.set(issue.issueKey, issue);
      continue;
    }

    const issueUpdated = issue.updated?.getTime() ?? Number.NEGATIVE_INFINITY;
    const existingUpdated = existing.updated?.getTime() ?? Number.NEGATIVE_INFINITY;

    if (issueUpdated >= existingUpdated) {
      byKey.set(issue.issueKey, issue);
    }
  }

  return Array.from(byKey.values());
}

export function buildMetrics(teamConfig: TeamConfig, allRowsCount: number, dedupedIssues: ParsedIssue[]): TeamMetrics {
  const excludedIssueKeys = new Set((teamConfig.excludedIssueKeys ?? []).map(normalize).filter(Boolean));
  const includedIssues = dedupedIssues.filter((issue) => !excludedIssueKeys.has(normalize(issue.issueKey)));
  const doneIssues = includedIssues.filter((issue) => isDone(issue, teamConfig));
  const sleIssueTypeSet = new Set(normalizeSleIssueTypes(teamConfig.sleConfig.issueTypes).map(normalize));

  const cycleTimeIssues = doneIssues
    .map((issue) => {
      if (!issue.created || !issue.resolutionDate) {
        return null;
      }
      const cycleTimeDays = (issue.resolutionDate.getTime() - issue.created.getTime()) / MS_PER_DAY;
      if (!Number.isFinite(cycleTimeDays) || cycleTimeDays < 0) {
        return null;
      }

      return {
        issueKey: issue.issueKey,
        resolutionDate: issue.resolutionDate.toISOString(),
        cycleTimeDays,
        issueType: issue.issueType,
      };
    })
    .filter(
      (item): item is { issueKey: string; resolutionDate: string; cycleTimeDays: number; issueType: string } =>
        item !== null,
    )
    .sort((a, b) => a.resolutionDate.localeCompare(b.resolutionDate));

  const cycleTimes = cycleTimeIssues.map((item) => item.cycleTimeDays);
  const sleCycleTimes = cycleTimeIssues
    .filter((item) => sleIssueTypeSet.has(normalize(item.issueType)))
    .map((item) => item.cycleTimeDays);
  const sleValues = buildSleValues(sleCycleTimes, teamConfig.sleConfig.rounding);

  const multiSprintCount = doneIssues.filter((issue) => countSprints(issue.sprintRaw) >= 2).length;
  const multiSprintPercentage = doneIssues.length === 0 ? 0 : (multiSprintCount / doneIssues.length) * 100;

  const metrics: TeamMetrics = {
    generatedAt: new Date().toISOString(),
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
    velocityMonthly: buildVelocityMonthly(doneIssues),
    doneIssueDetails: doneIssues.map((issue) => ({
      issueKey: issue.issueKey,
      resolutionDate: issue.resolutionDate?.toISOString() ?? "",
      cycleTimeDays:
        issue.created && issue.resolutionDate
          ? (issue.resolutionDate.getTime() - issue.created.getTime()) / MS_PER_DAY
          : null,
      issueType: issue.issueType,
      storyPoints: issue.storyPoints,
      sprintCount: countSprints(issue.sprintRaw),
    })),
    multiSprint: {
      count: multiSprintCount,
      percentage: multiSprintPercentage,
    },
  };

  return metrics;
}

export function isDone(issue: ParsedIssue, teamConfig: TeamConfig): boolean {
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
  const seen = new Set<string>();
  const normalized: string[] = [];

  source.forEach((value) => {
    const trimmed = value.trim();
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

  return normalized.length > 0 ? normalized : [...DEFAULT_SLE_ISSUE_TYPES];
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

function buildVelocityMonthly(doneIssues: ParsedIssue[]): VelocityPoint[] {
  const monthly = new Map<string, number>();

  for (const issue of doneIssues) {
    if (!issue.resolutionDate) {
      continue;
    }

    const month = issue.resolutionDate.toISOString().slice(0, 7);
    const amount = issue.storyPoints ?? 1;
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
