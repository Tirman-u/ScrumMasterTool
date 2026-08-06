import { useMemo, useState } from "react";
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
import { type IssueExclusion, type SleValues, type TeamRuntime } from "../types/contracts";
import { isIsoDateInPeriod } from "../lib/period";

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
  issueExclusions?: IssueExclusion[];
  presentationMode?: boolean;
  busy?: boolean;
  onExcludeIssue?: (issueKey: string, reason: string) => void;
  onExcludeIssues?: (issueKeys: string[], reason: string) => void;
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

const BULK_EXCLUSION_DAY_THRESHOLDS = [50, 100, 200, 300];

export function TeamDetail({
  team,
  title = "Team detail",
  subtitle = "Resolution date vs Cycle Time in working days",
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
  issueExclusions = [],
  presentationMode = false,
  busy = false,
  onExcludeIssue,
  onExcludeIssues,
  onRestoreIssue,
  onRestoreAllIssues,
}: TeamDetailProps): JSX.Element {
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);
  const [exclusionReason, setExclusionReason] = useState("");
  const [bulkExcludeThreshold, setBulkExcludeThreshold] = useState(100);
  const chartData: ScatterDataPoint[] = (team?.metrics?.scatter ?? [])
    .map((point) => ({
      ...point,
      resolutionTs: new Date(point.resolutionDate).getTime(),
    }))
    .filter((point) => Number.isFinite(point.resolutionTs));

  const filteredChartData = chartData.filter((point) => isIsoDateInPeriod(point.resolutionDate, periodFilter));
  const selectedPoint = filteredChartData.find((point) => point.issueKey === selectedIssueKey) ?? null;

  const overlay = sleValues ?? team?.metrics?.scatterOverlay ?? { p50: null, p70: null, p85: null, p95: null };
  const dataMaximum = filteredChartData.reduce((maximum, point) => Math.max(maximum, point.cycleTimeDays), 0);
  const presentationScaleMaximum =
    presentationMode && overlay.p95 !== null
      ? Math.max(1, Math.min(dataMaximum, Math.max(overlay.p95 * 1.5, (overlay.p85 ?? 0) * 2, 1)))
      : dataMaximum;
  const pointsAbovePresentationScale = presentationMode
    ? filteredChartData.filter((point) => point.cycleTimeDays > presentationScaleMaximum).length
    : 0;
  const sleIssueTypeSet = useMemo(
    () => new Set(sleIncludedIssueTypes.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0)),
    [sleIncludedIssueTypes],
  );
  const excludedSorted = [...excludedIssueKeys]
    .filter((value) => value.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));
  const excludedIssueKeySet = useMemo(
    () => new Set(excludedIssueKeys.map((issueKey) => normalizeIssueKey(issueKey)).filter((issueKey) => issueKey.length > 0)),
    [excludedIssueKeys],
  );
  const bulkExcludeIssueKeys = useMemo(() => {
    const keys = new Set<string>();
    filteredChartData.forEach((point) => {
      if (point.cycleTimeDays >= bulkExcludeThreshold && !excludedIssueKeySet.has(normalizeIssueKey(point.issueKey))) {
        keys.add(point.issueKey);
      }
    });
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [bulkExcludeThreshold, excludedIssueKeySet, filteredChartData]);
  const exclusionReasonByKey = useMemo(
    () => new Map(issueExclusions.map((exclusion) => [exclusion.issueKey, exclusion.reason])),
    [issueExclusions],
  );

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

  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="detail-subtitle">{subtitle}</div>

      {!presentationMode && sleIssueTypeOptions.length > 0 && (
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
        {lineVisibility.p50 && overlay.p50 !== null && <span className="p50">P50: {overlay.p50.toFixed(1)} wd</span>}
        {lineVisibility.p70 && overlay.p70 !== null && <span className="p70">P70: {overlay.p70.toFixed(1)} wd</span>}
        {lineVisibility.p85 && overlay.p85 !== null && <span className="p85">P85: {overlay.p85.toFixed(1)} wd</span>}
        {lineVisibility.p95 && overlay.p95 !== null && <span className="p95">P95: {overlay.p95.toFixed(1)} wd</span>}
        {pointsAbovePresentationScale > 0 && (
          <span className="scale-outliers">{pointsAbovePresentationScale} extreme items above scale</span>
        )}
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
                domain={presentationMode ? [0, presentationScaleMaximum] : [0, "auto"]}
                allowDataOverflow={presentationMode}
                tickFormatter={(value) => value.toFixed(0)}
                label={{ value: "Working days", angle: -90, position: "insideLeft", offset: -2 }}
                stroke="#6b7280"
              />

              <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#9ca3af" }} />

              <Scatter
                data={filteredChartData}
                fill="#7ea8f9"
                fillOpacity={0.9}
                name="Issues"
                onClick={
                  presentationMode
                    ? undefined
                    : (entry: unknown) => {
                        const point = extractPointFromScatterClick(entry);
                        if (point) {
                          setSelectedIssueKey(point.issueKey);
                        }
                      }
                }
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

      {!presentationMode && filteredChartData.length > 0 ? (
        <details className="chart-data-table">
          <summary>Issue data ({filteredChartData.length})</summary>
          <div className="table-wrap">
            <table className="compact-table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Resolved</th>
                  <th>Working days</th>
                </tr>
              </thead>
              <tbody>
                {filteredChartData.map((point) => (
                  <tr key={`${point.issueKey}-${point.resolutionDate}`}>
                    <td>{point.issueKey}</td>
                    <td>{formatLongDate(point.resolutionDate)}</td>
                    <td>{point.cycleTimeDays.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      {!presentationMode && <section className="anomaly-toolbar">
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
          <label className="exclusion-reason-field">
            Data-quality reason
            <input
              value={exclusionReason}
              onChange={(event) => setExclusionReason(event.target.value)}
              placeholder="For example: corrupted migration date"
              disabled={busy}
            />
          </label>

          <div className="bulk-exclude-row" aria-label="Bulk exclude long cycle time items">
            <label>
              Exclude tickets at
              <select
                value={bulkExcludeThreshold}
                onChange={(event) => setBulkExcludeThreshold(Number(event.target.value))}
                disabled={busy}
              >
                {BULK_EXCLUSION_DAY_THRESHOLDS.map((threshold) => (
                  <option key={threshold} value={threshold}>
                    {threshold}+ working days
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="soft-btn"
              disabled={busy || bulkExcludeIssueKeys.length === 0}
              onClick={() => {
                if (!onExcludeIssues || bulkExcludeIssueKeys.length === 0) {
                  return;
                }
                onExcludeIssues(
                  bulkExcludeIssueKeys,
                  exclusionReason.trim() || `Cycle Time ${bulkExcludeThreshold}+ working days outlier`,
                );
                setSelectedIssueKey(null);
                setExclusionReason("");
              }}
            >
              Exclude {bulkExcludeIssueKeys.length} item{bulkExcludeIssueKeys.length === 1 ? "" : "s"}
            </button>
          </div>

          <button
            type="button"
            className="soft-btn"
            disabled={!selectedPoint || busy || exclusionReason.trim().length < 5}
            onClick={() => {
              if (!selectedPoint || !onExcludeIssue) {
                return;
              }
              onExcludeIssue(selectedPoint.issueKey, exclusionReason.trim());
              setSelectedIssueKey(null);
              setExclusionReason("");
            }}
          >
            Exclude data error
          </button>

        </div>
      </section>}

      {!presentationMode && excludedSorted.length > 0 && (
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
                title={exclusionReasonByKey.get(issueKey) ?? "Legacy exclusion without recorded reason"}
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
      <div className="tooltip-cycle">Cycle Time: {point.cycleTimeDays.toFixed(1)} working days</div>
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

function normalizeIssueKey(value: string): string {
  return value.trim().toLowerCase();
}

function formatShortDate(value: number): string {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatLongDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
