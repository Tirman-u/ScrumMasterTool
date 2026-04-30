import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type TeamConfig } from "./types/contracts.js";

const JIRA_PAGE_SIZE = 100;
const DEFAULT_MAX_ISSUES = 400;
const HARD_MAX_ISSUES = 5000;
const DEFAULT_IMPORT_BUCKET = "jira-api";
const ISSUE_BASE_FIELDS = [
  "summary",
  "created",
  "updated",
  "resolutiondate",
  "status",
  "resolution",
  "issuetype",
] as const;
const ISSUE_CSV_HEADERS = [
  "Issue key",
  "Summary",
  "Created",
  "Updated",
  "Resolved",
  "Status",
  "Resolution",
  "Issue Type",
  "Story points",
  "Sprint",
] as const;
const TIME_IN_STATUS_BASE_HEADERS = ["Type", "Key", "Summary", "Created", "Updated", "Resolution Date"] as const;
const MS_PER_MINUTE = 1000 * 60;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

interface JiraSavedQuery {
  id: string;
  name: string;
  jql: string;
  note?: string;
}

interface JiraQueryCollection {
  defaultQueryId?: string;
  queries?: JiraSavedQuery[];
}

interface JiraQueryConfig extends JiraQueryCollection {
  issueQuery?: JiraQueryCollection;
  timeInStatusQuery?: JiraQueryCollection;
}

type TeamConfigWithJira = TeamConfig & {
  jiraQuery?: JiraQueryConfig;
};

interface TeamSelection {
  teamId: string;
  teamPath: string;
  config: TeamConfigWithJira;
}

interface JiraCredentials {
  baseUrl: string;
  username: string;
  token: string;
}

export interface CliOptions {
  help: boolean;
  workspacePath: string;
  teamSelector: string;
  credentials: JiraCredentials;
  jql?: string;
  issueJql?: string;
  timeInStatusJql?: string;
  maxIssues: number;
  importBucket: string;
  timestamped: boolean;
  issuesOnly: boolean;
  timeOnly: boolean;
  storyPointsField?: string;
  sprintField?: string;
}

interface JiraNamedValue {
  name?: string | null;
}

interface JiraIssueFields {
  summary?: string | null;
  created?: string | null;
  updated?: string | null;
  resolutiondate?: string | null;
  status?: JiraNamedValue | null;
  resolution?: JiraNamedValue | null;
  issuetype?: JiraNamedValue | null;
  [fieldId: string]: unknown;
}

interface JiraChangelogItem {
  field?: string | null;
  fieldId?: string | null;
  fromString?: string | null;
  toString?: string | null;
}

interface JiraChangelogHistory {
  created?: string | null;
  items?: JiraChangelogItem[];
}

interface JiraChangelog {
  histories?: JiraChangelogHistory[];
  total?: number;
  maxResults?: number;
}

export interface JiraIssue {
  id?: string;
  key?: string;
  fields?: JiraIssueFields;
  changelog?: JiraChangelog;
}

interface JiraSearchResponse {
  startAt?: number;
  maxResults?: number;
  total?: number;
  issues?: JiraIssue[];
}

interface JiraField {
  id?: string;
  name?: string;
}

interface JiraUser {
  displayName?: string;
  name?: string;
  emailAddress?: string;
}

interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
}

export interface DetectedFields {
  storyPointsField?: string;
  sprintField?: string;
}

export interface TimeInStatusCsvResult {
  csvText: string;
  issueCount: number;
  statusCount: number;
  missingChangelogIssueKeys: string[];
  truncatedChangelogIssueKeys: string[];
}

class JiraClient {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly token: string;

  constructor(credentials: JiraCredentials) {
    this.baseUrl = normalizeJiraBaseUrl(credentials.baseUrl);
    this.username = credentials.username.trim();
    this.token = credentials.token.trim();
  }

  async testConnection(): Promise<JiraUser> {
    const response = await this.request(`${this.baseUrl}/rest/api/2/myself`, {
      method: "GET",
      headers: this.headers(),
    });

    return (await response.json()) as JiraUser;
  }

  async getFields(): Promise<JiraField[]> {
    const response = await this.request(`${this.baseUrl}/rest/api/2/field`, {
      method: "GET",
      headers: this.headers(),
    });

    const payload = await response.json();
    return Array.isArray(payload) ? (payload as JiraField[]) : [];
  }

  async searchAll(params: {
    jql: string;
    fields: string[];
    maxIssues: number;
    expandChangelog: boolean;
  }): Promise<JiraSearchResult> {
    const issues: JiraIssue[] = [];
    let total = 0;

    while (issues.length < params.maxIssues) {
      const page = await this.searchPage({
        ...params,
        startAt: issues.length,
        maxResults: Math.min(JIRA_PAGE_SIZE, params.maxIssues - issues.length),
      });
      const pageIssues = Array.isArray(page.issues) ? page.issues : [];
      total = Number.isFinite(page.total) ? Number(page.total) : issues.length + pageIssues.length;

      if (pageIssues.length === 0) {
        break;
      }

      issues.push(...pageIssues);

      if (issues.length >= total) {
        break;
      }
    }

    return {
      issues,
      total,
    };
  }

  private async searchPage(params: {
    jql: string;
    fields: string[];
    maxIssues: number;
    expandChangelog: boolean;
    startAt: number;
    maxResults: number;
  }): Promise<JiraSearchResponse> {
    const body: Record<string, unknown> = {
      jql: params.jql,
      startAt: params.startAt,
      maxResults: params.maxResults,
      fields: params.fields,
    };

    if (params.expandChangelog) {
      body.expand = ["changelog"];
    }

    const response = await this.request(`${this.baseUrl}/rest/api/2/search`, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return (await response.json()) as JiraSearchResponse;
  }

  private async request(input: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(
          "Node could not reach Jira. Check VPN/network access, Jira URL, and whether the certificate is trusted locally.",
        );
      }
      throw error;
    }

    if (!response.ok) {
      const message = await readJiraErrorMessage(response);
      throw new Error(`Jira request failed (${response.status}): ${message}`);
    }

    return response;
  }

  private headers(): HeadersInit {
    return {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${this.username}:${this.token}`, "utf-8").toString("base64")}`,
    };
  }
}

export async function runJiraPull(options: CliOptions): Promise<void> {
  if (options.issuesOnly && options.timeOnly) {
    throw new Error("Use either --issues-only or --time-only, not both.");
  }

  validateCredentials(options.credentials);

  const workspacePath = path.resolve(options.workspacePath);
  const team = await resolveTeam(workspacePath, options.teamSelector);
  const issueJql = (options.issueJql ?? options.jql ?? resolveSavedJql(team.config, "issueQuery")).trim();
  const timeInStatusJql = (
    options.timeInStatusJql ??
    options.jql ??
    resolveSavedJql(team.config, "timeInStatusQuery") ??
    issueJql
  ).trim();

  if (!options.timeOnly && !issueJql) {
    throw new Error("JQL is required. Pass --jql/--issues-jql or save a query under the team.");
  }

  if (!options.issuesOnly && !timeInStatusJql) {
    throw new Error("Time in Status JQL is required. Pass --jql/--time-jql or save a query under the team.");
  }

  const client = new JiraClient(options.credentials);
  const user = await client.testConnection();
  console.log(`Connected to Jira as ${user.displayName ?? user.emailAddress ?? user.name ?? options.credentials.username}.`);

  const detectedFields = await detectFields(client, options);
  const jiraFields = buildJiraSearchFields(detectedFields);
  const outputDir = await ensureOutputDirectory(team.teamPath, options.importBucket);

  const sameQuery = issueJql === timeInStatusJql;
  const shouldPullIssues = !options.timeOnly;
  const shouldPullTimeInStatus = !options.issuesOnly;
  let issueResult: JiraSearchResult | null = null;
  let timeInStatusResult: JiraSearchResult | null = null;

  if (shouldPullIssues && shouldPullTimeInStatus && sameQuery) {
    console.log(`Pulling ${team.config.teamName} issues and changelog in one Jira query. Max ${options.maxIssues}.`);
    issueResult = await client.searchAll({
      jql: issueJql,
      fields: jiraFields,
      maxIssues: options.maxIssues,
      expandChangelog: true,
    });
    timeInStatusResult = issueResult;
  } else {
    if (shouldPullIssues) {
      console.log(`Pulling ${team.config.teamName} issues. Max ${options.maxIssues}.`);
      issueResult = await client.searchAll({
        jql: issueJql,
        fields: jiraFields,
        maxIssues: options.maxIssues,
        expandChangelog: false,
      });
    }

    if (shouldPullTimeInStatus) {
      console.log(`Pulling ${team.config.teamName} changelog for Time in Status. Max ${options.maxIssues}.`);
      timeInStatusResult = await client.searchAll({
        jql: timeInStatusJql,
        fields: jiraFields,
        maxIssues: options.maxIssues,
        expandChangelog: true,
      });
    }
  }

  const writtenFiles: string[] = [];
  const suffix = options.timestamped ? `-${formatFileTimestamp(new Date())}` : "";

  if (issueResult) {
    const issueCsv = buildJiraIssueCsv(issueResult.issues, detectedFields);
    const outputPath = path.join(outputDir, `issues${suffix}.csv`);
    await fs.writeFile(outputPath, issueCsv, "utf-8");
    writtenFiles.push(outputPath);
    console.log(`Wrote ${issueResult.issues.length}/${issueResult.total} issues to ${relativePath(outputPath)}.`);
  }

  if (timeInStatusResult) {
    const timeInStatusCsv = buildTimeInStatusCsv(timeInStatusResult.issues);
    const outputPath = path.join(outputDir, `time-in-status${suffix}.csv`);
    await fs.writeFile(outputPath, timeInStatusCsv.csvText, "utf-8");
    writtenFiles.push(outputPath);
    console.log(
      `Wrote Time in Status for ${timeInStatusCsv.issueCount} issues and ${timeInStatusCsv.statusCount} statuses to ${relativePath(outputPath)}.`,
    );

    if (timeInStatusCsv.missingChangelogIssueKeys.length > 0) {
      console.warn(
        `Warning: ${timeInStatusCsv.missingChangelogIssueKeys.length} issue(s) had no status changelog in the Jira response.`,
      );
    }

    if (timeInStatusCsv.truncatedChangelogIssueKeys.length > 0) {
      console.warn(
        `Warning: ${timeInStatusCsv.truncatedChangelogIssueKeys.length} issue(s) may have truncated changelog data from Jira search expand.`,
      );
    }
  }

  if (writtenFiles.length === 0) {
    throw new Error("No files were written.");
  }
}

export function buildJiraIssueCsv(issues: JiraIssue[], fields: DetectedFields = {}): string {
  const rows = issues.map((issue) => {
    const issueFields = issue.fields ?? {};
    return [
      issue.key ?? "",
      stringValue(issueFields.summary),
      stringValue(issueFields.created),
      stringValue(issueFields.updated),
      stringValue(issueFields.resolutiondate),
      issueFields.status?.name ?? "",
      issueFields.resolution?.name ?? "",
      issueFields.issuetype?.name ?? "",
      formatStoryPoints(fields.storyPointsField ? issueFields[fields.storyPointsField] : undefined),
      formatSprintValue(fields.sprintField ? issueFields[fields.sprintField] : undefined),
    ];
  });

  return toCsv([Array.from(ISSUE_CSV_HEADERS), ...rows]);
}

export function buildTimeInStatusCsv(issues: JiraIssue[], now = new Date()): TimeInStatusCsvResult {
  const statusOrder = new Map<string, number>();
  const missingChangelogIssueKeys: string[] = [];
  const truncatedChangelogIssueKeys: string[] = [];
  const rowModels = issues.map((issue) => {
    const model = buildTimeInStatusRow(issue, now);

    if (!hasStatusHistory(issue)) {
      missingChangelogIssueKeys.push(issue.key ?? issue.id ?? "unknown");
    }

    if (isChangelogLikelyTruncated(issue.changelog)) {
      truncatedChangelogIssueKeys.push(issue.key ?? issue.id ?? "unknown");
    }

    for (const status of model.durations.keys()) {
      if (!statusOrder.has(status)) {
        statusOrder.set(status, statusOrder.size);
      }
    }

    return model;
  });

  const statuses = Array.from(statusOrder.keys());
  const rows = rowModels.map((model) => [
    model.issueType,
    model.issueKey,
    model.summary,
    model.created,
    model.updated,
    model.resolutionDate,
    ...statuses.map((status) => formatDuration(model.durations.get(status) ?? 0)),
  ]);

  return {
    csvText: toCsv([[...TIME_IN_STATUS_BASE_HEADERS, ...statuses], ...rows]),
    issueCount: rowModels.length,
    statusCount: statuses.length,
    missingChangelogIssueKeys,
    truncatedChangelogIssueKeys,
  };
}

function buildTimeInStatusRow(issue: JiraIssue, now: Date): {
  issueKey: string;
  issueType: string;
  summary: string;
  created: string;
  updated: string;
  resolutionDate: string;
  durations: Map<string, number>;
} {
  const fields = issue.fields ?? {};
  const created = parseJiraDate(fields.created) ?? parseJiraDate(fields.updated) ?? now;
  const updated = parseJiraDate(fields.updated);
  const resolutionDate = parseJiraDate(fields.resolutiondate);
  const end = resolutionDate ?? now;
  const statusChanges = collectStatusChanges(issue);
  const durations = new Map<string, number>();

  let cursor = created;
  let activeStatus = statusChanges[0]?.fromStatus || fields.status?.name || "Unknown";

  for (const change of statusChanges) {
    if (change.changedAt.getTime() < cursor.getTime()) {
      activeStatus = change.toStatus || activeStatus;
      continue;
    }

    if (change.changedAt.getTime() > end.getTime()) {
      break;
    }

    addDuration(durations, activeStatus, change.changedAt.getTime() - cursor.getTime());
    activeStatus = change.toStatus || activeStatus;
    cursor = change.changedAt;
  }

  if (end.getTime() > cursor.getTime()) {
    addDuration(durations, activeStatus, end.getTime() - cursor.getTime());
  }

  return {
    issueKey: issue.key ?? "",
    issueType: fields.issuetype?.name ?? "",
    summary: stringValue(fields.summary),
    created: fields.created ?? "",
    updated: fields.updated ?? updated?.toISOString() ?? "",
    resolutionDate: fields.resolutiondate ?? "",
    durations,
  };
}

function collectStatusChanges(issue: JiraIssue): Array<{
  changedAt: Date;
  fromStatus: string;
  toStatus: string;
}> {
  const changes: Array<{ changedAt: Date; fromStatus: string; toStatus: string }> = [];

  for (const history of issue.changelog?.histories ?? []) {
    const changedAt = parseJiraDate(history.created);
    if (!changedAt) {
      continue;
    }

    for (const item of history.items ?? []) {
      const field = normalizeText(item.fieldId ?? item.field);
      if (field !== "status") {
        continue;
      }

      const fromStatus = (item.fromString ?? "").trim();
      const toStatus = (item.toString ?? "").trim();
      if (!fromStatus && !toStatus) {
        continue;
      }

      changes.push({
        changedAt,
        fromStatus,
        toStatus,
      });
    }
  }

  return changes.sort((left, right) => left.changedAt.getTime() - right.changedAt.getTime());
}

function addDuration(target: Map<string, number>, status: string | undefined, durationMs: number): void {
  const normalizedStatus = status?.trim();
  if (!normalizedStatus || !Number.isFinite(durationMs) || durationMs <= 0) {
    return;
  }

  target.set(normalizedStatus, (target.get(normalizedStatus) ?? 0) + durationMs);
}

async function detectFields(client: JiraClient, options: CliOptions): Promise<DetectedFields> {
  if (options.storyPointsField && options.sprintField) {
    return {
      storyPointsField: options.storyPointsField,
      sprintField: options.sprintField,
    };
  }

  const fields = await client.getFields();
  const storyPointsField = options.storyPointsField ?? detectStoryPointsField(fields);
  const sprintField = options.sprintField ?? detectSprintField(fields);

  if (storyPointsField) {
    console.log(`Using Story points field: ${storyPointsField}.`);
  } else {
    console.warn("Story points field was not detected. Issue CSV will leave Story points empty.");
  }

  if (sprintField) {
    console.log(`Using Sprint field: ${sprintField}.`);
  } else {
    console.warn("Sprint field was not detected. Issue CSV will leave Sprint empty.");
  }

  return {
    storyPointsField,
    sprintField,
  };
}

function detectStoryPointsField(fields: JiraField[]): string | undefined {
  const scored = fields
    .map((field) => ({
      id: field.id,
      name: field.name ?? "",
      normalizedName: normalizeText(field.name),
    }))
    .filter((field): field is { id: string; name: string; normalizedName: string } => Boolean(field.id))
    .filter((field) => {
      const name = field.normalizedName;
      return (name.includes("story") && name.includes("point")) || name === "estimate";
    })
    .map((field) => ({
      ...field,
      score:
        field.normalizedName === "storypoints"
          ? 400
          : field.normalizedName.includes("storypointestimate")
            ? 350
            : field.normalizedName.includes("story") && field.normalizedName.includes("point")
              ? 300
              : 100,
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  return scored[0]?.id;
}

function detectSprintField(fields: JiraField[]): string | undefined {
  const scored = fields
    .map((field) => ({
      id: field.id,
      name: field.name ?? "",
      normalizedName: normalizeText(field.name),
    }))
    .filter((field): field is { id: string; name: string; normalizedName: string } => Boolean(field.id))
    .filter((field) => field.normalizedName.includes("sprint"))
    .map((field) => ({
      ...field,
      score: field.normalizedName === "sprint" ? 300 : 200,
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  return scored[0]?.id;
}

function buildJiraSearchFields(fields: DetectedFields): string[] {
  const result = new Set<string>(ISSUE_BASE_FIELDS);

  if (fields.storyPointsField) {
    result.add(fields.storyPointsField);
  }

  if (fields.sprintField) {
    result.add(fields.sprintField);
  }

  return Array.from(result);
}

async function resolveTeam(workspacePath: string, selector: string): Promise<TeamSelection> {
  if (!selector.trim()) {
    throw new Error("Team is required. Pass --team <team folder or name>.");
  }

  const teamsPath = await resolveTeamsPath(workspacePath);
  const teamIds = await listDirectories(teamsPath);
  const normalizedSelector = normalizeSelector(selector);

  for (const teamId of teamIds) {
    const teamPath = path.join(teamsPath, teamId);
    const configPath = path.join(teamPath, "team.json");
    const config = await readJsonFile<TeamConfigWithJira>(configPath, true);
    const normalizedTeamId = normalizeSelector(teamId);
    const normalizedTeamName = normalizeSelector(config.teamName ?? "");

    if (normalizedSelector === normalizedTeamId || normalizedSelector === normalizedTeamName) {
      return {
        teamId,
        teamPath,
        config,
      };
    }
  }

  throw new Error(`Team "${selector}" was not found under ${teamsPath}.`);
}

async function resolveTeamsPath(workspacePath: string): Promise<string> {
  const candidatePaths = [path.join(workspacePath, "teams"), path.join(workspacePath, "Teams")];
  for (const candidate of candidatePaths) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No teams folder found under ${workspacePath}.`);
}

function resolveSavedJql(config: TeamConfigWithJira, target: "issueQuery" | "timeInStatusQuery"): string {
  const collection = normalizeJiraQueryCollection(
    config.jiraQuery?.[target] ?? (target === "timeInStatusQuery" ? undefined : config.jiraQuery),
  );
  const selected =
    collection.queries.find((query) => query.id === collection.defaultQueryId) ??
    collection.queries[0] ??
    null;

  return selected?.jql ?? "";
}

function normalizeJiraQueryCollection(config: JiraQueryCollection | undefined): Required<JiraQueryCollection> {
  const queries = (config?.queries ?? [])
    .filter((query) => query.id?.trim() && query.name?.trim() && query.jql?.trim())
    .map((query) => ({
      ...query,
      id: query.id.trim(),
      name: query.name.trim(),
      jql: query.jql.trim(),
      note: query.note?.trim() || undefined,
    }));

  const defaultQueryId =
    config?.defaultQueryId && queries.some((query) => query.id === config.defaultQueryId)
      ? config.defaultQueryId
      : (queries[0]?.id ?? "");

  return {
    defaultQueryId,
    queries,
  };
}

async function ensureOutputDirectory(teamPath: string, importBucket: string): Promise<string> {
  const importsPath = path.join(teamPath, "imports");
  const outputDir = path.join(importsPath, sanitizeImportBucket(importBucket));
  await fs.mkdir(outputDir, { recursive: true });
  return outputDir;
}

function parseCliArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliOptions {
  const args = readArgs(argv);
  const maxIssues = normalizeMaxIssues(
    parseInteger(getArg(args, "max", "max-issues") ?? env.JIRA_MAX_ISSUES ?? String(DEFAULT_MAX_ISSUES)),
  );

  return {
    help: hasArg(args, "help", "h"),
    workspacePath: getArg(args, "workspace") ?? env.SM_WORKSPACE ?? process.cwd(),
    teamSelector: getArg(args, "team") ?? env.SM_TEAM ?? "",
    credentials: {
      baseUrl: getArg(args, "url", "base-url") ?? env.JIRA_URL ?? "",
      username: getArg(args, "username", "user") ?? env.JIRA_USERNAME ?? env.JIRA_USER ?? "",
      token: getArg(args, "token") ?? env.JIRA_TOKEN ?? "",
    },
    jql: getArg(args, "jql") ?? env.JIRA_JQL,
    issueJql: getArg(args, "issues-jql", "issue-jql") ?? env.JIRA_ISSUES_JQL,
    timeInStatusJql: getArg(args, "time-jql", "time-in-status-jql") ?? env.JIRA_TIME_IN_STATUS_JQL,
    maxIssues,
    importBucket: getArg(args, "bucket") ?? env.JIRA_IMPORT_BUCKET ?? DEFAULT_IMPORT_BUCKET,
    timestamped: hasArg(args, "timestamped"),
    issuesOnly: hasArg(args, "issues-only"),
    timeOnly: hasArg(args, "time-only"),
    storyPointsField: getArg(args, "story-points-field") ?? env.JIRA_STORY_POINTS_FIELD,
    sprintField: getArg(args, "sprint-field") ?? env.JIRA_SPRINT_FIELD,
  };
}

function readArgs(argv: string[]): Map<string, string | boolean> {
  const args = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("-")) {
      continue;
    }

    const withoutPrefix = raw.replace(/^-+/, "");
    const equalsIndex = withoutPrefix.indexOf("=");
    if (equalsIndex >= 0) {
      const key = withoutPrefix.slice(0, equalsIndex);
      const value = withoutPrefix.slice(equalsIndex + 1);
      args.set(key, value);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("-")) {
      args.set(withoutPrefix, next);
      index += 1;
      continue;
    }

    args.set(withoutPrefix, true);
  }

  return args;
}

function getArg(args: Map<string, string | boolean>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = args.get(name);
    if (typeof value === "string") {
      return value;
    }
  }

  return undefined;
}

function hasArg(args: Map<string, string | boolean>, ...names: string[]): boolean {
  return names.some((name) => args.has(name));
}

function printHelp(): void {
  console.log(`Usage:
  JIRA_URL=https://jira.example.net JIRA_USERNAME=user JIRA_TOKEN=token \\
    npm run jira:pull -- --team BalticWebKanban --jql 'project = ABC ORDER BY updated DESC'

Options:
  --team <name-or-folder>       Required. Team folder id or team name.
  --jql <jql>                   Query used for both issues and Time in Status.
  --issues-jql <jql>            Query used only for issue CSV.
  --time-jql <jql>              Query used only for Time in Status CSV.
  --url <url>                   Jira base URL. Prefer JIRA_URL env.
  --username <username>         Jira username. Prefer JIRA_USERNAME env.
  --token <token>               Jira personal token. Prefer JIRA_TOKEN env.
  --max <number>                Max issues per query. Default ${DEFAULT_MAX_ISSUES}, hard max ${HARD_MAX_ISSUES}.
  --bucket <folder>             Folder under team imports/. Default ${DEFAULT_IMPORT_BUCKET}.
  --timestamped                 Write timestamped files instead of replacing issues.csv/time-in-status.csv.
  --issues-only                 Pull only issue CSV.
  --time-only                   Pull only Time in Status CSV.
  --story-points-field <id>     Override detected Jira Story points custom field id.
  --sprint-field <id>           Override detected Jira Sprint custom field id.
`);
}

function validateCredentials(credentials: JiraCredentials): void {
  if (!normalizeJiraBaseUrl(credentials.baseUrl)) {
    throw new Error("Jira URL is required. Set JIRA_URL or pass --url.");
  }

  if (!credentials.username.trim() || !credentials.token.trim()) {
    throw new Error("Jira username and token are required. Set JIRA_USERNAME/JIRA_TOKEN or pass --username/--token.");
  }
}

function normalizeJiraBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function normalizeMaxIssues(value: number | null): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_ISSUES;
  }

  return Math.min(HARD_MAX_ISSUES, Math.max(1, Math.round(value ?? DEFAULT_MAX_ISSUES)));
}

function parseInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJiraDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatStoryPoints(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function formatSprintValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatSprintValue(item)).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string") {
      return record.name.trim();
    }
    if (typeof record.toString === "function" && record.toString !== Object.prototype.toString) {
      return record.toString();
    }
    return "";
  }

  return String(value).trim();
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "";
  }

  const totalMinutes = Math.max(1, Math.round(durationMs / MS_PER_MINUTE));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes - days * 1440) / 60);
  const minutes = totalMinutes - days * 1440 - hours * 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  return parts.join(" ") || "1m";
}

function hasStatusHistory(issue: JiraIssue): boolean {
  return collectStatusChanges(issue).length > 0;
}

function isChangelogLikelyTruncated(changelog: JiraChangelog | undefined): boolean {
  const total = changelog?.total;
  const maxResults = changelog?.maxResults;
  return Number.isFinite(total) && Number.isFinite(maxResults) && Number(total) > Number(maxResults);
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeSelector(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function sanitizeImportBucket(value: string): string {
  return value
    .split(/[\\/]+/)
    .map((part) =>
      part
        .trim()
        .replace(/^\.+$/, "")
        .replace(/[<>:"|?*\u0000-\u001f]/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join(path.sep) || DEFAULT_IMPORT_BUCKET;
}

function formatFileTimestamp(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

function relativePath(targetPath: string): string {
  return path.relative(process.cwd(), targetPath) || targetPath;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
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
    .sort((left, right) => left.localeCompare(right));
}

async function readJsonFile<T>(filePath: string, optional: boolean): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
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

async function readJiraErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.clone().json();
    if (Array.isArray(payload?.errorMessages) && payload.errorMessages.length > 0) {
      return payload.errorMessages.join(" ");
    }
    if (payload?.message) {
      return String(payload.message);
    }
  } catch {
    // Fall through to plain text.
  }

  try {
    const text = await response.text();
    return text || response.statusText;
  } catch {
    return response.statusText;
  }
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  await runJiraPull(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
