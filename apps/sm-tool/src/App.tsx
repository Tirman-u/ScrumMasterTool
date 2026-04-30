import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TeamDetail } from "./components/TeamDetail";
import {
  DEFAULT_SLE_ISSUE_TYPES,
  buildSleValues,
  countSprints,
  normalizeSleIssueTypes,
  resolveEffectiveSleIssueTypes,
  resolveVelocityStoryPoints,
} from "./lib/metrics";
import {
  addTeam,
  analyzeTeam,
  importCsvContents,
  importCsvFiles,
  listTeams,
  listRememberedWorkspaces,
  openRememberedWorkspaceById,
  loadWorkspaceConfig,
  pickCsvFiles,
  pickWorkspaceDirectory,
  readTeamProgressHistory,
  rememberWorkspaceDirectory,
  restoreRememberedWorkspaceDirectory,
  saveWorkspaceConfig,
  saveTeamProgressSnapshot,
  type RememberedWorkspaceSummary,
  saveTeamConfig,
  saveTeamBottleneckEntries,
  supportsFileSystemAccess,
} from "./lib/workspace";
import { exportJiraIssuesToCsv, testJiraConnection } from "./lib/jira";
import {
  type JiraQueryCollection,
  type BottleneckEntry,
  type ImportBucket,
  type JiraQueryConfig,
  type JiraSavedQuery,
  type MetricScope,
  type SleValues,
  type ParsedIssue,
  type TeamConfig,
  type VelocityConfig,
  type TeamMetrics,
  type TeamProgressSnapshot,
  type TeamRuntime,
  type WorkspaceConfig,
  type WorkspaceMetricConfig,
  type WorkspaceProfileConfig,
} from "./types/contracts";

const EMPTY_SLE: SleValues = { p50: null, p70: null, p85: null, p95: null };
const BOTTLENECK_HISTORY_START_MONTH = "2026-01";
const ALL_TEAMS_PROFILE_ID = "__all-teams__";

type Page = "workspace" | "dashboard" | "metrics" | "import" | "team";
type TeamTab = "overview" | "cycle";
type ImportMode = "current-month" | "root" | "custom";
type QueryTimeWindow = "none" | "current-month" | "last-month" | "ytd";
type JiraQueryTarget = "issueQuery" | "timeInStatusQuery";
type TrendTone = "good" | "bad" | "neutral";
type HealthTone = "good" | "warn" | "bad" | "neutral";
type SleLineKey = "p50" | "p70" | "p85" | "p95";
type ConfigurableMetricId =
  | "health-check"
  | "stories-done"
  | "avg-cycle-time"
  | "sle-p85"
  | "velocity"
  | "wip-age-risk"
  | "forecast"
  | "bug-ratio"
  | "throughput"
  | "sprint-work"
  | "sprint-predictability"
  | "flow-balance"
  | "throughput-stability"
  | "lead-time-by-type"
  | "flow-efficiency"
  | "queue-time"
  | "bottleneck-trend"
  | "wip-heatmap"
  | "aging-wip"
  | "bottleneck"
  | "time-in-status"
  | "data-monitor"
  | "detailed-table";

interface ConfigurableMetricDefinition {
  id: ConfigurableMetricId;
  label: string;
  group: ConfigurableMetricGroup;
  source: "Jira CSV" | "Time in Status" | "Derived" | "Manual/External";
  description: string;
  defaultScopes: MetricScope[];
  safeMetricIds?: string[];
}

type ConfigurableMetricGroup = "Core" | "Flow" | "Predictability" | "Quality" | "Data";

const METRIC_SCOPES: MetricScope[] = ["team", "value-stream", "art"];
const METRIC_GROUPS: ConfigurableMetricGroup[] = ["Core", "Flow", "Predictability", "Quality", "Data"];
const METRIC_SCOPE_LABELS: Record<MetricScope, string> = {
  team: "Team",
  "value-stream": "Value Stream",
  art: "ART",
};

const CONFIGURABLE_METRICS: ConfigurableMetricDefinition[] = [
  {
    id: "health-check",
    label: "Health Check",
    group: "Core",
    source: "Derived",
    description: "Compact action/watch/healthy summary for the selected scope.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-predictability", "built-in-quality"],
  },
  {
    id: "stories-done",
    label: "Stories Done",
    group: "Core",
    source: "Jira CSV",
    description: "Done count in the selected period.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-velocity"],
  },
  {
    id: "avg-cycle-time",
    label: "Avg Cycle Time",
    group: "Core",
    source: "Jira CSV",
    description: "Average created-to-done time.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-time"],
  },
  {
    id: "sle-p85",
    label: "SLE P85",
    group: "Core",
    source: "Jira CSV",
    description: "85th percentile delivery time.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-time"],
  },
  {
    id: "velocity",
    label: "Velocity",
    group: "Core",
    source: "Jira CSV",
    description: "Delivered ticket count or story points by configured cadence.",
    defaultScopes: ["team", "art"],
    safeMetricIds: ["flow-velocity"],
  },
  {
    id: "wip-age-risk",
    label: "WIP Age Risk",
    group: "Flow",
    source: "Jira CSV",
    description: "Open ticket age risk split.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-load"],
  },
  {
    id: "forecast",
    label: "Forecast",
    group: "Predictability",
    source: "Derived",
    description: "Monte Carlo lite forecast based on throughput history.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-predictability"],
  },
  {
    id: "bug-ratio",
    label: "Done Bug Ratio",
    group: "Quality",
    source: "Jira CSV",
    description: "Share of done items matching configured bug issue types.",
    defaultScopes: ["team", "art"],
    safeMetricIds: ["built-in-quality"],
  },
  {
    id: "throughput",
    label: "Throughput",
    group: "Flow",
    source: "Jira CSV",
    description: "Current month, previous month and rolling 30-day throughput.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-velocity"],
  },
  {
    id: "sprint-work",
    label: "Sprint Work Quality",
    group: "Predictability",
    source: "Jira CSV",
    description: "Unestimated in-sprint work and delivered outside sprint.",
    defaultScopes: ["team"],
    safeMetricIds: ["flow-predictability"],
  },
  {
    id: "sprint-predictability",
    label: "2+ Sprint %",
    group: "Predictability",
    source: "Derived",
    description: "Share of delivered work that has been assigned to 2 or more sprints.",
    defaultScopes: ["team", "art"],
    safeMetricIds: ["flow-predictability"],
  },
  {
    id: "flow-balance",
    label: "Created vs Delivered",
    group: "Flow",
    source: "Jira CSV",
    description: "Intake, throughput and backlog flow.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-load", "flow-velocity"],
  },
  {
    id: "throughput-stability",
    label: "Throughput Stability",
    group: "Predictability",
    source: "Derived",
    description: "Predictability from weekly and monthly throughput variation.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-predictability"],
  },
  {
    id: "lead-time-by-type",
    label: "Lead Time by Type",
    group: "Flow",
    source: "Jira CSV",
    description: "Slowest issue types by average lead time.",
    defaultScopes: ["team", "value-stream"],
    safeMetricIds: ["flow-time", "flow-distribution"],
  },
  {
    id: "flow-efficiency",
    label: "Flow Efficiency",
    group: "Flow",
    source: "Time in Status",
    description: "Active time versus waiting time.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-efficiency"],
  },
  {
    id: "queue-time",
    label: "Queue Time by Status",
    group: "Flow",
    source: "Time in Status",
    description: "Statuses with highest average waiting time.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-efficiency"],
  },
  {
    id: "bottleneck-trend",
    label: "Bottleneck Trend",
    group: "Flow",
    source: "Time in Status",
    description: "Recurring monthly bottleneck signal.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-efficiency"],
  },
  {
    id: "wip-heatmap",
    label: "WIP Risk Heatmap",
    group: "Flow",
    source: "Jira CSV",
    description: "Open WIP age split by status.",
    defaultScopes: ["team", "value-stream"],
    safeMetricIds: ["flow-load"],
  },
  {
    id: "aging-wip",
    label: "Aging WIP Details",
    group: "Flow",
    source: "Jira CSV",
    description: "Oldest open tickets and aging distribution.",
    defaultScopes: ["team"],
    safeMetricIds: ["flow-load"],
  },
  {
    id: "bottleneck",
    label: "Bottleneck Panel",
    group: "Flow",
    source: "Time in Status",
    description: "Monthly bottleneck table and manual override editor link.",
    defaultScopes: ["team", "value-stream", "art"],
    safeMetricIds: ["flow-efficiency"],
  },
  {
    id: "time-in-status",
    label: "Time in Status Table",
    group: "Flow",
    source: "Time in Status",
    description: "Detailed status wait-time table.",
    defaultScopes: ["team"],
    safeMetricIds: ["flow-efficiency"],
  },
  {
    id: "data-monitor",
    label: "Data Monitor",
    group: "Data",
    source: "Derived",
    description: "Missing fields and metric prerequisite checks.",
    defaultScopes: ["team", "value-stream", "art"],
  },
  {
    id: "detailed-table",
    label: "Detailed Metrics Table",
    group: "Core",
    source: "Derived",
    description: "Dense current/previous metric comparison table.",
    defaultScopes: ["team"],
  },
];

interface TeamSnapshot {
  done: number;
  avgCycleTime: number | null;
  sle: SleValues;
  multiSprintPct: number;
  velocity: number;
}

interface ThroughputSnapshot {
  anchorMonth: string;
  comparisonMonth: string;
  thisMonth: number;
  lastMonth: number;
  last30Days: number;
}

interface AgingWipItem {
  issueKey: string;
  status: string;
  issueType: string;
  created: string;
  agingDays: number;
}

interface AgingWipSnapshot {
  total: number;
  avgDays: number | null;
  medianDays: number | null;
  over30: number;
  over60: number;
  over90: number;
  topOldest: AgingWipItem[];
}

interface BugRatioSnapshot {
  doneBugRatio: number | null;
  doneBugCount: number;
  doneTotal: number;
  wipBugCount: number;
  wipBugRatio: number | null;
  wipTotal: number;
}

interface IntakeThroughputSnapshot {
  anchorMonth: string;
  comparisonMonth: string;
  intakeThisMonth: number;
  throughputThisMonth: number;
  intakeLast30Days: number;
  throughputLast30Days: number;
}

interface NetFlowSnapshot {
  thisMonth: number;
  last30Days: number;
}

interface ThroughputStabilitySnapshot {
  weeklyAvg: number | null;
  weeklyCvPct: number | null;
  weeklyPredictabilityPct: number | null;
  monthlyAvg: number | null;
  monthlyCvPct: number | null;
  monthlyPredictabilityPct: number | null;
  weeklySamples: number;
  monthlySamples: number;
}

interface WipRiskSnapshot {
  over30Pct: number;
  over60Pct: number;
  over90Pct: number;
  over30DeltaPpVs30dBaseline: number;
}

interface LeadTimeByTypeSnapshot {
  issueType: string;
  avgDays: number;
  doneCount: number;
}

interface FlowEfficiencySnapshot {
  period: string;
  activeDays: number;
  queueDays: number;
  totalDays: number;
  valuePct: number | null;
}

interface QueueTimeStatusSnapshot {
  status: string;
  avgDays: number;
}

interface QueueTimeSnapshot {
  period: string;
  topStatuses: QueueTimeStatusSnapshot[];
}

interface BottleneckTrendSnapshot {
  monthCount: number;
  dominantStatus: string | null;
  dominantCount: number;
  longestStatus: string | null;
  longestAvgDays: number | null;
  switchCount: number;
}

interface WipRiskHeatmapStatusRow {
  status: string;
  total: number;
  age0To30: number;
  age31To60: number;
  age61To90: number;
  age91Plus: number;
}

interface WipRiskHeatmapSnapshot {
  rows: WipRiskHeatmapStatusRow[];
}

interface ForecastSnapshot {
  backlogCount: number;
  sampleDays: number;
  simulations: number;
  p50Days: number | null;
  p85Days: number | null;
  p50DateIso: string | null;
  p85DateIso: string | null;
}

interface SprintPredictabilityRow {
  sprint: string;
  created: number;
  done: number;
  predictabilityPct: number | null;
}

interface SprintPredictabilitySnapshot {
  enabled: boolean;
  latest: SprintPredictabilityRow | null;
  avgLast6Pct: number | null;
  rows: SprintPredictabilityRow[];
}

interface SprintWorkSnapshot {
  inSprintTotal: number;
  inSprintUnestimatedCount: number;
  inSprintUnestimatedPct: number | null;
  doneTotal: number;
  deliveredInSprintCount: number;
  deliveredInSprintPct: number | null;
  deliveredOutsideSprintCount: number;
  deliveredOutsideSprintPct: number | null;
}

interface TeamHealthSnapshot {
  throughput: ThroughputSnapshot;
  agingWip: AgingWipSnapshot;
  bugRatio: BugRatioSnapshot;
  intakeThroughput: IntakeThroughputSnapshot;
  netFlow: NetFlowSnapshot;
  throughputStability: ThroughputStabilitySnapshot;
  wipRisk: WipRiskSnapshot;
  wipRiskHeatmap: WipRiskHeatmapSnapshot;
  flowEfficiency: FlowEfficiencySnapshot;
  queueTime: QueueTimeSnapshot;
  bottleneckTrend: BottleneckTrendSnapshot;
  forecast: ForecastSnapshot;
  sprintPredictability: SprintPredictabilitySnapshot;
  sprintWork: SprintWorkSnapshot;
  leadTimeByType: LeadTimeByTypeSnapshot[];
}

interface TrendResult {
  label: string;
  tone: TrendTone;
}

interface TrendBundle {
  done: TrendResult;
  avgCycleTime: TrendResult;
  sleP50: TrendResult;
  sleP70: TrendResult;
  sleP85: TrendResult;
  sleP95: TrendResult;
  multiSprintPct: TrendResult;
  velocity: TrendResult;
}

interface TeamMetricsHealthTrendBundle {
  wipAgeRisk: TrendResult;
  bugRatio: TrendResult;
  monteCarlo: TrendResult;
}

interface BottleneckMonthlyRow {
  period: string;
  monthLabel: string;
  bottleneckLabel: string;
  createdCount: number;
  doneCount: number;
  sourceLabel: "Auto" | "Manual" | "-";
}

interface MetricHealthSignal {
  tone: HealthTone;
  label: "Healthy" | "Watch" | "Action" | "N/A";
  reason: string;
}

interface TeamHealthSignals {
  doneBugRatio: MetricHealthSignal;
  intakeVsThroughput: MetricHealthSignal;
  netFlow: MetricHealthSignal;
  throughputStability: MetricHealthSignal;
  wipAgeRisk: MetricHealthSignal;
  leadTimeByType: MetricHealthSignal;
  flowEfficiency: MetricHealthSignal;
  queueTimeByStatus: MetricHealthSignal;
  bottleneckTrend: MetricHealthSignal;
  forecast: MetricHealthSignal;
}

type TeamHealthSignalKey = keyof TeamHealthSignals;

interface TeamHealthScaleBand {
  tone: HealthTone;
  label: string;
  range: string;
}

interface TeamHealthAction {
  key: TeamHealthSignalKey;
  label: string;
  tone: "warn" | "bad";
  reason: string;
  recommendation: string;
}

interface TeamHealthCheckSummary {
  totalMetrics: number;
  healthyCount: number;
  watchCount: number;
  actionCount: number;
  neutralCount: number;
  summary: string;
  criticalActions: TeamHealthAction[];
  topActions: TeamHealthAction[];
}

type MetricHelpKey =
  | "storiesDone"
  | "avgCycleTime"
  | "sleP85"
  | "velocity"
  | "understandingTrends"
  | "throughputThisMonth"
  | "throughputLastMonth"
  | "throughputLast30Days"
  | "doneBugRatio"
  | "intakeVsThroughput"
  | "netFlow"
  | "throughputStability"
  | "wipAgeRisk"
  | "leadTimeByType"
  | "flowEfficiency"
  | "queueTimeByStatus"
  | "bottleneckTrend"
  | "forecastMonteCarlo"
  | "sprintPredictability"
  | "inSprintUnestimated"
  | "deliveredOutsideSprint"
  | "wipRiskHeatmap"
  | "agingWip"
  | "bottleneck"
  | "dataMonitor"
  | "healthCheckSummary";

interface MetricHelpCopy {
  title: string;
  meaning: string;
  whyGood: string;
  improveTips: string[];
  healthScale?: TeamHealthScaleBand[];
}

interface MetricDataIssue {
  tone: "warn" | "bad";
  message: string;
}

type MetricDataIssueMap = Partial<Record<MetricHelpKey, MetricDataIssue>>;

interface DataMonitorEntry {
  id: string;
  tone: "info" | "warn" | "bad";
  title: string;
  message: string;
  sampleIssueKeys: string[];
}

interface ProgressComparisonMetricRow {
  label: string;
  betterWhen: "up" | "down";
  unit: "days" | "percent" | "count";
  current: number | null;
  previous: number | null;
  trend: "improved" | "worsened" | "unchanged" | "n/a";
}

interface ProgressComparisonSummary {
  hasBaseline: boolean;
  latest: TeamProgressSnapshot | null;
  previous: TeamProgressSnapshot | null;
  improvedCount: number;
  worsenedCount: number;
  unchangedCount: number;
  rows: ProgressComparisonMetricRow[];
}

interface PeriodYearGroup {
  year: string;
  months: string[];
}

type TimeInStatusStatusCategory = "queue" | "active" | "done" | "other";

interface TimeInStatusStatusRow {
  name: string;
  avgDays: number;
  category: TimeInStatusStatusCategory;
  categoryLabel: string;
  tone: HealthTone;
  highlight: boolean;
  signal: string;
}

const METRIC_HELP: Record<MetricHelpKey, MetricHelpCopy> = {
  storiesDone: {
    title: "Stories Done",
    meaning: "How many items reached Done in this period.",
    whyGood: "Higher is better if quality and predictability stay stable.",
    improveTips: [
      "Split large stories into smaller vertical slices.",
      "Limit WIP and finish started work before pulling new items.",
      "Remove blockers daily and escalate aging items quickly.",
    ],
  },
  avgCycleTime: {
    title: "Avg Cycle Time",
    meaning: "Average time from Created to Done.",
    whyGood: "Lower is better. Shorter cycle time means faster delivery.",
    improveTips: [
      "Break work into smaller tickets with clear acceptance criteria.",
      "Reduce waiting in review/test queues with explicit pull rules.",
      "Track blocked time and resolve root causes in retrospectives.",
    ],
  },
  sleP85: {
    title: "SLE P85",
    meaning: "A work item has about 85% chance to be delivered in this many days or less.",
    whyGood: "Lower is better. It improves delivery predictability.",
    improveTips: [
      "Analyze and remove causes of long-tail outliers.",
      "Define service classes and expedite only true urgent work.",
      "Use tighter refinement so work starts with less ambiguity.",
    ],
  },
  velocity: {
    title: "Velocity",
    meaning: "Delivered volume in your selected cadence (week/sprint/month).",
    whyGood: "Higher is useful only when quality and aging risk do not worsen.",
    improveTips: [
      "Keep team capacity stable and account for planned absences.",
      "Avoid mid-sprint scope changes and excessive context switching.",
      "Improve refinement quality so commitment is realistic.",
    ],
  },
  understandingTrends: {
    title: "Understanding Trends",
    meaning: "Trend badges compare current period against the selected previous comparison period.",
    whyGood:
      "Green means improvement, red means worsening, and gray means neutral (<1% change). Lower is better for cycle/SLE/2+ sprint%, higher is better for done and velocity.",
    improveTips: [
      "Review at least 3 consecutive periods before acting on a trend.",
      "Validate data quality and sample size before decisions.",
      "Pair trend signals with bottleneck and aging metrics for context.",
    ],
  },
  throughputThisMonth: {
    title: "Throughput (This month)",
    meaning:
      "Done count by delivery date (Resolved, or Updated fallback) in the anchor month. In month view this is the selected month; otherwise it uses the latest available activity month.",
    whyGood: "Shows current output pace and near-term delivery capacity.",
    improveTips: [
      "Reduce carry-over by finishing in-progress work first.",
      "Close completed tickets promptly so flow data stays accurate.",
      "Use daily flow review to remove blockers quickly.",
    ],
  },
  throughputLastMonth: {
    title: "Throughput (Last month)",
    meaning: "Done count by Updated date in the month before the anchor month.",
    whyGood: "Good baseline to compare month-over-month change.",
    improveTips: [
      "Use it as baseline and investigate large month-over-month deltas.",
      "Stabilize team capacity and reduce ad-hoc work interruptions.",
      "Keep scope increments small for smoother completion cadence.",
    ],
  },
  throughputLast30Days: {
    title: "Throughput (Last 30 days)",
    meaning: "Rolling done count by delivery date over the 30-day window ending at the anchor month cutoff.",
    whyGood: "Less sensitive to month boundaries than calendar month totals.",
    improveTips: [
      "Track weekly fluctuations and investigate sudden drops.",
      "Limit WIP and enforce pull-based flow between statuses.",
      "Ensure done criteria are clear to avoid late rework.",
    ],
  },
  doneBugRatio: {
    title: "Done Bug Ratio",
    meaning: "Share of completed items that are Bug type.",
    whyGood: "Lower usually means less rework pressure.",
    improveTips: [
      "Strengthen Definition of Done with testing and review gates.",
      "Use shift-left testing and pair review for risky changes.",
      "Cluster bug root causes and fix recurring patterns.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: "<= 15%" },
      { tone: "warn", label: "Watch", range: "15.1% to 25%" },
      { tone: "bad", label: "Action", range: "> 25%" },
    ],
  },
  intakeVsThroughput: {
    title: "Created vs Delivered",
    meaning: "Newly created work compared to delivered work in the same anchor month window, using delivery date for done work.",
    whyGood: "Created should stay close to or below Delivered to keep backlog healthy.",
    improveTips: [
      "Cap intake when delivery cannot keep up.",
      "Prioritize finishing started work over starting new work.",
      "Run weekly backlog pruning and remove low-value items.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: "<= 1.00x" },
      { tone: "warn", label: "Watch", range: "1.01x to 1.15x" },
      { tone: "bad", label: "Action", range: "> 1.15x" },
    ],
  },
  netFlow: {
    title: "Backlog Flow",
    meaning: "Created minus Delivered in the anchor month window, using delivery date for done work.",
    whyGood: "Positive means backlog is growing, zero or negative means stable/reducing backlog.",
    improveTips: [
      "If backlog flow stays positive, reduce intake temporarily.",
      "Close old tickets that are obsolete or no longer needed.",
      "Split large items to increase completion rate.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: "<= 0 tickets" },
      { tone: "warn", label: "Watch", range: "> 0 and <= about 15% of monthly delivered" },
      { tone: "bad", label: "Action", range: "> about 15% of monthly delivered" },
    ],
  },
  throughputStability: {
    title: "Throughput Stability",
    meaning: "Predictability score derived from recent throughput variation.",
    whyGood: "Higher is better. 100% means throughput is very stable and easier to plan against.",
    improveTips: [
      "Stabilize sprint scope and reduce urgent ad-hoc interruptions.",
      "Keep work item sizes more consistent.",
      "Balance skills in the team to reduce bottleneck dependence.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: ">= 80% predictable" },
      { tone: "warn", label: "Watch", range: "50% to 79.9% predictable" },
      { tone: "bad", label: "Action", range: "< 50% predictable" },
    ],
  },
  wipAgeRisk: {
    title: "WIP Age Risk",
    meaning: "Percent of open tickets older than 1+ months, plus 60/90 day aging split.",
    whyGood: "Lower is better. High aging signals flow blockage and stale work.",
    improveTips: [
      "Review and close stale tickets every week.",
      "Split old tickets into smaller deliverable chunks.",
      "Escalate blocked work quickly instead of letting it age.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: "<= 25%" },
      { tone: "warn", label: "Watch", range: "25.1% to 40%" },
      { tone: "bad", label: "Action", range: "> 40%" },
    ],
  },
  leadTimeByType: {
    title: "Lead Time by Type",
    meaning: "Average Created->Resolved time by issue type.",
    whyGood: "Shows where each work type slows down.",
    improveTips: [
      "Focus improvement on slowest issue types first.",
      "Define clearer workflow policies per issue type.",
      "Reduce handoffs between statuses for long-running types.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: "<= 15 days" },
      { tone: "warn", label: "Watch", range: "15.1 to 30 days" },
      { tone: "bad", label: "Action", range: "> 30 days" },
    ],
  },
  flowEfficiency: {
    title: "Flow Efficiency",
    meaning: "Share of active work time vs total flow time (active + queue).",
    whyGood: "Higher is better. It means less waiting and smoother delivery.",
    improveTips: [
      "Reduce queue states and waiting before work starts.",
      "Assign clear ownership for pull between workflow steps.",
      "Automate repetitive handoffs where possible.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: ">= 50%" },
      { tone: "warn", label: "Watch", range: "30% to 49.9%" },
      { tone: "bad", label: "Action", range: "< 30%" },
    ],
  },
  queueTimeByStatus: {
    title: "Queue Time by Status",
    meaning: "Top statuses where average wait time is highest in selected period.",
    whyGood: "Shows exactly where work is waiting so improvements can be targeted.",
    improveTips: [
      "Set explicit WIP limits for high-wait statuses.",
      "Define entry/exit criteria so work does not idle in queue.",
      "Swarm on oldest items in the bottleneck status.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: "<= 5 days" },
      { tone: "warn", label: "Watch", range: "5.1 to 12 days" },
      { tone: "bad", label: "Action", range: "> 12 days" },
    ],
  },
  bottleneckTrend: {
    title: "Bottleneck Trend",
    meaning: "How often each status appears as monthly bottleneck and how much it shifts.",
    whyGood: "Stable recurring bottleneck points to structural process constraint.",
    improveTips: [
      "Pick one recurring bottleneck and run a focused improvement experiment.",
      "Track effect month-over-month before changing multiple variables.",
      "Add targeted capacity/skills where the bottleneck repeats.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: "<= 7 days" },
      { tone: "warn", label: "Watch", range: "7.1 to 14 days" },
      { tone: "bad", label: "Action", range: "> 14 days" },
    ],
  },
  forecastMonteCarlo: {
    title: "Forecast (Monte Carlo lite)",
    meaning:
      "Forecast based on recent throughput and current open backlog. P50 means ~50% chance, P85 means ~85% chance backlog is done within that time.",
    whyGood: "Gives probability-based planning ranges instead of one fixed date.",
    improveTips: [
      "Shrink backlog and remove low-priority work.",
      "Improve throughput stability to tighten forecast range.",
      "Refresh forecast weekly with latest data.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: "<= 30 days (P85)" },
      { tone: "warn", label: "Watch", range: "31 to 60 days (P85)" },
      { tone: "bad", label: "Action", range: "> 60 days (P85)" },
    ],
  },
  sprintPredictability: {
    title: "2+ Sprint %",
    meaning: "Share of delivered work that has 2 or more sprint assignments.",
    whyGood: "Lower is better. High values usually mean carry-over or work moving across sprint boundaries.",
    improveTips: [
      "Split work smaller before it enters a sprint.",
      "Review carry-over in retro and identify why work missed the sprint.",
      "Use Delivered Outside Sprint % beside this to separate carry-over from ad-hoc work.",
    ],
  },
  inSprintUnestimated: {
    title: "In-Sprint Unestimated %",
    meaning: "Share of sprint-assigned tickets updated in the selected period that have no story points.",
    whyGood: "Lower is better. Sprint work without estimates weakens planning and predictability.",
    improveTips: [
      "Add story points before work enters sprint scope.",
      "Reject unestimated tickets from sprint planning unless explicitly expedited.",
      "Track teams or issue types where estimate discipline is slipping.",
    ],
  },
  deliveredOutsideSprint: {
    title: "Delivered Outside Sprint %",
    meaning: "Share of delivered tickets in the selected period that have no sprint assignment.",
    whyGood: "Lower is better for Scrum teams. High values usually mean ad-hoc work or weak sprint discipline.",
    improveTips: [
      "Separate true support/ad-hoc work from sprint delivery.",
      "Ensure sprint field is populated before planned work starts.",
      "Review done items without sprint and decide if the process or mapping is wrong.",
    ],
  },
  wipRiskHeatmap: {
    title: "WIP Risk Heatmap by Status",
    meaning: "Open WIP split by status into exclusive aging buckets so each row sums to Total.",
    whyGood: "Highlights exactly which statuses are accumulating stale work.",
    improveTips: [
      "Set aging alerts for >30 and >60 day tickets.",
      "Define weekly clean-up for statuses with oldest WIP.",
      "Close or cancel tickets that no longer have value.",
    ],
  },
  agingWip: {
    title: "Average age of open tickets",
    meaning: "Average age of currently open work.",
    whyGood: "Lower is better. Rising age usually predicts slower delivery.",
    improveTips: [
      "Review top oldest tickets in every standup.",
      "Close old irrelevant tickets and unblock active ones.",
      "Use smaller work items to reduce time-in-progress.",
    ],
  },
  bottleneck: {
    title: "Bottleneck",
    meaning: "The status with highest average time from Time in Status data.",
    whyGood: "Targets the one stage where improvement gives biggest flow gain.",
    improveTips: [
      "Prioritize improvements in the current bottleneck stage first.",
      "Reduce handoff delays and waiting before/after that stage.",
      "Use temporary swarm policy until queue normalizes.",
    ],
  },
  dataMonitor: {
    title: "Data Monitor",
    meaning: "Centralized list of missing source fields and metric prerequisites for the selected team/period.",
    whyGood: "Makes broken or partial metrics actionable without hunting through individual cards.",
    improveTips: [
      "Fix missing source columns first: Created, Updated, Issue Type, Story points, Sprint.",
      "Import Time in Status whenever flow metrics show gaps.",
      "Use the sample issue keys to spot-check the raw CSV rows quickly.",
    ],
  },
  healthCheckSummary: {
    title: "Health Check Summary",
    meaning: "Aggregated view of all flow-health indicators in this team view.",
    whyGood: "Highlights where to act first instead of scanning every card manually.",
    improveTips: [
      "Resolve ACTION indicators first, then WATCH indicators.",
      "Focus on one bottleneck experiment at a time and re-check next period.",
      "Use the top actions list as your retrospective and planning input.",
    ],
  },
};

interface BottleneckDraftRow {
  id: string;
  name: string;
  weeks: string;
  days: string;
  hours: string;
}

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>("workspace");
  const [teamTab, setTeamTab] = useState<TeamTab>("overview");
  const [workspaceHandle, setWorkspaceHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [rememberedWorkspaces, setRememberedWorkspaces] = useState<RememberedWorkspaceSummary[]>([]);
  const [workspaceProfiles, setWorkspaceProfiles] = useState<WorkspaceProfileConfig[]>([]);
  const [activeWorkspaceProfileId, setActiveWorkspaceProfileId] = useState<string>(ALL_TEAMS_PROFILE_ID);
  const [workspaceProfileNameDraft, setWorkspaceProfileNameDraft] = useState("");
  const [workspaceMetricConfig, setWorkspaceMetricConfig] = useState<WorkspaceMetricConfig>(() =>
    buildDefaultWorkspaceMetricConfig(),
  );
  const [activeMetricScope, setActiveMetricScope] = useState<MetricScope>("team");
  const [activeMetricGroup, setActiveMetricGroup] = useState<ConfigurableMetricGroup>("Core");
  const [teams, setTeams] = useState<TeamRuntime[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [periodMonth, setPeriodMonth] = useState<string>("all");

  const [sleLineVisibility, setSleLineVisibility] = useState<Record<SleLineKey, boolean>>({
    p50: true,
    p70: true,
    p85: true,
    p95: true,
  });

  const [importTeamId, setImportTeamId] = useState<string>("");
  const [importMode, setImportMode] = useState<ImportMode>("current-month");
  const [customImportBucket, setCustomImportBucket] = useState("");
  const [querySelectionId, setQuerySelectionId] = useState("");
  const [queryDraftName, setQueryDraftName] = useState("");
  const [queryDraftJql, setQueryDraftJql] = useState("");
  const [queryDraftNote, setQueryDraftNote] = useState("");
  const [queryTimeWindow, setQueryTimeWindow] = useState<QueryTimeWindow>("ytd");
  const [timeInStatusQuerySelectionId, setTimeInStatusQuerySelectionId] = useState("");
  const [timeInStatusQueryDraftName, setTimeInStatusQueryDraftName] = useState("");
  const [timeInStatusQueryDraftJql, setTimeInStatusQueryDraftJql] = useState("");
  const [timeInStatusQueryDraftNote, setTimeInStatusQueryDraftNote] = useState("");
  const [timeInStatusQueryTimeWindow, setTimeInStatusQueryTimeWindow] = useState<QueryTimeWindow>("ytd");
  const [jiraImportUrl, setJiraImportUrl] = useState("");
  const [jiraImportUsername, setJiraImportUsername] = useState("");
  const [jiraImportToken, setJiraImportToken] = useState("");
  const [jiraImportJql, setJiraImportJql] = useState("");
  const [jiraImportMaxIssues, setJiraImportMaxIssues] = useState("200");
  const [jiraConnectionStatus, setJiraConnectionStatus] = useState<{
    tone: "success" | "error" | "neutral";
    message: string;
  } | null>(null);

  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");

  const [showAdvancedImport, setShowAdvancedImport] = useState(false);
  const [doneStatusesInput, setDoneStatusesInput] = useState("");
  const [bugIssueTypesInput, setBugIssueTypesInput] = useState("Bug");
  const [bugDefaultStoryPointsInput, setBugDefaultStoryPointsInput] = useState("");
  const [sprintScopeStatusesInput, setSprintScopeStatusesInput] = useState("");
  const [backlogStatusesInput, setBacklogStatusesInput] = useState("");
  const [doneStatusDraft, setDoneStatusDraft] = useState("");
  const [bugIssueTypeDraft, setBugIssueTypeDraft] = useState("");
  const [sprintScopeStatusDraft, setSprintScopeStatusDraft] = useState("");
  const [backlogStatusDraft, setBacklogStatusDraft] = useState("");
  const [draftConfig, setDraftConfig] = useState<TeamConfig | null>(null);
  const [bottleneckPeriodInput, setBottleneckPeriodInput] = useState(() => monthKey(new Date()));
  const [bottleneckRows, setBottleneckRows] = useState<BottleneckDraftRow[]>(() => [createEmptyBottleneckRow()]);
  const [bottleneckFlowStatuses, setBottleneckFlowStatuses] = useState<string[]>([]);
  const [bottleneckFlowDraft, setBottleneckFlowDraft] = useState("");
  const [bottleneckNotesInput, setBottleneckNotesInput] = useState("");
  const [todayRef, setTodayRef] = useState(() => new Date());
  const [quickInsightsOpen, setQuickInsightsOpen] = useState(false);
  const [doneDefinitionOpen, setDoneDefinitionOpen] = useState(false);
  const [agingWipCompactOpen, setAgingWipCompactOpen] = useState(false);
  const [bottleneckPanelOpen, setBottleneckPanelOpen] = useState(false);
  const [healthCheckActionsOpen, setHealthCheckActionsOpen] = useState(false);
  const [openMetricHelpKey, setOpenMetricHelpKey] = useState<MetricHelpKey | null>(null);
  const [sleIssueTypesDraft, setSleIssueTypesDraft] = useState<string[]>([...DEFAULT_SLE_ISSUE_TYPES]);

  const fsApiSupported = supportsFileSystemAccess();

  const activeWorkspaceProfile = useMemo(() => {
    return workspaceProfiles.find((profile) => profile.id === activeWorkspaceProfileId) ?? null;
  }, [workspaceProfiles, activeWorkspaceProfileId]);

  const visibleMetricIds = useMemo(() => {
    return getVisibleMetricSet(workspaceMetricConfig, activeMetricScope);
  }, [workspaceMetricConfig, activeMetricScope]);

  const visibleMetrics = useMemo(() => {
    return CONFIGURABLE_METRICS.filter((metric) => visibleMetricIds.has(metric.id));
  }, [visibleMetricIds]);

  const hiddenMetricCount = CONFIGURABLE_METRICS.length - visibleMetrics.length;

  const filteredTeams = useMemo(() => {
    if (!activeWorkspaceProfile) {
      return teams;
    }

    const teamIdSet = new Set(activeWorkspaceProfile.teamIds);
    return teams.filter((team) => teamIdSet.has(team.teamId));
  }, [teams, activeWorkspaceProfile]);

  const selectedTeam = useMemo(
    () => filteredTeams.find((team) => team.teamId === selectedTeamId) ?? null,
    [filteredTeams, selectedTeamId],
  );

  const selectedImportTeam = useMemo(
    () => filteredTeams.find((team) => team.teamId === importTeamId) ?? null,
    [filteredTeams, importTeamId],
  );

  const selectedTeamJiraQueryConfig = useMemo(() => {
    return normalizeJiraQueryConfig(selectedImportTeam?.config.jiraQuery);
  }, [selectedImportTeam]);
  const selectedIssueQueryConfig = selectedTeamJiraQueryConfig.issueQuery as JiraQueryCollection;
  const selectedTimeInStatusQueryConfig = selectedTeamJiraQueryConfig.timeInStatusQuery as JiraQueryCollection;

  const importGuideColumns = useMemo(() => {
    const config = selectedImportTeam?.config ?? selectedTeam?.config;
    const mapping = config?.mapping;
    const cycleSource = config?.cycleTimeConfig?.endDateSource ?? "resolvedOrUpdated";

    return [
      { label: "Issue key", value: mapping?.key ?? "Issue key", required: true, description: "Unique key, duplicates are merged by latest Updated." },
      { label: "Created", value: mapping?.created ?? "Created", required: true, description: "Cycle Time start date." },
      {
        label: "Resolved",
        value: mapping?.resolutionDate ?? "Resolved",
        required: cycleSource !== "updatedOnly",
        description:
          cycleSource === "updatedOnly"
            ? "Optional when cycle-time end source is Updated only."
            : "Cycle Time end date (fallback Updated if empty).",
      },
      {
        label: "Updated",
        value: mapping?.updated ?? "Updated",
        required: true,
        description:
          cycleSource === "updatedOnly"
            ? "Cycle Time end date for this team and dedupe latest row wins."
            : "Used for dedupe: latest row wins.",
      },
      { label: "Status", value: mapping?.status ?? "Status", required: true, description: "Done determination with done config." },
      { label: "Resolution", value: mapping?.resolution ?? "Resolution", required: true, description: "Secondary done signal when status is unclear." },
      { label: "Issue type", value: mapping?.issueType ?? "Issue Type", required: false, description: "Used for Bug Ratio (default Bug issue type)." },
      {
        label: "Story points",
        value: mapping?.storyPoints ?? "Story points",
        required: false,
        description: "Used in story-point velocity modes; missing values fallback to ticket count.",
      },
      { label: "Sprint", value: mapping?.sprint ?? "Sprint", required: false, description: "Used to compute 2+ sprint issues." },
    ];
  }, [selectedImportTeam, selectedTeam]);

  const availableMonths = useMemo(() => {
    return buildAvailableMonths(filteredTeams);
  }, [filteredTeams]);

  const periodYearGroups = useMemo(() => {
    return buildPeriodYearGroups(availableMonths, 1);
  }, [availableMonths]);

  const periodReferenceDate = useMemo(() => {
    return resolvePeriodReferenceDate(availableMonths, todayRef);
  }, [availableMonths, todayRef]);

  useEffect(() => {
    setQuickInsightsOpen(false);
    setDoneDefinitionOpen(false);
    setAgingWipCompactOpen(false);
    setBottleneckPanelOpen(false);
    setHealthCheckActionsOpen(false);
    setOpenMetricHelpKey(null);
  }, [selectedTeamId]);

  useEffect(() => {
    if (!fsApiSupported) {
      setStatus("This browser does not support local folder access API.");
      return;
    }

    let cancelled = false;

    const restoreWorkspace = async (): Promise<void> => {
      try {
        await refreshRememberedWorkspaces();
        const remembered = await restoreRememberedWorkspaceDirectory();
        if (!remembered || cancelled) {
          return;
        }

        const loadedTeams = await applyWorkspaceHandle(remembered);
        if (cancelled) {
          return;
        }
        setStatus(`Workspace restored: ${remembered.name}. Found ${loadedTeams.length} teams.`);
      } catch {
        setStatus("Saved workspace could not be restored. Choose workspace again.");
      }
    };

    void restoreWorkspace();

    return () => {
      cancelled = true;
    };
  }, [fsApiSupported]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTodayRef(new Date());
    }, 60 * 60 * 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".metric-help-anchor")) {
        setOpenMetricHelpKey(null);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  useEffect(() => {
    if (!selectedTeam) {
      setDraftConfig(null);
      setDoneStatusesInput("");
      setBugIssueTypesInput("Bug");
      setBugDefaultStoryPointsInput("");
      setSprintScopeStatusesInput("");
      setBacklogStatusesInput("");
      setSleIssueTypesDraft([...DEFAULT_SLE_ISSUE_TYPES]);
      setDoneStatusDraft("");
      setBugIssueTypeDraft("");
      setSprintScopeStatusDraft("");
      setBacklogStatusDraft("");
      setBottleneckFlowStatuses([]);
      setBottleneckFlowDraft("");
      setBottleneckRows([createEmptyBottleneckRow()]);
      setBottleneckNotesInput("");
      return;
    }

    setDraftConfig(structuredClone(selectedTeam.config));
    setDoneStatusesInput((selectedTeam.config.doneConfig.doneStatuses ?? []).join(", "));
    setBugIssueTypesInput((selectedTeam.config.bugConfig?.issueTypes ?? ["Bug"]).join(", "));
    setBugDefaultStoryPointsInput(formatOptionalNumberInput(selectedTeam.config.bugConfig?.defaultStoryPoints));
    setSprintScopeStatusesInput(resolveSprintScopeStatuses(selectedTeam.config, selectedTeam.parsedIssues).join(", "));
    setBacklogStatusesInput((selectedTeam.config.workflowConfig?.backlogStatuses ?? inferBacklogStatuses(selectedTeam.parsedIssues)).join(", "));
    setSleIssueTypesDraft(normalizeSleIssueTypes(selectedTeam.config.sleConfig.issueTypes));
    setDoneStatusDraft("");
    setBugIssueTypeDraft("");
    setSprintScopeStatusDraft("");
    setBacklogStatusDraft("");

    const effectiveEntries = buildEffectiveBottleneckEntries(selectedTeam);
    const flowStatuses = normalizeFlowStatuses(
      selectedTeam.config.bottleneckConfig?.flowStatuses ?? inferFlowStatusesFromEntries(effectiveEntries),
    );
    setBottleneckFlowStatuses(flowStatuses);
    setBottleneckFlowDraft("");

    const defaultBottleneckPeriod = monthKey(new Date());
    setBottleneckPeriodInput(defaultBottleneckPeriod);
    const currentEntry = effectiveEntries.find((entry) => entry.period === defaultBottleneckPeriod);
    setBottleneckRows(
      currentEntry ? buildBottleneckRows(currentEntry.columns) : buildBottleneckRowsFromStatuses(flowStatuses),
    );
    setBottleneckNotesInput(currentEntry?.notes ?? "");
  }, [selectedTeam]);

  useEffect(() => {
    if (activeWorkspaceProfileId === ALL_TEAMS_PROFILE_ID) {
      return;
    }

    if (!workspaceProfiles.some((profile) => profile.id === activeWorkspaceProfileId)) {
      setActiveWorkspaceProfileId(ALL_TEAMS_PROFILE_ID);
    }
  }, [workspaceProfiles, activeWorkspaceProfileId]);

  useEffect(() => {
    if (filteredTeams.length === 0) {
      setSelectedTeamId(null);
      return;
    }

    setSelectedTeamId((current) => {
      if (current && filteredTeams.some((team) => team.teamId === current)) {
        return current;
      }

      return filteredTeams[0].teamId;
    });
  }, [filteredTeams]);

  useEffect(() => {
    if (!selectedTeam) {
      return;
    }

    const effectiveEntries = buildEffectiveBottleneckEntries(selectedTeam);
    const existing = effectiveEntries.find((entry) => entry.period === bottleneckPeriodInput);
    setBottleneckRows(
      existing ? buildBottleneckRows(existing.columns) : buildBottleneckRowsFromStatuses(bottleneckFlowStatuses),
    );
    setBottleneckNotesInput(existing?.notes ?? "");
  }, [selectedTeam, bottleneckPeriodInput, bottleneckFlowStatuses]);

  useEffect(() => {
    if (filteredTeams.length === 0) {
      setImportTeamId("");
      return;
    }

    setImportTeamId((current) => {
      if (current && filteredTeams.some((team) => team.teamId === current)) {
        return current;
      }
      return filteredTeams[0].teamId;
    });
  }, [filteredTeams]);

  useEffect(() => {
    if (!selectedImportTeam) {
      setQuerySelectionId("");
      setQueryDraftName("");
      setQueryDraftJql("");
      setQueryDraftNote("");
      setTimeInStatusQuerySelectionId("");
      setTimeInStatusQueryDraftName("");
      setTimeInStatusQueryDraftJql("");
      setTimeInStatusQueryDraftNote("");
      return;
    }

    const preferredQuery = resolvePreferredSavedQuery(selectedIssueQueryConfig, querySelectionId);

    if (!preferredQuery) {
      setQuerySelectionId("");
      setQueryDraftName("");
      setQueryDraftJql("");
      setQueryDraftNote("");
    } else {
      if (querySelectionId !== preferredQuery.id) {
        setQuerySelectionId(preferredQuery.id);
      }

      setQueryDraftName(preferredQuery.name);
      setQueryDraftJql(preferredQuery.jql);
      setQueryDraftNote(preferredQuery.note ?? "");
    }

    const preferredTimeInStatusQuery = resolvePreferredSavedQuery(
      selectedTimeInStatusQueryConfig,
      timeInStatusQuerySelectionId,
    );

    if (!preferredTimeInStatusQuery) {
      setTimeInStatusQuerySelectionId("");
      setTimeInStatusQueryDraftName("");
      setTimeInStatusQueryDraftJql("");
      setTimeInStatusQueryDraftNote("");
      return;
    }

    if (timeInStatusQuerySelectionId !== preferredTimeInStatusQuery.id) {
      setTimeInStatusQuerySelectionId(preferredTimeInStatusQuery.id);
    }

    setTimeInStatusQueryDraftName(preferredTimeInStatusQuery.name);
    setTimeInStatusQueryDraftJql(preferredTimeInStatusQuery.jql);
    setTimeInStatusQueryDraftNote(preferredTimeInStatusQuery.note ?? "");
  }, [
    selectedImportTeam,
    selectedIssueQueryConfig,
    selectedTimeInStatusQueryConfig,
    querySelectionId,
    timeInStatusQuerySelectionId,
  ]);

  const dashboardBottleneckPeriod = useMemo(() => {
    return resolveBottleneckPeriod(periodMonth, availableMonths, periodReferenceDate);
  }, [periodMonth, availableMonths, periodReferenceDate]);

  const dashboardRows = useMemo(() => {
    const previousPeriod = getPreviousPeriodKey(periodMonth, availableMonths);

    return filteredTeams.map((team) => {
      const effectiveEntries = buildEffectiveBottleneckEntries(team);
      const current = computeSnapshot(team.metrics, periodMonth, team.config, team.parsedIssues, periodReferenceDate);
      const previous = previousPeriod
        ? computeSnapshot(team.metrics, previousPeriod, team.config, team.parsedIssues, periodReferenceDate)
        : null;
      const healthCurrent = computeTeamHealthSnapshot(
        team.parsedIssues,
        team.config,
        periodMonth,
        periodReferenceDate,
        effectiveEntries,
      );
      const healthPrevious =
        previousPeriod === null
          ? null
          : computeTeamHealthSnapshot(
              team.parsedIssues,
              team.config,
              previousPeriod,
              periodReferenceDate,
              effectiveEntries,
            );
      const healthTrends: TeamMetricsHealthTrendBundle = {
        wipAgeRisk: trend(healthCurrent.wipRisk.over30Pct, healthPrevious?.wipRisk.over30Pct ?? null, "down"),
        bugRatio: trend(healthCurrent.bugRatio.doneBugRatio, healthPrevious?.bugRatio.doneBugRatio ?? null, "down"),
        monteCarlo: trend(healthCurrent.forecast.p85Days, healthPrevious?.forecast.p85Days ?? null, "down"),
      };

      return {
        team,
        current,
        previous,
        trends: buildTrendBundle(current, previous),
        healthCurrent,
        healthPrevious,
        healthTrends,
        bottleneck: getBottleneckForPeriod(effectiveEntries, dashboardBottleneckPeriod),
      };
    });
  }, [filteredTeams, periodMonth, availableMonths, dashboardBottleneckPeriod, periodReferenceDate]);

  const selectedTeamRow = useMemo(() => {
    if (!selectedTeamId) {
      return null;
    }
    return dashboardRows.find((row) => row.team.teamId === selectedTeamId) ?? null;
  }, [dashboardRows, selectedTeamId]);

  const selectedVelocityUnit = useMemo(() => {
    return getVelocityUnitLabel(selectedTeam?.config.velocityConfig);
  }, [selectedTeam]);

  const sleIssueTypeOptions = useMemo(() => {
    const byKey = new Map<string, string>();

    (selectedTeam?.parsedIssues ?? []).forEach((issue) => {
      const label = issue.issueType.trim();
      if (!label) {
        return;
      }

      const key = normalizeTextValue(label);
      if (!key) {
        return;
      }

      if (!byKey.has(key)) {
        byKey.set(key, label);
      }
    });

    normalizeSleIssueTypes(sleIssueTypesDraft).forEach((label) => {
      const key = normalizeTextValue(label);
      if (!key || byKey.has(key)) {
        return;
      }
      byKey.set(key, label);
    });

    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }, [selectedTeam, sleIssueTypesDraft]);

  const sleIssueTypesDirty = useMemo(() => {
    if (!selectedTeam) {
      return false;
    }

    return !areIssueTypeSelectionsEqual(
      sleIssueTypesDraft,
      normalizeSleIssueTypes(selectedTeam.config.sleConfig.issueTypes),
    );
  }, [selectedTeam, sleIssueTypesDraft]);

  const draftVelocityConfig = useMemo(() => {
    return normalizeVelocityConfig(draftConfig?.velocityConfig);
  }, [draftConfig]);

  const selectedTeamBottleneckEntries = useMemo(() => {
    return buildEffectiveBottleneckEntries(selectedTeam);
  }, [selectedTeam]);

  const selectedTeamHealth = useMemo(() => {
    return computeTeamHealthSnapshot(
      selectedTeam?.parsedIssues ?? [],
      selectedTeam?.config,
      periodMonth,
      periodReferenceDate,
      selectedTeamBottleneckEntries,
    );
  }, [selectedTeam, periodMonth, periodReferenceDate, selectedTeamBottleneckEntries]);

  const selectedTeamThroughputAnchorLabel = useMemo(() => {
    return formatPeriodLabel(selectedTeamHealth.throughput.anchorMonth);
  }, [selectedTeamHealth]);

  const selectedTeamThroughputComparisonLabel = useMemo(() => {
    return formatPeriodLabel(selectedTeamHealth.throughput.comparisonMonth);
  }, [selectedTeamHealth]);

  const selectedTeamBoardStatuses = useMemo(() => {
    return buildBoardStatusMap(selectedTeam?.parsedIssues ?? []);
  }, [selectedTeam]);

  const selectedTeamHealthSignals = useMemo(() => {
    return buildTeamHealthSignals(selectedTeamHealth);
  }, [selectedTeamHealth]);

  const selectedTeamMetricDataIssues = useMemo(() => {
    return buildMetricDataIssues(selectedTeamHealth, selectedTeam?.config);
  }, [selectedTeamHealth, selectedTeam?.config]);

  const selectedTeamDataMonitorEntries = useMemo(() => {
    if (!selectedTeam) {
      return [];
    }

    return buildDataMonitorEntries(
      selectedTeam.parsedIssues,
      selectedTeam.config,
      periodMonth,
      selectedTeamMetricDataIssues,
      selectedTeamBottleneckEntries,
      periodReferenceDate,
    );
  }, [selectedTeam, periodMonth, selectedTeamMetricDataIssues, selectedTeamBottleneckEntries, periodReferenceDate]);

  const selectedTeamHealthCheck = useMemo(() => {
    return buildTeamHealthCheckSummary(selectedTeamHealthSignals);
  }, [selectedTeamHealthSignals]);

  const doneStatusList = useMemo(() => {
    return parseCommaSeparatedList(doneStatusesInput);
  }, [doneStatusesInput]);

  const bugIssueTypeList = useMemo(() => {
    return parseCommaSeparatedList(bugIssueTypesInput);
  }, [bugIssueTypesInput]);

  const bugIssueTypeOptions = useMemo(() => {
    const byKey = new Map<string, string>();

    (selectedTeam?.parsedIssues ?? []).forEach((issue) => {
      const label = issue.issueType.trim();
      const key = normalizeTextValue(label);
      if (!key || byKey.has(key)) {
        return;
      }
      byKey.set(key, label);
    });

    bugIssueTypeList.forEach((label) => {
      const key = normalizeTextValue(label);
      if (!key || byKey.has(key)) {
        return;
      }
      byKey.set(key, label);
    });

    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }, [selectedTeam, bugIssueTypeList]);

  const sprintScopeStatusList = useMemo(() => {
    return parseCommaSeparatedList(sprintScopeStatusesInput);
  }, [sprintScopeStatusesInput]);

  const backlogStatusList = useMemo(() => {
    return parseCommaSeparatedList(backlogStatusesInput);
  }, [backlogStatusesInput]);

  const detectedWorkflowStatuses = useMemo(() => {
    return buildDetectedWorkflowStatuses(selectedTeam, selectedTeamBottleneckEntries);
  }, [selectedTeam, selectedTeamBottleneckEntries]);

  const velocityCadenceLabel = useMemo(() => {
    if (draftVelocityConfig.mode === "monthly-ticket-count") {
      return "Monthly ticket count";
    }

    if (draftVelocityConfig.mode === "monthly-story-points") {
      return "Monthly story points";
    }

    if (draftVelocityConfig.mode === "weekly-ticket-count") {
      return "Kanban, weekly ticket count";
    }

    return "Scrum, sprint story points";
  }, [draftVelocityConfig.mode]);

  const agingTopThree = useMemo(() => {
    return selectedTeamHealth.agingWip.topOldest.slice(0, 3);
  }, [selectedTeamHealth]);

  const agingOlderThanMonthItems = useMemo(() => {
    return selectedTeamHealth.agingWip.topOldest.filter((item) => item.agingDays > 30);
  }, [selectedTeamHealth]);

  const selectedBottleneckEntry = useMemo(() => {
    return resolveBottleneckEntryForPeriod(selectedTeamBottleneckEntries, dashboardBottleneckPeriod);
  }, [selectedTeamBottleneckEntries, dashboardBottleneckPeriod]);

  const selectedBottleneckSummary = useMemo(() => {
    if (!selectedBottleneckEntry) {
      return "No bottleneck data yet. Import Time in Status CSV or add manual entry.";
    }

    const bottleneck = getMaxBottleneckColumnForBoard(selectedBottleneckEntry, selectedTeamBoardStatuses);
    const selectedPeriodLabel = formatPeriodLabel(dashboardBottleneckPeriod);
    if (!bottleneck) {
      return `Period ${selectedPeriodLabel}: no bottleneck value yet.`;
    }

    if (selectedBottleneckEntry.period !== dashboardBottleneckPeriod) {
      return `Period ${selectedPeriodLabel}: ${bottleneck.name} (${bottleneck.avgDays.toFixed(1)} days, from ${formatPeriodLabel(selectedBottleneckEntry.period)}).`;
    }

    return `Period ${selectedPeriodLabel}: ${bottleneck.name} (${bottleneck.avgDays.toFixed(1)} days).`;
  }, [selectedBottleneckEntry, dashboardBottleneckPeriod, selectedTeamBoardStatuses]);

  const selectedBottleneckFlowTimes = useMemo(() => {
    return getBottleneckColumnsForBoard(selectedBottleneckEntry, selectedTeamBoardStatuses).slice(0, 6);
  }, [selectedBottleneckEntry, selectedTeamBoardStatuses]);

  const selectedTimeInStatusRows = useMemo(() => {
    return buildTimeInStatusRows(selectedBottleneckEntry, selectedTeamBoardStatuses);
  }, [selectedBottleneckEntry, selectedTeamBoardStatuses]);

  const selectedTimeInStatusPreviewRows = useMemo(() => {
    return selectedTimeInStatusRows.slice(0, 8);
  }, [selectedTimeInStatusRows]);

  const selectedTimeInStatusSummary = useMemo(() => {
    if (!selectedBottleneckEntry) {
      return "No per-status Time in Status data yet. Import Time in Status CSV or add a manual bottleneck row.";
    }

    const selectedPeriodLabel = formatPeriodLabel(dashboardBottleneckPeriod, periodReferenceDate);
    const sourcePeriodLabel = formatPeriodLabel(selectedBottleneckEntry.period, periodReferenceDate);
    const prefix =
      selectedBottleneckEntry.period === dashboardBottleneckPeriod
        ? `Showing ${selectedPeriodLabel}.`
        : `Showing ${sourcePeriodLabel} data for ${selectedPeriodLabel}.`;

    const highlighted = selectedTimeInStatusRows.filter((row) => row.highlight).slice(0, 3);
    if (highlighted.length === 0) {
      return `${prefix} No obvious long waiting stages right now.`;
    }

    return `${prefix} Watch ${highlighted.map((row) => `${row.name} ${row.avgDays.toFixed(1)}d`).join(" • ")}.`;
  }, [selectedBottleneckEntry, dashboardBottleneckPeriod, periodReferenceDate, selectedTimeInStatusRows]);

  const bottleneckMonthlyRows = useMemo<BottleneckMonthlyRow[]>(() => {
    if (!selectedTeam) {
      return [];
    }

    const createdByMonth = new Map<string, number>();
    selectedTeam.parsedIssues.forEach((issue) => {
      if (!issue.created) {
        return;
      }
      const month = issue.created.toISOString().slice(0, 7);
      createdByMonth.set(month, (createdByMonth.get(month) ?? 0) + 1);
    });

    const doneByMonth = new Map<string, number>();
    selectedTeam.metrics?.doneIssueDetails.forEach((item) => {
      if (!item.resolutionDate) {
        return;
      }
      const month = item.resolutionDate.slice(0, 7);
      doneByMonth.set(month, (doneByMonth.get(month) ?? 0) + 1);
    });

    const manualPeriods = new Set(selectedTeam.manualBottleneck.map((entry) => entry.period));
    const entryByPeriod = new Map(selectedTeamBottleneckEntries.map((entry) => [entry.period, entry]));
    const periods = new Set<string>([
      ...Array.from(createdByMonth.keys()),
      ...Array.from(doneByMonth.keys()),
      ...Array.from(entryByPeriod.keys()),
    ]);

    return Array.from(periods)
      .filter((period) => isMonthPeriod(period) && period >= BOTTLENECK_HISTORY_START_MONTH)
      .sort((a, b) => b.localeCompare(a))
      .map((period) => {
        const entry = entryByPeriod.get(period) ?? null;
        const bottleneck = entry ? getMaxBottleneckColumn(entry) : null;
        return {
          period,
          monthLabel: formatMonthLabel(period),
          bottleneckLabel: bottleneck ? `${bottleneck.name} (${bottleneck.avgDays.toFixed(1)} days)` : "-",
          createdCount: createdByMonth.get(period) ?? 0,
          doneCount: doneByMonth.get(period) ?? 0,
          sourceLabel: !entry ? "-" : manualPeriods.has(period) ? "Manual" : "Auto",
        };
      })
      .slice(0, 12);
  }, [selectedTeam, selectedTeamBottleneckEntries]);

  const shouldEqualizeTeamOverviewSecondaryCards = !agingWipCompactOpen && !bottleneckPanelOpen;

  const periodSummary = useMemo(() => describePeriod(periodMonth, availableMonths, periodReferenceDate), [periodMonth, availableMonths, periodReferenceDate]);
  const previousPeriodLabel = useMemo(() => {
    const previousKey = getPreviousPeriodKey(periodMonth, availableMonths);
    return previousKey ? formatPeriodLabel(previousKey, periodReferenceDate) : null;
  }, [periodMonth, availableMonths, periodReferenceDate]);

  const selectedTeamProgressSummary = useMemo(() => {
    return buildProgressComparisonSummary(selectedTeam?.progressHistory ?? []);
  }, [selectedTeam]);

  const previousMetricLabel = useMemo(() => {
    if (previousPeriodLabel) {
      return previousPeriodLabel;
    }

    if (periodMonth === "all" && selectedTeamProgressSummary.hasBaseline && selectedTeamProgressSummary.previous) {
      return `Upload ${formatDateText(selectedTeamProgressSummary.previous.capturedAt)}`;
    }

    return null;
  }, [previousPeriodLabel, periodMonth, selectedTeamProgressSummary]);

  const previousUploadMetrics = useMemo(() => {
    if (periodMonth !== "all" || !selectedTeamProgressSummary.hasBaseline) {
      return null;
    }

    return selectedTeamProgressSummary.previous?.metrics ?? null;
  }, [periodMonth, selectedTeamProgressSummary]);

  const importHistory = useMemo(() => {
    const items = filteredTeams.flatMap((team) =>
      team.importFiles.map((file) => ({
        ...file,
        teamName: team.config.teamName,
      })),
    );

    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return items.slice(0, 10);
  }, [filteredTeams]);

  const selectedImportHistory = useMemo(() => {
    if (!selectedImportTeam) {
      return [];
    }

    return selectedImportTeam.importFiles
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5);
  }, [selectedImportTeam]);

  const folderTotals = useMemo(() => {
    const totals = new Map<string, number>();

    filteredTeams.forEach((team) => {
      team.importBuckets.forEach((bucket) => {
        totals.set(bucket.path, (totals.get(bucket.path) ?? 0) + bucket.fileCount);
      });
    });

    const rows: ImportBucket[] = Array.from(totals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, fileCount]) => ({ path, fileCount }));

    return rows;
  }, [filteredTeams]);

  const composedImportJql = useMemo(() => {
    return composeQueryWithTimeWindow(queryDraftJql, queryTimeWindow, "issues");
  }, [queryDraftJql, queryTimeWindow]);

  const composedTimeInStatusJql = useMemo(() => {
    return composeQueryWithTimeWindow(timeInStatusQueryDraftJql, timeInStatusQueryTimeWindow, "timeInStatus");
  }, [timeInStatusQueryDraftJql, timeInStatusQueryTimeWindow]);

  function renderMetricInfoButton(helpKey: MetricHelpKey): JSX.Element {
    const copy = METRIC_HELP[helpKey];
    const isOpen = openMetricHelpKey === helpKey;
    const popoverId = `metric-help-${helpKey}`;

    return (
      <div className="metric-help-anchor">
        <button
          type="button"
          className="metric-help-btn"
          aria-expanded={isOpen}
          aria-controls={popoverId}
          title={isOpen ? `Hide help: ${copy.title}` : `Show help: ${copy.title}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpenMetricHelpKey((current) => (current === helpKey ? null : helpKey));
          }}
        >
          i
        </button>
        {isOpen && (
          <div className="metric-help-popover" id={popoverId}>
            <strong>{copy.title}</strong>
            <p>{copy.meaning}</p>
            <p>{copy.whyGood}</p>
            {copy.improveTips.length > 0 && (
              <>
                <p className="metric-help-tips-title">How to improve</p>
                <ul>
                  {copy.improveTips.map((tip) => (
                    <li key={`${helpKey}:${tip}`}>{tip}</li>
                  ))}
                </ul>
              </>
            )}
            {copy.healthScale && copy.healthScale.length > 0 && (
              <div className="metric-help-scale">
                <p className="metric-help-tips-title">Health scale</p>
                <div className="metric-help-scale-list">
                  {copy.healthScale.map((band) => (
                    <div key={`${helpKey}:${band.label}:${band.range}`} className={`metric-help-scale-item ${band.tone}`}>
                      <span>{band.label}</span>
                      <strong>{band.range}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderMetricLabel(
    label: string,
    helpKey: MetricHelpKey,
    healthSignal?: MetricHealthSignal,
  ): JSX.Element {
    return (
      <div className="metric-label-row">
        <span>{label}</span>
        <div className="metric-label-actions">
          {healthSignal ? (
            <span
              className={`health-pill ${healthSignal.tone}`}
              title={healthSignal.reason}
              aria-label={`${label} health: ${healthSignal.label}`}
            >
              {healthSignal.label}
            </span>
          ) : null}
          {renderMetricInfoButton(helpKey)}
        </div>
      </div>
    );
  }

  function renderPeriodChip(period: string, label: string): JSX.Element {
    return (
      <button
        type="button"
        className={`period-chip-btn ${periodMonth === period ? "active" : ""}`}
        aria-pressed={periodMonth === period}
        onClick={() => setPeriodMonth(period)}
      >
        {label}
      </button>
    );
  }

  function renderPeriodPicker(): JSX.Element {
    return (
      <div className="period-select period-picker">
        <span>Period:</span>
        <div className="period-picker-controls">
          <div className="period-chip-row">
            {renderPeriodChip("all", "All")}
            {renderPeriodChip("ytd", formatPeriodLabel("ytd", periodReferenceDate))}
          </div>
          {periodYearGroups.length > 0 ? (
            <div className="period-year-groups">
              {periodYearGroups.map((group) => (
                <div key={group.year} className="period-year-group">
                  <span className="period-year-label">{group.year}</span>
                  <div className="period-chip-row">
                    {group.months.map((month) => (
                      <span key={month}>{renderPeriodChip(month, formatMonthShortLabel(month))}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderMetricScopeSelector(className = ""): JSX.Element {
    return (
      <div className={`metric-scope-selector ${className}`}>
        <span>Metric scope:</span>
        <div className="metric-scope-buttons">
          {METRIC_SCOPES.map((scope) => (
            <button
              key={scope}
              type="button"
              className={activeMetricScope === scope ? "soft-btn active" : "soft-btn"}
              onClick={() => setActiveMetricScope(scope)}
            >
              {METRIC_SCOPE_LABELS[scope]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function isMetricVisible(metricId: ConfigurableMetricId): boolean {
    return visibleMetricIds.has(metricId);
  }

  function renderWorkspaceAccessPanel(variant: "compact" | "full" = "full"): JSX.Element {
    return (
      <section className={`table-panel workspace-recent-panel metrics-workspace-panel ${variant}`}>
        <div>
          <div className="table-title small-title">Workspace</div>
          <div className="table-subtitle">
            {workspaceHandle
              ? `Current workspace: ${workspaceHandle.name}`
              : "Choose a workspace to load teams, views and save metric setup."}
          </div>
        </div>
        <div className="metrics-workspace-actions">
          <button className="soft-btn" onClick={handlePickWorkspace} disabled={busy || !fsApiSupported}>
            {workspaceHandle ? "Switch Workspace" : "Choose Workspace"}
          </button>
          {workspaceHandle && (
            <button className="soft-btn" onClick={() => setShowAddTeamModal(true)}>
              + Add Team
            </button>
          )}
        </div>
        {rememberedWorkspaces.length > 0 && (
          <div className="workspace-recent-list">
            {rememberedWorkspaces.map((workspace) => (
              <article
                key={`metrics-recent-${workspace.id}`}
                className={`workspace-recent-item ${
                  workspaceHandle?.name === workspace.name ? "active" : ""
                }`}
              >
                <div>
                  <strong>{workspace.name}</strong>
                  <div className="card-meta">Last used: {formatDateText(workspace.lastUsedAt)}</div>
                </div>
                <button
                  className="soft-btn"
                  disabled={busy}
                  onClick={() => void handleOpenRememberedWorkspace(workspace.id)}
                >
                  Open
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderWorkspaceViewsPanel(): JSX.Element | null {
    if (!workspaceHandle) {
      return null;
    }

    return (
      <section className="table-panel workspace-profile-panel metrics-views-panel">
        <div className="table-title small-title">Workspace Views</div>
        <div className="table-subtitle">
          Configure the team set that dashboard and metric setup are working against.
        </div>

        <div className="workspace-profile-list">
          <button
            type="button"
            className={`soft-btn workspace-profile-chip ${
              activeWorkspaceProfileId === ALL_TEAMS_PROFILE_ID ? "active" : ""
            }`}
            onClick={() => void handleSelectWorkspaceProfile(ALL_TEAMS_PROFILE_ID)}
          >
            All Teams ({teams.length})
          </button>
          {workspaceProfiles.map((profile) => (
            <button
              key={`metrics-profile-${profile.id}`}
              type="button"
              className={`soft-btn workspace-profile-chip ${
                activeWorkspaceProfileId === profile.id ? "active" : ""
              }`}
              onClick={() => void handleSelectWorkspaceProfile(profile.id)}
            >
              {profile.name} ({profile.teamIds.length})
            </button>
          ))}
        </div>

        <div className="workspace-profile-actions">
          <input
            value={workspaceProfileNameDraft}
            onChange={(event) => setWorkspaceProfileNameDraft(event.target.value)}
            placeholder="New view name, e.g. Payments ART"
          />
          <button
            type="button"
            className="soft-btn"
            disabled={busy || workspaceProfileNameDraft.trim().length === 0}
            onClick={() => void handleCreateWorkspaceProfile()}
          >
            + Add View
          </button>
          {activeWorkspaceProfile && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDeleteActiveWorkspaceProfile()}
            >
              Delete Current View
            </button>
          )}
        </div>

        {activeWorkspaceProfile && (
          <div className="workspace-profile-team-list">
            {teams.map((team) => {
              const included = activeWorkspaceProfile.teamIds.includes(team.teamId);
              return (
                <article key={`metrics-profile-team-${team.teamId}`} className="workspace-profile-team-item">
                  <span>{team.config.teamName}</span>
                  <button
                    type="button"
                    className="soft-btn"
                    onClick={() => void handleToggleTeamInWorkspaceProfile(team.teamId)}
                  >
                    {included ? "Remove" : "Add"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  function renderMetricCard(metric: ConfigurableMetricDefinition, normalizedConfig: WorkspaceMetricConfig): JSX.Element {
    const activeScopeEnabled = new Set(normalizedConfig.scopeVisibility?.[activeMetricScope] ?? []).has(metric.id);

    return (
      <article className={`metric-config-card${activeScopeEnabled ? " active" : ""}`}>
        <div className="metric-config-card-main">
          <div>
            <div className="metric-config-title-row">
              <h3>{metric.label}</h3>
              <span className="metric-source-pill">{metric.source}</span>
            </div>
            <p>{metric.description}</p>
          </div>
          <div className="metric-config-toggle-grid">
            {METRIC_SCOPES.map((scope) => {
              const checked = new Set(normalizedConfig.scopeVisibility?.[scope] ?? []).has(metric.id);
              return (
                <button
                  key={`${metric.id}-${scope}`}
                  type="button"
                  className={`metric-toggle-button${checked ? " active" : ""}`}
                  disabled={!workspaceHandle}
                  onClick={() => void handleToggleWorkspaceMetric(scope, metric.id)}
                >
                  <span>{METRIC_SCOPE_LABELS[scope]}</span>
                  <strong>{checked ? "On" : "Off"}</strong>
                </button>
              );
            })}
          </div>
        </div>
        <div className="metric-config-meta">
          <span>{metric.group}</span>
          <span>{metric.source}</span>
        </div>
      </article>
    );
  }

  function renderMetricsSetupPage(): JSX.Element {
    const normalizedConfig = normalizeWorkspaceMetricConfig(workspaceMetricConfig);
    const activeGroupMetrics = CONFIGURABLE_METRICS.filter((metric) => metric.group === activeMetricGroup);
    const activeScopeVisibleCount = activeGroupMetrics.filter((metric) =>
      new Set(normalizedConfig.scopeVisibility?.[activeMetricScope] ?? []).has(metric.id),
    ).length;

    return (
      <section className="page-section metrics-setup-page">
        <div className="metrics-setup-shell">
          <aside className="metrics-setup-sidebar">
            <div className="metrics-setup-sidebar-head">
              <h1>Metrics Setup</h1>
              <p>Workspace, views and metric packs in one place.</p>
            </div>

            {renderWorkspaceAccessPanel("compact")}
            {renderWorkspaceViewsPanel()}

            <section className="metrics-control-panel">
              <div className="metrics-control-title">Scope</div>
              {renderMetricScopeSelector("metrics-sidebar-scope")}
            </section>

            <section className="metrics-control-panel">
              <div className="metrics-control-title">Metric Packs</div>
              <div className="metrics-pack-grid">
                <button className="soft-btn" disabled={!workspaceHandle} onClick={() => void handleApplyMetricPreset(activeMetricScope, "recommended")}>
                  Recommended
                </button>
                <button className="soft-btn" disabled={!workspaceHandle} onClick={() => void handleApplyMetricPreset(activeMetricScope, "flow")}>
                  Flow Focus
                </button>
                <button className="soft-btn" disabled={!workspaceHandle} onClick={() => void handleApplyMetricPreset(activeMetricScope, "minimal")}>
                  Minimal
                </button>
              </div>
            </section>

            <section className="metrics-setup-summary compact">
              <article>
                <strong>{visibleMetrics.length}</strong>
                <span>Visible in {METRIC_SCOPE_LABELS[activeMetricScope]}</span>
              </article>
              <article>
                <strong>{activeWorkspaceProfile?.name ?? "All Teams"}</strong>
                <span>Dashboard view</span>
              </article>
            </section>
          </aside>

          <div className="metrics-setup-content">
            <div className="metrics-setup-toolbar">
              <div>
                <h2>{activeMetricGroup} Metrics</h2>
                <p>
                  {activeScopeVisibleCount}/{activeGroupMetrics.length} enabled for {METRIC_SCOPE_LABELS[activeMetricScope]}.
                </p>
              </div>
              <div className="metrics-group-tabs" role="tablist" aria-label="Metric groups">
                {METRIC_GROUPS.map((group) => (
                  <button
                    key={group}
                    type="button"
                    className={activeMetricGroup === group ? "active" : ""}
                    onClick={() => setActiveMetricGroup(group)}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>

            {!workspaceHandle && (
              <section className="metrics-empty-callout">
                <strong>Choose a workspace to save changes.</strong>
                <span>You can still review the metric catalogue below.</span>
              </section>
            )}

            {activeMetricGroup === "Quality" && (
              <section className="metric-team-config-panel">
                <div className="metric-team-config-head">
                  <div>
                    <h3>Define Bug Type</h3>
                    <p>Choose which Jira issue types count as bugs for Bug Ratio and quality metrics.</p>
                  </div>
                  <label>
                    Team
                    <select value={selectedTeamId ?? ""} onChange={(event) => setSelectedTeamId(event.target.value || null)}>
                      {filteredTeams.map((team) => (
                        <option key={`bug-config-team-${team.teamId}`} value={team.teamId}>
                          {team.config.teamName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="metric-choice-grid">
                  {bugIssueTypeOptions.length === 0 ? (
                    <p className="muted">Import a CSV first to detect issue types.</p>
                  ) : (
                    bugIssueTypeOptions.map((issueType) => {
                      const selected = bugIssueTypeList.some(
                        (value) => normalizeTextValue(value) === normalizeTextValue(issueType),
                      );
                      return (
                        <button
                          key={`bug-type-${issueType}`}
                          type="button"
                          className={`metric-choice-chip${selected ? " active" : ""}`}
                          onClick={() => handleToggleBugIssueType(issueType)}
                        >
                          {issueType}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="done-chip-input-row">
                  <input
                    value={bugIssueTypeDraft}
                    onChange={(event) => setBugIssueTypeDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddBugIssueType();
                      }
                    }}
                    placeholder="Add issue type manually"
                  />
                  <button type="button" className="soft-btn" onClick={handleAddBugIssueType}>
                    Add
                  </button>
                </div>

                <label className="done-config-inline-field">
                  <span className="done-chip-editor-label">Optional story point fallback for bug items</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={bugDefaultStoryPointsInput}
                    onChange={(event) => setBugDefaultStoryPointsInput(event.target.value)}
                    placeholder="Leave empty unless Scrum needs a bug estimate fallback"
                  />
                </label>

                {bugIssueTypeList.some((value) => {
                  const normalized = normalizeTextValue(value);
                  return normalized === "task" || normalized === "sub-task" || normalized === "subtask";
                }) && (
                  <p className="done-config-warning">
                    `Task` or `Sub-task` in bug types can inflate Bug Ratio heavily.
                  </p>
                )}

                <div className="preset-row">
                  <button type="button" disabled={busy || !selectedTeam} onClick={() => void handleSaveBugMetricConfig()}>
                    Save Bug Type
                  </button>
                  <button type="button" className="soft-btn" onClick={() => setBugIssueTypesInput("Bug")}>
                    Bug only
                  </button>
                </div>
              </section>
            )}

            <div className="metric-config-card-list">
              {activeGroupMetrics.map((metric) => renderMetricCard(metric, normalizedConfig))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderTimeInStatusPanel(contentId: string): JSX.Element {
    if (!isMetricVisible("time-in-status")) {
      return <></>;
    }

    return (
      <section className="table-panel compact time-in-status-panel">
        <div className="bottleneck-head">
          <div>
            <div className="table-title-row">
              <div className="table-title">Time in Status by Status</div>
              {renderMetricInfoButton("queueTimeByStatus")}
            </div>
            <div className="table-subtitle">
              Per-status average time for the selected Time in Status month. Long waiting stages are highlighted.
            </div>
          </div>
        </div>

        <div className="time-in-status-content" id={contentId}>
          <p className="muted bottleneck-collapsed-hint">{selectedTimeInStatusSummary}</p>

          {selectedTimeInStatusPreviewRows.length === 0 ? (
            <p className="muted">No per-status Time in Status rows for this period.</p>
          ) : (
            <>
              <div className="time-status-card-grid">
                {selectedTimeInStatusPreviewRows.map((row, index) => (
                  <div
                    key={`${row.name}:${row.avgDays}:${index}`}
                    className={`time-status-card ${row.tone}${row.highlight ? " key-risk" : ""}`}
                    title={row.signal}
                  >
                    <div className="time-status-card-head">
                      <span className="time-status-name">{row.name}</span>
                      <span className={`time-status-kind ${row.category}`}>{row.categoryLabel}</span>
                    </div>
                    <strong>{formatDays(row.avgDays)}</strong>
                    <small>{row.signal}</small>
                  </div>
                ))}
              </div>

              <div className="table-wrap time-status-table-wrap">
                <table className="metrics-table time-status-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Avg time</th>
                      <th>Type</th>
                      <th>Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTimeInStatusRows.map((row) => (
                      <tr key={`${row.name}:${row.avgDays}`} className={row.tone}>
                        <td>{row.name}</td>
                        <td>{formatDays(row.avgDays)}</td>
                        <td>
                          <span className={`time-status-kind ${row.category}`}>{row.categoryLabel}</span>
                        </td>
                        <td>
                          <span className={`time-status-signal ${row.tone}`}>{row.signal}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    );
  }

  function formatSprintPredictabilitySummary(): string {
    if (!selectedTeamRow) {
      return "No sprint data.";
    }

    const pct = selectedTeamRow.current.multiSprintPct;
    if (pct <= 10) {
      return "Low carry-over signal.";
    }
    if (pct <= 25) {
      return "Some delivered work spans multiple sprints.";
    }
    return "High carry-over signal; review tickets with 2+ sprints.";
  }

  function renderMetricDataIssue(helpKey: MetricHelpKey): JSX.Element | null {
    const issue = selectedTeamMetricDataIssues[helpKey];
    if (!issue) {
      return null;
    }

    return <small className={`metric-data-issue ${issue.tone}`}>Data check: {issue.message}</small>;
  }

  function formatPreviousMetricLine(previousLabel: string | null, previousValue: string): string {
    return previousLabel ? `Previous (${previousLabel}): ${previousValue}` : "Previous comparison: n/a";
  }

  function getPreviousDoneValue(): string {
    if (selectedTeamRow?.previous) {
      return String(selectedTeamRow.previous.done);
    }

    if (previousUploadMetrics?.doneCount !== null && previousUploadMetrics?.doneCount !== undefined) {
      return String(previousUploadMetrics.doneCount);
    }

    return "-";
  }

  function getPreviousAvgCycleTimeValue(): string {
    if (selectedTeamRow?.previous) {
      return formatDays(selectedTeamRow.previous.avgCycleTime);
    }

    return formatDays(previousUploadMetrics?.avgCycleTimeDays ?? null);
  }

  function getPreviousSleValue(percentile: "p50" | "p70" | "p85" | "p95"): string {
    if (selectedTeamRow?.previous) {
      return formatDays(selectedTeamRow.previous.sle[percentile]);
    }

    if (percentile === "p50") {
      return formatDays(previousUploadMetrics?.sleP50Days ?? null);
    }

    if (percentile === "p70") {
      return formatDays(previousUploadMetrics?.sleP70Days ?? null);
    }

    if (percentile === "p85") {
      return formatDays(previousUploadMetrics?.sleP85Days ?? null);
    }

    return formatDays(previousUploadMetrics?.sleP95Days ?? null);
  }

  function getPreviousMultiSprintValue(): string {
    if (selectedTeamRow?.previous) {
      return `${formatPercentValue(selectedTeamRow.previous.multiSprintPct)}%`;
    }

    const value = previousUploadMetrics?.multiSprintPct ?? null;
    return value === null ? "-" : `${formatPercentValue(value)}%`;
  }

  function getPreviousVelocityValue(): string {
    if (!selectedTeam) {
      return "-";
    }

    if (selectedTeamRow?.previous) {
      return formatVelocityValue(selectedTeamRow.previous.velocity, selectedTeam.config.velocityConfig);
    }

    if (previousUploadMetrics?.velocityLatest === null || previousUploadMetrics?.velocityLatest === undefined) {
      return "-";
    }

    return formatVelocityValue(previousUploadMetrics.velocityLatest, selectedTeam.config.velocityConfig);
  }

  function renderDetailedMetricCell(
    value: string,
    trendResult: TrendResult,
    previousValue: string,
  ): JSX.Element {
    return (
      <div className="detailed-metric-cell">
        {renderMetricWithTrend(value, trendResult)}
        <small className="detailed-metric-previous">
          {formatPreviousMetricLine(previousMetricLabel, previousValue)}
        </small>
      </div>
    );
  }

  function renderDetailedMetricsTable(panelClassName?: string): JSX.Element | null {
    if (!selectedTeam || !selectedTeamRow) {
      return null;
    }

    const className = panelClassName ? `table-panel compact ${panelClassName}` : "table-panel compact";
    const columns = [
      {
        id: "stories-done" as ConfigurableMetricId,
        header: "Done",
        cell: renderDetailedMetricCell(String(selectedTeamRow.current.done), selectedTeamRow.trends.done, getPreviousDoneValue()),
      },
      {
        id: "avg-cycle-time" as ConfigurableMetricId,
        header: "Avg Cycle Time",
        cell: renderDetailedMetricCell(
          formatDays(selectedTeamRow.current.avgCycleTime),
          selectedTeamRow.trends.avgCycleTime,
          getPreviousAvgCycleTimeValue(),
        ),
      },
      {
        id: "sle-p85" as ConfigurableMetricId,
        header: "SLE P50",
        cell: renderDetailedMetricCell(
          formatDays(selectedTeamRow.current.sle.p50),
          selectedTeamRow.trends.sleP50,
          getPreviousSleValue("p50"),
        ),
      },
      {
        id: "sle-p85" as ConfigurableMetricId,
        header: "SLE P70",
        cell: renderDetailedMetricCell(
          formatDays(selectedTeamRow.current.sle.p70),
          selectedTeamRow.trends.sleP70,
          getPreviousSleValue("p70"),
        ),
      },
      {
        id: "sle-p85" as ConfigurableMetricId,
        header: "SLE P85",
        cell: renderDetailedMetricCell(
          formatDays(selectedTeamRow.current.sle.p85),
          selectedTeamRow.trends.sleP85,
          getPreviousSleValue("p85"),
        ),
      },
      {
        id: "sle-p85" as ConfigurableMetricId,
        header: "SLE P95",
        cell: renderDetailedMetricCell(
          formatDays(selectedTeamRow.current.sle.p95),
          selectedTeamRow.trends.sleP95,
          getPreviousSleValue("p95"),
        ),
      },
      {
        id: "sprint-predictability" as ConfigurableMetricId,
        header: "2+ Sprint %",
        cell: renderDetailedMetricCell(
          `${formatPercentValue(selectedTeamRow.current.multiSprintPct)}%`,
          selectedTeamRow.trends.multiSprintPct,
          getPreviousMultiSprintValue(),
        ),
      },
      {
        id: "velocity" as ConfigurableMetricId,
        header: `Velocity (${selectedVelocityUnit})`,
        cell: renderDetailedMetricCell(
          formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig),
          selectedTeamRow.trends.velocity,
          getPreviousVelocityValue(),
        ),
      },
    ].filter((column) => isMetricVisible(column.id));

    if (!isMetricVisible("detailed-table") || columns.length === 0) {
      return null;
    }

    return (
      <section className={className}>
        <div className="table-wrap">
          <table className="metrics-table">
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th key={`${column.header}-${index}`}>{column.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {columns.map((column, index) => (
                  <td key={`${column.header}-${index}`}>{column.cell}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderDataMonitorPanel(panelClassName?: string): JSX.Element | null {
    if (!selectedTeam || !isMetricVisible("data-monitor")) {
      return null;
    }

    const className = panelClassName ? `table-panel compact ${panelClassName}` : "table-panel compact";

    return (
      <section className={className}>
        <div className="table-title-row">
          <div className="table-title small-title">Data Monitor</div>
          {renderMetricInfoButton("dataMonitor")}
        </div>
        {selectedTeamDataMonitorEntries.length === 0 ? (
          <p className="muted">No missing-data or source-field issues detected for this team.</p>
        ) : (
          <div className="data-monitor-list">
            {selectedTeamDataMonitorEntries.map((entry) => (
              <article key={entry.id} className={`data-monitor-entry ${entry.tone}`}>
                <div className="data-monitor-entry-head">
                  <strong>{entry.title}</strong>
                  <span className={`health-pill ${entry.tone}`}>
                    {entry.tone === "bad" ? "Action" : entry.tone === "warn" ? "Watch" : "Info"}
                  </span>
                </div>
                <p>{entry.message}</p>
                {entry.sampleIssueKeys.length > 0 ? (
                  <small>Examples: {entry.sampleIssueKeys.join(", ")}</small>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderWipRiskHeatmapPanel(panelClassName?: string): JSX.Element | null {
    if (!isMetricVisible("wip-heatmap")) {
      return null;
    }

    const className = panelClassName ? `table-panel compact ${panelClassName}` : "table-panel compact";

    return (
      <section className={className}>
        <div className="table-title-row">
          <div className="table-title small-title">WIP Risk Heatmap by Status</div>
          {renderMetricInfoButton("wipRiskHeatmap")}
        </div>
        {selectedTeamHealth.wipRiskHeatmap.rows.length === 0 ? (
          <p className="muted">No open WIP issues.</p>
        ) : (
          <div className="table-wrap">
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Total</th>
                  <th>0-30 days</th>
                  <th>31-60 days</th>
                  <th>61-90 days</th>
                  <th>91+ days</th>
                </tr>
              </thead>
              <tbody>
                {selectedTeamHealth.wipRiskHeatmap.rows.map((row) => (
                  <tr key={`wip-heatmap-${row.status}`}>
                    <td>{row.status}</td>
                    <td>{row.total}</td>
                    <td>{row.age0To30}</td>
                    <td>{row.age31To60}</td>
                    <td>{row.age61To90}</td>
                    <td>{row.age91Plus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  function renderFlowBalanceCard(): JSX.Element | null {
    if (!isMetricVisible("flow-balance")) {
      return null;
    }

    return (
      <article className="team-kpi-card flow-signal-card flow-balance-card">
        <div className="flow-balance-block">
          {renderMetricLabel(
            "Created vs Delivered",
            "intakeVsThroughput",
            selectedTeamHealthSignals.intakeVsThroughput,
          )}
          <strong>
            {selectedTeamHealth.intakeThroughput.intakeThisMonth} / {selectedTeamHealth.intakeThroughput.throughputThisMonth}
          </strong>
          <small>
            {selectedTeamThroughputAnchorLabel} Created/Delivered • Rolling 30d {selectedTeamHealth.intakeThroughput.intakeLast30Days}/
            {selectedTeamHealth.intakeThroughput.throughputLast30Days}
          </small>
        </div>
        <div className="flow-balance-divider" aria-hidden="true" />
        <div className="flow-balance-block">
          {renderMetricLabel("Backlog Flow", "netFlow", selectedTeamHealthSignals.netFlow)}
          <strong>{formatSignedNumber(selectedTeamHealth.netFlow.thisMonth)}</strong>
          <small>
            {selectedTeamThroughputAnchorLabel} (Created - Delivered) • Rolling 30d {formatSignedNumber(selectedTeamHealth.netFlow.last30Days)}
          </small>
        </div>
      </article>
    );
  }

  function renderThroughputSummaryCard(): JSX.Element | null {
    if (!isMetricVisible("throughput")) {
      return null;
    }

    return (
      <article className="team-kpi-card throughput-summary-card">
        <div className="throughput-summary-block">
          {renderMetricLabel("Throughput (This / Last month)", "throughputThisMonth")}
          <strong>
            {selectedTeamHealth.throughput.thisMonth} / {selectedTeamHealth.throughput.lastMonth}
          </strong>
          <small>
            {selectedTeamThroughputAnchorLabel} / {selectedTeamThroughputComparisonLabel} • Done by delivery date
          </small>
        </div>
        <div className="throughput-summary-divider" aria-hidden="true" />
        <div className="throughput-summary-block">
          {renderMetricLabel("Throughput (Last 30 days)", "throughputLast30Days")}
          <strong>{selectedTeamHealth.throughput.last30Days}</strong>
          <small>Rolling 30d to {selectedTeamThroughputAnchorLabel}</small>
        </div>
      </article>
    );
  }

  function renderSprintWorkSummaryCard(): JSX.Element | null {
    if (!isMetricVisible("sprint-work")) {
      return null;
    }

    return (
      <article className="team-kpi-card sprint-work-summary-card">
        <div className="sprint-work-summary-block">
          {renderMetricLabel("Delivered In Sprint %", "deliveredOutsideSprint")}
          <strong>
            {selectedTeamHealth.sprintWork.deliveredInSprintPct === null
              ? "-"
              : `${formatPercentValue(selectedTeamHealth.sprintWork.deliveredInSprintPct)}%`}
          </strong>
          <small>
            {selectedTeamHealth.sprintWork.doneTotal === 0
              ? "No delivered tickets in selected period."
              : `${selectedTeamHealth.sprintWork.deliveredInSprintCount}/${selectedTeamHealth.sprintWork.doneTotal} done ticket(s) have sprint assignment.`}
          </small>
        </div>
        <div className="sprint-work-summary-divider" aria-hidden="true" />
        <div className="sprint-work-summary-block">
          {renderMetricLabel(
            "Delivered Outside Sprint %",
            "deliveredOutsideSprint",
            selectedTeamHealthSignals.deliveredOutsideSprint,
          )}
          <strong>
            {selectedTeamHealth.sprintWork.deliveredOutsideSprintPct === null
              ? "-"
              : `${formatPercentValue(selectedTeamHealth.sprintWork.deliveredOutsideSprintPct)}%`}
          </strong>
          <small>
            {selectedTeamHealth.sprintWork.doneTotal === 0
              ? "No delivered tickets in selected period."
              : `${selectedTeamHealth.sprintWork.deliveredOutsideSprintCount}/${selectedTeamHealth.sprintWork.doneTotal} done ticket(s) have no sprint assignment.`}
          </small>
        </div>
      </article>
    );
  }

  function renderHealthCheckCompactCard(keyPrefix: string): JSX.Element | null {
    if (!isMetricVisible("health-check")) {
      return null;
    }

    const firstAction = selectedTeamHealthCheck.topActions[0] ?? null;
    const criticalActions = selectedTeamHealthCheck.criticalActions;
    const scoredCount = Math.max(0, selectedTeamHealthCheck.totalMetrics - selectedTeamHealthCheck.neutralCount);
    const healthyPct = scoredCount === 0 ? null : Math.round((selectedTeamHealthCheck.healthyCount / scoredCount) * 100);
    const headlineTone: HealthTone =
      selectedTeamHealthCheck.actionCount > 0
        ? "bad"
        : selectedTeamHealthCheck.watchCount > 0
          ? "warn"
          : selectedTeamHealthCheck.healthyCount > 0
            ? "good"
            : "neutral";
    const headline =
      selectedTeamHealthCheck.actionCount > 0
        ? `${selectedTeamHealthCheck.actionCount} Action`
        : selectedTeamHealthCheck.watchCount > 0
          ? `${selectedTeamHealthCheck.watchCount} Watch`
          : healthyPct === null
            ? "N/A"
            : `${healthyPct}% Healthy`;
    const actionsToggleId = `${keyPrefix}-health-check-expanded-row`;
    const canExpandActions = criticalActions.length > 0;

    return (
      <article className="team-kpi-card health-check-compact-card">
        {renderMetricLabel("Health Check", "healthCheckSummary")}
        <strong className={`health-check-main-value ${headlineTone}`}>{headline}</strong>
        <small className="health-check-compact-breakdown">
          Healthy {selectedTeamHealthCheck.healthyCount} • Watch {selectedTeamHealthCheck.watchCount} • Action{" "}
          {selectedTeamHealthCheck.actionCount}
          {selectedTeamHealthCheck.neutralCount > 0 ? ` • N/A ${selectedTeamHealthCheck.neutralCount}` : ""}
        </small>
        {firstAction ? (
          <div className="health-check-compact-actions-box">
            <div className="health-check-compact-actions-head">
              <small className="health-check-compact-action" key={`${keyPrefix}-health-action-${firstAction.key}`}>
                <span className="health-check-compact-action-label">First focus:</span> {firstAction.label}
              </small>
              {canExpandActions ? (
                <button
                  type="button"
                  className="panel-toggle health-check-actions-toggle"
                  aria-expanded={healthCheckActionsOpen}
                  aria-controls={actionsToggleId}
                  title={healthCheckActionsOpen ? "Hide all actions" : "Show all actions"}
                  onClick={() => setHealthCheckActionsOpen((current) => !current)}
                >
                  <span
                    aria-hidden="true"
                    className={`panel-toggle-arrow ${healthCheckActionsOpen ? "open" : "closed"}`}
                  >
                    ▾
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <small className="health-check-compact-action">
            <span className="health-check-compact-action-label">First focus:</span> No immediate actions.
          </small>
        )}
        {canExpandActions && healthCheckActionsOpen ? (
          <div className="health-check-inline-actions" id={actionsToggleId}>
            <div className="health-check-expanded-list">
              {criticalActions.map((item) => (
                <article key={`${keyPrefix}-expanded-action-${item.key}`} className="health-check-expanded-item">
                  <h4>{item.label}</h4>
                  <p>{item.recommendation}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </article>
    );
  }

  async function applyWorkspaceHandle(handle: FileSystemDirectoryHandle): Promise<TeamRuntime[]> {
    const [loadedTeams, config] = await Promise.all([
      listTeams(handle),
      loadWorkspaceConfig(handle),
    ]);

    setWorkspaceHandle(handle);
    setTeams(loadedTeams);
    setWorkspaceProfiles(config.profiles ?? []);
    setWorkspaceMetricConfig(normalizeWorkspaceMetricConfig(config.metricConfig));
    setActiveWorkspaceProfileId(config.activeProfileId ?? ALL_TEAMS_PROFILE_ID);
    return loadedTeams;
  }

  async function persistWorkspaceProfiles(
    profiles: WorkspaceProfileConfig[],
    nextActiveProfileId: string,
  ): Promise<void> {
    if (!workspaceHandle) {
      return;
    }

    const config: WorkspaceConfig = {
      version: 1,
      name: workspaceHandle.name,
      profiles,
      activeProfileId:
        nextActiveProfileId === ALL_TEAMS_PROFILE_ID ? undefined : nextActiveProfileId,
      metricConfig: workspaceMetricConfig,
    };

    await saveWorkspaceConfig(workspaceHandle, config);
    setWorkspaceProfiles(profiles);
    setActiveWorkspaceProfileId(nextActiveProfileId);
  }

  async function persistWorkspaceMetricConfig(nextConfig: WorkspaceMetricConfig): Promise<void> {
    if (!workspaceHandle) {
      return;
    }

    const normalized = normalizeWorkspaceMetricConfig(nextConfig);
    const config: WorkspaceConfig = {
      version: 1,
      name: workspaceHandle.name,
      profiles: workspaceProfiles,
      activeProfileId:
        activeWorkspaceProfileId === ALL_TEAMS_PROFILE_ID ? undefined : activeWorkspaceProfileId,
      metricConfig: normalized,
    };

    await saveWorkspaceConfig(workspaceHandle, config);
    setWorkspaceMetricConfig(normalized);
  }

  async function refreshRememberedWorkspaces(): Promise<void> {
    if (!fsApiSupported) {
      setRememberedWorkspaces([]);
      return;
    }

    try {
      const list = await listRememberedWorkspaces();
      setRememberedWorkspaces(list);
    } catch {
      setRememberedWorkspaces([]);
    }
  }

  async function refreshTeams(): Promise<TeamRuntime[]> {
    if (!workspaceHandle) {
      return [];
    }

    const loadedTeams = await listTeams(workspaceHandle);
    setTeams(loadedTeams);
    return loadedTeams;
  }

  async function handlePickWorkspace(): Promise<void> {
    if (!fsApiSupported) {
      setStatus("File System Access API is not available in this browser.");
      return;
    }

    setBusy(true);
    try {
      const handle = await pickWorkspaceDirectory();
      await rememberWorkspaceDirectory(handle);
      await refreshRememberedWorkspaces();

      const loadedTeams = await applyWorkspaceHandle(handle);
      setPage(loadedTeams.length > 0 ? "dashboard" : "workspace");
      setStatus(`Workspace loaded: ${handle.name}. Found ${loadedTeams.length} teams.`);
    } catch (error) {
      setStatus(`Failed to open workspace: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenRememberedWorkspace(workspaceId: string): Promise<void> {
    if (!fsApiSupported) {
      setStatus("File System Access API is not available in this browser.");
      return;
    }

    setBusy(true);
    try {
      const handle = await openRememberedWorkspaceById(workspaceId);
      if (!handle) {
        setStatus("Workspace permission was not granted. Choose workspace manually.");
        return;
      }

      const loadedTeams = await applyWorkspaceHandle(handle);
      setPage(loadedTeams.length > 0 ? "dashboard" : "workspace");
      setStatus(`Workspace loaded: ${handle.name}. Found ${loadedTeams.length} teams.`);
      await refreshRememberedWorkspaces();
    } catch (error) {
      setStatus(`Failed to open remembered workspace: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectWorkspaceProfile(profileId: string): Promise<void> {
    if (!workspaceHandle) {
      return;
    }

    const nextId = profileId || ALL_TEAMS_PROFILE_ID;

    try {
      await persistWorkspaceProfiles(workspaceProfiles, nextId);
    } catch (error) {
      setStatus(`Failed to switch workspace view: ${getErrorMessage(error)}`);
    }
  }

  async function handleCreateWorkspaceProfile(): Promise<void> {
    if (!workspaceHandle) {
      setStatus("Choose workspace first.");
      return;
    }

    const name = workspaceProfileNameDraft.trim();
    if (!name) {
      setStatus("Workspace view name is required.");
      return;
    }

    const baseId = slugifyValue(name);
    const existingIds = new Set(workspaceProfiles.map((profile) => profile.id));
    let nextId = baseId;
    let suffix = 2;
    while (existingIds.has(nextId)) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const profile: WorkspaceProfileConfig = {
      id: nextId,
      name,
      teamIds: [],
    };

    const nextProfiles = [...workspaceProfiles, profile];
    try {
      await persistWorkspaceProfiles(nextProfiles, profile.id);
      setWorkspaceProfileNameDraft("");
      setStatus(`Workspace view "${name}" created.`);
    } catch (error) {
      setStatus(`Failed to create workspace view: ${getErrorMessage(error)}`);
    }
  }

  async function handleDeleteActiveWorkspaceProfile(): Promise<void> {
    if (!workspaceHandle || activeWorkspaceProfileId === ALL_TEAMS_PROFILE_ID) {
      return;
    }

    const current = workspaceProfiles.find((profile) => profile.id === activeWorkspaceProfileId);
    const nextProfiles = workspaceProfiles.filter((profile) => profile.id !== activeWorkspaceProfileId);
    try {
      await persistWorkspaceProfiles(nextProfiles, ALL_TEAMS_PROFILE_ID);
      setStatus(`Workspace view "${current?.name ?? activeWorkspaceProfileId}" deleted.`);
    } catch (error) {
      setStatus(`Failed to delete workspace view: ${getErrorMessage(error)}`);
    }
  }

  async function handleToggleTeamInWorkspaceProfile(teamId: string): Promise<void> {
    if (!workspaceHandle || !activeWorkspaceProfile) {
      return;
    }

    const exists = activeWorkspaceProfile.teamIds.includes(teamId);
    const nextTeamIds = exists
      ? activeWorkspaceProfile.teamIds.filter((id) => id !== teamId)
      : [...activeWorkspaceProfile.teamIds, teamId];

    const nextProfiles = workspaceProfiles.map((profile) =>
      profile.id === activeWorkspaceProfile.id
        ? {
            ...profile,
            teamIds: nextTeamIds,
          }
        : profile,
    );

    try {
      await persistWorkspaceProfiles(nextProfiles, activeWorkspaceProfile.id);
    } catch (error) {
      setStatus(`Failed to update workspace view teams: ${getErrorMessage(error)}`);
    }
  }

  async function handleCreateTeam(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!workspaceHandle) {
      setStatus("Choose workspace first.");
      return;
    }

    const name = newTeamName.trim();
    if (!name) {
      setStatus("Team name is required.");
      return;
    }

    setBusy(true);
    try {
      const createdTeam = await addTeam(workspaceHandle, name, newTeamDescription.trim() || undefined);
      const loadedTeams = await listTeams(workspaceHandle);
      setTeams(loadedTeams);

      if (activeWorkspaceProfile) {
        const alreadyIncluded = activeWorkspaceProfile.teamIds.includes(createdTeam.teamId);
        if (!alreadyIncluded) {
          const nextProfiles = workspaceProfiles.map((profile) =>
            profile.id === activeWorkspaceProfile.id
              ? {
                  ...profile,
                  teamIds: [...profile.teamIds, createdTeam.teamId],
                }
              : profile,
          );
          await persistWorkspaceProfiles(nextProfiles, activeWorkspaceProfile.id);
        }
      }

      setSelectedTeamId(createdTeam.teamId);
      setNewTeamName("");
      setNewTeamDescription("");
      setShowAddTeamModal(false);
      setStatus(`Team "${name}" created.`);
    } catch (error) {
      setStatus(`Failed to create team: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(): Promise<void> {
    if (!importTeamId) {
      setStatus("Select team first.");
      return;
    }

    const team = teams.find((item) => item.teamId === importTeamId);
    if (!team) {
      setStatus("Selected team was not found.");
      return;
    }

    setBusy(true);
    try {
      const files = await pickCsvFiles();
      if (!files || files.length === 0) {
        setStatus("Import canceled.");
        return;
      }

      const bucket = resolveImportBucket(importMode, customImportBucket);
      await importCsvFiles(team, files, bucket);
      await analyzeTeam(team);
      const refreshedTeams = await refreshTeams();
      const refreshedTeam = refreshedTeams.find((item) => item.teamId === team.teamId) ?? null;

      setSelectedTeamId(team.teamId);
      if (!refreshedTeam) {
        setStatus(`Imported ${files.length} CSV file(s). Duplicate issues are merged by latest Updated date.`);
        return;
      }

      const progressSnapshot = buildTeamProgressSnapshot(refreshedTeam, new Date());
      const saveResult = await saveTeamProgressSnapshot(refreshedTeam, progressSnapshot);
      setTeams((current) =>
        current.map((item) =>
          item.teamId === refreshedTeam.teamId
            ? {
                ...item,
                progressHistory: saveResult.history,
              }
            : item,
        ),
      );

      const progressSummary = buildProgressComparisonSummary(saveResult.history);
      const snapshotStatus = saveResult.saved
        ? "Progress snapshot saved."
        : "Progress snapshot unchanged (same data version).";

      setStatus(
        `Imported ${files.length} CSV file(s). Duplicate issues are merged by latest Updated date. ${snapshotStatus} ${buildProgressStatusText(progressSummary)}`,
      );
    } catch (error) {
      setStatus(`Import failed: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleJiraImport(): Promise<void> {
    if (!importTeamId) {
      setStatus("Select team first.");
      return;
    }

    const team = teams.find((item) => item.teamId === importTeamId);
    if (!team) {
      setStatus("Selected team was not found.");
      return;
    }

    const maxIssues = Number.parseInt(jiraImportMaxIssues, 10);
    if (!Number.isFinite(maxIssues) || maxIssues < 1 || maxIssues > 1000) {
      setStatus("Max issues must be between 1 and 1000.");
      return;
    }

    setBusy(true);
    try {
      const result = await exportJiraIssuesToCsv({
        baseUrl: jiraImportUrl,
        username: jiraImportUsername,
        token: jiraImportToken,
        jql: jiraImportJql,
        maxIssues,
      });

      const bucket = resolveImportBucket(importMode, customImportBucket);
      const fileName = `jira-${team.teamId}-${new Date().toISOString().slice(0, 10)}.csv`;
      await importCsvContents(team, [{ name: fileName, text: result.csvText }], bucket);
      await analyzeTeam(team);
      const refreshedTeams = await refreshTeams();
      const refreshedTeam = refreshedTeams.find((item) => item.teamId === team.teamId) ?? null;

      setSelectedTeamId(team.teamId);
      if (refreshedTeam) {
        const progressSnapshot = buildTeamProgressSnapshot(refreshedTeam, new Date());
        const saveResult = await saveTeamProgressSnapshot(refreshedTeam, progressSnapshot);
        setTeams((current) =>
          current.map((item) =>
            item.teamId === refreshedTeam.teamId
              ? {
                  ...item,
                  progressHistory: saveResult.history,
                }
              : item,
          ),
        );
      }

      const cappedText = result.issueCount < result.total ? ` Imported first ${result.issueCount} of ${result.total}.` : "";
      setStatus(`Jira import completed for ${team.config.teamName}: ${result.issueCount} issue(s).${cappedText}`);
    } catch (error) {
      const message = getErrorMessage(error);
      setStatus(
        `Jira import failed: ${message}. If this is a browser CORS error, Jira must allow this local app or we need a small local proxy.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleTestJiraConnection(): Promise<void> {
    setJiraConnectionStatus({ tone: "neutral", message: "Testing Jira connection..." });
    setBusy(true);
    try {
      const result = await testJiraConnection({
        baseUrl: jiraImportUrl,
        username: jiraImportUsername,
        token: jiraImportToken,
      });

      setJiraConnectionStatus({
        tone: "success",
        message: `Connected as ${result.displayName} (${result.accountName}).`,
      });
      setStatus("Jira connection test succeeded.");
    } catch (error) {
      const message = getErrorMessage(error);
      setJiraConnectionStatus({
        tone: "error",
        message,
      });
      setStatus(`Jira connection test failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRecalculateAll(): Promise<void> {
    if (!workspaceHandle) {
      return;
    }

    setBusy(true);
    try {
      const currentTeams = await listTeams(workspaceHandle);
      for (const team of currentTeams) {
        await analyzeTeam(team);
      }

      const refreshed = await listTeams(workspaceHandle);
      const refreshedWithProgress: TeamRuntime[] = [];
      let savedSnapshots = 0;

      for (const team of refreshed) {
        const snapshot = buildTeamProgressSnapshot(team, new Date());
        const saveResult = await saveTeamProgressSnapshot(team, snapshot);
        if (saveResult.saved) {
          savedSnapshots += 1;
        }

        refreshedWithProgress.push({
          ...team,
          progressHistory: saveResult.history,
        });
      }

      setTeams(refreshedWithProgress);
      setSelectedTeamId((current) => {
        if (current && refreshedWithProgress.some((team) => team.teamId === current)) {
          return current;
        }
        return refreshedWithProgress[0]?.teamId ?? null;
      });
      setStatus(
        `Metrics recalculated for ${refreshedWithProgress.length} team(s). Progress snapshots updated for ${savedSnapshots} team(s).`,
      );
    } catch (error) {
      setStatus(`Recalculation failed: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAdvancedConfig(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedTeam || !draftConfig) {
      setStatus("Select team first.");
      return;
    }

    const normalizedVelocity = normalizeVelocityConfig(draftConfig.velocityConfig);
    const workflowVelocityConfig: VelocityConfig =
      normalizedVelocity.mode === "sprint-story-points"
        ? normalizedVelocity
        : { mode: "weekly-ticket-count" };

    setBusy(true);
    try {
      const updatedConfig: TeamConfig = {
        ...draftConfig,
        doneConfig: {
          ...draftConfig.doneConfig,
          doneStatuses: doneStatusesInput
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        },
        cycleTimeConfig: {
          endDateSource: "resolvedOrUpdated",
        },
        sleConfig: {
          ...draftConfig.sleConfig,
          issueTypes: normalizeSleIssueTypes(draftConfig.sleConfig.issueTypes),
        },
        velocityConfig: workflowVelocityConfig,
        sprintScopeConfig: {
          statuses: sprintScopeStatusList,
        },
        workflowConfig: {
          backlogStatuses: backlogStatusList,
          activeStatuses: sprintScopeStatusList,
        },
        mapping: {
          ...draftConfig.mapping,
          issueType: normalizeOptionalMappingValue(draftConfig.mapping.issueType) ?? "Issue Type",
          storyPoints: normalizeOptionalMappingValue(draftConfig.mapping.storyPoints),
          sprint: normalizeOptionalMappingValue(draftConfig.mapping.sprint),
        },
      };

      const updatedTeam: TeamRuntime = {
        ...selectedTeam,
        config: updatedConfig,
      };

      await saveTeamConfig(updatedTeam);
      await analyzeTeam(updatedTeam);
      await refreshTeams();
      setStatus("Team config saved and metrics recalculated.");
    } catch (error) {
      setStatus(`Failed to save config: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveBugMetricConfig(): Promise<void> {
    if (!selectedTeam) {
      setStatus("Select team first.");
      return;
    }

    const normalizedBugDefaultStoryPoints = parseOptionalNonNegativeNumberInput(bugDefaultStoryPointsInput);
    if (bugDefaultStoryPointsInput.trim().length > 0 && normalizedBugDefaultStoryPoints === null) {
      setStatus("Bug default story points must be a non-negative number.");
      return;
    }

    const updatedTeam: TeamRuntime = {
      ...selectedTeam,
      config: {
        ...selectedTeam.config,
        bugConfig: {
          issueTypes: bugIssueTypeList.length > 0 ? bugIssueTypeList : ["Bug"],
          defaultStoryPoints: normalizedBugDefaultStoryPoints ?? undefined,
        },
      },
    };

    setBusy(true);
    try {
      await saveTeamConfig(updatedTeam);
      await analyzeTeam(updatedTeam);
      await refreshTeams();
      setStatus(`Bug type metric config saved for ${selectedTeam.config.teamName}.`);
    } catch (error) {
      setStatus(`Failed to save bug metric config: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function handleSelectSavedQuery(queryId: string): void {
    setQuerySelectionId(queryId);
    const selected = selectedIssueQueryConfig.queries.find((query) => query.id === queryId);
    if (!selected) {
      return;
    }

    setQueryDraftName(selected.name);
    setQueryDraftJql(selected.jql);
    setQueryDraftNote(selected.note ?? "");
  }

  function handleSelectTimeInStatusQuery(queryId: string): void {
    setTimeInStatusQuerySelectionId(queryId);
    const selected = selectedTimeInStatusQueryConfig.queries.find((query) => query.id === queryId);
    if (!selected) {
      return;
    }

    setTimeInStatusQueryDraftName(selected.name);
    setTimeInStatusQueryDraftJql(selected.jql);
    setTimeInStatusQueryDraftNote(selected.note ?? "");
  }

  async function persistImportTeamConfig(nextConfig: TeamConfig, successMessage: string): Promise<void> {
    if (!selectedImportTeam) {
      return;
    }

    setBusy(true);
    try {
      const updatedTeam: TeamRuntime = {
        ...selectedImportTeam,
        config: nextConfig,
      };

      await saveTeamConfig(updatedTeam);
      await refreshTeams();
      setStatus(successMessage);
    } catch (error) {
      setStatus(`Failed to save team query: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveQueryAsNew(): Promise<void> {
    if (!selectedImportTeam) {
      setStatus("Select team first.");
      return;
    }

    const name = queryDraftName.trim();
    const jql = queryDraftJql.trim();

    if (!name || !jql) {
      setStatus("Query name and JQL are required.");
      return;
    }

    const queryId = createUniqueQueryId(name, selectedIssueQueryConfig.queries);
    const nextQuery: JiraSavedQuery = {
      id: queryId,
      name,
      jql,
      note: queryDraftNote.trim() || undefined,
    };

    const nextCollection: JiraQueryCollection = {
      defaultQueryId: selectedIssueQueryConfig.defaultQueryId ?? selectedIssueQueryConfig.queries[0]?.id ?? nextQuery.id,
      queries: [...selectedIssueQueryConfig.queries, nextQuery],
    };
    const nextConfig: TeamConfig = buildTeamConfigWithSavedQueries(
      selectedImportTeam.config,
      selectedTeamJiraQueryConfig,
      "issueQuery",
      nextCollection,
    );

    setQuerySelectionId(queryId);
    await persistImportTeamConfig(nextConfig, `Saved new query "${name}" for ${selectedImportTeam.config.teamName}.`);
  }

  async function handleUpdateSelectedQuery(): Promise<void> {
    if (!selectedImportTeam || !querySelectionId) {
      setStatus("Select an existing team query to update.");
      return;
    }

    const name = queryDraftName.trim();
    const jql = queryDraftJql.trim();

    if (!name || !jql) {
      setStatus("Query name and JQL are required.");
      return;
    }

    const updatedQueries = selectedIssueQueryConfig.queries.map((query) =>
      query.id === querySelectionId
        ? {
            ...query,
            name,
            jql,
            note: queryDraftNote.trim() || undefined,
          }
        : query,
    );

    const nextConfig: TeamConfig = buildTeamConfigWithSavedQueries(
      selectedImportTeam.config,
      selectedTeamJiraQueryConfig,
      "issueQuery",
      {
        defaultQueryId: selectedIssueQueryConfig.defaultQueryId,
        queries: updatedQueries,
      },
    );

    await persistImportTeamConfig(nextConfig, `Updated query "${name}" for ${selectedImportTeam.config.teamName}.`);
  }

  async function handleSetDefaultQuery(): Promise<void> {
    if (!selectedImportTeam || !querySelectionId) {
      setStatus("Select query first.");
      return;
    }

    const selected = selectedIssueQueryConfig.queries.find((query) => query.id === querySelectionId);
    if (!selected) {
      setStatus("Selected query not found.");
      return;
    }

    const nextConfig: TeamConfig = buildTeamConfigWithSavedQueries(
      selectedImportTeam.config,
      selectedTeamJiraQueryConfig,
      "issueQuery",
      {
        defaultQueryId: selected.id,
        queries: selectedIssueQueryConfig.queries,
      },
    );

    await persistImportTeamConfig(nextConfig, `Default query set to "${selected.name}".`);
  }

  async function handleSaveTimeInStatusQueryAsNew(): Promise<void> {
    if (!selectedImportTeam) {
      setStatus("Select team first.");
      return;
    }

    const name = timeInStatusQueryDraftName.trim();
    const jql = timeInStatusQueryDraftJql.trim();

    if (!name || !jql) {
      setStatus("Time in Status query name and JQL are required.");
      return;
    }

    const queryId = createUniqueQueryId(name, selectedTimeInStatusQueryConfig.queries);
    const nextQuery: JiraSavedQuery = {
      id: queryId,
      name,
      jql,
      note: timeInStatusQueryDraftNote.trim() || undefined,
    };

    const nextConfig: TeamConfig = buildTeamConfigWithSavedQueries(
      selectedImportTeam.config,
      selectedTeamJiraQueryConfig,
      "timeInStatusQuery",
      {
        defaultQueryId:
          selectedTimeInStatusQueryConfig.defaultQueryId ??
          selectedTimeInStatusQueryConfig.queries[0]?.id ??
          nextQuery.id,
        queries: [...selectedTimeInStatusQueryConfig.queries, nextQuery],
      },
    );

    setTimeInStatusQuerySelectionId(queryId);
    await persistImportTeamConfig(
      nextConfig,
      `Saved new Time in Status query "${name}" for ${selectedImportTeam.config.teamName}.`,
    );
  }

  async function handleUpdateSelectedTimeInStatusQuery(): Promise<void> {
    if (!selectedImportTeam || !timeInStatusQuerySelectionId) {
      setStatus("Select an existing Time in Status query to update.");
      return;
    }

    const name = timeInStatusQueryDraftName.trim();
    const jql = timeInStatusQueryDraftJql.trim();

    if (!name || !jql) {
      setStatus("Time in Status query name and JQL are required.");
      return;
    }

    const updatedQueries = selectedTimeInStatusQueryConfig.queries.map((query) =>
      query.id === timeInStatusQuerySelectionId
        ? {
            ...query,
            name,
            jql,
            note: timeInStatusQueryDraftNote.trim() || undefined,
          }
        : query,
    );

    const nextConfig: TeamConfig = buildTeamConfigWithSavedQueries(
      selectedImportTeam.config,
      selectedTeamJiraQueryConfig,
      "timeInStatusQuery",
      {
        defaultQueryId: selectedTimeInStatusQueryConfig.defaultQueryId,
        queries: updatedQueries,
      },
    );

    await persistImportTeamConfig(
      nextConfig,
      `Updated Time in Status query "${name}" for ${selectedImportTeam.config.teamName}.`,
    );
  }

  async function handleSetDefaultTimeInStatusQuery(): Promise<void> {
    if (!selectedImportTeam || !timeInStatusQuerySelectionId) {
      setStatus("Select Time in Status query first.");
      return;
    }

    const selected = selectedTimeInStatusQueryConfig.queries.find(
      (query) => query.id === timeInStatusQuerySelectionId,
    );
    if (!selected) {
      setStatus("Selected Time in Status query not found.");
      return;
    }

    const nextConfig: TeamConfig = buildTeamConfigWithSavedQueries(
      selectedImportTeam.config,
      selectedTeamJiraQueryConfig,
      "timeInStatusQuery",
      {
        defaultQueryId: selected.id,
        queries: selectedTimeInStatusQueryConfig.queries,
      },
    );

    await persistImportTeamConfig(
      nextConfig,
      `Default Time in Status query set to "${selected.name}".`,
    );
  }

  function handleCopyIssueQueryToTimeInStatus(): void {
    setTimeInStatusQueryDraftName(queryDraftName ? `${queryDraftName} (Time in Status)` : "Time in Status Query");
    setTimeInStatusQueryDraftJql(queryDraftJql);
    setTimeInStatusQueryDraftNote(
      queryDraftNote ? `${queryDraftNote} Copied from Issues query.` : "Copied from Issues query.",
    );
    setTimeInStatusQueryTimeWindow(queryTimeWindow);
  }

  async function handleSaveBottleneckEntry(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedTeam) {
      setStatus("Select team first.");
      return;
    }

    const period = bottleneckPeriodInput.trim();
    if (!/^\d{4}-\d{2}$/.test(period)) {
      setStatus("Bottleneck period must be YYYY-MM.");
      return;
    }

    const columns = rowsToBottleneckColumns(bottleneckRows);
    if (columns.length === 0) {
      setStatus("Add at least one status row with W / D / H values.");
      return;
    }

    const entry: BottleneckEntry = {
      period,
      columns,
      notes: bottleneckNotesInput.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    const nextEntries = [
      ...selectedTeam.manualBottleneck.filter((item) => item.period !== period),
      entry,
    ].sort((a, b) => a.period.localeCompare(b.period));

    const updatedTeam: TeamRuntime = {
      ...selectedTeam,
      manualBottleneck: nextEntries,
    };

    setBusy(true);
    try {
      await saveTeamBottleneckEntries(updatedTeam, nextEntries);
      await refreshTeams();
      setStatus(`Bottleneck saved for ${selectedTeam.config.teamName} (${period}).`);
    } catch (error) {
      setStatus(`Failed to save bottleneck: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBottleneckEntry(period: string): Promise<void> {
    if (!selectedTeam) {
      return;
    }

    const nextEntries = selectedTeam.manualBottleneck.filter((entry) => entry.period !== period);
    const updatedTeam: TeamRuntime = {
      ...selectedTeam,
      manualBottleneck: nextEntries,
    };

    setBusy(true);
    try {
      await saveTeamBottleneckEntries(updatedTeam, nextEntries);
      await refreshTeams();
      if (bottleneckPeriodInput === period) {
        setBottleneckRows(buildBottleneckRowsFromStatuses(bottleneckFlowStatuses));
        setBottleneckNotesInput("");
      }
      setStatus(`Removed bottleneck entry ${period} for ${selectedTeam.config.teamName}.`);
    } catch (error) {
      setStatus(`Failed to delete bottleneck entry: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function handleAddBottleneckRow(): void {
    setBottleneckRows((current) => [...current, createEmptyBottleneckRow()]);
  }

  function handleRemoveBottleneckRow(rowId: string): void {
    setBottleneckRows((current) => {
      const remaining = current.filter((row) => row.id !== rowId);
      return remaining.length > 0 ? remaining : [createEmptyBottleneckRow()];
    });
  }

  function handleBottleneckRowChange(
    rowId: string,
    field: "name" | "weeks" | "days" | "hours",
    value: string,
  ): void {
    setBottleneckRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) {
          return row;
        }

        if (field === "name") {
          return {
            ...row,
            name: value,
          };
        }

        return {
          ...row,
          [field]: sanitizeDurationInput(value),
        };
      }),
    );
  }

  function handleClearBottleneckDraft(): void {
    setBottleneckRows(buildBottleneckRowsFromStatuses(bottleneckFlowStatuses));
    setBottleneckNotesInput("");
  }

  function handleAddFlowStatus(): void {
    const value = bottleneckFlowDraft.trim();
    if (!value) {
      return;
    }

    setBottleneckFlowStatuses((current) => normalizeFlowStatuses([...current, value]));
    setBottleneckFlowDraft("");
  }

  function handleRemoveFlowStatus(statusName: string): void {
    setBottleneckFlowStatuses((current) => current.filter((item) => item !== statusName));
  }

  function handleApplyFlowToMonth(): void {
    setBottleneckRows(buildBottleneckRowsFromStatuses(bottleneckFlowStatuses));
  }

  async function handleSaveFlowTemplate(): Promise<void> {
    if (!selectedTeam) {
      setStatus("Select team first.");
      return;
    }

    const normalizedStatuses = normalizeFlowStatuses(bottleneckFlowStatuses);
    if (normalizedStatuses.length === 0) {
      setStatus("Add at least one flow status before saving template.");
      return;
    }

    const updatedTeam: TeamRuntime = {
      ...selectedTeam,
      config: {
        ...selectedTeam.config,
        bottleneckConfig: {
          ...(selectedTeam.config.bottleneckConfig ?? {}),
          flowStatuses: normalizedStatuses,
        },
      },
    };

    setBusy(true);
    try {
      await saveTeamConfig(updatedTeam);
      await refreshTeams();
      setStatus("Flow template saved for " + selectedTeam.config.teamName + ".");
    } catch (error) {
      setStatus("Failed to save flow template: " + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveFlowFromRows(): Promise<void> {
    const fromRows = normalizeFlowStatuses(bottleneckRows.map((row) => row.name));
    if (fromRows.length === 0) {
      setStatus("Current month has no status names to save as template.");
      return;
    }

    setBottleneckFlowStatuses(fromRows);

    if (!selectedTeam) {
      return;
    }

    const updatedTeam: TeamRuntime = {
      ...selectedTeam,
      config: {
        ...selectedTeam.config,
        bottleneckConfig: {
          ...(selectedTeam.config.bottleneckConfig ?? {}),
          flowStatuses: fromRows,
        },
      },
    };

    setBusy(true);
    try {
      await saveTeamConfig(updatedTeam);
      await refreshTeams();
      setStatus("Flow template updated from current month rows for " + selectedTeam.config.teamName + ".");
    } catch (error) {
      setStatus("Failed to save flow template from rows: " + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleExcludeIssuesFromMetrics(issueKeys: string[]): Promise<void> {
    if (!selectedTeam) {
      return;
    }

    const normalizedKeys = Array.from(
      new Set(
        issueKeys
          .map((key) => key.trim())
          .filter((key) => key.length > 0),
      ),
    );

    if (normalizedKeys.length === 0) {
      return;
    }

    const existing = new Set(selectedTeam.config.excludedIssueKeys ?? []);
    const newlyAdded = normalizedKeys.filter((key) => !existing.has(key));

    if (newlyAdded.length === 0) {
      setStatus("Selected issues are already excluded for " + selectedTeam.config.teamName + ".");
      return;
    }

    newlyAdded.forEach((key) => existing.add(key));

    const updatedTeam: TeamRuntime = {
      ...selectedTeam,
      config: {
        ...selectedTeam.config,
        excludedIssueKeys: Array.from(existing).sort((a, b) => a.localeCompare(b)),
      },
    };

    setBusy(true);
    try {
      await saveTeamConfig(updatedTeam);
      await analyzeTeam(updatedTeam);
      await refreshTeams();

      if (newlyAdded.length === 1) {
        setStatus("Excluded " + newlyAdded[0] + " from " + selectedTeam.config.teamName + " metrics.");
      } else {
        setStatus(
          "Excluded " +
            newlyAdded.length +
            " issues from " +
            selectedTeam.config.teamName +
            " metrics (>= threshold filter).",
        );
      }
    } catch (error) {
      setStatus(`Failed to exclude issue(s): ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleExcludeIssueFromMetrics(issueKey: string): Promise<void> {
    await handleExcludeIssuesFromMetrics([issueKey]);
  }
  async function handleRestoreExcludedIssue(issueKey: string): Promise<void> {
    if (!selectedTeam) {
      return;
    }

    const remaining = (selectedTeam.config.excludedIssueKeys ?? []).filter((key) => key !== issueKey);

    const updatedTeam: TeamRuntime = {
      ...selectedTeam,
      config: {
        ...selectedTeam.config,
        excludedIssueKeys: remaining,
      },
    };

    setBusy(true);
    try {
      await saveTeamConfig(updatedTeam);
      await analyzeTeam(updatedTeam);
      await refreshTeams();
      setStatus("Restored " + issueKey + " into " + selectedTeam.config.teamName + " metrics.");
    } catch (error) {
      setStatus(`Failed to restore issue: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreAllExcludedIssues(): Promise<void> {
    if (!selectedTeam) {
      return;
    }

    const currentExcluded = selectedTeam.config.excludedIssueKeys ?? [];
    if (currentExcluded.length === 0) {
      setStatus("No excluded anomalies to restore.");
      return;
    }

    const updatedTeam: TeamRuntime = {
      ...selectedTeam,
      config: {
        ...selectedTeam.config,
        excludedIssueKeys: [],
      },
    };

    setBusy(true);
    try {
      await saveTeamConfig(updatedTeam);
      await analyzeTeam(updatedTeam);
      await refreshTeams();
      setStatus("Restored all excluded anomalies for " + selectedTeam.config.teamName + ".");
    } catch (error) {
      setStatus(`Failed to restore anomalies: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }
  function handleToggleSleLine(line: SleLineKey): void {
    setSleLineVisibility((current) => ({
      ...current,
      [line]: !current[line],
    }));
  }

  function handleToggleSleIssueTypeDraft(issueType: string): void {
    const key = normalizeTextValue(issueType);
    if (!key) {
      return;
    }

    setSleIssueTypesDraft((current) => {
      const normalizedCurrent = normalizeSleIssueTypes(current);
      const hasType = normalizedCurrent.some((value) => normalizeTextValue(value) === key);
      const next = hasType
        ? normalizedCurrent.filter((value) => normalizeTextValue(value) !== key)
        : [...normalizedCurrent, issueType.trim()];

      if (next.length === 0) {
        return normalizedCurrent;
      }

      return normalizeSleIssueTypes(next);
    });
  }

  function handleResetSleIssueTypesDraft(): void {
    setSleIssueTypesDraft([...DEFAULT_SLE_ISSUE_TYPES]);
  }

  async function handleApplySleIssueTypes(): Promise<void> {
    if (!selectedTeam) {
      setStatus("Select team first.");
      return;
    }

    const nextTypes = normalizeSleIssueTypes(sleIssueTypesDraft);
    const currentTypes = normalizeSleIssueTypes(selectedTeam.config.sleConfig.issueTypes);

    if (areIssueTypeSelectionsEqual(nextTypes, currentTypes)) {
      setStatus("SLE issue type filter is unchanged.");
      return;
    }

    const updatedTeam: TeamRuntime = {
      ...selectedTeam,
      config: {
        ...selectedTeam.config,
        sleConfig: {
          ...selectedTeam.config.sleConfig,
          issueTypes: nextTypes,
        },
      },
    };

    setBusy(true);
    try {
      await saveTeamConfig(updatedTeam);
      await analyzeTeam(updatedTeam);
      await refreshTeams();
      setStatus(`SLE filter updated for ${selectedTeam.config.teamName}: ${nextTypes.join(", ")}.`);
    } catch (error) {
      setStatus(`Failed to update SLE issue type filter: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function openTeamView(teamId: string): void {
    setSelectedTeamId(teamId);
    setTeamTab("overview");
    setPage("team");
  }

  function handleApplyClassicJiraPreset(): void {
    setDoneStatusesInput("Done, Closed, Resolved");
    setDraftConfig((curr) =>
      curr
        ? {
            ...curr,
            doneConfig: {
              ...curr.doneConfig,
              useStatusCategoryDone: false,
            },
          }
        : curr,
    );
  }

  function handleApplyAcTestPreset(): void {
    setDoneStatusesInput("AC Test");
    setDraftConfig((curr) =>
      curr
        ? {
            ...curr,
            doneConfig: {
              ...curr.doneConfig,
              useStatusCategoryDone: false,
            },
          }
        : curr,
    );
  }

  function handleAddDoneStatus(): void {
    const nextValue = doneStatusDraft.trim();
    if (!nextValue) {
      return;
    }

    const nextList = parseCommaSeparatedList([...doneStatusList, nextValue].join(", "));
    setDoneStatusesInput(nextList.join(", "));
    setDoneStatusDraft("");
  }

  function handleRemoveDoneStatus(value: string): void {
    const normalized = normalizeTextValue(value);
    const nextList = doneStatusList.filter((item) => normalizeTextValue(item) !== normalized);
    setDoneStatusesInput(nextList.join(", "));
  }

  function handleAddBugIssueType(): void {
    const nextValue = bugIssueTypeDraft.trim();
    if (!nextValue) {
      return;
    }

    const nextList = parseCommaSeparatedList([...bugIssueTypeList, nextValue].join(", "));
    setBugIssueTypesInput(nextList.join(", "));
    setBugIssueTypeDraft("");
  }

  function handleRemoveBugIssueType(value: string): void {
    const normalized = normalizeTextValue(value);
    const nextList = bugIssueTypeList.filter((item) => normalizeTextValue(item) !== normalized);
    setBugIssueTypesInput(nextList.join(", "));
  }

  function handleToggleBugIssueType(value: string): void {
    const normalized = normalizeTextValue(value);
    if (!normalized) {
      return;
    }

    const exists = bugIssueTypeList.some((item) => normalizeTextValue(item) === normalized);
    const nextList = exists
      ? bugIssueTypeList.filter((item) => normalizeTextValue(item) !== normalized)
      : [...bugIssueTypeList, value.trim()];

    setBugIssueTypesInput(parseCommaSeparatedList(nextList.join(", ")).join(", "));
  }

  function handleAddSprintScopeStatus(): void {
    const nextValue = sprintScopeStatusDraft.trim();
    if (!nextValue) {
      return;
    }

    const nextList = parseCommaSeparatedList([...sprintScopeStatusList, nextValue].join(", "));
    setSprintScopeStatusesInput(nextList.join(", "));
    setSprintScopeStatusDraft("");
  }

  function handleRemoveSprintScopeStatus(value: string): void {
    const normalized = normalizeTextValue(value);
    const nextList = sprintScopeStatusList.filter((item) => normalizeTextValue(item) !== normalized);
    setSprintScopeStatusesInput(nextList.join(", "));
  }

  function handleAddBacklogStatus(): void {
    const nextValue = backlogStatusDraft.trim();
    if (!nextValue) {
      return;
    }

    const nextList = parseCommaSeparatedList([...backlogStatusList, nextValue].join(", "));
    setBacklogStatusesInput(nextList.join(", "));
    setBacklogStatusDraft("");
  }

  function handleRemoveBacklogStatus(value: string): void {
    const normalized = normalizeTextValue(value);
    const nextList = backlogStatusList.filter((item) => normalizeTextValue(item) !== normalized);
    setBacklogStatusesInput(nextList.join(", "));
  }

  function handleClassifyWorkflowStatus(statusName: string, category: "backlog" | "active" | "done"): void {
    const normalized = normalizeTextValue(statusName);
    const withoutStatus = (values: string[]) => values.filter((item) => normalizeTextValue(item) !== normalized);

    setBacklogStatusesInput((current) => withoutStatus(parseCommaSeparatedList(current)).join(", "));
    setSprintScopeStatusesInput((current) => withoutStatus(parseCommaSeparatedList(current)).join(", "));
    setDoneStatusesInput((current) => withoutStatus(parseCommaSeparatedList(current)).join(", "));

    if (category === "backlog") {
      setBacklogStatusesInput((current) => parseCommaSeparatedList([...parseCommaSeparatedList(current), statusName].join(", ")).join(", "));
    } else if (category === "active") {
      setSprintScopeStatusesInput((current) => parseCommaSeparatedList([...parseCommaSeparatedList(current), statusName].join(", ")).join(", "));
    } else {
      setDoneStatusesInput((current) => parseCommaSeparatedList([...parseCommaSeparatedList(current), statusName].join(", ")).join(", "));
    }
  }

  function handleResetSprintScopeStatuses(): void {
    const autoDetected = selectedTeam ? resolveSprintScopeStatuses({ ...selectedTeam.config, sprintScopeConfig: { statuses: [] } }, selectedTeam.parsedIssues) : [];
    setSprintScopeStatusesInput(autoDetected.join(", "));
    setSprintScopeStatusDraft("");
  }

  async function handleToggleWorkspaceMetric(scope: MetricScope, metricId: ConfigurableMetricId): Promise<void> {
    const normalized = normalizeWorkspaceMetricConfig(workspaceMetricConfig);
    const current = new Set(normalized.scopeVisibility?.[scope] ?? []);
    if (current.has(metricId)) {
      current.delete(metricId);
    } else {
      current.add(metricId);
    }

    const nextConfig: WorkspaceMetricConfig = {
      scopeVisibility: {
        ...normalized.scopeVisibility,
        [scope]: Array.from(current),
      },
    };

    try {
      await persistWorkspaceMetricConfig(nextConfig);
      setStatus(`Metric setup saved for ${METRIC_SCOPE_LABELS[scope]}.`);
    } catch (error) {
      setStatus(`Failed to save metric setup: ${getErrorMessage(error)}`);
    }
  }

  async function handleApplyMetricPreset(scope: MetricScope, preset: "recommended" | "flow" | "minimal"): Promise<void> {
    const metricIds = CONFIGURABLE_METRICS.filter((metric) => {
      if (preset === "recommended") {
        return metric.defaultScopes.includes(scope);
      }
      if (preset === "flow") {
        return metric.group === "Flow" || metric.id === "health-check" || metric.id === "data-monitor";
      }
      return ["health-check", "stories-done", "avg-cycle-time", "sle-p85", "wip-age-risk", "data-monitor"].includes(metric.id);
    }).map((metric) => metric.id);

    const normalized = normalizeWorkspaceMetricConfig(workspaceMetricConfig);
    const nextConfig: WorkspaceMetricConfig = {
      scopeVisibility: {
        ...normalized.scopeVisibility,
        [scope]: metricIds,
      },
    };

    try {
      await persistWorkspaceMetricConfig(nextConfig);
      setStatus(`${METRIC_SCOPE_LABELS[scope]} metric preset applied.`);
    } catch (error) {
      setStatus(`Failed to apply metric preset: ${getErrorMessage(error)}`);
    }
  }

  async function handleExportTeamReport(): Promise<void> {
    if (!selectedTeam || !selectedTeamRow) {
      return;
    }

    const headers = ["Metric", "Current", "Previous", "Trend", "Period"];
    const previousPeriodKey = getPreviousPeriodKey(periodMonth, availableMonths);
    const previousHealth =
      previousPeriodKey === null
        ? null
        : computeTeamHealthSnapshot(
            selectedTeam.parsedIssues,
            selectedTeam.config,
            previousPeriodKey,
            todayRef,
            buildEffectiveBottleneckEntries(selectedTeam),
          );
    const scoredHealthCount = Math.max(
      0,
      selectedTeamHealthCheck.totalMetrics - selectedTeamHealthCheck.neutralCount,
    );
    const healthyPct =
      scoredHealthCount === 0
        ? null
        : Math.round((selectedTeamHealthCheck.healthyCount / scoredHealthCount) * 100);
    const healthHeadline =
      selectedTeamHealthCheck.actionCount > 0
        ? `${selectedTeamHealthCheck.actionCount} Action`
        : selectedTeamHealthCheck.watchCount > 0
          ? `${selectedTeamHealthCheck.watchCount} Watch`
          : healthyPct === null
            ? "N/A"
            : `${healthyPct}% Healthy`;
    const metricsRows: Array<[string, string, string, string, string]> = [
      ["Key Metrics Snapshot", "", "", "", periodMonth],
      [
        "Stories Done",
        String(selectedTeamRow.current.done),
        getPreviousDoneValue(),
        selectedTeamRow.trends.done.label,
        periodMonth,
      ],
      [
        "Avg Cycle Time",
        formatDays(selectedTeamRow.current.avgCycleTime),
        getPreviousAvgCycleTimeValue(),
        selectedTeamRow.trends.avgCycleTime.label,
        periodMonth,
      ],
      [
        "SLE P85",
        formatDays(selectedTeamRow.current.sle.p85),
        getPreviousSleValue("p85"),
        selectedTeamRow.trends.sleP85.label,
        periodMonth,
      ],
      [
        "Velocity",
        formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig),
        getPreviousVelocityValue(),
        selectedTeamRow.trends.velocity.label,
        periodMonth,
      ],
      [
        "Health Check",
        healthHeadline,
        "-",
        selectedTeamHealthCheck.summary,
        periodMonth,
      ],
      [
        `Throughput (${formatPeriodLabel(selectedTeamHealth.throughput.anchorMonth, periodReferenceDate)} / ${formatPeriodLabel(selectedTeamHealth.throughput.comparisonMonth, periodReferenceDate)})`,
        `${selectedTeamHealth.throughput.thisMonth} / ${selectedTeamHealth.throughput.lastMonth}`,
        previousHealth
          ? `${previousHealth.throughput.thisMonth} / ${previousHealth.throughput.lastMonth}`
          : "-",
        previousHealth
          ? `Done by delivery date. Previous column anchor: ${formatPeriodLabel(previousHealth.throughput.anchorMonth, periodReferenceDate)} / ${formatPeriodLabel(previousHealth.throughput.comparisonMonth, periodReferenceDate)}`
          : "Done by delivery date",
        periodMonth,
      ],
      [
        `Throughput (Rolling 30d to ${formatPeriodLabel(selectedTeamHealth.throughput.anchorMonth, periodReferenceDate)})`,
        String(selectedTeamHealth.throughput.last30Days),
        previousHealth ? String(previousHealth.throughput.last30Days) : "-",
        previousHealth
          ? `Previous column rolls to ${formatPeriodLabel(previousHealth.throughput.anchorMonth, periodReferenceDate)}`
          : "Rolling window",
        periodMonth,
      ],
      [
        "Done Bug Ratio",
        selectedTeamHealth.bugRatio.doneBugRatio === null
          ? "-"
          : `${formatPercentValue(selectedTeamHealth.bugRatio.doneBugRatio)}% (${selectedTeamHealth.bugRatio.doneBugCount}/${selectedTeamHealth.bugRatio.doneTotal})`,
        previousHealth && previousHealth.bugRatio.doneBugRatio !== null
          ? `${formatPercentValue(previousHealth.bugRatio.doneBugRatio)}% (${previousHealth.bugRatio.doneBugCount}/${previousHealth.bugRatio.doneTotal})`
          : "-",
        selectedTeamHealthSignals.doneBugRatio.label,
        periodMonth,
      ],
      [
        "WIP Age Risk",
        `${formatPercentValue(selectedTeamHealth.wipRisk.over30Pct)}% >1 month`,
        previousHealth
          ? `${formatPercentValue(previousHealth.wipRisk.over30Pct)}% >1 month`
          : "-",
        selectedTeamHealthSignals.wipAgeRisk.label,
        periodMonth,
      ],
      [
        "Forecast (Monte Carlo lite)",
        selectedTeamHealth.forecast.p85Days === null
          ? "-"
          : `P85 ${selectedTeamHealth.forecast.p85Days} days`,
        previousHealth && previousHealth.forecast.p85Days !== null
          ? `P85 ${previousHealth.forecast.p85Days} days`
          : "-",
        selectedTeamHealthSignals.forecast.label,
        periodMonth,
      ],
      [
        "2+ Sprint %",
        `${formatPercentValue(selectedTeamRow.current.multiSprintPct)}%`,
        getPreviousMultiSprintValue(),
        selectedTeamRow.trends.multiSprintPct.label,
        periodMonth,
      ],
      [
        "Delivered In Sprint %",
        selectedTeamHealth.sprintWork.deliveredInSprintPct === null
          ? "-"
          : `${formatPercentValue(selectedTeamHealth.sprintWork.deliveredInSprintPct)}%`,
        previousHealth?.sprintWork.deliveredInSprintPct === null || previousHealth === null
          ? "-"
          : `${formatPercentValue(previousHealth.sprintWork.deliveredInSprintPct)}%`,
        `${selectedTeamHealth.sprintWork.deliveredInSprintCount}/${selectedTeamHealth.sprintWork.doneTotal} done ticket(s) with sprint`,
        periodMonth,
      ],
      [
        "Delivered Outside Sprint %",
        selectedTeamHealth.sprintWork.deliveredOutsideSprintPct === null
          ? "-"
          : `${formatPercentValue(selectedTeamHealth.sprintWork.deliveredOutsideSprintPct)}%`,
        previousHealth?.sprintWork.deliveredOutsideSprintPct === null || previousHealth === null
          ? "-"
          : `${formatPercentValue(previousHealth.sprintWork.deliveredOutsideSprintPct)}%`,
        `${selectedTeamHealth.sprintWork.deliveredOutsideSprintCount}/${selectedTeamHealth.sprintWork.doneTotal} done ticket(s) without sprint`,
        periodMonth,
      ],
      ["Team Metrics", "", "", "", periodMonth],
      [
        "Done",
        String(selectedTeamRow.current.done),
        getPreviousDoneValue(),
        selectedTeamRow.trends.done.label,
        periodMonth,
      ],
      [
        "Avg Cycle Time",
        formatDays(selectedTeamRow.current.avgCycleTime),
        getPreviousAvgCycleTimeValue(),
        selectedTeamRow.trends.avgCycleTime.label,
        periodMonth,
      ],
      [
        "SLE P50",
        formatDays(selectedTeamRow.current.sle.p50),
        getPreviousSleValue("p50"),
        selectedTeamRow.trends.sleP50.label,
        periodMonth,
      ],
      [
        "SLE P70",
        formatDays(selectedTeamRow.current.sle.p70),
        getPreviousSleValue("p70"),
        selectedTeamRow.trends.sleP70.label,
        periodMonth,
      ],
      [
        "SLE P85",
        formatDays(selectedTeamRow.current.sle.p85),
        getPreviousSleValue("p85"),
        selectedTeamRow.trends.sleP85.label,
        periodMonth,
      ],
      [
        "SLE P95",
        formatDays(selectedTeamRow.current.sle.p95),
        getPreviousSleValue("p95"),
        selectedTeamRow.trends.sleP95.label,
        periodMonth,
      ],
      [
        "2+ Sprint %",
        `${formatPercentValue(selectedTeamRow.current.multiSprintPct)}%`,
        getPreviousMultiSprintValue(),
        selectedTeamRow.trends.multiSprintPct.label,
        periodMonth,
      ],
      [
        "Velocity",
        formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig),
        getPreviousVelocityValue(),
        selectedTeamRow.trends.velocity.label,
        periodMonth,
      ],
    ];

    let progressHistory = selectedTeam.progressHistory;
    try {
      progressHistory = await readTeamProgressHistory(selectedTeam);
    } catch {
      progressHistory = selectedTeam.progressHistory;
    }

    const progressSummary = buildProgressComparisonSummary(progressHistory);
    if (progressSummary.hasBaseline && progressSummary.latest && progressSummary.previous) {
      const progressPeriod = `${formatDateText(progressSummary.previous.capturedAt)} -> ${formatDateText(progressSummary.latest.capturedAt)}`;
      metricsRows.push([
        "Upload Progress Summary",
        `Improved ${progressSummary.improvedCount}`,
        `Worsened ${progressSummary.worsenedCount}`,
        `No change ${progressSummary.unchangedCount}`,
        progressPeriod,
      ]);

      progressSummary.rows.forEach((row) => {
        metricsRows.push([
          `Upload Progress • ${row.label}`,
          formatProgressMetricValue(row.current, row.unit),
          formatProgressMetricValue(row.previous, row.unit),
          formatProgressTrendLabel(row.trend),
          progressPeriod,
        ]);
      });
    } else if (progressSummary.latest) {
      metricsRows.push([
        "Upload Progress Summary",
        "Baseline saved",
        "-",
        "Need one more upload to compare",
        formatDateText(progressSummary.latest.capturedAt),
      ]);
    } else {
      metricsRows.push([
        "Upload Progress Summary",
        "No snapshot",
        "-",
        "Import CSV to create baseline",
        periodMonth,
      ]);
    }

    const rows = [["Team", selectedTeam.config.teamName, "", "", ""], ...metricsRows];
    const dashboardTeamMetricsHeaders = [
      "Team",
      "Done",
      "Avg Cycle Time",
      "SLE P85",
      "WIP Age Risk",
      "Bug Ratio",
      "Monte Carlo",
      "2+ Sprint %",
      "Velocity",
      "Bottleneck",
    ];
    const dashboardTeamMetricsRows = dashboardRows.map((row) => [
      row.team.config.teamName,
      formatMetricWithTrendCsv(String(row.current.done), row.trends.done),
      formatMetricWithTrendCsv(formatDays(row.current.avgCycleTime), row.trends.avgCycleTime),
      formatMetricWithTrendCsv(formatDays(row.current.sle.p85), row.trends.sleP85),
      formatMetricWithTrendCsv(
        `${formatPercentValue(row.healthCurrent.wipRisk.over30Pct)}% >1 month`,
        row.healthTrends.wipAgeRisk,
      ),
      formatMetricWithTrendCsv(
        row.healthCurrent.bugRatio.doneBugRatio === null
          ? "-"
          : `${formatPercentValue(row.healthCurrent.bugRatio.doneBugRatio)}%`,
        row.healthTrends.bugRatio,
      ),
      formatMetricWithTrendCsv(
        row.healthCurrent.forecast.p85Days === null ? "-" : `P85 ${row.healthCurrent.forecast.p85Days} days`,
        row.healthTrends.monteCarlo,
      ),
      formatMetricWithTrendCsv(`${formatPercentValue(row.current.multiSprintPct)}%`, row.trends.multiSprintPct),
      formatMetricWithTrendCsv(formatVelocityValue(row.current.velocity, row.team.config.velocityConfig), row.trends.velocity),
      row.bottleneck,
    ]);

    const csvRows: string[][] = [
      ...[headers, ...rows].map((line) => padCsvColumns(line, 10)),
      Array.from({ length: 10 }, () => ""),
      ["Dashboard Team Metrics", "", "", "", "", "", "", "", "", ""],
      [
        "Scope",
        `Current period: ${periodSummary.currentLabel}`,
        periodSummary.comparisonLabel,
        `Bottleneck month: ${formatPeriodLabel(dashboardBottleneckPeriod)}`,
        `Workspace view: ${activeWorkspaceProfile?.name ?? "All Teams"}`,
        "",
        "",
        "",
        "",
        "",
      ],
      dashboardTeamMetricsHeaders,
      ...dashboardTeamMetricsRows,
    ];
    const csv = csvRows.map((line) => line.map(escapeCsv).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `team-report-${selectedTeam.teamId}-${periodMonth}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const dashboardNavActive = page === "dashboard" || page === "team";

  return (
    <div className="figma-shell">
      <aside className="left-nav">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19h16" />
              <path d="M6 16V8" />
              <path d="M12 16V5" />
              <path d="M18 16v-4" />
            </svg>
          </div>
          <div>
            <div className="brand-title">Scrum Master Tool</div>
            <div className="brand-subtitle">Offline Analytics</div>
          </div>
        </div>

        <nav className="nav-links">
          <button className={page === "workspace" ? "nav-link active" : "nav-link"} onClick={() => setPage("workspace")}>
            <span className="nav-icon">⚙</span>
            Workspace Setup
          </button>
          <button className={dashboardNavActive ? "nav-link active" : "nav-link"} onClick={() => setPage("dashboard")}>
            <span className="nav-icon">◫</span>
            Dashboard
          </button>
          <button className={page === "metrics" ? "nav-link active" : "nav-link"} onClick={() => setPage("metrics")}>
            <span className="nav-icon">☷</span>
            Metrics Setup
          </button>
          <button className={page === "import" ? "nav-link active" : "nav-link"} onClick={() => setPage("import")}>
            <span className="nav-icon">⇪</span>
            Import Data
          </button>
        </nav>

        <div className="nav-footer">
          <button className="link-btn" disabled={busy || !fsApiSupported} onClick={handlePickWorkspace}>
            {workspaceHandle ? "Switch Workspace" : "Choose Workspace"}
          </button>
          <div className="nav-version">Version 1.0.0 · Offline Mode</div>
        </div>
      </aside>

      <main className="main-area">
        {status ? <div className="status-toast">{status}</div> : null}

        {!workspaceHandle && page !== "metrics" ? (
          <section className="page-section empty-state">
            <h2>Workspace required</h2>
            <p>Select your root folder to load teams and imports.</p>
            <button disabled={busy || !fsApiSupported} onClick={handlePickWorkspace}>
              Choose Workspace
            </button>
            {rememberedWorkspaces.length > 0 && (
              <section className="table-panel workspace-recent-panel workspace-recent-empty">
                <div className="table-title small-title">Recent Workspaces</div>
                <div className="table-subtitle">Open an already remembered workspace with one click.</div>
                <div className="workspace-recent-list">
                  {rememberedWorkspaces.map((workspace) => (
                    <article key={workspace.id} className="workspace-recent-item">
                      <div>
                        <strong>{workspace.name}</strong>
                        <div className="card-meta">Last used: {formatDateText(workspace.lastUsedAt)}</div>
                      </div>
                      <button
                        className="soft-btn"
                        disabled={busy}
                        onClick={() => void handleOpenRememberedWorkspace(workspace.id)}
                      >
                        Open
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </section>
        ) : (
          <>
            {page === "metrics" && renderMetricsSetupPage()}

            {workspaceHandle && page === "workspace" && (
              <section className="page-section">
                <div className="section-head">
                  <div>
                    <h1>Workspace Setup</h1>
                    <p>Manage your teams and configure workspace settings.</p>
                  </div>
                  <div className="header-actions">
                    <button className="soft-btn" onClick={handlePickWorkspace} disabled={busy}>
                      Choose Workspace
                    </button>
                    <button onClick={() => setShowAddTeamModal(true)}>+ Add Team</button>
                  </div>
                </div>

                <section className="table-panel workspace-recent-panel">
                  <div className="table-title small-title">Recent Workspaces</div>
                  <div className="table-subtitle">
                    Switch between multiple workspaces quickly. Creating/selecting a new workspace does not delete previous ones.
                  </div>
                  {rememberedWorkspaces.length === 0 ? (
                    <div className="muted">No remembered workspaces yet.</div>
                  ) : (
                    <div className="workspace-recent-list">
                      {rememberedWorkspaces.map((workspace) => (
                        <article
                          key={workspace.id}
                          className={`workspace-recent-item ${
                            workspaceHandle.name === workspace.name ? "active" : ""
                          }`}
                        >
                          <div>
                            <strong>{workspace.name}</strong>
                            <div className="card-meta">Last used: {formatDateText(workspace.lastUsedAt)}</div>
                          </div>
                          <button
                            className="soft-btn"
                            disabled={busy}
                            onClick={() => void handleOpenRememberedWorkspace(workspace.id)}
                          >
                            Open
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="table-panel workspace-profile-panel">
                  <div className="table-title small-title">Workspace Views</div>
                  <div className="table-subtitle">
                    Logical views from one Teams folder. Select a view to filter dashboard/import/team pages.
                  </div>

                  <div className="workspace-profile-list">
                    <button
                      type="button"
                      className={`soft-btn workspace-profile-chip ${
                        activeWorkspaceProfileId === ALL_TEAMS_PROFILE_ID ? "active" : ""
                      }`}
                      onClick={() => void handleSelectWorkspaceProfile(ALL_TEAMS_PROFILE_ID)}
                    >
                      All Teams ({teams.length})
                    </button>
                    {workspaceProfiles.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        className={`soft-btn workspace-profile-chip ${
                          activeWorkspaceProfileId === profile.id ? "active" : ""
                        }`}
                        onClick={() => void handleSelectWorkspaceProfile(profile.id)}
                      >
                        {profile.name} ({profile.teamIds.length})
                      </button>
                    ))}
                  </div>

                  <div className="workspace-profile-actions">
                    <input
                      value={workspaceProfileNameDraft}
                      onChange={(event) => setWorkspaceProfileNameDraft(event.target.value)}
                      placeholder="New workspace view name"
                    />
                    <button
                      type="button"
                      className="soft-btn"
                      disabled={busy || workspaceProfileNameDraft.trim().length === 0}
                      onClick={() => void handleCreateWorkspaceProfile()}
                    >
                      + Add View
                    </button>
                    {activeWorkspaceProfile && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDeleteActiveWorkspaceProfile()}
                      >
                        Delete Current View
                      </button>
                    )}
                  </div>

                  {activeWorkspaceProfile && (
                    <div className="workspace-profile-team-list">
                      {teams.map((team) => {
                        const included = activeWorkspaceProfile.teamIds.includes(team.teamId);
                        return (
                          <article key={`profile-team-${team.teamId}`} className="workspace-profile-team-item">
                            <span>{team.config.teamName}</span>
                            <button
                              type="button"
                              className="soft-btn"
                              onClick={() => void handleToggleTeamInWorkspaceProfile(team.teamId)}
                            >
                              {included ? "Remove" : "Add"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <div className="team-cards-grid">
                  {filteredTeams.map((team) => {
                    const latestImport = team.importFiles[0];
                    return (
                      <article
                        key={team.teamId}
                        className={team.teamId === selectedTeamId ? "team-card active" : "team-card"}
                        onClick={() => setSelectedTeamId(team.teamId)}
                      >
                        <button
                          className="team-card-title"
                          onClick={(event) => {
                            event.stopPropagation();
                            openTeamView(team.teamId);
                          }}
                        >
                          {team.config.teamName}
                        </button>
                        <p>{team.config.description || "No description"}</p>
                        <div className="card-meta">Imports: {team.importFiles.length} files</div>
                        <div className="card-meta">
                          Last import: {latestImport ? formatDateText(latestImport.updatedAt) : "-"}
                        </div>
                      </article>
                    );
                  })}
                  {filteredTeams.length === 0 && <div className="muted">No teams in this workspace view yet.</div>}
                </div>

                <div className="cta-card">
                  <div>
                    <h3>Ready to view metrics?</h3>
                    <p>View the multi-team dashboard to compare metrics across all teams.</p>
                  </div>
                  <button onClick={() => setPage("dashboard")} disabled={filteredTeams.length === 0}>
                    Go to Dashboard
                  </button>
                </div>
              </section>
            )}

            {workspaceHandle && page === "dashboard" && (
              <section className="page-section dashboard-page">
                <div className="section-head">
                  <div>
                    <h1>Multi-Team Dashboard</h1>
                    <p>Compare team health metrics and identify trends.</p>
                  </div>
                  <div className="section-tools">
                    {renderPeriodPicker()}
                    {renderMetricScopeSelector()}
                    <button className="soft-btn" disabled={busy || teams.length === 0} onClick={handleRecalculateAll}>
                      Recalculate
                    </button>
                  </div>
                </div>

                <section className="table-panel dashboard-team-picker">
                  <div className="dashboard-team-picker-head">
                    <div>
                      <div className="table-title small-title">Team Focus Selector</div>
                      <div className="table-subtitle">
                        Workspace view: {activeWorkspaceProfile?.name ?? "All Teams"} • Current focus: {selectedTeam?.config.teamName ?? "-"}
                      </div>
                    </div>
                    <div className="dashboard-team-picker-actions">
                      {selectedTeam && selectedTeamRow && (
                        <>
                          <button className="soft-btn" onClick={() => openTeamView(selectedTeam.teamId)}>
                            Open Full Team View
                          </button>
                          <button className="soft-btn" onClick={handleExportTeamReport}>
                            Export Team Report
                          </button>
                        </>
                      )}
                      <button className="soft-btn" onClick={() => setPage("workspace")}>
                        Workspace Setup
                      </button>
                      <button onClick={() => setShowAddTeamModal(true)}>
                        + Add Team
                      </button>
                    </div>
                  </div>

                  <div className="team-cards-grid dashboard-team-cards">
                    {filteredTeams.map((team) => {
                      const latestImport = team.importFiles[0];
                      return (
                        <article
                          key={`dashboard-picker-${team.teamId}`}
                          className={team.teamId === selectedTeamId ? "team-card active" : "team-card"}
                          onClick={() => setSelectedTeamId(team.teamId)}
                        >
                          <button
                            className="team-card-title"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedTeamId(team.teamId);
                            }}
                          >
                            {team.config.teamName}
                          </button>
                          <p>{team.config.description || "No description"}</p>
                          <div className="card-meta">Imports: {team.importFiles.length} files</div>
                          <div className="card-meta">
                            Last import: {latestImport ? formatDateText(latestImport.updatedAt) : "-"}
                          </div>
                        </article>
                      );
                    })}
                    {filteredTeams.length === 0 && <div className="muted">No teams in this workspace view yet.</div>}
                  </div>
                </section>

                <section className="table-panel dashboard-team-metrics">
                  <div className="table-title-row">
                    <div className="table-title">Team Metrics</div>
                    {renderMetricInfoButton("understandingTrends")}
                  </div>
                  <div className="table-subtitle">
                    Current period: {periodSummary.currentLabel} • {periodSummary.comparisonLabel} • Bottleneck month: {formatPeriodLabel(dashboardBottleneckPeriod)}
                  </div>

                  <div className="table-wrap">
                    <table className="metrics-table">
                      <thead>
                        <tr>
                          <th>Team</th>
                          {isMetricVisible("stories-done") && <th>Done</th>}
                          {isMetricVisible("avg-cycle-time") && <th>Avg Cycle Time</th>}
                          {isMetricVisible("sle-p85") && <th>SLE P85</th>}
                          {isMetricVisible("wip-age-risk") && <th>WIP Age Risk</th>}
                          {isMetricVisible("bug-ratio") && <th>Bug Ratio</th>}
                          {isMetricVisible("forecast") && <th>Monte Carlo</th>}
                          {isMetricVisible("sprint-predictability") && <th>2+ Sprint %</th>}
                          {isMetricVisible("velocity") && <th>Velocity</th>}
                          {isMetricVisible("bottleneck") && <th>Bottleneck</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardRows.map((row) => (
                          <tr
                            key={row.team.teamId}
                            className={row.team.teamId === selectedTeamId ? "selected" : ""}
                            onClick={() => setSelectedTeamId(row.team.teamId)}
                          >
                            <td>
                              <button
                                className="team-name-link"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openTeamView(row.team.teamId);
                                }}
                              >
                                {row.team.config.teamName}
                              </button>
                            </td>
                            {isMetricVisible("stories-done") && <td>{renderMetricWithTrend(String(row.current.done), row.trends.done)}</td>}
                            {isMetricVisible("avg-cycle-time") && <td>{renderMetricWithTrend(formatDays(row.current.avgCycleTime), row.trends.avgCycleTime)}</td>}
                            {isMetricVisible("sle-p85") && <td>{renderMetricWithTrend(formatDays(row.current.sle.p85), row.trends.sleP85)}</td>}
                            {isMetricVisible("wip-age-risk") && (
                              <td>
                                {renderMetricWithTrend(
                                  `${formatPercentValue(row.healthCurrent.wipRisk.over30Pct)}% >1 month`,
                                  row.healthTrends.wipAgeRisk,
                                )}
                              </td>
                            )}
                            {isMetricVisible("bug-ratio") && (
                              <td>
                                {renderMetricWithTrend(
                                  row.healthCurrent.bugRatio.doneBugRatio === null
                                    ? "-"
                                    : `${formatPercentValue(row.healthCurrent.bugRatio.doneBugRatio)}%`,
                                  row.healthTrends.bugRatio,
                                )}
                              </td>
                            )}
                            {isMetricVisible("forecast") && (
                              <td>
                                {renderMetricWithTrend(
                                  row.healthCurrent.forecast.p85Days === null
                                    ? "-"
                                    : `P85 ${row.healthCurrent.forecast.p85Days} days`,
                                  row.healthTrends.monteCarlo,
                                )}
                              </td>
                            )}
                            {isMetricVisible("sprint-predictability") && (
                              <td>
                                {renderMetricWithTrend(
                                  `${formatPercentValue(row.current.multiSprintPct)}%`,
                                  row.trends.multiSprintPct,
                                )}
                              </td>
                            )}
                            {isMetricVisible("velocity") && <td>{renderMetricWithTrend(formatVelocityValue(row.current.velocity, row.team.config.velocityConfig), row.trends.velocity)}</td>}
                            {isMetricVisible("bottleneck") && <td>{row.bottleneck}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {selectedTeam && selectedTeamRow ? (
                  <section className="table-panel dashboard-merged-panel">
                    <p className="period-hint dashboard-merged-period">
                      Current period: {periodSummary.currentLabel} • {periodSummary.comparisonLabel}
                    </p>

                    <div className="team-section-head dashboard-merged-detailed-head">
                      <h2 className="team-section-title">Detailed Metrics</h2>
                      <button
                        type="button"
                        className="quick-insights-icon"
                        aria-expanded={quickInsightsOpen}
                        aria-controls="dashboard-quick-insights-popover"
                        title={quickInsightsOpen ? "Hide quick insights" : "Show quick insights"}
                        onClick={() => setQuickInsightsOpen((current) => !current)}
                      >
                        <span aria-hidden="true">i</span>
                      </button>
                    </div>

                    {quickInsightsOpen && (
                      <section className="quick-insights-popover" id="dashboard-quick-insights-popover">
                        <h3>Quick Insights</h3>
                        <ul>
                          <li>
                            <strong>2+ Sprint %:</strong> {formatPercentValue(selectedTeamRow.current.multiSprintPct)}% of stories take more than 2 sprints.
                          </li>
                          <li>
                            <strong>SLE P85:</strong> A work item has about 85% chance to be delivered in {formatDays(selectedTeamRow.current.sle.p85)} or less.
                          </li>
                          <li>
                            <strong>Velocity:</strong> Average {formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig)}.
                          </li>
                        </ul>
                      </section>
                    )}

                    {renderDetailedMetricsTable("dashboard-merged-detailed-table")}
                    {renderDataMonitorPanel("data-monitor-panel")}

                    <section className="overview-top dashboard-merged-overview">
                      <h2 className="team-section-title">Key Metrics</h2>
                      <div className="team-kpi-grid">
                        {renderHealthCheckCompactCard("dashboard")}
                        <article className={`team-kpi-card flow-signal-card${isMetricVisible("wip-age-risk") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel("WIP Age Risk", "wipAgeRisk", selectedTeamHealthSignals.wipAgeRisk)}
                          <strong>
                            {formatPercentValue(selectedTeamHealth.wipRisk.over30Pct)}% of open tickets are older than 1+ Months
                          </strong>
                          <small>
                            &gt;60 days {formatPercentValue(selectedTeamHealth.wipRisk.over60Pct)}% • &gt;90 days{" "}
                            {formatPercentValue(selectedTeamHealth.wipRisk.over90Pct)}% • 31-60 days{" "}
                            {formatPercentValue(Math.max(0, selectedTeamHealth.wipRisk.over30DeltaPpVs30dBaseline))}%
                          </small>
                        </article>
                        <article className={`team-kpi-card flow-signal-card${isMetricVisible("forecast") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel(
                            "Forecast (Monte Carlo lite)",
                            "forecastMonteCarlo",
                            selectedTeamHealthSignals.forecast,
                          )}
                          <strong>
                            {selectedTeamHealth.forecast.p85Days === null
                              ? "-"
                              : `P85 ${selectedTeamHealth.forecast.p85Days} days (~85% chance)`}
                          </strong>
                          <small>
                            {selectedTeamHealth.forecast.p50Days === null
                              ? "Need done throughput history and open backlog."
                              : `Backlog ${selectedTeamHealth.forecast.backlogCount} • P50 ${selectedTeamHealth.forecast.p50Days} days (~50% by ${selectedTeamHealth.forecast.p50DateIso ? formatDateText(selectedTeamHealth.forecast.p50DateIso) : "-"}) • P85 ${selectedTeamHealth.forecast.p85Days} days (~85% by ${selectedTeamHealth.forecast.p85DateIso ? formatDateText(selectedTeamHealth.forecast.p85DateIso) : "-"})`}
                          </small>
                          {renderMetricDataIssue("forecastMonteCarlo")}
                        </article>
                        <article className={`team-kpi-card${isMetricVisible("velocity") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel(`Velocity (${selectedVelocityUnit})`, "velocity")}
                          <strong>{formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig)}</strong>
                          <small>{formatPreviousMetricLine(previousMetricLabel, getPreviousVelocityValue())}</small>
                        </article>
                        <article className={`team-kpi-card${isMetricVisible("stories-done") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel("Stories Done", "storiesDone")}
                          <strong>{selectedTeamRow.current.done}</strong>
                          <small>{formatPreviousMetricLine(previousMetricLabel, getPreviousDoneValue())}</small>
                        </article>
                        <article className={`team-kpi-card${isMetricVisible("avg-cycle-time") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel("Avg Cycle Time", "avgCycleTime")}
                          <strong>{formatDays(selectedTeamRow.current.avgCycleTime)}</strong>
                          <small>{formatPreviousMetricLine(previousMetricLabel, getPreviousAvgCycleTimeValue())}</small>
                        </article>
                        <article className={`team-kpi-card${isMetricVisible("sle-p85") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel("SLE P85", "sleP85")}
                          <strong>{formatDays(selectedTeamRow.current.sle.p85)}</strong>
                          <small>{formatPreviousMetricLine(previousMetricLabel, getPreviousSleValue("p85"))}</small>
                        </article>
                        <article className={`team-kpi-card${isMetricVisible("bug-ratio") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel("Done Bug Ratio", "doneBugRatio", selectedTeamHealthSignals.doneBugRatio)}
                          <strong>
                            {selectedTeamHealth.bugRatio.doneBugRatio === null
                              ? "-"
                              : `${formatPercentValue(selectedTeamHealth.bugRatio.doneBugRatio)}%`}
                          </strong>
                          <small>
                            {selectedTeamHealth.bugRatio.doneBugCount}/{selectedTeamHealth.bugRatio.doneTotal} bugs in done
                          </small>
                          {renderMetricDataIssue("doneBugRatio")}
                        </article>
                      </div>
                      <section className="flow-health-grid">
                        {renderThroughputSummaryCard()}
                        {renderSprintWorkSummaryCard()}
                        <article className={`team-kpi-card flow-signal-card${isMetricVisible("sprint-predictability") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel(
                            "2+ Sprint %",
                            "sprintPredictability",
                          )}
                          <strong>{selectedTeamRow ? `${formatPercentValue(selectedTeamRow.current.multiSprintPct)}%` : "-"}</strong>
                          <small>
                            {formatSprintPredictabilitySummary()}
                          </small>
                        </article>
                      </section>

                      <section className="flow-signals-grid">
                        {renderFlowBalanceCard()}
                        <article className={`team-kpi-card flow-signal-card${isMetricVisible("throughput-stability") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel(
                            "Throughput Stability",
                            "throughputStability",
                            selectedTeamHealthSignals.throughputStability,
                          )}
                          <strong>
                            {selectedTeamHealth.throughputStability.weeklyPredictabilityPct === null
                              ? "-"
                              : `${formatPercentValue(selectedTeamHealth.throughputStability.weeklyPredictabilityPct)}%`}
                          </strong>
                          <small>
                            8-week avg {formatNumber(selectedTeamHealth.throughputStability.weeklyAvg, 1) || "-"} done/wk • 6-month predictability{" "}
                            {selectedTeamHealth.throughputStability.monthlyPredictabilityPct === null
                              ? "-"
                              : `${formatPercentValue(selectedTeamHealth.throughputStability.monthlyPredictabilityPct)}%`}
                          </small>
                          {renderMetricDataIssue("throughputStability")}
                        </article>
                        <article className={`team-kpi-card flow-signal-card${isMetricVisible("lead-time-by-type") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel(
                            "Lead Time by Type",
                            "leadTimeByType",
                            selectedTeamHealthSignals.leadTimeByType,
                          )}
                          <strong>
                            {selectedTeamHealth.leadTimeByType.length === 0 ? "-" : `${selectedTeamHealth.leadTimeByType[0].issueType} ${formatDays(selectedTeamHealth.leadTimeByType[0].avgDays)}`}
                          </strong>
                          <small>
                            {selectedTeamHealth.leadTimeByType.length === 0
                              ? "No completed issues with valid Created + Resolved."
                              : selectedTeamHealth.leadTimeByType
                                  .slice(0, 3)
                                  .map((entry) => `${entry.issueType} ${formatDays(entry.avgDays)} (${entry.doneCount})`)
                                  .join(" • ")}
                          </small>
                          {renderMetricDataIssue("leadTimeByType")}
                        </article>
                      </section>

                      <section className="advanced-flow-grid">
                        <article className={`team-kpi-card flow-signal-card${isMetricVisible("flow-efficiency") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel(
                            "Flow Efficiency",
                            "flowEfficiency",
                            selectedTeamHealthSignals.flowEfficiency,
                          )}
                          <strong>
                            {selectedTeamHealth.flowEfficiency.valuePct === null
                              ? "-"
                              : `${formatPercentValue(selectedTeamHealth.flowEfficiency.valuePct)}%`}
                          </strong>
                          <small>
                            Active {formatDays(selectedTeamHealth.flowEfficiency.activeDays)} • Queue{" "}
                            {formatDays(selectedTeamHealth.flowEfficiency.queueDays)} • Period{" "}
                            {formatPeriodLabel(selectedTeamHealth.flowEfficiency.period)}
                          </small>
                          {renderMetricDataIssue("flowEfficiency")}
                        </article>
                        <article className={`team-kpi-card flow-signal-card${isMetricVisible("queue-time") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel(
                            "Queue Time by Status",
                            "queueTimeByStatus",
                            selectedTeamHealthSignals.queueTimeByStatus,
                          )}
                          <strong>
                            {selectedTeamHealth.queueTime.topStatuses[0]
                              ? `${selectedTeamHealth.queueTime.topStatuses[0].status} ${formatDays(selectedTeamHealth.queueTime.topStatuses[0].avgDays)}`
                              : "-"}
                          </strong>
                          <small>
                            {selectedTeamHealth.queueTime.topStatuses.length === 0
                              ? "No bottleneck status times in selected period."
                              : selectedTeamHealth.queueTime.topStatuses
                                  .map((item) => `${item.status} ${formatDays(item.avgDays)}`)
                                  .join(" • ")}
                          </small>
                          {renderMetricDataIssue("queueTimeByStatus")}
                        </article>
                        <article className={`team-kpi-card flow-signal-card${isMetricVisible("bottleneck-trend") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel(
                            "Bottleneck Trend",
                            "bottleneckTrend",
                            selectedTeamHealthSignals.bottleneckTrend,
                          )}
                          <strong>
                            {selectedTeamHealth.bottleneckTrend.dominantStatus
                              ? selectedTeamHealth.bottleneckTrend.dominantStatus
                              : "-"}
                          </strong>
                          <small>
                            {selectedTeamHealth.bottleneckTrend.monthCount === 0
                              ? "No monthly bottleneck history yet."
                              : `Dominant ${selectedTeamHealth.bottleneckTrend.dominantCount}/${selectedTeamHealth.bottleneckTrend.monthCount} • Longest ${selectedTeamHealth.bottleneckTrend.longestStatus ?? "-"} ${formatDays(selectedTeamHealth.bottleneckTrend.longestAvgDays)} • Switches ${selectedTeamHealth.bottleneckTrend.switchCount}`}
                          </small>
                          {renderMetricDataIssue("bottleneckTrend")}
                        </article>
                      </section>

                      {renderWipRiskHeatmapPanel("wip-heatmap-panel")}
                    </section>

                    <section className="overview-secondary-grid dashboard-merged-secondary">
                      <section className="aging-wip-compact-row">
                        <article className={`team-kpi-card aging-wip-compact-card${isMetricVisible("aging-wip") ? "" : " metric-hidden"}`}>
                          <div className="aging-wip-compact-head">
                            <div className="aging-wip-title-row">
                              <span>Average age of open tickets</span>
                              {renderMetricInfoButton("agingWip")}
                            </div>
                            <button
                              type="button"
                              className="aging-wip-compact-toggle panel-toggle"
                              aria-expanded={agingWipCompactOpen}
                              aria-controls="dashboard-aging-wip-compact-details"
                              title={agingWipCompactOpen ? "Hide Aging details" : "Show Aging details"}
                              onClick={() => setAgingWipCompactOpen((current) => !current)}
                            >
                              <span
                                aria-hidden="true"
                                className={`panel-toggle-arrow ${agingWipCompactOpen ? "open" : "closed"}`}
                              >
                                ▾
                              </span>
                            </button>
                          </div>
                          <strong className="aging-wip-main-value">{formatDays(selectedTeamHealth.agingWip.avgDays)}</strong>
                          <small>
                            WIP total {selectedTeamHealth.agingWip.total} • 1m+ {selectedTeamHealth.agingWip.over30} • &gt;90 days {selectedTeamHealth.agingWip.over90}
                          </small>
                          {!agingWipCompactOpen && (
                            <div className="aging-wip-compact-preview">
                              <div className="aging-wip-preview-title">Top 3 oldest</div>
                              {agingTopThree.length === 0 ? (
                                <div className="muted">No open WIP issues.</div>
                              ) : (
                                <div className="aging-wip-compact-top">
                                  <div className="aging-wip-compact-top-header">
                                    <span>Jira</span>
                                    <span>Status</span>
                                    <span>Age</span>
                                  </div>
                                  {agingTopThree.map((item) => (
                                    <div key={item.issueKey} className="aging-wip-compact-top-item">
                                      <span>{item.issueKey}</span>
                                      <span>{item.status || "-"}</span>
                                      <span>{item.agingDays} days</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {agingWipCompactOpen && (
                            <div className="aging-wip-compact-details" id="dashboard-aging-wip-compact-details">
                              <div>
                                Median {formatDays(selectedTeamHealth.agingWip.medianDays)} • WIP bugs {selectedTeamHealth.bugRatio.wipBugCount} (
                                {selectedTeamHealth.bugRatio.wipBugRatio === null ? "-" : `${formatPercentValue(selectedTeamHealth.bugRatio.wipBugRatio)}%`})
                              </div>
                              <div className="aging-wip-old-total">
                                <div className="aging-wip-old-total-title">Older than 1 month</div>
                                <div>{selectedTeamHealth.agingWip.over30} ticket(s)</div>
                              </div>
                              {agingOlderThanMonthItems.length === 0 ? (
                                <div className="muted">No open WIP issues.</div>
                              ) : (
                                <div className="aging-wip-compact-top aging-wip-compact-list-scroll">
                                  <div className="aging-wip-compact-top-header">
                                    <span>Jira</span>
                                    <span>Status</span>
                                    <span>Age</span>
                                  </div>
                                  {agingOlderThanMonthItems.map((item) => (
                                    <div key={item.issueKey} className="aging-wip-compact-top-item">
                                      <span>{item.issueKey}</span>
                                      <span>{item.status || "-"}</span>
                                      <span>{item.agingDays} days</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      </section>

                      <section className={`table-panel compact bottleneck-panel${isMetricVisible("bottleneck") ? "" : " metric-hidden"}`}>
                        <div className="bottleneck-head">
                          <div>
                            <div className="table-title-row">
                              <div className="table-title">Bottleneck (Time in Status + Manual override)</div>
                              {renderMetricInfoButton("bottleneck")}
                            </div>
                            <div className="table-subtitle">Auto-read monthly status times from Time in Status CSV. Manual rows override same month.</div>
                          </div>
                        </div>

                        <div className="bottleneck-collapsed-content" id="dashboard-bottleneck-content">
                          <p className="muted bottleneck-collapsed-hint">{selectedBottleneckSummary}</p>
                          {selectedBottleneckFlowTimes.length > 0 && (
                            <div className="bottleneck-flow-preview">
                              {selectedBottleneckFlowTimes.map((column, index) => (
                                <div key={`${column.name}:${column.avgDays}:${index}`} className="bottleneck-flow-preview-item">
                                  <span>{column.name}</span>
                                  <strong>{column.avgDays.toFixed(1)} days</strong>
                                </div>
                              ))}
                            </div>
                          )}

                          {bottleneckMonthlyRows.length > 0 && (
                            <div className="bottleneck-monthly">
                              <div className="table-title small-title">Per month (latest 12)</div>
                              <div className="table-wrap bottleneck-monthly-scroll">
                                <table className="metrics-table bottleneck-monthly-table">
                                  <thead>
                                    <tr>
                                      <th>Month</th>
                                      <th>Bottleneck</th>
                                      <th>Created</th>
                                      <th>Done</th>
                                      <th>Source</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {bottleneckMonthlyRows.map((row) => (
                                      <tr key={row.period}>
                                        <td>{row.monthLabel}</td>
                                        <td>{row.bottleneckLabel}</td>
                                        <td>{row.createdCount}</td>
                                        <td>{row.doneCount}</td>
                                        <td>{row.sourceLabel}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          <div className="dashboard-merged-bottleneck-actions">
                            <button className="soft-btn" onClick={() => openTeamView(selectedTeam.teamId)}>
                              Open editor in Full Team View
                            </button>
                          </div>
                        </div>
                      </section>
                      {renderTimeInStatusPanel("dashboard-time-in-status-content")}
                    </section>
                  </section>
                ) : (
                  <section className="table-panel dashboard-merged-empty">
                    <p className="muted">Select a team row to open merged team details below the multi-team view.</p>
                  </section>
                )}
              </section>
            )}

            {workspaceHandle && page === "team" && (
              <section className="page-section team-page">
                {!selectedTeam || !selectedTeamRow ? (
                  <section className="panel-box">
                    <h2>No team selected</h2>
                    <p className="muted">Select a team from Dashboard to open detailed view.</p>
                  </section>
                ) : (
                  <>
                    <div className="section-head team-page-head">
                      <div>
                        <button className="back-link" onClick={() => setPage("dashboard")}>← Back to Dashboard</button>
                        <h1>{selectedTeam.config.teamName}</h1>
                        <p>
                          {selectedTeam.config.description || "No description"} • {selectedTeam.importFiles.length} imports
                        </p>
                      </div>
                      <div className="team-page-tools">
                        <button className="soft-btn" onClick={handleExportTeamReport}>Export Report</button>
                      </div>
                    </div>

                    <div className="team-tabs" role="tablist" aria-label="Team detail tabs">
                      <button
                        className={teamTab === "overview" ? "team-tab active" : "team-tab"}
                        onClick={() => setTeamTab("overview")}
                      >
                        Overview
                      </button>
                      <button
                        className={teamTab === "cycle" ? "team-tab active" : "team-tab"}
                        onClick={() => setTeamTab("cycle")}
                      >
                        Cycle Time Analysis
                      </button>
                    </div>

                    <div className="team-controls-bar">
                      {renderPeriodPicker()}
                      {renderMetricScopeSelector()}

                      {teamTab === "cycle" && (
                        <div className="line-visibility-row">
                          <span>SLE lines:</span>
                          {(["p50", "p70", "p85", "p95"] as SleLineKey[]).map((line) => (
                            <label key={line} className="line-toggle">
                              <input
                                type="checkbox"
                                checked={sleLineVisibility[line]}
                                onChange={() => handleToggleSleLine(line)}
                              />
                              {line.toUpperCase()}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="period-hint">
                      Current period: {periodSummary.currentLabel} • {periodSummary.comparisonLabel}
                    </p>

                    {teamTab === "overview" && (
                      <>
                        <div className="team-section-head">
                          <h2 className="team-section-title">Detailed Metrics</h2>
                          <button
                            type="button"
                            className="quick-insights-icon"
                            aria-expanded={quickInsightsOpen}
                            aria-controls="quick-insights-popover"
                            title={quickInsightsOpen ? "Hide quick insights" : "Show quick insights"}
                            onClick={() => setQuickInsightsOpen((current) => !current)}
                          >
                            <span aria-hidden="true">i</span>
                          </button>
                        </div>
                        {quickInsightsOpen && (
                          <section className="quick-insights-popover" id="quick-insights-popover">
                            <h3>Quick Insights</h3>
                            <ul>
                              <li>
                                <strong>2+ Sprint %:</strong> {formatPercentValue(selectedTeamRow.current.multiSprintPct)}% of stories take more than 2 sprints.
                              </li>
                              <li>
                                <strong>SLE P85:</strong> A work item has about 85% chance to be delivered in {formatDays(selectedTeamRow.current.sle.p85)} or less.
                              </li>
                              <li>
                                <strong>Velocity:</strong> Average {formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig)}.
                              </li>
                            </ul>
                          </section>
                        )}
                        {renderDetailedMetricsTable()}
                        {renderDataMonitorPanel("data-monitor-panel")}

                        <section className="overview-top">
                          <h2 className="team-section-title">Key Metrics</h2>
                          <div className="team-kpi-grid">
                            {renderHealthCheckCompactCard("team")}
                            <article className={`team-kpi-card flow-signal-card${isMetricVisible("wip-age-risk") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel("WIP Age Risk", "wipAgeRisk", selectedTeamHealthSignals.wipAgeRisk)}
                              <strong>
                                {formatPercentValue(selectedTeamHealth.wipRisk.over30Pct)}% of open tickets are older than 1+ Months
                              </strong>
                              <small>
                                &gt;60 days {formatPercentValue(selectedTeamHealth.wipRisk.over60Pct)}% • &gt;90 days{" "}
                                {formatPercentValue(selectedTeamHealth.wipRisk.over90Pct)}% • 31-60 days{" "}
                                {formatPercentValue(Math.max(0, selectedTeamHealth.wipRisk.over30DeltaPpVs30dBaseline))}%
                              </small>
                            </article>
                            <article className={`team-kpi-card flow-signal-card${isMetricVisible("forecast") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(
                                "Forecast (Monte Carlo lite)",
                                "forecastMonteCarlo",
                                selectedTeamHealthSignals.forecast,
                              )}
                              <strong>
                                {selectedTeamHealth.forecast.p85Days === null
                                  ? "-"
                                  : `P85 ${selectedTeamHealth.forecast.p85Days} days (~85% chance)`}
                              </strong>
                              <small>
                                {selectedTeamHealth.forecast.p50Days === null
                                  ? "Need done throughput history and open backlog."
                                  : `Backlog ${selectedTeamHealth.forecast.backlogCount} • P50 ${selectedTeamHealth.forecast.p50Days} days (~50% by ${selectedTeamHealth.forecast.p50DateIso ? formatDateText(selectedTeamHealth.forecast.p50DateIso) : "-"}) • P85 ${selectedTeamHealth.forecast.p85Days} days (~85% by ${selectedTeamHealth.forecast.p85DateIso ? formatDateText(selectedTeamHealth.forecast.p85DateIso) : "-"})`}
                              </small>
                              {renderMetricDataIssue("forecastMonteCarlo")}
                            </article>
                            <article className={`team-kpi-card${isMetricVisible("velocity") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(`Velocity (${selectedVelocityUnit})`, "velocity")}
                              <strong>{formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig)}</strong>
                              <small>{formatPreviousMetricLine(previousMetricLabel, getPreviousVelocityValue())}</small>
                            </article>
                            <article className={`team-kpi-card${isMetricVisible("stories-done") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel("Stories Done", "storiesDone")}
                              <strong>{selectedTeamRow.current.done}</strong>
                              <small>{formatPreviousMetricLine(previousMetricLabel, getPreviousDoneValue())}</small>
                            </article>
                            <article className={`team-kpi-card${isMetricVisible("avg-cycle-time") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel("Avg Cycle Time", "avgCycleTime")}
                              <strong>{formatDays(selectedTeamRow.current.avgCycleTime)}</strong>
                              <small>{formatPreviousMetricLine(previousMetricLabel, getPreviousAvgCycleTimeValue())}</small>
                            </article>
                            <article className={`team-kpi-card${isMetricVisible("sle-p85") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel("SLE P85", "sleP85")}
                              <strong>{formatDays(selectedTeamRow.current.sle.p85)}</strong>
                              <small>{formatPreviousMetricLine(previousMetricLabel, getPreviousSleValue("p85"))}</small>
                            </article>
                            <article className={`team-kpi-card${isMetricVisible("bug-ratio") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel("Done Bug Ratio", "doneBugRatio", selectedTeamHealthSignals.doneBugRatio)}
                              <strong>
                                {selectedTeamHealth.bugRatio.doneBugRatio === null
                                  ? "-"
                                  : `${formatPercentValue(selectedTeamHealth.bugRatio.doneBugRatio)}%`}
                              </strong>
                              <small>
                                {selectedTeamHealth.bugRatio.doneBugCount}/{selectedTeamHealth.bugRatio.doneTotal} bugs in done
                              </small>
                              {renderMetricDataIssue("doneBugRatio")}
                            </article>
                          </div>
                          <section className="flow-health-grid">
                            {renderThroughputSummaryCard()}
                            {renderSprintWorkSummaryCard()}
                            <article className={`team-kpi-card flow-signal-card${isMetricVisible("sprint-predictability") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(
                                "2+ Sprint %",
                                "sprintPredictability",
                              )}
                              <strong>{selectedTeamRow ? `${formatPercentValue(selectedTeamRow.current.multiSprintPct)}%` : "-"}</strong>
                              <small>
                                {formatSprintPredictabilitySummary()}
                              </small>
                            </article>
                          </section>

                          <section className="flow-signals-grid">
                            {renderFlowBalanceCard()}
                            <article className={`team-kpi-card flow-signal-card${isMetricVisible("throughput-stability") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(
                                "Throughput Stability",
                                "throughputStability",
                                selectedTeamHealthSignals.throughputStability,
                              )}
                              <strong>
                                {selectedTeamHealth.throughputStability.weeklyPredictabilityPct === null
                                  ? "-"
                                  : `${formatPercentValue(selectedTeamHealth.throughputStability.weeklyPredictabilityPct)}%`}
                              </strong>
                              <small>
                                8-week avg {formatNumber(selectedTeamHealth.throughputStability.weeklyAvg, 1) || "-"} done/wk • 6-month predictability{" "}
                                {selectedTeamHealth.throughputStability.monthlyPredictabilityPct === null
                                  ? "-"
                                  : `${formatPercentValue(selectedTeamHealth.throughputStability.monthlyPredictabilityPct)}%`}
                              </small>
                              {renderMetricDataIssue("throughputStability")}
                            </article>
                            <article className={`team-kpi-card flow-signal-card${isMetricVisible("lead-time-by-type") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(
                                "Lead Time by Type",
                                "leadTimeByType",
                                selectedTeamHealthSignals.leadTimeByType,
                              )}
                              <strong>
                                {selectedTeamHealth.leadTimeByType.length === 0 ? "-" : `${selectedTeamHealth.leadTimeByType[0].issueType} ${formatDays(selectedTeamHealth.leadTimeByType[0].avgDays)}`}
                              </strong>
                              <small>
                                {selectedTeamHealth.leadTimeByType.length === 0
                                  ? "No completed issues with valid Created + Resolved."
                                  : selectedTeamHealth.leadTimeByType
                                      .slice(0, 3)
                                      .map((entry) => `${entry.issueType} ${formatDays(entry.avgDays)} (${entry.doneCount})`)
                                      .join(" • ")}
                              </small>
                              {renderMetricDataIssue("leadTimeByType")}
                            </article>
                          </section>

                          <section className="advanced-flow-grid">
                            <article className={`team-kpi-card flow-signal-card${isMetricVisible("flow-efficiency") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(
                                "Flow Efficiency",
                                "flowEfficiency",
                                selectedTeamHealthSignals.flowEfficiency,
                              )}
                              <strong>
                                {selectedTeamHealth.flowEfficiency.valuePct === null
                                  ? "-"
                                  : `${formatPercentValue(selectedTeamHealth.flowEfficiency.valuePct)}%`}
                              </strong>
                              <small>
                                Active {formatDays(selectedTeamHealth.flowEfficiency.activeDays)} • Queue{" "}
                                {formatDays(selectedTeamHealth.flowEfficiency.queueDays)} • Period{" "}
                                {formatPeriodLabel(selectedTeamHealth.flowEfficiency.period)}
                              </small>
                              {renderMetricDataIssue("flowEfficiency")}
                            </article>
                            <article className={`team-kpi-card flow-signal-card${isMetricVisible("queue-time") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(
                                "Queue Time by Status",
                                "queueTimeByStatus",
                                selectedTeamHealthSignals.queueTimeByStatus,
                              )}
                              <strong>
                                {selectedTeamHealth.queueTime.topStatuses[0]
                                  ? `${selectedTeamHealth.queueTime.topStatuses[0].status} ${formatDays(selectedTeamHealth.queueTime.topStatuses[0].avgDays)}`
                                  : "-"}
                              </strong>
                              <small>
                                {selectedTeamHealth.queueTime.topStatuses.length === 0
                                  ? "No bottleneck status times in selected period."
                                  : selectedTeamHealth.queueTime.topStatuses
                                      .map((item) => `${item.status} ${formatDays(item.avgDays)}`)
                                      .join(" • ")}
                              </small>
                              {renderMetricDataIssue("queueTimeByStatus")}
                            </article>
                            <article className={`team-kpi-card flow-signal-card${isMetricVisible("bottleneck-trend") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(
                                "Bottleneck Trend",
                                "bottleneckTrend",
                                selectedTeamHealthSignals.bottleneckTrend,
                              )}
                              <strong>
                                {selectedTeamHealth.bottleneckTrend.dominantStatus
                                  ? selectedTeamHealth.bottleneckTrend.dominantStatus
                                  : "-"}
                              </strong>
                              <small>
                                {selectedTeamHealth.bottleneckTrend.monthCount === 0
                                  ? "No monthly bottleneck history yet."
                                  : `Dominant ${selectedTeamHealth.bottleneckTrend.dominantCount}/${selectedTeamHealth.bottleneckTrend.monthCount} • Longest ${selectedTeamHealth.bottleneckTrend.longestStatus ?? "-"} ${formatDays(selectedTeamHealth.bottleneckTrend.longestAvgDays)} • Switches ${selectedTeamHealth.bottleneckTrend.switchCount}`}
                              </small>
                              {renderMetricDataIssue("bottleneckTrend")}
                            </article>
                          </section>

                          {renderWipRiskHeatmapPanel("wip-heatmap-panel")}
                        </section>

                        <section
                          className={`overview-secondary-grid${shouldEqualizeTeamOverviewSecondaryCards ? " is-collapsed-pair" : ""}`}
                        >
                          <section className="aging-wip-compact-row">
                            <article className={`team-kpi-card aging-wip-compact-card${isMetricVisible("aging-wip") ? "" : " metric-hidden"}`}>
                              <div className="aging-wip-compact-head">
                                <div className="aging-wip-title-row">
                                  <span>Average age of open tickets</span>
                                  {renderMetricInfoButton("agingWip")}
                                </div>
                                <button
                                  type="button"
                                  className="aging-wip-compact-toggle panel-toggle"
                                  aria-expanded={agingWipCompactOpen}
                                  aria-controls="aging-wip-compact-details"
                                  title={agingWipCompactOpen ? "Hide Aging details" : "Show Aging details"}
                                  onClick={() => setAgingWipCompactOpen((current) => !current)}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`panel-toggle-arrow ${agingWipCompactOpen ? "open" : "closed"}`}
                                  >
                                    ▾
                                  </span>
                                </button>
                              </div>
                              <strong className="aging-wip-main-value">{formatDays(selectedTeamHealth.agingWip.avgDays)}</strong>
                              <small>
                                WIP total {selectedTeamHealth.agingWip.total} • 1m+ {selectedTeamHealth.agingWip.over30} • &gt;90 days {selectedTeamHealth.agingWip.over90}
                              </small>
                              {!agingWipCompactOpen && (
                                <div className="aging-wip-compact-preview">
                                  <div className="aging-wip-preview-title">Top 3 oldest</div>
                                  {agingTopThree.length === 0 ? (
                                    <div className="muted">No open WIP issues.</div>
                                  ) : (
                                    <div className="aging-wip-compact-top">
                                      <div className="aging-wip-compact-top-header">
                                        <span>Jira</span>
                                        <span>Status</span>
                                        <span>Age</span>
                                      </div>
                                      {agingTopThree.map((item) => (
                                        <div key={item.issueKey} className="aging-wip-compact-top-item">
                                          <span>{item.issueKey}</span>
                                          <span>{item.status || "-"}</span>
                                          <span>{item.agingDays} days</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              {agingWipCompactOpen && (
                                <div className="aging-wip-compact-details" id="aging-wip-compact-details">
                                  <div>
                                    Median {formatDays(selectedTeamHealth.agingWip.medianDays)} • WIP bugs {selectedTeamHealth.bugRatio.wipBugCount} (
                                    {selectedTeamHealth.bugRatio.wipBugRatio === null ? "-" : `${formatPercentValue(selectedTeamHealth.bugRatio.wipBugRatio)}%`})
                                  </div>
                                  <div className="aging-wip-old-total">
                                    <div className="aging-wip-old-total-title">Older than 1 month</div>
                                    <div>{selectedTeamHealth.agingWip.over30} ticket(s)</div>
                                  </div>
                                  {agingOlderThanMonthItems.length === 0 ? (
                                    <div className="muted">No open WIP issues.</div>
                                  ) : (
                                    <div className="aging-wip-compact-top aging-wip-compact-list-scroll">
                                      <div className="aging-wip-compact-top-header">
                                        <span>Jira</span>
                                        <span>Status</span>
                                        <span>Age</span>
                                      </div>
                                      {agingOlderThanMonthItems.map((item) => (
                                        <div key={item.issueKey} className="aging-wip-compact-top-item">
                                          <span>{item.issueKey}</span>
                                          <span>{item.status || "-"}</span>
                                          <span>{item.agingDays} days</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </article>
                          </section>

                          <section className={`table-panel compact bottleneck-panel${isMetricVisible("bottleneck") ? "" : " metric-hidden"}`}>
                          <div className="bottleneck-head">
                            <div>
                              <div className="table-title-row">
                                <div className="table-title">Bottleneck (Time in Status + Manual override)</div>
                                {renderMetricInfoButton("bottleneck")}
                              </div>
                              <div className="table-subtitle">Auto-read monthly status times from Time in Status CSV. Manual rows override same month.</div>
                            </div>
                            <button
                              type="button"
                              className="bottleneck-toggle panel-toggle"
                              aria-expanded={bottleneckPanelOpen}
                              aria-controls="bottleneck-content"
                              title={bottleneckPanelOpen ? "Hide Bottleneck editor" : "Show Bottleneck editor"}
                              onClick={() => setBottleneckPanelOpen((current) => !current)}
                            >
                              <span
                                aria-hidden="true"
                                className={`panel-toggle-arrow ${bottleneckPanelOpen ? "open" : "closed"}`}
                              >
                                ▾
                              </span>
                            </button>
                          </div>

                          {!bottleneckPanelOpen ? (
                            <div className="bottleneck-collapsed-content">
                              <p className="muted bottleneck-collapsed-hint">{selectedBottleneckSummary}</p>
                              {selectedBottleneckFlowTimes.length > 0 && (
                                <div className="bottleneck-flow-preview">
                                  {selectedBottleneckFlowTimes.map((column, index) => (
                                    <div key={`${column.name}:${column.avgDays}:${index}`} className="bottleneck-flow-preview-item">
                                      <span>{column.name}</span>
                                      <strong>{column.avgDays.toFixed(1)} days</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {bottleneckMonthlyRows.length > 0 && (
                                <div className="bottleneck-monthly">
                                  <div className="table-title small-title">Per month (latest 12)</div>
                                  <div className="table-wrap bottleneck-monthly-scroll">
                                    <table className="metrics-table bottleneck-monthly-table">
                                      <thead>
                                        <tr>
                                          <th>Month</th>
                                          <th>Bottleneck</th>
                                          <th>Created</th>
                                          <th>Done</th>
                                          <th>Source</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {bottleneckMonthlyRows.map((row) => (
                                          <tr key={row.period}>
                                            <td>{row.monthLabel}</td>
                                            <td>{row.bottleneckLabel}</td>
                                            <td>{row.createdCount}</td>
                                            <td>{row.doneCount}</td>
                                            <td>{row.sourceLabel}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div id="bottleneck-content">
                              <form className="bottleneck-form" onSubmit={handleSaveBottleneckEntry}>
                                <div className="bottleneck-flow-box">
                                  <div className="bottleneck-flow-title">Team Flow Template</div>
                                  <div className="bottleneck-flow-subtitle">
                                    Save your status flow once per team and reuse it every month.
                                  </div>

                                  <div className="bottleneck-flow-chip-list">
                                    {bottleneckFlowStatuses.length === 0 ? (
                                      <span className="muted">No flow statuses saved yet.</span>
                                    ) : (
                                      bottleneckFlowStatuses.map((statusName) => (
                                        <button
                                          key={statusName}
                                          type="button"
                                          className="flow-chip"
                                          onClick={() => handleRemoveFlowStatus(statusName)}
                                          title="Remove from flow"
                                        >
                                          {statusName} <span aria-hidden="true">x</span>
                                        </button>
                                      ))
                                    )}
                                  </div>

                                  <div className="bottleneck-flow-controls">
                                    <input
                                      value={bottleneckFlowDraft}
                                      onChange={(event) => setBottleneckFlowDraft(event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          handleAddFlowStatus();
                                        }
                                      }}
                                      placeholder="Add status to flow (e.g. In Progress)"
                                    />
                                    <button type="button" className="soft-btn" onClick={handleAddFlowStatus}>Add to flow</button>
                                    <button type="button" disabled={busy} onClick={() => void handleSaveFlowTemplate()}>Save flow template</button>
                                    <button type="button" className="soft-btn" disabled={busy} onClick={() => void handleSaveFlowFromRows()}>
                                      Save flow from current rows
                                    </button>
                                    <button type="button" className="soft-btn" onClick={handleApplyFlowToMonth}>Apply flow to this month</button>
                                  </div>
                                </div>

                                <div className="bottleneck-top-row">
                                  <label>
                                    Period (YYYY-MM)
                                    <input
                                      type="month"
                                      value={bottleneckPeriodInput}
                                      onChange={(event) => setBottleneckPeriodInput(event.target.value)}
                                    />
                                  </label>
                                  <label>
                                    Notes (optional)
                                    <input
                                      value={bottleneckNotesInput}
                                      onChange={(event) => setBottleneckNotesInput(event.target.value)}
                                      placeholder="Context for this month"
                                    />
                                  </label>
                                </div>

                                <div className="bottleneck-rows">
                                  <div className="bottleneck-row-head">Statuses and average time per status (W/D/H).</div>
                                  {bottleneckRows.map((row) => (
                                    <div className="bottleneck-row-card" key={row.id}>
                                      <label className="bottleneck-name-field">
                                        Status
                                        <input
                                          value={row.name}
                                          onChange={(event) => handleBottleneckRowChange(row.id, "name", event.target.value)}
                                          placeholder="In Progress"
                                        />
                                      </label>

                                      <div className="bottleneck-duration-fields">
                                        <label>
                                          W
                                          <input
                                            inputMode="numeric"
                                            value={row.weeks}
                                            onChange={(event) => handleBottleneckRowChange(row.id, "weeks", event.target.value)}
                                            placeholder="0"
                                          />
                                        </label>
                                        <label>
                                          D
                                          <input
                                            inputMode="numeric"
                                            value={row.days}
                                            onChange={(event) => handleBottleneckRowChange(row.id, "days", event.target.value)}
                                            placeholder="0"
                                          />
                                        </label>
                                        <label>
                                          H
                                          <input
                                            inputMode="numeric"
                                            value={row.hours}
                                            onChange={(event) => handleBottleneckRowChange(row.id, "hours", event.target.value)}
                                            placeholder="0"
                                          />
                                        </label>
                                      </div>

                                      <button
                                        type="button"
                                        className="soft-btn"
                                        onClick={() => handleRemoveBottleneckRow(row.id)}
                                        disabled={bottleneckRows.length === 1}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                                </div>

                                <div className="preset-row">
                                  <button type="button" className="soft-btn" onClick={handleAddBottleneckRow}>
                                    + Add status
                                  </button>
                                  <button type="submit" disabled={busy}>Save bottleneck</button>
                                  <button
                                    type="button"
                                    className="soft-btn"
                                    onClick={handleClearBottleneckDraft}
                                  >
                                    Clear draft
                                  </button>
                                </div>
                              </form>

                              <p className="muted">Auto Time in Status months: {selectedTeam.autoBottleneck.length}</p>
                              <div className="table-title small-title">Saved bottleneck entries</div>
                              {selectedTeam.manualBottleneck.length === 0 ? (
                                <p className="muted">No manual bottleneck entries yet.</p>
                              ) : (
                                <div className="table-wrap">
                                  <table className="metrics-table">
                                    <thead>
                                      <tr>
                                        <th>Period</th>
                                        <th>Bottleneck</th>
                                        <th>Notes</th>
                                        <th>Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {selectedTeam.manualBottleneck
                                        .slice()
                                        .sort((a, b) => b.period.localeCompare(a.period))
                                        .map((entry) => {
                                          const bottleneck = getMaxBottleneckColumn(entry);
                                          return (
                                            <tr key={entry.period}>
                                              <td>{entry.period}</td>
                                              <td>{bottleneck ? `${bottleneck.name} (${bottleneck.avgDays.toFixed(1)} days)` : "-"}</td>
                                              <td>{entry.notes ?? "-"}</td>
                                              <td>
                                                <button
                                                  type="button"
                                                  className="soft-btn"
                                                  onClick={() => {
                                                    setBottleneckPeriodInput(entry.period);
                                                    setBottleneckRows(buildBottleneckRows(entry.columns));
                                                    setBottleneckNotesInput(entry.notes ?? "");
                                                  }}
                                                >
                                                  Load
                                                </button>
                                                <button
                                                  type="button"
                                                  className="soft-btn"
                                                  disabled={busy}
                                                  onClick={() => handleDeleteBottleneckEntry(entry.period)}
                                                >
                                                  Delete
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                          </section>
                          {renderTimeInStatusPanel("team-time-in-status-content")}
                        </section>
                        <hr className="team-divider" />
                        <section className="done-config-card">
                          <div className="done-config-head">
                            <h2 className="team-section-title">Team Workflow</h2>
                            <button
                              type="button"
                              className="done-config-toggle panel-toggle"
                              aria-expanded={doneDefinitionOpen}
                              aria-controls="done-definition-content"
                              title={doneDefinitionOpen ? "Hide Team Workflow" : "Show Team Workflow"}
                              onClick={() => setDoneDefinitionOpen((current) => !current)}
                            >
                              <span
                                aria-hidden="true"
                                className={`panel-toggle-arrow ${doneDefinitionOpen ? "open" : "closed"}`}
                              >
                                ▾
                              </span>
                            </button>
                          </div>
                          {draftConfig ? (
                            doneDefinitionOpen ? (
                              <form className="done-config-form" id="done-definition-content" onSubmit={handleSaveAdvancedConfig}>
                                <section className="workflow-status-card">
                                  <div className="workflow-status-head">
                                    <div>
                                      <h3>Classify team statuses</h3>
                                      <p>
                                        Done statuses are where cycle time ends. Backlog statuses are excluded from active cycle-time when Time in Status data exists.
                                      </p>
                                    </div>
                                    <span>{detectedWorkflowStatuses.length} detected</span>
                                  </div>
                                  <div className="workflow-status-grid">
                                    {detectedWorkflowStatuses.map((statusName) => {
                                      const normalized = normalizeTextValue(statusName);
                                      const category = backlogStatusList.some((item) => normalizeTextValue(item) === normalized)
                                        ? "backlog"
                                        : sprintScopeStatusList.some((item) => normalizeTextValue(item) === normalized)
                                          ? "active"
                                          : doneStatusList.some((item) => normalizeTextValue(item) === normalized)
                                            ? "done"
                                            : "unmapped";
                                      return (
                                        <article key={`workflow-status-${statusName}`} className={`workflow-status-row ${category}`}>
                                          <strong>{statusName}</strong>
                                          <div className="workflow-status-actions">
                                            <button type="button" className={category === "backlog" ? "active" : ""} onClick={() => handleClassifyWorkflowStatus(statusName, "backlog")}>
                                              Backlog
                                            </button>
                                            <button type="button" className={category === "active" ? "active" : ""} onClick={() => handleClassifyWorkflowStatus(statusName, "active")}>
                                              Active
                                            </button>
                                            <button type="button" className={category === "done" ? "active" : ""} onClick={() => handleClassifyWorkflowStatus(statusName, "done")}>
                                              Done
                                            </button>
                                          </div>
                                        </article>
                                      );
                                    })}
                                  </div>
                                </section>

                                <div className="done-config-grid">
                                  <section className="done-config-panel">
                                    <div className="done-config-panel-title">Done statuses (cycle time ends here)</div>
                                    <label className="checkbox-row">
                                      <input
                                        type="checkbox"
                                        checked={draftConfig.doneConfig.useStatusCategoryDone}
                                        onChange={(event) =>
                                          setDraftConfig((curr) =>
                                            curr
                                              ? {
                                                  ...curr,
                                                  doneConfig: {
                                                    ...curr.doneConfig,
                                                    useStatusCategoryDone: event.target.checked,
                                                  },
                                                }
                                              : curr,
                                          )
                                        }
                                      />
                                      <span>Use Jira status category Done as fallback</span>
                                    </label>

                                    <div className="done-chip-editor">
                                      <div className="done-chip-editor-label">Statuses that mean finished work</div>
                                      <div className="done-chip-list">
                                        {doneStatusList.length === 0 ? (
                                          <span className="muted">No statuses configured.</span>
                                        ) : (
                                          doneStatusList.map((value) => (
                                            <button
                                              key={value}
                                              type="button"
                                              className="chip-btn"
                                              onClick={() => handleRemoveDoneStatus(value)}
                                              title="Remove status"
                                            >
                                              {value} <span aria-hidden="true">x</span>
                                            </button>
                                          ))
                                        )}
                                      </div>
                                      <div className="done-chip-input-row">
                                        <input
                                          value={doneStatusDraft}
                                          onChange={(event) => setDoneStatusDraft(event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              handleAddDoneStatus();
                                            }
                                          }}
                                          placeholder="Add status (e.g. Done)"
                                        />
                                        <button type="button" className="soft-btn" onClick={handleAddDoneStatus}>Add</button>
                                      </div>
                                    </div>

                                    <div className="done-config-presets">
                                      <button type="button" className="soft-btn" onClick={handleApplyClassicJiraPreset}>Classic Jira</button>
                                      <button type="button" className="soft-btn" onClick={handleApplyAcTestPreset}>AC Test only</button>
                                      <button type="button" className="soft-btn" onClick={() => setDoneStatusesInput("")}>Clear</button>
                                    </div>
                                  </section>

                                  <section className="done-config-panel">
                                    <div className="done-config-panel-title">Backlog statuses</div>
                                    <div className="done-chip-editor">
                                      <div className="done-chip-editor-label">Excluded from active cycle-time when Time in Status exists</div>
                                      <div className="done-chip-list">
                                        {backlogStatusList.length === 0 ? (
                                          <span className="muted">No backlog statuses configured.</span>
                                        ) : (
                                          backlogStatusList.map((value) => (
                                            <button
                                              key={value}
                                              type="button"
                                              className="chip-btn"
                                              onClick={() => handleRemoveBacklogStatus(value)}
                                              title="Remove status"
                                            >
                                              {value} <span aria-hidden="true">x</span>
                                            </button>
                                          ))
                                        )}
                                      </div>
                                      <div className="done-chip-input-row">
                                        <input
                                          value={backlogStatusDraft}
                                          onChange={(event) => setBacklogStatusDraft(event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              handleAddBacklogStatus();
                                            }
                                          }}
                                          placeholder="Add backlog status (e.g. Backlog)"
                                        />
                                        <button type="button" className="soft-btn" onClick={handleAddBacklogStatus}>Add</button>
                                      </div>
                                    </div>
                                  </section>

                                  <section className="done-config-panel">
                                    <div className="done-config-panel-title">Active statuses</div>
                                    <div className="done-chip-editor">
                                      <div className="done-chip-editor-label">Statuses counted as active work / sprint work</div>
                                      <div className="done-chip-list">
                                        {sprintScopeStatusList.length === 0 ? (
                                          <span className="muted">Auto-detect from active team flow.</span>
                                        ) : (
                                          sprintScopeStatusList.map((value) => (
                                            <button
                                              key={value}
                                              type="button"
                                              className="chip-btn"
                                              onClick={() => handleRemoveSprintScopeStatus(value)}
                                              title="Remove status"
                                            >
                                              {value} <span aria-hidden="true">x</span>
                                            </button>
                                          ))
                                        )}
                                      </div>
                                      <div className="done-chip-input-row">
                                        <input
                                          value={sprintScopeStatusDraft}
                                          onChange={(event) => setSprintScopeStatusDraft(event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              handleAddSprintScopeStatus();
                                            }
                                          }}
                                          placeholder="Add active status (e.g. In Progress)"
                                        />
                                        <button type="button" className="soft-btn" onClick={handleAddSprintScopeStatus}>Add</button>
                                      </div>
                                      <small className="guide-note">
                                        Also used by sprint discipline metrics to identify active-flow tickets.
                                      </small>
                                    </div>

                                    <div className="done-config-presets">
                                      <button type="button" className="soft-btn" onClick={handleResetSprintScopeStatuses}>
                                        Use auto-detect
                                      </button>
                                      <button type="button" className="soft-btn" onClick={() => setSprintScopeStatusesInput("")}>
                                        Clear
                                      </button>
                                    </div>
                                  </section>
                                </div>

                                <details className="workflow-advanced">
                                  <summary>Work model</summary>
                                  <section className="done-config-panel">
                                    <div className="done-config-panel-title">How this team plans work</div>
                                    <div className="work-model-toggle">
                                      <button
                                        type="button"
                                        className={draftVelocityConfig.mode === "sprint-story-points" ? "" : "active"}
                                        onClick={() =>
                                          setDraftConfig((curr) =>
                                            curr
                                              ? {
                                                  ...curr,
                                                  velocityConfig: { mode: "weekly-ticket-count" },
                                                }
                                              : curr,
                                          )
                                        }
                                      >
                                        <strong>Kanban</strong>
                                        <span>Weekly ticket count, no estimates needed.</span>
                                      </button>
                                      <button
                                        type="button"
                                        className={draftVelocityConfig.mode === "sprint-story-points" ? "active" : ""}
                                        onClick={() =>
                                          setDraftConfig((curr) =>
                                            curr
                                              ? {
                                                  ...curr,
                                                  velocityConfig: {
                                                    mode: "sprint-story-points",
                                                  },
                                                }
                                              : curr,
                                          )
                                        }
                                      >
                                        <strong>Scrum</strong>
                                        <span>Sprint-based story points. Sprint dates are inferred from Jira Sprint data.</span>
                                      </button>
                                    </div>
                                  </section>
                                </details>

                                <div className="preset-row">
                                  <button type="submit" disabled={busy}>Save Team Workflow</button>
                                </div>

                                <p className="guide-note">
                                  Cycle time uses active status durations when Time in Status data is available; otherwise it falls back to Created → Done.
                                </p>
                              </form>
                            ) : (
                              <div className="done-config-collapsed">
                                <div className="done-config-collapsed-row">
                                  <strong>Done statuses</strong>
                                  <span>{doneStatusList.length > 0 ? doneStatusList.join(" • ") : "-"}</span>
                                </div>
                                <div className="done-config-collapsed-row">
                                  <strong>Backlog statuses</strong>
                                  <span>{backlogStatusList.length > 0 ? backlogStatusList.join(" • ") : "None"}</span>
                                </div>
                                <div className="done-config-collapsed-row">
                                  <strong>Active statuses</strong>
                                  <span>{sprintScopeStatusList.length > 0 ? sprintScopeStatusList.join(" • ") : "Auto-detect"}</span>
                                </div>
                                <p className="muted done-config-collapsed-hint">
                                  Cycle time ends at Done statuses. Work model: {velocityCadenceLabel}
                                </p>
                              </div>
                            )
                          ) : (
                            <p className="muted">Team config is loading...</p>
                          )}
                        </section>
                      </>
                    )}

                    {teamTab === "cycle" && (
                      <>
                        <TeamDetail
                          team={selectedTeam}
                          title="Cycle Time Scatter Plot"
                          subtitle="Resolution date vs cycle time with SLE percentile lines"
                          periodFilter={periodMonth}
                          sleValues={selectedTeamRow.current.sle}
                          lineVisibility={sleLineVisibility}
                          sleIssueTypeOptions={sleIssueTypeOptions}
                          sleIncludedIssueTypes={sleIssueTypesDraft}
                          sleTypeDirty={sleIssueTypesDirty}
                          onToggleSleIssueType={handleToggleSleIssueTypeDraft}
                          onResetSleIssueTypes={handleResetSleIssueTypesDraft}
                          onApplySleIssueTypes={() => void handleApplySleIssueTypes()}
                          excludedIssueKeys={selectedTeam.config.excludedIssueKeys ?? []}
                          busy={busy}
                          onExcludeIssue={handleExcludeIssueFromMetrics}
                          onExcludeIssues={handleExcludeIssuesFromMetrics}
                          onRestoreIssue={handleRestoreExcludedIssue}
                          onRestoreAllIssues={handleRestoreAllExcludedIssues}
                        />
                        <section className="trends-note cycle-note">
                          <h3>Reading the Scatter Plot</h3>
                          <ul>
                            <li>Each dot is one completed issue.</li>
                            <li>Hover a point to see issue key and resolution date.</li>
                            <li>Click a point and use Exclude Selected Issue to remove anomaly from metrics (restorable).</li>
                            <li>Items above P95 are outliers worth retrospective review.</li>
                          </ul>
                        </section>
                      </>
                    )}
                  </>
                )}
              </section>
            )}

            {workspaceHandle && page === "import" && (
              <section className="page-section import-layout">
                <section className="panel-box import-simple-panel">
                  <div className="section-head compact-head import-simple-head">
                    <div>
                      <h1>Import Data</h1>
                      <p>Select a team, upload Jira CSV, and the app updates only that team.</p>
                    </div>
                  </div>

                  <div className="import-simple-flow">
                    <label className="import-team-picker">
                      Team
                      <select value={importTeamId} onChange={(event) => setImportTeamId(event.target.value)}>
                        <option value="">Choose team...</option>
                        {filteredTeams.map((team) => (
                          <option key={team.teamId} value={team.teamId}>
                            {team.config.teamName}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      className="upload-zone import-upload-action"
                      onClick={() => !busy && handleImport()}
                      disabled={busy || !importTeamId}
                    >
                      <span className="upload-icon">⇪</span>
                      <span className="upload-main">{busy ? "Importing..." : "Upload CSV table"}</span>
                      <span className="upload-sub">
                        {importTeamId ? "Choose Jira CSV file(s) for the selected team." : "Choose a team first."}
                      </span>
                    </button>
                  </div>

                  {selectedImportTeam && (
                    <div className="import-team-summary">
                      <div>
                        <span>Selected team</span>
                        <strong>{selectedImportTeam.config.teamName}</strong>
                      </div>
                      <div>
                        <span>Current rows</span>
                        <strong>{formatNumber(selectedImportTeam.parsedIssues.length, 0)}</strong>
                      </div>
                      <div>
                        <span>Imported files</span>
                        <strong>{formatNumber(selectedImportTeam.importFiles.length, 0)}</strong>
                      </div>
                    </div>
                  )}

                  <section className="jira-import-panel">
                    <div className="jira-import-head">
                      <div>
                        <h3>Pull From Jira</h3>
                        <p>Runs only when you click import and writes the result under the selected team.</p>
                      </div>
                      <span>Manual per-team import</span>
                    </div>

                    <div className="jira-import-grid">
                      <label>
                        Jira URL
                        <input
                          value={jiraImportUrl}
                          onChange={(event) => setJiraImportUrl(event.target.value)}
                          placeholder="https://jira.example.net"
                          autoComplete="off"
                        />
                      </label>
                      <label>
                        Username
                        <input
                          value={jiraImportUsername}
                          onChange={(event) => setJiraImportUsername(event.target.value)}
                          placeholder="your username"
                          autoComplete="username"
                        />
                      </label>
                      <label>
                        Token
                        <input
                          type="password"
                          value={jiraImportToken}
                          onChange={(event) => setJiraImportToken(event.target.value)}
                          placeholder="personal token"
                          autoComplete="off"
                        />
                      </label>
                      <label>
                        Max issues
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          step={50}
                          value={jiraImportMaxIssues}
                          onChange={(event) => setJiraImportMaxIssues(event.target.value)}
                        />
                      </label>
                    </div>

                    <label className="jira-jql-field">
                      JQL query
                      <textarea
                        value={jiraImportJql}
                        onChange={(event) => setJiraImportJql(event.target.value)}
                        placeholder="project = YOURPROJECT AND updated >= startOfYear() ORDER BY updated DESC"
                        rows={4}
                      />
                    </label>

                    <div className="preset-row">
                      <button
                        type="button"
                        className="soft-btn"
                        disabled={busy}
                        onClick={() => void handleTestJiraConnection()}
                      >
                        Test connection
                      </button>
                      <button
                        type="button"
                        disabled={busy || !importTeamId}
                        onClick={() => void handleJiraImport()}
                      >
                        Import From Jira
                      </button>
                      <button
                        type="button"
                        className="soft-btn"
                        disabled={!composedImportJql}
                        onClick={() => setJiraImportJql(composedImportJql)}
                      >
                        Use saved team query
                      </button>
                    </div>

                    {jiraConnectionStatus && (
                      <div className={`jira-connection-status ${jiraConnectionStatus.tone}`}>
                        {jiraConnectionStatus.message}
                      </div>
                    )}

                    <p className="guide-note">
                      Token stays in this browser form only. The app exports Jira issues into a local CSV and then recalculates only the selected team.
                    </p>
                  </section>

                  <div className="import-recent-strip">
                    <div className="import-strip-head">
                      <div>
                        <h3>{selectedImportTeam ? "Latest imports for this team" : "Latest imports"}</h3>
                        <p>{selectedImportTeam ? "Most recent CSV files loaded for the selected team." : "Choose a team to focus the list."}</p>
                      </div>
                    </div>
                    <div className="history-list import-history-compact">
                      {(selectedImportTeam ? selectedImportHistory : importHistory).map((item) => (
                        <article key={`${"teamName" in item ? item.teamName : selectedImportTeam?.config.teamName}:${item.relativePath}:${item.updatedAt}`}>
                          <strong>{item.name}</strong>
                          <div>{"teamName" in item ? item.teamName : selectedImportTeam?.config.teamName}</div>
                          <small>
                            {item.bucket} · {item.rowCount} rows · {formatDateText(item.updatedAt)}
                          </small>
                        </article>
                      ))}
                      {(selectedImportTeam ? selectedImportHistory : importHistory).length === 0 && (
                        <p className="muted">No imports yet.</p>
                      )}
                    </div>
                  </div>

                  <details
                    className="import-advanced-panel"
                    open={showAdvancedImport}
                    onToggle={(event) => setShowAdvancedImport(event.currentTarget.open)}
                  >
                    <summary>Advanced import settings</summary>

                    <div className="advanced-grid">
                      <label>
                        Import folder
                        <select value={importMode} onChange={(event) => setImportMode(event.target.value as ImportMode)}>
                          <option value="current-month">Current month (YYYY-MM)</option>
                          <option value="root">Root imports/</option>
                          <option value="custom">Custom folder</option>
                        </select>
                      </label>
                      {importMode === "custom" && (
                        <label>
                          Custom folder under imports/
                          <input
                            value={customImportBucket}
                            onChange={(event) => setCustomImportBucket(event.target.value)}
                            placeholder="2026-Q1"
                          />
                        </label>
                      )}
                    </div>

                    {selectedImportTeam && (
                      <div className="import-query-grid">
                        <section className="query-manager">
                          <h4>Issues CSV Query</h4>

                          <label>
                            Saved queries
                            <select value={querySelectionId} onChange={(event) => handleSelectSavedQuery(event.target.value)}>
                              {selectedIssueQueryConfig.queries.map((query) => (
                                <option key={query.id} value={query.id}>
                                  {query.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Query name
                            <input
                              value={queryDraftName}
                              onChange={(event) => setQueryDraftName(event.target.value)}
                              placeholder="e.g., Team YTD Activity"
                            />
                          </label>

                          <label>
                            Base JQL
                            <textarea
                              value={queryDraftJql}
                              onChange={(event) => setQueryDraftJql(event.target.value)}
                              placeholder="project = YOURPROJECT ORDER BY updated DESC"
                              rows={4}
                            />
                          </label>

                          <label>
                            Note (optional)
                            <input
                              value={queryDraftNote}
                              onChange={(event) => setQueryDraftNote(event.target.value)}
                              placeholder="Optional context for this query"
                            />
                          </label>

                          <label>
                            Time window for this import
                            <select value={queryTimeWindow} onChange={(event) => setQueryTimeWindow(event.target.value as QueryTimeWindow)}>
                              <option value="none">No extra window</option>
                              <option value="current-month">Current month</option>
                              <option value="last-month">Last month</option>
                              <option value="ytd">Year to date</option>
                            </select>
                          </label>

                          <div className="guide-block">
                            <h4>Generated issues query preview</h4>
                            <pre className="guide-code">{composedImportJql || "Enter base JQL to see preview."}</pre>
                          </div>

                          <div className="preset-row">
                            <button type="button" className="soft-btn" onClick={handleUpdateSelectedQuery} disabled={!querySelectionId || busy}>
                              Update selected
                            </button>
                            <button type="button" className="soft-btn" onClick={handleSaveQueryAsNew} disabled={busy}>
                              Save as new
                            </button>
                            <button type="button" className="soft-btn" onClick={handleSetDefaultQuery} disabled={!querySelectionId || busy}>
                              Set as default
                            </button>
                          </div>
                        </section>

                        <section className="query-manager">
                          <h4>Time in Status Query</h4>

                          <label>
                            Saved queries
                            <select
                              value={timeInStatusQuerySelectionId}
                              onChange={(event) => handleSelectTimeInStatusQuery(event.target.value)}
                            >
                              {selectedTimeInStatusQueryConfig.queries.map((query) => (
                                <option key={query.id} value={query.id}>
                                  {query.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Query name
                            <input
                              value={timeInStatusQueryDraftName}
                              onChange={(event) => setTimeInStatusQueryDraftName(event.target.value)}
                              placeholder="e.g., Team YTD Time in Status"
                            />
                          </label>

                          <label>
                            Base JQL
                            <textarea
                              value={timeInStatusQueryDraftJql}
                              onChange={(event) => setTimeInStatusQueryDraftJql(event.target.value)}
                              placeholder="project = YOURPROJECT ORDER BY updated DESC"
                              rows={4}
                            />
                          </label>

                          <label>
                            Note (optional)
                            <input
                              value={timeInStatusQueryDraftNote}
                              onChange={(event) => setTimeInStatusQueryDraftNote(event.target.value)}
                              placeholder="Optional context for this query"
                            />
                          </label>

                          <label>
                            Time window for this export
                            <select
                              value={timeInStatusQueryTimeWindow}
                              onChange={(event) =>
                                setTimeInStatusQueryTimeWindow(event.target.value as QueryTimeWindow)
                              }
                            >
                              <option value="none">No extra window</option>
                              <option value="current-month">Current month</option>
                              <option value="last-month">Last month</option>
                              <option value="ytd">Year to date</option>
                            </select>
                          </label>

                          <div className="guide-block">
                            <h4>Generated Time in Status query preview</h4>
                            <pre className="guide-code">
                              {composedTimeInStatusJql || "Enter base JQL to see preview."}
                            </pre>
                          </div>

                          <div className="preset-row">
                            <button type="button" className="soft-btn" onClick={handleUpdateSelectedTimeInStatusQuery} disabled={!timeInStatusQuerySelectionId || busy}>
                              Update selected
                            </button>
                            <button type="button" className="soft-btn" onClick={handleSaveTimeInStatusQueryAsNew} disabled={busy}>
                              Save as new
                            </button>
                            <button type="button" className="soft-btn" onClick={handleSetDefaultTimeInStatusQuery} disabled={!timeInStatusQuerySelectionId || busy}>
                              Set as default
                            </button>
                            <button type="button" className="soft-btn" onClick={handleCopyIssueQueryToTimeInStatus} disabled={busy}>
                              Copy Issues Query
                            </button>
                          </div>
                        </section>
                      </div>
                    )}

                    {draftConfig && (
                      <form className="advanced-config" onSubmit={handleSaveAdvancedConfig}>
                        <h4>Team Mapping</h4>
                        <label>
                          Done statuses
                          <input
                            value={doneStatusesInput}
                            onChange={(event) => setDoneStatusesInput(event.target.value)}
                          />
                        </label>
                        <div className="mapping-row">
                          {renderMappingInput("Issue key", draftConfig.mapping.key, (value) =>
                            setDraftConfig((curr) =>
                              curr ? { ...curr, mapping: { ...curr.mapping, key: value } } : curr,
                            ),
                          )}
                          {renderMappingInput("Created", draftConfig.mapping.created, (value) =>
                            setDraftConfig((curr) =>
                              curr ? { ...curr, mapping: { ...curr.mapping, created: value } } : curr,
                            ),
                          )}
                          {renderMappingInput("Resolution date", draftConfig.mapping.resolutionDate, (value) =>
                            setDraftConfig((curr) =>
                              curr ? { ...curr, mapping: { ...curr.mapping, resolutionDate: value } } : curr,
                            ),
                          )}
                          {renderMappingInput("Updated", draftConfig.mapping.updated, (value) =>
                            setDraftConfig((curr) =>
                              curr ? { ...curr, mapping: { ...curr.mapping, updated: value } } : curr,
                            ),
                          )}
                          {renderMappingInput("Issue type", draftConfig.mapping.issueType ?? "Issue Type", (value) =>
                            setDraftConfig((curr) =>
                              curr ? { ...curr, mapping: { ...curr.mapping, issueType: value } } : curr,
                            ),
                          )}
                          {renderMappingInput("Story points", draftConfig.mapping.storyPoints ?? "", (value) =>
                            setDraftConfig((curr) =>
                              curr ? { ...curr, mapping: { ...curr.mapping, storyPoints: value } } : curr,
                            ),
                          )}
                          {renderMappingInput("Sprint", draftConfig.mapping.sprint ?? "", (value) =>
                            setDraftConfig((curr) =>
                              curr ? { ...curr, mapping: { ...curr.mapping, sprint: value } } : curr,
                            ),
                          )}
                        </div>
                        <p className="guide-note">
                          Leave `Story points` or `Sprint` empty to auto-detect Jira custom field headers like `Custom field (Story Points)`.
                        </p>
                        <button type="submit" disabled={busy || !selectedTeam}>
                          Save Advanced Config
                        </button>
                      </form>
                    )}

                    <h3>Jira Filter and Export Guide</h3>

                    <div className="guide-block">
                      <h4>Recommended team queries (JQL)</h4>
                      <pre className="guide-code">{
                        "Issues CSV:\nproject = \"Your Project Here\" AND issuetype in (Bug, Story, Task)\nAND (\n  created >= startOfYear()\n  OR updated >= startOfYear()\n  OR resolved >= startOfYear()\n)\nORDER BY updated DESC"
                      }</pre>
                      <p className="guide-note">
                        Preferred model: export one Issues CSV that covers created, updated, or resolved work in the window. The app still supports the old Open + Closed CSV workflow because duplicates are merged by latest Updated.
                      </p>
                    </div>

                    <div className="guide-block">
                      <h4>Optional: Time in Status CSV for Bottleneck</h4>
                      <pre className="guide-code">{
                        "Time in Status:\nproject = \"Your Project Here\" AND issuetype in (Bug, Story, Task)\nAND (\n  created >= startOfYear()\n  OR updated >= startOfYear()\n  OR resolved >= startOfYear()\n)\nORDER BY updated DESC"
                      }</pre>
                      <p className="guide-note">
                        Export Time in Status separately with the same team scope/window. Required: Resolution Date (or Resolved) and status duration columns (e.g. In Progress, Code Review, Test). Manual bottleneck overrides auto for the same month.
                      </p>
                    </div>

                    <div className="guide-block">
                      <h4>Export steps</h4>
                      <ol>
                        <li>Open Jira and go to Issues.</li>
                        <li>Run the Issues CSV query for your team scope and time window.</li>
                        <li>Use Export and choose CSV (Current fields).</li>
                        <li>Optional: run the Time in Status query and export that CSV separately.</li>
                        <li>Upload the exported CSV file(s) here.</li>
                      </ol>
                    </div>

                    <div className="guide-block">
                      <h4>Required columns for this tool</h4>
                      <div className="guide-table-wrap">
                        <table className="guide-table">
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>CSV column name</th>
                              <th>Required</th>
                              <th>Why we need it</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importGuideColumns.map((item) => (
                              <tr key={item.label}>
                                <td>{item.label}</td>
                                <td><code>{item.value}</code></td>
                                <td>{item.required ? "Yes" : "Optional"}</td>
                                <td>{item.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="guide-note">If Jira export names differ, update Team Mapping in Advanced section before import.</p>
                    </div>

                    <h3>Folders</h3>
                    <p>Organized import locations.</p>
                    <ul className="folder-list">
                      {folderTotals.map((item) => (
                        <li key={item.path}>
                          <span>{item.path}</span>
                          <strong>{item.fileCount}</strong>
                        </li>
                      ))}
                      {folderTotals.length === 0 && <li className="muted">No folders yet.</li>}
                    </ul>
                  </details>
                </section>
              </section>
            )}
          </>
        )}
      </main>

      {showAddTeamModal && (
        <div className="modal-overlay" onClick={() => setShowAddTeamModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>Add New Team</h3>
              <button className="ghost-btn" onClick={() => setShowAddTeamModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="modal-form">
              <label>
                Team Name
                <input
                  value={newTeamName}
                  onChange={(event) => setNewTeamName(event.target.value)}
                  placeholder="e.g., Platform Engineering"
                  required
                />
              </label>

              <label>
                Description (optional)
                <input
                  value={newTeamDescription}
                  onChange={(event) => setNewTeamDescription(event.target.value)}
                  placeholder="Team focus area"
                />
              </label>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowAddTeamModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}>
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function resolveImportBucket(mode: ImportMode, customBucket: string): string | null {
  if (mode === "root") {
    return null;
  }

  if (mode === "current-month") {
    return monthKey(new Date());
  }

  return customBucket.trim() || monthKey(new Date());
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function buildAvailableMonths(
  teams: Array<Pick<TeamRuntime, "metrics" | "parsedIssues" | "manualBottleneck" | "autoBottleneck" | "importFiles">>,
): string[] {
  const values = new Set<string>();

  const addMonthToken = (value: string | null | undefined): void => {
    if (value && isMonthPeriod(value)) {
      values.add(value);
    }
  };

  const addIssueDate = (value: Date | null | undefined): void => {
    if (!value || Number.isNaN(value.getTime())) {
      return;
    }

    values.add(monthKey(value));
  };

  teams.forEach((team) => {
    team.metrics?.velocityMonthly.forEach((item) => addMonthToken(item.month));
    team.metrics?.doneIssueDetails.forEach((item) => addMonthToken(item.resolutionDate.slice(0, 7)));

    team.parsedIssues.forEach((issue) => {
      addIssueDate(issue.updated);
      addIssueDate(issue.resolutionDate);
    });

    team.autoBottleneck.forEach((entry) => addMonthToken(entry.period));
    team.manualBottleneck.forEach((entry) => addMonthToken(entry.period));
  });

  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function getPreviousMonth(month: string): string {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const monthNum = Number.parseInt(monthRaw, 10);

  if (!Number.isFinite(year) || !Number.isFinite(monthNum)) {
    return month;
  }

  const date = new Date(year, monthNum - 2, 1);
  return monthKey(date);
}

function isMonthPeriod(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function formatMonthLabel(month: string): string {
  if (!isMonthPeriod(month)) {
    return month;
  }

  const [yearRaw, monthRaw] = month.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const monthNum = Number.parseInt(monthRaw, 10);

  if (!Number.isFinite(year) || !Number.isFinite(monthNum)) {
    return month;
  }

  const date = new Date(year, monthNum - 1, 1);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

function formatMonthShortLabel(month: string): string {
  if (!isMonthPeriod(month)) {
    return month;
  }

  const [yearRaw, monthRaw] = month.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const monthNum = Number.parseInt(monthRaw, 10);

  if (!Number.isFinite(year) || !Number.isFinite(monthNum)) {
    return month;
  }

  const date = new Date(year, monthNum - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short" });
}

export function buildPeriodYearGroups(availableMonths: string[], maxYears = 2): PeriodYearGroup[] {
  const grouped = new Map<string, string[]>();

  availableMonths.forEach((month) => {
    if (!isMonthPeriod(month)) {
      return;
    }

    const year = month.slice(0, 4);
    const current = grouped.get(year) ?? [];
    current.push(month);
    grouped.set(year, current);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, Math.max(1, maxYears))
    .map(([year, months]) => ({
      year,
      months: months.slice().sort((left, right) => right.localeCompare(left)),
    }));
}

function getYtdWindowLabel(referenceDate: Date = new Date()): string {
  return "Jan-" + referenceDate.toLocaleDateString(undefined, { month: "short" });
}

function formatPeriodLabel(period: string, referenceDate: Date = new Date()): string {
  if (period === "all") {
    return "All time";
  }

  if (period === "ytd") {
    return "YTD " + referenceDate.getFullYear() + " (" + getYtdWindowLabel(referenceDate) + ")";
  }

  if (period === "ytd-prev") {
    return "YTD " + (referenceDate.getFullYear() - 1) + " (" + getYtdWindowLabel(referenceDate) + ")";
  }

  if (isMonthPeriod(period)) {
    return formatMonthLabel(period);
  }

  return period;
}

export function getPreviousPeriodKey(period: string, availableMonths: string[]): string | null {
  const sortedMonths = availableMonths.filter((value) => isMonthPeriod(value)).sort((a, b) => a.localeCompare(b));

  if (period === "all") {
    return null;
  }

  if (period === "ytd") {
    return "ytd-prev";
  }

  if (isMonthPeriod(period)) {
    const directPrevious = getPreviousMonth(period);
    if (sortedMonths.includes(directPrevious)) {
      return directPrevious;
    }

    const earlier = sortedMonths.filter((month) => month < period);
    return earlier[earlier.length - 1] ?? directPrevious;
  }

  return null;
}

export function resolvePeriodReferenceDate(availableMonths: string[], fallbackDate: Date): Date {
  const sortedMonths = availableMonths.filter((value) => isMonthPeriod(value)).sort((a, b) => a.localeCompare(b));
  const latestMonth = sortedMonths[sortedMonths.length - 1];
  if (!latestMonth) {
    return fallbackDate;
  }

  const latestMonthEnd = endOfMonthByKey(latestMonth);
  if (!latestMonthEnd) {
    return fallbackDate;
  }

  if (latestMonthEnd.getFullYear() < fallbackDate.getFullYear()) {
    return fallbackDate;
  }

  return latestMonthEnd.getTime() > fallbackDate.getTime() ? fallbackDate : latestMonthEnd;
}

export function describePeriod(
  period: string,
  availableMonths: string[],
  referenceDate: Date = new Date(),
): { currentLabel: string; comparisonLabel: string } {
  const previousPeriod = getPreviousPeriodKey(period, availableMonths);

  if (period === "all") {
    return {
      currentLabel: formatPeriodLabel(period, referenceDate),
      comparisonLabel: "Previous comparison: n/a (cumulative all-time view)",
    };
  }

  if (period === "ytd") {
    return {
      currentLabel: formatPeriodLabel(period, referenceDate),
      comparisonLabel:
        "Previous comparison: " +
        formatPeriodLabel("ytd-prev", referenceDate) +
        " (same " +
        getYtdWindowLabel(referenceDate) +
        " window)",
    };
  }

  if (isMonthPeriod(period)) {
    return {
      currentLabel: formatPeriodLabel(period, referenceDate),
      comparisonLabel:
        "Previous comparison: " +
        formatPeriodLabel(previousPeriod ?? getPreviousMonth(period), referenceDate) +
        " (month-over-month)",
    };
  }

  return {
    currentLabel: period,
    comparisonLabel: previousPeriod
      ? "Previous comparison: " + formatPeriodLabel(previousPeriod, referenceDate)
      : "Previous comparison: n/a",
  };
}

function isIsoDateInPeriod(isoDate: string, period: string, referenceDate: Date = new Date()): boolean {
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

  if (period === "ytd" || period === "ytd-prev") {
    const [yearRaw, monthRaw] = monthToken.split("-");
    const year = Number.parseInt(yearRaw, 10);
    const monthNum = Number.parseInt(monthRaw, 10);

    if (!Number.isFinite(year) || !Number.isFinite(monthNum)) {
      return false;
    }

    const cutoffMonth = referenceDate.getMonth() + 1;
    const targetYear = period === "ytd-prev" ? referenceDate.getFullYear() - 1 : referenceDate.getFullYear();

    return year === targetYear && monthNum <= cutoffMonth;
  }

  return false;
}

export function normalizeJiraQueryConfig(config: JiraQueryConfig | undefined): JiraQueryConfig {
  const fallbackIssueQuery: JiraSavedQuery = {
    id: "default",
    name: "Issues CSV Query",
    jql: "project = YOURPROJECT ORDER BY updated DESC",
    note: "Edit this query for the team scope.",
  };
  const fallbackTimeInStatusQuery: JiraSavedQuery = {
    id: "time-in-status-default",
    name: "Time in Status Query",
    jql: "project = YOURPROJECT ORDER BY updated DESC",
    note: "Use the same team scope/window as your Issues CSV query.",
  };

  const issueQuery = normalizeJiraQueryCollection(config?.issueQuery ?? config, fallbackIssueQuery);
  const timeInStatusQuery = normalizeJiraQueryCollection(
    config?.timeInStatusQuery ?? config?.issueQuery ?? config,
    fallbackTimeInStatusQuery,
  );

  return {
    defaultQueryId: issueQuery.defaultQueryId,
    queries: issueQuery.queries,
    issueQuery,
    timeInStatusQuery,
  };
}

function normalizeJiraQueryCollection(
  config: JiraQueryCollection | undefined,
  fallbackQuery: JiraSavedQuery,
): JiraQueryCollection {
  const queries = (config?.queries ?? [])
    .filter((query) => query.id.trim().length > 0 && query.name.trim().length > 0 && query.jql.trim().length > 0)
    .map((query) => ({
      ...query,
      id: query.id.trim(),
      name: query.name.trim(),
      jql: query.jql.trim(),
      note: query.note?.trim() || undefined,
    }));

  if (queries.length === 0) {
    return {
      defaultQueryId: fallbackQuery.id,
      queries: [fallbackQuery],
    };
  }

  const defaultQueryId =
    config?.defaultQueryId && queries.some((query) => query.id === config.defaultQueryId)
      ? config.defaultQueryId
      : queries[0].id;

  return {
    defaultQueryId,
    queries,
  };
}

function buildTeamConfigWithSavedQueries(
  config: TeamConfig,
  normalizedConfig: JiraQueryConfig,
  target: JiraQueryTarget,
  nextCollection: JiraQueryCollection,
): TeamConfig {
  const hasExplicitTimeInStatusQuery = Boolean(config.jiraQuery?.timeInStatusQuery);
  const issueQuery = target === "issueQuery" ? nextCollection : (normalizedConfig.issueQuery as JiraQueryCollection);
  const timeInStatusQuery =
    target === "timeInStatusQuery"
      ? nextCollection
      : hasExplicitTimeInStatusQuery
        ? (normalizedConfig.timeInStatusQuery as JiraQueryCollection)
        : issueQuery;

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

function resolvePreferredSavedQuery(
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

function createUniqueQueryId(name: string, existing: JiraSavedQuery[]): string {
  const base = slugifyValue(name);
  const existingIds = new Set(existing.map((query) => query.id));

  if (!existingIds.has(base)) {
    return base;
  }

  let index = 2;
  while (existingIds.has(`${base}-${index}`)) {
    index += 1;
  }

  return `${base}-${index}`;
}

export function composeQueryWithTimeWindow(
  baseJql: string,
  window: QueryTimeWindow,
  target: JiraQueryTarget = "issues",
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

  if (!beforeOrder) {
    return `${clause} ${orderByPart}`;
  }

  return `(${beforeOrder}) AND ${clause} ${orderByPart}`;
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

function slugifyValue(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "query";
}

function normalizeVelocityConfig(config: VelocityConfig | undefined): VelocityConfig {
  if (config?.mode === "weekly-ticket-count" || config?.mode === "weekly") {
    return { mode: "weekly-ticket-count" };
  }

  if (config?.mode === "monthly-ticket-count") {
    return { mode: "monthly-ticket-count" };
  }

  if (config?.mode === "monthly-story-points" || config?.mode === "monthly") {
    return { mode: "monthly-story-points" };
  }

  if (config?.mode === "sprint-story-points" || config?.mode === "sprint") {
    const sprintStartDate = normalizeDateOnly(config.sprintStartDate);
    const parsedLength = Number(config.sprintLengthWeeks ?? 2);
    const sprintLengthWeeks = Number.isFinite(parsedLength)
      ? Math.min(12, Math.max(1, Math.round(parsedLength)))
      : 2;

    return {
      mode: "sprint-story-points",
      sprintStartDate,
      sprintLengthWeeks,
    };
  }

  return { mode: "weekly-ticket-count" };
}

function normalizeDateOnly(value: string | undefined): string | undefined {
  const normalized = (value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function normalizeOptionalMappingValue(value: string | undefined): string | undefined {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseOptionalNonNegativeNumberInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function formatOptionalNumberInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function getVelocityUnitLabel(config: VelocityConfig | undefined): string {
  const normalized = normalizeVelocityConfig(config);

  if (normalized.mode === "monthly-ticket-count") {
    return "tickets/month";
  }

  if (normalized.mode === "monthly-story-points") {
    return "story points/month";
  }

  if (normalized.mode === "weekly-ticket-count") {
    return "tickets/week";
  }

  return "story points/sprint";
}

function getVelocityDisplayUnit(config: VelocityConfig | undefined): string {
  const normalized = normalizeVelocityConfig(config);

  if (normalized.mode === "monthly-ticket-count") {
    return "tickets per month";
  }

  if (normalized.mode === "monthly-story-points") {
    return "story points per month";
  }

  if (normalized.mode === "weekly-ticket-count") {
    return "tickets per week";
  }

  if (normalized.mode === "sprint-story-points") {
    return "story points per sprint";
  }

  return "tickets per month";
}

function formatVelocityValue(value: number, config: VelocityConfig | undefined): string {
  return `${value.toFixed(1)} ${getVelocityDisplayUnit(config)}`;
}

function computeSnapshot(
  metrics: TeamMetrics | null,
  periodMonth: string,
  teamConfig: TeamConfig,
  parsedIssues: ParsedIssue[] = [],
  referenceDate: Date = new Date(),
): TeamSnapshot {
  if (!metrics) {
    return {
      done: 0,
      avgCycleTime: null,
      sle: EMPTY_SLE,
      multiSprintPct: 0,
      velocity: 0,
    };
  }

  const details = metrics.doneIssueDetails.filter((item) => isIsoDateInPeriod(item.resolutionDate, periodMonth, referenceDate));
  const issueTypeByKey = new Map<string, string>();
  parsedIssues.forEach((issue) => {
    const key = normalizeTextValue(issue.issueKey);
    if (!key || issueTypeByKey.has(key)) {
      return;
    }
    issueTypeByKey.set(key, issue.issueType);
  });
  const effectiveSleIssueTypes = new Set(
    resolveEffectiveSleIssueTypes(
      teamConfig.sleConfig.issueTypes,
      details.map((item) =>
        item.issueType && item.issueType.trim().length > 0
          ? item.issueType
          : issueTypeByKey.get(normalizeTextValue(item.issueKey)) ?? "",
      ),
    ).map(normalizeTextValue),
  );
  const cycleTimes = details
    .map((item) => item.cycleTimeDays)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  const sleCycleTimes = details
    .filter((item) => {
      const effectiveType =
        item.issueType && item.issueType.trim().length > 0
          ? item.issueType
          : issueTypeByKey.get(normalizeTextValue(item.issueKey)) ?? "";
      return effectiveSleIssueTypes.has(normalizeTextValue(effectiveType));
    })
    .map((item) => item.cycleTimeDays)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  const multiSprintCount = details.filter((item) => item.sprintCount >= 2).length;

  return {
    done: details.length,
    avgCycleTime: cycleTimes.length === 0 ? null : cycleTimes.reduce((sum, value) => sum + value, 0) / cycleTimes.length,
    sle: sleCycleTimes.length === 0 ? EMPTY_SLE : buildSleValues(sleCycleTimes, "ceil"),
    multiSprintPct: details.length === 0 ? 0 : (multiSprintCount / details.length) * 100,
    velocity: computeVelocityValue(details, teamConfig.velocityConfig),
  };
}

function computeVelocityValue(
  details: TeamMetrics["doneIssueDetails"],
  velocityConfig: VelocityConfig | undefined,
): number {
  if (details.length === 0) {
    return 0;
  }

  const normalized = normalizeVelocityConfig(velocityConfig);
  const buckets = new Map<string, number>();
  const useTicketCount = normalized.mode === "monthly-ticket-count" || normalized.mode === "weekly-ticket-count";

  for (const detail of details) {
    if (!detail.resolutionDate) {
      continue;
    }

    const date = new Date(detail.resolutionDate);
    if (Number.isNaN(date.getTime())) {
      continue;
    }

    const bucket = getVelocityBucketKey(date, normalized);
    if (!bucket) {
      continue;
    }

    const amount = useTicketCount
      ? 1
      : detail.storyPoints !== null && Number.isFinite(detail.storyPoints)
        ? detail.storyPoints
        : 1;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + amount);
  }

  if (buckets.size === 0) {
    return 0;
  }

  const total = Array.from(buckets.values()).reduce((sum, value) => sum + value, 0);
  return total / buckets.size;
}

function getVelocityBucketKey(date: Date, config: VelocityConfig): string | null {
  if (config.mode === "weekly-ticket-count") {
    return getIsoWeekBucketKey(date);
  }

  if (config.mode === "sprint-story-points") {
    return getSprintBucketKey(date, config);
  }

  return monthKey(date);
}

function getIsoWeekBucketKey(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const isoDay = utcDate.getUTCDay() || 7;

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - isoDay);

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((utcDate.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
  const week = Math.ceil((diffDays + 1) / 7);

  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getSprintBucketKey(date: Date, config: VelocityConfig): string | null {
  const startDate = normalizeDateOnly(config.sprintStartDate);
  if (!startDate) {
    return null;
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const sprintLengthWeeks = config.sprintLengthWeeks ?? 2;
  const sprintLengthMs = sprintLengthWeeks * 7 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(sprintLengthMs) || sprintLengthMs <= 0) {
    return null;
  }

  const sprintIndex = Math.floor((date.getTime() - start.getTime()) / sprintLengthMs);
  const bucketStart = new Date(start.getTime() + sprintIndex * sprintLengthMs);

  return `SPR-${bucketStart.toISOString().slice(0, 10)}`;
}

function buildTrendBundle(current: TeamSnapshot, previous: TeamSnapshot | null): TrendBundle {
  return {
    done: trend(current.done, previous?.done ?? null, "up"),
    avgCycleTime: trend(current.avgCycleTime, previous?.avgCycleTime ?? null, "down"),
    sleP50: trend(current.sle.p50, previous?.sle.p50 ?? null, "down"),
    sleP70: trend(current.sle.p70, previous?.sle.p70 ?? null, "down"),
    sleP85: trend(current.sle.p85, previous?.sle.p85 ?? null, "down"),
    sleP95: trend(current.sle.p95, previous?.sle.p95 ?? null, "down"),
    multiSprintPct: trend(current.multiSprintPct, previous?.multiSprintPct ?? null, "down"),
    velocity: trend(current.velocity, previous?.velocity ?? null, "up"),
  };
}

function trend(current: number | null, previous: number | null, betterWhen: "up" | "down"): TrendResult {
  if (current === null || previous === null) {
    return { label: "-", tone: "neutral" };
  }

  const epsilon = 0.00001;
  const delta = current - previous;

  if (Math.abs(delta) < epsilon) {
    return { label: "-", tone: "neutral" };
  }

  const base = Math.abs(previous) < epsilon ? 1 : Math.abs(previous);
  const pct = (Math.abs(delta) / base) * 100;

  if (pct < 1) {
    return { label: "-", tone: "neutral" };
  }

  const isUp = delta > 0;
  const good = betterWhen === "up" ? isUp : !isUp;

  return {
    label: `${isUp ? "↑" : "↓"} ${pct.toFixed(1)}%`,
    tone: good ? "good" : "bad",
  };
}

function renderMetricWithTrend(value: string, trendResult: TrendResult): JSX.Element {
  return (
    <div className="metric-cell">
      <span>{value}</span>
      <small className={`trend-pill ${trendResult.tone}`}>{trendResult.label}</small>
    </div>
  );
}

function formatMetricWithTrendCsv(value: string, trendResult: TrendResult): string {
  if (!trendResult.label || trendResult.label === "-") {
    return value;
  }

  return `${value} (${trendResult.label})`;
}

function padCsvColumns(values: string[], columnCount: number): string[] {
  if (values.length >= columnCount) {
    return values;
  }

  return [...values, ...Array.from({ length: columnCount - values.length }, () => "")];
}

function renderMappingInput(
  label: string,
  value: string,
  onChange: (value: string) => void,
): JSX.Element {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function createMetricHealth(tone: HealthTone, reason: string): MetricHealthSignal {
  if (tone === "good") {
    return { tone, label: "Healthy", reason };
  }

  if (tone === "warn") {
    return { tone, label: "Watch", reason };
  }

  if (tone === "bad") {
    return { tone, label: "Action", reason };
  }

  return { tone, label: "N/A", reason };
}

const TEAM_HEALTH_METRIC_META: Record<
  TeamHealthSignalKey,
  { label: string; priority: number; recommendation: string }
> = {
  doneBugRatio: {
    label: "Done Bug Ratio",
    priority: 7,
    recommendation: "Strengthen DoD quality gates and reduce recurring defect causes.",
  },
  intakeVsThroughput: {
    label: "Created vs Delivered",
    priority: 1,
    recommendation: "Temporarily cap intake until delivered work catches up.",
  },
  netFlow: {
    label: "Backlog Flow",
    priority: 2,
    recommendation: "Keep backlog growth near zero by finishing more than you start.",
  },
  throughputStability: {
    label: "Throughput Stability",
    priority: 8,
    recommendation: "Stabilize work item size and reduce unplanned interruptions.",
  },
  wipAgeRisk: {
    label: "WIP Age Risk",
    priority: 3,
    recommendation: "Close stale tickets and split aged work into smaller items.",
  },
  leadTimeByType: {
    label: "Lead Time by Type",
    priority: 6,
    recommendation: "Target the slowest work type first and remove handoff delays.",
  },
  flowEfficiency: {
    label: "Flow Efficiency",
    priority: 4,
    recommendation: "Cut queue/wait states and pull work faster between steps.",
  },
  queueTimeByStatus: {
    label: "Queue Time by Status",
    priority: 5,
    recommendation: "Set WIP limits and swarm on the longest waiting stage.",
  },
  bottleneckTrend: {
    label: "Bottleneck Trend",
    priority: 9,
    recommendation: "Run a focused experiment on the recurring bottleneck stage.",
  },
  forecast: {
    label: "Forecast (Monte Carlo lite)",
    priority: 10,
    recommendation: "Reduce open backlog and stabilize throughput to shorten forecast horizon.",
  },
};

export function buildTeamHealthSignals(snapshot: TeamHealthSnapshot): TeamHealthSignals {
  const doneBugRatio =
    snapshot.bugRatio.doneBugRatio === null
      ? createMetricHealth("neutral", "No delivered work in selected period.")
      : snapshot.bugRatio.doneBugRatio <= 15
        ? createMetricHealth("good", "Low bug share in delivered work.")
        : snapshot.bugRatio.doneBugRatio <= 25
          ? createMetricHealth("warn", "Bug share is moderate; watch quality trend.")
          : createMetricHealth("bad", "High bug share; investigate quality/rework drivers.");

  const intakeVsThroughputRatio =
    snapshot.intakeThroughput.throughputThisMonth === 0
      ? snapshot.intakeThroughput.intakeThisMonth === 0
        ? null
        : Number.POSITIVE_INFINITY
      : snapshot.intakeThroughput.intakeThisMonth / snapshot.intakeThroughput.throughputThisMonth;
  const intakeVsThroughput =
    intakeVsThroughputRatio === null
      ? createMetricHealth("neutral", "No created/delivered work in selected month.")
      : intakeVsThroughputRatio <= 1
        ? createMetricHealth("good", "Delivered keeps up with intake.")
        : intakeVsThroughputRatio <= 1.15
          ? createMetricHealth("warn", "Intake is slightly above delivered output.")
          : createMetricHealth("bad", "Intake is outpacing delivered output; backlog may grow.");

  const netFlowWarnThreshold = Math.max(3, Math.round(snapshot.intakeThroughput.throughputThisMonth * 0.15));
  const netFlow =
    snapshot.netFlow.thisMonth <= 0
      ? createMetricHealth("good", "Backlog is stable or shrinking this month.")
      : snapshot.netFlow.thisMonth <= netFlowWarnThreshold
        ? createMetricHealth("warn", "Backlog is growing slightly this month.")
        : createMetricHealth("bad", "Backlog is growing materially this month.");

  const throughputStability =
    snapshot.throughputStability.weeklyPredictabilityPct === null
      ? createMetricHealth("neutral", "Not enough weekly throughput samples.")
      : snapshot.throughputStability.weeklyPredictabilityPct >= 80
        ? createMetricHealth("good", "Throughput is predictable.")
        : snapshot.throughputStability.weeklyPredictabilityPct >= 50
          ? createMetricHealth("warn", "Throughput predictability is moderate.")
          : createMetricHealth("bad", "Throughput is hard to predict; planning risk is elevated.");

  const wipAgeRisk =
    snapshot.wipRisk.over30Pct <= 25
      ? createMetricHealth("good", "Low share of aging WIP.")
      : snapshot.wipRisk.over30Pct <= 40
        ? createMetricHealth("warn", "Aging WIP is rising; monitor flow blockage.")
        : createMetricHealth("bad", "High aging WIP share; flow needs intervention.");

  const leadTimeAnchor = snapshot.leadTimeByType[0]?.avgDays ?? null;
  const leadTimeByType =
    leadTimeAnchor === null
      ? createMetricHealth("neutral", "No completed issues with valid Created + Resolved.")
      : leadTimeAnchor <= 15
        ? createMetricHealth("good", "Lead time is in healthy range.")
        : leadTimeAnchor <= 30
          ? createMetricHealth("warn", "Lead time is elevated.")
          : createMetricHealth("bad", "Lead time is high; delivery delay risk.");

  const flowEfficiency =
    snapshot.flowEfficiency.valuePct === null
      ? createMetricHealth("neutral", "No Time in Status data for selected period.")
      : snapshot.flowEfficiency.valuePct >= 50
        ? createMetricHealth("good", "Healthy active-work share.")
        : snapshot.flowEfficiency.valuePct >= 30
          ? createMetricHealth("warn", "Queue time is significant.")
          : createMetricHealth("bad", "Most flow time is waiting; improve stage handoffs.");

  const topQueueDays = snapshot.queueTime.topStatuses[0]?.avgDays ?? null;
  const queueTimeByStatus =
    topQueueDays === null
      ? createMetricHealth("neutral", "No queue-time statuses in selected period.")
      : topQueueDays <= 5
        ? createMetricHealth("good", "Top waiting stage is short.")
        : topQueueDays <= 12
          ? createMetricHealth("warn", "Top waiting stage is moderate.")
          : createMetricHealth("bad", "Top waiting stage is long; likely bottleneck.");

  const bottleneckTrend =
    snapshot.bottleneckTrend.monthCount < 2 || snapshot.bottleneckTrend.longestAvgDays === null
      ? createMetricHealth("neutral", "Need more monthly bottleneck history.")
      : snapshot.bottleneckTrend.longestAvgDays <= 7
        ? createMetricHealth("good", "Monthly bottleneck duration is short.")
        : snapshot.bottleneckTrend.longestAvgDays <= 14
          ? createMetricHealth("warn", "Bottleneck duration is moderate.")
          : createMetricHealth("bad", "Long recurring bottleneck duration.");

  const forecast =
    snapshot.forecast.p85Days === null
      ? createMetricHealth("neutral", "Not enough throughput history for forecast.")
      : snapshot.forecast.p85Days <= 30
        ? createMetricHealth("good", "Forecast horizon is short.")
        : snapshot.forecast.p85Days <= 60
          ? createMetricHealth("warn", "Forecast horizon is moderate.")
          : createMetricHealth("bad", "Forecast horizon is long; delivery risk is higher.");

  return {
    doneBugRatio,
    intakeVsThroughput,
    netFlow,
    throughputStability,
    wipAgeRisk,
    leadTimeByType,
    flowEfficiency,
    queueTimeByStatus,
    bottleneckTrend,
    forecast,
  };
}

export function buildMetricDataIssues(
  snapshot: TeamHealthSnapshot,
  teamConfig: TeamConfig | undefined,
): MetricDataIssueMap {
  const issues: MetricDataIssueMap = {};

  if (snapshot.bugRatio.doneBugCount > snapshot.bugRatio.doneTotal) {
    issues.doneBugRatio = {
      tone: "bad",
      message: "Bug count is higher than Done count. Check issue type mapping and duplicate rows.",
    };
  } else if (snapshot.bugRatio.doneTotal === 0) {
    issues.doneBugRatio = {
      tone: "warn",
      message: "No delivered tickets in selected period. Ratio cannot be validated.",
    };
  }

  if (snapshot.throughputStability.weeklySamples < 4) {
    issues.throughputStability = {
      tone: "warn",
      message: "Weekly predictability uses less than 4 non-zero weeks. Score is low-confidence.",
    };
  }

  if (snapshot.leadTimeByType.length === 0) {
    issues.leadTimeByType = {
      tone: "warn",
      message: "No done tickets with Created + Resolved. Lead-time split is unavailable.",
    };
  }

  if (snapshot.flowEfficiency.valuePct === null) {
    issues.flowEfficiency = {
      tone: "bad",
      message: "Time in Status data is missing for selected period.",
    };
  }

  if (snapshot.queueTime.topStatuses.length === 0) {
    issues.queueTimeByStatus = {
      tone: "bad",
      message: "No status timing rows found for selected period.",
    };
  }

  if (snapshot.bottleneckTrend.monthCount < 2) {
    issues.bottleneckTrend = {
      tone: "warn",
      message: "Need at least 2 months of bottleneck data for trend.",
    };
  }

  if (snapshot.forecast.backlogCount <= 0) {
    issues.forecastMonteCarlo = {
      tone: "warn",
      message: "Open backlog is 0 for selected issue types. Forecast is not needed.",
    };
  } else if (snapshot.forecast.p85Days === null) {
    issues.forecastMonteCarlo = {
      tone: "bad",
      message: "No delivered throughput history in the last 90 days for selected issue types.",
    };
  }

  return issues;
}

export function buildDataMonitorEntries(
  issues: ParsedIssue[],
  teamConfig: TeamConfig | undefined,
  selectedPeriod: string,
  metricIssues: MetricDataIssueMap,
  bottleneckEntries: BottleneckEntry[] = [],
  referenceDate: Date = new Date(),
): DataMonitorEntry[] {
  const entries: Array<DataMonitorEntry & { category: "source" | "metric" }> = [];
  const excludedIssueKeys = new Set(
    (teamConfig?.excludedIssueKeys ?? [])
      .map((value) => normalizeTextValue(value))
      .filter((value) => value.length > 0),
  );
  const includedIssues = issues.filter((issue) => !excludedIssueKeys.has(normalizeTextValue(issue.issueKey)));

  (Object.entries(metricIssues) as Array<[MetricHelpKey, MetricDataIssue]>).forEach(([key, issue]) => {
    entries.push({
      id: `metric:${key}`,
      category: "metric",
      tone: issue.tone,
      title: METRIC_HELP[key]?.title ?? key,
      message: issue.message,
      sampleIssueKeys: [],
    });
  });

  if (includedIssues.length === 0) {
    entries.push({
      id: "source:no-issues",
      category: "source",
      tone: "bad",
      title: "No imported issues",
      message: "No parsed Jira issues found for this team. Check imports folder, CSV mapping, and cache refresh.",
      sampleIssueKeys: [],
    });
  }

  const canonicalDoneStatuses = new Set(["done", "closed", "resolved"]);
  const terminalNonWipStatuses = new Set(["cancelled", "canceled", "won't do", "wont do"]);
  const doneSet = new Set(
    (teamConfig?.doneConfig.doneStatuses ?? ["Done", "Closed", "Resolved"])
      .map((value) => normalizeTextValue(value))
      .filter((value) => value.length > 0),
  );

  const isCancelledLike = (issue: ParsedIssue): boolean => {
    const status = normalizeTextValue(issue.status);
    const resolution = normalizeTextValue(issue.resolution);
    return terminalNonWipStatuses.has(status) || terminalNonWipStatuses.has(resolution);
  };

  const isDoneByStatus = (issue: ParsedIssue): boolean => {
    if (isCancelledLike(issue)) {
      return false;
    }

    const status = normalizeTextValue(issue.status);
    return doneSet.has(status) || canonicalDoneStatuses.has(status);
  };

  const doneIssues = includedIssues.filter((issue) => isDoneByStatus(issue));
  const openIssues = includedIssues.filter((issue) => !isDoneByStatus(issue) && !isCancelledLike(issue));
  const sprintScopeStatusSet = new Set(
    resolveSprintScopeStatuses(teamConfig, includedIssues).map((value) => normalizeTextValue(value)),
  );

  const pushFieldEntry = (
    id: string,
    title: string,
    message: string,
    sample: ParsedIssue[],
    tone: DataMonitorEntry["tone"],
  ): void => {
    entries.push({
      id,
      category: "source",
      tone,
      title,
      message,
      sampleIssueKeys: buildIssueKeySamples(sample),
    });
  };

  const doneMissingDeliveryDate = doneIssues.filter((issue) => getIssueDeliveryDate(issue) === null);
  if (doneMissingDeliveryDate.length > 0) {
    pushFieldEntry(
      "source:done-missing-delivery-date",
      "Delivery date missing on done items",
      `Throughput and period-based done counts ignore ${doneMissingDeliveryDate.length} done ticket(s) because Resolved/Updated is empty.`,
      doneMissingDeliveryDate,
      resolveDataMonitorTone(doneMissingDeliveryDate.length, doneIssues.length, 0.2),
    );
  }

  const doneMissingCreated = doneIssues.filter((issue) => issue.created === null);
  if (doneMissingCreated.length > 0) {
    pushFieldEntry(
      "source:done-missing-created",
      "Created missing on done items",
      `Cycle time and lead-time calculations skip ${doneMissingCreated.length} done ticket(s) because Created is empty.`,
      doneMissingCreated,
      resolveDataMonitorTone(doneMissingCreated.length, doneIssues.length, 0.2),
    );
  }

  const openMissingCreated = openIssues.filter((issue) => issue.created === null);
  if (openMissingCreated.length > 0) {
    pushFieldEntry(
      "source:open-missing-created",
      "Created missing on open items",
      `Aging WIP excludes ${openMissingCreated.length} open ticket(s) because Created is empty.`,
      openMissingCreated,
      resolveDataMonitorTone(openMissingCreated.length, openIssues.length, 0.2),
    );
  }

  const missingIssueType = includedIssues.filter((issue) => normalizeTextValue(issue.issueType).length === 0);
  if (missingIssueType.length > 0) {
    pushFieldEntry(
      "source:missing-issue-type",
      "Issue Type missing",
      `Bug ratio and SLE issue-type filters cannot classify ${missingIssueType.length} ticket(s) because Issue Type is empty.`,
      missingIssueType,
      resolveDataMonitorTone(missingIssueType.length, includedIssues.length, 0.1),
    );
  }

  const bugIssueTypeSet = new Set(
    (teamConfig?.bugConfig?.issueTypes ?? ["Bug"])
      .map((value) => normalizeTextValue(value))
      .filter((value) => value.length > 0),
  );
  const isBugIssueType = (issue: ParsedIssue): boolean => {
    const type = normalizeTextValue(issue.issueType);
    return bugIssueTypeSet.size === 0 ? type === "bug" : bugIssueTypeSet.has(type);
  };
  const isStoryIssueType = (issue: ParsedIssue): boolean => {
    const type = normalizeTextValue(issue.issueType);
    return type === "story" || type === "userstory" || type === "user story";
  };
  const isTaskIssueType = (issue: ParsedIssue): boolean => {
    const type = normalizeTextValue(issue.issueType);
    return type === "task" || type === "subtask" || type === "sub-task";
  };

  const doneStoryMissingEstimate = doneIssues.filter(
    (issue) => issue.storyPoints === null && isStoryIssueType(issue) && !isBugIssueType(issue),
  );
  if (doneStoryMissingEstimate.length > 0) {
    pushFieldEntry(
      "source:done-story-estimate-missing",
      "Done Story estimate missing",
      `${doneStoryMissingEstimate.length} done Story ticket(s) have no story points. Story estimates are expected for completed Stories.`,
      doneStoryMissingEstimate,
      "warn",
    );
  }

  const doneTaskMissingEstimate = doneIssues.filter(
    (issue) => issue.storyPoints === null && isTaskIssueType(issue) && !isBugIssueType(issue),
  );
  if (doneTaskMissingEstimate.length > 0) {
    pushFieldEntry(
      "source:done-task-estimate-missing",
      "Done Task estimate optional",
      `${doneTaskMissingEstimate.length} done Task ticket(s) have no story points. Task estimates are nice to have, but not required.`,
      doneTaskMissingEstimate,
      "info",
    );
  }

  const sprintManagedOpenIssues = openIssues.filter((issue) => sprintScopeStatusSet.has(normalizeTextValue(issue.status)));
  const missingSprint = [...doneIssues, ...sprintManagedOpenIssues].filter((issue) => normalizeTextValue(issue.sprintRaw).length === 0);
  if (missingSprint.length > 0) {
    pushFieldEntry(
      "source:missing-sprint",
      "Sprint field missing",
      `Sprint discipline metrics rely on Sprint data, but ${missingSprint.length} done or active-flow ticket(s) have Sprint empty.`,
      missingSprint,
      resolveDataMonitorTone(missingSprint.length, Math.max(1, doneIssues.length + sprintManagedOpenIssues.length), 0.5),
    );
  }

  if (bottleneckEntries.length === 0) {
    entries.push({
      id: "source:time-in-status-missing",
      category: "source",
      tone: "bad",
      title: "Time in Status missing",
      message:
        "Time in Status CSV is not available. Flow Efficiency, Queue Time, and Bottleneck Trend cannot be validated.",
      sampleIssueKeys: [],
    });
  } else if (isMonthPeriod(selectedPeriod) && !bottleneckEntries.some((entry) => entry.period === selectedPeriod)) {
    const fallback = resolveBottleneckEntryForPeriod(bottleneckEntries, selectedPeriod);
    if (fallback) {
      entries.push({
        id: `source:time-in-status-fallback:${selectedPeriod}`,
        category: "source",
        tone: "warn",
        title: "Time in Status month missing",
        message:
          `No Time in Status row for ${formatPeriodLabel(selectedPeriod, referenceDate)}. ` +
          `Flow metrics currently use ${formatPeriodLabel(fallback.period, referenceDate)} instead.`,
        sampleIssueKeys: [],
      });
    }
  }

  return entries
    .sort((left, right) => {
      if (left.tone !== right.tone) {
        return getDataMonitorToneRank(left.tone) - getDataMonitorToneRank(right.tone);
      }
      if (left.category !== right.category) {
        return left.category === "source" ? -1 : 1;
      }
      return left.title.localeCompare(right.title);
    })
    .map(({ category: _category, ...entry }) => entry);
}

function getDataMonitorToneRank(tone: DataMonitorEntry["tone"]): number {
  if (tone === "bad") {
    return 0;
  }
  if (tone === "warn") {
    return 1;
  }
  return 2;
}

function buildIssueKeySamples(issues: ParsedIssue[], limit = 3): string[] {
  const seen = new Set<string>();
  const samples: string[] = [];

  for (const issue of issues) {
    const key = issue.issueKey.trim();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    samples.push(key);
    if (samples.length >= limit) {
      break;
    }
  }

  return samples;
}

function resolveDataMonitorTone(
  count: number,
  total: number,
  badThreshold: number,
): "warn" | "bad" {
  if (count <= 0) {
    return "warn";
  }

  if (total <= 0) {
    return "bad";
  }

  return count / total >= badThreshold ? "bad" : "warn";
}

export function buildTeamHealthCheckSummary(signals: TeamHealthSignals): TeamHealthCheckSummary {
  const entries = (Object.keys(signals) as TeamHealthSignalKey[]).map((key) => ({
    key,
    signal: signals[key],
    meta: TEAM_HEALTH_METRIC_META[key],
  }));

  const healthyCount = entries.filter((entry) => entry.signal.tone === "good").length;
  const watchCount = entries.filter((entry) => entry.signal.tone === "warn").length;
  const actionCount = entries.filter((entry) => entry.signal.tone === "bad").length;
  const neutralCount = entries.filter((entry) => entry.signal.tone === "neutral").length;

  const attentionEntries = entries
    .filter((entry) => entry.signal.tone === "bad" || entry.signal.tone === "warn")
    .sort((a, b) => {
      if (a.signal.tone !== b.signal.tone) {
        return a.signal.tone === "bad" ? -1 : 1;
      }
      return a.meta.priority - b.meta.priority;
    });

  const criticalActions: TeamHealthAction[] = attentionEntries
    .filter((entry) => entry.signal.tone === "bad")
    .map((entry) => ({
      key: entry.key,
      label: entry.meta.label,
      tone: "bad",
      reason: entry.signal.reason,
      recommendation: entry.meta.recommendation,
    }));

  const topActions: TeamHealthAction[] = attentionEntries.slice(0, 3).map((entry) => ({
    key: entry.key,
    label: entry.meta.label,
    tone: entry.signal.tone as "warn" | "bad",
    reason: entry.signal.reason,
    recommendation: entry.meta.recommendation,
  }));

  const summary =
    actionCount === 0 && watchCount === 0
      ? "All scored indicators are healthy."
      : actionCount === 0
        ? `${watchCount} indicator(s) need attention soon, no critical blockers right now.`
        : `${actionCount} critical indicator(s) need action first, plus ${watchCount} watch item(s).`;

  return {
    totalMetrics: entries.length,
    healthyCount,
    watchCount,
    actionCount,
    neutralCount,
    summary,
    criticalActions,
    topActions,
  };
}

function formatDays(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return `${value.toFixed(1)} days`;
}

function formatPercentValue(value: number): string {
  return value.toFixed(1);
}

function formatNumber(value: number | null, digits: number): string {
  if (value === null) {
    return "";
  }
  return value.toFixed(digits);
}

function formatSignedNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function formatDateText(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString();
}

function getIssueDeliveryDate(issue: ParsedIssue): Date | null {
  return issue.resolutionDate ?? issue.updated;
}

function formatSprintBucketLabel(bucket: string): string {
  if (!bucket.startsWith("SPR-")) {
    return bucket;
  }

  const value = bucket.replace(/^SPR-/, "");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return bucket;
  }

  return `Sprint ${date.toLocaleDateString()}`;
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildTeamProgressSnapshot(team: TeamRuntime, now: Date): TeamProgressSnapshot {
  const health = computeTeamHealthSnapshot(
    team.parsedIssues,
    team.config,
    "all",
    now,
    buildEffectiveBottleneckEntries(team),
  );

  return {
    capturedAt: now.toISOString(),
    importSignature: buildTeamImportSignature(team),
    metrics: {
      doneCount: team.metrics?.doneIssues ?? null,
      avgCycleTimeDays: team.metrics?.avgCycleTimeDays ?? null,
      sleP50Days: team.metrics?.sle.values.p50 ?? null,
      sleP70Days: team.metrics?.sle.values.p70 ?? null,
      sleP85Days: team.metrics?.sle.values.p85 ?? null,
      sleP95Days: team.metrics?.sle.values.p95 ?? null,
      multiSprintPct: team.metrics?.multiSprint.percentage ?? null,
      velocityLatest: getLatestVelocityValue(team.metrics),
      doneBugRatioPct: health.bugRatio.doneBugRatio,
      openWipCount: health.agingWip.total,
      openWipAvgAgeDays: health.agingWip.avgDays,
    },
  };
}

function buildTeamImportSignature(team: TeamRuntime): string {
  if (team.importFiles.length === 0) {
    return `none:${team.teamId}`;
  }

  return team.importFiles
    .slice()
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map((item) => `${item.relativePath}:${item.updatedAt}:${item.rowCount}`)
    .join("|");
}

function getLatestVelocityValue(metrics: TeamMetrics | null): number | null {
  if (!metrics || metrics.velocityMonthly.length === 0) {
    return null;
  }

  const latest = metrics.velocityMonthly
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))
    .at(-1);

  return latest?.value ?? null;
}

export function buildProgressComparisonSummary(history: TeamProgressSnapshot[]): ProgressComparisonSummary {
  const sorted = history
    .slice()
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  const latest = sorted.at(-1) ?? null;
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  if (!latest || !previous) {
    return {
      hasBaseline: false,
      latest,
      previous,
      improvedCount: 0,
      worsenedCount: 0,
      unchangedCount: 0,
      rows: [],
    };
  }

  const rows: ProgressComparisonMetricRow[] = [
    compareProgressMetric("Avg Cycle Time", "down", "days", latest.metrics.avgCycleTimeDays, previous.metrics.avgCycleTimeDays),
    compareProgressMetric("SLE P85", "down", "days", latest.metrics.sleP85Days, previous.metrics.sleP85Days),
    compareProgressMetric("2+ Sprint %", "down", "percent", latest.metrics.multiSprintPct, previous.metrics.multiSprintPct),
    compareProgressMetric("Velocity (latest)", "up", "count", latest.metrics.velocityLatest, previous.metrics.velocityLatest),
    compareProgressMetric("Done Bug Ratio", "down", "percent", latest.metrics.doneBugRatioPct, previous.metrics.doneBugRatioPct),
    compareProgressMetric("Open WIP count", "down", "count", latest.metrics.openWipCount, previous.metrics.openWipCount),
    compareProgressMetric("Open WIP avg age", "down", "days", latest.metrics.openWipAvgAgeDays, previous.metrics.openWipAvgAgeDays),
  ];

  return {
    hasBaseline: true,
    latest,
    previous,
    improvedCount: rows.filter((row) => row.trend === "improved").length,
    worsenedCount: rows.filter((row) => row.trend === "worsened").length,
    unchangedCount: rows.filter((row) => row.trend === "unchanged").length,
    rows,
  };
}

function compareProgressMetric(
  label: string,
  betterWhen: "up" | "down",
  unit: "days" | "percent" | "count",
  current: number | null,
  previous: number | null,
): ProgressComparisonMetricRow {
  const trend = resolveProgressTrend(current, previous, betterWhen, unit);
  return {
    label,
    betterWhen,
    unit,
    current,
    previous,
    trend,
  };
}

function resolveProgressTrend(
  current: number | null,
  previous: number | null,
  betterWhen: "up" | "down",
  unit: "days" | "percent" | "count",
): ProgressComparisonMetricRow["trend"] {
  if (current === null || previous === null) {
    return "n/a";
  }

  const delta = current - previous;
  const epsilon = unit === "count" ? 0 : 0.1;
  if (Math.abs(delta) <= epsilon) {
    return "unchanged";
  }

  if (betterWhen === "up") {
    return delta > 0 ? "improved" : "worsened";
  }

  return delta < 0 ? "improved" : "worsened";
}

function formatProgressMetricValue(value: number | null, unit: "days" | "percent" | "count"): string {
  if (value === null) {
    return "-";
  }

  if (unit === "days") {
    return `${value.toFixed(1)} days`;
  }

  if (unit === "percent") {
    return `${value.toFixed(1)}%`;
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatProgressTrendLabel(trend: ProgressComparisonMetricRow["trend"]): string {
  if (trend === "improved") {
    return "Improved";
  }
  if (trend === "worsened") {
    return "Worsened";
  }
  if (trend === "unchanged") {
    return "No change";
  }
  return "N/A";
}

function buildProgressStatusText(summary: ProgressComparisonSummary): string {
  if (!summary.latest) {
    return "No progress snapshot yet.";
  }

  if (!summary.hasBaseline) {
    return "Progress baseline saved.";
  }

  return `Progress vs previous upload: Improved ${summary.improvedCount}, Worsened ${summary.worsenedCount}, No change ${summary.unchangedCount}.`;
}

function resolveBottleneckPeriod(period: string, availableMonths: string[], referenceDate: Date = new Date()): string {
  if (isMonthPeriod(period)) {
    return period;
  }

  const sorted = availableMonths.filter((month) => isMonthPeriod(month)).sort((a, b) => a.localeCompare(b));
  return sorted[sorted.length - 1] ?? monthKey(referenceDate);
}

export function getBottleneckForPeriod(entries: BottleneckEntry[], period: string): string {
  if (entries.length === 0) {
    return "-";
  }

  let entry = entries.find((item) => item.period === period);

  if (!entry) {
    const monthEntries = entries
      .filter((item) => isMonthPeriod(item.period))
      .sort((a, b) => a.period.localeCompare(b.period));

    if (isMonthPeriod(period)) {
      const previousOrSame = monthEntries.filter((item) => item.period <= period);
      entry = previousOrSame[previousOrSame.length - 1] ?? monthEntries[monthEntries.length - 1];
    } else {
      entry = monthEntries[monthEntries.length - 1];
    }
  }

  if (!entry) {
    return "-";
  }

  const bottleneck = getMaxBottleneckColumn(entry);
  if (!bottleneck) {
    return "-";
  }

  if (entry.period !== period) {
    return `${bottleneck.name} (${bottleneck.avgDays.toFixed(1)} days, ${formatMonthLabel(entry.period)})`;
  }

  return `${bottleneck.name} (${bottleneck.avgDays.toFixed(1)} days)`;
}

function getMaxBottleneckColumn(entry: BottleneckEntry): BottleneckEntry["columns"][number] | null {
  if (!entry.columns || entry.columns.length === 0) {
    return null;
  }

  return entry.columns.reduce((max, column) => (column.avgDays > max.avgDays ? column : max));
}

function buildBoardStatusMap(issues: ParsedIssue[]): Map<string, string> {
  const statuses = new Map<string, string>();

  issues.forEach((issue) => {
    const label = issue.status.trim();
    if (!label) {
      return;
    }

    const key = normalizeTextValue(label);
    if (!key || statuses.has(key)) {
      return;
    }

    statuses.set(key, label);
  });

  return statuses;
}

function getBottleneckColumnsForBoard(
  entry: BottleneckEntry | null,
  boardStatuses: Map<string, string>,
): BottleneckEntry["columns"] {
  if (!entry || !entry.columns || entry.columns.length === 0) {
    return [];
  }

  return entry.columns
    .filter((column) => {
      if (!Number.isFinite(column.avgDays) || column.avgDays <= 0) {
        return false;
      }

      const key = normalizeTextValue(column.name);
      if (!key) {
        return false;
      }

      if (boardStatuses.size === 0) {
        return true;
      }

      return boardStatuses.has(key);
    })
    .map((column) => {
      const key = normalizeTextValue(column.name);
      const statusName = boardStatuses.get(key) ?? column.name;
      return {
        ...column,
        name: statusName,
      };
    });
}

function getTimeInStatusStatusCategory(statusName: string): TimeInStatusStatusCategory {
  const normalized = normalizeTextValue(statusName);
  if (!normalized) {
    return "other";
  }

  const terminalHints = ["done", "closed", "resolved", "cancelled", "canceled", "deployed", "released"];
  if (terminalHints.some((hint) => normalized.includes(hint))) {
    return "done";
  }

  if (isActiveFlowStatus(statusName)) {
    return "active";
  }

  const queueHints = [
    "backlog",
    "to do",
    "todo",
    "selected for",
    "open",
    "queue",
    "ready",
    "pending",
    "blocked",
    "wait",
    "waiting",
    "on hold",
    "hold",
    "analysis",
    "triage",
  ];
  if (queueHints.some((hint) => normalized.includes(hint))) {
    return "queue";
  }

  return "other";
}

function getTimeInStatusCategoryLabel(category: TimeInStatusStatusCategory): string {
  if (category === "queue") {
    return "Queue";
  }

  if (category === "active") {
    return "Active";
  }

  if (category === "done") {
    return "Done";
  }

  return "Other";
}

function getTimeInStatusTone(statusName: string, avgDays: number, category: TimeInStatusStatusCategory): HealthTone {
  if (!Number.isFinite(avgDays) || avgDays <= 0) {
    return "neutral";
  }

  if (category === "done") {
    return "neutral";
  }

  const normalized = normalizeTextValue(statusName);
  const severeQueue =
    category === "queue" &&
    ["blocked", "wait", "waiting", "on hold", "hold", "pending"].some((hint) => normalized.includes(hint));

  if (category === "queue") {
    if (severeQueue) {
      return avgDays <= 2 ? "good" : avgDays <= 5 ? "warn" : "bad";
    }

    return avgDays <= 4 ? "good" : avgDays <= 8 ? "warn" : "bad";
  }

  if (category === "active") {
    return avgDays <= 7 ? "good" : avgDays <= 14 ? "warn" : "bad";
  }

  return avgDays <= 5 ? "good" : avgDays <= 10 ? "warn" : "bad";
}

function getTimeInStatusSignal(category: TimeInStatusStatusCategory, tone: HealthTone): string {
  if (category === "done") {
    return "Terminal stage tracked, not treated as risk.";
  }

  if (category === "queue") {
    if (tone === "good") {
      return "Queue stage looks short enough.";
    }
    if (tone === "warn") {
      return "Queue stage is building up.";
    }
    return "Queue stage is too long for healthy flow.";
  }

  if (category === "active") {
    if (tone === "good") {
      return "Active work is moving.";
    }
    if (tone === "warn") {
      return "Active work is slowing down.";
    }
    return "Active work is aging and likely overloaded.";
  }

  if (tone === "good") {
    return "Duration looks reasonable.";
  }
  if (tone === "warn") {
    return "Duration is elevated.";
  }
  if (tone === "bad") {
    return "Duration is too high.";
  }

  return "No signal.";
}

export function buildTimeInStatusRows(
  entry: BottleneckEntry | null,
  boardStatuses: Map<string, string>,
): TimeInStatusStatusRow[] {
  const rows = getBottleneckColumnsForBoard(entry, boardStatuses)
    .slice()
    .sort((left, right) => {
      if (right.avgDays !== left.avgDays) {
        return right.avgDays - left.avgDays;
      }
      return left.name.localeCompare(right.name);
    })
    .map((column) => {
      const category = getTimeInStatusStatusCategory(column.name);
      const tone = getTimeInStatusTone(column.name, column.avgDays, category);
      return {
        name: column.name,
        avgDays: column.avgDays,
        category,
        categoryLabel: getTimeInStatusCategoryLabel(category),
        tone,
        highlight: false,
        signal: getTimeInStatusSignal(category, tone),
      };
    });

  const highlighted = new Set(
    rows
      .filter((row) => row.tone === "warn" || row.tone === "bad")
      .slice(0, 3)
      .map((row) => normalizeTextValue(row.name)),
  );

  return rows.map((row) => ({
    ...row,
    highlight: highlighted.has(normalizeTextValue(row.name)),
  }));
}

function getMaxBottleneckColumnForBoard(
  entry: BottleneckEntry | null,
  boardStatuses: Map<string, string>,
): BottleneckEntry["columns"][number] | null {
  const columns = getBottleneckColumnsForBoard(entry, boardStatuses);
  if (columns.length === 0) {
    return null;
  }

  return columns.reduce((max, column) => (column.avgDays > max.avgDays ? column : max));
}

function buildEffectiveBottleneckEntries(team: TeamRuntime | null): BottleneckEntry[] {
  if (!team) {
    return [];
  }

  const byPeriod = new Map<string, BottleneckEntry>();
  team.autoBottleneck.forEach((entry) => {
    byPeriod.set(entry.period, entry);
  });
  team.manualBottleneck.forEach((entry) => {
    byPeriod.set(entry.period, entry);
  });

  return Array.from(byPeriod.values()).sort((a, b) => a.period.localeCompare(b.period));
}

function normalizeFlowStatuses(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  values.forEach((value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push(trimmed);
  });

  return normalized;
}

function inferFlowStatusesFromEntries(entries: BottleneckEntry[]): string[] {
  if (entries.length === 0) {
    return [];
  }

  const latest = entries
    .slice()
    .sort((a, b) => b.period.localeCompare(a.period))[0];

  return normalizeFlowStatuses(latest.columns.map((column) => column.name));
}

function resolveSprintScopeStatuses(teamConfig: TeamConfig | undefined, issues: ParsedIssue[]): string[] {
  const configured = normalizeFlowStatuses(teamConfig?.sprintScopeConfig?.statuses ?? []);
  if (configured.length > 0) {
    return configured;
  }

  const flowTemplateStatuses = normalizeFlowStatuses(teamConfig?.bottleneckConfig?.flowStatuses ?? []).filter(
    (status) => isDefaultSprintScopeStatus(status),
  );
  if (flowTemplateStatuses.length > 0) {
    return flowTemplateStatuses;
  }

  return Array.from(buildBoardStatusMap(issues).values()).filter((status) => isDefaultSprintScopeStatus(status));
}

function buildBottleneckRowsFromStatuses(statuses: string[]): BottleneckDraftRow[] {
  const normalized = normalizeFlowStatuses(statuses);
  if (normalized.length === 0) {
    return [createEmptyBottleneckRow()];
  }

  return normalized.map((statusName) => ({
    id: buildBottleneckRowId(),
    name: statusName,
    weeks: "",
    days: "",
    hours: "",
  }));
}

function createEmptyBottleneckRow(): BottleneckDraftRow {
  return {
    id: buildBottleneckRowId(),
    name: "",
    weeks: "",
    days: "",
    hours: "",
  };
}

function buildBottleneckRows(columns: BottleneckEntry["columns"]): BottleneckDraftRow[] {
  if (columns.length === 0) {
    return [createEmptyBottleneckRow()];
  }

  return columns.map((column) => {
    const duration = convertDaysToDurationUnits(column.avgDays);

    return {
      id: buildBottleneckRowId(),
      name: column.name,
      weeks: duration.weeks > 0 ? String(duration.weeks) : "",
      days: duration.days > 0 ? String(duration.days) : "",
      hours: duration.hours > 0 ? String(duration.hours) : "",
    };
  });
}

function rowsToBottleneckColumns(rows: BottleneckDraftRow[]): BottleneckEntry["columns"] {
  const parsed: BottleneckEntry["columns"] = [];

  rows.forEach((row) => {
    const name = row.name.trim();
    if (!name) {
      return;
    }

    const weeks = parseDurationUnitValue(row.weeks);
    const days = parseDurationUnitValue(row.days);
    const hours = parseDurationUnitValue(row.hours);

    const totalHours = weeks * 7 * 24 + days * 24 + hours;
    if (totalHours <= 0) {
      return;
    }

    parsed.push({
      name,
      avgDays: totalHours / 24,
    });
  });

  return parsed;
}

function sanitizeDurationInput(value: string): string {
  const digitsOnly = value.replace(/[^\d]/g, "");

  if (digitsOnly.length === 0) {
    return "";
  }

  return String(Number(digitsOnly));
}

function parseDurationUnitValue(value: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return Math.floor(numeric);
}

function convertDaysToDurationUnits(avgDays: number): { weeks: number; days: number; hours: number } {
  if (!Number.isFinite(avgDays) || avgDays <= 0) {
    return { weeks: 0, days: 0, hours: 0 };
  }

  const totalHours = Math.round(avgDays * 24);
  const hoursInWeek = 7 * 24;

  const weeks = Math.floor(totalHours / hoursInWeek);
  const remainingAfterWeeks = totalHours - weeks * hoursInWeek;
  const days = Math.floor(remainingAfterWeeks / 24);
  const hours = remainingAfterWeeks - days * 24;

  return { weeks, days, hours };
}

function buildBottleneckRowId(): string {
  return "bn-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

export function computeTeamHealthSnapshot(
  issues: ParsedIssue[],
  teamConfig: TeamConfig | undefined,
  selectedPeriod: string,
  now: Date,
  bottleneckEntries: BottleneckEntry[] = [],
): TeamHealthSnapshot {
  const excludedIssueKeys = new Set(
    (teamConfig?.excludedIssueKeys ?? [])
      .map((value) => normalizeTextValue(value))
      .filter((value) => value.length > 0),
  );
  const includedIssues = issues.filter((issue) => !excludedIssueKeys.has(normalizeTextValue(issue.issueKey)));

  const canonicalDoneStatuses = new Set(["done", "closed", "resolved"]);
  const terminalNonWipStatuses = new Set(["cancelled", "canceled", "won't do", "wont do"]);

  const doneSet = new Set(
    (teamConfig?.doneConfig.doneStatuses ?? ["Done", "Closed", "Resolved"])
      .map((value) => normalizeTextValue(value))
      .filter((value) => value.length > 0),
  );

  const bugSet = new Set(
    (teamConfig?.bugConfig?.issueTypes ?? ["Bug"])
      .map((value) => normalizeTextValue(value))
      .filter((value) => value.length > 0),
  );

  const isCancelledLike = (issue: ParsedIssue): boolean => {
    const status = normalizeTextValue(issue.status);
    const resolution = normalizeTextValue(issue.resolution);
    return terminalNonWipStatuses.has(status) || terminalNonWipStatuses.has(resolution);
  };

  const isDoneByStatus = (issue: ParsedIssue): boolean => {
    if (isCancelledLike(issue)) {
      return false;
    }

    const status = normalizeTextValue(issue.status);
    return doneSet.has(status) || canonicalDoneStatuses.has(status);
  };

  const isBug = (issue: ParsedIssue): boolean => {
    if (bugSet.size === 0) {
      return normalizeTextValue(issue.issueType) === "bug";
    }

    return bugSet.has(normalizeTextValue(issue.issueType));
  };

  const throughputAnchor = resolveThroughputAnchor(selectedPeriod, now, includedIssues);
  const monthNow = throughputAnchor.month;
  const monthPrev = getPreviousMonth(monthNow);
  const anchorMs = throughputAnchor.anchorMs;
  const monthStart = startOfMonthByKey(monthNow) ?? startOfDay(new Date(anchorMs));
  const last30Start = new Date(anchorMs - 29 * 24 * 60 * 60 * 1000);
  const doneWithDeliveryDate = includedIssues.filter((issue) => isDoneByStatus(issue) && getIssueDeliveryDate(issue) !== null);
  const createdWithDate = includedIssues.filter((issue) => issue.created !== null);

  const throughput = {
    anchorMonth: monthNow,
    comparisonMonth: monthPrev,
    thisMonth: doneWithDeliveryDate.filter((issue) => {
      const deliveryDate = getIssueDeliveryDate(issue);
      return deliveryDate !== null && deliveryDate.toISOString().slice(0, 7) === monthNow;
    }).length,
    lastMonth: doneWithDeliveryDate.filter((issue) => {
      const deliveryDate = getIssueDeliveryDate(issue);
      return deliveryDate !== null && deliveryDate.toISOString().slice(0, 7) === monthPrev;
    }).length,
    last30Days: doneWithDeliveryDate.filter((issue) => {
      const deliveryDate = getIssueDeliveryDate(issue);
      return (
        deliveryDate !== null &&
        deliveryDate.getTime() >= last30Start.getTime() &&
        deliveryDate.getTime() <= anchorMs
      );
    }).length,
  };

  const intakeThroughput = {
    anchorMonth: monthNow,
    comparisonMonth: monthPrev,
    intakeThisMonth: createdWithDate.filter((issue) => {
      return issue.created !== null && issue.created.getTime() >= monthStart.getTime() && issue.created.getTime() <= anchorMs;
    }).length,
    throughputThisMonth: throughput.thisMonth,
    intakeLast30Days: createdWithDate.filter((issue) => {
      return issue.created !== null && issue.created.getTime() >= last30Start.getTime() && issue.created.getTime() <= anchorMs;
    }).length,
    throughputLast30Days: throughput.last30Days,
  };

  const netFlow = {
    thisMonth: intakeThroughput.intakeThisMonth - intakeThroughput.throughputThisMonth,
    last30Days: intakeThroughput.intakeLast30Days - intakeThroughput.throughputLast30Days,
  };

  const throughputStability = buildThroughputStabilitySnapshot(doneWithDeliveryDate, anchorMs, monthNow);

  const doneInPeriod = doneWithDeliveryDate.filter((issue) => {
    const deliveryDate = getIssueDeliveryDate(issue);
    return deliveryDate !== null && isIsoDateInPeriod(deliveryDate.toISOString(), selectedPeriod, now);
  });
  const updatedInPeriod = includedIssues.filter((issue) => {
    if (issue.updated) {
      return isIsoDateInPeriod(issue.updated.toISOString(), selectedPeriod, now);
    }

    if (issue.created) {
      return isIsoDateInPeriod(issue.created.toISOString(), selectedPeriod, now);
    }

    return false;
  });

  const doneBugCount = doneInPeriod.filter((issue) => isBug(issue)).length;
  const doneTotal = doneInPeriod.length;
  const leadTimeByType = buildLeadTimeByTypeSnapshot(doneInPeriod);
  const inSprintUpdatedInPeriod = updatedInPeriod.filter((issue) => countSprints(issue.sprintRaw) > 0);
  const inSprintUnestimatedCount = inSprintUpdatedInPeriod.filter((issue) => issue.storyPoints === null).length;
  const deliveredOutsideSprintCount = doneInPeriod.filter((issue) => countSprints(issue.sprintRaw) === 0).length;
  const deliveredInSprintCount = doneInPeriod.filter((issue) => countSprints(issue.sprintRaw) > 0).length;

  const wipIssues = includedIssues.filter((issue) => {
    return !isDoneByStatus(issue) && !isCancelledLike(issue);
  });
  const wipBugCount = wipIssues.filter((issue) => isBug(issue)).length;

  const todayStart = startOfDay(now).getTime();
  const wipAgingItems: AgingWipItem[] = wipIssues
    .filter((issue) => issue.created !== null)
    .map((issue) => {
      const createdDate = issue.created as Date;
      const ageMs = todayStart - startOfDay(createdDate).getTime();
      const agingDays = Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)));
      return {
        issueKey: issue.issueKey,
        status: issue.status,
        issueType: issue.issueType,
        created: createdDate.toISOString(),
        agingDays,
      };
    })
    .sort((a, b) => b.agingDays - a.agingDays);

  const agingValues = wipAgingItems.map((item) => item.agingDays);
  const avgDays =
    agingValues.length === 0
      ? null
      : agingValues.reduce((sum, value) => sum + value, 0) / agingValues.length;

  const over30 = wipAgingItems.filter((item) => item.agingDays > 30).length;
  const over60 = wipAgingItems.filter((item) => item.agingDays > 60).length;
  const over90 = wipAgingItems.filter((item) => item.agingDays > 90).length;
  const wipRisk = buildWipRiskSnapshot(wipAgingItems, wipIssues.length);
  const wipRiskHeatmap = buildWipRiskHeatmapSnapshot(wipAgingItems);
  const selectedBottleneckEntry = resolveBottleneckEntryForPeriod(bottleneckEntries, selectedPeriod);
  const flowEfficiency = buildFlowEfficiencySnapshot(selectedBottleneckEntry, selectedPeriod);
  const queueTime = buildQueueTimeSnapshot(
    selectedBottleneckEntry,
    selectedPeriod,
    buildBoardStatusMap(includedIssues),
  );
  const bottleneckTrend = buildBottleneckTrendSnapshot(bottleneckEntries);
  const forecast = buildForecastSnapshot(doneWithDeliveryDate, wipIssues, teamConfig, now);
  const sprintPredictability = buildSprintPredictabilitySnapshot(includedIssues, isDoneByStatus, teamConfig, now);

  return {
    throughput,
    intakeThroughput,
    netFlow,
    throughputStability,
    wipRisk,
    wipRiskHeatmap,
    flowEfficiency,
    queueTime,
    bottleneckTrend,
    forecast,
    sprintPredictability,
    sprintWork: {
      inSprintTotal: inSprintUpdatedInPeriod.length,
      inSprintUnestimatedCount,
      inSprintUnestimatedPct:
        inSprintUpdatedInPeriod.length === 0 ? null : (inSprintUnestimatedCount / inSprintUpdatedInPeriod.length) * 100,
      doneTotal,
      deliveredInSprintCount,
      deliveredInSprintPct: doneTotal === 0 ? null : (deliveredInSprintCount / doneTotal) * 100,
      deliveredOutsideSprintCount,
      deliveredOutsideSprintPct: doneTotal === 0 ? null : (deliveredOutsideSprintCount / doneTotal) * 100,
    },
    leadTimeByType,
    agingWip: {
      total: wipIssues.length,
      avgDays,
      medianDays: computeMedian(agingValues),
      over30,
      over60,
      over90,
      topOldest: wipAgingItems,
    },
    bugRatio: {
      doneBugRatio: doneTotal === 0 ? null : (doneBugCount / doneTotal) * 100,
      doneBugCount,
      doneTotal,
      wipBugCount,
      wipBugRatio: wipIssues.length === 0 ? null : (wipBugCount / wipIssues.length) * 100,
      wipTotal: wipIssues.length,
    },
  };
}

function buildThroughputStabilitySnapshot(
  doneWithDeliveryDate: ParsedIssue[],
  anchorMs: number,
  anchorMonth: string,
): ThroughputStabilitySnapshot {
  const weeklyCounts = buildRecentWeeklyCounts(doneWithDeliveryDate, anchorMs, 8);
  const monthlyCounts = buildRecentMonthlyCounts(doneWithDeliveryDate, anchorMonth, 6);
  const weeklyCvPct = computeCoefficientOfVariationPct(weeklyCounts);
  const monthlyCvPct = computeCoefficientOfVariationPct(monthlyCounts);

  return {
    weeklyAvg: computeAverage(weeklyCounts),
    weeklyCvPct,
    weeklyPredictabilityPct: convertCvToPredictabilityPct(weeklyCvPct),
    monthlyAvg: computeAverage(monthlyCounts),
    monthlyCvPct,
    monthlyPredictabilityPct: convertCvToPredictabilityPct(monthlyCvPct),
    weeklySamples: weeklyCounts.filter((value) => value > 0).length,
    monthlySamples: monthlyCounts.filter((value) => value > 0).length,
  };
}

function buildRecentWeeklyCounts(doneWithDeliveryDate: ParsedIssue[], anchorMs: number, weeks: number): number[] {
  const anchorDay = startOfDay(new Date(anchorMs));
  const countsByWeek = new Map<string, number>();

  doneWithDeliveryDate.forEach((issue) => {
    const deliveryDate = getIssueDeliveryDate(issue);
    if (!deliveryDate) {
      return;
    }

    const key = getIsoWeekBucketKey(deliveryDate);
    countsByWeek.set(key, (countsByWeek.get(key) ?? 0) + 1);
  });

  const recentKeys: string[] = [];
  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    const bucketDate = new Date(anchorDay.getTime() - offset * 7 * 24 * 60 * 60 * 1000);
    recentKeys.push(getIsoWeekBucketKey(bucketDate));
  }

  return recentKeys.map((key) => countsByWeek.get(key) ?? 0);
}

function buildRecentMonthlyCounts(doneWithDeliveryDate: ParsedIssue[], anchorMonth: string, months: number): number[] {
  const countsByMonth = new Map<string, number>();

  doneWithDeliveryDate.forEach((issue) => {
    const deliveryDate = getIssueDeliveryDate(issue);
    if (!deliveryDate) {
      return;
    }

    const key = deliveryDate.toISOString().slice(0, 7);
    countsByMonth.set(key, (countsByMonth.get(key) ?? 0) + 1);
  });

  const anchorMonthDate = startOfMonthByKey(anchorMonth) ?? startOfDay(new Date());
  const recentKeys: string[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    recentKeys.push(monthKey(new Date(anchorMonthDate.getFullYear(), anchorMonthDate.getMonth() - offset, 1)));
  }

  return recentKeys.map((key) => countsByMonth.get(key) ?? 0);
}

function buildWipRiskSnapshot(items: AgingWipItem[], totalWip: number): WipRiskSnapshot {
  if (totalWip <= 0) {
    return {
      over30Pct: 0,
      over60Pct: 0,
      over90Pct: 0,
      over30DeltaPpVs30dBaseline: 0,
    };
  }

  const over30Pct = (items.filter((item) => item.agingDays > 30).length / totalWip) * 100;
  const over60Pct = (items.filter((item) => item.agingDays > 60).length / totalWip) * 100;
  const over90Pct = (items.filter((item) => item.agingDays > 90).length / totalWip) * 100;

  const over30BaselinePct =
    (items.filter((item) => Math.max(item.agingDays - 30, 0) > 30).length / totalWip) * 100;

  return {
    over30Pct,
    over60Pct,
    over90Pct,
    over30DeltaPpVs30dBaseline: over30Pct - over30BaselinePct,
  };
}

function buildLeadTimeByTypeSnapshot(doneInPeriod: ParsedIssue[]): LeadTimeByTypeSnapshot[] {
  const grouped = new Map<string, { issueType: string; doneCount: number; totalDays: number }>();

  doneInPeriod.forEach((issue) => {
    if (!issue.created || !issue.resolutionDate) {
      return;
    }

    const cycleDays = (issue.resolutionDate.getTime() - issue.created.getTime()) / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(cycleDays) || cycleDays < 0) {
      return;
    }

    const issueType = issue.issueType?.trim() || "Unknown";
    const key = issueType.toLowerCase();
    const current = grouped.get(key) ?? { issueType, doneCount: 0, totalDays: 0 };

    current.doneCount += 1;
    current.totalDays += cycleDays;
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map((entry) => ({
      issueType: entry.issueType,
      avgDays: entry.doneCount === 0 ? 0 : entry.totalDays / entry.doneCount,
      doneCount: entry.doneCount,
    }))
    .sort((a, b) => b.doneCount - a.doneCount)
    .slice(0, 5);
}

function resolveBottleneckEntryForPeriod(
  entries: BottleneckEntry[],
  selectedPeriod: string,
): BottleneckEntry | null {
  if (entries.length === 0) {
    return null;
  }

  const monthlyEntries = entries
    .filter((entry) => isMonthPeriod(entry.period))
    .slice()
    .sort((a, b) => a.period.localeCompare(b.period));

  if (monthlyEntries.length === 0) {
    return null;
  }

  if (isMonthPeriod(selectedPeriod)) {
    const exact = monthlyEntries.find((entry) => entry.period === selectedPeriod);
    if (exact) {
      return exact;
    }

    const previous = monthlyEntries.filter((entry) => entry.period <= selectedPeriod);
    if (previous.length > 0) {
      return previous[previous.length - 1];
    }
  }

  return monthlyEntries[monthlyEntries.length - 1];
}

function buildFlowEfficiencySnapshot(entry: BottleneckEntry | null, selectedPeriod: string): FlowEfficiencySnapshot {
  const period = entry?.period ?? (isMonthPeriod(selectedPeriod) ? selectedPeriod : "latest");
  if (!entry || entry.columns.length === 0) {
    return {
      period,
      activeDays: 0,
      queueDays: 0,
      totalDays: 0,
      valuePct: null,
    };
  }

  let activeDays = 0;
  let queueDays = 0;

  entry.columns.forEach((column) => {
    if (!Number.isFinite(column.avgDays) || column.avgDays <= 0) {
      return;
    }

    if (isActiveFlowStatus(column.name)) {
      activeDays += column.avgDays;
    } else {
      queueDays += column.avgDays;
    }
  });

  const totalDays = activeDays + queueDays;

  return {
    period,
    activeDays,
    queueDays,
    totalDays,
    valuePct: totalDays <= 0 ? null : (activeDays / totalDays) * 100,
  };
}

function buildQueueTimeSnapshot(
  entry: BottleneckEntry | null,
  selectedPeriod: string,
  boardStatuses: Map<string, string>,
): QueueTimeSnapshot {
  const period = entry?.period ?? (isMonthPeriod(selectedPeriod) ? selectedPeriod : "latest");
  if (!entry || entry.columns.length === 0) {
    return { period, topStatuses: [] };
  }

  const topStatuses = getBottleneckColumnsForBoard(entry, boardStatuses)
    .slice()
    .sort((a, b) => b.avgDays - a.avgDays)
    .slice(0, 3)
    .map((column) => ({
      status: column.name,
      avgDays: column.avgDays,
    }));

  return { period, topStatuses };
}

function buildBottleneckTrendSnapshot(entries: BottleneckEntry[]): BottleneckTrendSnapshot {
  const monthly = entries
    .filter((entry) => isMonthPeriod(entry.period))
    .slice()
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, 6)
    .reverse();

  if (monthly.length === 0) {
    return {
      monthCount: 0,
      dominantStatus: null,
      dominantCount: 0,
      longestStatus: null,
      longestAvgDays: null,
      switchCount: 0,
    };
  }

  const bottleneckCounts = new Map<string, number>();
  const byStatus = new Map<string, { sumDays: number; count: number }>();

  let previousStatus: string | null = null;
  let switchCount = 0;

  monthly.forEach((entry) => {
    const maxColumn = getMaxBottleneckColumn(entry);
    if (maxColumn) {
      bottleneckCounts.set(maxColumn.name, (bottleneckCounts.get(maxColumn.name) ?? 0) + 1);
      if (previousStatus && previousStatus !== maxColumn.name) {
        switchCount += 1;
      }
      previousStatus = maxColumn.name;
    }

    entry.columns.forEach((column) => {
      if (!Number.isFinite(column.avgDays) || column.avgDays <= 0) {
        return;
      }

      const current = byStatus.get(column.name) ?? { sumDays: 0, count: 0 };
      current.sumDays += column.avgDays;
      current.count += 1;
      byStatus.set(column.name, current);
    });
  });

  const dominant =
    Array.from(bottleneckCounts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) {
          return b[1] - a[1];
        }
        return a[0].localeCompare(b[0]);
      })[0] ?? null;

  const longest =
    Array.from(byStatus.entries())
      .map(([status, value]) => ({
        status,
        avgDays: value.count === 0 ? 0 : value.sumDays / value.count,
      }))
      .sort((a, b) => b.avgDays - a.avgDays)[0] ?? null;

  return {
    monthCount: monthly.length,
    dominantStatus: dominant?.[0] ?? null,
    dominantCount: dominant?.[1] ?? 0,
    longestStatus: longest?.status ?? null,
    longestAvgDays: longest?.avgDays ?? null,
    switchCount,
  };
}

function buildWipRiskHeatmapSnapshot(items: AgingWipItem[]): WipRiskHeatmapSnapshot {
  const grouped = new Map<string, WipRiskHeatmapStatusRow>();

  items.forEach((item) => {
    const status = item.status.trim() || "Unknown";
    const key = normalizeTextValue(status);
    const current = grouped.get(key) ?? {
      status,
      total: 0,
      age0To30: 0,
      age31To60: 0,
      age61To90: 0,
      age91Plus: 0,
    };

    current.total += 1;
    if (item.agingDays > 90) {
      current.age91Plus += 1;
    } else if (item.agingDays > 60) {
      current.age61To90 += 1;
    } else if (item.agingDays > 30) {
      current.age31To60 += 1;
    } else {
      current.age0To30 += 1;
    }

    grouped.set(key, current);
  });

  const rows = Array.from(grouped.values())
    .sort((a, b) => {
      if (b.age91Plus !== a.age91Plus) {
        return b.age91Plus - a.age91Plus;
      }
      if (b.age61To90 !== a.age61To90) {
        return b.age61To90 - a.age61To90;
      }
      if (b.age31To60 !== a.age31To60) {
        return b.age31To60 - a.age31To60;
      }
      if (b.total !== a.total) {
        return b.total - a.total;
      }
      return a.status.localeCompare(b.status);
    })
    .slice(0, 8);

  return { rows };
}

function buildForecastSnapshot(
  doneWithDeliveryDate: ParsedIssue[],
  wipIssues: ParsedIssue[],
  teamConfig: TeamConfig | undefined,
  now: Date,
): ForecastSnapshot {
  const sampleDays = 90;
  const simulations = 2000;
  const acceptedTypes = new Set(
    resolveEffectiveSleIssueTypes(
      teamConfig?.sleConfig.issueTypes,
      [...doneWithDeliveryDate, ...wipIssues].map((issue) => issue.issueType),
    ).map(normalizeTextValue),
  );
  const doneEligible = doneWithDeliveryDate.filter((issue) => acceptedTypes.has(normalizeTextValue(issue.issueType)));
  const backlogCount = wipIssues.filter((issue) => acceptedTypes.has(normalizeTextValue(issue.issueType))).length;
  const throughputSeries = buildRecentDailyThroughputCounts(doneEligible, now, sampleDays);

  if (
    backlogCount <= 0 ||
    throughputSeries.length === 0 ||
    throughputSeries.every((value) => value <= 0)
  ) {
    return {
      backlogCount,
      sampleDays,
      simulations,
      p50Days: null,
      p85Days: null,
      p50DateIso: null,
      p85DateIso: null,
    };
  }

  const completionDays = runMonteCarloBacklogSimulation(backlogCount, throughputSeries, simulations, 1337);
  const p50Days = percentileFromValues(completionDays, 0.5);
  const p85Days = percentileFromValues(completionDays, 0.85);
  const anchor = startOfDay(now);

  return {
    backlogCount,
    sampleDays,
    simulations,
    p50Days,
    p85Days,
    p50DateIso: p50Days === null ? null : addDays(anchor, p50Days).toISOString(),
    p85DateIso: p85Days === null ? null : addDays(anchor, p85Days).toISOString(),
  };
}

function buildSprintPredictabilitySnapshot(
  issues: ParsedIssue[],
  isDone: (issue: ParsedIssue) => boolean,
  teamConfig: TeamConfig | undefined,
  now: Date,
): SprintPredictabilitySnapshot {
  const velocityConfig = normalizeVelocityConfig(teamConfig?.velocityConfig);
  if (velocityConfig.mode !== "sprint-story-points") {
    return {
      enabled: false,
      latest: null,
      avgLast6Pct: null,
      rows: [],
    };
  }

  const currentBucket = getVelocityBucketKey(now, velocityConfig);
  if (!currentBucket) {
    return {
      enabled: false,
      latest: null,
      avgLast6Pct: null,
      rows: [],
    };
  }

  const acceptedTypes = new Set(
    resolveEffectiveSleIssueTypes(
      teamConfig?.sleConfig.issueTypes,
      issues.map((issue) => issue.issueType),
    ).map(normalizeTextValue),
  );
  const createdByBucket = new Map<string, number>();
  const doneByBucket = new Map<string, number>();

  issues.forEach((issue) => {
    if (!acceptedTypes.has(normalizeTextValue(issue.issueType))) {
      return;
    }

    if (issue.created) {
      const createdBucket = getVelocityBucketKey(issue.created, velocityConfig);
      if (createdBucket) {
        createdByBucket.set(createdBucket, (createdByBucket.get(createdBucket) ?? 0) + 1);
      }
    }

    const deliveryDate = getIssueDeliveryDate(issue);
    if (isDone(issue) && deliveryDate) {
      const doneBucket = getVelocityBucketKey(deliveryDate, velocityConfig);
      if (doneBucket) {
        doneByBucket.set(doneBucket, (doneByBucket.get(doneBucket) ?? 0) + 1);
      }
    }
  });

  const allBuckets = new Set<string>([...createdByBucket.keys(), ...doneByBucket.keys(), currentBucket]);
  const rows = Array.from(allBuckets)
    .filter((bucket) => bucket.startsWith("SPR-"))
    .sort((a, b) => sprintBucketStartMs(b) - sprintBucketStartMs(a))
    .slice(0, 6)
    .map((bucket) => {
      const created = createdByBucket.get(bucket) ?? 0;
      const done = doneByBucket.get(bucket) ?? 0;
      return {
        sprint: bucket,
        created,
        done,
        predictabilityPct: created > 0 ? (done / created) * 100 : null,
      };
    });

  const latest = rows.find((row) => row.sprint === currentBucket) ?? rows[0] ?? null;
  const avgLast6Pct = computeAverage(rows.map((row) => row.predictabilityPct).filter((value): value is number => value !== null));

  return {
    enabled: true,
    latest,
    avgLast6Pct,
    rows,
  };
}

function buildRecentDailyThroughputCounts(doneWithDeliveryDate: ParsedIssue[], now: Date, dayCount: number): number[] {
  const countsByDay = new Map<string, number>();
  const endDay = startOfDay(now).getTime();

  doneWithDeliveryDate.forEach((issue) => {
    const deliveryDate = getIssueDeliveryDate(issue);
    if (!deliveryDate) {
      return;
    }

    const key = deliveryDate.toISOString().slice(0, 10);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  });

  const series: number[] = [];
  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const day = new Date(endDay - offset * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    series.push(countsByDay.get(key) ?? 0);
  }

  return series;
}

function runMonteCarloBacklogSimulation(
  backlogCount: number,
  throughputSeries: number[],
  simulations: number,
  seed: number,
): number[] {
  if (backlogCount <= 0 || throughputSeries.length === 0 || simulations <= 0) {
    return [];
  }

  const rng = createSeededRng(seed);
  const distribution = throughputSeries.map((value) => Math.max(0, Math.floor(value)));
  const maxDays = 3650;
  const result: number[] = [];

  for (let i = 0; i < simulations; i += 1) {
    let remaining = backlogCount;
    let days = 0;

    while (remaining > 0 && days < maxDays) {
      const sample = distribution[Math.floor(rng() * distribution.length)] ?? 0;
      remaining -= sample;
      days += 1;
    }

    result.push(days);
  }

  return result;
}

function percentileFromValues(values: number[], percentile: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.ceil(percentile * sorted.length) - 1;
  const index = Math.max(0, Math.min(sorted.length - 1, rank));
  return sorted[index];
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function sprintBucketStartMs(bucket: string): number {
  const value = bucket.replace(/^SPR-/, "");
  const date = new Date(`${value}T00:00:00.000Z`);
  const ts = date.getTime();
  return Number.isFinite(ts) ? ts : Number.NEGATIVE_INFINITY;
}

function isActiveFlowStatus(statusName: string): boolean {
  const normalized = normalizeTextValue(statusName);
  if (!normalized) {
    return false;
  }

  const queueHints = [
    "backlog",
    "to do",
    "todo",
    "selected for",
    "open",
    "queue",
    "ready",
    "pending",
    "blocked",
    "wait",
    "triage",
    "analysis",
  ];
  if (queueHints.some((hint) => normalized.includes(hint))) {
    return false;
  }

  const activeHints = [
    "in progress",
    "progress",
    "develop",
    "dev",
    "code",
    "review",
    "qa",
    "test",
    "validation",
    "accept",
    "implementation",
    "build",
  ];
  if (activeHints.some((hint) => normalized.includes(hint))) {
    return true;
  }

  return false;
}

function isDefaultSprintScopeStatus(statusName: string): boolean {
  const normalized = normalizeTextValue(statusName);
  if (!normalized) {
    return false;
  }

  const terminalHints = ["done", "closed", "resolved", "cancelled", "canceled", "won't do", "wont do"];
  if (terminalHints.some((hint) => normalized.includes(hint))) {
    return false;
  }

  const outsideSprintHints = ["backlog", "open", "to do", "todo", "analysis", "triage", "intake", "draft", "idea"];
  if (outsideSprintHints.some((hint) => normalized.includes(hint))) {
    return false;
  }

  return true;
}

function computeAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeCoefficientOfVariationPct(values: number[]): number | null {
  const mean = computeAverage(values);
  if (mean === null || mean <= 0) {
    return null;
  }

  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const deviation = Math.sqrt(variance);
  return (deviation / mean) * 100;
}

function convertCvToPredictabilityPct(cvPct: number | null): number | null {
  if (cvPct === null || !Number.isFinite(cvPct)) {
    return null;
  }

  return Math.max(0, Math.min(100, 100 - cvPct));
}

function resolveThroughputAnchor(
  period: string,
  now: Date,
  issues: ParsedIssue[],
): { month: string; anchorMs: number } {
  if (!isMonthPeriod(period)) {
    const latestActivityMonth = resolveLatestActivityMonth(period, now, issues);
    const targetMonth = latestActivityMonth ?? resolveDefaultThroughputMonth(period, now);
    const targetMonthEnd = endOfMonthByKey(targetMonth);
    return {
      month: targetMonth,
      anchorMs: targetMonthEnd ? Math.min(now.getTime(), targetMonthEnd.getTime()) : now.getTime(),
    };
  }

  const [yearRaw, monthRaw] = period.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const monthNum = Number.parseInt(monthRaw, 10);

  if (!Number.isFinite(year) || !Number.isFinite(monthNum)) {
    return {
      month: monthKey(now),
      anchorMs: now.getTime(),
    };
  }

  const monthEnd = new Date(year, monthNum, 0, 23, 59, 59, 999);
  return {
    month: period,
    anchorMs: monthEnd.getTime(),
  };
}

function resolveLatestActivityMonth(period: string, now: Date, issues: ParsedIssue[]): string | null {
  let latestMonth: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  const cutoffMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const isInScope = (date: Date): boolean => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    if (period === "all") {
      return true;
    }

    if (period === "ytd") {
      return year === currentYear && month <= cutoffMonth;
    }

    if (period === "ytd-prev") {
      return year === currentYear - 1 && month <= cutoffMonth;
    }

    return true;
  };

  issues.forEach((issue) => {
    const candidates = [issue.created, issue.updated];

    candidates.forEach((value) => {
      if (!value || !isInScope(value)) {
        return;
      }

      const time = value.getTime();
      if (!Number.isFinite(time) || time < latestTime) {
        return;
      }

      latestTime = time;
      latestMonth = monthKey(value);
    });
  });

  return latestMonth;
}

function resolveDefaultThroughputMonth(period: string, now: Date): string {
  if (period === "ytd-prev") {
    return monthKey(new Date(now.getFullYear() - 1, now.getMonth(), 1));
  }

  return monthKey(now);
}

function endOfMonthByKey(month: string): Date | null {
  if (!isMonthPeriod(month)) {
    return null;
  }

  const [yearRaw, monthRaw] = month.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const monthNum = Number.parseInt(monthRaw, 10);
  if (!Number.isFinite(year) || !Number.isFinite(monthNum)) {
    return null;
  }

  return new Date(year, monthNum, 0, 23, 59, 59, 999);
}

function startOfMonthByKey(month: string): Date | null {
  if (!isMonthPeriod(month)) {
    return null;
  }

  const [yearRaw, monthRaw] = month.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const monthNum = Number.parseInt(monthRaw, 10);
  if (!Number.isFinite(year) || !Number.isFinite(monthNum)) {
    return null;
  }

  return new Date(year, monthNum - 1, 1);
}

function computeMedian(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseCommaSeparatedList(rawInput: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  rawInput
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .forEach((value) => {
      const normalized = value.toLowerCase();
      if (seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      values.push(value);
    });

  return values;
}

function areIssueTypeSelectionsEqual(left: string[], right: string[]): boolean {
  const normalize = (values: string[]) =>
    values
      .map((value) => normalizeTextValue(value))
      .filter((value) => value.length > 0)
      .sort((a, b) => a.localeCompare(b));

  const leftNormalized = normalize(left);
  const rightNormalized = normalize(right);
  if (leftNormalized.length !== rightNormalized.length) {
    return false;
  }

  return leftNormalized.every((value, index) => value === rightNormalized[index]);
}

function buildDefaultWorkspaceMetricConfig(): WorkspaceMetricConfig {
  return {
    scopeVisibility: Object.fromEntries(
      METRIC_SCOPES.map((scope) => [
        scope,
        CONFIGURABLE_METRICS.filter((metric) => metric.defaultScopes.includes(scope)).map((metric) => metric.id),
      ]),
    ) as Record<MetricScope, ConfigurableMetricId[]>,
  };
}

function normalizeWorkspaceMetricConfig(config: WorkspaceMetricConfig | undefined): WorkspaceMetricConfig {
  const defaults = buildDefaultWorkspaceMetricConfig();
  const scopeVisibility: Partial<Record<MetricScope, string[]>> = {};
  const validIds = new Set(CONFIGURABLE_METRICS.map((metric) => metric.id));

  METRIC_SCOPES.forEach((scope) => {
    const configured = config?.scopeVisibility?.[scope];
    const source = Array.isArray(configured) && configured.length > 0 ? configured : defaults.scopeVisibility?.[scope] ?? [];
    scopeVisibility[scope] = Array.from(
      new Set(source.filter((metricId) => validIds.has(metricId as ConfigurableMetricId))),
    );
  });

  return { scopeVisibility };
}

function getVisibleMetricSet(config: WorkspaceMetricConfig, scope: MetricScope): Set<ConfigurableMetricId> {
  const normalized = normalizeWorkspaceMetricConfig(config);
  return new Set((normalized.scopeVisibility?.[scope] ?? []) as ConfigurableMetricId[]);
}

function normalizeTextValue(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function buildDetectedWorkflowStatuses(team: TeamRuntime | null, bottleneckEntries: BottleneckEntry[]): string[] {
  const byKey = new Map<string, string>();

  const addStatus = (value: string | undefined): void => {
    const trimmed = (value ?? "").trim();
    const key = normalizeTextValue(trimmed);
    if (!key || byKey.has(key)) {
      return;
    }
    byKey.set(key, trimmed);
  };

  team?.parsedIssues.forEach((issue) => addStatus(issue.status));
  bottleneckEntries.forEach((entry) => entry.columns.forEach((column) => addStatus(column.name)));
  team?.config.doneConfig.doneStatuses?.forEach(addStatus);
  team?.config.workflowConfig?.backlogStatuses?.forEach(addStatus);
  team?.config.workflowConfig?.activeStatuses?.forEach(addStatus);
  team?.config.sprintScopeConfig?.statuses?.forEach(addStatus);
  team?.config.bottleneckConfig?.flowStatuses?.forEach(addStatus);

  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

function inferBacklogStatuses(issues: ParsedIssue[]): string[] {
  const backlogHints = ["backlog", "open", "to do", "todo", "ready", "new", "triage", "selected"];
  const byKey = new Map<string, string>();

  issues.forEach((issue) => {
    const status = issue.status.trim();
    const normalized = normalizeTextValue(status);
    if (!normalized || byKey.has(normalized)) {
      return;
    }
    if (backlogHints.some((hint) => normalized.includes(hint))) {
      byKey.set(normalized, status);
    }
  });

  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
