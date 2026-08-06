import path from "node:path";
import { buildMetrics, dedupeIssuesByLatestUpdate, isDone } from "./domain/metrics.js";
import { loadWorkspace, writeTeamCache } from "./io/workspace.js";
import { type BottleneckEntry, type ParsedIssue, type TeamConfig } from "./types/contracts.js";

async function main(): Promise<void> {
  const workspaceArg = getArgValue("--workspace");
  const workspacePath = workspaceArg ? path.resolve(workspaceArg) : process.cwd();

  const workspace = await loadWorkspace(workspacePath);

  if (workspace.teams.length === 0) {
    console.log("No teams found.");
    return;
  }

  for (const team of workspace.teams) {
    const deduped = dedupeIssuesByLatestUpdate(team.issues);
    const metrics = buildMetrics(team.teamConfig, team.totalRows, deduped, {
      timeInStatusIssueRows: team.timeInStatusIssueRows,
    });
    const issuePeriodByKey = buildDoneIssuePeriodMap(deduped, team.teamConfig);
    const autoBottleneckEntries = buildAutoTimeInStatusEntries({
      issueRows: team.timeInStatusIssueRows,
      issuePeriodByKey,
      flowStatuses: resolveBottleneckFlowStatuses(team.teamConfig),
    });
    const autoTimeInStatusEntries = buildAutoTimeInStatusEntries({
      issueRows: team.timeInStatusIssueRows,
      issuePeriodByKey,
      flowStatuses: [],
    });

    await writeTeamCache(team.teamPath, deduped, metrics, autoBottleneckEntries, autoTimeInStatusEntries);

    console.log(
      [
        `Team: ${team.teamConfig.teamName} (${team.teamId})`,
        `Rows: ${team.totalRows}`,
        `Unique: ${metrics.uniqueIssues}`,
        `Done: ${metrics.doneIssues}`,
        `SLE P70: ${metrics.sle.values.p70 ?? "n/a"}`,
      ].join(" | "),
    );
  }
}

function getArgValue(flag: string): string | null {
  const index = process.argv.findIndex((value) => value === flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

interface TimeInStatusIssueRow {
  issueKey: string;
  durations: Array<{ status: string; days: number }>;
}

function buildDoneIssuePeriodMap(issues: ParsedIssue[], teamConfig: TeamConfig): Map<string, string> {
  const byIssueKey = new Map<string, string>();

  issues.forEach((issue) => {
    if (!isDone(issue, teamConfig)) {
      return;
    }

    const periodDate = issue.updated ?? issue.resolutionDate;
    if (!periodDate) {
      return;
    }

    getIssueKeyAliases(issue).forEach((key) => byIssueKey.set(key, monthKeyFromDate(periodDate)));
  });

  return byIssueKey;
}

function buildAutoTimeInStatusEntries(options: {
  issueRows: TimeInStatusIssueRow[];
  issuePeriodByKey: ReadonlyMap<string, string>;
  flowStatuses: string[];
}): BottleneckEntry[] {
  const { issueRows, issuePeriodByKey, flowStatuses } = options;
  if (issueRows.length === 0 || issuePeriodByKey.size === 0) {
    return [];
  }

  const normalizedFlowStatuses = normalizeStatusList(flowStatuses);
  const flowOrder = new Map(normalizedFlowStatuses.map((value, index) => [normalizeText(value), index]));
  const flowNameByKey = new Map(normalizedFlowStatuses.map((value) => [normalizeText(value), value]));
  const dedupedByIssue = new Map<string, TimeInStatusIssueRow>();

  issueRows.forEach((row) => {
    const key = normalizeText(row.issueKey);
    if (key) {
      dedupedByIssue.set(key, row);
    }
  });

  const periodAgg = new Map<string, Map<string, { sumDays: number; count: number }>>();
  dedupedByIssue.forEach((row, issueKey) => {
    const period = issuePeriodByKey.get(issueKey);
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return;
    }

    const byStatus = periodAgg.get(period) ?? new Map<string, { sumDays: number; count: number }>();
    row.durations.forEach((duration) => {
      const statusName = duration.status.trim();
      const statusKey = normalizeText(statusName);
      if (!statusKey || !Number.isFinite(duration.days) || duration.days <= 0) {
        return;
      }

      if (isCancelledLikeStatusName(statusName)) {
        return;
      }

      if (normalizedFlowStatuses.length > 0 && !flowOrder.has(statusKey)) {
        return;
      }

      const status = flowNameByKey.get(statusKey) ?? statusName;
      const current = byStatus.get(status) ?? { sumDays: 0, count: 0 };
      current.sumDays += duration.days;
      current.count += 1;
      byStatus.set(status, current);
    });

    if (byStatus.size > 0) {
      periodAgg.set(period, byStatus);
    }
  });

  return Array.from(periodAgg.entries())
    .map(([period, byStatus]) => {
      const columns = Array.from(byStatus.entries())
        .map(([name, value]) => ({
          name,
          avgDays: value.count > 0 ? value.sumDays / value.count : 0,
        }))
        .filter((column) => Number.isFinite(column.avgDays) && column.avgDays > 0);

      if (normalizedFlowStatuses.length > 0) {
        columns.sort((left, right) => {
          const leftOrder = flowOrder.get(normalizeText(left.name)) ?? Number.MAX_SAFE_INTEGER;
          const rightOrder = flowOrder.get(normalizeText(right.name)) ?? Number.MAX_SAFE_INTEGER;
          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }
          return right.avgDays - left.avgDays;
        });
      }

      return { period, columns };
    })
    .filter((entry) => entry.columns.length > 0)
    .sort((a, b) => a.period.localeCompare(b.period));
}

function resolveBottleneckFlowStatuses(config: TeamConfig): string[] {
  const explicitFlowStatuses = normalizeStatusList(config.bottleneckConfig?.flowStatuses ?? []);
  if (explicitFlowStatuses.length > 0) {
    return explicitFlowStatuses;
  }

  return normalizeStatusList([
    ...(config.workflowConfig?.activeStatuses ?? []),
    ...(config.workflowConfig?.implementingStatuses ?? []),
  ]);
}

function isCancelledLikeStatusName(statusName: string): boolean {
  const normalized = normalizeText(statusName);
  return ["cancel", "abandon", "won't do", "wont do", "reject", "declin", "duplicate", "obsolete"].some((hint) =>
    normalized.includes(hint),
  );
}

function normalizeStatusList(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  values.forEach((value) => {
    const trimmed = value.trim();
    const key = normalizeText(trimmed);
    if (!trimmed || seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push(trimmed);
  });

  return normalized;
}

function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function getIssueKeyAliases(issue: ParsedIssue): string[] {
  return [issue.issueKey, ...(issue.previousIssueKeys ?? [])].map(normalizeText).filter(Boolean);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
