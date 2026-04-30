export interface JiraExportRequest {
  baseUrl: string;
  username: string;
  token: string;
  jql: string;
  maxIssues: number;
}

export interface JiraExportResult {
  csvText: string;
  issueCount: number;
  total: number;
}

export interface JiraConnectionTestRequest {
  baseUrl: string;
  username: string;
  token: string;
}

export interface JiraConnectionTestResult {
  displayName: string;
  accountName: string;
}

interface JiraSearchResponse {
  startAt?: number;
  maxResults?: number;
  total?: number;
  issues?: JiraIssue[];
}

interface JiraIssue {
  key?: string;
  fields?: {
    created?: string | null;
    updated?: string | null;
    resolutiondate?: string | null;
    status?: { name?: string | null } | null;
    resolution?: { name?: string | null } | null;
    issuetype?: { name?: string | null } | null;
  };
}

const JIRA_PAGE_SIZE = 100;
const JIRA_FIELDS = ["created", "updated", "resolutiondate", "status", "resolution", "issuetype"];
const CSV_HEADERS = ["Issue key", "Created", "Updated", "Resolved", "Status", "Resolution", "Issue Type"];

export async function testJiraConnection(request: JiraConnectionTestRequest): Promise<JiraConnectionTestResult> {
  const baseUrl = normalizeJiraBaseUrl(request.baseUrl);
  const username = request.username.trim();
  const token = request.token.trim();

  if (!baseUrl) {
    throw new Error("Jira URL is required.");
  }

  if (!username || !token) {
    throw new Error("Jira username and token are required.");
  }

  const response = await jiraFetch(`${baseUrl}/rest/api/2/myself`, {
    method: "GET",
    headers: buildJiraHeaders(username, token),
  });

  if (!response.ok) {
    const message = await readJiraErrorMessage(response);
    throw new Error(`Jira connection failed (${response.status}): ${message}`);
  }

  const payload = await response.json();
  return {
    displayName: String(payload?.displayName ?? payload?.name ?? "Jira user"),
    accountName: String(payload?.emailAddress ?? payload?.name ?? username),
  };
}

export async function exportJiraIssuesToCsv(request: JiraExportRequest): Promise<JiraExportResult> {
  const baseUrl = normalizeJiraBaseUrl(request.baseUrl);
  const jql = request.jql.trim();
  const username = request.username.trim();
  const token = request.token.trim();
  const maxIssues = normalizeMaxIssues(request.maxIssues);

  if (!baseUrl) {
    throw new Error("Jira URL is required.");
  }

  if (!username || !token) {
    throw new Error("Jira username and token are required.");
  }

  if (!jql) {
    throw new Error("Jira query is required.");
  }

  const issues: JiraIssue[] = [];
  let total = 0;

  while (issues.length < maxIssues) {
    const page = await searchJiraPage({
      baseUrl,
      username,
      token,
      jql,
      startAt: issues.length,
      maxResults: Math.min(JIRA_PAGE_SIZE, maxIssues - issues.length),
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
    csvText: buildJiraCsv(issues),
    issueCount: issues.length,
    total,
  };
}

function normalizeJiraBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function normalizeMaxIssues(value: number): number {
  if (!Number.isFinite(value)) {
    return 200;
  }
  return Math.min(1000, Math.max(1, Math.round(value)));
}

async function searchJiraPage(params: {
  baseUrl: string;
  username: string;
  token: string;
  jql: string;
  startAt: number;
  maxResults: number;
}): Promise<JiraSearchResponse> {
  const response = await jiraFetch(`${params.baseUrl}/rest/api/2/search`, {
    method: "POST",
    headers: {
      ...buildJiraHeaders(params.username, params.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jql: params.jql,
      startAt: params.startAt,
      maxResults: params.maxResults,
      fields: JIRA_FIELDS,
    }),
  });

  if (!response.ok) {
    const message = await readJiraErrorMessage(response);
    throw new Error(`Jira request failed (${response.status}): ${message}`);
  }

  return (await response.json()) as JiraSearchResponse;
}

function buildJiraHeaders(username: string, token: string): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Basic ${btoa(`${username}:${token}`)}`,
  };
}

async function jiraFetch(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Browser could not reach Jira. This is usually CORS, VPN/network access, or an invalid Jira URL.",
      );
    }
    throw error;
  }
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
    // Fall through to text response.
  }

  try {
    const text = await response.text();
    return text || response.statusText;
  } catch {
    return response.statusText;
  }
}

export function buildJiraCsv(issues: JiraIssue[]): string {
  const rows = issues.map((issue) => {
    const fields = issue.fields ?? {};
    return [
      issue.key ?? "",
      fields.created ?? "",
      fields.updated ?? "",
      fields.resolutiondate ?? "",
      fields.status?.name ?? "",
      fields.resolution?.name ?? "",
      fields.issuetype?.name ?? "",
    ];
  });

  return [CSV_HEADERS, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
