import {
  type JiraQueryCollection,
  type JiraQueryConfig,
  type JiraSavedQuery,
  type TeamConfig,
} from "../types/contracts";

export type QueryTimeWindow = "none" | "current-month" | "last-month" | "ytd";
export type JiraQueryTarget = "issueQuery" | "timeInStatusQuery";

const FALLBACK_ISSUE_QUERY: JiraSavedQuery = {
  id: "default",
  name: "Team Import Query",
  jql: "project = YOURPROJECT ORDER BY updated DESC",
  note: "Used for both Issues CSV and Time in Status.",
};

export function normalizeJiraQueryConfig(config: JiraQueryConfig | undefined): JiraQueryConfig {
  const issueQuery = normalizeJiraQueryCollection(config?.issueQuery ?? config, FALLBACK_ISSUE_QUERY);
  const timeInStatusQuery = normalizeJiraQueryCollection(
    config?.timeInStatusQuery ?? config?.issueQuery ?? config,
    FALLBACK_ISSUE_QUERY,
  );

  return {
    defaultQueryId: issueQuery.defaultQueryId,
    queries: issueQuery.queries,
    issueQuery,
    timeInStatusQuery,
  };
}

export function buildTeamConfigWithSavedQueries(
  config: TeamConfig,
  normalizedConfig: JiraQueryConfig,
  target: JiraQueryTarget,
  nextCollection: JiraQueryCollection,
): TeamConfig {
  const issueQuery =
    target === "issueQuery" ? nextCollection : requireQueryCollection(normalizedConfig.issueQuery);
  const timeInStatusQuery =
    target === "timeInStatusQuery"
      ? nextCollection
      : requireQueryCollection(normalizedConfig.timeInStatusQuery);

  return {
    ...config,
    jiraQuery: {
      defaultQueryId: issueQuery.defaultQueryId,
      queries: issueQuery.queries,
      issueQuery,
      timeInStatusQuery,
    },
  };
}

export function resolvePreferredSavedQuery(
  config: JiraQueryCollection,
  selectedId: string,
): JiraSavedQuery | null {
  return (
    config.queries.find((query) => query.id === selectedId) ??
    config.queries.find((query) => query.id === config.defaultQueryId) ??
    config.queries[0] ??
    null
  );
}

export function composeQueryWithTimeWindow(
  baseJql: string,
  window: QueryTimeWindow,
  target: JiraQueryTarget = "issueQuery",
): string {
  const trimmedBase = baseJql.trim();
  const clause = getTimeWindowClause(window, target);

  if (!clause) {
    return trimmedBase;
  }
  if (!trimmedBase) {
    return clause;
  }

  const orderMatch = /\border\s+by\b/i.exec(trimmedBase);
  if (!orderMatch || orderMatch.index === undefined) {
    return `${trimmedBase} AND ${clause}`;
  }

  const beforeOrder = trimmedBase.slice(0, orderMatch.index).trim();
  const orderByPart = trimmedBase.slice(orderMatch.index).trim();
  return beforeOrder ? `(${beforeOrder}) AND ${clause} ${orderByPart}` : `${clause} ${orderByPart}`;
}

function normalizeJiraQueryCollection(
  config: JiraQueryCollection | undefined,
  fallbackQuery: JiraSavedQuery,
): JiraQueryCollection {
  const queries = (config?.queries ?? [])
    .filter((query) => query.id.trim() && query.name.trim() && query.jql.trim())
    .map((query) => ({
      ...query,
      id: query.id.trim(),
      name: query.name.trim(),
      jql: query.jql.trim(),
      note: query.note?.trim() || undefined,
    }));

  if (queries.length === 0) {
    return { defaultQueryId: fallbackQuery.id, queries: [fallbackQuery] };
  }

  const defaultQueryId =
    config?.defaultQueryId && queries.some((query) => query.id === config.defaultQueryId)
      ? config.defaultQueryId
      : queries[0].id;
  return { defaultQueryId, queries };
}

function getTimeWindowClause(window: QueryTimeWindow, _target: JiraQueryTarget): string {
  if (window === "current-month") {
    return "(created >= startOfMonth() OR updated >= startOfMonth() OR resolved >= startOfMonth())";
  }
  if (window === "last-month") {
    return (
      "((created >= startOfMonth(-1) AND created < startOfMonth()) " +
      "OR (updated >= startOfMonth(-1) AND updated < startOfMonth()) " +
      "OR (resolved >= startOfMonth(-1) AND resolved < startOfMonth()))"
    );
  }
  if (window === "ytd") {
    return "(created >= startOfYear() OR updated >= startOfYear() OR resolved >= startOfYear())";
  }
  return "";
}

function requireQueryCollection(collection: JiraQueryCollection | undefined): JiraQueryCollection {
  if (!collection) {
    throw new Error("Normalized Jira query configuration is missing a query collection.");
  }
  return collection;
}
