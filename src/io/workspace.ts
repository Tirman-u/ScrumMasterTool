import { promises as fs } from "node:fs";
import path from "node:path";
import { parseCsv, parseDate, parseNumber } from "./csv.js";
import { type BottleneckEntry, type ParsedIssue, type TeamConfig, type WorkspaceConfig } from "../types/contracts.js";

export interface TeamLoadResult {
  teamId: string;
  teamPath: string;
  teamConfig: TeamConfig;
  totalRows: number;
  issues: ParsedIssue[];
  timeInStatusIssueRows: Array<{
    issueKey: string;
    durationBasis?: "calendar-days" | "working-days";
    durations: Array<{ status: string; days: number }>;
  }>;
}

export interface WorkspaceLoadResult {
  workspacePath: string;
  workspaceConfig: WorkspaceConfig;
  teams: TeamLoadResult[];
}

interface ResolvedCsvMapping {
  key: string;
  previousIssueKeys?: string;
  projectEnteredAt?: string;
  created: string;
  resolutionDate: string;
  updated: string;
  status: string;
  resolution: string;
  assignee?: string;
  storyPoints?: string;
  sprint?: string;
  issueType?: string;
}

export async function loadWorkspace(workspacePath: string): Promise<WorkspaceLoadResult> {
  const resolvedWorkspace = path.resolve(workspacePath);

  const workspaceConfig = await readJsonFile<WorkspaceConfig>(path.join(resolvedWorkspace, "workspace.json"), true);
  const teamsPath = await resolveTeamsPath(resolvedWorkspace);
  const teamIds = await listDirectories(teamsPath);

  const teams: TeamLoadResult[] = [];
  for (const teamId of teamIds) {
    const teamPath = path.join(teamsPath, teamId);
    if (!(await pathExists(path.join(teamPath, "team.json")))) {
      continue;
    }

    const loadedTeam = await loadTeam(teamPath, teamId);
    teams.push(loadedTeam);
  }

  return {
    workspacePath: resolvedWorkspace,
    workspaceConfig,
    teams,
  };
}

export async function writeTeamCache(
  teamPath: string,
  parsedIssues: ParsedIssue[],
  metrics: unknown,
  autoBottleneckEntries: BottleneckEntry[] = [],
  autoTimeInStatusEntries: BottleneckEntry[] = [],
): Promise<void> {
  const cachePath = path.join(teamPath, "cache");
  await fs.mkdir(cachePath, { recursive: true });

  const parsedPath = path.join(cachePath, "parsed.json");
  const metricsPath = path.join(cachePath, "metrics.json");
  const bottleneckPath = path.join(cachePath, "bottleneck-auto.json");
  const timeInStatusPath = path.join(cachePath, "time-in-status-auto.json");

  const parsedPayload = parsedIssues.map((issue) => ({
    ...issue,
    previousIssueKeys: issue.previousIssueKeys ?? [],
    created: issue.created?.toISOString() ?? null,
    projectEnteredAt: issue.projectEnteredAt?.toISOString() ?? null,
    resolutionDate: issue.resolutionDate?.toISOString() ?? null,
    updated: issue.updated?.toISOString() ?? null,
  }));

  await fs.writeFile(parsedPath, JSON.stringify(parsedPayload, null, 2), "utf-8");
  await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2), "utf-8");
  await fs.writeFile(bottleneckPath, JSON.stringify(autoBottleneckEntries, null, 2), "utf-8");
  await fs.writeFile(timeInStatusPath, JSON.stringify(autoTimeInStatusEntries, null, 2), "utf-8");
}

async function loadTeam(teamPath: string, teamId: string): Promise<TeamLoadResult> {
  const teamConfigPath = path.join(teamPath, "team.json");
  const teamConfig = await readJsonFile<TeamConfig>(teamConfigPath, false);

  const importsPath = await resolveImportsPath(teamPath);
  const csvFiles = await collectCsvFiles(importsPath);

  const issues: ParsedIssue[] = [];
  const timeInStatusIssueRows: TeamLoadResult["timeInStatusIssueRows"] = [];
  let totalRows = 0;

  for (const file of csvFiles) {
    const filePath = path.join(importsPath, file);
    const csvText = await fs.readFile(filePath, "utf-8");
    const parsed = parseCsv(csvText);
    if (isTimeInStatusCsv(parsed.headers, parsed.rows)) {
      timeInStatusIssueRows.push(...parseTimeInStatusIssueRows(parsed.headers, parsed.rows));
      continue;
    }

    const resolvedMapping = resolveCsvMapping(teamConfig, parsed.headers, parsed.rows);

    totalRows += parsed.rows.length;

    parsed.rows.forEach((row, index) => {
      const issue = mapRowToIssue(row, file, index + 2, teamConfig, resolvedMapping);
      if (issue) {
        issues.push(issue);
      }
    });
  }

  return {
    teamId,
    teamPath,
    teamConfig,
    totalRows,
    issues,
    timeInStatusIssueRows,
  };
}

function mapRowToIssue(
  row: Record<string, string>,
  sourceFile: string,
  sourceRow: number,
  teamConfig: TeamConfig,
  mapping: ResolvedCsvMapping,
): ParsedIssue | null {
  const issueKey = (row[mapping.key] ?? "").trim();
  if (!issueKey) {
    return null;
  }

  const created = parseDate(row[mapping.created]);
  const projectEnteredAt = mapping.projectEnteredAt ? parseDate(row[mapping.projectEnteredAt]) : null;
  const updated = parseDate(row[mapping.updated]);
  const resolved = parseDate(row[mapping.resolutionDate]);
  const resolutionDate =
    teamConfig.cycleTimeConfig?.endDateSource === "updatedOnly"
      ? updated
      : resolved ?? updated;
  const status = row[mapping.status] ?? "";
  const resolution = row[mapping.resolution] ?? "";
  const assignee = mapping.assignee ? row[mapping.assignee] ?? "" : row["Assignee"] ?? "";
  const issueType =
    (mapping.issueType ? row[mapping.issueType] : row["Issue Type"] ?? row["Issuetype"]) ?? "";
  const storyPoints = mapping.storyPoints ? parseNumber(row[mapping.storyPoints]) : null;
  const sprintRaw = mapping.sprint ? (row[mapping.sprint] ?? "") : "";

  return {
    issueKey,
    previousIssueKeys: parseIssueKeyList(mapping.previousIssueKeys ? row[mapping.previousIssueKeys] : undefined),
    created,
    projectEnteredAt,
    resolutionDate,
    updated,
    status,
    resolution,
    assignee,
    issueType,
    storyPoints,
    sprintRaw,
    sourceFile,
    sourceRow,
  };
}

function resolveCsvMapping(
  config: TeamConfig,
  headers: string[],
  rows: Array<Record<string, string>>,
): ResolvedCsvMapping {
  const mapping = config.mapping;

  return {
    key: resolveExactHeader(headers, mapping.key) ?? mapping.key,
    previousIssueKeys:
      resolveHeaderFromCandidates(headers, rows, {
        match: (header) => {
          const normalized = normalizeHeaderToken(header);
          return normalized === "previousissuekeys" || normalized === "previouskeys";
        },
        sampleScore: (header, sampleRows) =>
          sampleRows.reduce((count, row) => count + ((row[header] ?? "").trim().length > 0 ? 1 : 0), 0),
      }) ?? undefined,
    projectEnteredAt:
      resolveHeaderFromCandidates(headers, rows, {
        match: (header) => {
          const normalized = normalizeHeaderToken(header);
          return (
            normalized === "projectentered" ||
            normalized === "projectenteredat" ||
            normalized === "movedtoprojectat"
          );
        },
        sampleScore: (header, sampleRows) =>
          sampleRows.reduce((count, row) => count + (parseDate(row[header]) !== null ? 1 : 0), 0),
      }) ?? undefined,
    created: resolveExactHeader(headers, mapping.created) ?? mapping.created,
    resolutionDate: resolveExactHeader(headers, mapping.resolutionDate) ?? mapping.resolutionDate,
    updated: resolveExactHeader(headers, mapping.updated) ?? mapping.updated,
    status: resolveExactHeader(headers, mapping.status) ?? mapping.status,
    resolution: resolveExactHeader(headers, mapping.resolution) ?? mapping.resolution,
    assignee:
      resolveExactHeader(headers, mapping.assignee) ??
      resolveHeaderFromCandidates(headers, rows, {
        match: (header) => normalizeHeaderToken(header) === "assignee",
        sampleScore: (header, sampleRows) =>
          sampleRows.reduce((count, row) => count + ((row[header] ?? "").trim().length > 0 ? 1 : 0), 0),
      }) ??
      undefined,
    issueType:
      resolveExactHeader(headers, mapping.issueType) ??
      resolveHeaderFromCandidates(headers, rows, {
        match: (header) => {
          const normalized = normalizeHeaderToken(header);
          return normalized === "issuetype" || normalized.endsWith("issuetype");
        },
        sampleScore: () => 0,
      }) ??
      mapping.issueType,
    storyPoints:
      resolveExactHeader(headers, mapping.storyPoints) ??
      resolveHeaderFromCandidates(headers, rows, {
        match: (header) => {
          const normalized = normalizeHeaderToken(header);
          return normalized.includes("story") && normalized.includes("point");
        },
        sampleScore: (header, sampleRows) =>
          sampleRows.reduce((count, row) => count + (parseNumber(row[header]) !== null ? 1 : 0), 0),
      }) ??
      undefined,
    sprint:
      resolveExactHeader(headers, mapping.sprint) ??
      resolveHeaderFromCandidates(headers, rows, {
        match: (header) => normalizeHeaderToken(header).includes("sprint"),
        sampleScore: (header, sampleRows) =>
          sampleRows.reduce((count, row) => count + ((row[header] ?? "").trim().length > 0 ? 1 : 0), 0),
      }) ??
      undefined,
  };
}

function resolveExactHeader(headers: string[], preferred: string | undefined): string | undefined {
  const normalizedPreferred = normalizeHeaderToken(preferred);
  if (!normalizedPreferred) {
    return undefined;
  }

  return headers.find((header) => normalizeHeaderToken(header) === normalizedPreferred);
}

function resolveHeaderFromCandidates(
  headers: string[],
  rows: Array<Record<string, string>>,
  options: {
    match: (header: string) => boolean;
    sampleScore: (header: string, sampleRows: Array<Record<string, string>>) => number;
  },
): string | undefined {
  const sampleRows = rows.slice(0, 50);

  const scored = headers
    .filter((header) => options.match(header))
    .map((header) => {
      const normalized = normalizeHeaderToken(header);
      const baseScore =
        normalized === "sprint" || normalized === "storypoints" || normalized === "storypointestimate"
          ? 200
          : normalized.includes("customfield")
            ? 140
            : 120;

      return {
        header,
        score: baseScore + options.sampleScore(header, sampleRows),
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.header.localeCompare(right.header);
    });

  return scored[0]?.header;
}

function normalizeHeaderToken(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseIssueKeyList(value: string | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  (value ?? "")
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push(item);
    });

  return result;
}

function isTimeInStatusCsv(headers: string[], rows: Array<Record<string, string>>): boolean {
  if (headers.length === 0 || rows.length === 0) {
    return false;
  }

  return detectDurationHeaders(headers, rows).length >= 2;
}

function parseTimeInStatusIssueRows(
  headers: string[],
  rows: Array<Record<string, string>>,
): TeamLoadResult["timeInStatusIssueRows"] {
  const issueKeyHeader = resolveExactHeader(headers, "Key") ?? resolveExactHeader(headers, "Issue key");
  if (!issueKeyHeader) {
    return [];
  }

  const durationHeaders = detectDurationHeaders(headers, rows);
  const durationBasisHeader = resolveExactHeader(headers, "Duration basis");
  const records = new Map<
    string,
    {
      issueKey: string;
      durationBasis: "calendar-days" | "working-days";
      durations: Array<{ status: string; days: number }>;
    }
  >();

  rows.forEach((row) => {
    const issueKey = (row[issueKeyHeader] ?? "").trim();
    if (!issueKey || isSummaryTimeInStatusRow(row)) {
      return;
    }

    const durations = durationHeaders
      .map((header) => {
        const days = parseTimeInStatusDurationDays(row[header]);
        return days !== null && days > 0 ? { status: header.trim(), days } : null;
      })
      .filter((item): item is { status: string; days: number } => item !== null);

    if (durations.length > 0) {
      records.set(normalizeHeaderToken(issueKey), {
        issueKey,
        durationBasis:
          durationBasisHeader && normalizeHeaderToken(row[durationBasisHeader]) === "workingdays"
            ? "working-days"
            : "calendar-days",
        durations,
      });
    }
  });

  return Array.from(records.values());
}

function detectDurationHeaders(headers: string[], rows: Array<Record<string, string>>): string[] {
  const candidates = headers.filter((header) => !isTimeInStatusMetadataHeader(header));
  const counts = new Map<string, number>();

  rows.slice(0, 300).forEach((row) => {
    candidates.forEach((header) => {
      if (parseTimeInStatusDurationDays(row[header]) !== null) {
        counts.set(header, (counts.get(header) ?? 0) + 1);
      }
    });
  });

  return candidates.filter((header) => (counts.get(header) ?? 0) > 0);
}

function parseTimeInStatusDurationDays(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase().replace(/\u00a0/g, " ").replace(/,/g, ".").trim();
  if (!normalized || normalized === "-" || normalized === "n/a") {
    return null;
  }

  const unitPattern = /(\d+(?:\.\d+)?)\s*(w(?:eeks?)?|d(?:ays?)?|h(?:ours?)?|m(?:in(?:ute)?s?)?)/gi;
  let match: RegExpExecArray | null = unitPattern.exec(normalized);
  let parsedAny = false;
  let totalDays = 0;

  while (match) {
    parsedAny = true;
    const amount = Number.parseFloat(match[1]);
    const unit = match[2][0];

    if (Number.isFinite(amount) && amount >= 0) {
      if (unit === "w") totalDays += amount * 7;
      if (unit === "d") totalDays += amount;
      if (unit === "h") totalDays += amount / 24;
      if (unit === "m") totalDays += amount / 1440;
    }

    match = unitPattern.exec(normalized);
  }

  return parsedAny ? totalDays : null;
}

function isTimeInStatusMetadataHeader(header: string): boolean {
  const normalized = normalizeHeaderToken(header);
  return [
    "type",
    "key",
    "issuekey",
    "summary",
    "created",
    "updated",
    "resolutiondate",
    "resolved",
    "status",
    "resolution",
    "durationbasis",
  ].includes(normalized);
}

function isSummaryTimeInStatusRow(row: Record<string, string>): boolean {
  return Object.values(row).some((value) => normalizeHeaderToken(value).includes("averagetimetaken"));
}

async function resolveTeamsPath(workspacePath: string): Promise<string> {
  const candidatePaths = [path.join(workspacePath, "teams"), path.join(workspacePath, "Teams")];
  for (const candidate of candidatePaths) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No teams folder found under ${workspacePath}`);
}

async function resolveImportsPath(teamPath: string): Promise<string> {
  const candidatePaths = [path.join(teamPath, "imports"), path.join(teamPath, "Imports")];
  for (const candidate of candidatePaths) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No imports folder found under ${teamPath}`);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listDirectories(rootPath: string): Promise<string[]> {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function collectCsvFiles(rootPath: string, prefix = ""): Promise<string[]> {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv")) {
      files.push(`${prefix}${entry.name}`);
      continue;
    }

    if (entry.isDirectory()) {
      const nested = await collectCsvFiles(path.join(rootPath, entry.name), `${prefix}${entry.name}/`);
      files.push(...nested);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function readJsonFile<T>(filePath: string, optional: boolean): Promise<T> {
  try {
    const contents = await fs.readFile(filePath, "utf-8");
    return JSON.parse(contents) as T;
  } catch (error) {
    if (optional && isFileNotFound(error)) {
      return {} as T;
    }
    throw error;
  }
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "ENOENT";
}
