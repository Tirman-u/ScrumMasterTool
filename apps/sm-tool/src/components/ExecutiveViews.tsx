import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TeamDetail } from "./TeamDetail";
import { type IssueExclusion, type SleValues, type TeamMetrics, type TeamRuntime } from "../types/contracts";
import { type MetricTrust, type MetricTrustKey } from "../lib/metric-trust";

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
  };
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
    <article className="exec-figma-card exec-kpi-card">
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
        {metric.prev ? <span>prev: {metric.prev}</span> : metric.sub ? <span>{metric.sub}</span> : null}
      </div>
    </article>
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
    <article className={`exec-figma-card exec-flow-metric${wide ? " wide" : ""}`}>
      <i style={{ background: sigColor[metric.tone] }} />
      <span>{metric.label}</span>
      <div>
        <strong>{metric.value}</strong>
        {metric.unit ? <small>{metric.unit}</small> : null}
      </div>
      {metric.sub ? <b>{metric.sub}</b> : null}
      {metric.detail ? <p>{metric.detail}</p> : null}
    </article>
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
      <div><strong>{trust.value === null ? "-" : trust.value.toFixed(1)}</strong><small>working days</small></div>
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
        {data.metricTrust.map((trust) => (
          <div key={trust.key} className="metric-trust-anchor" data-metric-trust-key={trust.key}>
            <TrustMetricCard trust={trust} diagnostic={diagnostic} open={openKey === trust.key} buttonRef={(element) => { buttonRefs.current[trust.key] = element ?? undefined; }} onToggle={() => setOpenKey((current) => current === trust.key ? null : trust.key)} />
          </div>
        ))}
      </div>
      {diagnostic ? <p className="exec-diagnostic-note">Time in Status is diagnostic only and is not added to Lead, Active, or Cycle Time.</p> : null}
    </section>
  );
}

function CycleTimePanel({ data, presentationMode }: { data: ExecutiveTeamDesignData; presentationMode: boolean }) {
  const panel = data.cycleTimePanel;
  return (
    <section className="exec-cycle-time-panel" aria-label="Cycle Time scatter">
      <TeamDetail
        team={panel.team}
        title="Cycle Time"
        subtitle={presentationMode ? "Resolution date vs Cycle Time in working days" : "Resolution date vs Cycle Time with SLE percentile lines"}
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
  { key: "active", label: "Active Time" },
  { key: "cycle", label: "Cycle Time" },
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
          <SummaryKpi label="Avg Cycle Time" value={formatPlainDays(summary.avgCycleTime)} unit="working days" />
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
                  ["Cycle Time", formatDays(selected.cycle), selected.cycle != null && selected.cycle > 20 ? "warning" as ExecSig : "good" as ExecSig],
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

        <ChartCard title="Cycle Time Comparison - All Teams" badge="working days · avg" height={120}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cycleComparData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip unit="d" />} />
              <Bar dataKey="value" name="Cycle Time" radius={[3, 3, 0, 0]} maxBarSize={28}>
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
        <SummaryKpi label="Total Active Time" value={formatDays(activeDays)} sig="good" />
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

      <ChartCard title="Cycle Time Trend" badge="P85" height={compact ? 145 : 155}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.cycleTimeWeekly} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} interval={1} />
            <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip unit="d" />} />
            <ReferenceLine y={Number(data.kpis.find((kpi) => kpi.label === "Delivery Expectation")?.value.replace(/[^\d.]/g, "")) || 0} stroke="#D97706" strokeDasharray="3 3" strokeWidth={1} />
            <Line type="monotone" dataKey="p85" name="P85" stroke="#DC2626" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          </LineChart>
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

function TeamDesignView({ data }: { data: ExecutiveTeamDesignData }) {
  return (
    <div className="exec-team-design">
      <section>
        <SectionHeader title="Team Flow" sub={`Delivery health from the team's perspective · ${data.teamName} · ${data.periodLabel}`} />
        <div className="exec-flow-metric-grid">
          {data.kpis.slice(0, 6).map((metric) => <FlowMetricCard key={metric.label} metric={metric} />)}
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
    </div>
  );
}

function ScrumMasterDesignView({ data }: { data: ExecutiveTeamDesignData }) {
  const [drillOpen, setDrillOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"tickets" | "status" | "workflow">("tickets");

  return (
    <div className="exec-team-design">
      <section>
        <SectionHeader title="Executive Summary" />
        <div className="exec-kpi-grid">{data.kpis.slice(0, 8).map((metric) => <KpiCard key={metric.label} metric={metric} />)}</div>
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
    </div>
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
          Cycle Time
        </button>
      </div>
      <div className="exec-team-context-row">
        {periodSlot}
        <span className="exec-team-period-helper">All period-sensitive metrics use this selection.</span>
      </div>
      <div className="exec-figma-scroll">
        {activeTab === "overview" ? (
          <section id={overviewPanelId} role="tabpanel" aria-labelledby="team-overview-tab">
            <section className={`exec-data-status-panel ${status.stale ? "stale" : ""}`} aria-label="Data status">
              <header><strong>Data status</strong>{status.stale ? <span className="exec-data-status-warning">Data is stale</span> : null}</header>
              <div className="exec-data-status-grid">
                <div><span>Last data update</span><strong>{formatStatusTimestamp(status.latestDataUpdate, "Unavailable — no valid imported file timestamp.")}</strong></div>
                <div><span>Last calculated</span><strong>{formatStatusTimestamp(status.lastCalculated, "Unavailable — metrics have not been calculated.")}</strong></div>
                <button type="button" className="soft-btn" disabled={status.recalculateState === "loading" || status.recalculateState === "unavailable"} onClick={status.onRecalculate} aria-busy={status.recalculateState === "loading"}>
                  {status.recalculateState === "loading" ? "Recalculating team…" : "Recalculate team"}
                </button>
              </div>
              {status.stale ? <p role="status">Data changed after the last calculation. Recalculate this team to refresh the metrics.</p> : null}
              {stateLabel ? <p role="status" className={`exec-data-status-message ${status.recalculateState}`}>{stateLabel}</p> : null}
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
