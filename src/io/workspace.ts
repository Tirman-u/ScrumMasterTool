import { promises as fs } from "node:fs";
import path from "node:path";
import { parseCsv, parseDate, parseNumber } from "./csv.js";
import { type ParsedIssue, type TeamConfig, type WorkspaceConfig } from "../types/contracts.js";

export interface TeamLoadResult {
  teamId: string;
  teamPath: string;
  teamConfig: TeamConfig;
  totalRows: number;
  issues: ParsedIssue[];
}

export interface WorkspaceLoadResult {
  workspacePath: string;
  workspaceConfig: WorkspaceConfig;
  teams: TeamLoadResult[];
}

interface ResolvedCsvMapping {
  key: string;
  created: string;
  resolutionDate: string;
  updated: string;
  status: string;
  resolution: string;
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
    const loadedTeam = await loadTeam(path.join(teamsPath, teamId), teamId);
    teams.push(loadedTeam);
  }

  return {
    workspacePath: resolvedWorkspace,
    workspaceConfig,
    teams,
  };
}

export async function writeTeamCache(teamPath: string, parsedIssues: ParsedIssue[], metrics: unknown): Promise<void> {
  const cachePath = path.join(teamPath, "cache");
  await fs.mkdir(cachePath, { recursive: true });

  const parsedPath = path.join(cachePath, "parsed.json");
  const metricsPath = path.join(cachePath, "metrics.json");

  const parsedPayload = parsedIssues.map((issue) => ({
    ...issue,
    created: issue.created?.toISOString() ?? null,
    resolutionDate: issue.resolutionDate?.toISOString() ?? null,
    updated: issue.updated?.toISOString() ?? null,
  }));

  await fs.writeFile(parsedPath, JSON.stringify(parsedPayload, null, 2), "utf-8");
  await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2), "utf-8");
}

async function loadTeam(teamPath: string, teamId: string): Promise<TeamLoadResult> {
  const teamConfigPath = path.join(teamPath, "team.json");
  const teamConfig = await readJsonFile<TeamConfig>(teamConfigPath, false);

  const importsPath = await resolveImportsPath(teamPath);
  const csvFiles = await collectCsvFiles(importsPath);

  const issues: ParsedIssue[] = [];
  let totalRows = 0;

  for (const file of csvFiles) {
    const filePath = path.join(importsPath, file);
    const csvText = await fs.readFile(filePath, "utf-8");
    const parsed = parseCsv(csvText);
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
  const updated = parseDate(row[mapping.updated]);
  const resolved = parseDate(row[mapping.resolutionDate]);
  const resolutionDate =
    teamConfig.cycleTimeConfig?.endDateSource === "updatedOnly"
      ? updated
      : resolved ?? updated;
  const status = row[mapping.status] ?? "";
  const resolution = row[mapping.resolution] ?? "";
  const issueType =
    (mapping.issueType ? row[mapping.issueType] : row["Issue Type"] ?? row["Issuetype"]) ?? "";
  const storyPoints = mapping.storyPoints ? parseNumber(row[mapping.storyPoints]) : null;
  const sprintRaw = mapping.sprint ? (row[mapping.sprint] ?? "") : "";

  return {
    issueKey,
    created,
    resolutionDate,
    updated,
    status,
    resolution,
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
    created: resolveExactHeader(headers, mapping.created) ?? mapping.created,
    resolutionDate: resolveExactHeader(headers, mapping.resolutionDate) ?? mapping.resolutionDate,
    updated: resolveExactHeader(headers, mapping.updated) ?? mapping.updated,
    status: resolveExactHeader(headers, mapping.status) ?? mapping.status,
    resolution: resolveExactHeader(headers, mapping.resolution) ?? mapping.resolution,
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
