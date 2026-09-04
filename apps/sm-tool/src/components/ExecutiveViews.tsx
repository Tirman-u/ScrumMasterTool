import { createContext, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TeamDetail } from "./TeamDetail";
import { type IssueExclusion, type SleValues, type TeamMetrics, type TeamRuntime } from "../types/contracts";
import { type MetricTrust, type MetricTrustKey } from "../lib/metric-trust";
import { dedupeHistoricalPeriods, filterHistoricalPeriods, hasAdjacentValidPair, resolveAdjacentHistoricalDirection } from "../lib/historical-trends";
import { getMetricInsightDefinition, parseMetricPreviousValue } from "../lib/metric-insights";

export type ExecSig = "good" | "warning" | "critical" | "neutral";

export interface ExecutiveDashboardTeam {
  teamId: string;
  name: string;
  imports: number;
  dataRows: number;
  done: number;
  openTickets: number;
  lead: number | null;
  active: number | null;
  cycle: number | null;
  sle: number | null;
  bugRatio: number | null;
  workMix: string;
  velocity: string;
  bottleneck: string;
  bottleneckDays: number | null;
  health: ExecSig;
}

export interface ExecutiveDashboardSummary {
  teams: number;
  dataRows: number;
  done: number;
  openTickets: number;
  avgCycleTime: number | null;
  sleP85: number | null;
  latestDataLabel: string;
}

export interface ExecutiveTeamMetric {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  detail?: string;
  tone: ExecSig;
  prev?: string;
  trend?: "up" | "down" | "flat";
  trendGood?: boolean;
  metricTrust?: MetricTrust;
}

export interface ExecutiveFlowStage {
  name: string;
  days: number;
  type: "active" | "queue";
  signal: ExecSig;
}

export interface ExecutiveChartPoint {
  label: string;
  value?: number;
  p50?: number;
  p85?: number;
  count?: number;
  status?: string;
}

export interface ExecutiveStatusRow {
  status: string;
  total: number;
  d30: number;
  d60: number;
  d90: number;
  d90p: number;
}

export interface ExecutiveTicketRow {
  id: string;
  status: string;
  age: number;
  type: string;
}

export interface ExecutiveWorkflowItem {
  label: string;
  value: string;
}

export interface ExecutiveTeamDesignData {
  teamName: string;
  description: string;
  periodLabel: string;
  previousLabel: string | null;
  latestDataLabel: string;
  kpis: ExecutiveTeamMetric[];
  flowHealth: ExecutiveTeamMetric[];
  workHealth: ExecutiveTeamMetric[];
  processHealth: ExecutiveTeamMetric[];
  flowStages: ExecutiveFlowStage[];
  flowSummary: {
    queueDays: number;
    activeDays: number;
    totalDays: number;
    flowEfficiencyPct: number | null;
    biggestQueueName: string | null;
    biggestQueueDays: number | null;
  };
  flowTiming: TeamMetrics["flowTiming"];
  previousFlowTiming: TeamMetrics["flowTiming"] | null;
  historicalTrend: HistoricalTrendSnapshot[];
  selectedHistoricalPeriod: string;
  metricTrust: MetricTrust[];
  cycleTimePanel: {
    team: TeamRuntime;
    periodFilter: string;
    sleValues: SleValues;
    lineVisibility: Record<"p50" | "p70" | "p85" | "p95", boolean>;
    sleIssueTypeOptions: string[];
    sleIncludedIssueTypes: string[];
    sleTypeDirty: boolean;
    excludedIssueKeys: string[];
    issueExclusions: IssueExclusion[];
    busy: boolean;
    onToggleSleIssueType: (issueType: string) => void;
    onResetSleIssueTypes: () => void;
    onApplySleIssueTypes: () => void;
    onExcludeIssue: (issueKey: string, reason: string) => void;
    onExcludeIssues: (issueKeys: string[], reason: string) => void;
    onRestoreIssue: (issueKey: string) => void;
    onRestoreAllIssues: () => void;
  };
  throughputWeekly: ExecutiveChartPoint[];
  cycleTimeWeekly: ExecutiveChartPoint[];
  timeInStatus: ExecutiveFlowStage[];
  agingDist: ExecutiveChartPoint[];
  bottleneckMonthly: ExecutiveChartPoint[];
  statusRows: ExecutiveStatusRow[];
  oldestTickets: ExecutiveTicketRow[];
  workflowItems: ExecutiveWorkflowItem[];
  qualityCards: ExecutiveWorkflowItem[];
  dataStatus: {
    latestDataUpdate: string | null;
    lastCalculated: string | null;
    stale: boolean;
    recalculateState: "idle" | "loading" | "success" | "error" | "unavailable";
    recalculateMessage: string;
    onRecalculate: () => void;
    autoUpdateStatus: string;
    autoUpdateDetail: string | null;
    changedFileCounts: { added: number; changed: number; removed: number; meaningful: boolean };
    stableScans: number;
    autoUpdatesPaused: boolean;
    autoUpdateAvailable: boolean;
    manualRecalculateAvailable: boolean;
    autoUpdateNeedsRetry: boolean;
    onTryAgain: () => void;
    onToggleAutoUpdates: () => void;
  };
}

export interface HistoricalTrendSnapshot {
  period: string;
  capturedAt: string;
  cycleTime: number | null;
  sleP85: number | null;
  sample: number | null;
  usable: number | null;
  source: string | null;
}

const sigColor: Record<ExecSig, string> = {
  good: "#16A34A",
  warning: "#D97706",
  critical: "#DC2626",
  neutral: "#94A3B8",
};

const sigBg: Record<ExecSig, string> = {
  good: "#F0FDF4",
  warning: "#FFFBEB",
  critical: "#FEF2F2",
  neutral: "#F8FAFC",
};

const sigBorder: Record<ExecSig, string> = {
  good: "#BBF7D0",
  warning: "#FDE68A",
  critical: "#FECACA",
  neutral: "#E2E8F0",
};

const sigLabel: Record<ExecSig, string> = {
  good: "On Track",
  warning: "At Risk",
  critical: "Critical",
  neutral: "-",
};

function formatDays(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "-" : `${value.toFixed(1)}d`;
}

function formatPlainDays(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "-" : value.toFixed(1);
}

function formatPercent(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "-" : `${value.toFixed(1)}%`;
}

function trendColor(metric: ExecutiveTeamMetric): string | undefined {
  if (!metric.trend || metric.trend === "flat") {
    return metric.trend ? sigColor.neutral : undefined;
  }
  const goodTrend = metric.trendGood ?? true;
  const improves = metric.trend === "up" ? goodTrend : !goodTrend;
  return improves ? sigColor.good : sigColor.critical;
}

function TrendArrow({ metric }: { metric: ExecutiveTeamMetric }) {
  if (!metric.trend) {
    return null;
  }
  const arrow = metric.trend === "up" ? "↑" : metric.trend === "down" ? "↓" : "→";
  return <span style={{ color: trendColor(metric), fontSize: 11, fontWeight: 700 }}>{arrow}</span>;
}

function SigBadge({ sig }: { sig: ExecSig }) {
  return (
    <span className="exec-figma-sig" style={{ color: sigColor[sig], background: sigBg[sig] }}>
      {sigLabel[sig]}
    </span>
  );
}

function SectionHeader({ title, sub, count }: { title: string; sub?: string; count?: number }) {
  return (
    <div className="exec-figma-section-head">
      <span>{title}</span>
      {sub ? <small>{sub}</small> : null}
      {count !== undefined ? <small>{count} metrics</small> : null}
    </div>
  );
}

function SummaryKpi({ label, value, unit, sig }: { label: string; value: string; unit?: string; sig?: ExecSig }) {
  return (
    <div className="exec-summary-kpi">
      <div>{label}</div>
      <strong style={{ color: sig ? sigColor[sig] : undefined }}>{value}</strong>
      {unit ? <span>{unit}</span> : null}
    </div>
  );
}

function KpiCard({ metric }: { metric: ExecutiveTeamMetric }) {
  return (
    <InsightCardButton metric={metric} className="exec-figma-card exec-kpi-card">
      <i style={{ background: sigColor[metric.tone] }} />
      <div className="exec-kpi-top">
        <span>{metric.label}</span>
        <SigBadge sig={metric.tone} />
      </div>
      <div className="exec-kpi-value">
        <strong>{metric.value}</strong>
        {metric.unit ? <small>{metric.unit}</small> : null}
      </div>
      <div className="exec-kpi-sub">
        <TrendArrow metric={metric} />
        {metric.prev !== undefined ? <span>prev: {metric.prev}</span> : metric.sub ? <span>{metric.sub}</span> : null}
      </div>
    </InsightCardButton>
  );
}

function MetricRow({ metric }: { metric: ExecutiveTeamMetric }) {
  return (
    <div className="exec-metric-row">
      <div>
        <strong>{metric.label}</strong>
        {metric.sub ? <span>{metric.sub}</span> : null}
      </div>
      <div>
        <b>{metric.value}{metric.unit ? <small>{metric.unit}</small> : null}</b>
        <i style={{ background: sigColor[metric.tone] }} />
      </div>
    </div>
  );
}

function HealthCard({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <article className="exec-figma-card exec-health-card">
      <h3><span>{icon}</span>{title}</h3>
      {children}
    </article>
  );
}

function ChartCard({ title, badge, height = 155, children }: { title: string; badge?: string; height?: number; children: ReactNode }) {
  return (
    <article className="exec-figma-card exec-chart-card">
      <header>
        <strong>{title}</strong>
        {badge ? <span>{badge}</span> : null}
      </header>
      <div style={{ height }}>{children}</div>
    </article>
  );
}

function FlowMetricCard({ metric, wide = false }: { metric: ExecutiveTeamMetric; wide?: boolean }) {
  return (
    <InsightCardButton metric={metric} className={`exec-figma-card exec-flow-metric${wide ? " wide" : ""}`}>
      <i style={{ background: sigColor[metric.tone] }} />
      <span>{metric.label}</span>
      <div>
        <strong>{metric.value}</strong>
        {metric.unit ? <small>{metric.unit}</small> : null}
      </div>
      {metric.sub ? <b>{metric.sub}</b> : null}
      {metric.detail ? <p>{metric.detail}</p> : null}
    </InsightCardButton>
  );
}

function MetricTrustPopover({ trust, diagnostic, popoverId }: { trust: MetricTrust; diagnostic: boolean; popoverId: string }) {
  return (
    <div className="metric-trust-popover" id={popoverId} role="region">
      <strong>{trust.label} explanation</strong>
      <div className="metric-trust-block"><span>What it measures</span><p>{trust.definition}</p></div>
      <div className="metric-trust-block"><span>How it is calculated</span><p>{trust.calculation}</p></div>
      {trust.interpretation ? <div className="metric-trust-block"><span>Interpretation</span><p>{trust.interpretation}</p></div> : null}
      <div className="metric-trust-block"><span>Data basis</span><p>Selected period: {trust.periodLabel} · {trust.basis}</p></div>
      <div className="metric-trust-block"><span>State</span><p>{trust.state[0].toUpperCase() + trust.state.slice(1)}. {trust.reason}</p></div>
      {diagnostic ? (
        <dl className="metric-trust-meta">
          <div><dt>Eligible</dt><dd>{trust.eligibleCount ?? "Unavailable"}</dd></div>
          <div><dt>Usable</dt><dd>{trust.usableCount ?? "Unavailable"}</dd></div>
          <div><dt>Coverage</dt><dd>{trust.coveragePct === null ? "Unavailable" : `${trust.coveragePct.toFixed(0)}%`}</dd></div>
          <div><dt>P85</dt><dd>{trust.p85 === null ? "Unavailable" : `${trust.p85.toFixed(1)} working days`}</dd></div>
          <div><dt>Source</dt><dd>{trust.source}</dd></div>
          <div><dt>Fallback</dt><dd>{trust.fallback}</dd></div>
          <div><dt>Data quality</dt><dd>{trust.reason}</dd></div>
        </dl>
      ) : (
        <p className="metric-trust-team-count">{trust.usableCount === null ? "Usable observations unavailable." : `Based on ${trust.usableCount} usable observation${trust.usableCount === 1 ? "" : "s"}.`}</p>
      )}
    </div>
  );
}

function TrustMetricCard({ trust, diagnostic, open, onToggle, buttonRef }: { trust: MetricTrust; diagnostic: boolean; open: boolean; onToggle: () => void; buttonRef: (element: HTMLButtonElement | null) => void }) {
  const popoverId = `metric-trust-${diagnostic ? "scrum-master" : "team"}-${trust.key}`;
  const stateLabel = trust.state[0].toUpperCase() + trust.state.slice(1);
  return (
    <article className={`exec-figma-card exec-flow-metric metric-trust-card${open ? " open" : ""}`}>
      <i style={{ background: sigColor[trust.state === "complete" ? "good" : trust.state === "partial" ? "warning" : "neutral"] }} />
      <header className="metric-trust-card-header">
        <span>{trust.label}</span>
        <button ref={buttonRef} type="button" className="metric-help-btn" aria-label={`Explain ${trust.label}`} aria-expanded={open} aria-controls={popoverId} onClick={onToggle}>i</button>
      </header>
      <div><strong>{trust.value === null ? "-" : trust.value.toFixed(1)}</strong><small>{trust.unit}</small></div>
      <b>{trust.usableCount === null ? "Usable count unavailable" : `Based on ${trust.usableCount} usable item${trust.usableCount === 1 ? "" : "s"}`}</b>
      <p className={`metric-trust-state ${trust.state}`}>{stateLabel}{trust.state !== "complete" ? ` · ${trust.reason}` : ""}</p>
      {open ? <MetricTrustPopover trust={trust} diagnostic={diagnostic} popoverId={popoverId} /> : null}
    </article>
  );
}

function FlowTimeCards({ data, diagnostic }: { data: ExecutiveTeamDesignData; diagnostic: boolean }) {
  const [openKey, setOpenKey] = useState<MetricTrustKey | null>(null);
  const buttonRefs = useRef<Partial<Record<MetricTrustKey, HTMLButtonElement>>>({});

  useEffect(() => {
    if (openKey === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setOpenKey(null);
      window.setTimeout(() => buttonRefs.current[openKey]?.focus(), 0);
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(`[data-metric-trust-key="${openKey}"]`)) setOpenKey(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openKey]);

  return (
    <section aria-label="Flow Time">
      <SectionHeader title="Flow Time" sub={`${data.periodLabel} · working days · averages are not additive`} />
      <div className="exec-flow-metric-grid metric-trust-grid">
        {data.metricTrust.filter((trust) => trust.key !== "waitingTimePct" && trust.key !== "maintenancePct").map((trust) => (
          <div key={trust.key} className="metric-trust-anchor" data-metric-trust-key={trust.key}>
            <TrustMetricCard trust={trust} diagnostic={diagnostic} open={openKey === trust.key} buttonRef={(element) => { buttonRefs.current[trust.key] = element ?? undefined; }} onToggle={() => setOpenKey((current) => current === trust.key ? null : trust.key)} />
          </div>
        ))}
      </div>
      {diagnostic ? <p className="exec-diagnostic-note">Time in Status is diagnostic only and is not added to Lead Time, Cycle Time, or Implementation Time.</p> : null}
    </section>
  );
}

function CycleTimePanel({ data, presentationMode }: { data: ExecutiveTeamDesignData; presentationMode: boolean }) {
  const panel = data.cycleTimePanel;
  return (
    <section className="exec-cycle-time-panel" aria-label="Implementation Time scatter">
      <TeamDetail
        team={panel.team}
        title="Implementation Time"
        subtitle={presentationMode ? "Resolution date vs Implementation Time in working days" : "Resolution date vs Implementation Time with SLE percentile lines"}
        periodFilter={panel.periodFilter}
        sleValues={panel.sleValues}
        lineVisibility={presentationMode ? { p50: false, p70: false, p85: true, p95: false } : panel.lineVisibility}
        sleIssueTypeOptions={panel.sleIssueTypeOptions}
        sleIncludedIssueTypes={panel.sleIncludedIssueTypes}
        sleTypeDirty={panel.sleTypeDirty}
        onToggleSleIssueType={panel.onToggleSleIssueType}
        onResetSleIssueTypes={panel.onResetSleIssueTypes}
        onApplySleIssueTypes={panel.onApplySleIssueTypes}
        excludedIssueKeys={panel.excludedIssueKeys}
        issueExclusions={panel.issueExclusions}
        presentationMode={presentationMode}
        busy={panel.busy}
        onExcludeIssue={panel.onExcludeIssue}
        onExcludeIssues={panel.onExcludeIssues}
        onRestoreIssue={panel.onRestoreIssue}
        onRestoreAllIssues={panel.onRestoreAllIssues}
      />
    </section>
  );
}

function CustomTooltip({ active, payload, label, unit = "" }: any) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div className="exec-chart-tooltip">
      <div>{label}</div>
      {payload.map((p: any) => (
        <strong key={p.name}>
          <span style={{ color: p.color ?? sigColor.neutral }}>●</span>
          {p.name}: {p.value}{unit}
        </strong>
      ))}
    </div>
  );
}

function TeamFocusCard({ team, selected, onClick }: { team: ExecutiveDashboardTeam; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`exec-team-focus-card${selected ? " selected" : ""}`} onClick={onClick}>
      <header>
        <strong>{team.name}</strong>
        <i style={{ background: sigColor[team.health] }} />
      </header>
      <div>
        <span>CYCLE <b>{formatDays(team.cycle)}</b></span>
        <span>SLE <b>{formatDays(team.sle)}</b></span>
        <span>DONE <b>{team.done.toLocaleString()}</b></span>
      </div>
    </button>
  );
}

const dashboardColumns: { key: keyof ExecutiveDashboardTeam; label: string; width?: number }[] = [
  { key: "name", label: "Team", width: 170 },
  { key: "done", label: "Done" },
  { key: "lead", label: "Lead Time" },
  { key: "active", label: "Cycle Time" },
  { key: "cycle", label: "Implementation Time" },
  { key: "sle", label: "SLE P85" },
  { key: "bugRatio", label: "Bug Ratio" },
  { key: "workMix", label: "Work Mix" },
  { key: "velocity", label: "Velocity" },
  { key: "bottleneck", label: "Bottleneck" },
  { key: "health", label: "Status" },
];

function compareValues(a: unknown, b: unknown): number {
  const left = a ?? "";
  const right = b ?? "";
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function ExecutiveDashboard({
  teams,
  summary,
  selectedTeamId,
  periodLabel,
  title,
  scopeLabel,
  onSelectTeam,
  onOpenTeam,
  onRecalculate,
  onConfigureMetrics,
  onWorkspaceSetup,
}: {
  teams: ExecutiveDashboardTeam[];
  summary: ExecutiveDashboardSummary;
  selectedTeamId: string | null;
  periodLabel: string;
  title: string;
  scopeLabel: string;
  onSelectTeam: (teamId: string) => void;
  onOpenTeam: (teamId: string) => void;
  onRecalculate: () => void;
  onConfigureMetrics: () => void;
  onWorkspaceSetup: () => void;
}) {
  const [sortKey, setSortKey] = useState<keyof ExecutiveDashboardTeam>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const selected = teams.find((team) => team.teamId === selectedTeamId) ?? teams[0] ?? null;
  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      const result = compareValues(a[sortKey], b[sortKey]);
      return sortDir === "asc" ? result : -result;
    });
  }, [teams, sortDir, sortKey]);
  const cycleComparData = teams
    .filter((team) => team.cycle !== null)
    .map((team) => ({
      name: team.name.length > 10 ? `${team.name.slice(0, 10)}...` : team.name,
      value: team.cycle ?? 0,
      highlight: team.teamId === selected?.teamId,
    }))
    .sort((a, b) => a.value - b.value);

  function handleSort(key: keyof ExecutiveDashboardTeam) {
    if (key === sortKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  return (
    <section className="exec-figma-page exec-dashboard-page">
      <header className="exec-figma-topbar">
        <div className="exec-topbar-left">
          <div className="exec-mark" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="4" height="6" rx="1" fill="white" opacity="0.9" />
              <rect x="7" y="1" width="6" height="4" rx="1" fill="white" opacity="0.7" />
              <rect x="7" y="7" width="6" height="6" rx="1" fill="white" opacity="0.9" />
              <rect x="1" y="9" width="4" height="4" rx="1" fill="white" opacity="0.7" />
            </svg>
          </div>
          <div>
            <strong>{title}</strong>
            <span>{scopeLabel}</span>
          </div>
          <div className="exec-topbar-divider" />
          <div className="exec-segmented">
            <button type="button" className="active">Teams</button>
            <button type="button">ART</button>
          </div>
          <div className="exec-topbar-divider small" />
          <button type="button" className="exec-period-chip active">{periodLabel}</button>
        </div>
        <div className="exec-topbar-actions">
          <span>Latest data: {summary.latestDataLabel}</span>
          <button type="button" onClick={onRecalculate}>Recalculate</button>
          <button type="button" onClick={onWorkspaceSetup}>Workspace Setup</button>
        </div>
      </header>

      <div className="exec-figma-scroll">
        <div className="exec-summary-strip">
          <SummaryKpi label="Teams" value={summary.teams.toLocaleString()} />
          <SummaryKpi label="Data Rows" value={summary.dataRows.toLocaleString()} />
          <SummaryKpi label="Done" value={summary.done.toLocaleString()} />
          <SummaryKpi label="Open Tickets" value={summary.openTickets.toLocaleString()} sig="warning" />
        <SummaryKpi label="Avg Implementation Time" value={formatPlainDays(summary.avgCycleTime)} unit="working days" />
          <SummaryKpi label="Combined SLE P85" value={formatPlainDays(summary.sleP85)} unit="working days" sig="warning" />
          <div className="exec-summary-actions">
            <button type="button" onClick={onWorkspaceSetup}>Manage Views</button>
            <button type="button" onClick={onConfigureMetrics}>Configure Metrics</button>
          </div>
        </div>

        <div className="exec-dashboard-focus-grid">
          <section className="exec-figma-card exec-team-focus-panel">
            <header>
              <strong>Team Focus</strong>
              <span>Click to select · Current: <b>{selected?.name ?? "-"}</b></span>
            </header>
            <div className="exec-team-focus-grid">
              {teams.map((team) => (
                <TeamFocusCard key={team.teamId} team={team} selected={team.teamId === selected?.teamId} onClick={() => onSelectTeam(team.teamId)} />
              ))}
            </div>
          </section>

          {selected ? (
            <aside className="exec-figma-card exec-selected-team-card">
              <header>
                <div>
                  <strong>{selected.name}</strong>
                  <span>Selected Team Detail</span>
                </div>
                <button type="button" onClick={() => onOpenTeam(selected.teamId)}>Open Full View {"->"}</button>
              </header>
              <div className="exec-selected-metrics">
                {[
                  ["Done", selected.done.toLocaleString(), "good" as ExecSig],
                  ["Implementation Time", formatDays(selected.cycle), selected.cycle != null && selected.cycle > 20 ? "warning" as ExecSig : "good" as ExecSig],
                  ["Lead Time", formatDays(selected.lead), "neutral" as ExecSig],
                  ["SLE P85", formatDays(selected.sle), "neutral" as ExecSig],
                  ["Bug Ratio", formatPercent(selected.bugRatio), selected.bugRatio != null && selected.bugRatio > 15 ? "critical" as ExecSig : selected.bugRatio != null && selected.bugRatio > 10 ? "warning" as ExecSig : "good" as ExecSig],
                  ["Velocity", selected.velocity, "neutral" as ExecSig],
                ].map(([label, value, sig]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong style={{ color: sigColor[sig as ExecSig] }}>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="exec-selected-bottleneck" style={{ background: sigBg[selected.health], borderColor: sigBorder[selected.health] }}>
                <span>Bottleneck</span>
                <div>
                  <strong>{selected.bottleneck}</strong>
                  <b style={{ color: sigColor[selected.health] }}>{formatDays(selected.bottleneckDays)}</b>
                </div>
              </div>
              <div className="exec-selected-workmix">
                <span>Work Mix</span>
                <strong>{selected.workMix}</strong>
              </div>
            </aside>
          ) : null}
        </div>

        <ChartCard title="Implementation Time Comparison - All Teams" badge="working days · avg" height={120}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cycleComparData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip unit="d" />} />
              <Bar dataKey="value" name="Implementation Time" radius={[3, 3, 0, 0]} maxBarSize={28}>
                {cycleComparData.map((entry) => (
                  <Cell key={entry.name} fill={entry.highlight ? "#4F46E5" : entry.value > 20 ? "#D97706" : "#94A3B8"} fillOpacity={entry.highlight ? 1 : 0.6} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <section className="exec-figma-card exec-metrics-table-card">
          <header>
            <strong>Team Metrics</strong>
            <span>Bottleneck month: {periodLabel} · Metrics configured for Team</span>
          </header>
          <div className="exec-table-wrap">
            <table>
              <thead>
                <tr>
                  {dashboardColumns.map((column) => (
                    <th key={column.key} style={{ width: column.width }} onClick={() => handleSort(column.key)}>
                      {column.label} {sortKey === column.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map((team) => {
                  const isSelected = team.teamId === selected?.teamId;
                  return (
                    <tr key={team.teamId} className={isSelected ? "selected" : ""} onClick={() => onSelectTeam(team.teamId)}>
                      <td><button type="button" onClick={(event) => { event.stopPropagation(); onOpenTeam(team.teamId); }}>{isSelected ? "● " : ""}{team.name}</button></td>
                      <td>{team.done.toLocaleString()}</td>
                      <td>{formatDays(team.lead)}</td>
                      <td>{formatDays(team.active)}</td>
                      <td className={team.cycle != null && team.cycle > 20 ? "warning" : ""}>{formatDays(team.cycle)}</td>
                      <td>{formatDays(team.sle)}</td>
                      <td className={team.bugRatio != null && team.bugRatio > 10 ? "warning" : ""}>{formatPercent(team.bugRatio)}</td>
                      <td>{team.workMix}</td>
                      <td>{team.velocity}</td>
                      <td>{team.bottleneck} {team.bottleneckDays != null ? <small>{formatDays(team.bottleneckDays)}</small> : null}</td>
                      <td><SigBadge sig={team.health} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}

function FlowPipeline({ data, periodLabel }: { data: ExecutiveTeamDesignData; periodLabel: string }) {
  const maxDays = Math.max(1, ...data.flowStages.map((stage) => stage.days));
  const { queueDays, activeDays, flowEfficiencyPct, biggestQueueName, biggestQueueDays } = data.flowSummary;
  const biggestQueue = biggestQueueName !== null && biggestQueueDays !== null
    ? { name: biggestQueueName, days: biggestQueueDays }
    : null;
  const flowEfficiencySig: ExecSig = flowEfficiencyPct === null
    ? "neutral"
    : flowEfficiencyPct >= 75
      ? "good"
      : flowEfficiencyPct >= 45
        ? "warning"
        : "critical";

  return (
    <section className="exec-figma-card exec-flow-pipeline">
      <header>
        <div>
          <strong>Where Time Is Spent</strong>
          <span>avg working days per status · {periodLabel}</span>
        </div>
        <div>
          <b className="queue">QUEUE</b>
          <b className="active">ACTIVE</b>
        </div>
      </header>
      <div className="exec-flow-arrow-row">
        {data.flowStages.map((stage, index) => (
          <div key={`${stage.name}-${index}`}>
            {index < data.flowStages.length - 1 ? <em>›</em> : null}
            <article style={{ background: sigBg[stage.signal], borderColor: sigBorder[stage.signal] }}>
              <span style={{ color: sigColor[stage.signal] }}>{stage.type === "active" ? "ACTIVE" : "QUEUE"}</span>
              <strong>{stage.name}</strong>
              <b style={{ color: sigColor[stage.signal] }}>{stage.days.toFixed(1)}<small>d</small></b>
              <i><u style={{ width: `${Math.max(8, (stage.days / maxDays) * 100)}%`, background: sigColor[stage.signal] }} /></i>
            </article>
          </div>
        ))}
      </div>
      <footer>
        <SummaryKpi label="Total Queue Time" value={formatDays(queueDays)} sig="critical" />
        <SummaryKpi label="Total Cycle Time" value={formatDays(activeDays)} sig="good" />
        <SummaryKpi label="Flow Efficiency" value={flowEfficiencyPct === null ? "-" : `${flowEfficiencyPct.toFixed(1)}%`} sig={flowEfficiencySig} />
        <SummaryKpi label="Biggest Queue" value={biggestQueue ? `${biggestQueue.name} ${formatDays(biggestQueue.days)}` : "-"} sig="critical" />
        <SummaryKpi label="Delivery Expectation" value={data.kpis.find((kpi) => kpi.label === "Delivery Expectation")?.value ?? "-"} />
      </footer>
    </section>
  );
}

function QualityCard({ item }: { item: ExecutiveWorkflowItem }) {
  return (
    <article className="exec-figma-card exec-quality-card">
      <strong>{item.label}</strong>
      <b>{item.value}</b>
      <p>{item.value === "-" ? item.label : item.value}</p>
      <small>Manual value · not set</small>
    </article>
  );
}

function renderTrendCharts(data: ExecutiveTeamDesignData, compact = false) {
  return (
    <div className="exec-chart-grid">
      <ChartCard title={compact ? "Throughput - Last 12 Weeks" : "Throughput Trend"} badge="items/week" height={compact ? 145 : 155}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.throughputWeekly} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id={compact ? "teamThroughputGrad" : "smThroughputGrad"} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={compact ? "#16A34A" : "#4F46E5"} stopOpacity={0.18} />
                <stop offset="95%" stopColor={compact ? "#16A34A" : "#4F46E5"} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} interval={1} />
            <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip unit=" items" />} />
            <ReferenceLine y={data.throughputWeekly.at(-1)?.value ?? 0} stroke={compact ? "#16A34A" : "#4F46E5"} strokeDasharray="3 3" strokeWidth={1} />
            <Area type="monotone" dataKey="value" name="Throughput" stroke={compact ? "#16A34A" : "#4F46E5"} strokeWidth={1.5} fill={`url(#${compact ? "teamThroughputGrad" : "smThroughputGrad"})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={compact ? "Time in Status" : "Avg Time in Status"} badge="avg days" height={compact ? 145 : 155}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...data.timeInStatus].reverse()} layout="vertical" margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#475569" }} tickLine={false} axisLine={false} width={78} />
            <Tooltip content={<CustomTooltip unit="d" />} />
            <Bar dataKey="days" name="Avg Days" radius={[0, 3, 3, 0]} maxBarSize={12}>
              {[...data.timeInStatus].reverse().map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={sigColor[entry.signal]} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

interface InsightContextValue { open: (metric: ExecutiveTeamMetric) => void; }
const InsightContext = createContext<InsightContextValue>({ open: () => undefined });
function useMetricInsight(): InsightContextValue { return useContext(InsightContext); }

function InsightCardButton({ metric, children, className }: { metric: ExecutiveTeamMetric; children: ReactNode; className: string }) {
  const { open } = useMetricInsight();
  return <button type="button" className={`${className} exec-insight-card-button`} aria-label={`Open ${metric.label} insight`} onClick={() => open(metric)}>{children}<span className="exec-insight-affordance">View insight</span></button>;
}

function MetricInsightModal({ data, metric, onClose, diagnostic }: { data: ExecutiveTeamDesignData; metric: ExecutiveTeamMetric; onClose: () => void; diagnostic: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const snapshots = useMemo(() => dedupeHistoricalPeriods(data.historicalTrend), [data.historicalTrend]);
  const windowPoints = filterHistoricalPeriods(snapshots, data.selectedHistoricalPeriod);
  const historyKey: "cycleTime" | "sleP85" | null = metric.label === "Avg Implementation Time" ? "cycleTime" : metric.label === "SLE P85" ? "sleP85" : null;
  const points = historyKey ? windowPoints.map((point) => ({ ...point, value: point[historyKey] })) : [];
  const validPoints = points.filter((point) => point.value !== null && Number.isFinite(point.value));
  const adjacentPairExists = hasAdjacentValidPair(points);
  const validIndexes = points.map((point, index) => point.value !== null && Number.isFinite(point.value) ? index : -1).filter((index) => index >= 0);
  const [activePointIndex, setActivePointIndex] = useState(0);
  const [focusedPeriod, setFocusedPeriod] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const pointRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const definition = getMetricInsightDefinition(metric.label);
  const direction = resolveAdjacentHistoricalDirection(points.map((point) => ({ period: point.period, value: point.value })));
  const trust = metric.metricTrust;
  const unit = trust?.unit ?? metric.unit ?? definition.unit;
  const interpretation = metric.label === "Bottleneck" ? "Categorical current state." : validPoints.length === 1 ? "N/A · one valid period is available." : direction === "Unavailable" ? "Unavailable · no comparable historical data for this metric." : `${direction} · adjacent comparable periods only.`;
  const modalKey = metric.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const currentSnapshot = windowPoints.at(-1) ?? null;
  const currentValueUnavailable = trust ? trust.value === null || trust.value === undefined : metric.value.trim() === "-";
  const previousValue = trust ? trust.previousValue : parseMetricPreviousValue(metric.prev);
  const hasComparablePrevious = !currentValueUnavailable && Number.isFinite(previousValue);
  const change = metric.label === "Bottleneck" ? "Categorical state; no numeric trend is inferred." : !hasComparablePrevious ? "Unavailable · no comparable historical data for this metric." : `${metric.trend === "up" ? "Up" : metric.trend === "down" ? "Down" : "Unchanged"} from ${previousValue} ${unit}.`;
  const sourceLabel = trust?.source ?? definition.source ?? "Local selected-period metric snapshot";
  const sampleLabel = trust ? trust.eligibleCount ?? "Unavailable" : historyKey && currentSnapshot ? currentSnapshot.sample ?? "Unavailable" : "Unavailable";
  const usableLabel = trust ? trust.usableCount ?? "Unavailable" : historyKey && currentSnapshot ? currentSnapshot.usable ?? "Unavailable" : "Unavailable";

  useEffect(() => {
    const first = validIndexes[0];
    setActivePointIndex((current) => validIndexes.includes(current) ? current : (first ?? 0));
    setFocusedPeriod(null);
    setPinned(false);
  }, [metric.label, data.selectedHistoricalPeriod, data.historicalTrend]);

  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { event.preventDefault(); if (pinned) { setPinned(false); setFocusedPeriod(null); return; } onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return <div className="metric-insight-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogRef} className="metric-insight-modal" role="dialog" aria-modal="true" aria-labelledby={`metric-insight-${modalKey}-title`}>
    <header><div><h2 id={`metric-insight-${modalKey}-title`}>{metric.label} insight</h2><p>{data.teamName} · {data.periodLabel}</p></div><button ref={closeRef} type="button" aria-label="Close metric insight" onClick={onClose}>Close</button></header>
    <div className="metric-insight-body"><p><strong>Current</strong><br /><span className="metric-insight-value">{currentValueUnavailable ? "Unavailable" : `${metric.value} ${unit}`}</span>{currentValueUnavailable ? <small className="metric-insight-unavailable">{definition.unavailable ?? "Unavailable · no valid value exists for the selected period."}</small> : null}</p><p><strong>Change</strong> {change}</p><p><strong>Interpretation</strong> {interpretation} {definition.direction !== "categorical" ? (definition.direction === "lower" ? "Lower is better." : "Higher is better.") : "Categorical; no numeric direction is inferred."}</p><p><strong>Meaning</strong> {definition.meaning}</p>
      <p><strong>How collected</strong> {definition.collection ?? "Local selected-period metric snapshot."}</p>
      {trust ? <p><strong>Metric state</strong> {trust.state}. {trust.reason}</p> : null}
      {metric.detail ? <p><strong>Data state</strong> {metric.detail}</p> : null}
      {data.dataStatus.recalculateState === "loading" ? <p role="status">Loading {metric.label} insight… Last-known values remain visible.</p> : null}
      {data.dataStatus.recalculateState === "unavailable" ? <p role="status">{definition.unavailable ?? `Unavailable · ${metric.label} cannot be read from the current local metric contract.`}</p> : null}
      {data.dataStatus.stale ? <p className="metric-insight-warning" role="status">Showing last-known data · the source is newer than this calculation.</p> : null}
      {data.dataStatus.recalculateState === "error" ? <div role="alert"><p>Could not load {metric.label} insight. Current metrics are unchanged.</p><button type="button" className="soft-btn" onClick={data.dataStatus.onRecalculate}>Try again</button></div> : null}
      {historyKey && adjacentPairExists ? <div className="metric-insight-trend" aria-label={`${metric.label} trend for ${data.teamName}; ${validPoints.length} valid comparable periods; direction ${direction}.`} onMouseLeave={() => { if (!pinned) setFocusedPeriod(null); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !pinned) setFocusedPeriod(null); }}>{points.map((point, index) => point.value === null ? <span key={`${point.period}-${index}`} className="metric-insight-gap" aria-label={`${point.period}: No data`} /> : <button key={`${point.period}-${index}`} ref={(element) => { pointRefs.current[index] = element; }} type="button" className={`metric-insight-point${focusedPeriod === point.period ? " selected" : ""}`} tabIndex={index === activePointIndex ? 0 : -1} aria-label={`${metric.label} ${point.period}: ${point.value.toFixed(1)} ${unit}; as of ${point.period}; captured ${point.capturedAt}; sample ${point.sample ?? "Unavailable"}; usable ${point.usable ?? "Unavailable"}; source ${point.source ?? "Source unavailable"}`} onMouseEnter={() => setFocusedPeriod(point.period)} onFocus={() => setFocusedPeriod(point.period)} onClick={() => { setFocusedPeriod(point.period); setPinned(true); }} onKeyDown={(event) => { const current = validIndexes.indexOf(index); const move = (next: number): void => { setActivePointIndex(next); setFocusedPeriod(points[next].period); pointRefs.current[next]?.focus(); }; if (event.key === "Escape") { event.preventDefault(); setFocusedPeriod(null); setPinned(false); } else if (["ArrowLeft", "ArrowUp"].includes(event.key)) { event.preventDefault(); move(validIndexes[Math.max(0, current - 1)]); } else if (["ArrowRight", "ArrowDown"].includes(event.key)) { event.preventDefault(); move(validIndexes[Math.min(validIndexes.length - 1, current + 1)]); } else if (event.key === "Home" || event.key === "End") { event.preventDefault(); move(event.key === "Home" ? validIndexes[0] : validIndexes.at(-1)!); } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFocusedPeriod(point.period); setPinned(true); } }}><span style={{ height: `${Math.max(8, Math.min(100, point.value / Math.max(...validPoints.map((item) => item.value ?? 0), 1) * 100))}%` }} /></button>)}</div> : null}
      {historyKey && !adjacentPairExists ? <p className="muted">{validPoints.length === 1 ? "N/A · one valid period is available." : "Unavailable · no adjacent comparable period pair; gaps prevent a trend."} No trend is rendered.</p> : null}
      <p><strong>How collected/calculated</strong> {definition.calculation}</p>
      {diagnostic ? <p><strong>Coverage</strong> Existing selected-period snapshot and metric contract; Monday-Friday working-day semantics remain unchanged. {historyKey ? `${validPoints.length} of ${points.length} comparable periods have usable values.` : "No separate historical series is available for this metric."}</p> : null}
      {focusedPeriod ? <p className="metric-insight-detail" role="status">{pinned ? "Pinned · " : ""}{focusedPeriod}: {points.find((point) => point.period === focusedPeriod)?.value == null ? "No data for this period." : `${points.find((point) => point.period === focusedPeriod)?.value?.toFixed(1)} ${unit} · as of ${focusedPeriod} · captured ${points.find((point) => point.period === focusedPeriod)?.capturedAt}; sample ${points.find((point) => point.period === focusedPeriod)?.sample ?? "Unavailable"}; usable ${points.find((point) => point.period === focusedPeriod)?.usable ?? "Unavailable"}; source ${points.find((point) => point.period === focusedPeriod)?.source ?? "Source unavailable"}`}</p> : null}
      <p className="metric-insight-mode-detail">{diagnostic ? (definition.diagnosticDetail ?? definition.calculation) : (definition.teamDetail ?? "Metric-specific local insight for the selected period.")}</p>
      <details className="metric-insight-details"><summary>Data details</summary><dl><div><dt>As of</dt><dd>{trust?.asOf ?? currentSnapshot?.period ?? data.periodLabel}</dd></div><div><dt>Captured</dt><dd>{trust?.capturedAt ?? currentSnapshot?.capturedAt ?? "Unavailable"}</dd></div><div><dt>Sample / usable</dt><dd>{sampleLabel} / {usableLabel}</dd></div><div><dt>Unknown</dt><dd>{trust?.unknownCount ?? "Unavailable"}</dd></div><div><dt>Source</dt><dd>{sourceLabel}</dd></div><div><dt>Basis</dt><dd>{trust?.basis ?? definition.calculation}</dd></div></dl></details>
      {diagnostic ? <details className="metric-insight-table"><summary>View data table</summary><table><thead><tr><th>Period</th><th>Value</th><th>Captured</th><th>Sample</th><th>Usable</th><th>Source</th></tr></thead><tbody>{points.map((point, index) => <tr key={`${point.period}-${index}`}><td>{point.period}</td><td>{point.value == null ? "No data" : point.value.toFixed(1)}</td><td>{point.capturedAt}</td><td>{point.sample ?? "Unavailable"}</td><td>{point.usable ?? "Unavailable"}</td><td>{point.source ?? sourceLabel}</td></tr>)}</tbody></table></details> : null}
    </div>
  </div></div>;
}

function MetricInsightProvider({ data, diagnostic, children }: { data: ExecutiveTeamDesignData; diagnostic: boolean; children: ReactNode }) {
  const [metric, setMetric] = useState<ExecutiveTeamMetric | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const close = (): void => { setMetric(null); window.requestAnimationFrame(() => openerRef.current?.focus()); };
  return <InsightContext.Provider value={{ open: (nextMetric) => { openerRef.current = document.activeElement as HTMLElement | null; setMetric(nextMetric); } }}>{children}{metric ? <MetricInsightModal data={data} metric={metric} diagnostic={diagnostic} onClose={close} /> : null}</InsightContext.Provider>;
}

function TeamDesignView({ data }: { data: ExecutiveTeamDesignData }) {
  return (
    <MetricInsightProvider data={data} diagnostic={false}><div className="exec-team-design">
      <section>
        <SectionHeader title="Team Flow" sub={`Delivery health from the team's perspective · ${data.teamName} · ${data.periodLabel}`} />
        <div className="exec-flow-metric-grid">
          {data.kpis.map((metric) => <FlowMetricCard key={metric.label} metric={metric} />)}
        </div>
      </section>
      <FlowTimeCards data={data} diagnostic={false} />
      <FlowPipeline data={data} periodLabel={data.periodLabel} />
      <section>
        <SectionHeader title="Delivery Trends" />
        {renderTrendCharts(data, true)}
        <div className="exec-quality-grid">
          {data.qualityCards.map((item) => <QualityCard key={item.label} item={item} />)}
        </div>
      </section>
    </div></MetricInsightProvider>
  );
}

function ScrumMasterDesignView({ data }: { data: ExecutiveTeamDesignData }) {
  const [drillOpen, setDrillOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"tickets" | "status" | "workflow">("tickets");

  return (
    <MetricInsightProvider data={data} diagnostic><div className="exec-team-design">
      <section>
        <SectionHeader title="Executive Summary" />
        <div className="exec-kpi-grid">{data.kpis.map((metric) => <KpiCard key={metric.label} metric={metric} />)}</div>
      </section>
      <section>
        <SectionHeader title="Team Health" />
        <div className="exec-health-grid">
          <HealthCard title="Flow Health" icon="⚡">{data.flowHealth.map((metric) => <MetricRow key={metric.label} metric={metric} />)}</HealthCard>
          <HealthCard title="Work Health" icon="▣">{data.workHealth.map((metric) => <MetricRow key={metric.label} metric={metric} />)}</HealthCard>
          <HealthCard title="Process Health" icon="⚙">{data.processHealth.map((metric) => <MetricRow key={metric.label} metric={metric} />)}</HealthCard>
        </div>
      </section>
      <FlowTimeCards data={data} diagnostic />
      <section>
        <SectionHeader title="Visual Analytics" />
        {renderTrendCharts(data)}
        <div className="exec-secondary-chart-grid">
          <ChartCard title="Aging Distribution" badge="open tickets" height={148}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.agingDist} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip unit=" tickets" />} />
                <Bar dataKey="count" name="Tickets" radius={[3, 3, 0, 0]} maxBarSize={32}>
                  {data.agingDist.map((entry, index) => <Cell key={entry.label} fill={index <= 1 ? "#16A34A" : index <= 3 ? "#D97706" : "#DC2626"} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Bottleneck Duration by Month" badge="days in bottleneck status" height={148}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.bottleneckMonthly} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip unit="d" />} />
                <Bar dataKey="value" name="Days" radius={[3, 3, 0, 0]} maxBarSize={40}>
                  {data.bottleneckMonthly.map((entry) => <Cell key={entry.label} fill={(entry.value ?? 0) > 50 ? "#DC2626" : (entry.value ?? 0) > 20 ? "#D97706" : "#16A34A"} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>

      <section className={`exec-drill-card${drillOpen ? " open" : ""}`}>
        <button type="button" onClick={() => setDrillOpen((current) => !current)}>
          <span>{drillOpen ? "▾" : "›"}</span>
          <strong>Drill Down</strong>
          <small>Oldest tickets · Status breakdown · Team workflow</small>
        </button>
        {drillOpen ? (
          <div className="exec-drill-content">
            <nav>
              {([["tickets", "Oldest Tickets"], ["status", "Status Breakdown"], ["workflow", "Team Workflow"]] as const).map(([key, label]) => (
                <button key={key} type="button" className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>{label}</button>
              ))}
            </nav>
            {activeTab === "tickets" ? (
              <table>
                <thead><tr>{["Ticket ID", "Status", "Type", "Age (days)", "Signal"].map((head) => <th key={head}>{head}</th>)}</tr></thead>
                <tbody>{data.oldestTickets.map((ticket) => <tr key={ticket.id}><td className="mono">{ticket.id}</td><td><span>{ticket.status}</span></td><td>{ticket.type}</td><td className={ticket.age > 90 ? "critical" : "warning"}>{ticket.age}</td><td><SigBadge sig={ticket.age > 365 ? "critical" : ticket.age > 90 ? "warning" : "good"} /></td></tr>)}</tbody>
              </table>
            ) : null}
            {activeTab === "status" ? (
              <table>
                <thead><tr>{["Status", "Total", "0-30d", "31-60d", "61-90d", "91d+"].map((head) => <th key={head}>{head}</th>)}</tr></thead>
                <tbody>{data.statusRows.map((row) => <tr key={row.status}><td>{row.status}</td><td>{row.total}</td><td>{row.d30}</td><td>{row.d60}</td><td>{row.d90}</td><td className={row.d90p > 10 ? "critical" : "warning"}>{row.d90p}</td></tr>)}</tbody>
              </table>
            ) : null}
            {activeTab === "workflow" ? (
              <div className="exec-workflow-grid">{data.workflowItems.map((item) => <article key={item.label}><span>{item.label}</span><strong>{item.value}</strong></article>)}</div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div></MetricInsightProvider>
  );
}

export function ExecutiveTeamView({
  data,
  mode,
  onBack,
  onModeChange,
  onExport,
  settingsSlot,
  activeTab,
  onTabChange,
  periodSlot,
}: {
  data: ExecutiveTeamDesignData;
  mode: "team" | "scrum-master";
  onBack: () => void;
  onModeChange: (mode: "team" | "scrum-master") => void;
  onExport: () => void;
  settingsSlot?: ReactNode;
  activeTab: "overview" | "cycle";
  onTabChange: (tab: "overview" | "cycle") => void;
  periodSlot: ReactNode;
}) {
  const diagnostic = mode === "scrum-master";
  const overviewPanelId = "team-overview-panel";
  const cyclePanelId = "team-cycle-time-panel";
  const status = data.dataStatus;
  const tabRefs = useRef<Partial<Record<"overview" | "cycle", HTMLButtonElement>>>({});
  const stateLabel = status.recalculateState === "loading"
    ? "Recalculating team…"
    : status.recalculateState === "success"
      ? "Team recalculated just now."
      : status.recalculateState === "error"
        ? status.recalculateMessage
        : status.recalculateState === "unavailable"
          ? "Workspace access is required to recalculate this team."
          : "";
  const formatStatusTimestamp = (value: string | null, missing: string): string => value ? new Date(value).toLocaleString() : missing;

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    const tabs: Array<"overview" | "cycle"> = ["overview", "cycle"];
    const currentIndex = tabs.indexOf(activeTab);
    const nextIndex = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? (currentIndex + 1) % tabs.length
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? (currentIndex - 1 + tabs.length) % tabs.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    onTabChange(tabs[nextIndex]);
    window.requestAnimationFrame(() => tabRefs.current[tabs[nextIndex]]?.focus());
  }

  return (
    <section className="exec-figma-page exec-team-page">
      <header className="exec-figma-topbar">
        <div className="exec-topbar-left">
          <button type="button" className="exec-back-button" onClick={onBack}>← Back to Dashboard</button>
          <div className="exec-mark" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="4" height="6" rx="1" fill="white" opacity="0.9" />
              <rect x="7" y="1" width="6" height="4" rx="1" fill="white" opacity="0.7" />
              <rect x="7" y="7" width="6" height="6" rx="1" fill="white" opacity="0.9" />
              <rect x="1" y="9" width="4" height="4" rx="1" fill="white" opacity="0.7" />
            </svg>
          </div>
          <div>
            <strong>{data.teamName}</strong>
            <span>{data.description} · {data.periodLabel}</span>
          </div>
        </div>
        <div className="exec-topbar-actions">
          <span>{data.latestDataLabel} · {mode === "team" ? "Team view" : "Scrum Master view"}</span>
          <div className="exec-segmented">
            <button type="button" className={mode === "team" ? "active" : ""} onClick={() => onModeChange("team")}>Team</button>
            <button type="button" className={mode === "scrum-master" ? "active" : ""} onClick={() => onModeChange("scrum-master")}>Scrum Master</button>
          </div>
          <button type="button" onClick={onExport}>Export</button>
        </div>
      </header>
      <div className="exec-team-tabs" role="tablist" aria-label="Team detail tabs">
         <button ref={(element) => { tabRefs.current.overview = element ?? undefined; }} type="button" role="tab" id="team-overview-tab" aria-controls={overviewPanelId} aria-selected={activeTab === "overview"} tabIndex={activeTab === "overview" ? 0 : -1} className={activeTab === "overview" ? "active" : ""} onClick={() => onTabChange("overview")} onKeyDown={handleTabKeyDown}>
          Overview
        </button>
         <button ref={(element) => { tabRefs.current.cycle = element ?? undefined; }} type="button" role="tab" id="team-cycle-time-tab" aria-controls={cyclePanelId} aria-selected={activeTab === "cycle"} tabIndex={activeTab === "cycle" ? 0 : -1} className={activeTab === "cycle" ? "active" : ""} onClick={() => onTabChange("cycle")} onKeyDown={handleTabKeyDown}>
          Implementation Time
        </button>
      </div>
      <div className="exec-team-context-row">
        {periodSlot}
        <span className="exec-team-period-helper">All period-sensitive metrics use this selection.</span>
        {activeTab === "cycle" && status.changedFileCounts.meaningful ? <span className="exec-cycle-pending-notice" role="status">Data changed since last calculation.</span> : null}
      </div>
      <div className="exec-figma-scroll">
        {activeTab === "overview" ? (
          <section id={overviewPanelId} role="tabpanel" aria-labelledby="team-overview-tab">
            <section className={`exec-data-status-panel ${status.stale ? "stale" : ""}`} aria-labelledby="exec-data-status-heading">
              <header><strong id="exec-data-status-heading">Data status</strong>{status.stale ? <span className="exec-data-status-warning">Data is stale</span> : null}</header>
              <div className="exec-data-status-grid">
                <div><span>Last data update</span><strong>{formatStatusTimestamp(status.latestDataUpdate, "Unavailable — no valid imported file timestamp.")}</strong></div>
                <div><span>Last calculated</span><strong>{formatStatusTimestamp(status.lastCalculated, "Unavailable — metrics have not been calculated.")}</strong></div>
              </div>
              <div className="exec-data-status-live" aria-live="polite" aria-atomic="true" aria-busy={status.recalculateState === "loading"}>
                <p className="exec-data-status-message">{status.autoUpdateStatus}</p>
                {diagnostic && status.autoUpdateDetail ? <p className="muted">{status.autoUpdateDetail}</p> : null}
                {status.stale ? <p>Data changed after the last calculation. Recalculate this team to refresh the metrics.</p> : null}
                {stateLabel ? <p className={`exec-data-status-message ${status.recalculateState}`}>{stateLabel}</p> : null}
              </div>
              {diagnostic && status.changedFileCounts.meaningful ? <p className="exec-data-status-detail">{status.changedFileCounts.added} new · {status.changedFileCounts.changed} changed · {status.changedFileCounts.removed} removed</p> : null}
              <button type="button" className="soft-btn" disabled={!status.manualRecalculateAvailable || status.recalculateState === "loading" || status.recalculateState === "unavailable"} onClick={status.onRecalculate} aria-busy={status.recalculateState === "loading"}>
                {status.recalculateState === "loading" ? "Recalculating team…" : "Recalculate team"}
              </button>
              {diagnostic && status.autoUpdateAvailable ? <button type="button" className="soft-btn" onClick={status.onToggleAutoUpdates}>{status.autoUpdatesPaused ? "Resume auto-update" : "Pause auto-update"}</button> : null}
              {!diagnostic && status.autoUpdatesPaused ? <button type="button" className="soft-btn" onClick={status.onToggleAutoUpdates}>Resume auto-update</button> : null}
              {status.autoUpdateNeedsRetry ? <button type="button" className="soft-btn" onClick={status.onTryAgain}>Try again</button> : null}
              {diagnostic && status.recalculateState === "error" ? <p className="muted">Existing calculated data is still shown. Try again.</p> : null}
            </section>
            {mode === "team" ? <TeamDesignView data={data} /> : <ScrumMasterDesignView data={data} />}
            {mode === "scrum-master" ? settingsSlot : null}
          </section>
        ) : (
          <section id={cyclePanelId} role="tabpanel" aria-labelledby="team-cycle-time-tab">
            <CycleTimePanel data={data} presentationMode={!diagnostic} />
          </section>
        )}
      </div>
    </section>
  );
}
