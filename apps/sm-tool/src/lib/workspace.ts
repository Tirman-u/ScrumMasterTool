import { parseCsv, parseDate, parseNumber } from "./csv";
import {
  buildMetrics,
  buildWaitingTimeSnapshot,
  buildSleValues,
  dedupeIssuesByLatestUpdate,
  dedupeTimeInStatusRowsByLatest,
  isDone,
} from "./metrics";
import {
  buildAutoBottleneckEntriesFromIssueRows,
  isTimeInStatusCsv,
  parseTimeInStatusIssueRows,
} from "./time-in-status";
import { calendarDurationToWorkingDays } from "./working-days";
import {
  type ImportBucket,
  type ImportFileInfo,
  type BottleneckEntry,
  type MetricScope,
  type ParsedIssue,
  type TeamConfig,
  type TeamEntityType,
  type TeamMetrics,
  type TeamProgressSnapshot,
  type WorkspaceConfig,
  type WorkspaceProfileConfig,
  type TeamRuntime,
} from "../types/contracts";

interface CsvFileEntry {
  relativePath: string;
  handle: FileSystemFileHandle;
}

interface ImportScanResult {
  files: ImportFileInfo[];
  buckets: ImportBucket[];
}

export interface TeamImportManifestEntry {
  relativePath: string;
  size: number | null;
  modifiedAt: number | null;
  digest: string | null;
  status: "ready" | "unstable" | "unavailable";
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
  parent?: string;
}

const WORKSPACE_DB_NAME = "sm-tool";
const WORKSPACE_DB_VERSION = 1;
const WORKSPACE_STORE = "settings";
const WORKSPACE_KEY = "workspace-handle-v1";
const WORKSPACE_LIST_KEY = "workspace-handle-list-v1";
const MAX_REMEMBERED_WORKSPACES = 12;
const TEAM_PROGRESS_HISTORY_FILE = "progress-history.json";
const TEAM_PROGRESS_HISTORY_LIMIT = 120;
const METRIC_SCOPES: MetricScope[] = ["team", "value-stream", "art", "portfolio"];
const fileWriteQueues = new WeakMap<object, Promise<void>>();

async function withFileWriteMutex<T>(handle: object, operation: () => Promise<T>): Promise<T> {
  const previous = fileWriteQueues.get(handle) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  fileWriteQueues.set(handle, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (fileWriteQueues.get(handle) === queued) fileWriteQueues.delete(handle);
  }
}

interface RememberedWorkspaceRecord {
  id: string;
  name: string;
  lastUsedAt: string;
  handle: FileSystemDirectoryHandle;
}

export interface RememberedWorkspaceSummary {
  id: string;
  name: string;
  lastUsedAt: string;
}

export interface SaveTeamProgressResult {
  saved: boolean;
  history: TeamProgressSnapshot[];
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickWorkspaceDirectory(): Promise<FileSystemDirectoryHandle> {
  return await window.showDirectoryPicker({ mode: "readwrite" });
}

export async function rememberWorkspaceDirectory(workspaceHandle: FileSystemDirectoryHandle): Promise<void> {
  await withSettingsStore("readwrite", (store) => store.put(workspaceHandle, WORKSPACE_KEY));
  const records = await readRememberedWorkspaceRecords();
  const index = await findRememberedWorkspaceIndex(records, workspaceHandle);
  const now = new Date().toISOString();

  if (index >= 0) {
    const current = records[index];
    records.splice(index, 1);
    records.unshift({
      ...current,
      name: workspaceHandle.name,
      lastUsedAt: now,
      handle: workspaceHandle,
    });
  } else {
    records.unshift({
      id: createWorkspaceRecordId(),
      name: workspaceHandle.name,
      lastUsedAt: now,
      handle: workspaceHandle,
    });
  }

  const trimmed = records.slice(0, MAX_REMEMBERED_WORKSPACES);
  await withSettingsStore("readwrite", (store) => store.put(trimmed, WORKSPACE_LIST_KEY));
}

export async function clearRememberedWorkspaceDirectory(): Promise<void> {
  await withSettingsStore("readwrite", (store) => store.delete(WORKSPACE_KEY));
}

export async function restoreRememberedWorkspaceDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await withSettingsStore("readonly", (store) => store.get(WORKSPACE_KEY));

  if (!handle || !isDirectoryHandle(handle)) {
    return null;
  }

  try {
    const readwrite = await handle.queryPermission({ mode: "readwrite" });
    if (readwrite === "granted") {
      return handle;
    }

    const readonly = await handle.queryPermission({ mode: "read" });
    if (readonly === "granted") {
      return handle;
    }

    return null;
  } catch {
    return null;
  }
}

export async function ensureWorkspaceWritePermission(workspaceHandle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const current = await workspaceHandle.queryPermission({ mode: "readwrite" });
    if (current === "granted") {
      return true;
    }

    return (await workspaceHandle.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

export async function listRememberedWorkspaces(): Promise<RememberedWorkspaceSummary[]> {
  const records = await readRememberedWorkspaceRecords();

  return records
    .slice()
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    .map((record) => ({
      id: record.id,
      name: record.name,
      lastUsedAt: record.lastUsedAt,
    }));
}

export async function openRememberedWorkspaceById(
  workspaceId: string,
): Promise<FileSystemDirectoryHandle | null> {
  const records = await readRememberedWorkspaceRecords();
  const record = records.find((item) => item.id === workspaceId);
  if (!record) {
    return null;
  }

  const handle = record.handle;
  if (!isDirectoryHandle(handle)) {
    return null;
  }

  try {
    const readwrite = await handle.queryPermission({ mode: "readwrite" });
    if (readwrite === "granted") {
      await rememberWorkspaceDirectory(handle);
      return handle;
    }

    const readonly = await handle.queryPermission({ mode: "read" });
    if (readonly === "granted") {
      await rememberWorkspaceDirectory(handle);
      return handle;
    }

    const askReadwrite = await handle.requestPermission({ mode: "readwrite" });
    if (askReadwrite === "granted") {
      await rememberWorkspaceDirectory(handle);
      return handle;
    }

    const askRead = await handle.requestPermission({ mode: "read" });
    if (askRead === "granted") {
      await rememberWorkspaceDirectory(handle);
      return handle;
    }

    return null;
  } catch {
    return null;
  }
}

export async function loadWorkspaceConfig(workspaceHandle: FileSystemDirectoryHandle): Promise<WorkspaceConfig> {
  const raw = await readJsonFile<Record<string, unknown>>(workspaceHandle, "workspace.json");
  return normalizeWorkspaceConfig(raw, workspaceHandle.name);
}

export async function saveWorkspaceConfig(
  workspaceHandle: FileSystemDirectoryHandle,
  config: WorkspaceConfig,
): Promise<void> {
  const normalized = normalizeWorkspaceConfig(config as Record<string, unknown>, workspaceHandle.name);
  await writeJsonFile(workspaceHandle, "workspace.json", normalized);
}

export async function listTeams(workspaceHandle: FileSystemDirectoryHandle): Promise<TeamRuntime[]> {
  const teamsDir = await ensureTeamsDirectory(workspaceHandle);
  const teams: TeamRuntime[] = [];

  for await (const [name, handle] of teamsDir.entries()) {
    if (handle.kind !== "directory") {
      continue;
    }

    const config = await readJsonFile<TeamConfig>(handle, "team.json");
    if (!config) {
      continue;
    }

    const metrics = await readTeamMetrics(handle);
    const parsedIssues = await readTeamParsedIssues(handle);
    const manualBottleneck = await readTeamBottleneckEntries(handle);
    const autoBottleneck = await readTeamAutoBottleneckEntries(handle);
    const autoTimeInStatus = await readTeamAutoTimeInStatusEntries(handle, autoBottleneck);
    const progressHistory = await readTeamProgressHistoryFromHandle(handle);
    const importScan = await scanImportData(handle);

    teams.push({
      teamId: name,
      teamHandle: handle,
      config,
      metrics,
      parsedIssues,
      manualBottleneck,
      autoBottleneck,
      autoTimeInStatus,
      importBuckets: importScan.buckets,
      importFiles: importScan.files,
      progressHistory,
    });
  }

  teams.sort((a, b) => a.config.teamName.localeCompare(b.config.teamName));
  return teams;
}

export async function addTeam(
  workspaceHandle: FileSystemDirectoryHandle,
  teamName: string,
  description?: string,
  entityType: TeamEntityType = "team",
  jiraJql?: string,
): Promise<TeamRuntime> {
  const teamsDir = await ensureTeamsDirectory(workspaceHandle);

  const existingIds: string[] = [];
  for await (const [name, handle] of teamsDir.entries()) {
    if (handle.kind === "directory") {
      existingIds.push(name);
    }
  }

  const baseId = slugify(teamName || "new-team");
  const teamId = uniqueName(baseId, new Set(existingIds));

  const teamHandle = await teamsDir.getDirectoryHandle(teamId, { create: true });
  await teamHandle.getDirectoryHandle("imports", { create: true });
  await teamHandle.getDirectoryHandle("cache", { create: true });
  await teamHandle.getDirectoryHandle("manual", { create: true });

  const config = buildDefaultTeamConfig(teamName || teamId, description, entityType, jiraJql);
  await writeJsonFile(teamHandle, "team.json", config);

  return {
    teamId,
    teamHandle,
    config,
    metrics: null,
    parsedIssues: [],
    manualBottleneck: [],
    autoBottleneck: [],
    autoTimeInStatus: [],
    importBuckets: [],
    importFiles: [],
    progressHistory: [],
  };
}

export async function saveTeamConfig(team: TeamRuntime): Promise<void> {
  await writeJsonFile(team.teamHandle, "team.json", team.config);
}

export async function saveTeamBottleneckEntries(
  team: TeamRuntime,
  entries: BottleneckEntry[],
): Promise<void> {
  const manualDir = await team.teamHandle.getDirectoryHandle("manual", { create: true });
  const normalized = entries
    .filter((entry) => /^\d{4}-\d{2}$/.test(entry.period))
    .map((entry) => ({
      period: entry.period,
      columns: entry.columns
        .map((column) => ({
          name: column.name.trim(),
          avgDays: Number(column.avgDays),
        }))
        .filter((column) => column.name.length > 0 && Number.isFinite(column.avgDays) && column.avgDays >= 0),
      notes: entry.notes?.trim() || undefined,
      updatedAt: entry.updatedAt ?? new Date().toISOString(),
    }))
    .filter((entry) => entry.columns.length > 0)
    .sort((a, b) => a.period.localeCompare(b.period));

  await writeJsonFile(manualDir, "bottleneck.json", normalized);
}

export async function readTeamProgressHistory(team: TeamRuntime): Promise<TeamProgressSnapshot[]> {
  return await readTeamProgressHistoryFromHandle(team.teamHandle);
}

export async function saveTeamProgressSnapshot(
  team: TeamRuntime,
  snapshot: TeamProgressSnapshot,
): Promise<SaveTeamProgressResult> {
  const cacheDir = await team.teamHandle.getDirectoryHandle("cache", { create: true });
  const existing = await readTeamProgressHistoryFromHandle(team.teamHandle);
  const normalizedSnapshot = normalizeTeamProgressSnapshot(snapshot as unknown as Record<string, unknown>);
  if (!normalizedSnapshot) {
    return {
      saved: false,
      history: existing,
    };
  }

  const latest = existing[existing.length - 1] ?? null;
  if (latest && latest.importSignature === normalizedSnapshot.importSignature) {
    return {
      saved: false,
      history: existing,
    };
  }

  const nextHistory = [...existing, normalizedSnapshot].slice(-TEAM_PROGRESS_HISTORY_LIMIT);
  await writeJsonFile(cacheDir, TEAM_PROGRESS_HISTORY_FILE, nextHistory);

  return {
    saved: true,
    history: nextHistory,
  };
}

export async function pickCsvFiles(): Promise<FileSystemFileHandle[]> {
  return await window.showOpenFilePicker({
    multiple: true,
    types: [
      {
        description: "CSV files",
        accept: {
          "text/csv": [".csv"],
          "application/vnd.ms-excel": [".csv"],
        },
      },
    ],
  });
}

export async function importCsvFiles(
  team: TeamRuntime,
  fileHandles: FileSystemFileHandle[],
  importBucket: string | null,
): Promise<void> {
  const importsDir = await team.teamHandle.getDirectoryHandle("imports", { create: true });
  const destinationDir = importBucket
    ? await ensureNestedDirectories(importsDir, sanitizeImportBucket(importBucket))
    : importsDir;
  const existingFileNames = await collectExistingFileNames(destinationDir);

  for (const sourceFileHandle of fileHandles) {
    const file = await sourceFileHandle.getFile();
    const destinationName = buildUniqueImportFileName(existingFileNames, sanitizeFileName(file.name));
    existingFileNames.add(destinationName.toLowerCase());
    const destinationHandle = await destinationDir.getFileHandle(destinationName, { create: true });
    const writable = await destinationHandle.createWritable();
    await writable.write(await file.text());
    await writable.close();
  }
}

export interface CsvImportContent {
  name: string;
  text: string;
}

export async function importCsvContents(
  team: TeamRuntime,
  files: CsvImportContent[],
  importBucket: string | null,
): Promise<void> {
  const importsDir = await team.teamHandle.getDirectoryHandle("imports", { create: true });
  const destinationDir = importBucket
    ? await ensureNestedDirectories(importsDir, sanitizeImportBucket(importBucket))
    : importsDir;
  const existingFileNames = await collectExistingFileNames(destinationDir);

  for (const file of files) {
    const destinationName = buildUniqueImportFileName(existingFileNames, sanitizeFileName(file.name));
    existingFileNames.add(destinationName.toLowerCase());
    const destinationHandle = await destinationDir.getFileHandle(destinationName, { create: true });
    const writable = await destinationHandle.createWritable();
    await writable.write(file.text);
    await writable.close();
  }
}

export async function analyzeTeam(team: TeamRuntime): Promise<TeamMetrics> {
  const importsDir = await team.teamHandle.getDirectoryHandle("imports", { create: true });
  const cacheDir = await team.teamHandle.getDirectoryHandle("cache", { create: true });

  const issues: ParsedIssue[] = [];
  const timeInStatusIssueRows: ReturnType<typeof parseTimeInStatusIssueRows> = [];
  let totalRows = 0;

  const csvFiles = await collectCsvFilesRecursive(importsDir);
  const csvFilesWithMetadata = await Promise.all(
    csvFiles.map(async (entry) => {
      const file = await entry.handle.getFile();
      return {
        ...entry,
        file,
      };
    }),
  );

  csvFilesWithMetadata.sort((a, b) => {
    if (a.file.lastModified !== b.file.lastModified) {
      return a.file.lastModified - b.file.lastModified;
    }

    return a.relativePath.localeCompare(b.relativePath);
  });

  for (const csvFile of csvFilesWithMetadata) {
    if (await isZipArchiveFile(csvFile.file)) {
      continue;
    }

    const csvText = await csvFile.file.text();
    const parsed = parseCsv(csvText);

    if (parsed.rows.length === 0) {
      continue;
    }

    if (isTimeInStatusCsv(parsed.headers, parsed.rows)) {
      const fallbackPeriod = inferFallbackPeriod(csvFile.relativePath, csvFile.file.lastModified);
      const issueRows = parseTimeInStatusIssueRows({
        headers: parsed.headers,
        rows: parsed.rows,
        fallbackPeriod,
        includeAllStatuses: true,
      });
      timeInStatusIssueRows.push(...issueRows);

      continue;
    }

    const resolvedMapping = resolveCsvMapping(team.config, parsed.headers, parsed.rows);
    let fileIssueRows = 0;
    parsed.rows.forEach((row, index) => {
      const issue = mapRowToIssue(row, csvFile.relativePath, index + 2, team.config, resolvedMapping);
      if (issue) {
        issues.push(issue);
        fileIssueRows += 1;
      }
    });
    totalRows += fileIssueRows;
  }

  const deduped = dedupeIssuesByLatestUpdate(issues);
  const latestTimeInStatusIssueRows = dedupeTimeInStatusRowsByLatest(timeInStatusIssueRows, deduped);
  const metrics = buildMetrics(team.config, totalRows, deduped, {
    timeInStatusIssueRows: latestTimeInStatusIssueRows,
  });
  const bottleneckFlowStatuses = resolveBottleneckFlowStatuses(team.config);
  const doneIssuePeriodByKey = new Map<string, string>();
  deduped.forEach((issue) => {
    if (!isDone(issue, team.config)) {
      return;
    }

    const periodDate = issue.resolutionDate ?? issue.updated;
    if (!periodDate) {
      return;
    }

    getIssueKeyAliases(issue).forEach((key) => doneIssuePeriodByKey.set(key, monthKeyFromDate(periodDate)));
  });

  const autoBottleneckEntries = buildAutoBottleneckEntriesFromIssueRows({
    issueRows: latestTimeInStatusIssueRows,
    issuePeriodByKey: doneIssuePeriodByKey,
    flowStatuses: bottleneckFlowStatuses,
  });
  const autoTimeInStatusEntries = buildAutoBottleneckEntriesFromIssueRows({
    issueRows: latestTimeInStatusIssueRows,
    issuePeriodByKey: doneIssuePeriodByKey,
    includeAllStatuses: true,
  });

  const normalizedParsed = deduped.map((issue) => ({
    ...issue,
    previousIssueKeys: issue.previousIssueKeys ?? [],
    created: issue.created?.toISOString() ?? null,
    projectEnteredAt: issue.projectEnteredAt?.toISOString() ?? null,
    resolutionDate: issue.resolutionDate?.toISOString() ?? null,
    updated: issue.updated?.toISOString() ?? null,
  }));

  await writeJsonFile(cacheDir, "parsed.json", normalizedParsed);
  await writeJsonFile(cacheDir, "metrics.json", metrics);
  await writeJsonFile(
    cacheDir,
    "bottleneck-auto.json",
    autoBottleneckEntries,
  );
  await writeJsonFile(
    cacheDir,
    "time-in-status-auto.json",
    autoTimeInStatusEntries,
  );

  return metrics;
}

async function scanImportData(teamHandle: FileSystemDirectoryHandle): Promise<ImportScanResult> {
  const importsDir = await getDirectoryHandle(teamHandle, "imports");
  if (!importsDir) {
    return { files: [], buckets: [] };
  }

  const entries = await collectCsvFilesRecursive(importsDir);
  const files: ImportFileInfo[] = [];
  const bucketCounts = new Map<string, number>();

  for (const entry of entries) {
    const file = await entry.handle.getFile();
    const bucket = getBucketFromRelativePath(entry.relativePath);

    let rowCount = 0;
    try {
      if (await isZipArchiveFile(file)) {
        rowCount = 0;
      } else {
        rowCount = parseCsv(await file.text()).rows.length;
      }
    } catch {
      rowCount = 0;
    }

    files.push({
      name: file.name,
      relativePath: entry.relativePath,
      bucket,
      updatedAt: new Date(file.lastModified).toISOString(),
      rowCount,
    });

    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  }

  const buckets = Array.from(bucketCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, fileCount]) => ({ path, fileCount }));

  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return { files, buckets };
}

export async function scanTeamImportManifest(teamHandle: FileSystemDirectoryHandle): Promise<TeamImportManifestEntry[]> {
  const importsDir = await getDirectoryHandle(teamHandle, "imports");
  if (!importsDir) {
    return [];
  }

  const entries = await collectCsvFilesRecursive(importsDir);
  const manifest: TeamImportManifestEntry[] = [];
  for (const entry of entries) {
    try {
      const file = await entry.handle.getFile();
      if (file.size === 0) {
        manifest.push({ relativePath: entry.relativePath, size: 0, modifiedAt: file.lastModified, digest: null, status: "unstable" });
        continue;
      }

      const digest = await digestFile(file);
      manifest.push({ relativePath: entry.relativePath, size: file.size, modifiedAt: file.lastModified, digest, status: "ready" });
    } catch {
      manifest.push({ relativePath: entry.relativePath, size: null, modifiedAt: null, digest: null, status: "unavailable" });
    }
  }

  return manifest;
}

async function digestFile(file: File): Promise<string | null> {
  if (!globalThis.crypto?.subtle) {
    return null;
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function collectCsvFilesRecursive(
  dir: FileSystemDirectoryHandle,
  prefix = "",
): Promise<CsvFileEntry[]> {
  const items: CsvFileEntry[] = [];

  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "file") {
      if (name.toLowerCase().endsWith(".csv")) {
        items.push({
          relativePath: `${prefix}${name}`,
          handle,
        });
      }
      continue;
    }

    if (handle.kind === "directory") {
      const nested = await collectCsvFilesRecursive(handle, `${prefix}${name}/`);
      items.push(...nested);
    }
  }

  return items;
}

function getBucketFromRelativePath(relativePath: string): string {
  const slash = relativePath.indexOf("/");
  if (slash === -1) {
    return "Root";
  }

  return relativePath.slice(0, slash);
}

function inferFallbackPeriod(relativePath: string, lastModified: number): string {
  const monthMatch = relativePath.match(/(?:^|\/)(\d{4}-\d{2})(?:\/|$)/);
  if (monthMatch) {
    return monthMatch[1];
  }

  return monthKeyFromDate(new Date(lastModified));
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
    parent:
      resolveExactHeader(headers, mapping.parent) ??
      resolveHeaderFromCandidates(headers, rows, {
        match: (header) => {
          const normalized = normalizeHeaderToken(header);
          return normalized === "parent" || normalized.includes("epiclink") || normalized.includes("parentkey");
        },
        sampleScore: (header, sampleRows) => sampleRows.reduce((count, row) => count + ((row[header] ?? "").trim() ? 1 : 0), 0),
      }) ?? undefined,
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

function mapRowToIssue(
  row: Record<string, string>,
  sourceFile: string,
  sourceRow: number,
  config: TeamConfig,
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

  const cycleEnd =
    config.cycleTimeConfig?.endDateSource === "updatedOnly"
      ? updated
      : resolved ?? updated;

  return {
    issueKey,
    previousIssueKeys: parseIssueKeyList(mapping.previousIssueKeys ? row[mapping.previousIssueKeys] : undefined),
    created,
    projectEnteredAt,
    updated,
    resolutionDate: cycleEnd,
    status: row[mapping.status] ?? "",
    resolution: row[mapping.resolution] ?? "",
    assignee: mapping.assignee ? row[mapping.assignee] ?? "" : row["Assignee"] ?? "",
    issueType:
      (mapping.issueType ? row[mapping.issueType] : row["Issue Type"] ?? row["Issuetype"]) ?? "",
    parentIssueKey: mapping.parent ? row[mapping.parent]?.trim() || undefined : undefined,
    storyPoints: mapping.storyPoints ? parseNumber(row[mapping.storyPoints]) : null,
    sprintRaw: mapping.sprint ? row[mapping.sprint] ?? "" : "",
    sourceFile,
    sourceRow,
  };
}

async function isZipArchiveFile(file: File): Promise<boolean> {
  if (file.size < 4) {
    return false;
  }

  try {
    const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return (
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
      (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
    );
  } catch {
    return false;
  }
}

function monthKeyFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function getIssueKeyAliases(issue: ParsedIssue): string[] {
  return [issue.issueKey, ...(issue.previousIssueKeys ?? [])].map(normalizeIssueKey).filter(Boolean);
}

function normalizeIssueKey(value: string): string {
  return value.trim().toLowerCase();
}

async function ensureTeamsDirectory(workspaceHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  try {
    return await workspaceHandle.getDirectoryHandle("teams");
  } catch {
    try {
      return await workspaceHandle.getDirectoryHandle("Teams");
    } catch {
      return await workspaceHandle.getDirectoryHandle("teams", { create: true });
    }
  }
}

async function readTeamMetrics(teamHandle: FileSystemDirectoryHandle): Promise<TeamMetrics | null> {
  const cacheDir = await getDirectoryHandle(teamHandle, "cache");
  if (!cacheDir) {
    return null;
  }

  const raw = await readJsonFile<Record<string, unknown>>(cacheDir, "metrics.json");
  return normalizeTeamMetrics(raw);
}

async function readTeamParsedIssues(teamHandle: FileSystemDirectoryHandle): Promise<ParsedIssue[]> {
  const cacheDir = await getDirectoryHandle(teamHandle, "cache");
  if (!cacheDir) {
    return [];
  }

  const raw = await readJsonFile<Array<Record<string, unknown>>>(cacheDir, "parsed.json");
  if (!raw || !Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => parseCachedIssue(item))
    .filter((item): item is ParsedIssue => item !== null);
}

async function readTeamBottleneckEntries(teamHandle: FileSystemDirectoryHandle): Promise<BottleneckEntry[]> {
  const manualDir = await getDirectoryHandle(teamHandle, "manual");
  if (!manualDir) {
    return [];
  }

  const raw = await readJsonFile<Array<Record<string, unknown>>>(manualDir, "bottleneck.json");
  if (!raw || !Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => normalizeBottleneckEntry(entry))
    .filter((entry): entry is BottleneckEntry => entry !== null)
    .sort((a, b) => a.period.localeCompare(b.period));
}

async function readTeamAutoBottleneckEntries(teamHandle: FileSystemDirectoryHandle): Promise<BottleneckEntry[]> {
  const cacheDir = await getDirectoryHandle(teamHandle, "cache");
  if (!cacheDir) {
    return [];
  }

  const raw = await readJsonFile<Array<Record<string, unknown>>>(cacheDir, "bottleneck-auto.json");
  if (!raw || !Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => normalizeBottleneckEntry(entry))
    .filter((entry): entry is BottleneckEntry => entry !== null)
    .sort((a, b) => a.period.localeCompare(b.period));
}

async function readTeamAutoTimeInStatusEntries(
  teamHandle: FileSystemDirectoryHandle,
  fallbackEntries: BottleneckEntry[],
): Promise<BottleneckEntry[]> {
  const cacheDir = await getDirectoryHandle(teamHandle, "cache");
  if (!cacheDir) {
    return fallbackEntries;
  }

  const raw = await readJsonFile<Array<Record<string, unknown>>>(cacheDir, "time-in-status-auto.json");
  if (!raw || !Array.isArray(raw)) {
    return fallbackEntries;
  }

  const entries = raw
    .map((entry) => normalizeBottleneckEntry(entry))
    .filter((entry): entry is BottleneckEntry => entry !== null)
    .sort((a, b) => a.period.localeCompare(b.period));

  return entries.length > 0 ? entries : fallbackEntries;
}

async function readTeamProgressHistoryFromHandle(
  teamHandle: FileSystemDirectoryHandle,
): Promise<TeamProgressSnapshot[]> {
  const cacheDir = await getDirectoryHandle(teamHandle, "cache");
  if (!cacheDir) {
    return [];
  }

  const raw = await readJsonFile<Array<Record<string, unknown>>>(cacheDir, TEAM_PROGRESS_HISTORY_FILE);
  if (!raw || !Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => normalizeTeamProgressSnapshot(item))
    .filter((item): item is TeamProgressSnapshot => item !== null)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

function parseCachedIssue(value: Record<string, unknown>): ParsedIssue | null {
  const issueKey = typeof value.issueKey === "string" ? value.issueKey.trim() : "";
  if (!issueKey) {
    return null;
  }

  return {
    issueKey,
    previousIssueKeys: Array.isArray(value.previousIssueKeys)
      ? value.previousIssueKeys.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    created: parseIsoDate(value.created),
    projectEnteredAt: parseIsoDate(value.projectEnteredAt),
    resolutionDate: parseIsoDate(value.resolutionDate),
    updated: parseIsoDate(value.updated),
    status: typeof value.status === "string" ? value.status : "",
    parentIssueKey: typeof value.parentIssueKey === "string" ? value.parentIssueKey : undefined,
    resolution: typeof value.resolution === "string" ? value.resolution : "",
    assignee: typeof value.assignee === "string" ? value.assignee : "",
    issueType: typeof value.issueType === "string" ? value.issueType : "",
    storyPoints: typeof value.storyPoints === "number" && Number.isFinite(value.storyPoints) ? value.storyPoints : null,
    sprintRaw: typeof value.sprintRaw === "string" ? value.sprintRaw : "",
    sourceFile: typeof value.sourceFile === "string" ? value.sourceFile : "",
    sourceRow: typeof value.sourceRow === "number" && Number.isFinite(value.sourceRow) ? value.sourceRow : 0,
  };
}

export function normalizeTeamMetrics(raw: Record<string, unknown> | null): TeamMetrics | null {
  if (!raw) {
    return null;
  }

  const teamName = typeof raw.teamName === "string" ? raw.teamName : "";
  if (!teamName) {
    return null;
  }

  const cycleTimeDays = toNumberArray(raw.cycleTimeDays);
  const scatter = normalizeScatter(raw.scatter);
  const doneIssueDetails =
    normalizeDoneIssueDetails(raw.doneIssueDetails) ??
    scatter.map((point) => ({
      issueKey: point.issueKey,
      resolutionDate: point.resolutionDate,
      cycleTimeDays: point.cycleTimeDays,
      issueType: "",
      storyPoints: null,
      sprintCount: 0,
    }));

  const multiSprintIssueKeys = toStringArray(raw.multiSprintIssueKeys);
  const computedMultiSprintCount = doneIssueDetails.filter((item) => item.sprintCount >= 2).length;
  const multiSprintCount =
    getNestedNullableNumber(raw, "multiSprint", "count") ??
    (computedMultiSprintCount > 0 ? computedMultiSprintCount : multiSprintIssueKeys.length);
  const multiSprintPercentage =
    getNestedNullableNumber(raw, "multiSprint", "percentage") ??
    (doneIssueDetails.length === 0 ? 0 : (multiSprintCount / doneIssueDetails.length) * 100);

  const sleValues = normalizeSleValues(getNestedRecord(raw, "sle", "values"));
  const scatterOverlay = normalizeSleValues((raw.scatterOverlay as Record<string, unknown> | undefined) ?? null, sleValues);
  const doneIssues = toNonNegativeIntegerOrNull(raw.doneIssues) ?? doneIssueDetails.length;
  const cycleTimeCount = toNonNegativeIntegerOrNull(raw.cycleTimeCount) ?? cycleTimeDays.length;
  const uniqueIssues = toNonNegativeIntegerOrNull(raw.uniqueIssues) ?? Math.max(doneIssues, cycleTimeCount);
  const totalImportedRows = toNonNegativeIntegerOrNull(raw.totalImportedRows) ?? uniqueIssues;
  const generatedAt = typeof raw.generatedAt === "string" ? raw.generatedAt : new Date().toISOString();
  const normalizedFlowTimingDetails = normalizeFlowTimingDetails(raw.flowTimingDetails);
  const flowTimingDetails =
    raw.flowTimingBasis === "working-days"
      ? normalizedFlowTimingDetails
      : normalizedFlowTimingDetails.map((detail) => {
          const anchorDate = new Date(detail.anchorDate);
          return {
            ...detail,
            leadTimeDays: calendarDurationToWorkingDays(detail.leadTimeDays, anchorDate),
            activeTimeDays: calendarDurationToWorkingDays(detail.activeTimeDays, anchorDate),
            cycleTimeDays: calendarDurationToWorkingDays(detail.cycleTimeDays, anchorDate),
          };
        });
  const flowScatter = flowTimingDetails
    .filter(
      (detail) =>
        detail.scope === "closed" &&
        detail.cycleTimeDays !== null &&
        Number.isFinite(detail.cycleTimeDays) &&
        detail.cycleTimeDays >= 0,
    )
    .map((detail) => ({
      issueKey: detail.issueKey,
      resolutionDate: detail.anchorDate,
      cycleTimeDays: detail.cycleTimeDays as number,
    }))
    .sort((left, right) => left.resolutionDate.localeCompare(right.resolutionDate));
  const effectiveScatter = flowScatter.length > 0 ? flowScatter : scatter;
  const effectiveCycleTimeDays = effectiveScatter.map((point) => point.cycleTimeDays);
  const effectiveAvgCycleTimeDays =
    effectiveCycleTimeDays.length === 0
      ? null
      : effectiveCycleTimeDays.reduce((sum, value) => sum + value, 0) / effectiveCycleTimeDays.length;

  return {
    generatedAt,
    teamName,
    totalImportedRows,
    uniqueIssues,
    doneIssues,
    cycleTimeCount: effectiveCycleTimeDays.length,
    cycleTimeDays: effectiveCycleTimeDays,
    avgCycleTimeDays: effectiveAvgCycleTimeDays,
    sle: {
      percentiles: normalizePercentiles(getNestedArray(raw, "sle", "percentiles")),
      rounding: "ceil",
      values: sleValues,
    },
    scatter: effectiveScatter,
    scatterOverlay:
      flowScatter.length > 0 ? buildSleValues(effectiveCycleTimeDays, "ceil") : scatterOverlay,
    velocityMonthly: normalizeVelocity(raw.velocityMonthly),
    doneIssueDetails,
    flowTiming: normalizeFlowTiming(raw.flowTiming),
    flowTimingBasis: "working-days",
    flowTimingDetails,
    waitingTime: normalizeWaitingTimeSnapshot(raw.waitingTime) ?? buildWaitingTimeSnapshot(flowTimingDetails, undefined, generatedAt, "local-cache"),
    maintenanceLifecycle: normalizeMaintenanceLifecycleSnapshot(raw.maintenanceLifecycle),
    multiSprint: {
      count: Math.max(0, multiSprintCount),
      percentage: multiSprintPercentage < 0 ? 0 : multiSprintPercentage,
    },
    multiSprintIssueKeys,
  };
}

function normalizeWaitingTimeSnapshot(value: unknown): TeamMetrics["waitingTime"] {
  if (!isRecord(value)) return undefined;
  const coverageState = value.coverageState;
  if (coverageState !== "complete" && coverageState !== "partial" && coverageState !== "unavailable" && coverageState !== "conflict") return undefined;
  const stateValues = ["complete", "partial", "unavailable", "unavailable-no-source", "conflict", "stale-last-known", "needs-review-config", "error-with-retry"] as const;
  const state = stateValues.includes(value.state as typeof stateValues[number]) ? value.state as typeof stateValues[number] : undefined;
  const numberOrUndefined = (candidate: unknown): number | undefined => typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
  const source = value.source === "local-import" || value.source === "local-cache" || value.source === "local-recalculation" ? value.source : undefined;
  return {
    waitingDurationWorkingDays: numberOrUndefined(value.waitingDurationWorkingDays),
    cycleDurationWorkingDays: numberOrUndefined(value.cycleDurationWorkingDays),
    waitingPct: numberOrUndefined(value.waitingPct),
    sampleCount: numberOrUndefined(value.sampleCount),
    usableCount: numberOrUndefined(value.usableCount),
    unknownCount: numberOrUndefined(value.unknownCount),
    coverageState,
    state,
    asOf: typeof value.asOf === "string" ? value.asOf : undefined,
    capturedAt: typeof value.capturedAt === "string" ? value.capturedAt : undefined,
    source,
    semanticVersion: typeof value.semanticVersion === "string" ? value.semanticVersion : undefined,
    retryAvailable: value.retryAvailable === true,
    reason: typeof value.reason === "string" ? value.reason : undefined,
  };
}

function normalizeMaintenanceLifecycleSnapshot(value: unknown): TeamMetrics["maintenanceLifecycle"] {
  if (!isRecord(value)) return undefined;
  const coverageState = value.coverageState;
  if (coverageState !== "complete" && coverageState !== "partial" && coverageState !== "unavailable" && coverageState !== "conflict") return undefined;
  const states = ["not-configured", "invalid-key", "source-missing-parent-field", "configured-not-found", "ready-complete", "ready-partial-unknown-types", "no-recognized-completed-work", "conflict", "stale-last-known", "error-with-retry"] as const;
  const state = states.includes(value.state as typeof states[number]) ? value.state as typeof states[number] : undefined;
  const numberOrUndefined = (candidate: unknown): number | undefined => typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
  const source = value.source === "local-import" || value.source === "local-cache" || value.source === "local-recalculation" ? value.source : undefined;
  return {
    maintenanceCount: numberOrUndefined(value.maintenanceCount), lifecycleCount: numberOrUndefined(value.lifecycleCount), unknownCount: numberOrUndefined(value.unknownCount), candidateCount: numberOrUndefined(value.candidateCount), maintenancePct: numberOrUndefined(value.maintenancePct), coverageState, state,
    asOf: typeof value.asOf === "string" ? value.asOf : undefined, capturedAt: typeof value.capturedAt === "string" ? value.capturedAt : undefined, source, semanticVersion: typeof value.semanticVersion === "string" ? value.semanticVersion : undefined, reason: typeof value.reason === "string" ? value.reason : undefined,
  };
}

function normalizeFlowTimingDetails(value: unknown): NonNullable<TeamMetrics["flowTimingDetails"]> {
  if (!Array.isArray(value)) {
    return [];
  }

  const details: NonNullable<TeamMetrics["flowTimingDetails"]> = [];
  value.forEach((item) => {
    if (!isRecord(item)) {
      return;
    }

    const issueKey = typeof item.issueKey === "string" ? item.issueKey.trim() : "";
    const anchorDate = typeof item.anchorDate === "string" ? item.anchorDate : "";
    const scope = item.scope === "open" ? "open" : item.scope === "closed" ? "closed" : null;
    if (!issueKey || !anchorDate || !scope) {
      return;
    }

    details.push({
      issueKey,
      issueType: typeof item.issueType === "string" ? item.issueType : "",
      anchorDate,
      scope,
      leadTimeDays: toNullableNumber(item.leadTimeDays),
      activeTimeDays: toNullableNumber(item.activeTimeDays),
      cycleTimeDays: toNullableNumber(item.cycleTimeDays),
    });
  });

  return details;
}

function normalizeFlowTiming(value: unknown): TeamMetrics["flowTiming"] {
  const record = isRecord(value) ? value : {};

  return {
    leadTime: normalizeFlowTimingMetric(record.leadTime),
    activeTime: normalizeFlowTimingMetric(record.activeTime),
    cycleTime: normalizeFlowTimingMetric(record.cycleTime),
  };
}

function normalizeFlowTimingMetric(value: unknown): TeamMetrics["flowTiming"]["leadTime"] {
  const record = isRecord(value) ? value : {};
  return {
    count: toNonNegativeInteger(record.count),
    avgDays: toNullableNumber(record.avgDays),
    p50: toNullableNumber(record.p50),
    p70: toNullableNumber(record.p70),
    p85: toNullableNumber(record.p85),
    p95: toNullableNumber(record.p95),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTeamProgressSnapshot(value: Record<string, unknown>): TeamProgressSnapshot | null {
  const capturedAt = typeof value.capturedAt === "string" ? value.capturedAt : "";
  if (!capturedAt) {
    return null;
  }

  const importSignature =
    typeof value.importSignature === "string" ? value.importSignature : "";

  const metrics = getRecord(value.metrics);
  if (!metrics) {
    return null;
  }

  return {
    capturedAt,
    importSignature,
    metrics: {
      doneCount: toNonNegativeIntegerOrNull(metrics.doneCount),
      avgCycleTimeDays: toNullableNumber(metrics.avgCycleTimeDays),
      sleP50Days: toNullableNumber(metrics.sleP50Days),
      sleP70Days: toNullableNumber(metrics.sleP70Days),
      sleP85Days: toNullableNumber(metrics.sleP85Days),
      sleP95Days: toNullableNumber(metrics.sleP95Days),
      multiSprintPct: toNullableNumber(metrics.multiSprintPct),
      velocityLatest: toNullableNumber(metrics.velocityLatest),
      doneBugRatioPct: toNullableNumber(metrics.doneBugRatioPct),
      openWipCount: toNonNegativeIntegerOrNull(metrics.openWipCount) ?? 0,
      openWipAvgAgeDays: toNullableNumber(metrics.openWipAvgAgeDays),
      waitingTime: normalizeWaitingTimeSnapshot(metrics.waitingTime),
    },
  };
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item >= 0);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function toNonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function toNonNegativeIntegerOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function normalizePercentiles(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [50, 70, 85, 95];
  }

  const normalized = value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  return normalized.length > 0 ? normalized : [50, 70, 85, 95];
}

function normalizeScatter(value: unknown): TeamMetrics["scatter"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const issueKey = typeof raw.issueKey === "string" ? raw.issueKey : "";
      const resolutionDate = typeof raw.resolutionDate === "string" ? raw.resolutionDate : "";
      const cycleTimeDays = toNullableNumber(raw.cycleTimeDays);

      if (!issueKey || !resolutionDate || cycleTimeDays === null || cycleTimeDays < 0) {
        return null;
      }

      return {
        issueKey,
        resolutionDate,
        cycleTimeDays,
      };
    })
    .filter((item): item is TeamMetrics["scatter"][number] => item !== null);
}

function normalizeDoneIssueDetails(value: unknown): TeamMetrics["doneIssueDetails"] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const issueKey = typeof raw.issueKey === "string" ? raw.issueKey : "";
      const resolutionDate = typeof raw.resolutionDate === "string" ? raw.resolutionDate : "";
      const cycleTimeDays = raw.cycleTimeDays === null ? null : toNullableNumber(raw.cycleTimeDays);
      const issueType = typeof raw.issueType === "string" ? raw.issueType : "";
      const storyPoints = raw.storyPoints === null ? null : toNullableNumber(raw.storyPoints);
      const sprintCount = toNonNegativeInteger(raw.sprintCount);

      if (!issueKey || !resolutionDate || (cycleTimeDays !== null && cycleTimeDays < 0)) {
        return null;
      }

      return {
        issueKey,
        resolutionDate,
        cycleTimeDays,
        issueType,
        storyPoints,
        sprintCount,
      };
    })
    .filter((item): item is TeamMetrics["doneIssueDetails"][number] => item !== null);
}

function normalizeVelocity(value: unknown): TeamMetrics["velocityMonthly"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const month = typeof raw.month === "string" ? raw.month : "";
      const metric = toNullableNumber(raw.value);
      if (!month || metric === null || metric < 0) {
        return null;
      }

      return { month, value: metric };
    })
    .filter((item): item is TeamMetrics["velocityMonthly"][number] => item !== null);
}

function normalizeSleValues(value: Record<string, unknown> | null, fallback?: TeamMetrics["sle"]["values"]): TeamMetrics["sle"]["values"] {
  const pick = (key: "p50" | "p70" | "p85" | "p95"): number | null => {
    const parsed = value ? toNullableNumber(value[key]) : null;
    if (parsed !== null && parsed >= 0) {
      return parsed;
    }
    return fallback?.[key] ?? null;
  };

  return {
    p50: pick("p50"),
    p70: pick("p70"),
    p85: pick("p85"),
    p95: pick("p95"),
  };
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNestedRecord(source: Record<string, unknown>, first: string, second: string): Record<string, unknown> | null {
  const parent = source[first];
  if (!parent || typeof parent !== "object") {
    return null;
  }

  const child = (parent as Record<string, unknown>)[second];
  if (!child || typeof child !== "object") {
    return null;
  }

  return child as Record<string, unknown>;
}

function getNestedArray(source: Record<string, unknown>, first: string, second: string): unknown {
  const parent = source[first];
  if (!parent || typeof parent !== "object") {
    return null;
  }
  return (parent as Record<string, unknown>)[second];
}

function getNestedNullableNumber(source: Record<string, unknown>, first: string, second: string): number | null {
  const parent = source[first];
  if (!parent || typeof parent !== "object") {
    return null;
  }

  return toNullableNumber((parent as Record<string, unknown>)[second]);
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function normalizeBottleneckEntry(entry: Record<string, unknown>): BottleneckEntry | null {
  const period = typeof entry.period === "string" ? entry.period.trim() : "";
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return null;
  }

  const rawColumns = Array.isArray(entry.columns) ? entry.columns : [];
  const columns = rawColumns
    .map((column) => {
      if (!column || typeof column !== "object") {
        return null;
      }
      const raw = column as Record<string, unknown>;
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      const avgDays = Number(raw.avgDays);
      if (!name || !Number.isFinite(avgDays) || avgDays < 0) {
        return null;
      }
      const sampleCount = toNonNegativeIntegerOrNull(raw.sampleCount);
      return {
        name,
        avgDays,
        ...(sampleCount !== null && sampleCount > 0 ? { sampleCount } : {}),
      };
    })
    .filter((column): column is { name: string; avgDays: number } => column !== null);

  if (columns.length === 0) {
    return null;
  }

  return {
    period,
    columns,
    notes: typeof entry.notes === "string" && entry.notes.trim().length > 0 ? entry.notes.trim() : undefined,
    updatedAt:
      typeof entry.updatedAt === "string" && entry.updatedAt.trim().length > 0
        ? entry.updatedAt
        : undefined,
  };
}

function resolveBottleneckFlowStatuses(config: TeamConfig): string[] {
  const explicitFlowStatuses = normalizeStatusList(config.bottleneckConfig?.flowStatuses ?? []);
  if (explicitFlowStatuses.length > 0) {
    return explicitFlowStatuses;
  }

  return normalizeStatusList([
    ...(config.workflowConfig?.funnelStatuses ?? []),
    ...(config.workflowConfig?.activeStatuses ?? []),
    ...(config.workflowConfig?.implementingStatuses ?? []),
  ]);
}

function normalizeStatusList(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  values.forEach((value) => {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push(trimmed);
  });

  return normalized;
}

async function getDirectoryHandle(
  root: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await root.getDirectoryHandle(name);
  } catch {
    return null;
  }
}

async function ensureNestedDirectories(
  root: FileSystemDirectoryHandle,
  nestedPath: string,
): Promise<FileSystemDirectoryHandle> {
  const parts = nestedPath.split("/").filter((value) => value.length > 0);
  let current = root;

  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }

  return current;
}

async function collectExistingFileNames(dir: FileSystemDirectoryHandle): Promise<Set<string>> {
  const names = new Set<string>();

  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "file") {
      names.add(name.toLowerCase());
    }
  }

  return names;
}

async function readJsonFile<T>(dirHandle: FileSystemDirectoryHandle, fileName: string): Promise<T | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const first = await (await fileHandle.getFile()).text();
    const second = await (await fileHandle.getFile()).text();
    if (first !== second) return null;
    const content = second;
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

interface MovableFileHandle extends FileSystemFileHandle {
  move?: (name: string) => Promise<void>;
}

function assertSafeWriteName(fileName: string): void {
  if (!fileName || fileName === "." || fileName === ".." || /[\\/]/.test(fileName)) {
    throw new Error("invalid local write filename");
  }
}

async function removeFileIfPresent(dirHandle: FileSystemDirectoryHandle, fileName: string): Promise<void> {
  try {
    await dirHandle.removeEntry(fileName);
  } catch {
    // Cleanup is best effort; the original destination is never removed here.
  }
}

async function readStableText(fileHandle: FileSystemFileHandle): Promise<string> {
  const first = await (await fileHandle.getFile()).text();
  const second = await (await fileHandle.getFile()).text();
  if (first !== second) throw new Error("read-back verification failed: file changed during read");
  return second;
}

export async function writeJsonFile(dirHandle: FileSystemDirectoryHandle, fileName: string, data: unknown): Promise<void> {
  assertSafeWriteName(fileName);
  await withFileWriteMutex(dirHandle, async () => {
    const serialized = JSON.stringify(data, null, 2);
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tempName = `.${fileName}.sm-tmp-${suffix}`;
      const backupName = `.${fileName}.sm-backup-${suffix}`;
      let tempHandle: FileSystemFileHandle | null = null;
      let destinationHandle: MovableFileHandle | null = null;
      let backupCreated = false;
      try {
        tempHandle = await dirHandle.getFileHandle(tempName, { create: true });
        const writable = await tempHandle.createWritable();
        await writable.write(serialized);
        await writable.close();
        const verified = await readStableText(tempHandle);
        if (verified !== serialized) throw new Error("read-back verification failed");

        try {
          destinationHandle = (await dirHandle.getFileHandle(fileName)) as MovableFileHandle;
        } catch {
          destinationHandle = null;
        }
        if (typeof (tempHandle as MovableFileHandle).move !== "function") {
          throw new Error("atomic local file replacement is not supported by this browser");
        }
        const moveTemp = (tempHandle as MovableFileHandle).move!.bind(tempHandle);

        if (destinationHandle) {
          if (typeof destinationHandle.move !== "function") {
            throw new Error("atomic local file replacement is not supported by this browser");
          }
          const moveDestination = destinationHandle.move.bind(destinationHandle);
          await moveDestination(backupName);
          backupCreated = true;
          try {
            await moveTemp(fileName);
          } catch (replaceError) {
            try {
              await moveDestination(fileName);
              backupCreated = false;
            } catch {
              // Keep the backup so the previous contents remain recoverable.
            }
            throw replaceError;
          }
        } else {
          await moveTemp(fileName);
        }
        backupCreated = false;
        await removeFileIfPresent(dirHandle, backupName);
        return;
      } catch (error) {
        lastError = error;
        if (backupCreated && destinationHandle && typeof destinationHandle.move === "function") {
          try {
            await destinationHandle.move!(fileName);
            backupCreated = false;
          } catch {
            // Do not overwrite the destination with unverified data.
          }
        }
        await removeFileIfPresent(dirHandle, tempName);
        if (backupCreated) await removeFileIfPresent(dirHandle, backupName);
        if (attempt === 0) await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("local write could not be verified");
  });
}

function buildDefaultTeamConfig(
  teamName: string,
  description?: string,
  entityType: TeamEntityType = "team",
  jiraJql?: string,
): TeamConfig {
  const savedJql = jiraJql?.trim() || "project = YOURPROJECT ORDER BY updated DESC";

  return {
    teamName,
    description: description?.trim() || undefined,
    entityType,
    doneConfig: {
      useStatusCategoryDone: false,
      doneStatuses: ["Done", "Closed", "Resolved"],
    },
    sleConfig: {
      percentiles: [50, 70, 85, 95],
      rounding: "ceil",
      issueTypes: ["Task", "Bug", "Story"],
    },
    cycleTimeConfig: {
      endDateSource: "resolvedOrUpdated",
      durationSource: "timeInStatus",
    },
    mapping: {
      key: "Issue key",
      created: "Created",
      resolutionDate: "Resolved",
      updated: "Updated",
      status: "Status",
      resolution: "Resolution",
      assignee: "Assignee",
      storyPoints: "Story points",
      sprint: "Sprint",
      issueType: "Issue Type",
      parent: undefined,
    },
    velocityConfig: {
      mode: "weekly-ticket-count",
    },
    bugConfig: {
      issueTypes: ["Bug"],
      defaultStoryPoints: undefined,
    },
    sprintScopeConfig: {
      statuses: [],
    },
    workflowConfig: {
      backlogStatuses: [],
      funnelStatuses: [],
      activeStatuses: [],
      implementingStatuses: [],
    },
    flowTimingConfig: {
      includeClosedTickets: true,
      includeOpenTickets: false,
    },
    bottleneckConfig: {
      flowStatuses: [],
    },
    excludedIssueKeys: [],
    safeConfig: {
      enabled: false,
      entityType:
        entityType === "art"
          ? "agile-release-train"
          : entityType === "portfolio"
            ? "portfolio"
          : entityType === "vde"
            ? "development-value-stream"
            : "team",
      metricIds: [
        "flow-time",
        "flow-velocity",
        "flow-load",
        "flow-efficiency",
        "flow-predictability",
        "flow-distribution",
        "built-in-quality",
        "competency-assessment",
      ],
    },
    jiraQuery: {
      defaultQueryId: "default",
      queries: [
        {
          id: "default",
          name: "Team Import Query",
          jql: savedJql,
          note: "Used for both Issues CSV and Time in Status.",
        },
      ],
    },
  };
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "team";
}

function uniqueName(base: string, existing: Set<string>): string {
  if (!existing.has(base)) {
    return base;
  }

  let index = 2;
  while (existing.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

function sanitizeFileName(name: string): string {
  const sanitized = name.replace(/[\\/:*?"<>|]/g, "-").trim();
  return sanitized || `import-${Date.now()}.csv`;
}

export function buildUniqueImportFileName(existingLowerCaseNames: Set<string>, desiredName: string): string {
  const dotIndex = desiredName.lastIndexOf(".");
  const hasExtension = dotIndex > 0 && dotIndex < desiredName.length - 1;
  const base = hasExtension ? desiredName.slice(0, dotIndex) : desiredName;
  const extension = hasExtension ? desiredName.slice(dotIndex) : "";

  let candidate = desiredName;
  let suffix = 2;

  while (existingLowerCaseNames.has(candidate.toLowerCase())) {
    candidate = `${base}-${suffix}${extension}`;
    suffix += 1;
  }

  return candidate;
}

function sanitizeImportBucket(bucket: string): string {
  const normalized = bucket
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9_\-/]/g, "-");

  return normalized || "misc";
}

function normalizeWorkspaceConfig(
  raw: Record<string, unknown> | null,
  fallbackName: string,
): WorkspaceConfig {
  const profilesRaw = Array.isArray(raw?.profiles) ? raw?.profiles : [];
  const profiles = profilesRaw
    .map((item) => normalizeWorkspaceProfileConfig(item))
    .filter((item): item is WorkspaceProfileConfig => item !== null);

  const activeProfileIdRaw = typeof raw?.activeProfileId === "string" ? raw.activeProfileId.trim() : "";
  const activeProfileId = profiles.some((profile) => profile.id === activeProfileIdRaw) ? activeProfileIdRaw : undefined;

  return {
    version: 1,
    name: typeof raw?.name === "string" && raw.name.trim().length > 0 ? raw.name.trim() : fallbackName,
    profiles,
    activeProfileId,
    metricConfig: normalizeWorkspaceMetricConfig(raw?.metricConfig),
  };
}

function normalizeWorkspaceMetricConfig(raw: unknown): WorkspaceConfig["metricConfig"] {
  if (!raw || typeof raw !== "object") {
    return { scopeVisibility: {} };
  }

  const source = raw as Record<string, unknown>;
  const rawScopeVisibility =
    source.scopeVisibility && typeof source.scopeVisibility === "object"
      ? (source.scopeVisibility as Record<string, unknown>)
      : {};
  const scopeVisibility: NonNullable<WorkspaceConfig["metricConfig"]>["scopeVisibility"] = {};

  METRIC_SCOPES.forEach((scope) => {
    const values = rawScopeVisibility[scope];
    if (!Array.isArray(values)) {
      return;
    }

    scopeVisibility[scope] = Array.from(
      new Set(
        values
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    );
  });

  return { scopeVisibility };
}

function normalizeWorkspaceProfileConfig(value: unknown): WorkspaceProfileConfig | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const teamIds = Array.isArray(raw.teamIds)
    ? Array.from(
        new Set(
          raw.teamIds
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
        ),
      )
    : [];

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    teamIds,
  };
}

function createWorkspaceRecordId(): string {
  return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readRememberedWorkspaceRecords(): Promise<RememberedWorkspaceRecord[]> {
  const raw = await withSettingsStore("readonly", (store) => store.get(WORKSPACE_LIST_KEY));
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => normalizeRememberedWorkspaceRecord(item))
    .filter((item): item is RememberedWorkspaceRecord => item !== null);
}

function normalizeRememberedWorkspaceRecord(value: unknown): RememberedWorkspaceRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const lastUsedAt = typeof raw.lastUsedAt === "string" ? raw.lastUsedAt.trim() : "";
  const handle = raw.handle;

  if (!id || !name || !lastUsedAt || !isDirectoryHandle(handle)) {
    return null;
  }

  return {
    id,
    name,
    lastUsedAt,
    handle,
  };
}

async function findRememberedWorkspaceIndex(
  records: RememberedWorkspaceRecord[],
  handle: FileSystemDirectoryHandle,
): Promise<number> {
  for (let index = 0; index < records.length; index += 1) {
    const candidate = records[index];

    try {
      if (await candidate.handle.isSameEntry(handle)) {
        return index;
      }
    } catch {
      // Ignore stale/invalid entries.
    }
  }

  return -1;
}

async function withSettingsStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openWorkspaceDb();

  return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, mode);
    const store = tx.objectStore(WORKSPACE_STORE);
    const request = operation(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

async function openWorkspaceDb(): Promise<IDBDatabase> {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(WORKSPACE_DB_NAME, WORKSPACE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
        db.createObjectStore(WORKSPACE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as { kind?: string }).kind === "directory"
  );
}
