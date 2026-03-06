import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type SleValues, type TeamRuntime } from "../types/contracts";

type SleLineKey = "p50" | "p70" | "p85" | "p95";

interface TeamDetailProps {
  team: TeamRuntime | null;
  title?: string;
  subtitle?: string;
  periodFilter: string;
  sleValues?: SleValues;
  lineVisibility: Record<SleLineKey, boolean>;
  sleIssueTypeOptions?: string[];
  sleIncludedIssueTypes?: string[];
  sleTypeDirty?: boolean;
  onToggleSleIssueType?: (issueType: string) => void;
  onResetSleIssueTypes?: () => void;
  onApplySleIssueTypes?: () => void;
  excludedIssueKeys?: string[];
  busy?: boolean;
  onExcludeIssue?: (issueKey: string) => void;
  onExcludeIssues?: (issueKeys: string[]) => void;
  onRestoreIssue?: (issueKey: string) => void;
  onRestoreAllIssues?: () => void;
}

interface TooltipPayload {
  payload: {
    issueKey: string;
    resolutionDate: string;
    cycleTimeDays: number;
  };
}

interface ScatterDataPoint {
  issueKey: string;
  resolutionDate: string;
  cycleTimeDays: number;
  resolutionTs: number;
}

export function TeamDetail({
  team,
  title = "Team detail",
  subtitle = "Scatter: x=resolutionDate, y=cycleTimeDays",
  periodFilter,
  sleValues,
  lineVisibility,
  sleIssueTypeOptions = [],
  sleIncludedIssueTypes = [],
  sleTypeDirty = false,
  onToggleSleIssueType,
  onResetSleIssueTypes,
  onApplySleIssueTypes,
  excludedIssueKeys = [],
  busy = false,
  onExcludeIssue,
  onExcludeIssues,
  onRestoreIssue,
  onRestoreAllIssues,
}: TeamDetailProps): JSX.Element {
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);
  const [bulkThreshold, setBulkThreshold] = useState<number>(30);

  if (!team) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="muted">Select a team to view scatter plot.</p>
      </section>
    );
  }

  if (!team.metrics || team.metrics.scatter.length === 0) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="muted">No scatter data yet. Import CSV and run analysis.</p>
      </section>
    );
  }

  const chartData: ScatterDataPoint[] = team.metrics.scatter
    .map((point) => ({
      ...point,
      resolutionTs: new Date(point.resolutionDate).getTime(),
    }))
    .filter((point) => Number.isFinite(point.resolutionTs));

  const filteredChartData = chartData.filter((point) => isIsoDateInPeriod(point.resolutionDate, periodFilter));
  const selectedPoint = filteredChartData.find((point) => point.issueKey === selectedIssueKey) ?? null;

  const overlay = sleValues ?? team.metrics.scatterOverlay;
  const sleIssueTypeSet = useMemo(
    () => new Set(sleIncludedIssueTypes.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0)),
    [sleIncludedIssueTypes],
  );
  const excludedSorted = [...excludedIssueKeys]
    .filter((value) => value.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));

  const excludedSet = useMemo(() => {
    return new Set(excludedSorted);
  }, [excludedSorted]);

  const thresholdOptions = useMemo(() => {
    return buildThresholdOptions(filteredChartData);
  }, [filteredChartData]);

  useEffect(() => {
    if (thresholdOptions.length === 0) {
      setBulkThreshold(0);
      return;
    }

    setBulkThreshold((current) => {
      if (thresholdOptions.includes(current)) {
        return current;
      }
      return thresholdOptions[0];
    });
  }, [thresholdOptions]);

  const bulkCandidateKeys = useMemo(() => {
    if (thresholdOptions.length === 0 || bulkThreshold <= 0) {
      return [];
    }

    const keys = filteredChartData
      .filter((point) => point.cycleTimeDays >= bulkThreshold)
      .map((point) => point.issueKey);

    return Array.from(new Set(keys)).filter((key) => !excludedSet.has(key));
  }, [bulkThreshold, excludedSet, filteredChartData, thresholdOptions]);

  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="detail-subtitle">{subtitle}</div>

      {sleIssueTypeOptions.length > 0 && (
        <section className="sle-type-filter">
          <div className="sle-type-filter-head">
            <strong>SLE includes issue types</strong>
            <div className="sle-type-filter-actions">
              <button type="button" className="soft-btn" onClick={onResetSleIssueTypes} disabled={busy}>
                Reset
              </button>
              <button
                type="button"
                className="soft-btn"
                onClick={onApplySleIssueTypes}
                disabled={busy || !sleTypeDirty || sleIncludedIssueTypes.length === 0}
              >
                Apply
              </button>
            </div>
          </div>
          <div className="sle-type-filter-list">
            {sleIssueTypeOptions.map((issueType) => {
              const key = issueType.trim().toLowerCase();
              const checked = sleIssueTypeSet.has(key);
              return (
                <label key={issueType} className="sle-type-chip">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleSleIssueType?.(issueType)}
                    disabled={busy}
                  />
                  <span>{issueType}</span>
                </label>
              );
            })}
          </div>
        </section>
      )}

      <div className="percentile-legend">
        {lineVisibility.p50 && overlay.p50 !== null && <span className="p50">P50: {overlay.p50.toFixed(1)}d</span>}
        {lineVisibility.p70 && overlay.p70 !== null && <span className="p70">P70: {overlay.p70.toFixed(1)}d</span>}
        {lineVisibility.p85 && overlay.p85 !== null && <span className="p85">P85: {overlay.p85.toFixed(1)}d</span>}
        {lineVisibility.p95 && overlay.p95 !== null && <span className="p95">P95: {overlay.p95.toFixed(1)}d</span>}
      </div>

      {filteredChartData.length === 0 ? (
        <div className="muted">No completed issues in selected period.</div>
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={420}>
            <ScatterChart margin={{ top: 12, right: 24, bottom: 50, left: 18 }}>
              <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />

              <XAxis
                type="number"
                dataKey="resolutionTs"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value) => formatShortDate(value)}
                label={{ value: "Resolution Date (chronological)", position: "bottom", offset: 28 }}
                stroke="#6b7280"
              />
              <YAxis
                type="number"
                dataKey="cycleTimeDays"
                tickFormatter={(value) => value.toFixed(0)}
                label={{ value: "Cycle Time (days)", angle: -90, position: "insideLeft", offset: -2 }}
                stroke="#6b7280"
              />

              <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#9ca3af" }} />

              <Scatter
                data={filteredChartData}
                fill="#7ea8f9"
                fillOpacity={0.9}
                name="Issues"
                onClick={(entry: unknown) => {
                  const point = extractPointFromScatterClick(entry);
                  if (point) {
                    setSelectedIssueKey(point.issueKey);
                  }
                }}
              />
              {lineVisibility.p50 && overlay.p50 !== null && (
                <ReferenceLine y={overlay.p50} stroke="#22c55e" strokeDasharray="6 6" />
              )}
              {lineVisibility.p70 && overlay.p70 !== null && (
                <ReferenceLine y={overlay.p70} stroke="#3b82f6" strokeDasharray="6 6" />
              )}
              {lineVisibility.p85 && overlay.p85 !== null && (
                <ReferenceLine y={overlay.p85} stroke="#f59e0b" strokeDasharray="6 6" />
              )}
              {lineVisibility.p95 && overlay.p95 !== null && (
                <ReferenceLine y={overlay.p95} stroke="#ef4444" strokeDasharray="6 6" />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      <section className="anomaly-toolbar">
        <div className="selected-point">
          {selectedPoint ? (
            <>
              <strong>{selectedPoint.issueKey}</strong>
              <span>{formatLongDate(selectedPoint.resolutionDate)}</span>
              <span>{selectedPoint.cycleTimeDays.toFixed(1)}d</span>
            </>
          ) : (
            <span>Click a point to select anomaly candidate.</span>
          )}
        </div>

        <div className="anomaly-actions">
          <button
            type="button"
            className="soft-btn"
            disabled={!selectedPoint || busy}
            onClick={() => {
              if (!selectedPoint || !onExcludeIssue) {
                return;
              }
              onExcludeIssue(selectedPoint.issueKey);
              setSelectedIssueKey(null);
            }}
          >
            Exclude Selected Issue
          </button>

          <div className="bulk-exclude-row">
            <label>
              Exclude tickets:
              <select
                value={thresholdOptions.length === 0 ? "" : String(bulkThreshold)}
                onChange={(event) => setBulkThreshold(Number.parseInt(event.target.value, 10) || 0)}
                disabled={thresholdOptions.length === 0 || busy}
              >
                {thresholdOptions.length === 0 ? (
                  <option value="">No thresholds</option>
                ) : (
                  thresholdOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}+ days
                    </option>
                  ))
                )}
              </select>
            </label>

            <button
              type="button"
              className="soft-btn"
              disabled={busy || !onExcludeIssues || bulkCandidateKeys.length === 0}
              onClick={() => {
                if (!onExcludeIssues || bulkCandidateKeys.length === 0) {
                  return;
                }
                onExcludeIssues(bulkCandidateKeys);
                if (selectedIssueKey && bulkCandidateKeys.includes(selectedIssueKey)) {
                  setSelectedIssueKey(null);
                }
              }}
            >
              Exclude {bulkCandidateKeys.length} Ticket(s)
            </button>
          </div>
        </div>
      </section>

      {excludedSorted.length > 0 && (
        <section className="excluded-anomalies">
          <div className="excluded-head">
            <h3>Excluded anomalies ({excludedSorted.length})</h3>
            {onRestoreAllIssues && (
              <button type="button" className="soft-btn" disabled={busy} onClick={onRestoreAllIssues}>
                Restore All
              </button>
            )}
          </div>
          <div className="excluded-chip-list">
            {excludedSorted.map((issueKey) => (
              <button
                key={issueKey}
                type="button"
                className="chip-btn"
                disabled={busy}
                onClick={() => onRestoreIssue?.(issueKey)}
              >
                {issueKey} ×
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }): JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <div className="tooltip-key">{point.issueKey}</div>
      <div className="tooltip-date">Resolved: {formatLongDate(point.resolutionDate)}</div>
      <div className="tooltip-cycle">Cycle Time: {point.cycleTimeDays.toFixed(1)} days</div>
    </div>
  );
}

function extractPointFromScatterClick(input: unknown): ScatterDataPoint | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Record<string, unknown>;
  const payload = (raw.payload && typeof raw.payload === "object" ? raw.payload : raw) as Record<string, unknown>;

  const issueKey = typeof payload.issueKey === "string" ? payload.issueKey : null;
  const resolutionDate = typeof payload.resolutionDate === "string" ? payload.resolutionDate : null;
  const cycleTimeDays = typeof payload.cycleTimeDays === "number" ? payload.cycleTimeDays : null;

  if (!issueKey || !resolutionDate || cycleTimeDays === null || !Number.isFinite(cycleTimeDays)) {
    return null;
  }

  const resolutionTs =
    typeof payload.resolutionTs === "number" && Number.isFinite(payload.resolutionTs)
      ? payload.resolutionTs
      : new Date(resolutionDate).getTime();

  if (!Number.isFinite(resolutionTs)) {
    return null;
  }

  return {
    issueKey,
    resolutionDate,
    cycleTimeDays,
    resolutionTs,
  };
}

function buildThresholdOptions(points: ScatterDataPoint[]): number[] {
  if (points.length === 0) {
    return [];
  }

  const maxCycleTime = Math.max(...points.map((point) => point.cycleTimeDays));
  if (!Number.isFinite(maxCycleTime) || maxCycleTime < 10) {
    return [];
  }

  const upper = Math.ceil(maxCycleTime / 10) * 10;
  const options: number[] = [];

  for (let value = 10; value <= upper; value += 10) {
    options.push(value);
  }

  return options;
}

function isMonthPeriod(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function isIsoDateInPeriod(isoDate: string, period: string): boolean {
  if (!isoDate) {
    return false;
  }

  if (period === "all") {
    return true;
  }

  const monthToken = isoDate.slice(0, 7);
  if (!isMonthPeriod(monthToken)) {
    return false;
  }

  if (isMonthPeriod(period)) {
    return monthToken === period;
  }

  if (period === "ytd") {
    const [yearRaw, monthRaw] = monthToken.split("-");
    const year = Number.parseInt(yearRaw, 10);
    const monthNum = Number.parseInt(monthRaw, 10);

    if (!Number.isFinite(year) || !Number.isFinite(monthNum)) {
      return false;
    }

    const now = new Date();
    const cutoffMonth = now.getMonth() + 1;

    return year === now.getFullYear() && monthNum <= cutoffMonth;
  }

  return false;
}

function formatShortDate(value: number): string {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatLongDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
