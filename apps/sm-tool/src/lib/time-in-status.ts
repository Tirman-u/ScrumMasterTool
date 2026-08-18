import { type BottleneckEntry } from "../types/contracts";
import { parseDate } from "./csv";
import { type DurationBasis } from "./working-days";

export interface TimeInStatusParseOptions {
  headers: string[];
  rows: Array<Record<string, string>>;
  fallbackPeriod: string;
  flowStatuses?: string[];
  includeAllStatuses?: boolean;
}

export interface TimeInStatusIssueRow {
  issueKey: string;
  resolvedDate?: Date | null;
  periodHint?: string;
  durationBasis?: DurationBasis;
  durations: Array<{ status: string; days: number }>;
}

export interface TimeInStatusIssuePeriodAggregationOptions {
  issueRows: TimeInStatusIssueRow[];
  issuePeriodByKey: ReadonlyMap<string, string>;
  flowStatuses?: string[];
  includeAllStatuses?: boolean;
}

interface TimeInStatusRecord {
  issueKey: string;
  updatedMs: number;
  resolvedDate: Date | null;
  resolvedMs: number;
  rowIndex: number;
  period: string;
  durationBasis: DurationBasis;
  durations: Array<{ status: string; days: number }>;
}

const META_HEADER_EXACT = new Set<string>([
  "issue key",
  "key",
  "summary",
  "description",
  "type",
  "issue type",
  "status",
  "priority",
  "assignee",
  "reporter",
  "created",
  "updated",
  "resolved",
  "resolution",
  "resolution date",
  "project",
  "labels",
  "epic link",
  "sprint",
  "average time taken",
  "average time taken (from table)",
  "avg time taken",
  "duration basis",
]);

const META_HEADER_CONTAINS = [
  "average time taken",
  "total time",
  "time spent",
  "time in status",
];

const SUMMARY_ROW_HINTS = ["average time taken", "avg time taken"];

const RESOLUTION_HEADER_HINTS = ["resolution date", "resolved", "date resolved"];
const UPDATED_HEADER_HINTS = ["updated", "last updated", "updated date"];
const ISSUE_KEY_HEADER_HINTS = ["issue key", "key", "issue", "jira"];

const TERMINAL_STATUS_HINTS = new Set<string>([
  "done",
  "closed",
  "resolved",
  "abandoned",
  "cancelled",
  "canceled",
  "won't do",
  "wont do",
]);

const CANCELLED_STATUS_HINTS = [
  "abandon",
  "cancel",
  "won't do",
  "wont do",
  "reject",
  "declin",
  "duplicate",
  "obsolete",
  "discard",
  "removed",
  "out of scope",
];

const DEFAULT_NON_FLOW_STATUS_HINTS = [
  ...CANCELLED_STATUS_HINTS,
  "backlog",
  "to do",
  "todo",
  "open",
  "ready for refinement",
  "refinement",
];

export function isTimeInStatusCsv(headers: string[], rows: Array<Record<string, string>>): boolean {
  if (headers.length === 0 || rows.length === 0) {
    return false;
  }

  const durationHeaders = detectDurationHeaders(headers, rows);
  return durationHeaders.length >= 2;
}

export function parseTimeInStatusIssueRows(options: TimeInStatusParseOptions): TimeInStatusIssueRow[] {
  const { headers, rows, flowStatuses = [], includeAllStatuses = false } = options;
  const fallbackPeriod = sanitizePeriod(options.fallbackPeriod);

  if (headers.length === 0 || rows.length === 0) {
    return [];
  }

  const detectedDurationHeaders = detectDurationHeaders(headers, rows);
  if (detectedDurationHeaders.length === 0) {
    return [];
  }

  const normalizedFlowStatuses = normalizeStatuses(flowStatuses);
  const flowNameByKey = new Map(normalizedFlowStatuses.map((value) => [normalizeText(value), value]));

  let durationHeaders = detectedDurationHeaders;
  if (includeAllStatuses) {
    durationHeaders = detectedDurationHeaders.filter((header) => !isCancelledLikeStatus(header));
  } else if (normalizedFlowStatuses.length > 0) {
    const flowOrder = new Set(normalizedFlowStatuses.map((value) => normalizeText(value)));
    durationHeaders = detectedDurationHeaders.filter(
      (header) => flowOrder.has(normalizeText(header)) && !isCancelledLikeStatus(header),
    );
  } else {
    durationHeaders = detectedDurationHeaders.filter((header) => !isDefaultNonFlowStatus(header));
  }

  if (durationHeaders.length === 0) {
    return [];
  }

  const resolutionHeader = findHeader(headers, RESOLUTION_HEADER_HINTS);
  const updatedHeader = findHeader(headers, UPDATED_HEADER_HINTS);
  const issueKeyHeader = findHeader(headers, ISSUE_KEY_HEADER_HINTS);
  const durationBasisHeader = headers.find((header) => normalizeText(header) === "duration basis");

  const records: TimeInStatusRecord[] = [];

  rows.forEach((row, rowIndex) => {
    if (isSummaryRow(row)) {
      return;
    }

    const durations = durationHeaders
      .map((header) => {
        const days = parseTimeInStatusDurationDays(row[header]);
        if (days === null || days <= 0) {
          return null;
        }

        const statusKey = normalizeText(header);
        return {
          status: flowNameByKey.get(statusKey) ?? header.trim(),
          days,
        };
      })
      .filter((item): item is { status: string; days: number } => item !== null);

    if (durations.length === 0) {
      return;
    }

    const issueKey = issueKeyHeader ? (row[issueKeyHeader] ?? "").trim() : "";
    const updatedMs = updatedHeader
      ? parseDate(row[updatedHeader])?.getTime() ?? Number.NEGATIVE_INFINITY
      : Number.NEGATIVE_INFINITY;
    const resolvedDate = resolutionHeader ? parseDate(row[resolutionHeader]) : null;
    const resolvedMs = resolvedDate?.getTime() ?? Number.NEGATIVE_INFINITY;

    records.push({
      issueKey,
      updatedMs,
      resolvedDate,
      resolvedMs,
      rowIndex,
      period: resolvedDate ? toMonthKey(resolvedDate) : fallbackPeriod,
      durationBasis: parseDurationBasis(durationBasisHeader ? row[durationBasisHeader] : undefined),
      durations,
    });
  });

  if (records.length === 0) {
    return [];
  }

  const deduped = dedupeTimeInStatusRecords(records);

  return deduped.map((record) => ({
    issueKey: record.issueKey,
    resolvedDate: record.resolvedDate,
    periodHint: record.period,
    durationBasis: record.durationBasis,
    durations: record.durations,
  }));
}

function parseDurationBasis(value: string | undefined): DurationBasis {
  return normalizeText(value ?? "") === "working-days" ? "working-days" : "calendar-days";
}

export function buildAutoBottleneckEntriesFromIssueRows(
  options: TimeInStatusIssuePeriodAggregationOptions,
): BottleneckEntry[] {
  const { issueRows, issuePeriodByKey, flowStatuses = [], includeAllStatuses = false } = options;
  if (issueRows.length === 0 || issuePeriodByKey.size === 0) {
    return [];
  }

  const normalizedFlowStatuses = normalizeStatuses(flowStatuses);
  const flowOrder = new Map(normalizedFlowStatuses.map((value, index) => [normalizeText(value), index]));
  const flowNameByKey = new Map(normalizedFlowStatuses.map((value) => [normalizeText(value), value]));

  const dedupedByIssue = new Map<string, TimeInStatusIssueRow>();
  issueRows.forEach((row) => {
    const key = normalizeText(row.issueKey);
    if (!key) {
      return;
    }
    // Keep the latest imported row for each issue key.
    dedupedByIssue.set(key, row);
  });

  const periodAgg = new Map<string, Map<string, { sumDays: number; count: number }>>();

  dedupedByIssue.forEach((row, issueKey) => {
    const period = issuePeriodByKey.get(issueKey);
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return;
    }

    const byStatus = periodAgg.get(period) ?? new Map<string, { sumDays: number; count: number }>();

    row.durations.forEach((duration) => {
      if (!Number.isFinite(duration.days) || duration.days <= 0) {
        return;
      }

      const rawStatus = duration.status.trim();
      const statusKey = normalizeText(rawStatus);
      if (!statusKey) {
        return;
      }

      if (includeAllStatuses) {
        if (isCancelledLikeStatus(rawStatus)) {
          return;
        }
      } else if (normalizedFlowStatuses.length > 0) {
        if (!flowOrder.has(statusKey) || isCancelledLikeStatus(rawStatus)) {
          return;
        }
      } else if (isDefaultNonFlowStatus(rawStatus)) {
        return;
      }

      const status = flowNameByKey.get(statusKey) ?? rawStatus;
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
          sampleCount: value.count,
        }))
        .filter((column) => Number.isFinite(column.avgDays) && column.avgDays > 0);

      return {
        period,
        columns: includeAllStatuses ? columns : sortColumns(columns, flowOrder),
      };
    })
    .filter((entry) => entry.columns.length > 0)
    .sort((a, b) => a.period.localeCompare(b.period));
}

export function buildAutoBottleneckEntriesFromTimeInStatus(options: TimeInStatusParseOptions): BottleneckEntry[] {
  const { headers, rows, flowStatuses = [], includeAllStatuses = false } = options;
  const fallbackPeriod = sanitizePeriod(options.fallbackPeriod);

  if (headers.length === 0 || rows.length === 0) {
    return [];
  }

  const detectedDurationHeaders = detectDurationHeaders(headers, rows);
  if (detectedDurationHeaders.length === 0) {
    return [];
  }

  const normalizedFlowStatuses = normalizeStatuses(flowStatuses);
  const flowOrder = new Map(normalizedFlowStatuses.map((value, index) => [normalizeText(value), index]));
  const flowNameByKey = new Map(normalizedFlowStatuses.map((value) => [normalizeText(value), value]));

  let durationHeaders = detectedDurationHeaders;

  if (includeAllStatuses) {
    durationHeaders = detectedDurationHeaders.filter((header) => !isCancelledLikeStatus(header));
  } else if (normalizedFlowStatuses.length > 0) {
    durationHeaders = detectedDurationHeaders.filter(
      (header) => flowOrder.has(normalizeText(header)) && !isTerminalOrCancelledStatus(header),
    );
  } else {
    durationHeaders = detectedDurationHeaders.filter((header) => !isDefaultNonFlowStatus(header));
  }

  if (durationHeaders.length === 0) {
    return [];
  }

  const summaryRow = rows.find((row) => isSummaryRow(row));
  if (summaryRow) {
    const columns = durationHeaders
      .map((header) => {
        const days = parseTimeInStatusDurationDays(summaryRow[header]);
        if (days === null || days <= 0) {
          return null;
        }

        const statusKey = normalizeText(header);
        return {
          name: flowNameByKey.get(statusKey) ?? header.trim(),
          avgDays: days,
        };
      })
      .filter((item): item is { name: string; avgDays: number } => item !== null);

    if (columns.length > 0) {
      return [
        {
          period: fallbackPeriod,
          columns: includeAllStatuses ? columns : sortColumns(columns, flowOrder),
        },
      ];
    }
  }

  const resolutionHeader = findHeader(headers, RESOLUTION_HEADER_HINTS);
  const updatedHeader = findHeader(headers, UPDATED_HEADER_HINTS);
  const issueKeyHeader = findHeader(headers, ISSUE_KEY_HEADER_HINTS);

  const records: TimeInStatusRecord[] = [];

  rows.forEach((row, rowIndex) => {
    if (isSummaryRow(row)) {
      return;
    }

    const durations = durationHeaders
      .map((header) => {
        const days = parseTimeInStatusDurationDays(row[header]);
        if (days === null || days <= 0) {
          return null;
        }

        const statusKey = normalizeText(header);
        return {
          status: flowNameByKey.get(statusKey) ?? header.trim(),
          days,
        };
      })
      .filter((item): item is { status: string; days: number } => item !== null);

    if (durations.length === 0) {
      return;
    }

    const issueKey = issueKeyHeader ? (row[issueKeyHeader] ?? "").trim() : "";
    const updatedMs = updatedHeader ? parseDate(row[updatedHeader])?.getTime() ?? Number.NEGATIVE_INFINITY : Number.NEGATIVE_INFINITY;
    const resolvedDate = resolutionHeader ? parseDate(row[resolutionHeader]) : null;
    const resolvedMs = resolvedDate?.getTime() ?? Number.NEGATIVE_INFINITY;

    records.push({
      issueKey,
      updatedMs,
      resolvedDate,
      resolvedMs,
      rowIndex,
      period: resolvedDate ? toMonthKey(resolvedDate) : fallbackPeriod,
      durationBasis: "calendar-days",
      durations,
    });
  });

  if (records.length === 0) {
    return [];
  }

  const deduped = dedupeTimeInStatusRecords(records);

  const periodAgg = new Map<string, Map<string, { sumDays: number; count: number }>>();

  deduped.forEach((record) => {
    const byStatus = periodAgg.get(record.period) ?? new Map<string, { sumDays: number; count: number }>();

    record.durations.forEach((duration) => {
      const current = byStatus.get(duration.status) ?? { sumDays: 0, count: 0 };
      current.sumDays += duration.days;
      current.count += 1;
      byStatus.set(duration.status, current);
    });

    periodAgg.set(record.period, byStatus);
  });

  return Array.from(periodAgg.entries())
    .map(([period, byStatus]) => {
      const columns = Array.from(byStatus.entries())
        .map(([name, value]) => ({
          name,
          avgDays: value.count > 0 ? value.sumDays / value.count : 0,
          sampleCount: value.count,
        }))
        .filter((column) => Number.isFinite(column.avgDays) && column.avgDays > 0);

      return {
        period,
        columns: includeAllStatuses ? columns : sortColumns(columns, flowOrder),
      };
    })
    .filter((entry) => entry.columns.length > 0)
    .sort((a, b) => a.period.localeCompare(b.period));
}

export function parseTimeInStatusDurationDays(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/,/g, ".")
    .trim();

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
      if (unit === "w") {
        totalDays += amount * 7;
      } else if (unit === "d") {
        totalDays += amount;
      } else if (unit === "h") {
        totalDays += amount / 24;
      } else if (unit === "m") {
        totalDays += amount / 1440;
      }
    }

    match = unitPattern.exec(normalized);
  }

  if (parsedAny) {
    return totalDays;
  }

  const clockMatch = normalized.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clockMatch) {
    const hours = Number.parseInt(clockMatch[1], 10);
    const minutes = Number.parseInt(clockMatch[2], 10);
    const seconds = Number.parseInt(clockMatch[3] ?? "0", 10);

    if (
      Number.isFinite(hours) &&
      Number.isFinite(minutes) &&
      Number.isFinite(seconds) &&
      minutes >= 0 &&
      minutes < 60 &&
      seconds >= 0 &&
      seconds < 60
    ) {
      return hours / 24 + minutes / 1440 + seconds / 86400;
    }
  }

  return null;
}

export function isDefaultNonFlowStatus(statusName: string | undefined): boolean {
  if (isTerminalOrCancelledStatus(statusName)) {
    return true;
  }

  const normalized = normalizeText(statusName);
  if (!normalized) {
    return true;
  }

  return DEFAULT_NON_FLOW_STATUS_HINTS.some((hint) => normalized.includes(hint));
}

export function isTerminalOrCancelledStatus(statusName: string | undefined): boolean {
  const normalized = normalizeText(statusName);
  if (!normalized) {
    return true;
  }

  if (TERMINAL_STATUS_HINTS.has(normalized)) {
    return true;
  }

  return CANCELLED_STATUS_HINTS.some((hint) => normalized.includes(hint));
}

function isCancelledLikeStatus(statusName: string | undefined): boolean {
  const normalized = normalizeText(statusName);
  if (!normalized) {
    return true;
  }

  return CANCELLED_STATUS_HINTS.some((hint) => normalized.includes(hint));
}

function detectDurationHeaders(headers: string[], rows: Array<Record<string, string>>): string[] {
  const candidates = headers.filter((header) => !isMetadataHeader(header));
  const counts = new Map<string, number>();

  rows.slice(0, 300).forEach((row) => {
    candidates.forEach((header) => {
      const days = parseTimeInStatusDurationDays(row[header]);
      if (days !== null) {
        counts.set(header, (counts.get(header) ?? 0) + 1);
      }
    });
  });

  return candidates.filter((header) => (counts.get(header) ?? 0) > 0);
}

function dedupeTimeInStatusRecords(records: TimeInStatusRecord[]): TimeInStatusRecord[] {
  const dedupedByIssue = new Map<string, TimeInStatusRecord>();
  const withoutIssueKey: TimeInStatusRecord[] = [];

  records.forEach((record) => {
    if (!record.issueKey) {
      withoutIssueKey.push(record);
      return;
    }

    const existing = dedupedByIssue.get(record.issueKey);
    if (!existing || isRecordNewer(record, existing)) {
      dedupedByIssue.set(record.issueKey, record);
    }
  });

  return [...dedupedByIssue.values(), ...withoutIssueKey];
}

function isRecordNewer(candidate: TimeInStatusRecord, existing: TimeInStatusRecord): boolean {
  if (candidate.updatedMs !== existing.updatedMs) {
    return candidate.updatedMs > existing.updatedMs;
  }

  if (candidate.resolvedMs !== existing.resolvedMs) {
    return candidate.resolvedMs > existing.resolvedMs;
  }

  return candidate.rowIndex > existing.rowIndex;
}

function isMetadataHeader(header: string): boolean {
  const normalized = normalizeText(header);
  if (!normalized) {
    return true;
  }

  if (META_HEADER_EXACT.has(normalized)) {
    return true;
  }

  return META_HEADER_CONTAINS.some((hint) => normalized.includes(hint));
}

function isSummaryRow(row: Record<string, string>): boolean {
  return Object.values(row).some((value) => {
    const normalized = normalizeText(value);
    if (!normalized) {
      return false;
    }

    return SUMMARY_ROW_HINTS.some((hint) => normalized.includes(hint));
  });
}

function findHeader(headers: string[], hints: string[]): string | null {
  for (const header of headers) {
    const normalized = normalizeText(header);
    if (!normalized) {
      continue;
    }

    if (hints.some((hint) => normalized === hint || normalized.includes(hint))) {
      return header;
    }
  }

  return null;
}

function normalizeStatuses(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  values.forEach((value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    const key = normalizeText(trimmed);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push(trimmed);
  });

  return normalized;
}

function sortColumns(
  columns: Array<{ name: string; avgDays: number }>,
  flowOrder: Map<string, number>,
): Array<{ name: string; avgDays: number }> {
  return columns
    .slice()
    .sort((a, b) => {
      const orderA = flowOrder.get(normalizeText(a.name));
      const orderB = flowOrder.get(normalizeText(b.name));

      if (orderA !== undefined && orderB !== undefined) {
        return orderA - orderB;
      }

      if (orderA !== undefined) {
        return -1;
      }

      if (orderB !== undefined) {
        return 1;
      }

      if (a.avgDays !== b.avgDays) {
        return b.avgDays - a.avgDays;
      }

      return a.name.localeCompare(b.name);
    });
}

function sanitizePeriod(value: string): string {
  if (/^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  return toMonthKey(new Date());
}

function toMonthKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
