import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Database,
  FolderCog,
  Gauge,
  Layers3,
  LockKeyhole,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import {
  DEFAULT_SLE_ISSUE_TYPES,
  buildSleValues,
  buildWaitingTimeSnapshot,
  buildMaintenanceLifecycleSnapshot,
  isValidMaintenanceLifecycleJiraKey,
  validateMaintenanceLifecycleConfigForSave,
  countSprints,
  isCancelledIssue,
  isDone,
  normalizeSleIssueTypes,
  resolveEffectiveSleIssueTypes,
} from "./lib/metrics";
import { isDefaultNonFlowStatus, isTerminalOrCancelledStatus } from "./lib/time-in-status";
import { workingDaysBetween } from "./lib/working-days";
import { buildExecutiveFlowSummary } from "./lib/metric-consistency";
import { buildMetricTrustMetadata, type MetricTrust } from "./lib/metric-trust";
import {
  adaptLegacyWorkflowConfig,
  buildUnifiedFlowStatusConfigFromLegacyGroups,
  classifyUnifiedFlowStatus,
  FLOW_PRESENTATION_METRICS,
  legacyGroupsFromUnifiedFlowStatusConfig,
  normalizeUnifiedFlowStatusConfig,
  classifyWorkflowStatusForReport,
  getWorkflowCompatibilityBuckets,
  getWorkflowSemanticVersion,
  hasExplicitWorkflowStatusConfiguration,
  validatedWorkflowStatusOrder,
  validateUnifiedFlowStatusConfig,
} from "./lib/flow-presentation";
import { mapFlowTimingPresentation, type FlowPresentationMetricId } from "./lib/flow-presentation";
import { buildTeamDataStatus } from "./lib/team-data-status";
import { parseTeamRouteSearch, routeHistoryAction, serializeTeamRoute, validateTeamRoute, type TeamRouteState } from "./lib/team-route";
import { recalculateSelectedTeam, type TeamRecalculateState } from "./lib/team-recalculate";
import { classifyOperationFailure, createOperation, finishOperation, nextRetryCount, type AppOperation, type AppOperationPhase, type AppRecoveryAction } from "./lib/app-operation";
import { canDismissToast, classifyToastStatus, shouldClearForContextChange, type ToastStatus } from "./lib/status-toast";
import {
  commitImportMonitorBaseline,
  buildImportMonitorPresentation,
  createImportManifest,
  createImportMonitorState,
  observeImportManifest,
  type ImportManifest,
  type ImportMonitorState,
} from "./lib/import-monitor";
import { BUILD_MARKER_LABEL } from "./lib/build-info";
import { requestPilotSession } from "./lib/pilot-access";
import {
  isMetricAvailableInView,
  normalizeTeamViewMode,
  TEAM_VIEW_STORAGE_KEY,
  type TeamViewMode,
} from "./lib/view-mode";
import {
  buildTeamConfigWithSavedQueries,
  normalizeJiraQueryConfig,
  resolvePreferredSavedQuery,
} from "./lib/jira-query";
import {
  buildAvailableMonths,
  buildRangePeriod,
  describePeriod,
  endOfMonthByKey,
  formatMonthLabel,
  formatPeriodLabel,
  getPreviousMonth,
  getPreviousPeriodKey,
  getRollingMonthWindow,
  isIsoDateInPeriod,
  isMonthPeriod,
  isRangePeriod,
  monthKey,
  parseRangePeriod,
  resolvePeriodReferenceDate,
  startOfMonthByKey,
} from "./lib/period";
import {
  addTeam,
  analyzeTeam,
  ensureWorkspaceWritePermission,
  listTeams,
  listRememberedWorkspaces,
  openRememberedWorkspaceById,
  loadWorkspaceConfig,
  pickWorkspaceDirectory,
  readTeamProgressHistory,
  rememberWorkspaceDirectory,
  restoreRememberedWorkspaceDirectory,
  saveWorkspaceConfig,
  saveTeamProgressSnapshot,
  scanTeamImportManifest,
  type RememberedWorkspaceSummary,
  saveTeamConfig,
  saveTeamBottleneckEntries,
  supportsFileSystemAccess,
} from "./lib/workspace";
import {
  type JiraQueryCollection,
  type BottleneckEntry,
  type JiraSavedQuery,
  type MetricScope,
  type SleValues,
  type ParsedIssue,
  type TeamConfig,
  type UnifiedFlowStatusConfig,
  type TeamEntityType,
  type VelocityConfig,
  type TeamMetrics,
  type TeamProgressSnapshot,
  type TeamRuntime,
  type WorkspaceConfig,
  type WorkspaceMetricConfig,
  type WorkspaceProfileConfig,
} from "./types/contracts";

const FLOW_LABELS = {
  lead: FLOW_PRESENTATION_METRICS[0].label,
  cycle: FLOW_PRESENTATION_METRICS[1].label,
  implementation: FLOW_PRESENTATION_METRICS[2].label,
} as const;

function getFlowPresentationValue(flowTiming: TeamMetrics["flowTiming"], metricId: FlowPresentationMetricId) {
  return mapFlowTimingPresentation(flowTiming).find(({ metric }) => metric.id === metricId)?.value ?? null;
}
import {
  ExecutiveDashboard,
  ExecutiveTeamView,
  type ExecSig,
  type ExecutiveChartPoint,
  type ExecutiveDashboardSummary,
  type ExecutiveDashboardTeam,
  type ExecutiveFlowStage,
  type ExecutiveStatusRow,
  type ExecutiveTeamDesignData,
  type ExecutiveTeamMetric,
  type ExecutiveTicketRow,
  type ExecutiveWorkflowItem,
  type HistoricalTrendSnapshot,
} from "./components/ExecutiveViews";

declare global {
  interface Window {
    __smInstallWorkspaceHelperV3?: (handle: FileSystemDirectoryHandle) => Promise<boolean>;
  }
}

export {
  buildAvailableMonths,
  buildPeriodYearGroups,
  describePeriod,
  getPreviousPeriodKey,
  isIsoDateInPeriod,
  resolvePeriodReferenceDate,
} from "./lib/period";
export { composeQueryWithTimeWindow, normalizeJiraQueryConfig } from "./lib/jira-query";

const EMPTY_SLE: SleValues = { p50: null, p70: null, p85: null, p95: null };
const TeamDetail = lazy(async () => {
  const module = await import("./components/TeamDetail");
  return { default: module.TeamDetail };
});
const EMPTY_FLOW_TIMING: TeamMetrics["flowTiming"] = {
  leadTime: { count: 0, avgDays: null, p50: null, p70: null, p85: null, p95: null },
  activeTime: { count: 0, avgDays: null, p50: null, p70: null, p85: null, p95: null },
  cycleTime: { count: 0, avgDays: null, p50: null, p70: null, p85: null, p95: null },
};
const BOTTLENECK_HISTORY_START_MONTH = "2026-01";
const ALL_TEAMS_PROFILE_ID = "__all-teams__";

function readStoredTeamViewMode(): TeamViewMode {
  if (typeof window === "undefined") {
    return "scrum-master";
  }

  try {
    return normalizeTeamViewMode(window.localStorage.getItem(TEAM_VIEW_STORAGE_KEY));
  } catch {
    return "scrum-master";
  }
}

function isFiveDigitPin(value: string): boolean {
  return /^\d{5}$/.test(value);
}

type Page = "workspace" | "dashboard" | "metrics" | "import" | "team";
type TeamTab = "overview" | "cycle" | "data";
type TrendTone = "good" | "bad" | "neutral";
type HealthTone = "good" | "warn" | "bad" | "neutral";
type SleLineKey = "p50" | "p70" | "p85" | "p95";
interface PilotSession {
  sessionId: string;
  label: string;
  expiresAt: string | null;
}

function readTeamRouteState(): TeamRouteState {
  return parseTeamRouteSearch(typeof window === "undefined" ? "" : window.location.search, readStoredTeamViewMode());
}

function writeTeamRoute(state: TeamRouteState, source: "user" | "initial" | "canonicalize" | "popstate"): void {
  if (typeof window === "undefined") return;
  const action = routeHistoryAction(source, window.location.search, state);
  if (action === "none") return;
  const search = serializeTeamRoute(state, window.location.search);
  window.history[action === "push" ? "pushState" : "replaceState"]({}, "", `${window.location.pathname}${search}${window.location.hash}`);
}

const TEAM_ENTITY_TYPES: TeamEntityType[] = ["team", "vde", "art", "portfolio"];
const TEAM_ENTITY_LABELS: Record<TeamEntityType, string> = {
  team: "Team",
  vde: "VDE / Value Stream",
  art: "ART / Train",
  portfolio: "Portfolio",
};

type ConfigurableMetricId =
  | "stories-done"
  | "lead-time"
  | "active-time"
  | "cycle-time"
  | "sle-p85"
  | "velocity"
  | "sle-risk"
  | "stale-wip"
  | "work-mix"
  | "wip-age-risk"
  | "forecast"
  | "bug-ratio"
  | "functional-coverage"
  | "unit-test-coverage"
  | "technical-debt"
  | "cycle-time-distribution"
  | "workload-distribution"
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

const METRIC_SCOPES: MetricScope[] = ["team", "value-stream", "art", "portfolio"];
const METRIC_GROUPS: ConfigurableMetricGroup[] = ["Core", "Flow", "Predictability", "Quality", "Data"];
const METRIC_SCOPE_LABELS: Record<MetricScope, string> = {
  team: "Team",
  "value-stream": "VDE / Value Stream",
  art: "ART",
  portfolio: "Portfolio",
};

const DASHBOARD_SCOPE_COPY: Record<
  MetricScope,
  {
    navLabel: string;
    title: string;
    subtitle: string;
    focusTitle: string;
    focusSubtitle: string;
    tableTitle: string;
    detailTitle: string;
  }
> = {
  team: {
    navLabel: "Teams",
    title: "Teams Dashboard",
    subtitle: "Team-level flow, planning, quality and data readiness in one working view.",
    focusTitle: "Team Focus",
    focusSubtitle: "Pick a team to drill into its current metrics.",
    tableTitle: "Team Metrics",
    detailTitle: "Selected Team Detail",
  },
  "value-stream": {
    navLabel: "VDE",
    title: "VDE / Value Stream Dashboard",
    subtitle: "A value-stream view built from the teams included in the selected workspace view.",
    focusTitle: "Teams in This Value Stream",
    focusSubtitle: "Use Workspace Views to define which teams belong to this VDE/value stream.",
    tableTitle: "Value Stream Team Signals",
    detailTitle: "Value Stream Drill-down",
  },
  art: {
    navLabel: "ART",
    title: "ART Dashboard",
    subtitle: "ART-level delivery health using the same team data, grouped by the selected workspace view.",
    focusTitle: "Teams in This ART",
    focusSubtitle: "Use Workspace Views to define the ART membership and compare the included teams.",
    tableTitle: "ART Team Signals",
    detailTitle: "ART Drill-down",
  },
  portfolio: {
    navLabel: "Portfolio",
    title: "Portfolio Dashboard",
    subtitle: "Portfolio-level flow and investment signals for portfolio entities in the active workspace view.",
    focusTitle: "Portfolio Focus",
    focusSubtitle: "Choose a portfolio entity to inspect its flow, work mix and data readiness.",
    tableTitle: "Portfolio Signals",
    detailTitle: "Portfolio Drill-down",
  },
};

const CONFIGURABLE_METRICS: ConfigurableMetricDefinition[] = [
  {
    id: "stories-done",
    label: "Items Done",
    group: "Core",
    source: "Jira CSV",
    description: "Done count in the selected period.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-velocity"],
  },
  {
    id: "lead-time",
    label: "Lead Time",
    group: "Core",
    source: "Time in Status",
    description: "Lead Time from upstream intake to Done.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-time"],
  },
  {
    id: "active-time",
    label: "Cycle Time",
    group: "Core",
    source: "Time in Status",
    description: "Cycle Time through the configured delivery flow to Done.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-time"],
  },
  {
    id: "cycle-time",
    label: "Implementation Time",
    group: "Core",
    source: "Time in Status",
    description: "Implementation Time from execution start to Done.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-time"],
  },
  {
    id: "sle-p85",
    label: "SLE P85",
    group: "Core",
    source: "Jira CSV",
    description: "85th percentile delivery time.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-time"],
  },
  {
    id: "velocity",
    label: "Avg Velocity",
    group: "Core",
    source: "Jira CSV",
    description: "Average delivered ticket count or story points by configured cadence.",
    defaultScopes: ["team", "art"],
    safeMetricIds: ["flow-velocity"],
  },
  {
    id: "sle-risk",
    label: "Open tickets past SLE P85",
    group: "Flow",
    source: "Derived",
    description: "Open tickets that are already older than the team's normal P85 delivery time.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-time", "flow-predictability"],
  },
  {
    id: "stale-wip",
    label: "Open tickets not updated",
    group: "Flow",
    source: "Jira CSV",
    description: "Open tickets that have not changed for more than 14 days.",
    defaultScopes: ["value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-load"],
  },
  {
    id: "work-mix",
    label: "Work Mix",
    group: "Quality",
    source: "Jira CSV",
    description: "Delivered work distribution by issue type.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-distribution"],
  },
  {
    id: "wip-age-risk",
    label: "Old open tickets",
    group: "Flow",
    source: "Jira CSV",
    description: "Open tickets grouped by how long they have been waiting.",
    defaultScopes: ["value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-load"],
  },
  {
    id: "forecast",
    label: "Forecast",
    group: "Predictability",
    source: "Derived",
    description: "Monte Carlo lite forecast based on throughput history.",
    defaultScopes: ["value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-predictability"],
  },
  {
    id: "bug-ratio",
    label: "Done Bug Ratio",
    group: "Quality",
    source: "Jira CSV",
    description: "Share of done items matching configured bug issue types.",
    defaultScopes: ["team", "art", "portfolio"],
    safeMetricIds: ["built-in-quality"],
  },
  {
    id: "functional-coverage",
    label: "Functional Test Coverage",
    group: "Quality",
    source: "Manual/External",
    description: "Average automated functional test coverage across team services.",
    defaultScopes: ["team"],
    safeMetricIds: ["built-in-quality"],
  },
  {
    id: "unit-test-coverage",
    label: "Unit Test Coverage",
    group: "Quality",
    source: "Manual/External",
    description: "Average unit/code coverage across team services.",
    defaultScopes: ["team"],
    safeMetricIds: ["built-in-quality"],
  },
  {
    id: "technical-debt",
    label: "Technical Debt",
    group: "Quality",
    source: "Manual/External",
    description: "Average estimated remediation time for known technical debt.",
    defaultScopes: ["team"],
    safeMetricIds: ["built-in-quality"],
  },
  {
    id: "cycle-time-distribution",
    label: "Implementation Time Distribution",
    group: "Flow",
    source: "Time in Status",
    description: "Implementation Time spread across short, normal and long-tail delivery bands.",
    defaultScopes: ["team"],
    safeMetricIds: ["flow-time", "flow-predictability"],
  },
  {
    id: "workload-distribution",
    label: "Workload Distribution",
    group: "Flow",
    source: "Jira CSV",
    description: "Scrum Master view of how selected-period work is distributed across assignees.",
    defaultScopes: ["team"],
    safeMetricIds: ["flow-load"],
  },
  {
    id: "throughput",
    label: "Throughput",
    group: "Flow",
    source: "Jira CSV",
    description: "Current month, previous month and rolling 30-day throughput.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
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
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-load", "flow-velocity"],
  },
  {
    id: "throughput-stability",
    label: "Throughput Stability",
    group: "Predictability",
    source: "Derived",
    description: "Predictability from weekly and monthly throughput variation.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-predictability"],
  },
  {
    id: "lead-time-by-type",
    label: "Lead Time by Type",
    group: "Flow",
    source: "Jira CSV",
    description: "Slowest issue types by average lead time.",
    defaultScopes: ["team", "value-stream", "portfolio"],
    safeMetricIds: ["flow-time", "flow-distribution"],
  },
  {
    id: "flow-efficiency",
    label: "Flow Efficiency",
    group: "Flow",
    source: "Time in Status",
    description: "Flow health score from active share, queue time, WIP age and update freshness.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-efficiency"],
  },
  {
    id: "queue-time",
    label: "Queue Time by Status",
    group: "Flow",
    source: "Time in Status",
    description: "Statuses with highest average waiting time.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-efficiency"],
  },
  {
    id: "bottleneck-trend",
    label: "Bottleneck Trend",
    group: "Flow",
    source: "Time in Status",
    description: "Recurring monthly bottleneck signal.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
    safeMetricIds: ["flow-efficiency"],
  },
  {
    id: "wip-heatmap",
    label: "Open ticket age by status",
    group: "Flow",
    source: "Jira CSV",
    description: "Open tickets by workflow status and age bucket.",
    defaultScopes: ["team", "value-stream", "portfolio"],
    safeMetricIds: ["flow-load"],
  },
  {
    id: "aging-wip",
    label: "Old open ticket details",
    group: "Flow",
    source: "Jira CSV",
    description: "Oldest open tickets and their age distribution.",
    defaultScopes: ["team"],
    safeMetricIds: ["flow-load"],
  },
  {
    id: "bottleneck",
    label: "Bottleneck Panel",
    group: "Flow",
    source: "Time in Status",
    description: "Monthly bottleneck table and manual override editor link.",
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
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
    defaultScopes: ["team", "value-stream", "art", "portfolio"],
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
  sleCycleTimes: number[];
  flowTiming: TeamMetrics["flowTiming"];
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
  workingAgeDays: number;
  cycleTimeWorkingDays: number | null;
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
  weeklyRecentCounts: number[];
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

interface SleRiskSnapshot {
  thresholdDays: number | null;
  atRiskCount: number;
  totalWip: number;
  atRiskPct: number | null;
}

interface StaleWipSnapshot {
  thresholdDays: number;
  staleCount: number;
  totalWip: number;
  stalePct: number | null;
}

interface WorkMixItem {
  issueType: string;
  count: number;
  percentage: number;
}

interface WorkMixSnapshot {
  totalDone: number;
  topTypes: WorkMixItem[];
}

interface CycleTimeDistributionBin {
  id: string;
  label: string;
  count: number;
  percentage: number;
}

interface CycleTimeDistributionTypeRow {
  issueType: string;
  count: number;
  avgDays: number;
  over14Count: number;
  over14Pct: number;
}

interface CycleTimeDistributionSnapshot {
  total: number;
  bins: CycleTimeDistributionBin[];
  p50: number | null;
  p85: number | null;
  p95: number | null;
  over14Pct: number;
  topTypes: CycleTimeDistributionTypeRow[];
}

interface WorkloadDistributionAssigneeRow {
  assignee: string;
  total: number;
  open: number;
  done: number;
  percentage: number;
  avgCycleTimeDays: number | null;
}

interface WorkloadDistributionSnapshot {
  total: number;
  assignedTotal: number;
  unassignedTotal: number;
  topSharePct: number | null;
  topAssignee: string | null;
  rows: WorkloadDistributionAssigneeRow[];
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
  activeSharePct: number | null;
  valuePct: number | null;
  queueHealthPct: number | null;
  ageHealthPct: number | null;
  freshnessHealthPct: number | null;
  wipHealthPct: number | null;
  currentWipTotal: number;
  currentWipByStatus: WipByStatusSnapshot[];
  limitingReason: string | null;
}

interface QueueTimeStatusSnapshot {
  status: string;
  avgDays: number;
}

interface WipByStatusSnapshot {
  status: string;
  count: number;
  avgAgeDays: number | null;
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
  sleRisk: SleRiskSnapshot;
  staleWip: StaleWipSnapshot;
  workMix: WorkMixSnapshot;
  wipRiskHeatmap: WipRiskHeatmapSnapshot;
  flowEfficiency: FlowEfficiencySnapshot;
  queueTime: QueueTimeSnapshot;
  bottleneckTrend: BottleneckTrendSnapshot;
  forecast: ForecastSnapshot;
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
  leadTime: TrendResult;
  activeTime: TrendResult;
  flowCycleTime: TrendResult;
  sleP50: TrendResult;
  sleP70: TrendResult;
  sleP85: TrendResult;
  sleP95: TrendResult;
  multiSprintPct: TrendResult;
  velocity: TrendResult;
}

interface TeamMetricsHealthTrendBundle {
  wipAgeRisk: TrendResult;
  sleRisk: TrendResult;
  staleWip: TrendResult;
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
  sleRisk: MetricHealthSignal;
  staleWip: MetricHealthSignal;
  workMix: MetricHealthSignal;
  leadTimeByType: MetricHealthSignal;
  flowEfficiency: MetricHealthSignal;
  queueTimeByStatus: MetricHealthSignal;
  bottleneckTrend: MetricHealthSignal;
  forecast: MetricHealthSignal;
}

interface TeamHealthScaleBand {
  tone: HealthTone;
  label: string;
  range: string;
}

type MetricHelpKey =
  | "storiesDone"
  | "avgCycleTime"
  | "leadTime"
  | "activeTime"
  | "flowCycleTime"
  | "sleP85"
  | "velocity"
  | "understandingTrends"
  | "throughputThisMonth"
  | "throughputLastMonth"
  | "throughputLast30Days"
  | "doneBugRatio"
  | "functionalCoverage"
  | "unitTestCoverage"
  | "technicalDebt"
  | "cycleTimeDistribution"
  | "workloadDistribution"
  | "intakeVsThroughput"
  | "netFlow"
  | "throughputStability"
  | "wipAgeRisk"
  | "sleRisk"
  | "staleWip"
  | "workMix"
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
  | "dataMonitor";

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

type TimeInStatusStatusCategory = "queue" | "active" | "done" | "other";
type TimeInStatusFlowRole = "backlog" | "funnel" | "active" | "implementation" | "done" | "other";

interface TimeInStatusStatusRow {
  name: string;
  avgDays: number | null;
  category: TimeInStatusStatusCategory;
  flowRole: TimeInStatusFlowRole;
  categoryLabel: string;
  tone: HealthTone;
  highlight: boolean;
  signal: string;
}

const METRIC_HELP: Record<MetricHelpKey, MetricHelpCopy> = {
  storiesDone: {
    title: "Items Done",
    meaning: "How many items reached Done in this period.",
    whyGood: "Higher is better if quality and predictability stay stable.",
    improveTips: [
      "Split large stories into smaller vertical slices.",
      "Limit work in progress and finish started tickets before pulling new ones.",
      "Remove blockers daily and escalate aging items quickly.",
    ],
  },
  avgCycleTime: {
    title: "Avg Implementation Time",
    meaning: "Average implementation time in Monday-Friday working days.",
    whyGood: "Lower is better. Shorter cycle time means faster delivery.",
    improveTips: [
      "Break work into smaller tickets with clear acceptance criteria.",
      "Reduce waiting in review/test queues with explicit pull rules.",
      "Track blocked time and resolve root causes in retrospectives.",
    ],
  },
  leadTime: {
    title: "Lead Time",
    meaning: "Lead Time from upstream intake until Done, measured in Monday-Friday working days.",
    whyGood: "Lower is better. It shows the stakeholder wait time across planning and delivery flow.",
    improveTips: [
      "Reduce time spent waiting in Funnel with clearer intake and prioritization.",
      "Split large work so it can move through planning and delivery sooner.",
      "Remove approval and dependency delays before work enters implementation.",
    ],
  },
  activeTime: {
    title: "Cycle Time",
    meaning: "Cycle Time through the configured delivery flow to Done, measured in Monday-Friday working days.",
    whyGood: "Lower is better. This is the current name for the former Active Time definition.",
    improveTips: [
      "Keep active WIP small and finish started items before starting new ones.",
      "Shorten analysis and refinement queues with explicit pull rules.",
      "Escalate blocked active items quickly so they do not age silently.",
    ],
  },
  flowCycleTime: {
    title: "Implementation Time",
    meaning: "Implementation Time in configured execution statuses before Done, measured in Monday-Friday working days.",
    whyGood: "Lower is better. It focuses on execution time after committed work starts.",
    improveTips: [
      "Break implementation work into smaller deliverable slices.",
      "Reduce review, test, and acceptance waiting time.",
      "Make blockers and handoffs visible during daily flow review.",
    ],
  },
  sleP85: {
    title: "SLE P85",
    meaning: "85% of completed items had Cycle Time at or below this many working days.",
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
      "Limit work in progress and use clear pull rules between statuses.",
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
  functionalCoverage: {
    title: "Functional Test Coverage",
    meaning: "Manually maintained average automated functional test coverage across the team's services.",
    whyGood: "Higher coverage gives more confidence that critical user flows are protected.",
    improveTips: [
      "Track only meaningful automated functional checks, not manual test activity.",
      "Average across services consistently so the trend remains comparable.",
      "Add coverage around defects and high-risk customer journeys first.",
    ],
  },
  unitTestCoverage: {
    title: "Unit Test Coverage",
    meaning: "Manually maintained average code coverage percentage across the team's services.",
    whyGood: "Higher coverage can reduce regression risk when paired with useful assertions.",
    improveTips: [
      "Use the same coverage source for every update.",
      "Focus on critical business logic before chasing a percentage target.",
      "Call out services with low coverage during technical planning.",
    ],
  },
  technicalDebt: {
    title: "Technical Debt",
    meaning: "Manually maintained average estimated days needed to address known technical debt.",
    whyGood: "Lower is better. It keeps future delivery less risky and less expensive.",
    improveTips: [
      "Convert vague debt into specific backlog items with estimated effort.",
      "Reserve capacity for the highest-risk debt every planning cycle.",
      "Remove obsolete debt items so the number stays credible.",
    ],
  },
  cycleTimeDistribution: {
    title: "Implementation Time Distribution",
    meaning: "How long completed items spent in Implementation Time before Done, grouped into simple time bands.",
    whyGood: "It shows whether most work finishes quickly or whether a meaningful share gets stuck for much longer.",
    improveTips: [
      "Look first at the slowest band and the issue types that appear there most often.",
      "Use the spread to discuss where work needs better slicing, fewer dependencies, or clearer ownership.",
      "Compare the same chart month by month to see whether changes actually reduce slow work.",
    ],
  },
  workloadDistribution: {
    title: "Workload Distribution",
    meaning: "How selected-period work is distributed across assignees. Use it for system balance, not individual performance scoring.",
    whyGood: "A balanced spread lowers bottleneck and burnout risk while keeping knowledge shared.",
    improveTips: [
      "Look for repeated single-person bottlenecks by work type.",
      "Pair or rotate work where one person carries a large share for multiple periods.",
      "Use the signal to adjust WIP, pull rules, and cross-training.",
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
    title: "Old open tickets",
    meaning: "Open tickets that are not done yet and have been open for more than 30 days.",
    whyGood: "Lower is better. Many old open tickets usually means work is blocked, forgotten or too large.",
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
  sleRisk: {
    title: "Open tickets older than SLE P85",
    meaning:
      "Open tickets that are not done yet and are already older than your team's normal P85 delivery time.",
    whyGood:
      "Lower is better. SLE P85 means 85% of recently done tickets finished within this many days, so these open tickets are already outside the normal expectation.",
    improveTips: [
      "Swarm on open tickets older than SLE P85.",
      "Split or close aged work that is no longer valuable.",
      "Check whether the active/done statuses are configured correctly.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: "<= 10% of open tickets" },
      { tone: "warn", label: "Watch", range: "10.1% to 25%" },
      { tone: "bad", label: "Action", range: "> 25%" },
    ],
  },
  staleWip: {
    title: "Open tickets not updated",
    meaning: "Open tickets that have not changed for more than 14 days.",
    whyGood: "Lower is better. No recent update often means the ticket is blocked, forgotten or too large.",
    improveTips: [
      "Review stale items in daily flow review.",
      "Move blocked work explicitly to the right status or close it.",
      "Keep active work small enough to change status frequently.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: "<= 10% of open tickets" },
      { tone: "warn", label: "Watch", range: "10.1% to 25%" },
      { tone: "bad", label: "Action", range: "> 25%" },
    ],
  },
  workMix: {
    title: "Work Mix",
    meaning: "Delivered work distribution by issue type in the selected period.",
    whyGood: "Healthy mix depends on context. A single dominant work type can hide feature starvation or quality load.",
    improveTips: [
      "Use the mix to discuss feature work, defects, support and tech debt separately.",
      "Avoid comparing teams only by ticket count when the mix differs.",
      "Tune issue type mapping if Jira types are too broad.",
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
    meaning: "Flow health score from active share, queue-time health, open-work age, update freshness, and current WIP.",
    whyGood: "Higher is better. It means work is moving with limited waiting, limited aging, and controlled WIP.",
    improveTips: [
      "Reduce queue states and waiting before work starts.",
      "Assign clear ownership for pull between workflow steps.",
      "Use WIP limits and swarm on the oldest item in the busiest status.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: ">= 75%" },
      { tone: "warn", label: "Watch", range: "45% to 74.9%" },
      { tone: "bad", label: "Action", range: "< 45%" },
    ],
  },
  queueTimeByStatus: {
    title: "Queue Time by Status",
    meaning: "Top statuses where average wait time is highest in selected period.",
    whyGood: "Shows exactly where work is waiting so improvements can be targeted.",
    improveTips: [
      "Set explicit work-in-progress limits for high-wait statuses.",
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
    title: "Open ticket age by status",
    meaning: "Open tickets grouped by workflow status and age bucket. Each row adds up to the total for that status.",
    whyGood: "Highlights exactly which statuses are accumulating old tickets.",
    improveTips: [
      "Set aging alerts for >30 and >60 day tickets.",
      "Define weekly clean-up for statuses with the oldest open tickets.",
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
  const [pilotSession, setPilotSession] = useState<PilotSession | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const initialTeamRoute = useMemo(() => readTeamRouteState(), []);
  const routeHydratedRef = useRef(false);
  const [teamTab, setTeamTab] = useState<TeamTab>(() => initialTeamRoute.tab);
  const [teamViewMode, setTeamViewMode] = useState<TeamViewMode>(() => initialTeamRoute.mode);
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
  const selectedTeamIdRef = useRef<string | null>(null);
  const [status, setStatusValue] = useState("");
  const [toastStatus, setToastStatus] = useState<ToastStatus | null>(null);
  const [statusRevision, setStatusRevision] = useState(0);
  const observedContextStatusRevisionRef = useRef(0);
  const statusIdRef = useRef(0);
  const toastTimerRef = useRef<{ statusId: number; startedAt: number; remainingMs: number; timer: number | null }>({
    statusId: 0,
    startedAt: 0,
    remainingMs: 0,
    timer: null,
  });
  const [toastPaused, setToastPaused] = useState(false);
  const setStatus = (message: string): void => {
    const statusId = ++statusIdRef.current;
    setStatusValue(message);
    setToastStatus(classifyToastStatus(statusId, message));
    setStatusRevision((revision) => revision + 1);
  };
  const [operation, setOperation] = useState<AppOperation | null>(null);
  const operationIdRef = useRef(0);
  const operationRef = useRef<AppOperation | null>(null);
  const retryCountRef = useRef(0);
  const teamSaveRetryRef = useRef<(() => void) | null>(null);
  const busy = operation?.state === "active";
  const beginOperation = (phase: AppOperationPhase, message: string, action?: string): number | null => {
    if (operationRef.current?.state === "active") return null;
    const operationId = ++operationIdRef.current;
    const next = { ...createOperation(operationId, phase, message, action), retryCount: retryCountRef.current };
    retryCountRef.current = 0;
    operationRef.current = next;
    setOperation(next);
    return operationId;
  };
  const completeOperation = (operationId: number, message: string, error = false, recovery?: string, recoveryAction?: AppRecoveryAction, details?: Pick<AppOperation, "errorKind" | "lastKnownAvailable" | "stale" | "diagnosticRef" | "retryCount">): void => {
    const next = finishOperation(operationRef.current, operationId, error ? "error" : "complete", message, recovery, recoveryAction, details);
    if (next) {
      operationRef.current = next;
      setOperation(next);
    }
  };
  const updateOperation = (operationId: number, phase: AppOperationPhase, message: string): void => {
    if (operationRef.current?.operationId !== operationId) return;
    const next = { ...operationRef.current, phase, message, state: "active" as const, busy: true };
    operationRef.current = next;
    setOperation(next);
  };
  const failOperation = (operationId: number, error: unknown, fallback: string): void => {
    const failure = classifyOperationFailure(error, operationId);
    const message = `${fallback} ${failure.message}`;
    setStatus(message);
    completeOperation(operationId, message, true, failure.recovery, failure.recoveryAction, {
      errorKind: failure.errorKind,
      lastKnownAvailable: true,
      stale: true,
      diagnosticRef: failure.diagnosticRef,
    });
  };
  const [teamRecalculateState, setTeamRecalculateState] = useState<TeamRecalculateState>("idle");
  const [teamRecalculateMessage, setTeamRecalculateMessage] = useState("");
  const [importMonitorState, setImportMonitorState] = useState<ImportMonitorState>(() => createImportMonitorState());
  const importMonitorStateRef = useRef<ImportMonitorState>(createImportMonitorState());
  const [importMonitorError, setImportMonitorError] = useState<"permission" | "unsupported" | "error" | null>(null);
  const [importMonitorScanning, setImportMonitorScanning] = useState(false);
  const [importMonitorScanNonce, setImportMonitorScanNonce] = useState(0);
  const [autoUpdatesPaused, setAutoUpdatesPaused] = useState(false);
  const monitorGenerationRef = useRef(0);
  const monitorWorkspaceHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const monitorTeamHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const recalculateActiveRef = useRef(false);
  const pendingAutomaticManifestRef = useRef<ImportManifest | null>(null);
  const queuedAutomaticManifestRef = useRef<ImportManifest | null>(null);

  const [periodMonth, setPeriodMonth] = useState<string>("all");
  const [periodRangeStart, setPeriodRangeStart] = useState<string>("");
  const [periodRangeEnd, setPeriodRangeEnd] = useState<string>("");

  const [sleLineVisibility, setSleLineVisibility] = useState<Record<SleLineKey, boolean>>({
    p50: true,
    p70: true,
    p85: true,
    p95: true,
  });

  const [importTeamId, setImportTeamId] = useState<string>("");
  const [querySelectionId, setQuerySelectionId] = useState("");
  const [queryDraftName, setQueryDraftName] = useState("");
  const [queryDraftJql, setQueryDraftJql] = useState("");
  const [queryDraftNote, setQueryDraftNote] = useState("");
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const addTeamModalRef = useRef<HTMLDivElement | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [newTeamEntityType, setNewTeamEntityType] = useState<TeamEntityType>("team");
  const [newTeamJql, setNewTeamJql] = useState("");

  const [bugIssueTypesInput, setBugIssueTypesInput] = useState("Bug");
  const [bugDefaultStoryPointsInput, setBugDefaultStoryPointsInput] = useState("");
  const [backlogStatusesInput, setBacklogStatusesInput] = useState("");
  const [functionalCoverageInput, setFunctionalCoverageInput] = useState("");
  const [unitTestCoverageInput, setUnitTestCoverageInput] = useState("");
  const [technicalDebtInput, setTechnicalDebtInput] = useState("");
  const [maintenanceLifecycleKeyInput, setMaintenanceLifecycleKeyInput] = useState("");
  const [doneStatusDraft, setDoneStatusDraft] = useState("");
  const [bugIssueTypeDraft, setBugIssueTypeDraft] = useState("");
  const [sprintScopeStatusDraft, setSprintScopeStatusDraft] = useState("");
  const [backlogStatusDraft, setBacklogStatusDraft] = useState("");
  const [funnelStatusDraft, setFunnelStatusDraft] = useState("");
  const [implementingStatusDraft, setImplementingStatusDraft] = useState("");
  const [draftConfig, setDraftConfig] = useState<TeamConfig | null>(null);
  const [unifiedStatusDraft, setUnifiedStatusDraft] = useState<UnifiedFlowStatusConfig | null>(null);
  const [bottleneckPeriodInput, setBottleneckPeriodInput] = useState(() => monthKey(new Date()));
  const [bottleneckRows, setBottleneckRows] = useState<BottleneckDraftRow[]>(() => [createEmptyBottleneckRow()]);
  const [bottleneckFlowStatuses, setBottleneckFlowStatuses] = useState<string[]>([]);
  const [bottleneckFlowDraft, setBottleneckFlowDraft] = useState("");
  const [bottleneckNotesInput, setBottleneckNotesInput] = useState("");
  const [todayRef, setTodayRef] = useState(() => new Date());
  const [dashboardDetailOpen, setDashboardDetailOpen] = useState(false);
  const [doneDefinitionOpen, setDoneDefinitionOpen] = useState(false);
  const [configurationPanelOpen, setConfigurationPanelOpen] = useState(false);
  const [workflowSaveConfirmationOpen, setWorkflowSaveConfirmationOpen] = useState(false);
  const [agingWipCompactOpen, setAgingWipCompactOpen] = useState(false);
  const [bottleneckPanelOpen, setBottleneckPanelOpen] = useState(false);
  const [openMetricHelpKey, setOpenMetricHelpKey] = useState<MetricHelpKey | null>(null);
  const [sleIssueTypesDraft, setSleIssueTypesDraft] = useState<string[]>([...DEFAULT_SLE_ISSUE_TYPES]);

  const fsApiSupported = supportsFileSystemAccess();
  selectedTeamIdRef.current = selectedTeamId;

  useEffect(() => {
    const timerState = toastTimerRef.current;
    if (!toastStatus || toastStatus.durationMs === null) {
      if (timerState.timer !== null) window.clearTimeout(timerState.timer);
      timerState.timer = null;
      return;
    }

    if (timerState.statusId !== toastStatus.statusId) {
      if (timerState.timer !== null) window.clearTimeout(timerState.timer);
      timerState.statusId = toastStatus.statusId;
      timerState.remainingMs = toastStatus.durationMs;
      timerState.startedAt = 0;
      timerState.timer = null;
    }

    if (toastPaused || timerState.timer !== null) return;
    timerState.startedAt = Date.now();
    timerState.timer = window.setTimeout(() => {
      timerState.timer = null;
      if (canDismissToast(toastStatus, statusIdRef.current) && !toastPaused) {
        setStatusValue("");
        setToastStatus(null);
      }
    }, timerState.remainingMs);

    return () => {
      if (timerState.timer !== null) {
        window.clearTimeout(timerState.timer);
        timerState.remainingMs = Math.max(0, timerState.remainingMs - (Date.now() - timerState.startedAt));
        timerState.timer = null;
      }
    };
  }, [toastStatus, toastPaused]);

  useEffect(() => {
    // Navigation/context changes invalidate a pending transient timer. A
    // status published in the same transition is allowed to finish normally;
    // a later ordinary context change clears the old transient presentation.
    if (statusRevision !== observedContextStatusRevisionRef.current) {
      // A status published in this render/transition may accompany a page or
      // team change (workspace open/restore). Let its own timer govern it.
      observedContextStatusRevisionRef.current = statusRevision;
      return;
    }
    if (!shouldClearForContextChange(toastStatus, statusRevision, observedContextStatusRevisionRef.current)) return;
    if (!toastStatus) return;
    const timerState = toastTimerRef.current;
    if (timerState.timer !== null) window.clearTimeout(timerState.timer);
    timerState.timer = null;
    timerState.statusId = toastStatus.statusId;
    timerState.remainingMs = 0;
    setStatusValue("");
    setToastStatus(null);
  }, [page, selectedTeamId, teamTab, teamViewMode, periodMonth, statusRevision, toastStatus]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TEAM_VIEW_STORAGE_KEY, teamViewMode);
    } catch {
      // The view still works when browser storage is unavailable.
    }
  }, [teamViewMode]);

  useEffect(() => {
    if (!showAddTeamModal) {
      return;
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = addTeamModalRef.current;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    modal?.querySelector<HTMLElement>(focusableSelector)?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setShowAddTeamModal(false);
        return;
      }
      if (event.key !== "Tab" || !modal) {
        return;
      }

      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [showAddTeamModal]);

  const activeWorkspaceProfile = useMemo(() => {
    return workspaceProfiles.find((profile) => profile.id === activeWorkspaceProfileId) ?? null;
  }, [workspaceProfiles, activeWorkspaceProfileId]);

  const visibleMetricIds = useMemo(() => {
    return getVisibleMetricSet(workspaceMetricConfig, activeMetricScope);
  }, [workspaceMetricConfig, activeMetricScope]);

  const visibleMetrics = useMemo(() => {
    return CONFIGURABLE_METRICS.filter((metric) => visibleMetricIds.has(metric.id));
  }, [visibleMetricIds]);

  const filteredTeams = useMemo(() => {
    if (!activeWorkspaceProfile) {
      return teams;
    }

    const teamIdSet = new Set(activeWorkspaceProfile.teamIds);
    return teams.filter((team) => teamIdSet.has(team.teamId));
  }, [teams, activeWorkspaceProfile]);

  const availableMetricScopes = useMemo(
    () => new Set(filteredTeams.map((team) => getMetricScopeForEntityType(getTeamEntityType(team.config)))),
    [filteredTeams],
  );

  const dashboardTeams = useMemo(() => {
    return filteredTeams.filter((team) => getMetricScopeForEntityType(getTeamEntityType(team.config)) === activeMetricScope);
  }, [filteredTeams, activeMetricScope]);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.teamId === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  const selectedImportTeam = useMemo(
    () => filteredTeams.find((team) => team.teamId === importTeamId) ?? null,
    [filteredTeams, importTeamId],
  );

  const selectedTeamJiraQueryConfig = useMemo(() => {
    return normalizeJiraQueryConfig(selectedImportTeam?.config.jiraQuery);
  }, [selectedImportTeam]);
  const selectedIssueQueryConfig = selectedTeamJiraQueryConfig.issueQuery as JiraQueryCollection;

  const availableMonths = useMemo(() => {
    return buildAvailableMonths(filteredTeams);
  }, [filteredTeams]);

  const periodReferenceDate = useMemo(() => {
    return resolvePeriodReferenceDate(availableMonths, todayRef);
  }, [availableMonths, todayRef]);

  useEffect(() => {
    if (availableMonths.length === 0) {
      return;
    }

    setPeriodRangeStart((current) => (isMonthPeriod(current) ? current : availableMonths[0]));
    setPeriodRangeEnd((current) => (isMonthPeriod(current) ? current : availableMonths[availableMonths.length - 1]));
  }, [availableMonths]);

  useEffect(() => {
    setDoneDefinitionOpen(false);
    setAgingWipCompactOpen(false);
    setBottleneckPanelOpen(false);
    setOpenMetricHelpKey(null);
    setTeamRecalculateState("idle");
    setTeamRecalculateMessage("");
    setImportMonitorState(createImportMonitorState());
    importMonitorStateRef.current = createImportMonitorState();
    setImportMonitorError(null);
    pendingAutomaticManifestRef.current = null;
    queuedAutomaticManifestRef.current = null;
    monitorGenerationRef.current += 1;
  }, [selectedTeamId]);

  useEffect(() => {
    const teamHandle = selectedTeam?.teamHandle;
    const generation = ++monitorGenerationRef.current;
    const lifecycleChanged = monitorWorkspaceHandleRef.current !== workspaceHandle || monitorTeamHandleRef.current !== teamHandle;
    monitorWorkspaceHandleRef.current = workspaceHandle;
    monitorTeamHandleRef.current = teamHandle ?? null;
    if (lifecycleChanged) {
      const resetState = createImportMonitorState();
      importMonitorStateRef.current = resetState;
      setImportMonitorState(resetState);
      setImportMonitorError(null);
      pendingAutomaticManifestRef.current = null;
      queuedAutomaticManifestRef.current = null;
    }
    if (!workspaceHandle || !teamHandle || !fsApiSupported) {
      const resetState = createImportMonitorState();
      importMonitorStateRef.current = resetState;
      setImportMonitorState(resetState);
      setImportMonitorError(fsApiSupported ? null : "unsupported");
      return;
    }

    let cancelled = false;
    let scanInFlight = false;
    const scan = async (): Promise<void> => {
      if (
        cancelled ||
        autoUpdatesPaused ||
        document.visibilityState !== "visible" ||
        scanInFlight
      ) {
        return;
      }

      scanInFlight = true;
      setImportMonitorScanning(true);
      try {
        const permission = await workspaceHandle.queryPermission({ mode: "read" });
        if (permission !== "granted") {
          setImportMonitorError("permission");
          return;
        }

        const entries = await scanTeamImportManifest(teamHandle);
        if (cancelled || generation !== monitorGenerationRef.current) {
          return;
        }

        setImportMonitorError(null);
        const observation = observeImportManifest(
          importMonitorStateRef.current,
          createImportManifest(entries),
        );
        importMonitorStateRef.current = observation.state;
        setImportMonitorState(observation.state);
        if (observation.shouldRecalculate) {
          if (recalculateActiveRef.current) {
            queuedAutomaticManifestRef.current = createImportManifest(entries);
          } else {
            pendingAutomaticManifestRef.current = createImportManifest(entries);
            void handleRecalculateSelectedTeam("automatic");
          }
        }
      } catch {
        if (!cancelled && generation === monitorGenerationRef.current) {
          setImportMonitorError("error");
        }
      } finally {
        scanInFlight = false;
        setImportMonitorScanning(false);
      }
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") void scan();
    };
    const onFocus = (): void => void scan();
    const interval = window.setInterval(() => void scan(), 30_000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    void scan();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [workspaceHandle, selectedTeam?.teamHandle, selectedTeamId, fsApiSupported, autoUpdatesPaused, importMonitorScanNonce]);

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
      setUnifiedStatusDraft(null);
      setWorkflowSaveConfirmationOpen(false);
      setBugIssueTypesInput("Bug");
      setBugDefaultStoryPointsInput("");
      setBacklogStatusesInput("");
      setFunctionalCoverageInput("");
      setUnitTestCoverageInput("");
      setTechnicalDebtInput("");
      setMaintenanceLifecycleKeyInput("");
      setSleIssueTypesDraft([...DEFAULT_SLE_ISSUE_TYPES]);
      setDoneStatusDraft("");
      setBugIssueTypeDraft("");
      setSprintScopeStatusDraft("");
      setBacklogStatusDraft("");
      setFunnelStatusDraft("");
      setImplementingStatusDraft("");
      setBottleneckFlowStatuses([]);
      setBottleneckFlowDraft("");
      setBottleneckRows([createEmptyBottleneckRow()]);
      setBottleneckNotesInput("");
      return;
    }

    setDraftConfig(structuredClone(selectedTeam.config));
    setWorkflowSaveConfirmationOpen(false);
    setBugIssueTypesInput((selectedTeam.config.bugConfig?.issueTypes ?? ["Bug"]).join(", "));
    setBugDefaultStoryPointsInput(formatOptionalNumberInput(selectedTeam.config.bugConfig?.defaultStoryPoints));
    const inferredWorkflow = inferWorkflowConfig(selectedTeam.parsedIssues, selectedTeam.config.doneConfig.doneStatuses ?? []);
    const configuredWorkflow = selectedTeam.config.workflowConfig;
    const canonicalValidation = configuredWorkflow?.statusSets === undefined
      ? null
      : validateUnifiedFlowStatusConfig(configuredWorkflow.statusSets);
    const canonicalGroups = canonicalValidation?.config
      ? legacyGroupsFromUnifiedFlowStatusConfig(canonicalValidation.config)
      : null;
    if (configuredWorkflow?.statusSets !== undefined) {
      const raw = configuredWorkflow.statusSets;
      setUnifiedStatusDraft(normalizeUnifiedFlowStatusConfig(raw) ?? {
        leadStatuses: Array.isArray(raw.leadStatuses) ? raw.leadStatuses : [],
        cycleStatuses: Array.isArray(raw.cycleStatuses) ? raw.cycleStatuses : [],
        implementationStatuses: Array.isArray(raw.implementationStatuses) ? raw.implementationStatuses : [],
        doneStatuses: Array.isArray(raw.doneStatuses) ? raw.doneStatuses : [],
      });
    } else {
      setUnifiedStatusDraft(buildUnifiedFlowStatusConfigFromLegacyGroups({
        funnelStatuses: configuredWorkflow?.funnelStatuses,
        activeStatuses: configuredWorkflow?.activeStatuses,
        implementingStatuses: configuredWorkflow?.implementingStatuses,
        doneStatuses: selectedTeam.config.doneConfig.doneStatuses,
      }).config);
    }
    const hasConfiguredWorkflow =
      configuredWorkflow?.statusSets !== undefined ||
      (configuredWorkflow?.backlogStatuses?.length ?? 0) > 0 ||
      (configuredWorkflow?.funnelStatuses?.length ?? 0) > 0 ||
      (configuredWorkflow?.activeStatuses?.length ?? 0) > 0 ||
      (configuredWorkflow?.implementingStatuses?.length ?? 0) > 0;
    const workflowInput: InferredWorkflowConfig = configuredWorkflow?.statusSets !== undefined
      ? {
          backlogStatuses: configuredWorkflow.backlogStatuses?.length ? configuredWorkflow.backlogStatuses : [],
          funnelStatuses: canonicalGroups?.funnelStatuses ?? configuredWorkflow.statusSets.leadStatuses ?? [],
          activeStatuses: canonicalGroups?.activeStatuses ?? configuredWorkflow.statusSets.cycleStatuses ?? [],
          implementingStatuses: canonicalGroups?.implementingStatuses ?? configuredWorkflow.statusSets.implementationStatuses ?? [],
        }
      : hasConfiguredWorkflow
      ? {
          backlogStatuses:
            configuredWorkflow?.backlogStatuses && configuredWorkflow.backlogStatuses.length > 0
              ? configuredWorkflow.backlogStatuses
              : inferredWorkflow.backlogStatuses,
          funnelStatuses:
            configuredWorkflow?.funnelStatuses && configuredWorkflow.funnelStatuses.length > 0
              ? configuredWorkflow.funnelStatuses
              : inferredWorkflow.funnelStatuses,
          activeStatuses:
            configuredWorkflow?.activeStatuses && configuredWorkflow.activeStatuses.length > 0
              ? configuredWorkflow.activeStatuses
              : inferredWorkflow.activeStatuses,
          implementingStatuses:
            configuredWorkflow?.implementingStatuses && configuredWorkflow.implementingStatuses.length > 0
              ? configuredWorkflow.implementingStatuses
              : inferredWorkflow.implementingStatuses,
        }
      : inferredWorkflow;
    setBacklogStatusesInput(workflowInput.backlogStatuses.join(", "));
    setFunctionalCoverageInput(formatOptionalNumberInput(selectedTeam.config.engineeringMetrics?.functionalTestCoveragePct));
    setUnitTestCoverageInput(formatOptionalNumberInput(selectedTeam.config.engineeringMetrics?.unitTestCoveragePct));
    setTechnicalDebtInput(formatOptionalNumberInput(selectedTeam.config.engineeringMetrics?.technicalDebtAvgDays));
    setMaintenanceLifecycleKeyInput(selectedTeam.config.maintenanceLifecycle?.maintenanceLifecycleJiraKey ?? "");
    setSleIssueTypesDraft(normalizeSleIssueTypes(selectedTeam.config.sleConfig.issueTypes));
    setDoneStatusDraft("");
    setBugIssueTypeDraft("");
    setSprintScopeStatusDraft("");
    setBacklogStatusDraft("");
    setFunnelStatusDraft("");
    setImplementingStatusDraft("");

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
    if (routeHydratedRef.current || teams.length === 0) {
      return;
    }

    const route = validateTeamRoute(readTeamRouteState(), teams.map((team) => team.teamId), [...availableMonths, "ytd", "last-24m"]);
    routeHydratedRef.current = true;
    if (route.page === "team" && route.teamId && teams.some((team) => team.teamId === route.teamId)) {
      setSelectedTeamId(route.teamId);
      setTeamViewMode(route.mode);
      setTeamTab(route.tab);
      if (route.period) setPeriodMonth(route.period);
      setPage("team");
    }
    writeTeamRoute(route, "canonicalize");
  }, [teams, availableMonths]);

  useEffect(() => {
    const onPopState = (): void => {
      const route = validateTeamRoute(readTeamRouteState(), teams.map((team) => team.teamId), [...availableMonths, "ytd", "last-24m"]);
      if (route.page !== "team" || !route.teamId || !teams.some((team) => team.teamId === route.teamId)) {
        setPage("dashboard");
        return;
      }
      setSelectedTeamId(route.teamId);
      setTeamViewMode(route.mode);
      setTeamTab(route.tab);
      if (route.period) setPeriodMonth(route.period);
      else setPeriodMonth("all");
      setPage("team");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [teams, availableMonths]);

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

  }, [
    selectedImportTeam,
    selectedIssueQueryConfig,
    querySelectionId,
  ]);

  const dashboardBottleneckPeriod = useMemo(() => {
    return resolveBottleneckPeriod(periodMonth, availableMonths, periodReferenceDate);
  }, [periodMonth, availableMonths, periodReferenceDate]);

  const dashboardRows = useMemo(() => {
    const previousPeriod = getPreviousPeriodKey(periodMonth, availableMonths);

    return dashboardTeams.map((team) => {
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
        current.sle.p85,
        buildOpenCycleTimeByIssueKey(team.metrics),
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
            previous?.sle.p85 ?? null,
            buildOpenCycleTimeByIssueKey(team.metrics),
            );
      const healthTrends: TeamMetricsHealthTrendBundle = {
        wipAgeRisk: trend(healthCurrent.wipRisk.over30Pct, healthPrevious?.wipRisk.over30Pct ?? null, "down"),
        sleRisk: trend(healthCurrent.sleRisk.atRiskPct, healthPrevious?.sleRisk.atRiskPct ?? null, "down"),
        staleWip: trend(healthCurrent.staleWip.stalePct, healthPrevious?.staleWip.stalePct ?? null, "down"),
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
  }, [dashboardTeams, periodMonth, availableMonths, dashboardBottleneckPeriod, periodReferenceDate]);

  const dashboardScopeCopy = DASHBOARD_SCOPE_COPY[activeMetricScope];

  const dashboardScopeSummary = useMemo(() => {
    const doneCount = dashboardRows.reduce((sum, row) => sum + row.current.done, 0);
    const openWipCount = dashboardRows.reduce((sum, row) => sum + row.healthCurrent.agingWip.total, 0);
    const dataRowCount = dashboardTeams.reduce((sum, team) => sum + team.parsedIssues.length, 0);
    const importCount = dashboardTeams.reduce((sum, team) => sum + team.importFiles.length, 0);
    const cycleValues = dashboardRows
      .map((row) => getFlowPresentationValue(row.current.flowTiming, "implementation"))
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .filter((value) => value.avgDays !== null && Number.isFinite(value.avgDays) && value.count > 0);
    const combinedSleCycleTimes = dashboardRows.flatMap((row) => row.current.sleCycleTimes);
    const latestImportAt = dashboardTeams
      .flatMap((team) => team.importFiles.map((file) => file.updatedAt))
      .sort((left, right) => right.localeCompare(left))[0] ?? null;

    return {
      teamCount: dashboardTeams.length,
      doneCount,
      openWipCount,
      dataRowCount,
      importCount,
      avgCycleTime:
        cycleValues.length === 0
          ? null
          : cycleValues.reduce((sum, value) => sum + (value.avgDays ?? 0) * value.count, 0) /
            cycleValues.reduce((sum, value) => sum + value.count, 0),
      sleP85: buildSleValues(combinedSleCycleTimes, "ceil").p85,
      sleSampleCount: combinedSleCycleTimes.length,
      latestImportAt,
    };
  }, [dashboardRows, dashboardTeams]);

  const selectedTeamRow = useMemo(() => {
    if (!selectedTeamId) {
      return null;
    }
    const row = dashboardRows.find((item) => item.team.teamId === selectedTeamId);
    if (row || !selectedTeam) {
      return row ?? null;
    }

    const previousPeriod = getPreviousPeriodKey(periodMonth, availableMonths);
    const effectiveEntries = buildEffectiveBottleneckEntries(selectedTeam);
    const current = computeSnapshot(selectedTeam.metrics, periodMonth, selectedTeam.config, selectedTeam.parsedIssues, periodReferenceDate);
    const previous = previousPeriod
      ? computeSnapshot(selectedTeam.metrics, previousPeriod, selectedTeam.config, selectedTeam.parsedIssues, periodReferenceDate)
      : null;
    const healthCurrent = computeTeamHealthSnapshot(
      selectedTeam.parsedIssues,
      selectedTeam.config,
      periodMonth,
      periodReferenceDate,
      effectiveEntries,
      current.sle.p85,
      buildOpenCycleTimeByIssueKey(selectedTeam.metrics),
    );
    const healthPrevious =
      previousPeriod === null
        ? null
        : computeTeamHealthSnapshot(
            selectedTeam.parsedIssues,
            selectedTeam.config,
            previousPeriod,
            periodReferenceDate,
            effectiveEntries,
            previous?.sle.p85 ?? null,
            buildOpenCycleTimeByIssueKey(selectedTeam.metrics),
          );

    return {
      team: selectedTeam,
      current,
      previous,
      trends: buildTrendBundle(current, previous),
      healthCurrent,
      healthPrevious,
      healthTrends: {
        wipAgeRisk: trend(healthCurrent.wipRisk.over30Pct, healthPrevious?.wipRisk.over30Pct ?? null, "down"),
        sleRisk: trend(healthCurrent.sleRisk.atRiskPct, healthPrevious?.sleRisk.atRiskPct ?? null, "down"),
        staleWip: trend(healthCurrent.staleWip.stalePct, healthPrevious?.staleWip.stalePct ?? null, "down"),
        bugRatio: trend(healthCurrent.bugRatio.doneBugRatio, healthPrevious?.bugRatio.doneBugRatio ?? null, "down"),
        monteCarlo: trend(healthCurrent.forecast.p85Days, healthPrevious?.forecast.p85Days ?? null, "down"),
      },
      bottleneck: getBottleneckForPeriod(effectiveEntries, dashboardBottleneckPeriod),
    };
  }, [
    dashboardRows,
    selectedTeamId,
    selectedTeam,
    periodMonth,
    availableMonths,
    periodReferenceDate,
    dashboardBottleneckPeriod,
  ]);

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
    if (!selectedTeam) {
      return computeTeamHealthSnapshot([], undefined, periodMonth, periodReferenceDate);
    }

    const selectedSnapshot = computeSnapshot(
      selectedTeam.metrics,
      periodMonth,
      selectedTeam.config,
      selectedTeam.parsedIssues,
      periodReferenceDate,
    );
    return computeTeamHealthSnapshot(
      selectedTeam.parsedIssues,
      selectedTeam.config,
      periodMonth,
      periodReferenceDate,
      selectedTeamBottleneckEntries,
      selectedSnapshot.sle.p85,
      buildOpenCycleTimeByIssueKey(selectedTeam.metrics),
    );
  }, [selectedTeam, periodMonth, periodReferenceDate, selectedTeamBottleneckEntries]);

  const selectedCycleTimeDistribution = useMemo(() => {
    return buildCycleTimeDistributionSnapshot(
      selectedTeam?.metrics ?? null,
      periodMonth,
      selectedTeam?.config,
      selectedTeam?.parsedIssues ?? [],
      periodReferenceDate,
    );
  }, [selectedTeam, periodMonth, periodReferenceDate]);

  const selectedWorkloadDistribution = useMemo(() => {
    return buildWorkloadDistributionSnapshot(
      selectedTeam?.parsedIssues ?? [],
      selectedTeam?.metrics ?? null,
      selectedTeam?.config,
      periodMonth,
      periodReferenceDate,
    );
  }, [selectedTeam, periodMonth, periodReferenceDate]);

  const selectedTeamBoardStatuses = useMemo(() => {
    return buildBoardStatusMap(selectedTeam?.parsedIssues ?? [], selectedTeam?.config);
  }, [selectedTeam]);

  const selectedTeamHealthSignals = useMemo(() => {
    return buildTeamHealthSignals(selectedTeamHealth);
  }, [selectedTeamHealth]);

  const selectedTeamMetricDataIssues = useMemo(() => {
    return buildMetricDataIssues(selectedTeamHealth);
  }, [selectedTeamHealth]);

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

  const selectedTeamDataSummary = useMemo(() => {
    if (!selectedTeam) {
      return {
        issueCount: 0,
        movedIssueCount: 0,
        exclusionCount: 0,
        latestImportAt: null as string | null,
      };
    }

    const excludedKeys = new Set([
      ...(selectedTeam.config.excludedIssueKeys ?? []),
      ...(selectedTeam.config.issueExclusions ?? []).map((exclusion) => exclusion.issueKey),
    ]);
    const latestImportAt = buildTeamDataStatus(
      selectedTeam.importFiles.filter((file) => file.rowCount > 0),
      selectedTeam.metrics?.generatedAt,
    ).latestDataUpdate;

    return {
      issueCount: selectedTeam.parsedIssues.length,
      movedIssueCount: selectedTeam.parsedIssues.filter(
        (issue) => Boolean(issue.projectEnteredAt) || (issue.previousIssueKeys?.length ?? 0) > 0,
      ).length,
      exclusionCount: excludedKeys.size,
      latestImportAt,
    };
  }, [selectedTeam]);

  const selectedTeamDataStatus = useMemo(() => {
    const validImportFiles = selectedTeam?.importFiles.filter((file) => file.rowCount > 0) ?? [];
    const snapshot = buildTeamDataStatus(validImportFiles, selectedTeam?.metrics?.generatedAt);
    const change = importMonitorState.lastChange;
    const hasUsableImports = validImportFiles.length > 0;
    const presentation = buildImportMonitorPresentation({
      error: importMonitorError,
      scanning: importMonitorScanning,
      recalculating: teamRecalculateState === "loading",
      recalculateFailed: teamRecalculateState === "error",
      recalculatedSuccessfully: teamRecalculateState === "success",
      paused: autoUpdatesPaused,
      hasUsableImports,
      hasMetrics: Boolean(selectedTeam?.metrics),
      state: importMonitorState,
    });
    return {
      ...snapshot,
      recalculateState: teamRecalculateState,
      recalculateMessage: teamRecalculateMessage,
      onRecalculate: () => void handleRecalculateSelectedTeam(),
      autoUpdateStatus: presentation.status,
      autoUpdateDetail: presentation.detail,
      changedFileCounts: change,
      autoUpdatesPaused,
      autoUpdateAvailable: !importMonitorError && hasUsableImports,
      manualRecalculateAvailable: hasUsableImports,
      autoUpdateNeedsRetry: presentation.needsRetry,
      stableScans: importMonitorState.stableScans,
      onTryAgain: () => {
        setImportMonitorError(null);
        setImportMonitorScanNonce((value) => value + 1);
      },
      onToggleAutoUpdates: () => setAutoUpdatesPaused((value) => !value),
    };
  }, [selectedTeam, importMonitorState, importMonitorError, importMonitorScanning, autoUpdatesPaused, teamRecalculateState, teamRecalculateMessage]);


  const doneStatusList = useMemo(() => {
    return unifiedStatusDraft?.doneStatuses ?? [];
  }, [unifiedStatusDraft]);

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
    return unifiedStatusDraft?.cycleStatuses ?? [];
  }, [unifiedStatusDraft]);

  const backlogStatusList = useMemo(() => {
    return parseCommaSeparatedList(backlogStatusesInput);
  }, [backlogStatusesInput]);

  const funnelStatusList = useMemo(() => {
    if (!unifiedStatusDraft) return [];
    const cycle = new Set(unifiedStatusDraft.cycleStatuses.map((value) => normalizeTextValue(value)));
    return unifiedStatusDraft.leadStatuses.filter((value) => !cycle.has(normalizeTextValue(value)));
  }, [unifiedStatusDraft]);

  const implementingStatusList = useMemo(() => {
    return unifiedStatusDraft?.implementationStatuses ?? [];
  }, [unifiedStatusDraft]);

  const draftUnifiedStatusConfig = unifiedStatusDraft;

  const draftDisplayUnifiedStatusConfig = useMemo(() => {
    const raw = draftConfig?.workflowConfig?.statusSets;
    return draftUnifiedStatusConfig ?? (raw
      ? normalizeUnifiedFlowStatusConfig(raw) ?? {
          leadStatuses: raw.leadStatuses ?? [],
          cycleStatuses: raw.cycleStatuses ?? [],
          implementationStatuses: raw.implementationStatuses ?? [],
          doneStatuses: raw.doneStatuses ?? [],
        }
      : null);
  }, [draftConfig, draftUnifiedStatusConfig]);

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

  const selectedTimeInStatusEntry = useMemo(() => {
    const entries = selectedTeam?.autoTimeInStatus ?? selectedTeamBottleneckEntries;
    return resolveTimeInStatusEntryForPeriod(entries, periodMonth, periodReferenceDate);
  }, [selectedTeam?.autoTimeInStatus, selectedTeamBottleneckEntries, periodMonth, periodReferenceDate]);

  const selectedTimeInStatusRows = useMemo(() => {
    return buildTimeInStatusRows(selectedTimeInStatusEntry, selectedTeamBoardStatuses, selectedTeam?.config);
  }, [selectedTimeInStatusEntry, selectedTeamBoardStatuses, selectedTeam?.config]);

  const selectedTimeInStatusPreviewRows = useMemo(() => {
    return selectedTimeInStatusRows.slice(0, 8);
  }, [selectedTimeInStatusRows]);

  const selectedTimeInStatusSummary = useMemo(() => {
    if (!selectedTimeInStatusEntry) {
      return "No per-status Time in Status data yet. Import Time in Status CSV.";
    }

    const selectedPeriodLabel = formatPeriodLabel(periodMonth, periodReferenceDate);
    const sourcePeriodLabel = formatPeriodLabel(selectedTimeInStatusEntry.period, periodReferenceDate);
    const prefix =
      selectedTimeInStatusEntry.period === periodMonth
        ? `Showing ${selectedPeriodLabel}.`
        : `Showing ${sourcePeriodLabel} data for ${selectedPeriodLabel}.`;

    const highlighted = selectedTimeInStatusRows
      .filter((row): row is TimeInStatusStatusRow & { avgDays: number } => row.highlight && row.avgDays !== null)
      .slice(0, 3);
    if (highlighted.length === 0) {
      return `${prefix} No obvious long waiting stages right now.`;
    }

    return `${prefix} Watch ${highlighted.map((row) => `${row.name} ${row.avgDays.toFixed(1)}d`).join(" • ")}.`;
  }, [selectedTimeInStatusEntry, periodMonth, periodReferenceDate, selectedTimeInStatusRows]);

  const bottleneckMonthlyRows = useMemo<BottleneckMonthlyRow[]>(() => {
    if (!selectedTeam) {
      return [];
    }

    const createdByMonth = new Map<string, number>();
    selectedTeam.parsedIssues.forEach((issue) => {
      const startDate = getIssueStartDate(issue);
      if (!startDate) {
        return;
      }
      const month = startDate.toISOString().slice(0, 7);
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
        const sourceLabel: BottleneckMonthlyRow["sourceLabel"] = !entry
          ? "-"
          : manualPeriods.has(period)
            ? "Manual"
            : "Auto";
        return {
          period,
          monthLabel: formatMonthLabel(period),
          bottleneckLabel: bottleneck ? `${bottleneck.name} (${bottleneck.avgDays.toFixed(1)} days)` : "-",
          createdCount: createdByMonth.get(period) ?? 0,
          doneCount: doneByMonth.get(period) ?? 0,
          sourceLabel,
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
    _healthSignal?: MetricHealthSignal,
  ): JSX.Element {
    return (
      <div className="metric-label-row">
        <span>{label}</span>
        <div className="metric-label-actions">
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
        onClick={() => handleTeamPeriodChange(period)}
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
            {renderPeriodChip("last-24m", "Last 24m")}
          </div>
          {availableMonths.length > 0 ? (
            <div className="period-range-row">
              <select
                aria-label="Period start month"
                value={periodRangeStart}
                onChange={(event) => {
                  const nextStart = event.target.value;
                  const nextEnd = !periodRangeEnd || periodRangeEnd < nextStart ? nextStart : periodRangeEnd;
                  setPeriodRangeStart(nextStart);
                  setPeriodRangeEnd(nextEnd);
                  handleTeamPeriodChange(buildRangePeriod(nextStart, nextEnd));
                }}
              >
                {availableMonths.map((month) => (
                  <option key={`range-start-${month}`} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
              </select>
              <span>to</span>
              <select
                aria-label="Period end month"
                value={periodRangeEnd}
                onChange={(event) => {
                  const nextEnd = event.target.value;
                  const nextStart = !periodRangeStart || periodRangeStart > nextEnd ? nextEnd : periodRangeStart;
                  setPeriodRangeStart(nextStart);
                  setPeriodRangeEnd(nextEnd);
                  handleTeamPeriodChange(buildRangePeriod(nextStart, nextEnd));
                }}
              >
                {availableMonths.map((month) => (
                  <option key={`range-end-${month}`} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
              </select>
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

  function renderDashboardScopeTabs(): JSX.Element {
    return (
      <section className="dashboard-scope-tabs" aria-label="Dashboard scope">
        {METRIC_SCOPES.filter((scope) => availableMetricScopes.has(scope)).map((scope) => {
          const copy = DASHBOARD_SCOPE_COPY[scope];
          return (
            <button
              key={`dashboard-scope-${scope}`}
              type="button"
              className={activeMetricScope === scope ? "active" : ""}
              aria-pressed={activeMetricScope === scope}
              onClick={() => openDashboardScope(scope)}
            >
              <strong>{copy.navLabel}</strong>
              <span>{METRIC_SCOPE_LABELS[scope]}</span>
            </button>
          );
        })}
      </section>
    );
  }

  function renderDashboardContextPanel(): JSX.Element {
    return (
      <section className="dashboard-context-panel">
        <div className="dashboard-context-copy">
          <div className="scope-eyebrow">{METRIC_SCOPE_LABELS[activeMetricScope]}</div>
          <h2>{activeWorkspaceProfile?.name ?? "All Teams"}</h2>
          <p>{dashboardScopeCopy.subtitle}</p>
          <div className="dashboard-context-actions">
            <button className="soft-btn" onClick={() => setPage("workspace")}>
              Manage Views
            </button>
            <button className="soft-btn" onClick={() => setPage("metrics")}>
              Configure Metrics
            </button>
          </div>
        </div>

        <div className="dashboard-context-stats">
          <article>
            <span>Teams</span>
            <strong>{dashboardScopeSummary.teamCount}</strong>
          </article>
          <article>
            <span>Data rows</span>
            <strong>{formatNumber(dashboardScopeSummary.dataRowCount, 0)}</strong>
            <small>{formatNumber(dashboardScopeSummary.importCount, 0)} import(s)</small>
          </article>
          <article>
            <span>Done</span>
            <strong>{formatNumber(dashboardScopeSummary.doneCount, 0)}</strong>
            <small>{periodSummary.currentLabel}</small>
          </article>
          <article>
            <span>Open tickets</span>
            <strong>{formatNumber(dashboardScopeSummary.openWipCount, 0)}</strong>
          </article>
          <article>
            <span>Avg cycle time</span>
            <strong>{formatWorkingDays(dashboardScopeSummary.avgCycleTime)}</strong>
          </article>
          <article>
            <span>Combined SLE P85</span>
            <strong>{formatWorkingDays(dashboardScopeSummary.sleP85)}</strong>
            <small>{formatBasedOnTickets(dashboardScopeSummary.sleSampleCount)}</small>
          </article>
          <article>
            <span>Latest data</span>
            <strong>{dashboardScopeSummary.latestImportAt ? formatDateText(dashboardScopeSummary.latestImportAt) : "-"}</strong>
            <small>Local workspace import</small>
          </article>
        </div>
      </section>
    );
  }

  function isMetricVisible(metricId: ConfigurableMetricId): boolean {
    if (isSprintDisciplineMetric(metricId) && !usesSprintCadence(selectedTeam?.config)) {
      return false;
    }

    return visibleMetricIds.has(metricId);
  }

  function isMetricVisibleInTeamView(metricId: ConfigurableMetricId): boolean {
    return isMetricVisible(metricId) && isMetricAvailableInView(metricId, teamViewMode);
  }

  function handleTeamViewModeChange(nextMode: TeamViewMode): void {
    setTeamViewMode(nextMode);
    setOpenMetricHelpKey(null);
    if (page === "team" && selectedTeamId) {
      writeTeamRoute({ page: "team", teamId: selectedTeamId, mode: nextMode, tab: teamTab === "cycle" ? "cycle" : "overview", period: periodMonth }, "user");
    }
  }

  function handleTeamTabChange(nextTab: "overview" | "cycle"): void {
    setTeamTab(nextTab);
    if (page === "team" && selectedTeamId) {
      writeTeamRoute({ page: "team", teamId: selectedTeamId, mode: teamViewMode, tab: nextTab, period: periodMonth }, "user");
    }
  }

  function handleTeamPeriodChange(nextPeriod: string): void {
    setPeriodMonth(nextPeriod);
    if (page === "team" && selectedTeamId) {
      writeTeamRoute({ page: "team", teamId: selectedTeamId, mode: teamViewMode, tab: teamTab === "cycle" ? "cycle" : "overview", period: nextPeriod }, "user");
    }
  }

  async function handleRecalculateSelectedTeam(trigger: "manual" | "automatic" = "manual"): Promise<void> {
    if (busy && !recalculateActiveRef.current) {
      setStatus(`Unavailable while ${operation?.phase ?? "an operation"} is in progress.`);
      return;
    }
    if (recalculateActiveRef.current || teamRecalculateState === "loading") {
      if (trigger === "automatic" && pendingAutomaticManifestRef.current) {
        queuedAutomaticManifestRef.current = pendingAutomaticManifestRef.current;
      }
      return;
    }
    const handle = workspaceHandle;
    const team = selectedTeam;
    const teamIdAtStart = selectedTeamId;
    if (!handle || !team) {
      setTeamRecalculateState("unavailable");
      setTeamRecalculateMessage("Workspace access is required to recalculate this team.");
      return;
    }

    recalculateActiveRef.current = true;
    const operationId = beginOperation("Recalculating team", "Recalculating this team locally…", "Recalculate team");
    if (operationId === null) return;
    const pendingManifest = pendingAutomaticManifestRef.current;
    pendingAutomaticManifestRef.current = null;
    setTeamRecalculateState("loading");
    setTeamRecalculateMessage(`Recalculating ${team.config.teamName} metrics.`);
    try {
      updateOperation(operationId, "Writing local data", "Writing local team metrics…");
      const result = await recalculateSelectedTeam(
        {
          selectedTeam: team,
          workspaceAvailable: true,
          analyzeTeam,
          refreshTeam: async (selected) => {
            updateOperation(operationId, "Reading back local data", "Verifying recalculated team data…");
            const refreshed = await listTeams(handle);
            const target = refreshed.find((item) => item.teamId === selected.teamId);
            if (!target) throw new Error("Selected team was not found after recalculation.");
            return target;
          },
          onSuccess: () => undefined,
          onError: () => undefined,
        },
        false,
      );
      if (result.state === "success" && result.team && selectedTeamIdRef.current === teamIdAtStart) {
        const baseline = pendingManifest ?? await scanTeamImportManifest(team.teamHandle).then((entries) => createImportManifest(entries)).catch(() => null);
        if (baseline) {
          const nextMonitorState = commitImportMonitorBaseline(importMonitorStateRef.current, baseline);
          importMonitorStateRef.current = nextMonitorState;
          setImportMonitorState(nextMonitorState);
        }
        setTeams((current) => current.map((currentTeam) => currentTeam.teamId === result.team?.teamId ? result.team : currentTeam));
        setTeamRecalculateState("success");
        setTeamRecalculateMessage(trigger === "automatic" ? "Auto-update complete · metrics recalculated just now." : "Team recalculated just now.");
        completeOperation(operationId, "Team recalculated.");
      } else if (result.state === "error" && selectedTeamIdRef.current === teamIdAtStart) {
        const failure = classifyOperationFailure(result.error, operationId);
        setTeamRecalculateState("error");
        setTeamRecalculateMessage(failure.message);
        const retryState = { ...importMonitorStateRef.current, candidateFingerprint: null, stableScans: 0, phase: "stability-wait" as const };
        importMonitorStateRef.current = retryState;
      setImportMonitorState(retryState);
      const message = `${failure.message} ${failure.errorKind === "locked-sync" ? "No partial data was used." : "Your previous metrics remain available."}`;
        setStatus(message);
        completeOperation(operationId, message, true, failure.recovery, "retry-recalculate-team", { errorKind: failure.errorKind, lastKnownAvailable: true, stale: true, diagnosticRef: failure.diagnosticRef });
      }
    } finally {
      recalculateActiveRef.current = false;
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team recalculation finished.");
      }
      if (queuedAutomaticManifestRef.current && selectedTeamIdRef.current === teamIdAtStart) {
        pendingAutomaticManifestRef.current = queuedAutomaticManifestRef.current;
        queuedAutomaticManifestRef.current = null;
        void handleRecalculateSelectedTeam("automatic");
      }
    }
  }

  async function handlePilotLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const candidate = pinInput.trim();
    if (!isFiveDigitPin(candidate)) {
      setLoginError("Enter a valid 5 digit pilot PIN.");
      return;
    }

    const session = await requestPilotSession(candidate).catch(() => null);
    if (!session) {
      setLoginError("Access denied or unavailable. Ask the pilot operator to verify your access.");
      return;
    }

    setPilotSession({
      sessionId: session.sessionId,
      label: session.label,
      expiresAt: session.expiresAt,
    });
    setPinInput("");
    setLoginError("");
  }

  function handlePilotLogout(): void {
    setPilotSession(null);
    setPage("workspace");
    setMobileNavOpen(false);
  }

  function renderPilotLoginScreen(): JSX.Element {
    return (
      <main className="pilot-login-page">
        <section className="pilot-login-card">
          <div className="pilot-login-brand">
            <div className="exec-mark" aria-hidden="true">
              <ShieldCheck size={15} />
            </div>
            <div>
              <span>DEMO / PILOT ACCESS</span>
              <h1>Scrum Master Tool</h1>
            </div>
          </div>
          <p>
            This pilot is temporarily free for invited users. Enter your 5 digit access PIN to continue.
          </p>
          <form onSubmit={handlePilotLogin} className="pilot-login-form">
            <label>
              Pilot PIN
              <input
                value={pinInput}
                onChange={(event) => {
                  setPinInput(event.target.value.replace(/\D/g, "").slice(0, 5));
                  setLoginError("");
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{5}"
                maxLength={5}
                placeholder="12345"
                autoFocus
              />
            </label>
            {loginError ? <div className="pilot-login-error">{loginError}</div> : null}
            <button type="submit">
              <LockKeyhole size={14} />
              Enter Pilot
            </button>
          </form>
          <div className="pilot-login-note">
            Access is invite-only during the pilot. Ask the pilot owner for a temporary PIN.
          </div>
        </section>
      </main>
    );
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
          <button className="soft-btn" onClick={handlePickWorkspace} disabled={busy} aria-describedby={busy ? "metrics-workspace-lock" : undefined}>
            {workspaceHandle ? "Switch Workspace" : "Choose Workspace"}
          </button>
          {workspaceOperationHint() ? <small id="metrics-workspace-lock" className="operation-lock-hint">{workspaceOperationHint()}</small> : null}
          {workspaceHandle && (
            <button className="soft-btn" onClick={() => setShowAddTeamModal(true)}>
              + Add Entity
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
                  aria-label={`Open ${workspace.name}${busy ? ` — unavailable while ${operation?.phase ?? "an operation"} is in progress` : ""}`}
                  aria-describedby={busy ? "metrics-workspace-lock" : undefined}
                  onClick={() => void handleOpenRememberedWorkspace(workspace.id)}
                >
                  Open
                </button>
                {workspaceOperationHint() ? <small className="operation-lock-hint">{workspaceOperationHint()}</small> : null}
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

  function renderTeamTimeInStatusSummary(): JSX.Element | null {
    if (teamViewMode !== "team" || !isMetricVisibleInTeamView("time-in-status")) {
      return null;
    }

    return (
      <section className="table-panel compact team-time-status-summary">
        <div>
          <div className="table-title">Where time is spent</div>
          <div className="table-subtitle">
            Average time per workflow status from the Time in Status export. Use this to spot queues; these status averages are diagnostic and are not added together with Cycle Time or Implementation Time.
          </div>
        </div>

        <p className="muted bottleneck-collapsed-hint">{selectedTimeInStatusSummary}</p>

        {selectedTimeInStatusPreviewRows.length === 0 ? (
          <p className="muted">No per-status Time in Status rows for this period.</p>
        ) : (
          <div className="time-status-card-grid team-time-status-card-row">
            {selectedTimeInStatusPreviewRows.map((row, index) => (
              <div
                key={`${row.name}:${row.avgDays}:team:${index}`}
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
        )}
      </section>
    );
  }

  function formatThroughputStabilitySummary(): string {
    const lastFourWeeks = selectedTeamHealth.throughputStability.weeklyRecentCounts.slice(-4);
    const lastFourText = lastFourWeeks.length > 0 ? lastFourWeeks.join(" / ") : "-";
    const weeklyAvg = formatNumber(selectedTeamHealth.throughputStability.weeklyAvg, 1) || "-";
    const monthlyPredictability =
      selectedTeamHealth.throughputStability.monthlyPredictabilityPct === null
        ? "-"
        : `${formatPercentValue(selectedTeamHealth.throughputStability.monthlyPredictabilityPct)}%`;

    return `Last 4 weeks delivered ${lastFourText} • 8-week avg ${weeklyAvg} done/wk • 6-month predictability ${monthlyPredictability}`;
  }

  function formatFlowEfficiencySummary(): string {
    const flow = selectedTeamHealth.flowEfficiency;
    const activeShare = flow.activeSharePct === null ? "-" : `${formatPercentValue(flow.activeSharePct)}%`;
    const queueHealth = flow.queueHealthPct === null ? "-" : `${formatPercentValue(flow.queueHealthPct)}%`;
    const wipSummary =
      flow.currentWipByStatus.length === 0
        ? "0"
        : flow.currentWipByStatus
            .slice(0, 3)
            .map((item) => `${item.status} ${item.count}`)
            .join(" / ");
    const limiter = flow.limitingReason ? ` • ${flow.limitingReason}` : "";

    return `Score from active share ${activeShare} (${formatDays(flow.activeDays)} active / ${formatDays(flow.queueDays)} queue) • queue health ${queueHealth} • WIP ${wipSummary}${limiter}`;
  }

  function renderCycleTimeDistributionPanel(): JSX.Element | null {
    if (teamViewMode !== "scrum-master" || !isMetricVisible("cycle-time-distribution")) {
      return null;
    }

    const maxBinCount = Math.max(1, ...selectedCycleTimeDistribution.bins.map((bin) => bin.count));

    return (
      <section className="table-panel compact distribution-panel">
        <div className="table-title-row">
          <div>
            <div className="table-title">Where completed work spends time</div>
            <div className="table-subtitle">
              Completed items grouped by how many working days they took from active implementation to Done. Use the slowest bands to find work types that need attention.
            </div>
          </div>
          {renderMetricInfoButton("cycleTimeDistribution")}
        </div>

        {selectedCycleTimeDistribution.total === 0 ? (
          <p className="muted">No completed Implementation Time values for this period.</p>
        ) : (
          <>
            <div className="distribution-summary-grid">
              <article>
                <span>Items</span>
                <strong>{selectedCycleTimeDistribution.total}</strong>
              </article>
              <article>
                <span>Typical / slower / slowest</span>
                <strong>
                  {formatWorkingDays(selectedCycleTimeDistribution.p50)} / {formatWorkingDays(selectedCycleTimeDistribution.p85)} /{" "}
                  {formatWorkingDays(selectedCycleTimeDistribution.p95)}
                </strong>
              </article>
              <article>
                <span>Slow work</span>
                <strong>{formatPercentValue(selectedCycleTimeDistribution.over14Pct)}% took 14+ days</strong>
              </article>
            </div>

            <div className="distribution-bar-list">
              {selectedCycleTimeDistribution.bins.map((bin) => (
                <div key={bin.id} className="distribution-bar-row">
                  <span>{bin.label}</span>
                  <div className="distribution-bar-track">
                    <i style={{ width: `${Math.max(5, (bin.count / maxBinCount) * 100)}%` }} />
                  </div>
                  <strong>
                    {bin.count} ({formatPercentValue(bin.percentage)}%)
                  </strong>
                </div>
              ))}
            </div>

            <div className="table-wrap">
              <table className="metrics-table compact-distribution-table">
                <thead>
                  <tr>
                    <th>Issue type</th>
                    <th>Items</th>
                    <th>Avg Implementation Time</th>
                    <th>14+ days</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCycleTimeDistribution.topTypes.map((row) => (
                    <tr key={`cycle-type-${row.issueType}`}>
                      <td>{row.issueType}</td>
                      <td>{row.count}</td>
                      <td>{formatWorkingDays(row.avgDays)}</td>
                      <td>
                        {row.over14Count} ({formatPercentValue(row.over14Pct)}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    );
  }

  function renderWorkloadDistributionPanel(): JSX.Element | null {
    if (teamViewMode !== "scrum-master" || !isMetricVisible("workload-distribution")) {
      return null;
    }

    const maxWorkloadCount = Math.max(1, ...selectedWorkloadDistribution.rows.map((row) => row.total));

    return (
      <section className="table-panel compact workload-distribution-panel">
        <div className="table-title-row">
          <div>
            <div className="table-title">Workload Distribution</div>
            <div className="table-subtitle">
              Scrum Master diagnostic for system balance. Do not use as individual performance scoring.
            </div>
          </div>
          {renderMetricInfoButton("workloadDistribution")}
        </div>

        {selectedWorkloadDistribution.assignedTotal === 0 ? (
          <p className="muted">Assignee is not available in current issue data. Renew Jira import to include the Assignee column.</p>
        ) : (
          <>
            <div className="distribution-summary-grid">
              <article>
                <span>Assigned work</span>
                <strong>{selectedWorkloadDistribution.assignedTotal}</strong>
              </article>
              <article>
                <span>Largest share</span>
                <strong>
                  {selectedWorkloadDistribution.topAssignee ?? "-"}{" "}
                  {selectedWorkloadDistribution.topSharePct === null ? "" : `${formatPercentValue(selectedWorkloadDistribution.topSharePct)}%`}
                </strong>
              </article>
              <article>
                <span>Unassigned</span>
                <strong>{selectedWorkloadDistribution.unassignedTotal}</strong>
              </article>
            </div>

            <div className="distribution-bar-list">
              {selectedWorkloadDistribution.rows.slice(0, 8).map((row) => (
                <div key={`workload-${row.assignee}`} className="distribution-bar-row">
                  <span>{row.assignee}</span>
                  <div className="distribution-bar-track">
                    <i style={{ width: `${Math.max(5, (row.total / maxWorkloadCount) * 100)}%` }} />
                  </div>
                  <strong>
                    {row.total} ({formatPercentValue(row.percentage)}%)
                  </strong>
                </div>
              ))}
            </div>

            <div className="table-wrap">
              <table className="metrics-table compact-distribution-table">
                <thead>
                  <tr>
                    <th>Assignee</th>
                    <th>Total</th>
                    <th>Open</th>
                    <th>Done</th>
                    <th>Avg done Implementation Time</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedWorkloadDistribution.rows.map((row) => (
                    <tr key={`workload-row-${row.assignee}`}>
                      <td>{row.assignee}</td>
                      <td>{row.total}</td>
                      <td>{row.open}</td>
                      <td>{row.done}</td>
                      <td>{formatWorkingDays(row.avgCycleTimeDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    );
  }

  function renderTeamMetricExplainer(text: string): JSX.Element | null {
    if (teamViewMode !== "team") {
      return null;
    }

    return <p className="team-metric-explainer">{text}</p>;
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

  function getPreviousSleValue(percentile: "p50" | "p70" | "p85" | "p95"): string {
    if (selectedTeamRow?.previous) {
      return formatWorkingDays(selectedTeamRow.previous.sle[percentile]);
    }

    if (percentile === "p50") {
      return formatWorkingDays(previousUploadMetrics?.sleP50Days ?? null);
    }

    if (percentile === "p70") {
      return formatWorkingDays(previousUploadMetrics?.sleP70Days ?? null);
    }

    if (percentile === "p85") {
      return formatWorkingDays(previousUploadMetrics?.sleP85Days ?? null);
    }

    return formatWorkingDays(previousUploadMetrics?.sleP95Days ?? null);
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
        id: "lead-time" as ConfigurableMetricId,
        header: "Lead Time",
        cell: renderDetailedMetricCell(
          formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.avgDays ?? null),
          selectedTeamRow.trends.leadTime,
          selectedTeamRow.previous ? formatWorkingDays(getFlowPresentationValue(selectedTeamRow.previous.flowTiming, "lead")?.avgDays ?? null) : "-",
        ),
      },
      {
        id: "active-time" as ConfigurableMetricId,
        header: FLOW_LABELS.cycle,
        cell: renderDetailedMetricCell(
          formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.avgDays ?? null),
          selectedTeamRow.trends.activeTime,
          selectedTeamRow.previous ? formatWorkingDays(getFlowPresentationValue(selectedTeamRow.previous.flowTiming, "cycle")?.avgDays ?? null) : "-",
        ),
      },
      {
        id: "cycle-time" as ConfigurableMetricId,
        header: FLOW_LABELS.implementation,
        cell: renderDetailedMetricCell(
          formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.avgDays ?? null),
          selectedTeamRow.trends.flowCycleTime,
          selectedTeamRow.previous ? formatWorkingDays(getFlowPresentationValue(selectedTeamRow.previous.flowTiming, "implementation")?.avgDays ?? null) : "-",
        ),
      },
      {
        id: "sle-p85" as ConfigurableMetricId,
        header: "SLE P50",
        cell: renderDetailedMetricCell(
          formatWorkingDays(selectedTeamRow.current.sle.p50),
          selectedTeamRow.trends.sleP50,
          getPreviousSleValue("p50"),
        ),
      },
      {
        id: "sle-p85" as ConfigurableMetricId,
        header: "SLE P70",
        cell: renderDetailedMetricCell(
          formatWorkingDays(selectedTeamRow.current.sle.p70),
          selectedTeamRow.trends.sleP70,
          getPreviousSleValue("p70"),
        ),
      },
      {
        id: "sle-p85" as ConfigurableMetricId,
        header: "SLE P85",
        cell: renderDetailedMetricCell(
          formatWorkingDays(selectedTeamRow.current.sle.p85),
          selectedTeamRow.trends.sleP85,
          getPreviousSleValue("p85"),
        ),
      },
      {
        id: "sle-p85" as ConfigurableMetricId,
        header: "SLE P95",
        cell: renderDetailedMetricCell(
          formatWorkingDays(selectedTeamRow.current.sle.p95),
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
        header: `Avg Velocity (${selectedVelocityUnit})`,
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
          <div className="table-title small-title">Open ticket age by status</div>
          {renderMetricInfoButton("wipRiskHeatmap")}
        </div>
        {selectedTeamHealth.wipRiskHeatmap.rows.length === 0 ? (
          <p className="muted">No open tickets.</p>
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

  function renderSprintWorkSummaryCard(): JSX.Element | null {
    if (!isMetricVisible("sprint-work") || !usesSprintCadence(selectedTeam?.config)) {
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

    const existingOperationId = operationRef.current?.state === "active" ? operationRef.current.operationId : null;
    const operationId = existingOperationId ?? beginOperation("Saving workspace", "Saving workspace view settings…", "Save workspace view");
    if (operationId === null) return;
    const ownsOperation = existingOperationId === null;

    const config: WorkspaceConfig = {
      version: 1,
      name: workspaceHandle.name,
      profiles,
      activeProfileId:
        nextActiveProfileId === ALL_TEAMS_PROFILE_ID ? undefined : nextActiveProfileId,
      metricConfig: workspaceMetricConfig,
    };

    try {
      updateOperation(operationId, "Writing local data", "Saving workspace view settings…");
      await saveWorkspaceConfig(workspaceHandle, config);
      updateOperation(operationId, "Reading back local data", "Verifying workspace view settings…");
      setWorkspaceProfiles(profiles);
      setActiveWorkspaceProfileId(nextActiveProfileId);
      if (ownsOperation) completeOperation(operationId, "Workspace view settings saved.");
    } catch (error) {
      const failure = classifyOperationFailure(error, operationId);
      if (ownsOperation) completeOperation(operationId, failure.message, true, failure.recovery, "retry-workspace", { errorKind: failure.errorKind, lastKnownAvailable: true, stale: true, diagnosticRef: failure.diagnosticRef });
      throw error;
    }
  }

  async function persistWorkspaceMetricConfig(nextConfig: WorkspaceMetricConfig): Promise<void> {
    if (!workspaceHandle) {
      return;
    }

    const normalized = normalizeWorkspaceMetricConfig(nextConfig);
    const existingOperationId = operationRef.current?.state === "active" ? operationRef.current.operationId : null;
    const operationId = existingOperationId ?? beginOperation("Saving workspace", "Saving workspace metric settings…", "Save metric settings");
    if (operationId === null) return;
    const ownsOperation = existingOperationId === null;
    const config: WorkspaceConfig = {
      version: 1,
      name: workspaceHandle.name,
      profiles: workspaceProfiles,
      activeProfileId:
        activeWorkspaceProfileId === ALL_TEAMS_PROFILE_ID ? undefined : activeWorkspaceProfileId,
      metricConfig: normalized,
    };

    try {
      updateOperation(operationId, "Writing local data", "Saving workspace metric settings…");
      await saveWorkspaceConfig(workspaceHandle, config);
      updateOperation(operationId, "Reading back local data", "Verifying workspace metric settings…");
      setWorkspaceMetricConfig(normalized);
      if (ownsOperation) completeOperation(operationId, "Workspace metric settings saved.");
    } catch (error) {
      const failure = classifyOperationFailure(error, operationId);
      const message = `${failure.message} Your previous metric settings are unchanged.`;
      setStatus(message);
      if (ownsOperation) {
        completeOperation(operationId, message, true, failure.recovery, failure.recoveryAction, {
          errorKind: failure.errorKind,
          lastKnownAvailable: true,
          stale: true,
          diagnosticRef: failure.diagnosticRef,
        });
      }
      throw error;
    }
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

  async function reinstallWorkspaceHelper(handle: FileSystemDirectoryHandle): Promise<"installed" | "permission-denied" | "unavailable" | "failed"> {
    const installer = window.__smInstallWorkspaceHelperV3;
    if (typeof installer !== "function") {
      return "unavailable";
    }

    if (!(await ensureWorkspaceWritePermission(handle))) {
      return "permission-denied";
    }

    try {
      return (await installer(handle)) ? "installed" : "failed";
    } catch {
      return "failed";
    }
  }

  function workspaceLoadStatus(
    handle: FileSystemDirectoryHandle,
    loadedTeams: TeamRuntime[],
    helperResult: "installed" | "permission-denied" | "unavailable" | "failed",
  ): string {
    const loaded = `Workspace loaded: ${handle.name}. Found ${loadedTeams.length} teams.`;
    if (helperResult === "installed") {
      return `${loaded} Jira helpers updated.`;
    }
    if (helperResult === "permission-denied") {
      return `${loaded} Jira helper update skipped: write permission was denied.`;
    }
    if (helperResult === "unavailable") {
      return `${loaded} Jira helper update unavailable: reload the app and try again.`;
    }
    return `${loaded} Jira helper update failed.`;
  }

  function workspaceOperationHint(): string | null {
    return busy ? `Unavailable while ${operation?.phase ?? "an operation"} is in progress.` : null;
  }

  async function handlePickWorkspace(): Promise<void> {
    if (busy) {
      setStatus(`Unavailable while ${operation?.phase ?? "an operation"} is in progress.`);
      return;
    }
    if (!fsApiSupported) {
      const operationId = beginOperation("Opening workspace", "This browser cannot access local folders. Use manual import.", "Manual import");
      if (operationId === null) return;
      completeOperation(operationId, "This browser cannot access local folders. Use manual import.", true, "Manual import", "manual-import", { errorKind: "unsupported-browser", lastKnownAvailable: Boolean(workspaceHandle), stale: Boolean(workspaceHandle), diagnosticRef: `op-${operationId}` });
      return;
    }

    const operationId = beginOperation("Opening workspace", "Loading workspace and teams…", "Choose Workspace");
    if (operationId === null) return;
    try {
      updateOperation(operationId, "Checking workspace", "Checking workspace access…");
      const handle = await pickWorkspaceDirectory();
      await rememberWorkspaceDirectory(handle);
      await refreshRememberedWorkspaces();

      updateOperation(operationId, "Updating local helper", "Updating the local Jira helper…");
      const helperResult = await reinstallWorkspaceHelper(handle);
      updateOperation(operationId, "Reading back local data", "Verifying workspace data…");
      const loadedTeams = await applyWorkspaceHandle(handle);
      setPage(loadedTeams.length > 0 ? "dashboard" : "workspace");
      const message = workspaceLoadStatus(handle, loadedTeams, helperResult);
      setStatus(message);
      completeOperation(operationId, message);
    } catch (error) {
      const failure = classifyOperationFailure(error, operationId);
      const recoveryAction = failure.errorKind === "unsupported-browser" ? "manual-import" : "choose-workspace";
      const recovery = recoveryAction === "manual-import" ? "Manual import" : "Choose Workspace";
      const message = recoveryAction === "manual-import"
        ? failure.message
        : "Workspace selection was not completed. Choose Workspace again.";
      setStatus(message);
      completeOperation(operationId, message, true, recovery, recoveryAction, { errorKind: failure.errorKind, lastKnownAvailable: Boolean(workspaceHandle), stale: Boolean(workspaceHandle), diagnosticRef: failure.diagnosticRef });
    } finally {
      // The operation ID guard prevents a stale open from clearing a newer action.
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Workspace operation finished.");
      }
    }
  }

  async function handleOpenRememberedWorkspace(workspaceId: string): Promise<void> {
    if (busy) {
      setStatus(`Unavailable while ${operation?.phase ?? "an operation"} is in progress.`);
      return;
    }
    if (!fsApiSupported) {
      const operationId = beginOperation("Opening workspace", "This browser cannot access local folders. Use manual import.", "Manual import");
      if (operationId === null) return;
      completeOperation(operationId, "This browser cannot access local folders. Use manual import.", true, "Manual import", "manual-import", { errorKind: "unsupported-browser", lastKnownAvailable: Boolean(workspaceHandle), stale: Boolean(workspaceHandle), diagnosticRef: `op-${operationId}` });
      return;
    }

    const operationId = beginOperation("Opening workspace", "Loading workspace and teams…", "Open workspace");
    if (operationId === null) return;
    if (operationRef.current?.operationId === operationId) {
      const current = operationRef.current;
      operationRef.current = { ...current, recoveryWorkspaceId: workspaceId };
      setOperation(operationRef.current);
    }
    try {
      updateOperation(operationId, "Restoring access", "Workspace permission is required to continue.");
      const handle = await openRememberedWorkspaceById(workspaceId);
      if (!handle) {
        const message = "Could not open remembered workspace. Permission was not granted. Choose Workspace manually.";
        setStatus(message);
        completeOperation(operationId, message, true, "Re-check permission", "recheck-permission", { errorKind: "permission-denied", lastKnownAvailable: Boolean(workspaceHandle), stale: Boolean(workspaceHandle), diagnosticRef: `op-${operationId}` });
        return;
      }

      updateOperation(operationId, "Updating local helper", "Updating the local Jira helper…");
      const helperResult = await reinstallWorkspaceHelper(handle);
      updateOperation(operationId, "Reading back local data", "Verifying workspace data…");
      const loadedTeams = await applyWorkspaceHandle(handle);
      setPage(loadedTeams.length > 0 ? "dashboard" : "workspace");
      const message = workspaceLoadStatus(handle, loadedTeams, helperResult);
      setStatus(message);
      completeOperation(operationId, message);
      await refreshRememberedWorkspaces();
    } catch (error) {
      const failure = classifyOperationFailure(error, operationId);
      setStatus(failure.message);
      completeOperation(operationId, failure.message, true, failure.recovery, failure.recoveryAction, { errorKind: failure.errorKind, lastKnownAvailable: Boolean(workspaceHandle), stale: Boolean(workspaceHandle), diagnosticRef: failure.diagnosticRef });
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Workspace operation finished.");
      }
    }
  }

  function handleOperationRecovery(): void {
    const action = operation?.recoveryAction;
    if (!action || operation?.state !== "error" || busy) return;
    retryCountRef.current = nextRetryCount(operation.retryCount);
    if (action === "retry-workspace") {
      void handlePickWorkspace();
    } else if (action === "retry-recalculate-all") {
      void handleRecalculateAll();
    } else if (action === "retry-team-save") {
      teamSaveRetryRef.current?.();
    } else if (action === "recheck-permission") {
      const recoveryWorkspaceId = operation?.recoveryWorkspaceId;
      if (recoveryWorkspaceId) {
        void handleOpenRememberedWorkspace(recoveryWorkspaceId);
      } else {
        void handlePickWorkspace();
      }
    } else if (action === "choose-workspace") {
      void handlePickWorkspace();
    } else if (action === "manual-import") {
      setPage("import");
    } else {
      void handleRecalculateSelectedTeam("manual");
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
    if (busy) {
      setStatus(`Unavailable while ${operation?.phase ?? "an operation"} is in progress.`);
      return;
    }
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
    if (busy) {
      setStatus(`Unavailable while ${operation?.phase ?? "an operation"} is in progress.`);
      return;
    }
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
    if (busy) {
      setStatus(`Unavailable while ${operation?.phase ?? "an operation"} is in progress.`);
      return;
    }
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

  async function handleUpdateTeamEntityType(teamId: string, entityType: TeamEntityType): Promise<void> {
    const team = teams.find((item) => item.teamId === teamId);
    if (!team) {
      setStatus("Selected entity was not found.");
      return;
    }

    const updatedTeam: TeamRuntime = {
      ...team,
      config: {
        ...team.config,
        entityType,
        safeConfig: {
          ...(team.config.safeConfig ?? { enabled: false, entityType: "team" }),
          entityType:
            entityType === "art"
              ? "agile-release-train"
              : entityType === "portfolio"
                ? "portfolio"
                : entityType === "vde"
                  ? "development-value-stream"
                  : "team",
        },
      },
    };

    const operationId = beginOperation("Saving team", "Saving team settings…", "Save team");
    if (operationId === null) return;
    teamSaveRetryRef.current = () => void handleUpdateTeamEntityType(teamId, entityType);
    try {
      updateOperation(operationId, "Writing local data", "Saving team settings…");
      await saveTeamConfig(updatedTeam);
      updateOperation(operationId, "Reading back local data", "Verifying team settings…");
      const refreshed = workspaceHandle
        ? await listTeams(workspaceHandle)
        : teams.map((item) => (item.teamId === teamId ? updatedTeam : item));
      setTeams(refreshed);
      setSelectedTeamId(teamId);
      setActiveMetricScope(getMetricScopeForEntityType(entityType));
      setStatus(`${team.config.teamName} moved to ${TEAM_ENTITY_LABELS[entityType]}.`);
    } catch (error) {
      const failure = classifyOperationFailure(error, operationId);
      const message = `${failure.message} Your previous settings are unchanged.`;
      setStatus(message);
      completeOperation(operationId, message, true, failure.recovery, "retry-team-save", { errorKind: failure.errorKind, lastKnownAvailable: true, stale: true, diagnosticRef: failure.diagnosticRef });
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
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

    const jql = newTeamJql.trim();
    if (!jql) {
      setStatus("JQL is required for new teams.");
      return;
    }

    const operationId = beginOperation("Saving team", "Saving team settings…", "Save team settings");
    if (operationId === null) return;
    try {
      const createdTeam = await addTeam(workspaceHandle, name, newTeamDescription.trim() || undefined, newTeamEntityType, jql);
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
      setNewTeamEntityType("team");
      setNewTeamJql("");
      setShowAddTeamModal(false);
      setStatus(`${TEAM_ENTITY_LABELS[newTeamEntityType]} "${name}" created. Use renew-team.command in the workspace folder to pull Jira data.`);
    } catch (error) {
      failOperation(operationId, error, "Failed to create team.");
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
    }
  }

  async function handleRecalculateAll(): Promise<void> {
    if (busy) {
      setStatus(`Unavailable while ${operation?.phase ?? "an operation"} is in progress.`);
      return;
    }
    if (!workspaceHandle) {
      return;
    }

      const operationId = beginOperation("Recalculating all teams", "Recalculating teams locally…", "Recalculate all");
    if (operationId === null) return;
    try {
      updateOperation(operationId, "Writing local data", "Writing local team metrics…");
      const currentTeams = await listTeams(workspaceHandle);
      for (const team of currentTeams) {
        await analyzeTeam(team);
      }

      updateOperation(operationId, "Reading back local data", "Verifying recalculated team data…");
      const refreshed = await listTeams(workspaceHandle);
      const refreshedWithProgress: TeamRuntime[] = [];
      let savedSnapshots = 0;

      for (const team of refreshed) {
        const snapshot = buildTeamProgressSnapshot(team, new Date());
          updateOperation(operationId, "Writing local data", "Saving team progress…");
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
      const message = `All teams recalculated. ${refreshedWithProgress.length} team(s) updated locally; ${savedSnapshots} progress snapshot(s) saved.`;
      setStatus(message);
      completeOperation(operationId, message);
    } catch (error) {
      const failure = classifyOperationFailure(error, operationId);
      const message = `${failure.message} Your previous metrics remain available.`;
      setStatus(message);
      completeOperation(operationId, message, true, failure.recovery, "retry-recalculate-all", { errorKind: failure.errorKind, lastKnownAvailable: true, stale: true, diagnosticRef: failure.diagnosticRef });
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "All-team recalculation finished.");
      }
    }
  }

  async function handleSaveAdvancedConfig(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (busy) {
      setStatus(`Unavailable while ${operation?.phase ?? "an operation"} is in progress.`);
      return;
    }

    if (!selectedTeam || !draftConfig) {
      setStatus("Select team first.");
      return;
    }

    if (!workflowSaveConfirmationOpen) {
      setWorkflowSaveConfirmationOpen(true);
      setStatus("Review the status-role mapping, then confirm save.");
      return;
    }
    setWorkflowSaveConfirmationOpen(false);

    const normalizedVelocity = normalizeVelocityConfig(draftConfig.velocityConfig);
    const workflowVelocityConfig: VelocityConfig =
      normalizedVelocity.mode === "sprint-story-points"
        ? normalizedVelocity
        : { mode: "weekly-ticket-count" };
    const functionalCoverage = parseOptionalPercentInput(functionalCoverageInput);
    const unitTestCoverage = parseOptionalPercentInput(unitTestCoverageInput);
    const technicalDebtAvgDays = parseOptionalNonNegativeNumberInput(technicalDebtInput);

    const maintenanceLifecycleSave = validateMaintenanceLifecycleConfigForSave(
      maintenanceLifecycleKeyInput,
      draftConfig.maintenanceLifecycle,
    );
    if (!maintenanceLifecycleSave.accepted) {
      setStatus(`Could not save team settings. ${maintenanceLifecycleSave.error} Your previous settings are unchanged.`);
      return;
    }

    if (functionalCoverageInput.trim().length > 0 && functionalCoverage === null) {
      setStatus("Functional test coverage must be a number from 0 to 100.");
      return;
    }

    if (unitTestCoverageInput.trim().length > 0 && unitTestCoverage === null) {
      setStatus("Unit test coverage must be a number from 0 to 100.");
      return;
    }

    if (technicalDebtInput.trim().length > 0 && technicalDebtAvgDays === null) {
      setStatus("Technical debt average must be a non-negative number of days.");
      return;
    }

    const engineeringMetrics =
      functionalCoverage === null && unitTestCoverage === null && technicalDebtAvgDays === null
        ? undefined
        : {
            functionalTestCoveragePct: functionalCoverage ?? undefined,
            unitTestCoveragePct: unitTestCoverage ?? undefined,
            technicalDebtAvgDays: technicalDebtAvgDays ?? undefined,
            updatedAt: new Date().toISOString(),
          };

    const unifiedValidation = validateUnifiedFlowStatusConfig(unifiedStatusDraft);
    if (unifiedValidation.state !== "valid" || !unifiedValidation.config) {
      setStatus(`Could not save team settings. ${unifiedValidation.errors.join(" ")}`);
      return;
    }
    const compatibilityGroups = legacyGroupsFromUnifiedFlowStatusConfig(unifiedValidation.config);

    const operationId = beginOperation("Saving team", "Saving settings…", "Save team settings");
    if (operationId === null) return;
    teamSaveRetryRef.current = () => void handleSaveAdvancedConfig(event);
    try {
    const updatedConfig: TeamConfig = {
        ...draftConfig,
        doneConfig: {
          ...draftConfig.doneConfig,
          doneStatuses: unifiedValidation.config.doneStatuses,
        },
        cycleTimeConfig: {
          endDateSource: "resolvedOrUpdated",
          durationSource: "timeInStatus",
        },
        sleConfig: {
          ...draftConfig.sleConfig,
          issueTypes: normalizeSleIssueTypes(draftConfig.sleConfig.issueTypes),
        },
        velocityConfig: workflowVelocityConfig,
        sprintScopeConfig: {
          statuses: unifiedValidation.config.cycleStatuses,
        },
        workflowConfig: {
          backlogStatuses: backlogStatusList,
          funnelStatuses: compatibilityGroups.funnelStatuses,
          activeStatuses: compatibilityGroups.activeStatuses,
          implementingStatuses: compatibilityGroups.implementingStatuses,
          statusSets: unifiedValidation.config,
        },
        flowTimingConfig: normalizeFlowTimingConfig(draftConfig.flowTimingConfig),
        engineeringMetrics,
        maintenanceLifecycle: maintenanceLifecycleSave.config,
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

      updateOperation(operationId, "Writing local data", "Saving team settings…");
      await saveTeamConfig(updatedTeam);
      updateOperation(operationId, "Writing local data", "Writing recalculated team metrics…");
      await analyzeTeam(updatedTeam);
      updateOperation(operationId, "Reading back local data", "Verifying team metrics…");
      await refreshTeams();
      setStatus("Team config saved and metrics recalculated.");
    } catch (error) {
      const failure = classifyOperationFailure(error, operationId);
      const message = `${failure.message} Your previous settings are unchanged.`;
      setStatus(message);
      completeOperation(operationId, message, true, failure.recovery, "retry-team-save", { errorKind: failure.errorKind, lastKnownAvailable: true, stale: true, diagnosticRef: failure.diagnosticRef });
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
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

    const operationId = beginOperation("Saving team", "Saving team settings…", "Save team settings");
    if (operationId === null) return;
    try {
      updateOperation(operationId, "Writing local data", "Saving team settings…");
      await saveTeamConfig(updatedTeam);
      updateOperation(operationId, "Writing local data", "Writing recalculated team metrics…");
      await analyzeTeam(updatedTeam);
      updateOperation(operationId, "Reading back local data", "Verifying team metrics…");
      await refreshTeams();
      setStatus(`Bug type metric config saved for ${selectedTeam.config.teamName}.`);
    } catch (error) {
      failOperation(operationId, error, "Failed to save bug metric config.");
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
    }
  }

  async function persistImportTeamConfig(nextConfig: TeamConfig, successMessage: string): Promise<void> {
    if (!selectedImportTeam) {
      return;
    }

    const operationId = beginOperation("Saving team", "Saving team settings…", "Save team settings");
    if (operationId === null) return;
    try {
      const updatedTeam: TeamRuntime = {
        ...selectedImportTeam,
        config: nextConfig,
      };

      updateOperation(operationId, "Writing local data", "Saving team settings…");
      await saveTeamConfig(updatedTeam);
      updateOperation(operationId, "Reading back local data", "Verifying team settings…");
      await refreshTeams();
      setStatus(successMessage);
    } catch (error) {
      failOperation(operationId, error, "Failed to save team query.");
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
    }
  }

  async function handleSaveImportTeamJql(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedImportTeam) {
      setStatus("Select team first.");
      return;
    }

    const jql = queryDraftJql.trim();
    if (!jql) {
      setStatus("JQL is required.");
      return;
    }

    const selectedQuery = resolvePreferredSavedQuery(selectedIssueQueryConfig, querySelectionId);
    const queryId = selectedQuery?.id ?? "default";
    const queryName = selectedQuery?.name ?? queryDraftName.trim();
    const nextQuery: JiraSavedQuery = {
      id: queryId,
      name: queryName || "Team Import Query",
      jql,
      note: queryDraftNote.trim() || "Used for both Issues CSV and Time in Status.",
    };

    const hasExistingQuery = selectedIssueQueryConfig.queries.some((query) => query.id === queryId);
    const nextCollection: JiraQueryCollection = {
      defaultQueryId: queryId,
      queries: hasExistingQuery
        ? selectedIssueQueryConfig.queries.map((query) => (query.id === queryId ? nextQuery : query))
        : [...selectedIssueQueryConfig.queries, nextQuery],
    };
    const nextConfig: TeamConfig = buildTeamConfigWithSavedQueries(
      selectedImportTeam.config,
      selectedTeamJiraQueryConfig,
      "issueQuery",
      nextCollection,
    );

    setQuerySelectionId(queryId);
    await persistImportTeamConfig(nextConfig, `JQL saved for ${selectedImportTeam.config.teamName}.`);
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

    const operationId = beginOperation("Saving team", "Saving team settings…", "Save team settings");
    if (operationId === null) return;
    try {
      updateOperation(operationId, "Writing local data", "Saving bottleneck data…");
      await saveTeamBottleneckEntries(updatedTeam, nextEntries);
      updateOperation(operationId, "Reading back local data", "Verifying bottleneck data…");
      await refreshTeams();
      setStatus(`Bottleneck saved for ${selectedTeam.config.teamName} (${period}).`);
    } catch (error) {
      failOperation(operationId, error, "Failed to save bottleneck.");
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
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

    const operationId = beginOperation("Saving team", "Saving team settings…", "Save team settings");
    if (operationId === null) return;
    try {
      updateOperation(operationId, "Writing local data", "Saving bottleneck data…");
      await saveTeamBottleneckEntries(updatedTeam, nextEntries);
      updateOperation(operationId, "Reading back local data", "Verifying bottleneck data…");
      await refreshTeams();
      if (bottleneckPeriodInput === period) {
        setBottleneckRows(buildBottleneckRowsFromStatuses(bottleneckFlowStatuses));
        setBottleneckNotesInput("");
      }
      setStatus(`Removed bottleneck entry ${period} for ${selectedTeam.config.teamName}.`);
    } catch (error) {
      failOperation(operationId, error, "Failed to delete bottleneck entry.");
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
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

    const operationId = beginOperation("Saving team", "Saving team settings…", "Save team settings");
    if (operationId === null) return;
    try {
      updateOperation(operationId, "Writing local data", "Saving flow template…");
      await saveTeamConfig(updatedTeam);
      updateOperation(operationId, "Reading back local data", "Verifying flow template…");
      await refreshTeams();
      setStatus("Flow template saved for " + selectedTeam.config.teamName + ".");
    } catch (error) {
      failOperation(operationId, error, "Failed to save flow template.");
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
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

    const operationId = beginOperation("Saving team", "Saving team settings…", "Save team settings");
    if (operationId === null) return;
    try {
      updateOperation(operationId, "Writing local data", "Saving flow template…");
      await saveTeamConfig(updatedTeam);
      updateOperation(operationId, "Reading back local data", "Verifying flow template…");
      await refreshTeams();
      setStatus("Flow template updated from current month rows for " + selectedTeam.config.teamName + ".");
    } catch (error) {
      failOperation(operationId, error, "Failed to save flow template from rows.");
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
    }
  }

  async function handleExcludeIssuesFromMetrics(issueKeys: string[], reason: string): Promise<void> {
    if (!selectedTeam) {
      return;
    }

    const normalizedKeys = Array.from(new Set(issueKeys.map((issueKey) => issueKey.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
    const normalizedReason = reason.trim();
    if (normalizedKeys.length === 0 || normalizedReason.length < 5) {
      setStatus("A data-quality exclusion requires issue key(s) and a specific reason.");
      return;
    }

    const existingKeys = new Set(
      [
        ...(selectedTeam.config.excludedIssueKeys ?? []),
        ...(selectedTeam.config.issueExclusions ?? []).map((exclusion) => exclusion.issueKey),
      ].map(normalizeTextValue),
    );

    const keysToAdd = normalizedKeys.filter((issueKey) => !existingKeys.has(normalizeTextValue(issueKey)));
    if (keysToAdd.length === 0) {
      setStatus(`Selected issue(s) are already excluded for ${selectedTeam.config.teamName}.`);
      return;
    }

    const updatedTeam: TeamRuntime = {
      ...selectedTeam,
      config: {
        ...selectedTeam.config,
        excludedIssueKeys: [...(selectedTeam.config.excludedIssueKeys ?? []), ...keysToAdd].sort((a, b) => a.localeCompare(b)),
        issueExclusions: [
          ...(selectedTeam.config.issueExclusions ?? []),
          ...keysToAdd.map((issueKey) => ({
            issueKey,
            reason: normalizedReason,
            category: "data-quality" as const,
            createdAt: new Date().toISOString(),
          })),
        ],
      },
    };

    const operationId = beginOperation("Saving team", "Saving team settings…", "Save team settings");
    if (operationId === null) return;
    try {
      updateOperation(operationId, "Writing local data", "Saving issue exclusions…");
      await saveTeamConfig(updatedTeam);
      updateOperation(operationId, "Writing local data", "Writing recalculated team metrics…");
      await analyzeTeam(updatedTeam);
      updateOperation(operationId, "Reading back local data", "Verifying team metrics…");
      await refreshTeams();

      setStatus(
        keysToAdd.length === 1
          ? `Excluded ${keysToAdd[0]} as a recorded data-quality error for ${selectedTeam.config.teamName}.`
          : `Excluded ${keysToAdd.length} data-quality outliers for ${selectedTeam.config.teamName}.`,
      );
    } catch (error) {
      failOperation(operationId, error, "Failed to exclude issue(s).");
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
    }
  }

  async function handleExcludeIssueFromMetrics(issueKey: string, reason: string): Promise<void> {
    await handleExcludeIssuesFromMetrics([issueKey], reason);
  }

  async function handleRestoreExcludedIssue(issueKey: string): Promise<void> {
    if (!selectedTeam) {
      return;
    }

    const normalizedIssueKey = normalizeTextValue(issueKey);
    const remaining = (selectedTeam.config.excludedIssueKeys ?? []).filter(
      (key) => normalizeTextValue(key) !== normalizedIssueKey,
    );
    const remainingExclusions = (selectedTeam.config.issueExclusions ?? []).filter(
      (exclusion) => normalizeTextValue(exclusion.issueKey) !== normalizedIssueKey,
    );

    const updatedTeam: TeamRuntime = {
      ...selectedTeam,
      config: {
        ...selectedTeam.config,
        excludedIssueKeys: remaining,
        issueExclusions: remainingExclusions,
      },
    };

    const operationId = beginOperation("Saving team", "Saving team settings…", "Save team settings");
    if (operationId === null) return;
    try {
      updateOperation(operationId, "Writing local data", "Saving issue exclusions…");
      await saveTeamConfig(updatedTeam);
      updateOperation(operationId, "Writing local data", "Writing recalculated team metrics…");
      await analyzeTeam(updatedTeam);
      updateOperation(operationId, "Reading back local data", "Verifying team metrics…");
      await refreshTeams();
      setStatus("Restored " + issueKey + " into " + selectedTeam.config.teamName + " metrics.");
    } catch (error) {
      failOperation(operationId, error, "Failed to restore issue.");
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
    }
  }

  async function handleRestoreAllExcludedIssues(): Promise<void> {
    if (!selectedTeam) {
      return;
    }

    const currentExcluded = [
      ...(selectedTeam.config.excludedIssueKeys ?? []),
      ...(selectedTeam.config.issueExclusions ?? []).map((exclusion) => exclusion.issueKey),
    ];
    if (currentExcluded.length === 0) {
      setStatus("No excluded anomalies to restore.");
      return;
    }

    const updatedTeam: TeamRuntime = {
      ...selectedTeam,
      config: {
        ...selectedTeam.config,
        excludedIssueKeys: [],
        issueExclusions: [],
      },
    };

    const operationId = beginOperation("Saving team", "Saving team settings…", "Save team settings");
    if (operationId === null) return;
    try {
      updateOperation(operationId, "Writing local data", "Saving issue exclusions…");
      await saveTeamConfig(updatedTeam);
      updateOperation(operationId, "Writing local data", "Writing recalculated team metrics…");
      await analyzeTeam(updatedTeam);
      updateOperation(operationId, "Reading back local data", "Verifying team metrics…");
      await refreshTeams();
      setStatus("Restored all excluded anomalies for " + selectedTeam.config.teamName + ".");
    } catch (error) {
      failOperation(operationId, error, "Failed to restore anomalies.");
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
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

    const operationId = beginOperation("Saving team", "Saving team settings…", "Save team settings");
    if (operationId === null) return;
    try {
      updateOperation(operationId, "Writing local data", "Saving SLE settings…");
      await saveTeamConfig(updatedTeam);
      updateOperation(operationId, "Writing local data", "Writing recalculated team metrics…");
      await analyzeTeam(updatedTeam);
      updateOperation(operationId, "Reading back local data", "Verifying team metrics…");
      await refreshTeams();
      setStatus(`SLE filter updated for ${selectedTeam.config.teamName}: ${nextTypes.join(", ")}.`);
    } catch (error) {
      failOperation(operationId, error, "Failed to update SLE issue type filter.");
    } finally {
      if (operationRef.current?.operationId === operationId && operationRef.current.state === "active") {
        completeOperation(operationId, "Team settings saved.");
      }
    }
  }

  function openTeamView(teamId: string): void {
    const target = teams.find((team) => team.teamId === teamId);
    setSelectedTeamId(teamId);
    setActiveMetricScope(getMetricScopeForEntityType(getTeamEntityType(target?.config)));
    setTeamTab("overview");
    setPage("team");
    writeTeamRoute({ page: "team", teamId, mode: teamViewMode, tab: "overview", period: periodMonth }, "user");
    setMobileNavOpen(false);
  }

  function openDashboardScope(scope: MetricScope): void {
    setActiveMetricScope(scope);
    setSelectedTeamId((current) => {
      if (!current) {
        return null;
      }

      const selected = teams.find((team) => team.teamId === current);
      return selected && getMetricScopeForEntityType(getTeamEntityType(selected.config)) === scope ? current : null;
    });
    setPage("dashboard");
    setMobileNavOpen(false);
  }

  function mutateUnifiedStatusDraft(mutator: (current: UnifiedFlowStatusConfig) => UnifiedFlowStatusConfig): void {
    setUnifiedStatusDraft((current) => {
      const fallback = current ?? normalizeUnifiedFlowStatusConfig(draftConfig?.workflowConfig?.statusSets) ?? {
        leadStatuses: [], cycleStatuses: [], implementationStatuses: [], doneStatuses: [],
      };
      return mutator(fallback);
    });
  }

  function handleApplyClassicJiraPreset(): void {
    mutateUnifiedStatusDraft((current) => ({ ...current, doneStatuses: ["Done", "Closed", "Resolved"] }));
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
    mutateUnifiedStatusDraft((current) => ({ ...current, doneStatuses: ["AC Test"] }));
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
    mutateUnifiedStatusDraft((current) => ({ ...current, doneStatuses: nextList }));
    setDoneStatusDraft("");
  }

  function handleRemoveDoneStatus(value: string): void {
    const normalized = normalizeTextValue(value);
    const nextList = doneStatusList.filter((item) => normalizeTextValue(item) !== normalized);
    mutateUnifiedStatusDraft((current) => ({ ...current, doneStatuses: nextList }));
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

    mutateUnifiedStatusDraft((current) => ({ ...current, cycleStatuses: [...current.cycleStatuses, nextValue], leadStatuses: [...current.leadStatuses, nextValue] }));
    setSprintScopeStatusDraft("");
  }

  function handleRemoveSprintScopeStatus(value: string): void {
    const normalized = normalizeTextValue(value);
    mutateUnifiedStatusDraft((current) => ({ ...current, cycleStatuses: current.cycleStatuses.filter((item) => normalizeTextValue(item) !== normalized) }));
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

  function handleAddFunnelStatus(): void {
    const nextValue = funnelStatusDraft.trim();
    if (!nextValue) {
      return;
    }

    mutateUnifiedStatusDraft((current) => ({ ...current, leadStatuses: [...current.leadStatuses, nextValue] }));
    setFunnelStatusDraft("");
  }

  function handleRemoveFunnelStatus(value: string): void {
    const normalized = normalizeTextValue(value);
    mutateUnifiedStatusDraft((current) => ({ ...current, leadStatuses: current.leadStatuses.filter((item) => normalizeTextValue(item) !== normalized) }));
  }

  function handleAddImplementingStatus(): void {
    const nextValue = implementingStatusDraft.trim();
    if (!nextValue) {
      return;
    }

    mutateUnifiedStatusDraft((current) => ({ ...current, implementationStatuses: [...current.implementationStatuses, nextValue], cycleStatuses: [...current.cycleStatuses, nextValue], leadStatuses: [...current.leadStatuses, nextValue] }));
    setImplementingStatusDraft("");
  }

  function handleRemoveImplementingStatus(value: string): void {
    const normalized = normalizeTextValue(value);
    mutateUnifiedStatusDraft((current) => ({ ...current, implementationStatuses: current.implementationStatuses.filter((item) => normalizeTextValue(item) !== normalized) }));
  }

  function handleClassifyWorkflowStatus(statusName: string, category: "backlog" | "funnel" | "active" | "implementing" | "done"): void {
    const normalized = normalizeTextValue(statusName);
    const withoutStatus = (values: string[]) => values.filter((item) => normalizeTextValue(item) !== normalized);
    mutateUnifiedStatusDraft((current) => {
      const next = {
        leadStatuses: withoutStatus(current.leadStatuses),
        cycleStatuses: withoutStatus(current.cycleStatuses),
        implementationStatuses: withoutStatus(current.implementationStatuses),
        doneStatuses: withoutStatus(current.doneStatuses),
      };
      if (category === "funnel") next.leadStatuses.push(statusName);
      if (category === "active") next.cycleStatuses.push(statusName), next.leadStatuses.push(statusName);
      if (category === "implementing") next.implementationStatuses.push(statusName), next.cycleStatuses.push(statusName), next.leadStatuses.push(statusName);
      if (category === "done") next.doneStatuses.push(statusName);
      return next;
    });
  }

  function handleToggleFlowTimingScope(scope: "closed" | "open", checked: boolean): void {
    setDraftConfig((curr) => {
      if (!curr) {
        return curr;
      }

      const current = normalizeFlowTimingConfig(curr.flowTimingConfig);
      const next = {
        ...current,
        includeClosedTickets: scope === "closed" ? checked : current.includeClosedTickets,
        includeOpenTickets: scope === "open" ? checked : current.includeOpenTickets,
      };

      if (!next.includeClosedTickets && !next.includeOpenTickets) {
        return curr;
      }

      return {
        ...curr,
        flowTimingConfig: next,
      };
    });
  }

  function handleResetSprintScopeStatuses(): void {
    const autoDetected = selectedTeam ? inferWorkflowConfig(selectedTeam.parsedIssues, doneStatusList).activeStatuses : [];
    mutateUnifiedStatusDraft((current) => ({ ...current, cycleStatuses: [...autoDetected, ...current.implementationStatuses], leadStatuses: [...current.leadStatuses, ...autoDetected] }));
    setSprintScopeStatusDraft("");
  }

  function handleResetWorkflowStatuses(): void {
    if (!selectedTeam) {
      return;
    }

    const autoDetected = inferWorkflowConfig(selectedTeam.parsedIssues, doneStatusList);
    setBacklogStatusesInput(autoDetected.backlogStatuses.join(", "));
    setUnifiedStatusDraft(buildUnifiedFlowStatusConfigFromLegacyGroups({ ...autoDetected, doneStatuses: doneStatusList }).config);
    setBacklogStatusDraft("");
    setFunnelStatusDraft("");
    setSprintScopeStatusDraft("");
    setImplementingStatusDraft("");
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
        return metric.group === "Flow" || metric.id === "data-monitor";
      }
      return ["stories-done", "lead-time", "active-time", "cycle-time", "sle-p85", "data-monitor"].includes(metric.id);
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
            computeSnapshot(selectedTeam.metrics, previousPeriodKey, selectedTeam.config, selectedTeam.parsedIssues, todayRef).sle.p85,
            buildOpenCycleTimeByIssueKey(selectedTeam.metrics),
          );
    const metricsRows: Array<[string, string, string, string, string]> = [
      ["Key Metrics Snapshot", "", "", "", periodMonth],
      [
        "Items Done",
        String(selectedTeamRow.current.done),
        getPreviousDoneValue(),
        selectedTeamRow.trends.done.label,
        periodMonth,
      ],
      [
        "Lead Time",
        formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.avgDays ?? null),
        selectedTeamRow.previous ? formatWorkingDays(getFlowPresentationValue(selectedTeamRow.previous.flowTiming, "lead")?.avgDays ?? null) : "-",
        selectedTeamRow.trends.leadTime.label,
        periodMonth,
      ],
      [
        FLOW_LABELS.cycle,
        formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.avgDays ?? null),
        selectedTeamRow.previous ? formatWorkingDays(getFlowPresentationValue(selectedTeamRow.previous.flowTiming, "cycle")?.avgDays ?? null) : "-",
        selectedTeamRow.trends.activeTime.label,
        periodMonth,
      ],
      [
        FLOW_LABELS.implementation,
        formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.avgDays ?? null),
        selectedTeamRow.previous ? formatWorkingDays(getFlowPresentationValue(selectedTeamRow.previous.flowTiming, "implementation")?.avgDays ?? null) : "-",
        selectedTeamRow.trends.flowCycleTime.label,
        periodMonth,
      ],
      [
        "SLE P85",
        formatWorkingDays(selectedTeamRow.current.sle.p85),
        getPreviousSleValue("p85"),
        selectedTeamRow.trends.sleP85.label,
        periodMonth,
      ],
      [
        "Avg Velocity",
        formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig),
        getPreviousVelocityValue(),
        selectedTeamRow.trends.velocity.label,
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
        "Functional Test Coverage",
        formatEngineeringPercent(selectedTeam.config.engineeringMetrics?.functionalTestCoveragePct),
        "-",
        "Manual/External",
        periodMonth,
      ],
      [
        "Unit Test Coverage",
        formatEngineeringPercent(selectedTeam.config.engineeringMetrics?.unitTestCoveragePct),
        "-",
        "Manual/External",
        periodMonth,
      ],
      [
        "Technical Debt Average",
        formatEngineeringDays(selectedTeam.config.engineeringMetrics?.technicalDebtAvgDays),
        "-",
        "Manual/External",
        periodMonth,
      ],
      [
        "Old open tickets",
        `${formatPercentValue(selectedTeamHealth.wipRisk.over30Pct)}% older than 30 days`,
        previousHealth
          ? `${formatPercentValue(previousHealth.wipRisk.over30Pct)}% older than 30 days`
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
        "Lead Time",
        formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.avgDays ?? null),
        selectedTeamRow.previous ? formatWorkingDays(getFlowPresentationValue(selectedTeamRow.previous.flowTiming, "lead")?.avgDays ?? null) : "-",
        selectedTeamRow.trends.leadTime.label,
        periodMonth,
      ],
      [
        FLOW_LABELS.cycle,
        formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.avgDays ?? null),
        selectedTeamRow.previous ? formatWorkingDays(getFlowPresentationValue(selectedTeamRow.previous.flowTiming, "cycle")?.avgDays ?? null) : "-",
        selectedTeamRow.trends.activeTime.label,
        periodMonth,
      ],
      [
        FLOW_LABELS.implementation,
        formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.avgDays ?? null),
        selectedTeamRow.previous ? formatWorkingDays(getFlowPresentationValue(selectedTeamRow.previous.flowTiming, "implementation")?.avgDays ?? null) : "-",
        selectedTeamRow.trends.flowCycleTime.label,
        periodMonth,
      ],
      [
        "SLE P50",
        formatWorkingDays(selectedTeamRow.current.sle.p50),
        getPreviousSleValue("p50"),
        selectedTeamRow.trends.sleP50.label,
        periodMonth,
      ],
      [
        "SLE P70",
        formatWorkingDays(selectedTeamRow.current.sle.p70),
        getPreviousSleValue("p70"),
        selectedTeamRow.trends.sleP70.label,
        periodMonth,
      ],
      [
        "SLE P85",
        formatWorkingDays(selectedTeamRow.current.sle.p85),
        getPreviousSleValue("p85"),
        selectedTeamRow.trends.sleP85.label,
        periodMonth,
      ],
      [
        "SLE P95",
        formatWorkingDays(selectedTeamRow.current.sle.p95),
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
        "Avg Velocity",
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
      "Lead Time",
      FLOW_LABELS.cycle,
      FLOW_LABELS.implementation,
      "SLE P85",
      "Past SLE P85",
      "Old open tickets",
      "Not updated",
      "Bug Ratio",
      "Work Mix",
      "Monte Carlo",
      "2+ Sprint %",
      "Avg Velocity",
      "Bottleneck",
    ];
    const dashboardTeamMetricsRows = dashboardRows.map((row) => [
      row.team.config.teamName,
      formatMetricWithTrendCsv(String(row.current.done), row.trends.done),
      formatMetricWithTrendCsv(formatWorkingDays(getFlowPresentationValue(row.current.flowTiming, "lead")?.avgDays ?? null), row.trends.leadTime),
      formatMetricWithTrendCsv(formatWorkingDays(getFlowPresentationValue(row.current.flowTiming, "cycle")?.avgDays ?? null), row.trends.activeTime),
      formatMetricWithTrendCsv(formatWorkingDays(getFlowPresentationValue(row.current.flowTiming, "implementation")?.avgDays ?? null), row.trends.flowCycleTime),
      formatMetricWithTrendCsv(formatWorkingDays(row.current.sle.p85), row.trends.sleP85),
      formatMetricWithTrendCsv(formatSleRiskValue(row.healthCurrent.sleRisk), row.healthTrends.sleRisk),
      formatMetricWithTrendCsv(
        `${formatPercentValue(row.healthCurrent.wipRisk.over30Pct)}% older than 30 days`,
        row.healthTrends.wipAgeRisk,
      ),
      formatMetricWithTrendCsv(formatStaleWipValue(row.healthCurrent.staleWip), row.healthTrends.staleWip),
      formatMetricWithTrendCsv(
        row.healthCurrent.bugRatio.doneBugRatio === null
          ? "-"
          : `${formatPercentValue(row.healthCurrent.bugRatio.doneBugRatio)}%`,
        row.healthTrends.bugRatio,
      ),
      formatWorkMixSummary(row.healthCurrent.workMix),
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

  function executiveSigFromHealthTone(tone: HealthTone): ExecSig {
    if (tone === "bad") {
      return "critical";
    }
    if (tone === "warn") {
      return "warning";
    }
    return tone;
  }

  function executiveSigFromTrend(trendResult: TrendResult, betterWhen: "up" | "down" = "down"): ExecutiveTeamMetric["trend"] {
    if (trendResult.tone === "neutral") {
      return "flat";
    }
    if (trendResult.tone === "good") {
      return betterWhen === "up" ? "up" : "down";
    }
    return betterWhen === "up" ? "down" : "up";
  }

  function executiveMetric(
    label: string,
    value: string,
    tone: ExecSig,
    options: Partial<Omit<ExecutiveTeamMetric, "label" | "value" | "tone">> = {},
  ): ExecutiveTeamMetric {
    return { label, value, tone, ...options };
  }

  const executiveDashboardTeams: ExecutiveDashboardTeam[] = dashboardRows.map((row) => {
    const atRiskPct = row.healthCurrent.sleRisk.atRiskPct ?? 0;
    const bugRatio = row.healthCurrent.bugRatio.doneBugRatio;
    const health: ExecSig = atRiskPct > 50 || (bugRatio ?? 0) > 15 ? "critical" : atRiskPct > 20 || (bugRatio ?? 0) > 10 ? "warning" : "good";
    return {
      teamId: row.team.teamId,
      name: row.team.config.teamName,
      imports: row.team.importFiles.length,
      dataRows: row.team.parsedIssues.length,
      done: row.current.done,
      openTickets: row.healthCurrent.agingWip.total,
      lead: getFlowPresentationValue(row.current.flowTiming, "lead")?.avgDays ?? null,
      active: getFlowPresentationValue(row.current.flowTiming, "cycle")?.avgDays ?? null,
      cycle: getFlowPresentationValue(row.current.flowTiming, "implementation")?.avgDays ?? null,
      sle: row.current.sle.p85,
      bugRatio,
      workMix: formatWorkMixSummary(row.healthCurrent.workMix),
      velocity: formatVelocityValue(row.current.velocity, row.team.config.velocityConfig),
      bottleneck: row.healthCurrent.queueTime.topStatuses[0]?.status ?? "—",
      bottleneckDays: row.healthCurrent.queueTime.topStatuses[0]?.avgDays ?? null,
      health,
    };
  });

  const executiveDashboardSummary: ExecutiveDashboardSummary = {
    teams: dashboardScopeSummary.teamCount,
    dataRows: dashboardScopeSummary.dataRowCount,
    done: dashboardScopeSummary.doneCount,
    openTickets: dashboardScopeSummary.openWipCount,
    avgCycleTime: dashboardScopeSummary.avgCycleTime,
    sleP85: dashboardScopeSummary.sleP85,
    latestDataLabel: dashboardScopeSummary.latestImportAt ? formatDateText(dashboardScopeSummary.latestImportAt) : "-",
  };

  // Team and Scrum Master must render the same selected-period Time in Status model.
  // Do not build a second flow model from the latest bottleneck month.
  const executiveTimeInStatus: ExecutiveFlowStage[] = selectedTimeInStatusRows
    .filter(
      (row): row is TimeInStatusStatusRow & { avgDays: number } =>
        row.avgDays !== null && (row.category === "active" || row.category === "queue"),
    )
    .map((row) => {
      const type: ExecutiveFlowStage["type"] = isQueueTimeStatus(row.name, selectedTeam?.config) ? "queue" : "active";
      return {
        name: row.name,
        days: row.avgDays,
        type,
        signal: executiveSigFromHealthTone(row.tone),
      };
    });

  const executiveFlowStages: ExecutiveFlowStage[] = executiveTimeInStatus;
  const executiveFlowSummary = buildExecutiveFlowSummary(executiveFlowStages);
  const executiveFlowEfficiencyTone: ExecSig =
    executiveFlowSummary.flowEfficiencyPct === null
      ? "neutral"
      : executiveFlowSummary.flowEfficiencyPct >= 75
        ? "good"
        : executiveFlowSummary.flowEfficiencyPct >= 45
          ? "warning"
          : "critical";
  const executiveBottleneckTone: ExecSig =
    executiveFlowSummary.biggestQueueDays === null
      ? "neutral"
      : executiveFlowSummary.biggestQueueDays > 20
        ? "critical"
        : executiveFlowSummary.biggestQueueDays > 7
          ? "warning"
          : "good";
  const executiveBottleneckSummary = executiveFlowSummary.biggestQueueName
    ? `${periodSummary.currentLabel}: ${executiveFlowSummary.biggestQueueName} (${executiveFlowSummary.biggestQueueDays?.toFixed(1)} days).`
    : `No queue-stage Time in Status data for ${periodSummary.currentLabel}.`;

  const executiveThroughputWeekly: ExecutiveChartPoint[] = selectedTeamHealth.throughputStability.weeklyRecentCounts.length > 0
    ? selectedTeamHealth.throughputStability.weeklyRecentCounts.slice(-12).map((value, index, values) => ({
        label: `W${index + 1 + Math.max(0, selectedTeamHealth.throughputStability.weeklyRecentCounts.length - values.length)}`,
        value,
      }))
    : [{ label: "Current", value: selectedTeamHealth.throughput.last30Days }];

  const executiveCycleTimeWeekly: ExecutiveChartPoint[] = availableMonths
    .slice(-12)
    .map((month) => {
      const snapshot = selectedTeam
        ? computeSnapshot(selectedTeam.metrics, month, selectedTeam.config, selectedTeam.parsedIssues, periodReferenceDate)
        : null;
      return {
        label: formatMonthLabel(month).split(" ")[0],
        p50: snapshot ? getFlowPresentationValue(snapshot.flowTiming, "implementation")?.p50 ?? undefined : undefined,
        p85: snapshot ? getFlowPresentationValue(snapshot.flowTiming, "implementation")?.p85 ?? undefined : undefined,
      };
    })
    .filter((point) => point.p50 !== undefined || point.p85 !== undefined);

  const executiveAgingDist: ExecutiveChartPoint[] = selectedTeamHealth.wipRiskHeatmap.rows.reduce<ExecutiveChartPoint[]>(
    (items, row) => {
      items[0].count = (items[0].count ?? 0) + row.age0To30;
      items[1].count = (items[1].count ?? 0) + row.age31To60;
      items[2].count = (items[2].count ?? 0) + row.age61To90;
      items[3].count = (items[3].count ?? 0) + row.age91Plus;
      return items;
    },
    [
      { label: "0-30d", count: 0 },
      { label: "31-60d", count: 0 },
      { label: "61-90d", count: 0 },
      { label: "91d+", count: 0 },
    ],
  );

  const executiveBottleneckMonthly: ExecutiveChartPoint[] = bottleneckMonthlyRows
    .slice()
    .reverse()
    .map((row) => {
      const match = row.bottleneckLabel.match(/\(([\d.]+) days\)/);
      return {
        label: row.monthLabel.split(" ")[0],
        value: match ? Number(match[1]) : 0,
        status: row.bottleneckLabel.split(" (")[0],
      };
    });

  const executiveStatusRows: ExecutiveStatusRow[] = selectedTeamHealth.wipRiskHeatmap.rows.map((row) => ({
    status: row.status,
    total: row.total,
    d30: row.age0To30,
    d60: row.age31To60,
    d90: row.age61To90,
    d90p: row.age91Plus,
  }));

  const executiveOldestTickets: ExecutiveTicketRow[] = selectedTeamHealth.agingWip.topOldest.slice(0, 8).map((item) => ({
    id: item.issueKey,
    status: item.status || "-",
    type: item.issueType || "-",
    age: item.agingDays,
  }));

  const executiveWorkflowMapping = adaptLegacyWorkflowConfig(selectedTeam?.config);
  const workflowDisplay = (values: string[] | null): string =>
    executiveWorkflowMapping.state === "complete"
      ? values?.join(" · ") || "-"
      : `Needs review${executiveWorkflowMapping.diagnostics[0] ? ` · ${executiveWorkflowMapping.diagnostics[0]}` : ""}`;
  const executiveWorkflowItems: ExecutiveWorkflowItem[] = [
    { label: "Done Statuses", value: workflowDisplay(executiveWorkflowMapping.doneStatuses) },
    { label: "Unmapped / excluded", value: selectedTeam?.config.workflowConfig?.backlogStatuses?.join(" · ") || detectedWorkflowStatuses.join(" · ") || "-" },
    { label: "Lead Time statuses", value: workflowDisplay(executiveWorkflowMapping.leadStatuses) },
    { label: "Cycle Time statuses", value: workflowDisplay(executiveWorkflowMapping.cycleStatuses) },
    { label: "Implementation Time statuses", value: workflowDisplay(executiveWorkflowMapping.implementationStatuses) },
    { label: "Flow Time Scope", value: "Created / project entered -> Done" },
  ];

    const historicalTrend: HistoricalTrendSnapshot[] = selectedTeam
      ? selectedTeam.progressHistory
          .map((snapshot) => ({
            period: snapshot.capturedAt.slice(0, 7),
            capturedAt: snapshot.capturedAt,
            cycleTime: snapshot.metrics.avgCycleTimeDays,
            sleP85: snapshot.metrics.sleP85Days,
            sample: snapshot.metrics.doneCount ?? null,
            usable: snapshot.metrics.doneCount ?? null,
            source: "Persisted progress snapshot",
          }))
          .sort((left, right) => left.period.localeCompare(right.period))
      : [];
    const executiveMetricTrust = selectedTeam && selectedTeamRow
      ? buildExecutiveMetricTrust(
          selectedTeam.metrics,
          periodMonth,
          periodSummary.currentLabel,
          selectedTeam.config,
          selectedTeam.parsedIssues,
          periodReferenceDate,
          selectedTeamRow.current.flowTiming,
          selectedTeamRow.current.sle.p85,
          selectedTeam.progressHistory,
        )
      : [];
    const waitingTimeTrust = executiveMetricTrust.find((metric) => metric.key === "waitingTimePct");
    const maintenanceTrust = executiveMetricTrust.find((metric) => metric.key === "maintenancePct");
    const waitingTimeValue = waitingTimeTrust?.value === null || waitingTimeTrust?.value === undefined ? "-" : waitingTimeTrust.value.toFixed(1);
    const waitingTimeTone: ExecSig = waitingTimeTrust?.state === "complete" ? "good" : waitingTimeTrust?.state === "partial" ? "warning" : "neutral";
    const waitingTimeCurrentValue = waitingTimeTrust?.value;
    const waitingTimePreviousValue = waitingTimeTrust?.previousValue;
    const waitingTimeHasComparablePrevious = Number.isFinite(waitingTimeCurrentValue) && Number.isFinite(waitingTimePreviousValue);
    const executiveTeamData: ExecutiveTeamDesignData | null = selectedTeam && selectedTeamRow
    ? {
        teamName: selectedTeam.config.teamName,
        description: selectedTeam.config.description || "No description",
        periodLabel: periodSummary.currentLabel,
        previousLabel: previousPeriodLabel,
        latestDataLabel: selectedTeamDataSummary.latestImportAt ? formatDateText(selectedTeamDataSummary.latestImportAt) : "-",
        kpis: [
          executiveMetric("Stories Done", String(selectedTeamRow.current.done), "good", {
            unit: "items",
            prev: getPreviousDoneValue(),
            trend: executiveSigFromTrend(selectedTeamRow.trends.done, "up"),
            trendGood: true,
            sub: periodSummary.currentLabel,
          }),
          executiveMetric("Throughput", String(selectedTeamHealth.throughput.last30Days), "good", {
            unit: "/30d",
            prev: `${selectedTeamHealth.throughput.lastMonth}/month`,
            trend: selectedTeamHealth.throughput.thisMonth >= selectedTeamHealth.throughput.lastMonth ? "up" : "down",
            trendGood: true,
            sub: formatThroughputStabilitySummary(),
          }),
          executiveMetric("Avg Implementation Time", formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.avgDays ?? null).replace(" working days", ""), executiveSigFromHealthTone(selectedTeamHealthSignals.sleRisk.tone), {
            unit: "days",
            prev: selectedTeamRow.previous ? formatWorkingDays(getFlowPresentationValue(selectedTeamRow.previous.flowTiming, "implementation")?.avgDays ?? null).replace(" working days", "") : "-",
            trend: executiveSigFromTrend(selectedTeamRow.trends.flowCycleTime, "down"),
            trendGood: false,
            sub: `cycle ${formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.avgDays ?? null)} · lead ${formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.avgDays ?? null)}`,
          }),
          executiveMetric("SLE P85", formatWorkingDays(selectedTeamRow.current.sle.p85).replace(" working days", ""), selectedTeamHealthSignals.sleRisk.tone === "bad" ? "critical" : selectedTeamHealthSignals.sleRisk.tone === "warn" ? "warning" : "good", {
            unit: "days",
            prev: getPreviousSleValue("p85").replace(" working days", ""),
            trend: executiveSigFromTrend(selectedTeamRow.trends.sleP85, "down"),
            trendGood: false,
            sub: formatSleRiskValue(selectedTeamHealth.sleRisk),
          }),
          executiveMetric("Aging WIP", formatDays(selectedTeamHealth.agingWip.avgDays).replace(" days", ""), selectedTeamHealthSignals.wipAgeRisk.tone === "bad" ? "critical" : selectedTeamHealthSignals.wipAgeRisk.tone === "warn" ? "warning" : "good", {
            unit: "days",
            sub: `oldest open ticket ${selectedTeamHealth.agingWip.topOldest[0]?.agingDays ?? 0}d`,
          }),
          executiveMetric("Done Bug Ratio", selectedTeamHealth.bugRatio.doneBugRatio === null ? "-" : `${formatPercentValue(selectedTeamHealth.bugRatio.doneBugRatio)}%`, selectedTeamHealthSignals.doneBugRatio.tone === "bad" ? "critical" : selectedTeamHealthSignals.doneBugRatio.tone === "warn" ? "warning" : "good", {
            sub: selectedTeamHealth.bugRatio.doneBugRatio === null
              ? "No delivered items in selected period"
              : `${selectedTeamHealth.bugRatio.doneBugCount}/${selectedTeamHealth.bugRatio.doneTotal} bugs in done`,
          }),
          executiveMetric("Velocity", formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig), "good", {
            prev: getPreviousVelocityValue(),
            trend: executiveSigFromTrend(selectedTeamRow.trends.velocity, "up"),
            trendGood: true,
            sub: selectedVelocityUnit,
          }),
          executiveMetric("Bottleneck", executiveFlowSummary.biggestQueueName ?? "-", executiveBottleneckTone, {
            trend: "flat",
            trendGood: false,
            sub: executiveBottleneckSummary,
          }),
          executiveMetric("Work Past Expectation", formatSleRiskValue(selectedTeamHealth.sleRisk), selectedTeamHealthSignals.sleRisk.tone === "bad" ? "critical" : "warning", {
            sub: `${selectedTeamHealth.sleRisk.atRiskCount} of ${selectedTeamHealth.sleRisk.totalWip} open tickets`,
            detail: `Open work past the team's 85% delivery expectation. Expectation: ${formatWorkingDays(selectedTeamHealth.sleRisk.thresholdDays)}`,
          }),
          executiveMetric("Completion Rate", String(selectedTeamHealth.throughput.last30Days), "good", {
            unit: "tickets / 30d",
            sub: "Throughput - how many items completed recently",
            detail: formatPreviousMetricLine(previousPeriodLabel, `${selectedTeamHealth.throughput.lastMonth}/month`),
          }),
          executiveMetric("Lead Time", formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.avgDays ?? null).replace(" working days", ""), "warning", {
            unit: "working days",
            sub: "Total Lead Time from intake to Done",
            detail: `P85: ${formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.p85 ?? null)} · Based on ${getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.count ?? 0} tickets`,
          }),
          executiveMetric(FLOW_LABELS.cycle, formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.avgDays ?? null).replace(" working days", ""), "good", {
            unit: "working days",
            sub: "Time after Funnel until Done in the active delivery flow",
            detail: `P85: ${formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.p85 ?? null)} · Based on ${getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.count ?? 0} tickets`,
          }),
          executiveMetric(FLOW_LABELS.implementation, formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.avgDays ?? null).replace(" working days", ""), "warning", {
            unit: "working days",
            sub: "Implementation time from first hands-on work until Done",
            detail: `P85: ${formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.p85 ?? null)} · Based on ${getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.count ?? 0} items`,
          }),
          executiveMetric("Waiting Time %", waitingTimeValue, waitingTimeTone, {
            unit: "%",
            prev: waitingTimeHasComparablePrevious ? `${waitingTimePreviousValue!.toFixed(1)}%` : undefined,
            trend: waitingTimeHasComparablePrevious ? waitingTimeCurrentValue! < waitingTimePreviousValue! ? "down" : waitingTimeCurrentValue! > waitingTimePreviousValue! ? "up" : "flat" : undefined,
            trendGood: false,
            sub: "Cycle-only waiting share · lower is better",
            detail: waitingTimeTrust?.reason ?? "Unavailable · valid Waiting Time % detail is not available for this period.",
            metricTrust: waitingTimeTrust,
          }),
          executiveMetric("Maintenance %", maintenanceTrust?.value == null ? "-" : maintenanceTrust.value.toFixed(1), maintenanceTrust?.state === "complete" ? "neutral" : maintenanceTrust?.state === "partial" ? "warning" : "neutral", {
            unit: "%",
            sub: "Recognized completed direct-child work classified as Maintenance",
            detail: maintenanceTrust?.reason ?? "Unavailable · configure a lifecycle key and provide usable direct-child data.",
            metricTrust: maintenanceTrust,
          }),
          executiveMetric("Delivery Expectation", `≤ ${formatWorkingDays(selectedTeamRow.current.sle.p85).replace(" working days", "")}`, "good", {
            unit: "working days",
            sub: "Team's current delivery promise (SLE P85)",
            detail: `${selectedTeamRow.current.sleCycleTimes.length} completed items in the SLE sample`,
          }),
        ],
        flowHealth: [
          executiveMetric("Throughput", String(selectedTeamHealth.throughput.last30Days), "good", { unit: "/30d", sub: formatThroughputStabilitySummary() }),
          executiveMetric(FLOW_LABELS.implementation, formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.avgDays ?? null).replace(" working days", ""), "warning", { unit: "days", sub: `p85: ${formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.p85 ?? null)}` }),
          executiveMetric("Velocity", formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig), "good", { sub: selectedVelocityUnit }),
          executiveMetric("SLE Compliance", selectedTeamHealth.sleRisk.atRiskPct === null ? "-" : `${formatPercentValue(100 - selectedTeamHealth.sleRisk.atRiskPct)}%`, selectedTeamHealthSignals.sleRisk.tone === "bad" ? "critical" : "warning", { sub: formatSleRiskValue(selectedTeamHealth.sleRisk) }),
        ],
        workHealth: [
          executiveMetric("Aging WIP", formatWorkingDays(selectedTeamHealth.agingWip.avgDays).replace(" working days", ""), selectedTeamHealthSignals.wipAgeRisk.tone === "bad" ? "critical" : "warning", { unit: "days", sub: `oldest ${selectedTeamHealth.agingWip.topOldest[0]?.agingDays ?? 0}d` }),
          executiveMetric("Open Tickets", String(selectedTeamHealth.agingWip.total), selectedTeamHealth.agingWip.total > 0 ? "warning" : "good", { sub: `${selectedTeamHealth.staleWip.stalePct === null ? "-" : `${formatPercentValue(selectedTeamHealth.staleWip.stalePct)}%`} not updated` }),
          executiveMetric("Oldest Ticket", selectedTeamHealth.agingWip.topOldest[0]?.issueKey ?? "-", selectedTeamHealth.agingWip.topOldest[0]?.agingDays ? "critical" : "neutral", { sub: `${selectedTeamHealth.agingWip.topOldest[0]?.agingDays ?? 0} days in backlog` }),
          executiveMetric("WIP Bug Ratio", selectedTeamHealth.bugRatio.wipBugRatio === null ? "-" : `${formatPercentValue(selectedTeamHealth.bugRatio.wipBugRatio)}%`, selectedTeamHealth.bugRatio.wipBugRatio !== null && selectedTeamHealth.bugRatio.wipBugRatio > 15 ? "critical" : selectedTeamHealth.bugRatio.wipBugRatio !== null && selectedTeamHealth.bugRatio.wipBugRatio > 10 ? "warning" : "good", { sub: `${selectedTeamHealth.bugRatio.wipBugCount} / ${selectedTeamHealth.bugRatio.wipTotal} open items` }),
        ],
        processHealth: [
          executiveMetric("Bottleneck", executiveFlowSummary.biggestQueueName ?? "-", executiveBottleneckTone, { sub: executiveBottleneckSummary }),
          executiveMetric("Flow Efficiency", executiveFlowSummary.flowEfficiencyPct === null ? "-" : `${formatPercentValue(executiveFlowSummary.flowEfficiencyPct)}%`, executiveFlowEfficiencyTone, { sub: "active / (active + queue)" }),
          executiveMetric("Work Distribution", formatWorkMixSummary(selectedTeamHealth.workMix), "neutral", { sub: "Story · Bug · Sub-task" }),
          executiveMetric("Forecast P85", selectedTeamHealth.forecast.p85Days === null ? "-" : `${selectedTeamHealth.forecast.p85Days} days`, selectedTeamHealthSignals.forecast.tone === "bad" ? "critical" : selectedTeamHealthSignals.forecast.tone === "warn" ? "warning" : "good", { sub: "Monte Carlo · 85% confidence" }),
        ],
        flowStages: executiveFlowStages,
        flowSummary: executiveFlowSummary,
        flowTiming: selectedTeamRow.current.flowTiming,
        previousFlowTiming: selectedTeamRow.previous?.flowTiming ?? null,
        historicalTrend,
        selectedHistoricalPeriod: periodMonth,
        metricTrust: executiveMetricTrust,
        cycleTimePanel: {
          team: selectedTeam,
          periodFilter: periodMonth,
          sleValues: selectedTeamRow.current.sle,
          lineVisibility: sleLineVisibility,
          sleIssueTypeOptions,
          sleIncludedIssueTypes: sleIssueTypesDraft,
          sleTypeDirty: sleIssueTypesDirty,
          excludedIssueKeys: Array.from(
            new Set([
              ...(selectedTeam.config.excludedIssueKeys ?? []),
              ...(selectedTeam.config.issueExclusions ?? []).map((exclusion) => exclusion.issueKey),
            ]),
          ),
          issueExclusions: selectedTeam.config.issueExclusions ?? [],
          busy,
          onToggleSleIssueType: handleToggleSleIssueTypeDraft,
          onResetSleIssueTypes: handleResetSleIssueTypesDraft,
          onApplySleIssueTypes: () => void handleApplySleIssueTypes(),
          onExcludeIssue: (issueKey, reason) => void handleExcludeIssueFromMetrics(issueKey, reason),
          onExcludeIssues: (issueKeys, reason) => void handleExcludeIssuesFromMetrics(issueKeys, reason),
          onRestoreIssue: (issueKey) => void handleRestoreExcludedIssue(issueKey),
          onRestoreAllIssues: () => void handleRestoreAllExcludedIssues(),
        },
        throughputWeekly: executiveThroughputWeekly,
        cycleTimeWeekly: executiveCycleTimeWeekly.length > 0 ? executiveCycleTimeWeekly : [{ label: "Current", p50: getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.p50 ?? 0, p85: getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.p85 ?? 0 }],
        timeInStatus: executiveTimeInStatus,
        agingDist: executiveAgingDist,
        bottleneckMonthly: executiveBottleneckMonthly,
        statusRows: executiveStatusRows,
        oldestTickets: executiveOldestTickets,
        workflowItems: executiveWorkflowItems,
        qualityCards: [
          { label: "Functional Test Coverage", value: formatEngineeringPercent(selectedTeam.config.engineeringMetrics?.functionalTestCoveragePct) },
          { label: "Unit Test Coverage", value: formatEngineeringPercent(selectedTeam.config.engineeringMetrics?.unitTestCoveragePct) },
          { label: "Technical Debt", value: selectedTeam.config.engineeringMetrics?.technicalDebtAvgDays == null ? "-" : `${selectedTeam.config.engineeringMetrics.technicalDebtAvgDays}d` },
        ],
        dataStatus: selectedTeamDataStatus,
      }
    : null;

  function renderExecutiveChipEditor({
    label,
    help,
    values,
    draft,
    setDraft,
    onAdd,
    onRemove,
    placeholder,
    emptyText,
  }: {
    label: string;
    help: string;
    values: string[];
    draft: string;
    setDraft: (value: string) => void;
    onAdd: () => void;
    onRemove: (value: string) => void;
    placeholder: string;
    emptyText: string;
  }): JSX.Element {
    return (
      <section className="exec-config-panel">
        <div className="exec-config-panel-title">{label}</div>
        <div className="exec-config-help">{help}</div>
        <div className="exec-chip-list">
          {values.length === 0 ? (
            <span className="exec-chip-empty">{emptyText}</span>
          ) : (
            values.map((value) => (
              <button key={`${label}-${value}`} type="button" className="exec-chip" onClick={() => onRemove(value)} title="Remove status">
                {value} <span aria-hidden="true">x</span>
              </button>
            ))
          )}
        </div>
        <div className="exec-config-input-row">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAdd();
              }
            }}
            placeholder={placeholder}
          />
          <button type="button" onClick={onAdd}>Add</button>
        </div>
      </section>
    );
  }

  function renderExecutiveTeamConfigurationPanel(): JSX.Element | null {
    if (!selectedTeam || !draftConfig) {
      return null;
    }

    const flowScope = normalizeFlowTimingConfig(draftConfig.flowTimingConfig);
    const statusMapping = adaptLegacyWorkflowConfig(draftConfig);
    const rawUnifiedStatusConfig = draftConfig.workflowConfig?.statusSets;
    const displayUnifiedStatusConfig = draftUnifiedStatusConfig ?? (rawUnifiedStatusConfig
      ? normalizeUnifiedFlowStatusConfig(rawUnifiedStatusConfig) ?? {
          leadStatuses: rawUnifiedStatusConfig.leadStatuses ?? [],
          cycleStatuses: rawUnifiedStatusConfig.cycleStatuses ?? [],
          implementationStatuses: rawUnifiedStatusConfig.implementationStatuses ?? [],
          doneStatuses: rawUnifiedStatusConfig.doneStatuses ?? [],
        }
      : null);

    return (
      <section className={`exec-config-card exec-config-collapsible${configurationPanelOpen ? " open" : ""}`} aria-label="Team configuration">
        <button
          type="button"
          className="exec-config-toggle"
          aria-expanded={configurationPanelOpen}
          aria-controls="exec-team-configuration-content"
          onClick={() => setConfigurationPanelOpen((current) => !current)}
        >
          <span>{configurationPanelOpen ? "▾" : "›"}</span>
          <strong>Configuration</strong>
          <small>Flow Configure · DoD · Bug Type · Engineering</small>
        </button>

        {configurationPanelOpen ? (
          <div id="exec-team-configuration-content" className="exec-config-content">
        <div className="exec-config-head">
          <div>
            <div className="exec-figma-section-head"><span>Configuration</span><small>Flow Configure · DoD · Bug Type · Engineering</small></div>
            <h2>Team workflow setup</h2>
            <p>Configure how statuses map into Lead Time, Cycle Time, Implementation Time and Done. These controls update the same team config used by metrics.</p>
            <p className="exec-config-help" role="status">
              {statusMapping.state === "complete"
                ? "Status roles are ready to save. Lead Time contains Cycle Time and upstream intake; Cycle Time contains Implementation Time."
                : `Review required · existing metric labels may not be comparable until this mapping is confirmed. ${statusMapping.diagnostics[0] ?? "Affected roles need review."}`}
            </p>
            <p className="exec-config-help">Implementation Time is contained by Cycle Time, which is contained by Lead Time. Done is terminal and excluded from duration metrics.</p>
          </div>
          <div className="exec-config-head-actions">
            <button type="button" onClick={handleResetWorkflowStatuses}>Use auto-detect</button>
            <span>{detectedWorkflowStatuses.length} detected statuses</span>
          </div>
        </div>

        <form className="exec-config-form" onSubmit={handleSaveAdvancedConfig}>
          <section className="exec-config-status-map">
            <header>
              <strong>Classify team statuses</strong>
              <span>Implementation Time is contained by Cycle Time, which is contained by Lead Time. Done is terminal and excluded.</span>
            </header>
            <div className="exec-status-grid">
              {detectedWorkflowStatuses.map((statusName) => {
                const normalized = normalizeTextValue(statusName);
                const category = backlogStatusList.some((item) => normalizeTextValue(item) === normalized)
                  ? "backlog"
                  : displayUnifiedStatusConfig && classifyUnifiedFlowStatus(statusName, displayUnifiedStatusConfig) === "done"
                    ? "done"
                    : displayUnifiedStatusConfig && classifyUnifiedFlowStatus(statusName, displayUnifiedStatusConfig) === "implementation"
                      ? "implementing"
                      : displayUnifiedStatusConfig && classifyUnifiedFlowStatus(statusName, displayUnifiedStatusConfig) === "cycle"
                        ? "active"
                        : displayUnifiedStatusConfig && classifyUnifiedFlowStatus(statusName, displayUnifiedStatusConfig) === "lead"
                          ? "funnel"
                          : "unmapped";
                return (
                  <article key={`exec-status-${statusName}`} className={`exec-status-row ${category}`}>
                    <strong>{statusName}</strong>
                    <div>
                      {(["backlog", "funnel", "active", "implementing", "done"] as const).map((target) => (
                        <button
                          key={`${statusName}-${target}`}
                          type="button"
                          className={category === target ? "active" : ""}
                          onClick={() => handleClassifyWorkflowStatus(statusName, target)}
                        >
                          {target === "done" ? "Done" : target === "active" ? "Cycle Time" : target === "implementing" ? "Implementation Time" : target === "funnel" ? "Lead Time" : "Unmapped"}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="exec-config-panel exec-flow-scope-panel">
            <div>
              <div className="exec-config-panel-title">Flow timing scope</div>
              <div className="exec-config-help">Choose which tickets are included when Lead Time, Cycle Time and Implementation Time are recalculated.</div>
            </div>
            <label>
              <input type="checkbox" checked={flowScope.includeClosedTickets} onChange={(event) => handleToggleFlowTimingScope("closed", event.target.checked)} />
              <span>Closed tickets</span>
            </label>
            <label>
              <input type="checkbox" checked={flowScope.includeOpenTickets} onChange={(event) => handleToggleFlowTimingScope("open", event.target.checked)} />
              <span>Open tickets</span>
            </label>
          </section>

          <section className="exec-config-panel" aria-labelledby="maintenance-lifecycle-key-label">
            <label id="maintenance-lifecycle-key-label" htmlFor="maintenance-lifecycle-key"><strong>Maintenance lifecycle Jira key (optional)</strong></label>
            <div className="exec-config-help">Use the parent/EPIC key already present in imported CSV data. Validated locally only; the app does not look up Jira or verify that this key exists or has children.</div>
            <input id="maintenance-lifecycle-key" value={maintenanceLifecycleKeyInput} onChange={(event) => setMaintenanceLifecycleKeyInput(event.target.value)} placeholder="ABC-123" aria-describedby="maintenance-lifecycle-key-help maintenance-lifecycle-key-state" />
            <div id="maintenance-lifecycle-key-help" className="exec-config-help">Maintenance % uses only direct-child completed work. Missing parent data is excluded and reduces coverage.</div>
            <div id="maintenance-lifecycle-key-state" className="exec-config-help" role="status">
              {!maintenanceLifecycleKeyInput.trim() ? "No maintenance lifecycle key configured." : isValidMaintenanceLifecycleJiraKey(maintenanceLifecycleKeyInput) ? "Key format looks valid. Jira existence is not verified." : "Enter a valid Jira key, such as ABC-123."}
            </div>
          </section>

          <div className="exec-config-grid">
            <section className="exec-config-panel">
              <div className="exec-config-panel-title">Done statuses (DoD)</div>
              <label className="exec-checkbox-row">
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
              <div className="exec-chip-list">
                {doneStatusList.length === 0 ? (
                  <span className="exec-chip-empty">No Done statuses configured.</span>
                ) : (
                  doneStatusList.map((value) => (
                    <button key={`exec-done-${value}`} type="button" className="exec-chip" onClick={() => handleRemoveDoneStatus(value)}>
                      {value} <span aria-hidden="true">x</span>
                    </button>
                  ))
                )}
              </div>
              <div className="exec-config-input-row">
                <input
                  value={doneStatusDraft}
                  onChange={(event) => setDoneStatusDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddDoneStatus();
                    }
                  }}
                  placeholder="Add Done status"
                />
                <button type="button" onClick={handleAddDoneStatus}>Add</button>
              </div>
              <div className="exec-mini-actions">
                <button type="button" onClick={handleApplyClassicJiraPreset}>Classic Jira</button>
                <button type="button" onClick={handleApplyAcTestPreset}>AC Test only</button>
                <button type="button" onClick={() => mutateUnifiedStatusDraft((current) => ({ ...current, doneStatuses: [] }))}>Clear</button>
              </div>
            </section>

            {renderExecutiveChipEditor({
              label: "Unmapped / excluded statuses",
              help: "Outside the configured duration roles; excluded from Lead Time, Cycle Time and Implementation Time.",
              values: backlogStatusList,
              draft: backlogStatusDraft,
              setDraft: setBacklogStatusDraft,
              onAdd: handleAddBacklogStatus,
              onRemove: handleRemoveBacklogStatus,
              placeholder: "Add backlog status",
              emptyText: "No backlog statuses configured.",
            })}
            {renderExecutiveChipEditor({
              label: "Lead Time statuses",
              help: "Statuses included in the end-to-end Lead Time set.",
              values: displayUnifiedStatusConfig?.leadStatuses ?? [],
              draft: funnelStatusDraft,
              setDraft: setFunnelStatusDraft,
              onAdd: handleAddFunnelStatus,
              onRemove: handleRemoveFunnelStatus,
              placeholder: "Add Lead Time status",
              emptyText: "No Lead Time statuses configured.",
            })}
            {renderExecutiveChipEditor({
              label: "Cycle Time statuses",
              help: "Statuses included in Cycle Time and nested inside Lead Time.",
              values: displayUnifiedStatusConfig?.cycleStatuses ?? [],
              draft: sprintScopeStatusDraft,
              setDraft: setSprintScopeStatusDraft,
              onAdd: handleAddSprintScopeStatus,
              onRemove: handleRemoveSprintScopeStatus,
              placeholder: "Add Cycle Time status",
              emptyText: "Auto-detect from active team flow.",
            })}
            {renderExecutiveChipEditor({
              label: "Implementation Time statuses",
              help: "Execution statuses nested inside Cycle Time and Lead Time.",
              values: displayUnifiedStatusConfig?.implementationStatuses ?? [],
              draft: implementingStatusDraft,
              setDraft: setImplementingStatusDraft,
              onAdd: handleAddImplementingStatus,
              onRemove: handleRemoveImplementingStatus,
              placeholder: "Add Implementation Time status",
              emptyText: "No Implementation Time statuses configured.",
            })}

            <section className="exec-config-panel">
              <div className="exec-config-panel-title">Manual engineering metrics</div>
              <div className="exec-config-help">Team-facing values from external sources. Percentages accept 0-100.</div>
              <div className="exec-config-field-grid">
                <label>
                  <span>Functional coverage (%)</span>
                  <input type="number" min="0" max="100" step="0.1" value={functionalCoverageInput} onChange={(event) => setFunctionalCoverageInput(event.target.value)} placeholder="e.g. 82" />
                </label>
                <label>
                  <span>Unit coverage (%)</span>
                  <input type="number" min="0" max="100" step="0.1" value={unitTestCoverageInput} onChange={(event) => setUnitTestCoverageInput(event.target.value)} placeholder="e.g. 74" />
                </label>
                <label>
                  <span>Technical debt avg (days)</span>
                  <input type="number" min="0" step="0.5" value={technicalDebtInput} onChange={(event) => setTechnicalDebtInput(event.target.value)} placeholder="e.g. 12" />
                </label>
              </div>
            </section>
          </div>

          <details className="exec-config-details">
            <summary>Work model</summary>
            <div className="exec-work-model-toggle">
              <button
                type="button"
                className={draftVelocityConfig.mode === "sprint-story-points" ? "" : "active"}
                onClick={() => setDraftConfig((curr) => curr ? { ...curr, velocityConfig: { mode: "weekly-ticket-count" } } : curr)}
              >
                <strong>Kanban</strong>
                <span>Weekly ticket count, no estimates needed.</span>
              </button>
              <button
                type="button"
                className={draftVelocityConfig.mode === "sprint-story-points" ? "active" : ""}
                onClick={() => setDraftConfig((curr) => curr ? { ...curr, velocityConfig: { mode: "sprint-story-points" } } : curr)}
              >
                <strong>Scrum</strong>
                <span>Sprint-based story points from Jira Sprint data.</span>
              </button>
            </div>
          </details>

          <div className="exec-config-save-row">
            <button type="submit" disabled={busy}>Save role mapping</button>
            <span>SLE is the existing P85 of eligible completed Cycle Time observations and uses Monday-Friday working days.</span>
            {workflowSaveConfirmationOpen ? (
              <div className="exec-config-confirm" role="alertdialog" aria-label="Confirm status-role mapping">
                <strong>Confirm status-role mapping?</strong>
                <span>This changes future metric interpretation. Existing source files are unchanged.</span>
                <button type="submit" disabled={busy}>Confirm and save</button>
                <button type="button" onClick={() => setWorkflowSaveConfirmationOpen(false)}>Keep editing</button>
              </div>
            ) : null}
          </div>
        </form>

        <section className="exec-config-panel exec-bug-config-panel">
          <div className="exec-config-panel-title">Bug type settings</div>
          <div className="exec-config-help">Choose which Jira issue types count as bugs for Bug Ratio and quality metrics.</div>
          <div className="exec-chip-list">
            {bugIssueTypeOptions.length === 0 ? (
              <span className="exec-chip-empty">Import a CSV first to detect issue types.</span>
            ) : (
              bugIssueTypeOptions.map((issueType) => {
                const selected = bugIssueTypeList.some((value) => normalizeTextValue(value) === normalizeTextValue(issueType));
                return (
                  <button key={`exec-bug-${issueType}`} type="button" className={`exec-chip${selected ? " active" : ""}`} onClick={() => handleToggleBugIssueType(issueType)}>
                    {issueType}
                  </button>
                );
              })
            )}
          </div>
          <div className="exec-config-input-row">
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
            <button type="button" onClick={handleAddBugIssueType}>Add</button>
          </div>
          <label className="exec-config-inline-field">
            <span>Optional story point fallback for bug items</span>
            <input type="number" min="0" step="0.5" value={bugDefaultStoryPointsInput} onChange={(event) => setBugDefaultStoryPointsInput(event.target.value)} placeholder="Leave empty unless Scrum needs fallback" />
          </label>
          <div className="exec-config-save-row">
            <button type="button" disabled={busy || !selectedTeam} onClick={() => void handleSaveBugMetricConfig()}>Save Bug Type</button>
            <button type="button" onClick={() => setBugIssueTypesInput("Bug")}>Bug only</button>
          </div>
        </section>
          </div>
        ) : null}
      </section>
    );
  }

  if (!pilotSession) {
    return renderPilotLoginScreen();
  }

  return (
    <div className="figma-shell">
      <header className="mobile-app-bar">
        <button
          type="button"
          className="icon-btn"
          aria-label="Open navigation"
          aria-controls="primary-navigation"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu size={20} />
        </button>
        <Gauge size={20} aria-hidden="true" />
        <strong>Scrum Master Tool</strong>
      </header>
      {mobileNavOpen ? (
        <button
          type="button"
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <aside id="primary-navigation" className={`left-nav${mobileNavOpen ? " open" : ""}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Gauge size={22} />
          </div>
          <div>
            <div className="brand-title">Scrum Master Tool</div>
            <div className="brand-subtitle">Local flow analytics</div>
          </div>
          <button type="button" className="nav-close icon-btn" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="nav-links" aria-label="Primary navigation">
          <button
            className={page === "workspace" ? "nav-link active" : "nav-link"}
            onClick={() => {
              setPage("workspace");
              setMobileNavOpen(false);
            }}
          >
            <FolderCog className="nav-icon" size={17} />
            Workspace
          </button>
          <div className="nav-section-label">Dashboards</div>
          {availableMetricScopes.has("team") ? (
            <button
              className={(page === "dashboard" || page === "team") && activeMetricScope === "team" ? "nav-link active" : "nav-link"}
              onClick={() => openDashboardScope("team")}
            >
              <BarChart3 className="nav-icon" size={17} />
              Teams
            </button>
          ) : null}
          {availableMetricScopes.has("value-stream") ? (
            <button
              className={(page === "dashboard" || page === "team") && activeMetricScope === "value-stream" ? "nav-link active" : "nav-link"}
              onClick={() => openDashboardScope("value-stream")}
            >
              <Layers3 className="nav-icon" size={17} />
              Value Stream
            </button>
          ) : null}
          {availableMetricScopes.has("art") ? (
            <button
              className={(page === "dashboard" || page === "team") && activeMetricScope === "art" ? "nav-link active" : "nav-link"}
              onClick={() => openDashboardScope("art")}
            >
              <Building2 className="nav-icon" size={17} />
              ART
            </button>
          ) : null}
          {availableMetricScopes.has("portfolio") ? (
            <button
              className={(page === "dashboard" || page === "team") && activeMetricScope === "portfolio" ? "nav-link active" : "nav-link"}
              onClick={() => openDashboardScope("portfolio")}
            >
              <BriefcaseBusiness className="nav-icon" size={17} />
              Portfolio
            </button>
          ) : null}
          <button
            className={page === "metrics" ? "nav-link active" : "nav-link"}
            onClick={() => {
              setPage("metrics");
              setMobileNavOpen(false);
            }}
          >
            <Settings2 className="nav-icon" size={17} />
            Metrics
          </button>
          <button
            className={page === "import" ? "nav-link active" : "nav-link"}
            onClick={() => {
              setPage("import");
              setMobileNavOpen(false);
            }}
          >
            <Upload className="nav-icon" size={17} />
            Import
          </button>
        </nav>

        <div className="nav-footer">
          <div className="pilot-session-card">
            <span>Pilot user</span>
            <strong>{pilotSession.label}</strong>
            <button type="button" className="pilot-logout-button" onClick={handlePilotLogout}>
              <LogOut size={13} />
              Logout
            </button>
          </div>
          <button className="link-btn" disabled={busy} onClick={handlePickWorkspace} aria-describedby={busy ? "workspace-operation-lock" : undefined}>
            {workspaceHandle ? "Switch Workspace" : "Choose Workspace"}
          </button>
          {busy ? <small id="workspace-operation-lock" className="operation-lock-hint">Unavailable while {operation?.phase ?? "an operation"} is in progress.</small> : null}
          <div className="nav-version"><Database size={14} aria-hidden="true" /> Local workspace data</div>
          <small className="build-marker">{BUILD_MARKER_LABEL}</small>
        </div>
      </aside>

      <main className="main-area">
        {(status || (operation && operation.state !== "complete")) ? (
          <div
            className={`status-toast operation-status operation-status-${operation?.state ?? "complete"}`}
            role="status"
            aria-live="polite"
            aria-busy={operation?.state === "active"}
            onMouseEnter={() => setToastPaused(true)}
            onMouseLeave={() => setToastPaused(false)}
            onFocus={() => setToastPaused(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setToastPaused(false);
            }}
          >
            {operation && operation.state !== "complete" ? <strong className="operation-phase">{operation.phase}</strong> : null}
            <span>{operation && operation.state !== "complete" ? operation.message : status}</span>
            {operation && operation.state !== "complete" && operation.recovery ? (
              operation.recoveryAction ? (
                <button type="button" className="soft-btn operation-recovery-button" onClick={handleOperationRecovery}>
                  {operation.recovery}
                </button>
              ) : <span className="operation-recovery">{operation.recovery}</span>
            ) : null}
            {operation && operation.state === "error" && operation.errorKind ? <small className="operation-error-detail">Recovery category: {operation.errorKind}. Reference: {operation.diagnosticRef ?? "unavailable"}</small> : null}
          </div>
        ) : null}

        {!workspaceHandle && page !== "metrics" ? (
          <section className="page-section empty-state">
            <h2>Workspace required</h2>
            <p>Select your root folder to load teams and imports.</p>
            <button disabled={busy} onClick={handlePickWorkspace} aria-describedby={busy ? "empty-workspace-lock" : undefined}>
              Choose Workspace
            </button>
            {workspaceOperationHint() ? <small id="empty-workspace-lock" className="operation-lock-hint">{workspaceOperationHint()}</small> : null}
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
                        aria-label={`Open ${workspace.name}${busy ? ` — unavailable while ${operation?.phase ?? "an operation"} is in progress` : ""}`}
                        onClick={() => void handleOpenRememberedWorkspace(workspace.id)}
                      >
                        Open
                      </button>
                      {workspaceOperationHint() ? <small className="operation-lock-hint">{workspaceOperationHint()}</small> : null}
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
                    <button className="soft-btn" onClick={handlePickWorkspace} disabled={busy} aria-describedby={busy ? "workspace-page-lock" : undefined}>
                      Choose Workspace
                    </button>
                    {workspaceOperationHint() ? <small id="workspace-page-lock" className="operation-lock-hint">{workspaceOperationHint()}</small> : null}
                    <button onClick={() => setShowAddTeamModal(true)}>+ Add Entity</button>
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
                            aria-label={`Open ${workspace.name}${busy ? ` — unavailable while ${operation?.phase ?? "an operation"} is in progress` : ""}`}
                            onClick={() => void handleOpenRememberedWorkspace(workspace.id)}
                          >
                            Open
                          </button>
                          {workspaceOperationHint() ? <small className="operation-lock-hint">{workspaceOperationHint()}</small> : null}
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
                    const entityType = getTeamEntityType(team.config);
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
                        <label className="entity-type-control" onClick={(event) => event.stopPropagation()}>
                          <span>Layer</span>
                          <select
                            value={entityType}
                            disabled={busy}
                            onChange={(event) => void handleUpdateTeamEntityType(team.teamId, event.target.value as TeamEntityType)}
                          >
                            {TEAM_ENTITY_TYPES.map((type) => (
                              <option key={`${team.teamId}-${type}`} value={type}>
                                {TEAM_ENTITY_LABELS[type]}
                              </option>
                            ))}
                          </select>
                        </label>
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
                <ExecutiveDashboard
                  teams={executiveDashboardTeams}
                  summary={executiveDashboardSummary}
                  selectedTeamId={selectedTeamId}
                  periodLabel={periodSummary.currentLabel}
                  title={dashboardScopeCopy.title}
                  scopeLabel={dashboardScopeCopy.subtitle}
                  onSelectTeam={setSelectedTeamId}
                  onOpenTeam={openTeamView}
                  onRecalculate={() => void handleRecalculateAll()}
                  onConfigureMetrics={() => setPage("metrics")}
                  onWorkspaceSetup={() => setPage("workspace")}
                />
                <div className="legacy-dashboard-ui">
                <div className="section-head">
                  <div>
                    <h1>{dashboardScopeCopy.title}</h1>
                    <p>{dashboardScopeCopy.subtitle}</p>
                  </div>
                  <div className="section-tools">
                    {renderPeriodPicker()}
                    <button className="soft-btn" disabled={busy || teams.length === 0} onClick={handleRecalculateAll}>
                      Recalculate
                    </button>
                  </div>
                </div>

                {renderDashboardScopeTabs()}
                {renderDashboardContextPanel()}

                <section className="table-panel dashboard-team-picker">
                  <div className="dashboard-team-picker-head">
                    <div>
                      <div className="table-title small-title">{dashboardScopeCopy.focusTitle}</div>
                      <div className="table-subtitle">
                        {dashboardScopeCopy.focusSubtitle} Current focus: {selectedTeam?.config.teamName ?? "-"}
                      </div>
                    </div>
                    <div className="dashboard-team-picker-actions">
                      {selectedTeam && selectedTeamRow && (
                        <>
                          <button className="soft-btn" onClick={() => openTeamView(selectedTeam.teamId)}>
                            Open Full View
                          </button>
                          <button className="soft-btn" onClick={handleExportTeamReport}>
                            Export Report
                          </button>
                        </>
                      )}
                      <button className="soft-btn" onClick={() => setPage("workspace")}>
                        Workspace Setup
                      </button>
                      <button onClick={() => setShowAddTeamModal(true)}>
                        + Add Entity
                      </button>
                    </div>
                  </div>

                  <div className="team-cards-grid dashboard-team-cards">
                    {dashboardTeams.map((team) => {
                      const latestImport = team.importFiles[0];
                      const entityType = getTeamEntityType(team.config);
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
                          <div className="card-meta">{TEAM_ENTITY_LABELS[entityType]} • Imports: {team.importFiles.length} files</div>
                          <label className="entity-type-control card-layer-control" onClick={(event) => event.stopPropagation()}>
                            <span>Layer</span>
                            <select
                              value={entityType}
                              disabled={busy}
                              onChange={(event) => void handleUpdateTeamEntityType(team.teamId, event.target.value as TeamEntityType)}
                            >
                              {TEAM_ENTITY_TYPES.map((type) => (
                                <option key={`dashboard-picker-${team.teamId}-${type}`} value={type}>
                                  {TEAM_ENTITY_LABELS[type]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="card-meta">
                            Last import: {latestImport ? formatDateText(latestImport.updatedAt) : "-"}
                          </div>
                        </article>
                      );
                    })}
                    {dashboardTeams.length === 0 && <div className="muted">No entities in this dashboard scope yet.</div>}
                  </div>
                </section>

                <section className="table-panel dashboard-team-metrics">
                  <div className="table-title-row">
                    <div className="table-title">{dashboardScopeCopy.tableTitle}</div>
                    {renderMetricInfoButton("understandingTrends")}
                  </div>
                  <div className="table-subtitle">
                    Current period: {periodSummary.currentLabel} • {periodSummary.comparisonLabel} • Bottleneck month: {formatPeriodLabel(dashboardBottleneckPeriod)} • Metrics configured for {METRIC_SCOPE_LABELS[activeMetricScope]}
                  </div>

                  <div className="table-wrap">
                    <table className="metrics-table">
                      <thead>
                        <tr>
                          <th>{dashboardScopeCopy.navLabel}</th>
                          {isMetricVisible("stories-done") && <th>Done</th>}
                          {isMetricVisible("lead-time") && <th>Lead Time</th>}
                          {isMetricVisible("active-time") && <th>{FLOW_LABELS.cycle}</th>}
                          {isMetricVisible("cycle-time") && <th>{FLOW_LABELS.implementation}</th>}
                          {isMetricVisible("sle-p85") && <th>SLE P85</th>}
                          {isMetricVisible("bug-ratio") && <th>Bug Ratio</th>}
                          {isMetricVisible("work-mix") && <th>Work Mix</th>}
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
                            {isMetricVisible("lead-time") && <td>{renderMetricWithTrend(formatWorkingDays(getFlowPresentationValue(row.current.flowTiming, "lead")?.avgDays ?? null), row.trends.leadTime)}</td>}
                            {isMetricVisible("active-time") && <td>{renderMetricWithTrend(formatWorkingDays(getFlowPresentationValue(row.current.flowTiming, "cycle")?.avgDays ?? null), row.trends.activeTime)}</td>}
                            {isMetricVisible("cycle-time") && <td>{renderMetricWithTrend(formatWorkingDays(getFlowPresentationValue(row.current.flowTiming, "implementation")?.avgDays ?? null), row.trends.flowCycleTime)}</td>}
                            {isMetricVisible("sle-p85") && <td>{renderMetricWithTrend(formatWorkingDays(row.current.sle.p85), row.trends.sleP85)}</td>}
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
                            {isMetricVisible("work-mix") && (
                              <td>{formatWorkMixSummary(row.healthCurrent.workMix)}</td>
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
                    <div className="dashboard-detail-summary">
                      <div>
                        <div className="table-title">{dashboardScopeCopy.detailTitle}: {selectedTeam.config.teamName}</div>
                        <div className="table-subtitle">
                          Current period: {periodSummary.currentLabel} • {periodSummary.comparisonLabel}
                        </div>
                      </div>
                      <div className="dashboard-detail-actions">
                        <button className="soft-btn" onClick={() => openTeamView(selectedTeam.teamId)}>
                          Open Full View
                        </button>
                        <button
                          type="button"
                          className="soft-btn"
                          aria-expanded={dashboardDetailOpen}
                          onClick={() => setDashboardDetailOpen((current) => !current)}
                        >
                          {dashboardDetailOpen ? "Hide Details" : "Show Details"}
                        </button>
                      </div>
                    </div>

                    {dashboardDetailOpen && (
                      <>
                        <p className="period-hint dashboard-merged-period">
                          Current period: {periodSummary.currentLabel} • {periodSummary.comparisonLabel}
                        </p>

                    <section className="overview-top dashboard-merged-overview">
                      <h2 className="team-section-title">{dashboardScopeCopy.detailTitle}</h2>
                      <div className="team-kpi-grid">
                        <article className={`team-kpi-card flow-signal-card${isMetricVisible("wip-age-risk") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel("Old open tickets", "wipAgeRisk", selectedTeamHealthSignals.wipAgeRisk)}
                          <strong>
                            {formatPercentValue(selectedTeamHealth.wipRisk.over30Pct)}% of open tickets are older than 30 days
                          </strong>
                          <small>
                            &gt;60 days {formatPercentValue(selectedTeamHealth.wipRisk.over60Pct)}% • &gt;90 days{" "}
                            {formatPercentValue(selectedTeamHealth.wipRisk.over90Pct)}% • 31-60 days{" "}
                            {formatPercentValue(Math.max(0, selectedTeamHealth.wipRisk.over30DeltaPpVs30dBaseline))}%
                          </small>
                        </article>
                        <article className={`team-kpi-card flow-signal-card${isMetricVisible("sle-risk") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel("Open tickets older than SLE P85", "sleRisk", selectedTeamHealthSignals.sleRisk)}
                          <strong>{formatSleRiskValue(selectedTeamHealth.sleRisk)}</strong>
                          <small>
                            SLE P85 {formatWorkingDays(selectedTeamHealth.sleRisk.thresholdDays)} • open tickets {selectedTeamHealth.sleRisk.totalWip}
                          </small>
                        </article>
                        <article className={`team-kpi-card flow-signal-card${isMetricVisible("stale-wip") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel("Open tickets not updated", "staleWip", selectedTeamHealthSignals.staleWip)}
                          <strong>{formatStaleWipValue(selectedTeamHealth.staleWip)}</strong>
                          <small>
                            No update for &gt;{selectedTeamHealth.staleWip.thresholdDays} days • open tickets {selectedTeamHealth.staleWip.totalWip}
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
                          {renderMetricLabel(`Avg Velocity (${selectedVelocityUnit})`, "velocity")}
                          <strong>{formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig)}</strong>
                          <small>{formatPreviousMetricLine(previousMetricLabel, getPreviousVelocityValue())}</small>
                        </article>
                        <article className={`team-kpi-card${isMetricVisible("lead-time") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel("Lead Time", "leadTime")}
                          <strong>{formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.avgDays ?? null)}</strong>
                          <small>Lead Time flow • {formatFlowTimingScopeLabel(selectedTeam.config.flowTimingConfig)} • {formatBasedOnTickets(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.count ?? 0)} • P85 {formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.p85 ?? null)}</small>
                        </article>
                        <article className={`team-kpi-card${isMetricVisible("active-time") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel(FLOW_LABELS.cycle, "activeTime")}
                          <strong>{formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.avgDays ?? null)}</strong>
                          <small>Cycle Time flow • {formatFlowTimingScopeLabel(selectedTeam.config.flowTimingConfig)} • {formatBasedOnTickets(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.count ?? 0)} • P85 {formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.p85 ?? null)}</small>
                        </article>
                        <article className={`team-kpi-card${isMetricVisible("cycle-time") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel(FLOW_LABELS.implementation, "flowCycleTime")}
                          <strong>{formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.avgDays ?? null)}</strong>
                          <small>Implementation Time flow • {formatFlowTimingScopeLabel(selectedTeam.config.flowTimingConfig)} • {formatBasedOnTickets(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.count ?? 0)} • P85 {formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.p85 ?? null)}</small>
                        </article>
                        <article className={`team-kpi-card${isMetricVisible("sle-p85") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel("SLE P85", "sleP85")}
                          <strong>{formatWorkingDays(selectedTeamRow.current.sle.p85)}</strong>
                          <small>
                            {formatBasedOnTickets(selectedTeamRow.current.sleCycleTimes.length)}
                            {selectedTeamRow.current.sleCycleTimes.length < 10 ? " • Low-confidence sample" : ""} •{" "}
                            {formatPreviousMetricLine(previousMetricLabel, getPreviousSleValue("p85"))}
                          </small>
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
                        <article className={`team-kpi-card${isMetricVisible("work-mix") ? "" : " metric-hidden"}`}>
                          {renderMetricLabel("Work Mix", "workMix", selectedTeamHealthSignals.workMix)}
                          <strong>{formatWorkMixSummary(selectedTeamHealth.workMix)}</strong>
                          <small>
                            {selectedTeamHealth.workMix.totalDone === 0
                              ? "No delivered work in selected period."
                              : selectedTeamHealth.workMix.topTypes
                                  .slice(0, 3)
                                  .map((item) => `${item.issueType} ${formatPercentValue(item.percentage)}%`)
                                  .join(" • ")}
                          </small>
                        </article>
                      </div>
                      <section className="flow-health-grid">
                        {renderSprintWorkSummaryCard()}
                      </section>

                      <section className="flow-signals-grid">
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
                            {formatThroughputStabilitySummary()}
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
                            {formatFlowEfficiencySummary()}
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
                            Open tickets {selectedTeamHealth.agingWip.total} • 30+ days {selectedTeamHealth.agingWip.over30} • &gt;90 days {selectedTeamHealth.agingWip.over90}
                          </small>
                          {!agingWipCompactOpen && (
                            <div className="aging-wip-compact-preview">
                              <div className="aging-wip-preview-title">Top 3 oldest</div>
                              {agingTopThree.length === 0 ? (
                                <div className="muted">No open tickets.</div>
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
                                Median {formatDays(selectedTeamHealth.agingWip.medianDays)} • open bugs {selectedTeamHealth.bugRatio.wipBugCount} (
                                {selectedTeamHealth.bugRatio.wipBugRatio === null ? "-" : `${formatPercentValue(selectedTeamHealth.bugRatio.wipBugRatio)}%`})
                              </div>
                              <div className="aging-wip-old-total">
                                <div className="aging-wip-old-total-title">Older than 30 days</div>
                                <div>{selectedTeamHealth.agingWip.over30} ticket(s)</div>
                              </div>
                              {agingOlderThanMonthItems.length === 0 ? (
                                <div className="muted">No open tickets.</div>
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
                              Open editor in Full View
                            </button>
                          </div>
                        </div>
                      </section>
                      {renderTimeInStatusPanel("dashboard-time-in-status-content")}
                    </section>
                      </>
                    )}
                  </section>
                ) : (
                  <section className="table-panel dashboard-merged-empty">
                    <p className="muted">Select an entity row to open details below the multi-entity view.</p>
                  </section>
                )}
                </div>
              </section>
            )}

            {workspaceHandle && page === "team" && (
              <section className={`page-section team-page view-${teamViewMode}`}>
                {!selectedTeam || !selectedTeamRow ? (
                  <section className="panel-box">
                    <h2>No entity selected</h2>
                    <p className="muted">Select an entity from the current dashboard to open the detailed view.</p>
                  </section>
                ) : (
	                  <>
	                    {executiveTeamData ? (
	                      <ExecutiveTeamView
	                      data={executiveTeamData}
	                      mode={teamViewMode}
	                      onBack={() => setPage("dashboard")}
	                      onModeChange={handleTeamViewModeChange}
	                      onExport={handleExportTeamReport}
	                      activeTab={teamTab === "cycle" ? "cycle" : "overview"}
	                      onTabChange={handleTeamTabChange}
	                      periodSlot={renderPeriodPicker()}
	                      settingsSlot={renderExecutiveTeamConfigurationPanel()}
	                      />
	                    ) : null}
                    <div className="legacy-team-ui">
                    <div className="section-head team-page-head">
                      <div>
                        <button className="back-link" onClick={() => setPage("dashboard")}>← Back to Dashboard</button>
                        <h1>{selectedTeam.config.teamName}</h1>
                        <p>
                          {selectedTeam.config.description || "No description"} • {selectedTeam.importFiles.length} imports
                        </p>
                      </div>
                      <div className="team-page-tools">
                        <div className="team-view-toggle" role="group" aria-label="Team detail view">
                          <button
                            type="button"
                            className={teamViewMode === "team" ? "active" : ""}
                            aria-pressed={teamViewMode === "team"}
                            onClick={() => handleTeamViewModeChange("team")}
                          >
                            <UsersRound size={16} aria-hidden="true" />
                            Team view
                          </button>
                          <button
                            type="button"
                            className={teamViewMode === "scrum-master" ? "active" : ""}
                            aria-pressed={teamViewMode === "scrum-master"}
                            onClick={() => handleTeamViewModeChange("scrum-master")}
                          >
                            <Settings2 size={16} aria-hidden="true" />
                            Scrum Master
                          </button>
                        </div>
                        {teamViewMode === "scrum-master" && (
                          <label className="entity-type-control compact">
                            <span>Layer</span>
                            <select
                              value={getTeamEntityType(selectedTeam.config)}
                              disabled={busy}
                              onChange={(event) =>
                                void handleUpdateTeamEntityType(selectedTeam.teamId, event.target.value as TeamEntityType)
                              }
                            >
                              {TEAM_ENTITY_TYPES.map((type) => (
                                <option key={`team-page-${type}`} value={type}>
                                  {TEAM_ENTITY_LABELS[type]}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <button className="soft-btn" onClick={handleExportTeamReport}>Export Report</button>
                      </div>
                    </div>

                    <div className="team-tabs" role="tablist" aria-label="Team detail tabs">
                      <button
                        role="tab"
                        aria-selected={teamTab === "overview"}
                        className={teamTab === "overview" ? "team-tab active" : "team-tab"}
                        onClick={() => setTeamTab("overview")}
                      >
                        Overview
                      </button>
                      <button
                        role="tab"
                        aria-selected={teamTab === "cycle"}
                        className={teamTab === "cycle" ? "team-tab active" : "team-tab"}
                        onClick={() => setTeamTab("cycle")}
                      >
                        Cycle Time
                      </button>
                      {teamViewMode === "scrum-master" && (
                        <button
                          role="tab"
                          aria-selected={teamTab === "data"}
                          className={teamTab === "data" ? "team-tab active" : "team-tab"}
                          onClick={() => setTeamTab("data")}
                        >
                          Data Quality
                        </button>
                      )}
                    </div>

                    <div className="team-controls-bar">
                      {renderPeriodPicker()}

                      {teamTab === "cycle" && teamViewMode === "scrum-master" && (
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
                        <section className="overview-top">
                          <h2 className="team-section-title">{teamViewMode === "team" ? "Team flow" : "Overview"}</h2>
                          <div className="team-kpi-grid">
                            <article className={`team-kpi-card flow-signal-card${isMetricVisibleInTeamView("wip-age-risk") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel("Old open tickets", "wipAgeRisk", selectedTeamHealthSignals.wipAgeRisk)}
                              <strong>
                                {formatPercentValue(selectedTeamHealth.wipRisk.over30Pct)}% of open tickets are older than 30 days
                              </strong>
                              <small>
                                &gt;60 days {formatPercentValue(selectedTeamHealth.wipRisk.over60Pct)}% • &gt;90 days{" "}
                                {formatPercentValue(selectedTeamHealth.wipRisk.over90Pct)}% • 31-60 days{" "}
                                {formatPercentValue(Math.max(0, selectedTeamHealth.wipRisk.over30DeltaPpVs30dBaseline))}%
                              </small>
                            </article>
                            <article className={`team-kpi-card flow-signal-card${isMetricVisibleInTeamView("sle-risk") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(teamViewMode === "team" ? "Work past expectation" : "Open tickets older than SLE P85", "sleRisk", selectedTeamHealthSignals.sleRisk)}
                              <strong>{formatSleRiskValue(selectedTeamHealth.sleRisk)}</strong>
                              {renderTeamMetricExplainer("Open work that has already passed the team's normal 85% delivery expectation. Lower is better.")}
                              <small>
                                Expectation {formatWorkingDays(selectedTeamHealth.sleRisk.thresholdDays)} • open tickets {selectedTeamHealth.sleRisk.totalWip}
                              </small>
                            </article>
                            <article className={`team-kpi-card flow-signal-card${isMetricVisibleInTeamView("stale-wip") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel("Open tickets not updated", "staleWip", selectedTeamHealthSignals.staleWip)}
                              <strong>{formatStaleWipValue(selectedTeamHealth.staleWip)}</strong>
                              <small>
                                No update for &gt;{selectedTeamHealth.staleWip.thresholdDays} days • open tickets {selectedTeamHealth.staleWip.totalWip}
                              </small>
                            </article>
                            <article className={`team-kpi-card flow-signal-card${isMetricVisibleInTeamView("forecast") ? "" : " metric-hidden"}`}>
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
                            <article className={`team-kpi-card${isMetricVisibleInTeamView("velocity") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(teamViewMode === "team" ? "Completion rate" : `Avg Velocity (${selectedVelocityUnit})`, "velocity")}
                              <strong>{formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig)}</strong>
                              {renderTeamMetricExplainer("How many items the team usually completes per week. Used for planning and forecasting.")}
                              <small>{formatPreviousMetricLine(previousMetricLabel, getPreviousVelocityValue())}</small>
                            </article>
                            <article className={`team-kpi-card${isMetricVisibleInTeamView("lead-time") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel("Lead Time", "leadTime")}
                              <strong>{formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.avgDays ?? null)}</strong>
                              {renderTeamMetricExplainer("Total Lead Time from upstream intake to Done. This is the customer wait time across planning and delivery.")}
                              <small>Lead Time to Done • {formatBasedOnTickets(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.count ?? 0)} • P85 {formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "lead")?.p85 ?? null)}</small>
                            </article>
                            <article className={`team-kpi-card${isMetricVisibleInTeamView("active-time") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(FLOW_LABELS.cycle, "activeTime")}
                              <strong>{formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.avgDays ?? null)}</strong>
                              {renderTeamMetricExplainer("Time after Funnel until Done. This shows how long work spends in the active delivery flow.")}
                              <small>Cycle Time flow to Done • {formatBasedOnTickets(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.count ?? 0)} • P85 {formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "cycle")?.p85 ?? null)}</small>
                            </article>
                            <article className={`team-kpi-card${isMetricVisibleInTeamView("cycle-time") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(FLOW_LABELS.implementation, "flowCycleTime")}
                              <strong>{formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.avgDays ?? null)}</strong>
                              {renderTeamMetricExplainer("Implementation time from first hands-on work until Done. This is the main delivery speed signal.")}
                              <small>
                                {teamViewMode === "team"
                                  ? `Implementation to Done • Average based on ${getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.count ?? 0} items`
                                  : `Implementation to Done • ${formatBasedOnTickets(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.count ?? 0)} • P85 ${formatWorkingDays(getFlowPresentationValue(selectedTeamRow.current.flowTiming, "implementation")?.p85 ?? null)}`}
                              </small>
                            </article>
                            <article className={`team-kpi-card${isMetricVisibleInTeamView("sle-p85") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel(teamViewMode === "team" ? "Delivery expectation" : "SLE P85", "sleP85")}
                              <strong>
                                {teamViewMode === "team" && selectedTeamRow.current.sle.p85 !== null
                                  ? `≤ ${formatWorkingDays(selectedTeamRow.current.sle.p85)}`
                                  : formatWorkingDays(selectedTeamRow.current.sle.p85)}
                              </strong>
                              {renderTeamMetricExplainer("The team's current delivery promise: about 85% of similar completed work finished within this time.")}
                              <small>
                                {teamViewMode === "team"
                                  ? `85% of ${selectedTeamRow.current.sleCycleTimes.length} completed items finished within this Cycle Time`
                                  : `${formatBasedOnTickets(selectedTeamRow.current.sleCycleTimes.length)}${selectedTeamRow.current.sleCycleTimes.length < 10 ? " • Low-confidence sample" : ""} • ${formatPreviousMetricLine(previousMetricLabel, getPreviousSleValue("p85"))}`}
                              </small>
                            </article>
                            <article className={`team-kpi-card${isMetricVisibleInTeamView("bug-ratio") ? "" : " metric-hidden"}`}>
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
                            <article className={`team-kpi-card${isMetricVisibleInTeamView("functional-coverage") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel("Functional test coverage", "functionalCoverage")}
                              <strong>{formatEngineeringPercent(selectedTeam.config.engineeringMetrics?.functionalTestCoveragePct)}</strong>
                              {renderTeamMetricExplainer("Average automated functional coverage across the team's services. Updated manually from the team's test reporting source.")}
                              <small>{formatEngineeringMetricsUpdatedAt(selectedTeam.config.engineeringMetrics?.updatedAt)}</small>
                            </article>
                            <article className={`team-kpi-card${isMetricVisibleInTeamView("unit-test-coverage") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel("Unit test coverage", "unitTestCoverage")}
                              <strong>{formatEngineeringPercent(selectedTeam.config.engineeringMetrics?.unitTestCoveragePct)}</strong>
                              {renderTeamMetricExplainer("Average unit or code coverage across the team's services. Keep the source consistent between updates.")}
                              <small>{formatEngineeringMetricsUpdatedAt(selectedTeam.config.engineeringMetrics?.updatedAt)}</small>
                            </article>
                            <article className={`team-kpi-card${isMetricVisibleInTeamView("technical-debt") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel("Technical debt", "technicalDebt")}
                              <strong>{formatEngineeringDays(selectedTeam.config.engineeringMetrics?.technicalDebtAvgDays)}</strong>
                              {renderTeamMetricExplainer("Average estimated remediation time for known technical debt. Lower is better.")}
                              <small>{formatEngineeringMetricsUpdatedAt(selectedTeam.config.engineeringMetrics?.updatedAt)}</small>
                            </article>
                            <article className={`team-kpi-card${isMetricVisibleInTeamView("work-mix") ? "" : " metric-hidden"}`}>
                              {renderMetricLabel("Work Mix", "workMix", selectedTeamHealthSignals.workMix)}
                              <strong>{formatWorkMixSummary(selectedTeamHealth.workMix)}</strong>
                              <small>
                                {selectedTeamHealth.workMix.totalDone === 0
                                  ? "No delivered work in selected period."
                                  : selectedTeamHealth.workMix.topTypes
                                      .slice(0, 3)
                                      .map((item) => `${item.issueType} ${formatPercentValue(item.percentage)}%`)
                                      .join(" • ")}
                              </small>
                            </article>
                          </div>
                          {renderTeamTimeInStatusSummary()}
                          <section className="flow-health-grid">
                            {renderSprintWorkSummaryCard()}
                          </section>

                          <section className="flow-signals-grid">
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
                                {formatThroughputStabilitySummary()}
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
                                {formatFlowEfficiencySummary()}
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

                          {renderWorkloadDistributionPanel()}
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
                                Open tickets {selectedTeamHealth.agingWip.total} • 30+ days {selectedTeamHealth.agingWip.over30} • &gt;90 days {selectedTeamHealth.agingWip.over90}
                              </small>
                              {!agingWipCompactOpen && (
                                <div className="aging-wip-compact-preview">
                                  <div className="aging-wip-preview-title">Top 3 oldest</div>
                                  {agingTopThree.length === 0 ? (
                                    <div className="muted">No open tickets.</div>
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
                                    Median {formatDays(selectedTeamHealth.agingWip.medianDays)} • open bugs {selectedTeamHealth.bugRatio.wipBugCount} (
                                    {selectedTeamHealth.bugRatio.wipBugRatio === null ? "-" : `${formatPercentValue(selectedTeamHealth.bugRatio.wipBugRatio)}%`})
                                  </div>
                                  <div className="aging-wip-old-total">
                                    <div className="aging-wip-old-total-title">Older than 30 days</div>
                                    <div>{selectedTeamHealth.agingWip.over30} ticket(s)</div>
                                  </div>
                                  {agingOlderThanMonthItems.length === 0 ? (
                                    <div className="muted">No open tickets.</div>
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

                              <p className="muted">Auto Time in Status months: {selectedTeam.autoTimeInStatus.length}</p>
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
                                        Implementation Time is contained by Cycle Time, which is contained by Lead Time. Done is terminal and excluded from duration metrics.
                                      </p>
                                    </div>
                                    <div className="workflow-status-head-actions">
                                      <button type="button" className="soft-btn" onClick={handleResetWorkflowStatuses}>
                                        Use auto-detect
                                      </button>
                                      <span>{detectedWorkflowStatuses.length} detected</span>
                                    </div>
                                  </div>
                                  <div className="workflow-status-grid">
                                    {detectedWorkflowStatuses.map((statusName) => {
                                      const normalized = normalizeTextValue(statusName);
                                      const category = backlogStatusList.some((item) => normalizeTextValue(item) === normalized)
                                        ? "backlog"
                                        : funnelStatusList.some((item) => normalizeTextValue(item) === normalized)
                                          ? "funnel"
                                          : sprintScopeStatusList.some((item) => normalizeTextValue(item) === normalized)
                                          ? "active"
                                          : implementingStatusList.some((item) => normalizeTextValue(item) === normalized)
                                            ? "implementing"
                                            : doneStatusList.some((item) => normalizeTextValue(item) === normalized)
                                              ? "done"
                                              : "unmapped";
                                      return (
                                        <article key={`workflow-status-${statusName}`} className={`workflow-status-row ${category}`}>
                                          <strong>{statusName}</strong>
                                          <div className="workflow-status-actions">
                                          <button type="button" className={category === "backlog" ? "active" : ""} onClick={() => handleClassifyWorkflowStatus(statusName, "backlog")}>
                                            Unmapped
                                            </button>
                                            <button type="button" className={category === "funnel" ? "active" : ""} onClick={() => handleClassifyWorkflowStatus(statusName, "funnel")}>
                                              Lead Time
                                            </button>
                                          <button type="button" className={category === "active" ? "active" : ""} onClick={() => handleClassifyWorkflowStatus(statusName, "active")}>
                                            Cycle Time
                                            </button>
                                          <button type="button" className={category === "implementing" ? "active" : ""} onClick={() => handleClassifyWorkflowStatus(statusName, "implementing")}>
                                            Implementation Time
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

                                <section className="done-config-panel">
                                  <div className="done-config-panel-title">Flow timing scope</div>
                                  <div className="done-chip-editor">
                                    <div className="done-chip-editor-label">
                                      Choose which tickets are included when Lead Time, Cycle Time, and Implementation Time are recalculated.
                                    </div>
                                    <label className="checkbox-row">
                                      <input
                                        type="checkbox"
                                        checked={normalizeFlowTimingConfig(draftConfig.flowTimingConfig).includeClosedTickets}
                                        onChange={(event) => handleToggleFlowTimingScope("closed", event.target.checked)}
                                      />
                                      <span>Closed tickets</span>
                                    </label>
                                    <label className="checkbox-row">
                                      <input
                                        type="checkbox"
                                        checked={normalizeFlowTimingConfig(draftConfig.flowTimingConfig).includeOpenTickets}
                                        onChange={(event) => handleToggleFlowTimingScope("open", event.target.checked)}
                                      />
                                      <span>Open tickets</span>
                                    </label>
                                    <small className="guide-note">
                                      Select both to compare the whole flow load; select only one to isolate completed or current work.
                                    </small>
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
                                      <button type="button" className="soft-btn" onClick={() => mutateUnifiedStatusDraft((current) => ({ ...current, doneStatuses: [] }))}>Clear</button>
                                    </div>
                                  </section>

                                  <section className="done-config-panel">
                                    <div className="done-config-panel-title">Unmapped / excluded statuses</div>
                                    <div className="done-chip-editor">
                                      <div className="done-chip-editor-label">Outside the duration roles; excluded from Lead Time, Cycle Time, and Implementation Time</div>
                                      <div className="done-chip-list">
                                        {backlogStatusList.length === 0 ? (
                                          <span className="muted">No unmapped/excluded statuses configured.</span>
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
                                          placeholder="Add unmapped status (e.g. Blocked)"
                                        />
                                        <button type="button" className="soft-btn" onClick={handleAddBacklogStatus}>Add</button>
                                      </div>
                                    </div>
                                  </section>

                                  <section className="done-config-panel">
                                    <div className="done-config-panel-title">Lead Time statuses</div>
                                    <div className="done-chip-editor">
                                      <div className="done-chip-editor-label">Counts only in Lead Time</div>
                                      <div className="done-chip-list">
                                        {(draftDisplayUnifiedStatusConfig?.leadStatuses ?? []).length === 0 ? (
                                          <span className="muted">No Lead Time statuses configured.</span>
                                        ) : (
                                          (draftDisplayUnifiedStatusConfig?.leadStatuses ?? []).map((value: string) => (
                                            <button
                                              key={value}
                                              type="button"
                                              className="chip-btn"
                                              onClick={() => handleRemoveFunnelStatus(value)}
                                              title="Remove status"
                                            >
                                              {value} <span aria-hidden="true">x</span>
                                            </button>
                                          ))
                                        )}
                                      </div>
                                      <div className="done-chip-input-row">
                                        <input
                                          value={funnelStatusDraft}
                                          onChange={(event) => setFunnelStatusDraft(event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              handleAddFunnelStatus();
                                            }
                                          }}
                                          placeholder="Add Lead Time status"
                                        />
                                        <button type="button" className="soft-btn" onClick={handleAddFunnelStatus}>Add</button>
                                      </div>
                                    </div>
                                  </section>

                                  <section className="done-config-panel">
                                    <div className="done-config-panel-title">Cycle Time statuses</div>
                                    <div className="done-chip-editor">
                                      <div className="done-chip-editor-label">Included in Lead Time and Cycle Time, outside the nested Implementation Time set</div>
                                      <div className="done-chip-list">
                                        {(draftDisplayUnifiedStatusConfig?.cycleStatuses ?? []).length === 0 ? (
                                          <span className="muted">Auto-detect from the Cycle Time flow.</span>
                                        ) : (
                                          (draftDisplayUnifiedStatusConfig?.cycleStatuses ?? []).map((value: string) => (
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
                                          placeholder="Add Cycle Time status (e.g. In Progress)"
                                        />
                                        <button type="button" className="soft-btn" onClick={handleAddSprintScopeStatus}>Add</button>
                                      </div>
                                      <small className="guide-note">
                                        Sprint discipline metrics use the configured Cycle Time and Implementation Time roles.
                                      </small>
                                    </div>

                                    <div className="done-config-presets">
                                      <button type="button" className="soft-btn" onClick={handleResetSprintScopeStatuses}>
                                        Use auto-detect
                                      </button>
                                      <button type="button" className="soft-btn" onClick={() => mutateUnifiedStatusDraft((current) => ({ ...current, cycleStatuses: [], leadStatuses: current.leadStatuses.filter((status) => !current.cycleStatuses.includes(status)) }))}>
                                        Clear
                                      </button>
                                    </div>
                                  </section>

                                  <section className="done-config-panel">
                                    <div className="done-config-panel-title">Implementation Time statuses</div>
                                    <div className="done-chip-editor">
                                      <div className="done-chip-editor-label">Execution states inside Implementation Time, Cycle Time, and Lead Time</div>
                                      <div className="done-chip-list">
                                        {(draftDisplayUnifiedStatusConfig?.implementationStatuses ?? []).length === 0 ? (
                                          <span className="muted">No Implementation Time statuses configured.</span>
                                        ) : (
                                          (draftDisplayUnifiedStatusConfig?.implementationStatuses ?? []).map((value: string) => (
                                            <button
                                              key={value}
                                              type="button"
                                              className="chip-btn"
                                              onClick={() => handleRemoveImplementingStatus(value)}
                                              title="Remove status"
                                            >
                                              {value} <span aria-hidden="true">x</span>
                                            </button>
                                          ))
                                        )}
                                      </div>
                                      <div className="done-chip-input-row">
                                        <input
                                          value={implementingStatusDraft}
                                          onChange={(event) => setImplementingStatusDraft(event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              handleAddImplementingStatus();
                                            }
                                          }}
                                          placeholder="Add Implementation Time status"
                                        />
                                        <button type="button" className="soft-btn" onClick={handleAddImplementingStatus}>Add</button>
                                      </div>
                                    </div>
                                  </section>

                                  <section className="done-config-panel engineering-metrics-panel">
                                    <div className="done-config-panel-title">Manual engineering metrics</div>
                                    <div className="done-chip-editor-label">
                                      Team-facing values from external sources. Percentages accept 0-100.
                                    </div>
                                    <div className="engineering-metrics-input-grid">
                                      <label className="done-config-inline-field">
                                        <span className="done-chip-editor-label">Automated functional coverage (%)</span>
                                        <input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="0.1"
                                          value={functionalCoverageInput}
                                          onChange={(event) => setFunctionalCoverageInput(event.target.value)}
                                          placeholder="e.g. 82"
                                        />
                                      </label>
                                      <label className="done-config-inline-field">
                                        <span className="done-chip-editor-label">Unit test code coverage (%)</span>
                                        <input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="0.1"
                                          value={unitTestCoverageInput}
                                          onChange={(event) => setUnitTestCoverageInput(event.target.value)}
                                          placeholder="e.g. 74"
                                        />
                                      </label>
                                      <label className="done-config-inline-field">
                                        <span className="done-chip-editor-label">Technical debt average (days)</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.5"
                                          value={technicalDebtInput}
                                          onChange={(event) => setTechnicalDebtInput(event.target.value)}
                                          placeholder="e.g. 12"
                                        />
                                      </label>
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
                                  <button type="submit" disabled={busy}>Save role mapping</button>
                                  {workflowSaveConfirmationOpen ? (
                                    <div className="exec-config-confirm" role="alertdialog" aria-label="Confirm status-role mapping">
                                      <strong>Confirm status-role mapping?</strong>
                                      <span>This changes future metric interpretation. Existing source files are unchanged.</span>
                                      <button type="submit" disabled={busy}>Confirm and save</button>
                                      <button type="button" onClick={() => setWorkflowSaveConfirmationOpen(false)}>Keep editing</button>
                                    </div>
                                  ) : null}
                                </div>

                                <p className="guide-note">
                                  SLE is the existing P85 of eligible completed Cycle Time observations and uses Monday-Friday working days.
                                </p>
                              </form>
                            ) : (
                              <div className="done-config-collapsed">
                                <div className="done-config-collapsed-row">
                                  <strong>Done statuses</strong>
                                  <span>{doneStatusList.length > 0 ? doneStatusList.join(" • ") : "-"}</span>
                                </div>
                                        <div className="done-config-collapsed-row">
                                          <strong>Unmapped / excluded statuses</strong>
                                  <span>{backlogStatusList.length > 0 ? backlogStatusList.join(" • ") : "None"}</span>
                                </div>
                                        <div className="done-config-collapsed-row">
                                          <strong>Lead Time statuses</strong>
                                  <span>{funnelStatusList.length > 0 ? funnelStatusList.join(" • ") : "None"}</span>
                                </div>
                                        <div className="done-config-collapsed-row">
                                          <strong>Cycle Time statuses</strong>
                                  <span>{sprintScopeStatusList.length > 0 ? sprintScopeStatusList.join(" • ") : "Auto-detect"}</span>
                                </div>
                                        <div className="done-config-collapsed-row">
                                          <strong>Implementation Time statuses</strong>
                                  <span>{implementingStatusList.length > 0 ? implementingStatusList.join(" • ") : "None"}</span>
                                </div>
                                <div className="done-config-collapsed-row">
                                  <strong>Flow timing scope</strong>
                                  <span>{formatFlowTimingScopeLabel(selectedTeam.config.flowTimingConfig)}</span>
                                </div>
                                <div className="done-config-collapsed-row">
                                  <strong>Engineering metrics</strong>
                                  <span>
                                    Functional {formatEngineeringPercent(selectedTeam.config.engineeringMetrics?.functionalTestCoveragePct)} • Unit{" "}
                                    {formatEngineeringPercent(selectedTeam.config.engineeringMetrics?.unitTestCoveragePct)} • Debt{" "}
                                    {formatEngineeringDays(selectedTeam.config.engineeringMetrics?.technicalDebtAvgDays)}
                                  </span>
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

                    {teamTab === "data" && teamViewMode === "scrum-master" && (
                      <section className="data-quality-view" role="tabpanel" aria-label="Data Quality">
                        <div className="section-head compact-head">
                          <div>
                            <h2>Data Quality</h2>
                            <p>{formatPeriodLabel(periodMonth, periodReferenceDate)}</p>
                          </div>
                        </div>

                        <div className="data-quality-summary" aria-label="Data quality summary">
                          <article className="team-kpi-card">
                            <span>Imported issues</span>
                            <strong>{selectedTeamDataSummary.issueCount}</strong>
                            <small>{selectedTeam.importFiles.length} source file(s)</small>
                          </article>
                          <article className="team-kpi-card">
                            <span>Moved Jira issues</span>
                            <strong>{selectedTeamDataSummary.movedIssueCount}</strong>
                            <small>Measured from project entry when history is available</small>
                          </article>
                          <article className="team-kpi-card">
                            <span>Metric exclusions</span>
                            <strong>{selectedTeamDataSummary.exclusionCount}</strong>
                            <small>Recorded data-quality exceptions</small>
                          </article>
                          <article className="team-kpi-card">
                            <span>Latest import</span>
                            <strong>
                              {selectedTeamDataSummary.latestImportAt
                                ? formatDateText(selectedTeamDataSummary.latestImportAt)
                                : "-"}
                            </strong>
                            <small>Workspace source timestamp</small>
                          </article>
                        </div>

                        {renderDataMonitorPanel("data-quality-monitor")}

                        <details className="data-quality-audit">
                          <summary>Metric audit values</summary>
                          {renderDetailedMetricsTable("data-quality-metrics")}
                        </details>
                      </section>
                    )}

                    {teamTab === "cycle" && (
                      <>
                        <Suspense fallback={<section className="panel-box">Loading cycle-time chart...</section>}>
                          <TeamDetail
                            team={selectedTeam}
                            title={teamViewMode === "team" ? FLOW_LABELS.implementation : "Implementation Time Scatter Plot"}
                            subtitle={
                              teamViewMode === "team"
                                ? "Completed work and the delivery expectation in working days"
                                : "Resolution date vs Implementation Time with SLE percentile lines"
                            }
                            periodFilter={periodMonth}
                            sleValues={selectedTeamRow.current.sle}
                            lineVisibility={
                              teamViewMode === "team"
                                ? { p50: false, p70: false, p85: true, p95: false }
                                : sleLineVisibility
                            }
                            sleIssueTypeOptions={sleIssueTypeOptions}
                            sleIncludedIssueTypes={sleIssueTypesDraft}
                            sleTypeDirty={sleIssueTypesDirty}
                            onToggleSleIssueType={handleToggleSleIssueTypeDraft}
                            onResetSleIssueTypes={handleResetSleIssueTypesDraft}
                            onApplySleIssueTypes={() => void handleApplySleIssueTypes()}
                            excludedIssueKeys={Array.from(
                              new Set([
                                ...(selectedTeam.config.excludedIssueKeys ?? []),
                                ...(selectedTeam.config.issueExclusions ?? []).map((exclusion) => exclusion.issueKey),
                              ]),
                            )}
                            issueExclusions={selectedTeam.config.issueExclusions ?? []}
                            presentationMode={teamViewMode === "team"}
                            busy={busy}
                            onExcludeIssue={handleExcludeIssueFromMetrics}
                            onExcludeIssues={handleExcludeIssuesFromMetrics}
                            onRestoreIssue={handleRestoreExcludedIssue}
                            onRestoreAllIssues={handleRestoreAllExcludedIssues}
                          />
                        </Suspense>
                        {renderCycleTimeDistributionPanel()}
                      </>
                    )}
                    </div>
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
                      <p>Select a team and save the JQL used by that team's renew launcher script.</p>
                    </div>
                  </div>

                  <form className="import-simple-flow import-jql-form" onSubmit={handleSaveImportTeamJql}>
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

                    <label className="jira-jql-field import-jql-editor">
                      JQL
                      <textarea
                        value={queryDraftJql}
                        onChange={(event) => setQueryDraftJql(event.target.value)}
                        placeholder="project = YOURPROJECT AND updated >= startOfYear() ORDER BY updated DESC"
                        rows={7}
                        disabled={!selectedImportTeam}
                      />
                    </label>

                    <div className="preset-row">
                      <button type="submit" disabled={busy || !selectedImportTeam || queryDraftJql.trim().length === 0}>
                        Save JQL
                      </button>
                    </div>

                    <p className="guide-note">
                      This JQL is saved to <code>team.json</code>. The workspace <code>renew-team.command</code> script reads the latest team list every time it runs.
                    </p>
                  </form>
                </section>
              </section>
            )}
          </>
        )}
      </main>

      {showAddTeamModal && (
        <div className="modal-overlay" onClick={() => setShowAddTeamModal(false)}>
          <div
            ref={addTeamModalRef}
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-entity-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h3 id="add-entity-title">Add New Entity</h3>
              <button className="ghost-btn icon-btn" aria-label="Close dialog" onClick={() => setShowAddTeamModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="modal-form">
              <label>
                Name
                <input
                  value={newTeamName}
                  onChange={(event) => setNewTeamName(event.target.value)}
                  placeholder="e.g., Platform Engineering or Payments ART"
                  required
                />
              </label>

              <label>
                Layer
                <select
                  value={newTeamEntityType}
                  onChange={(event) => setNewTeamEntityType(event.target.value as TeamEntityType)}
                >
                  {TEAM_ENTITY_TYPES.map((entityType) => (
                    <option key={entityType} value={entityType}>
                      {TEAM_ENTITY_LABELS[entityType]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Description (optional)
                <input
                  value={newTeamDescription}
                  onChange={(event) => setNewTeamDescription(event.target.value)}
                  placeholder="Team focus area"
                />
              </label>

              <label>
                JQL
                <textarea
                  value={newTeamJql}
                  onChange={(event) => setNewTeamJql(event.target.value)}
                  placeholder="project = ABC AND updated >= startOfYear() ORDER BY Rank ASC"
                  rows={4}
                  required
                />
              </label>

              <p className="guide-note">
                This query is saved to team.json. Use the workspace renew-team.command file to choose a team and pull fresh Jira data.
              </p>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowAddTeamModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}>
                  Create {TEAM_ENTITY_LABELS[newTeamEntityType]}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function slugifyValue(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "query";
}

function getTeamEntityType(config: TeamConfig | undefined): TeamEntityType {
  if (
    config?.entityType === "team" ||
    config?.entityType === "vde" ||
    config?.entityType === "art" ||
    config?.entityType === "portfolio"
  ) {
    return config.entityType;
  }

  const safeType = config?.safeConfig?.entityType;
  if (safeType === "portfolio") {
    return "portfolio";
  }

  if (safeType === "agile-release-train" || safeType === "solution-train") {
    return "art";
  }

  if (safeType === "development-value-stream" || safeType === "operational-value-stream") {
    return "vde";
  }

  return "team";
}

function getMetricScopeForEntityType(entityType: TeamEntityType): MetricScope {
  if (entityType === "vde") {
    return "value-stream";
  }

  if (entityType === "art") {
    return "art";
  }

  if (entityType === "portfolio") {
    return "portfolio";
  }

  return "team";
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

function normalizeFlowTimingConfig(config: TeamConfig["flowTimingConfig"]): NonNullable<TeamConfig["flowTimingConfig"]> {
  const includeClosedTickets = config?.includeClosedTickets !== false;
  const includeOpenTickets = config?.includeOpenTickets === true;

  if (!includeClosedTickets && !includeOpenTickets) {
    return {
      includeClosedTickets: true,
      includeOpenTickets: false,
    };
  }

  return {
    includeClosedTickets,
    includeOpenTickets,
  };
}

function formatFlowTimingScopeLabel(config: TeamConfig["flowTimingConfig"]): string {
  const normalized = normalizeFlowTimingConfig(config);
  if (normalized.includeClosedTickets && normalized.includeOpenTickets) {
    return "Closed + Open";
  }
  if (normalized.includeOpenTickets) {
    return "Open only";
  }
  return "Closed only";
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

function parseOptionalPercentInput(value: string): number | null {
  const parsed = parseOptionalNonNegativeNumberInput(value);
  if (parsed === null || parsed > 100) {
    return null;
  }

  return parsed;
}

function formatOptionalNumberInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function formatEngineeringPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `${formatNumber(value, 1)}%`;
}

function formatEngineeringDays(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `${formatNumber(value, 1)} days`;
}

function formatEngineeringMetricsUpdatedAt(value: string | null | undefined): string {
  return value ? `Manual value • updated ${formatDateText(value)}` : "Manual value • not set";
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

function buildOpenCycleTimeByIssueKey(metrics: TeamMetrics | null): ReadonlyMap<string, number> {
  const byIssueKey = new Map<string, number>();

  (metrics?.flowTimingDetails ?? []).forEach((detail) => {
    if (
      detail.scope !== "open" ||
      detail.cycleTimeDays === null ||
      !Number.isFinite(detail.cycleTimeDays) ||
      detail.cycleTimeDays < 0
    ) {
      return;
    }

    byIssueKey.set(normalizeTextValue(detail.issueKey), detail.cycleTimeDays);
  });

  return byIssueKey;
}

function buildExecutiveMetricTrust(
  metrics: TeamMetrics | null,
  periodMonth: string,
  periodLabel: string,
  teamConfig: TeamConfig,
  parsedIssues: ParsedIssue[],
  referenceDate: Date,
  flowTiming: TeamMetrics["flowTiming"],
  sleP85: number | null,
  progressHistory: TeamProgressSnapshot[],
): MetricTrust[] {
  const details = metrics?.flowTimingDetails ?? [];
  const scope = normalizeFlowTimingConfig(teamConfig.flowTimingConfig);
  const scopedDetails = details.filter((detail) => {
    if (!isIsoDateInPeriod(detail.anchorDate, periodMonth, referenceDate)) return false;
    return detail.scope === "closed" ? scope.includeClosedTickets : scope.includeOpenTickets;
  });
  const cycleDetails = buildClosedCycleTimeDetails(metrics, periodMonth, parsedIssues, referenceDate);
  const effectiveTypes = new Set(resolveEffectiveSleIssueTypes(teamConfig.sleConfig.issueTypes, cycleDetails.map((item) => item.issueType)).map(normalizeTextValue));
  const eligibleSleDetails = cycleDetails.filter((item) => effectiveTypes.has(normalizeTextValue(item.issueType)));
  const validFlowCycleDetails = details.filter((detail) => detail.scope === "closed" && isIsoDateInPeriod(detail.anchorDate, periodMonth, referenceDate) && detail.cycleTimeDays !== null && Number.isFinite(detail.cycleTimeDays) && detail.cycleTimeDays >= 0);
  const fallbackUsed = validFlowCycleDetails.length === 0 && eligibleSleDetails.length > 0;
  const sleEligible = eligibleSleDetails.length;
  const sleUsable = eligibleSleDetails.filter((item) => Number.isFinite(item.cycleTimeDays) && item.cycleTimeDays >= 0).length;
  const semanticVersion = getWorkflowSemanticVersion(teamConfig);
  const comparableSnapshots = progressHistory
    .map((item) => item.metrics.waitingTime)
    .filter((item): item is NonNullable<TeamProgressSnapshot["metrics"]["waitingTime"]> => Boolean(item?.asOf && item.semanticVersion === semanticVersion));
  const persistedPeriods = comparableSnapshots.map((item) => item.asOf as string);
  const persistedCurrentSnapshot = comparableSnapshots
    .filter((item) => item.asOf === periodMonth)
    .sort((left, right) => (left.capturedAt ?? "").localeCompare(right.capturedAt ?? ""))
    .at(-1);
  const metricSnapshotIsAuthoritative = metrics?.waitingTime !== undefined && (
    (metrics.waitingTime.asOf === periodMonth && metrics.waitingTime.semanticVersion === semanticVersion) ||
    (metrics.waitingTime.asOf === undefined && (metrics.waitingTime.state !== "complete" || metrics.waitingTime.coverageState === "conflict"))
  );
  const waitingSnapshot = metricSnapshotIsAuthoritative && metrics?.waitingTime
    ? metrics.waitingTime
    : persistedCurrentSnapshot ?? buildWaitingTimeSnapshot(scopedDetails, periodMonth, metrics?.generatedAt, "local-recalculation", semanticVersion ?? undefined);
  const previousPeriod = getPreviousPeriodKey(periodMonth, persistedPeriods);
  const previousWaitingSnapshot = previousPeriod
    ? comparableSnapshots.filter((item) => item.asOf === previousPeriod).sort((left, right) => (left.capturedAt ?? "").localeCompare(right.capturedAt ?? "")).at(-1)
    : undefined;
  const derivedMaintenanceSnapshot = buildMaintenanceLifecycleSnapshot(
    parsedIssues,
    teamConfig,
    periodMonth,
    referenceDate,
    periodMonth,
    metrics?.generatedAt,
    "local-recalculation",
  );
  const comparableMaintenanceSnapshots = progressHistory
    .map((item) => item.metrics.maintenanceLifecycle)
    .filter((item): item is NonNullable<TeamProgressSnapshot["metrics"]["maintenanceLifecycle"]> => Boolean(item?.asOf && item.semanticVersion === derivedMaintenanceSnapshot.semanticVersion));
  const maintenancePeriods = comparableMaintenanceSnapshots.map((item) => item.asOf as string);
  const metricMaintenanceIsAuthoritative = metrics?.maintenanceLifecycle !== undefined && (
    (metrics.maintenanceLifecycle.asOf === periodMonth && metrics.maintenanceLifecycle.semanticVersion === derivedMaintenanceSnapshot.semanticVersion) ||
    (metrics.maintenanceLifecycle.asOf === undefined && metrics.maintenanceLifecycle.state !== "ready-complete")
  );
  const maintenanceSnapshot = metricMaintenanceIsAuthoritative && metrics?.maintenanceLifecycle
    ? metrics.maintenanceLifecycle
    : comparableMaintenanceSnapshots.filter((item) => item.asOf === periodMonth).sort((left, right) => (left.capturedAt ?? "").localeCompare(right.capturedAt ?? "")).at(-1) ?? derivedMaintenanceSnapshot;
  const previousMaintenancePeriod = getPreviousPeriodKey(periodMonth, maintenancePeriods);
  const previousMaintenanceSnapshot = previousMaintenancePeriod
    ? comparableMaintenanceSnapshots.filter((item) => item.asOf === previousMaintenancePeriod).sort((left, right) => (left.capturedAt ?? "").localeCompare(right.capturedAt ?? "")).at(-1)
    : undefined;
  return buildMetricTrustMetadata({
    flowTiming,
    flowDetails: scopedDetails,
    periodLabel,
    sleP85,
    sleEligibleCount: sleEligible,
    sleUsableCount: sleUsable,
    cycleFallbackUsed: fallbackUsed,
    waitingTimeSnapshot: waitingSnapshot,
    previousWaitingTimeSnapshot: previousWaitingSnapshot,
    maintenanceLifecycleSnapshot: maintenanceSnapshot,
    previousMaintenanceLifecycleSnapshot: previousMaintenanceSnapshot,
  });
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
      sleCycleTimes: [],
      flowTiming: EMPTY_FLOW_TIMING,
      multiSprintPct: 0,
      velocity: 0,
    };
  }

  const doneDetails = metrics.doneIssueDetails.filter((item) =>
    isIsoDateInPeriod(item.resolutionDate, periodMonth, referenceDate),
  );
  const issueTypeByKey = new Map<string, string>();
  parsedIssues.forEach((issue) => {
    [issue.issueKey, ...(issue.previousIssueKeys ?? [])].forEach((issueKey) => {
      const key = normalizeTextValue(issueKey);
      if (key && !issueTypeByKey.has(key)) {
        issueTypeByKey.set(key, issue.issueType);
      }
    });
  });
  const flowCycleDetails = (metrics.flowTimingDetails ?? [])
    .filter(
      (detail) =>
        detail.scope === "closed" &&
        isIsoDateInPeriod(detail.anchorDate, periodMonth, referenceDate) &&
        detail.cycleTimeDays !== null &&
        Number.isFinite(detail.cycleTimeDays) &&
        detail.cycleTimeDays >= 0,
    )
    .map((detail) => ({
      issueKey: detail.issueKey,
      issueType:
        detail.issueType && detail.issueType.trim().length > 0
          ? detail.issueType
          : issueTypeByKey.get(normalizeTextValue(detail.issueKey)) ?? "",
      cycleTimeDays: detail.cycleTimeDays as number,
    }));
  const cycleDetails =
    flowCycleDetails.length > 0
      ? flowCycleDetails
      : doneDetails
          .filter(
            (detail) =>
              detail.cycleTimeDays !== null && Number.isFinite(detail.cycleTimeDays) && detail.cycleTimeDays >= 0,
          )
          .map((detail) => ({
            issueKey: detail.issueKey,
            issueType: detail.issueType ?? issueTypeByKey.get(normalizeTextValue(detail.issueKey)) ?? "",
            cycleTimeDays: detail.cycleTimeDays as number,
          }));
  const effectiveSleIssueTypes = new Set(
    resolveEffectiveSleIssueTypes(
      teamConfig.sleConfig.issueTypes,
      cycleDetails.map((item) => item.issueType),
    ).map(normalizeTextValue),
  );
  const cycleTimes = cycleDetails.map((item) => item.cycleTimeDays);
  const sleCycleTimes = cycleDetails
    .filter((item) => effectiveSleIssueTypes.has(normalizeTextValue(item.issueType)))
    .map((item) => item.cycleTimeDays);
  const multiSprintCount = doneDetails.filter((item) => item.sprintCount >= 2).length;

  const flowTiming = computeFlowTimingSnapshot(metrics, periodMonth, teamConfig, referenceDate);

  return {
    done: doneDetails.length,
    avgCycleTime: cycleTimes.length === 0 ? null : cycleTimes.reduce((sum, value) => sum + value, 0) / cycleTimes.length,
    sle: sleCycleTimes.length === 0 ? EMPTY_SLE : buildSleValues(sleCycleTimes, "ceil"),
    sleCycleTimes,
    flowTiming,
    multiSprintPct: doneDetails.length === 0 ? 0 : (multiSprintCount / doneDetails.length) * 100,
    velocity: computeVelocityValue(doneDetails, teamConfig.velocityConfig, periodMonth, referenceDate),
  };
}

function computeFlowTimingSnapshot(
  metrics: TeamMetrics,
  periodMonth: string,
  teamConfig: TeamConfig,
  referenceDate: Date,
): TeamMetrics["flowTiming"] {
  const details = metrics.flowTimingDetails ?? [];
  if (details.length === 0) {
    return periodMonth === "all" ? metrics.flowTiming ?? EMPTY_FLOW_TIMING : EMPTY_FLOW_TIMING;
  }

  const scope = normalizeFlowTimingConfig(teamConfig.flowTimingConfig);
  const scopedDetails = details.filter((detail) => {
    if (!isIsoDateInPeriod(detail.anchorDate, periodMonth, referenceDate)) {
      return false;
    }

    return detail.scope === "closed" ? scope.includeClosedTickets : scope.includeOpenTickets;
  });

  return {
    leadTime: summarizeFlowTimingValues(scopedDetails.map((detail) => detail.leadTimeDays)),
    activeTime: summarizeFlowTimingValues(scopedDetails.map((detail) => detail.activeTimeDays)),
    cycleTime: summarizeFlowTimingValues(scopedDetails.map((detail) => detail.cycleTimeDays)),
  };
}

interface CycleTimeDetail {
  issueKey: string;
  issueType: string;
  cycleTimeDays: number;
}

function buildClosedCycleTimeDetails(
  metrics: TeamMetrics | null,
  periodMonth: string,
  parsedIssues: ParsedIssue[],
  referenceDate: Date,
): CycleTimeDetail[] {
  if (!metrics) {
    return [];
  }

  const issueTypeByKey = new Map<string, string>();
  parsedIssues.forEach((issue) => {
    [issue.issueKey, ...(issue.previousIssueKeys ?? [])].forEach((issueKey) => {
      const key = normalizeTextValue(issueKey);
      if (key && !issueTypeByKey.has(key)) {
        issueTypeByKey.set(key, issue.issueType);
      }
    });
  });

  const flowCycleDetails = (metrics.flowTimingDetails ?? [])
    .filter(
      (detail) =>
        detail.scope === "closed" &&
        isIsoDateInPeriod(detail.anchorDate, periodMonth, referenceDate) &&
        detail.cycleTimeDays !== null &&
        Number.isFinite(detail.cycleTimeDays) &&
        detail.cycleTimeDays >= 0,
    )
    .map((detail) => ({
      issueKey: detail.issueKey,
      issueType:
        detail.issueType && detail.issueType.trim().length > 0
          ? detail.issueType
          : issueTypeByKey.get(normalizeTextValue(detail.issueKey)) ?? "Unknown",
      cycleTimeDays: detail.cycleTimeDays as number,
    }));

  if (flowCycleDetails.length > 0) {
    return flowCycleDetails;
  }

  return metrics.doneIssueDetails
    .filter(
      (detail) =>
        isIsoDateInPeriod(detail.resolutionDate, periodMonth, referenceDate) &&
        detail.cycleTimeDays !== null &&
        Number.isFinite(detail.cycleTimeDays) &&
        detail.cycleTimeDays >= 0,
    )
    .map((detail) => ({
      issueKey: detail.issueKey,
      issueType: detail.issueType?.trim() || issueTypeByKey.get(normalizeTextValue(detail.issueKey)) || "Unknown",
      cycleTimeDays: detail.cycleTimeDays as number,
    }));
}

export function buildCycleTimeDistributionSnapshot(
  metrics: TeamMetrics | null,
  periodMonth: string,
  teamConfig: TeamConfig | undefined,
  parsedIssues: ParsedIssue[] = [],
  referenceDate: Date = new Date(),
): CycleTimeDistributionSnapshot {
  const details = buildClosedCycleTimeDetails(metrics, periodMonth, parsedIssues, referenceDate);
  const values = details.map((detail) => detail.cycleTimeDays);
  const sleValues = values.length > 0 ? buildSleValues(values, teamConfig?.sleConfig.rounding ?? "ceil") : EMPTY_SLE;
  const total = details.length;
  const countInRange = (min: number, max: number | null): number =>
    values.filter((value) => value >= min && (max === null || value <= max)).length;

  const bins = [
    { id: "0-3", label: "0-3 working days", count: countInRange(0, 3) },
    { id: "4-7", label: "4-7 working days", count: countInRange(4, 7) },
    { id: "8-13", label: "8-13 working days", count: countInRange(8, 13) },
    { id: "14-plus", label: "14+ working days", count: countInRange(14, null) },
  ].map((bin) => ({
    ...bin,
    percentage: total === 0 ? 0 : (bin.count / total) * 100,
  }));

  const byType = new Map<string, number[]>();
  details.forEach((detail) => {
    const issueType = detail.issueType.trim() || "Unknown";
    const valuesForType = byType.get(issueType) ?? [];
    valuesForType.push(detail.cycleTimeDays);
    byType.set(issueType, valuesForType);
  });

  const topTypes = Array.from(byType.entries())
    .map(([issueType, typeValues]) => {
      const over14Count = typeValues.filter((value) => value >= 14).length;
      return {
        issueType,
        count: typeValues.length,
        avgDays: typeValues.reduce((sum, value) => sum + value, 0) / typeValues.length,
        over14Count,
        over14Pct: (over14Count / typeValues.length) * 100,
      };
    })
    .sort((left, right) => right.over14Count - left.over14Count || right.count - left.count || left.issueType.localeCompare(right.issueType))
    .slice(0, 6);

  return {
    total,
    bins,
    p50: sleValues.p50,
    p85: sleValues.p85,
    p95: sleValues.p95,
    over14Pct: total === 0 ? 0 : (values.filter((value) => value >= 14).length / total) * 100,
    topTypes,
  };
}

export function buildWorkloadDistributionSnapshot(
  issues: ParsedIssue[],
  metrics: TeamMetrics | null,
  teamConfig: TeamConfig | undefined,
  periodMonth: string,
  referenceDate: Date = new Date(),
): WorkloadDistributionSnapshot {
  const cycleByKey = new Map<string, number>();
  buildClosedCycleTimeDetails(metrics, "all", issues, referenceDate).forEach((detail) => {
    cycleByKey.set(normalizeTextValue(detail.issueKey), detail.cycleTimeDays);
  });

  const rowsByAssignee = new Map<
    string,
    { total: number; open: number; done: number; cycleTimes: number[]; assigned: boolean }
  >();

  const isIssueDone = (issue: ParsedIssue): boolean =>
    teamConfig
      ? isDone(issue, teamConfig)
      : Boolean(issue.resolutionDate) || ["done", "closed", "resolved"].some((hint) => normalizeTextValue(issue.status).includes(hint));

  issues.forEach((issue) => {
    const activityDate = issue.resolutionDate ?? issue.updated ?? issue.created;
    if (!activityDate || !isIsoDateInPeriod(activityDate.toISOString(), periodMonth, referenceDate)) {
      return;
    }

    const rawAssignee = (issue.assignee ?? "").trim();
    const assignee = rawAssignee || "Unassigned";
    const row = rowsByAssignee.get(assignee) ?? {
      total: 0,
      open: 0,
      done: 0,
      cycleTimes: [],
      assigned: rawAssignee.length > 0,
    };
    const done = isIssueDone(issue);
    const cycleTime = cycleByKey.get(normalizeTextValue(issue.issueKey));

    row.total += 1;
    row.done += done ? 1 : 0;
    row.open += done ? 0 : 1;
    row.assigned = row.assigned || rawAssignee.length > 0;
    if (done && cycleTime !== undefined) {
      row.cycleTimes.push(cycleTime);
    }
    rowsByAssignee.set(assignee, row);
  });

  const total = Array.from(rowsByAssignee.values()).reduce((sum, row) => sum + row.total, 0);
  const rows = Array.from(rowsByAssignee.entries())
    .map(([assignee, row]) => ({
      assignee,
      total: row.total,
      open: row.open,
      done: row.done,
      percentage: total === 0 ? 0 : (row.total / total) * 100,
      avgCycleTimeDays:
        row.cycleTimes.length === 0
          ? null
          : row.cycleTimes.reduce((sum, value) => sum + value, 0) / row.cycleTimes.length,
    }))
    .sort((left, right) => right.total - left.total || left.assignee.localeCompare(right.assignee));

  const assignedTotal = rows
    .filter((row) => row.assignee !== "Unassigned")
    .reduce((sum, row) => sum + row.total, 0);
  const topAssignedRow = rows.find((row) => row.assignee !== "Unassigned") ?? null;

  return {
    total,
    assignedTotal,
    unassignedTotal: rows.find((row) => row.assignee === "Unassigned")?.total ?? 0,
    topSharePct: topAssignedRow ? topAssignedRow.percentage : null,
    topAssignee: topAssignedRow?.assignee ?? null,
    rows,
  };
}

function summarizeFlowTimingValues(values: Array<number | null>): TeamMetrics["flowTiming"]["leadTime"] {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  if (usable.length === 0) {
    return {
      count: 0,
      avgDays: null,
      ...EMPTY_SLE,
    };
  }

  return {
    count: usable.length,
    avgDays: usable.reduce((sum, value) => sum + value, 0) / usable.length,
    ...buildSleValues(usable, "ceil"),
  };
}

function computeVelocityValue(
  details: TeamMetrics["doneIssueDetails"],
  velocityConfig: VelocityConfig | undefined,
  period: string,
  referenceDate: Date,
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
  const bucketCount = resolveVelocityBucketCount(details, normalized, period, referenceDate, buckets.size);
  return total / Math.max(1, bucketCount);
}

function resolveVelocityBucketCount(
  details: TeamMetrics["doneIssueDetails"],
  config: VelocityConfig,
  period: string,
  referenceDate: Date,
  fallbackCount: number,
): number {
  const bounds = resolveVelocityPeriodBounds(details, period, referenceDate);
  if (!bounds) {
    return fallbackCount;
  }

  if (config.mode === "weekly-ticket-count") {
    return countIsoWeekBuckets(bounds.start, bounds.end);
  }

  if (config.mode === "sprint-story-points") {
    return countSprintBuckets(bounds.start, bounds.end, config) ?? fallbackCount;
  }

  return countMonthBuckets(bounds.start, bounds.end);
}

function resolveVelocityPeriodBounds(
  details: TeamMetrics["doneIssueDetails"],
  period: string,
  referenceDate: Date,
): { start: Date; end: Date } | null {
  if (period === "ytd" || period === "ytd-prev") {
    const year = period === "ytd" ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, referenceDate.getMonth(), referenceDate.getDate(), 23, 59, 59, 999),
    };
  }

  if (period === "last-24m" || period === "last-24m-prev") {
    const window = getRollingMonthWindow(period, referenceDate, 24);
    const start = startOfMonthByKey(window.startMonth);
    const end = endOfMonthByKey(window.endMonth);
    if (!start || !end) {
      return null;
    }

    return { start, end };
  }

  const range = parseRangePeriod(period);
  if (range) {
    const start = startOfMonthByKey(range.startMonth);
    const end = endOfMonthByKey(range.endMonth);
    if (!start || !end) {
      return null;
    }

    return { start, end };
  }

  if (isMonthPeriod(period)) {
    const start = startOfMonthByKey(period);
    const monthEnd = endOfMonthByKey(period);
    if (!start || !monthEnd) {
      return null;
    }

    return {
      start,
      end: monthKey(referenceDate) === period ? referenceDate : monthEnd,
    };
  }

  const deliveryDates = details
    .map((detail) => new Date(detail.resolutionDate))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());

  if (deliveryDates.length === 0) {
    return null;
  }

  return {
    start: deliveryDates[0],
    end: deliveryDates[deliveryDates.length - 1],
  };
}

function countIsoWeekBuckets(start: Date, end: Date): number {
  const keys = new Set<string>();
  const cursor = startOfDay(start);
  const endTime = end.getTime();

  while (cursor.getTime() <= endTime) {
    keys.add(getIsoWeekBucketKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys.size;
}

function countMonthBuckets(start: Date, end: Date): number {
  const firstMonth = startOfMonthByKey(monthKey(start));
  const lastMonth = startOfMonthByKey(monthKey(end));
  if (!firstMonth || !lastMonth) {
    return 1;
  }

  let count = 0;
  const cursor = new Date(firstMonth);
  while (cursor.getTime() <= lastMonth.getTime()) {
    count += 1;
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return count;
}

function countSprintBuckets(start: Date, end: Date, config: VelocityConfig): number | null {
  const startDate = normalizeDateOnly(config.sprintStartDate);
  if (!startDate) {
    return null;
  }

  const sprintStart = new Date(`${startDate}T00:00:00.000Z`);
  const sprintLengthWeeks = config.sprintLengthWeeks ?? 2;
  const sprintLengthMs = sprintLengthWeeks * 7 * 24 * 60 * 60 * 1000;
  if (Number.isNaN(sprintStart.getTime()) || !Number.isFinite(sprintLengthMs) || sprintLengthMs <= 0) {
    return null;
  }

  const firstIndex = Math.floor((start.getTime() - sprintStart.getTime()) / sprintLengthMs);
  const lastIndex = Math.floor((end.getTime() - sprintStart.getTime()) / sprintLengthMs);
  return Math.max(1, lastIndex - firstIndex + 1);
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
    leadTime: trend(getFlowPresentationValue(current.flowTiming, "lead")?.avgDays ?? null, previous ? getFlowPresentationValue(previous.flowTiming, "lead")?.avgDays ?? null : null, "down"),
    activeTime: trend(getFlowPresentationValue(current.flowTiming, "cycle")?.avgDays ?? null, previous ? getFlowPresentationValue(previous.flowTiming, "cycle")?.avgDays ?? null : null, "down"),
    flowCycleTime: trend(getFlowPresentationValue(current.flowTiming, "implementation")?.avgDays ?? null, previous ? getFlowPresentationValue(previous.flowTiming, "implementation")?.avgDays ?? null : null, "down"),
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
      ? createMetricHealth("good", "Low share of old open tickets.")
      : snapshot.wipRisk.over30Pct <= 40
        ? createMetricHealth("warn", "Old open tickets are rising; monitor flow blockage.")
        : createMetricHealth("bad", "High share of open tickets are old; flow needs intervention.");

  const sleRisk =
    snapshot.sleRisk.atRiskPct === null
      ? snapshot.sleRisk.thresholdDays === null
        ? createMetricHealth("neutral", "Need completed work history to calculate SLE P85 threshold.")
        : createMetricHealth("neutral", "No open tickets to compare against SLE P85.")
      : snapshot.sleRisk.atRiskPct <= 10
        ? createMetricHealth("good", "Low share of open tickets older than SLE P85.")
        : snapshot.sleRisk.atRiskPct <= 25
          ? createMetricHealth("warn", "Some open tickets are older than SLE P85.")
          : createMetricHealth("bad", "High share of open tickets are already past SLE P85.");

  const staleWip =
    snapshot.staleWip.stalePct === null
      ? createMetricHealth("neutral", "No open tickets to evaluate for stale updates.")
      : snapshot.staleWip.stalePct <= 10
        ? createMetricHealth("good", "Low share of open tickets without recent updates.")
        : snapshot.staleWip.stalePct <= 25
          ? createMetricHealth("warn", "Some open tickets have not moved recently.")
          : createMetricHealth("bad", "High share of open tickets have not been updated recently.");

  const dominantWorkType = snapshot.workMix.topTypes[0] ?? null;
  const workMix =
    dominantWorkType === null
      ? createMetricHealth("neutral", "No delivered work in selected period.")
      : dominantWorkType.percentage <= 65
        ? createMetricHealth("good", "Delivered work mix is not dominated by one issue type.")
        : dominantWorkType.percentage <= 80
          ? createMetricHealth("warn", `${dominantWorkType.issueType} dominates delivered work mix.`)
          : createMetricHealth("bad", `Delivered work is heavily dominated by ${dominantWorkType.issueType}.`);

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
      : snapshot.flowEfficiency.valuePct >= 75
        ? createMetricHealth("good", "Flow signals are healthy.")
        : snapshot.flowEfficiency.valuePct >= 45
          ? createMetricHealth("warn", snapshot.flowEfficiency.limitingReason ?? "Flow has queue, WIP or freshness risk.")
          : createMetricHealth("bad", snapshot.flowEfficiency.limitingReason ?? "Flow has material queue, WIP or aging risk.");

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
    sleRisk,
    staleWip,
    workMix,
    leadTimeByType,
    flowEfficiency,
    queueTimeByStatus,
    bottleneckTrend,
    forecast,
  };
}

export function buildMetricDataIssues(
  snapshot: TeamHealthSnapshot,
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
    [
      ...(teamConfig?.excludedIssueKeys ?? []),
      ...(teamConfig?.issueExclusions ?? []).map((exclusion) => exclusion.issueKey),
    ]
      .map((value) => normalizeTextValue(value))
      .filter((value) => value.length > 0),
  );
  const includedIssues = issues.filter((issue) =>
    [issue.issueKey, ...(issue.previousIssueKeys ?? [])].every(
      (issueKey) => !excludedIssueKeys.has(normalizeTextValue(issueKey)),
    ),
  );

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

  const effectiveTeamConfig: TeamConfig = teamConfig ?? {
    teamName: "Team",
    doneConfig: { useStatusCategoryDone: true, doneStatuses: ["Done", "Closed", "Resolved"] },
    sleConfig: { percentiles: [50, 70, 85, 95], rounding: "ceil" },
    mapping: {
      key: "Issue key",
      created: "Created",
      resolutionDate: "Resolved",
      updated: "Updated",
      status: "Status",
      resolution: "Resolution",
    },
  };
  const isDoneByStatus = (issue: ParsedIssue): boolean => isDone(issue, effectiveTeamConfig);

  const doneIssues = includedIssues.filter((issue) => isDoneByStatus(issue));
  const openIssues = includedIssues.filter((issue) => !isDoneByStatus(issue) && !isCancelledIssue(issue));
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

  const movedIssues = includedIssues.filter(
    (issue) => (issue.previousIssueKeys?.length ?? 0) > 0 || Boolean(issue.projectEnteredAt),
  );
  if (movedIssues.length > 0) {
    entries.push({
      id: "source:moved-issues",
      category: "source",
      tone: "info",
      title: "Moved Jira issues accounted for",
      message: `${movedIssues.length} ticket(s) use their project-entry date and key aliases in flow metrics.`,
      sampleIssueKeys: buildIssueKeySamples(movedIssues),
    });
  }

  if (excludedIssueKeys.size > 0) {
    entries.push({
      id: "source:excluded-issues",
      category: "source",
      tone: "info",
      title: "Recorded data exclusions",
      message: `${excludedIssueKeys.size} ticket(s) are excluded from metrics. Review the recorded reasons periodically.`,
      sampleIssueKeys: Array.from(excludedIssueKeys).slice(0, 3),
    });
  }

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
      `${doneMissingCreated.length} done ticket(s) have no Created date. Date-based Cycle Time fallback and aging cannot use those rows; Time in Status flow values remain available when present.`,
      doneMissingCreated,
      resolveDataMonitorTone(doneMissingCreated.length, doneIssues.length, 0.2),
    );
  }

  const openMissingCreated = openIssues.filter((issue) => issue.created === null);
  if (openMissingCreated.length > 0) {
    pushFieldEntry(
      "source:open-missing-created",
      "Created missing on open items",
      `Open ticket age excludes ${openMissingCreated.length} open ticket(s) because Created is empty.`,
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
  const missingSprint = usesSprintCadence(teamConfig)
    ? [...doneIssues, ...sprintManagedOpenIssues].filter((issue) => normalizeTextValue(issue.sprintRaw).length === 0)
    : [];
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

function formatDays(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return `${value.toFixed(1)} days`;
}

function formatWorkingDays(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return `${value.toFixed(1)} working days`;
}

function formatBasedOnTickets(count: number): string {
  return `Based on ${count} ${count === 1 ? "ticket" : "tickets"}`;
}

function formatSleRiskValue(snapshot: SleRiskSnapshot): string {
  if (snapshot.atRiskPct === null) {
    return "-";
  }

  return `${formatPercentValue(snapshot.atRiskPct)}% (${snapshot.atRiskCount})`;
}

function formatStaleWipValue(snapshot: StaleWipSnapshot): string {
  if (snapshot.stalePct === null) {
    return "-";
  }

  return `${formatPercentValue(snapshot.stalePct)}% (${snapshot.staleCount})`;
}

function formatWorkMixSummary(snapshot: WorkMixSnapshot): string {
  const top = snapshot.topTypes[0] ?? null;
  if (!top) {
    return "-";
  }

  return `${top.issueType} ${formatPercentValue(top.percentage)}%`;
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

function getIssueStartDate(issue: ParsedIssue): Date | null {
  if (!issue.projectEnteredAt || !issue.created) {
    return issue.projectEnteredAt ?? issue.created;
  }

  return issue.projectEnteredAt.getTime() > issue.created.getTime() ? issue.projectEnteredAt : issue.created;
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildTeamProgressSnapshot(team: TeamRuntime, now: Date): TeamProgressSnapshot {
  const snapshot = computeSnapshot(team.metrics, "all", team.config, team.parsedIssues, now);
  const health = computeTeamHealthSnapshot(
    team.parsedIssues,
    team.config,
    "all",
    now,
    buildEffectiveBottleneckEntries(team),
    snapshot.sle.p85,
    buildOpenCycleTimeByIssueKey(team.metrics),
  );

  return {
    capturedAt: now.toISOString(),
    importSignature: buildTeamImportSignature(team),
    metrics: {
      doneCount: team.metrics ? snapshot.done : null,
      avgCycleTimeDays: getFlowPresentationValue(snapshot.flowTiming, "implementation")?.avgDays ?? null,
      sleP50Days: snapshot.sle.p50,
      sleP70Days: snapshot.sle.p70,
      sleP85Days: snapshot.sle.p85,
      sleP95Days: snapshot.sle.p95,
      multiSprintPct: team.metrics ? snapshot.multiSprintPct : null,
      velocityLatest: getLatestVelocityValue(team.metrics),
      doneBugRatioPct: health.bugRatio.doneBugRatio,
      openWipCount: health.agingWip.total,
      openWipAvgAgeDays: health.agingWip.avgDays,
      waitingTime: team.metrics?.waitingTime
        ? { ...team.metrics.waitingTime, semanticVersion: getWorkflowSemanticVersion(team.config) ?? undefined }
        : undefined,
      maintenanceLifecycle: team.metrics?.maintenanceLifecycle,
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
    compareProgressMetric("Avg Implementation Time", "down", "days", latest.metrics.avgCycleTimeDays, previous.metrics.avgCycleTimeDays),
    compareProgressMetric("SLE P85", "down", "days", latest.metrics.sleP85Days, previous.metrics.sleP85Days),
    compareProgressMetric("2+ Sprint %", "down", "percent", latest.metrics.multiSprintPct, previous.metrics.multiSprintPct),
    compareProgressMetric("Velocity (latest)", "up", "count", latest.metrics.velocityLatest, previous.metrics.velocityLatest),
    compareProgressMetric("Done Bug Ratio", "down", "percent", latest.metrics.doneBugRatioPct, previous.metrics.doneBugRatioPct),
    compareProgressMetric("Open ticket count", "down", "count", latest.metrics.openWipCount, previous.metrics.openWipCount),
    compareProgressMetric("Open ticket avg age", "down", "days", latest.metrics.openWipAvgAgeDays, previous.metrics.openWipAvgAgeDays),
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

function resolveBottleneckPeriod(period: string, availableMonths: string[], referenceDate: Date = new Date()): string {
  if (isMonthPeriod(period)) {
    return period;
  }

  const range = parseRangePeriod(period);
  if (range) {
    const rangeMonths = availableMonths
      .filter((month) => isMonthPeriod(month) && month >= range.startMonth && month <= range.endMonth)
      .sort((a, b) => a.localeCompare(b));
    return rangeMonths[rangeMonths.length - 1] ?? range.endMonth;
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

function buildBoardStatusMap(issues: ParsedIssue[], config?: TeamConfig): Map<string, string> {
  const statuses = new Map<string, string>();
  validatedWorkflowStatusOrder(config).forEach((status) => addBoardStatus(status, statuses));

  issues.forEach((issue) => {
    addBoardStatus(issue.status, statuses);
  });

  return statuses;
}

function addBoardStatus(statusName: string | undefined, statuses: Map<string, string>): void {
  const label = (statusName ?? "").trim();
  const key = normalizeTextValue(label);
  if (!key || statuses.has(key) || isCancelledLikeStatusName(label)) {
    return;
  }

  statuses.set(key, label);
}

function isCancelledLikeStatusName(statusName: string): boolean {
  const normalized = normalizeTextValue(statusName);
  return ["cancel", "abandon", "won't do", "wont do", "reject", "declin", "duplicate", "obsolete"].some((hint) =>
    normalized.includes(hint),
  );
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

  if (isValueAddingFlowStatus(statusName)) {
    return "active";
  }

  const queueHints = [
    "backlog",
    "funnel",
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
    "preparation",
    "release",
    "analysis",
    "analysing",
    "refinement",
    "refined",
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

function getTimeInStatusTone(statusName: string, avgDays: number | null, category: TimeInStatusStatusCategory): HealthTone {
  if (avgDays === null || !Number.isFinite(avgDays) || avgDays <= 0) {
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

function getTimeInStatusSignal(category: TimeInStatusStatusCategory, tone: HealthTone, hasData = true): string {
  if (!hasData) {
    return "No Time in Status data for this status in the selected month.";
  }

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
  teamConfig?: TeamConfig,
): TimeInStatusStatusRow[] {
  const columns = (entry?.columns ?? [])
    .filter((column) => {
      if (!Number.isFinite(column.avgDays) || column.avgDays <= 0) {
        return false;
      }

      const key = normalizeTextValue(column.name);
      return Boolean(key) && !isCancelledLikeStatusName(column.name);
    })
    .map((column) => {
      const key = normalizeTextValue(column.name);
      return {
        ...column,
        name: boardStatuses.get(key) ?? column.name,
      };
    });
  const columnsByKey = new Map(columns.map((column) => [normalizeTextValue(column.name), column]));
  const seen = new Set<string>();
  const statusNames: string[] = [];
  const workflowStatusOrder = buildWorkflowStatusOrder(teamConfig);
  const shouldSortByWorkflow = workflowStatusOrder.length > 0;

  const addStatus = (name: string): void => {
    const key = normalizeTextValue(name);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    statusNames.push(name);
  };

  workflowStatusOrder.forEach(addStatus);
  columns.forEach((column) => addStatus(column.name));
  boardStatuses.forEach((name) => addStatus(name));

  const rows = statusNames.map((statusName, index) => {
    const column = columnsByKey.get(normalizeTextValue(statusName));
    const avgDays = column?.avgDays ?? null;
    const category = getTimeInStatusStatusCategory(statusName);
    const flowRole = getTimeInStatusFlowRole(statusName, teamConfig);
    const tone = getTimeInStatusTone(statusName, avgDays, category);
    return {
      name: statusName,
      avgDays,
      category,
      flowRole,
      categoryLabel: getTimeInStatusCategoryLabel(category),
      tone,
      highlight: false,
      signal: getTimeInStatusSignal(category, tone, avgDays !== null),
      sortIndex: index,
    };
  });

  if (shouldSortByWorkflow) {
    rows.sort((a, b) => {
      const roleDiff = getTimeInStatusFlowRoleOrder(a.flowRole) - getTimeInStatusFlowRoleOrder(b.flowRole);
      if (roleDiff !== 0) {
        return roleDiff;
      }

      return a.sortIndex - b.sortIndex;
    });
  }

  const highlighted = new Set(
    rows
      .filter((row) => row.tone === "warn" || row.tone === "bad")
      .slice(0, 3)
      .map((row) => normalizeTextValue(row.name)),
  );

  return rows.map(({ sortIndex: _sortIndex, ...row }) => ({
    ...row,
    highlight: highlighted.has(normalizeTextValue(row.name)),
  }));
}

function buildWorkflowStatusOrder(teamConfig: TeamConfig | undefined): string[] {
  if (!teamConfig?.workflowConfig) {
    return [];
  }

  const mapping = adaptLegacyWorkflowConfig(teamConfig);
  if (mapping.state !== "complete") {
    return [];
  }

  return sortWorkflowStatusLabels(validatedWorkflowStatusOrder(teamConfig));
}

function sortWorkflowStatusLabels(values: string[]): string[] {
  return values
    .map((value, index) => ({ value, index, rank: getWorkflowBoardOrderRank(value) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index || left.value.localeCompare(right.value))
    .map((item) => item.value);
}

function getWorkflowBoardOrderRank(statusName: string): number {
  const normalized = normalizeTextValue(statusName);
  if (!normalized) {
    return 900;
  }

  if (normalized.includes("backlog")) return 0;
  if (normalized.includes("open")) return 10;
  if (normalized === "new") return 20;
  if (normalized.includes("planning")) return 30;
  if (normalized.includes("analysis")) return 40;
  if (normalized.includes("investigation")) return 45;
  if (normalized.includes("ready for refinement")) return 50;
  if (normalized.includes("refinement")) return 60;
  if (normalized === "to do" || normalized === "todo") return 70;
  if (normalized.includes("hold") || normalized.includes("blocked")) return 75;
  if (normalized.includes("development") || normalized.includes("in progress")) return 80;
  if (normalized.includes("code review") || normalized.includes("review")) return 90;
  if (normalized.includes("ready for testing")) return 100;
  if (normalized.includes("business acceptance") || normalized.includes("bat")) return 120;
  if (normalized.includes("preparation for production")) return 130;
  if (normalized.includes("release")) return 140;
  if (normalized.includes("testing") || normalized.includes("test")) return 110;
  if (normalized.includes("done") || normalized.includes("closed") || normalized.includes("resolved")) return 1000;

  return 500;
}

function getTimeInStatusFlowRole(statusName: string, teamConfig: TeamConfig | undefined): TimeInStatusFlowRole {
  const mapping = adaptLegacyWorkflowConfig(teamConfig);
  const hasWorkflowConfig = hasExplicitWorkflowStatusConfiguration(teamConfig);

  if (hasWorkflowConfig && mapping.state !== "complete") {
    return "other";
  }
  if (mapping.state === "complete") {
    const role = classifyWorkflowStatusForReport(statusName, teamConfig);
    if (role === "backlog") return "backlog";
    if (role === "done") return "done";
    if (role === "implementation") return "implementation";
    if (role === "cycle") return "active";
    if (role === "lead") return "funnel";
  }

  if (!hasWorkflowConfig) {
    const normalized = normalizeTextValue(statusName);
    if (["backlog", "open"].some((hint) => normalized.includes(hint))) {
      return "backlog";
    }
    if (["to do", "todo", "funnel", "refinement", "analysis", "ready"].some((hint) => normalized.includes(hint))) {
      return "funnel";
    }
    if (isValueAddingFlowStatus(statusName)) {
      return "implementation";
    }
  }

  return "other";
}

function getTimeInStatusFlowRoleOrder(role: TimeInStatusFlowRole): number {
  if (role === "backlog") {
    return 0;
  }
  if (role === "funnel") {
    return 1;
  }
  if (role === "active") {
    return 2;
  }
  if (role === "implementation") {
    return 3;
  }
  if (role === "done") {
    return 4;
  }
  return 5;
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

  const statusFilter = buildBottleneckCandidateStatusFilter(team);
  const byPeriod = new Map<string, BottleneckEntry>();
  team.autoBottleneck.forEach((entry) => {
    const filtered = filterBottleneckEntryForTeam(entry, statusFilter);
    if (filtered) {
      byPeriod.set(filtered.period, filtered);
    }
  });
  team.manualBottleneck.forEach((entry) => {
    const filtered = filterBottleneckEntryForTeam(entry, statusFilter);
    if (filtered) {
      byPeriod.set(filtered.period, filtered);
    }
  });

  return Array.from(byPeriod.values()).sort((a, b) => a.period.localeCompare(b.period));
}

interface BottleneckStatusFilter {
  candidateStatusMap: Map<string, string>;
  hasConfiguredStatuses: boolean;
}

function buildBottleneckCandidateStatusFilter(team: TeamRuntime): BottleneckStatusFilter {
  const workflowMapping = adaptLegacyWorkflowConfig(team.config);
  const explicitFlowStatuses = normalizeFlowStatuses(team.config.bottleneckConfig?.flowStatuses ?? []);
  const configuredStatuses =
    explicitFlowStatuses.length > 0
      ? explicitFlowStatuses
      : normalizeFlowStatuses(workflowMapping.state === "complete" ? workflowMapping.cycleStatuses ?? [] : []);

  if (configuredStatuses.length > 0) {
    return {
      candidateStatusMap: new Map(configuredStatuses.map((status) => [normalizeTextValue(status), status])),
      hasConfiguredStatuses: true,
    };
  }

  const excludedStatuses = new Set(
    normalizeFlowStatuses([
      ...(workflowMapping.state === "complete" ? workflowMapping.doneStatuses ?? [] : []),
      ...getWorkflowCompatibilityBuckets(team.config).excludedStatuses,
    ]).map((status) => normalizeTextValue(status)),
  );
  const candidateMap = new Map<string, string>();

  buildBoardStatusMap(team.parsedIssues).forEach((statusName, statusKey) => {
    if (excludedStatuses.has(statusKey) || isDefaultNonFlowStatus(statusName)) {
      return;
    }

    candidateMap.set(statusKey, statusName);
  });

  return {
    candidateStatusMap: candidateMap,
    hasConfiguredStatuses: false,
  };
}

function filterBottleneckEntryForTeam(
  entry: BottleneckEntry,
  statusFilter: BottleneckStatusFilter,
): BottleneckEntry | null {
  const { candidateStatusMap, hasConfiguredStatuses } = statusFilter;
  const columns = entry.columns
    .filter((column) => {
      if (!Number.isFinite(column.avgDays) || column.avgDays <= 0) {
        return false;
      }

      const statusKey = normalizeTextValue(column.name);
      if (!statusKey) {
        return false;
      }

      if (hasConfiguredStatuses ? isTerminalOrCancelledStatus(column.name) : isDefaultNonFlowStatus(column.name)) {
        return false;
      }

      return candidateStatusMap.size === 0 || candidateStatusMap.has(statusKey);
    })
    .map((column) => {
      const statusKey = normalizeTextValue(column.name);
      return {
        ...column,
        name: candidateStatusMap.get(statusKey) ?? column.name,
      };
    });

  if (columns.length === 0) {
    return null;
  }

  return {
    ...entry,
    columns,
  };
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
  sleThresholdDays: number | null = null,
  openCycleTimeByIssueKey: ReadonlyMap<string, number> = new Map<string, number>(),
): TeamHealthSnapshot {
  const excludedIssueKeys = new Set(
    (teamConfig?.excludedIssueKeys ?? [])
      .map((value) => normalizeTextValue(value))
      .filter((value) => value.length > 0),
  );
  const includedIssues = issues.filter((issue) =>
    [issue.issueKey, ...(issue.previousIssueKeys ?? [])].every(
      (issueKey) => !excludedIssueKeys.has(normalizeTextValue(issueKey)),
    ),
  );
  const effectiveTeamConfig: TeamConfig = teamConfig ?? {
    teamName: "Team",
    doneConfig: { useStatusCategoryDone: true, doneStatuses: ["Done", "Closed", "Resolved"] },
    sleConfig: { percentiles: [50, 70, 85, 95], rounding: "ceil" },
    mapping: {
      key: "Issue key",
      created: "Created",
      resolutionDate: "Resolved",
      updated: "Updated",
      status: "Status",
      resolution: "Resolution",
    },
  };

  const bugSet = new Set(
    (teamConfig?.bugConfig?.issueTypes ?? ["Bug"])
      .map((value) => normalizeTextValue(value))
      .filter((value) => value.length > 0),
  );

  const isDoneByStatus = (issue: ParsedIssue): boolean => isDone(issue, effectiveTeamConfig);

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
  const createdWithDate = includedIssues.filter((issue) => getIssueStartDate(issue) !== null);

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
      const startDate = getIssueStartDate(issue);
      return startDate !== null && startDate.getTime() >= monthStart.getTime() && startDate.getTime() <= anchorMs;
    }).length,
    throughputThisMonth: throughput.thisMonth,
    intakeLast30Days: createdWithDate.filter((issue) => {
      const startDate = getIssueStartDate(issue);
      return startDate !== null && startDate.getTime() >= last30Start.getTime() && startDate.getTime() <= anchorMs;
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

    const startDate = getIssueStartDate(issue);
    if (startDate) {
      return isIsoDateInPeriod(startDate.toISOString(), selectedPeriod, now);
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
    return !isDoneByStatus(issue) && !isCancelledIssue(issue);
  });
  const wipBugCount = wipIssues.filter((issue) => isBug(issue)).length;

  const todayStart = startOfDay(now).getTime();
  const wipAgingItems: AgingWipItem[] = wipIssues
    .filter((issue) => getIssueStartDate(issue) !== null)
    .map((issue) => {
      const createdDate = getIssueStartDate(issue) as Date;
      const ageMs = todayStart - startOfDay(createdDate).getTime();
      const agingDays = Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)));
      return {
        issueKey: issue.issueKey,
        status: issue.status,
        issueType: issue.issueType,
        created: createdDate.toISOString(),
        agingDays,
        workingAgeDays: workingDaysBetween(startOfDay(createdDate), startOfDay(now)),
        cycleTimeWorkingDays:
          [issue.issueKey, ...(issue.previousIssueKeys ?? [])]
            .map((issueKey) => openCycleTimeByIssueKey.get(normalizeTextValue(issueKey)))
            .find((value): value is number => value !== undefined && Number.isFinite(value) && value >= 0) ?? null,
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
  const sleRisk = buildSleRiskSnapshot(doneWithDeliveryDate, wipAgingItems, teamConfig, sleThresholdDays);
  const staleWip = buildStaleWipSnapshot(wipIssues, todayStart);
  const workMix = buildWorkMixSnapshot(doneInPeriod);
  const wipRiskHeatmap = buildWipRiskHeatmapSnapshot(wipAgingItems);
  const selectedBottleneckEntry = resolveBottleneckEntryForPeriod(bottleneckEntries, selectedPeriod);
  const flowEfficiency = buildFlowEfficiencySnapshot(
    selectedBottleneckEntry,
    selectedPeriod,
    teamConfig,
    wipAgingItems,
    staleWip,
    throughputStability.weeklyAvg,
  );
  const queueTime = buildQueueTimeSnapshot(
    selectedBottleneckEntry,
    selectedPeriod,
    buildBoardStatusMap(includedIssues),
    teamConfig,
  );
  const bottleneckTrend = buildBottleneckTrendSnapshot(bottleneckEntries);
  const forecast = buildForecastSnapshot(doneWithDeliveryDate, wipIssues, teamConfig, now);

  return {
    throughput,
    intakeThroughput,
    netFlow,
    throughputStability,
    wipRisk,
    sleRisk,
    staleWip,
    workMix,
    wipRiskHeatmap,
    flowEfficiency,
    queueTime,
    bottleneckTrend,
    forecast,
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
    weeklyRecentCounts: weeklyCounts,
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

function buildSleRiskSnapshot(
  doneWithDeliveryDate: ParsedIssue[],
  wipAgingItems: AgingWipItem[],
  teamConfig: TeamConfig | undefined,
  sleThresholdDays: number | null,
): SleRiskSnapshot {
  const observedIssueTypes = doneWithDeliveryDate.map((issue) => issue.issueType);
  const sleIssueTypes = new Set(
    resolveEffectiveSleIssueTypes(teamConfig?.sleConfig.issueTypes, observedIssueTypes).map(normalizeTextValue),
  );
  const eligibleWipItems = wipAgingItems.filter((item) => sleIssueTypes.has(normalizeTextValue(item.issueType)));
  const cycleTimes = doneWithDeliveryDate
    .filter((issue) => getIssueStartDate(issue) && getIssueDeliveryDate(issue))
    .filter((issue) => sleIssueTypes.has(normalizeTextValue(issue.issueType)))
    .map((issue) => {
      const deliveryDate = getIssueDeliveryDate(issue) as Date;
      const startDate = getIssueStartDate(issue) as Date;
      return workingDaysBetween(startDate, deliveryDate);
    })
    .filter((value) => Number.isFinite(value) && value >= 0);
  const thresholdDays = sleThresholdDays ?? buildSleValues(cycleTimes, "ceil").p85;

  if (thresholdDays === null || eligibleWipItems.length === 0) {
    return {
      thresholdDays,
      atRiskCount: 0,
      totalWip: eligibleWipItems.length,
      atRiskPct: eligibleWipItems.length === 0 ? null : 0,
    };
  }

  const atRiskCount = eligibleWipItems.filter(
    (item) => (item.cycleTimeWorkingDays ?? item.workingAgeDays) > thresholdDays,
  ).length;
  return {
    thresholdDays,
    atRiskCount,
    totalWip: eligibleWipItems.length,
    atRiskPct: (atRiskCount / eligibleWipItems.length) * 100,
  };
}

function buildStaleWipSnapshot(wipIssues: ParsedIssue[], todayStartMs: number): StaleWipSnapshot {
  const thresholdDays = 14;
  const staleCount = wipIssues.filter((issue) => {
    const activityDate = issue.updated ?? getIssueStartDate(issue);
    if (!activityDate) {
      return true;
    }

    const ageDays = Math.max(0, Math.floor((todayStartMs - startOfDay(activityDate).getTime()) / (24 * 60 * 60 * 1000)));
    return ageDays > thresholdDays;
  }).length;

  return {
    thresholdDays,
    staleCount,
    totalWip: wipIssues.length,
    stalePct: wipIssues.length === 0 ? null : (staleCount / wipIssues.length) * 100,
  };
}

function buildWorkMixSnapshot(doneInPeriod: ParsedIssue[]): WorkMixSnapshot {
  const counts = new Map<string, { issueType: string; count: number }>();
  doneInPeriod.forEach((issue) => {
    const issueType = issue.issueType.trim() || "Unknown";
    const key = normalizeTextValue(issueType) || "unknown";
    const current = counts.get(key) ?? { issueType, count: 0 };
    current.count += 1;
    counts.set(key, current);
  });

  const totalDone = doneInPeriod.length;
  const topTypes = Array.from(counts.values())
    .map((item) => ({
      issueType: item.issueType,
      count: item.count,
      percentage: totalDone === 0 ? 0 : (item.count / totalDone) * 100,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.issueType.localeCompare(right.issueType);
    });

  return {
    totalDone,
    topTypes,
  };
}

function buildLeadTimeByTypeSnapshot(doneInPeriod: ParsedIssue[]): LeadTimeByTypeSnapshot[] {
  const grouped = new Map<string, { issueType: string; doneCount: number; totalDays: number }>();

  doneInPeriod.forEach((issue) => {
    const startDate = getIssueStartDate(issue);
    if (!startDate || !issue.resolutionDate) {
      return;
    }

    const cycleDays = (issue.resolutionDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000);
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
    .sort((a, b) => b.avgDays - a.avgDays || b.doneCount - a.doneCount)
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

  if (isRangePeriod(selectedPeriod)) {
    const aggregated = aggregateTimeInStatusEntriesForPeriod(entries, selectedPeriod, new Date());
    if (aggregated) {
      return aggregated;
    }
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

function resolveTimeInStatusEntryForPeriod(
  entries: BottleneckEntry[],
  selectedPeriod: string,
  referenceDate: Date,
): BottleneckEntry | null {
  if (entries.length === 0) {
    return null;
  }

  if (isAggregateTimeInStatusPeriod(selectedPeriod)) {
    return aggregateTimeInStatusEntriesForPeriod(entries, selectedPeriod, referenceDate);
  }

  return resolveBottleneckEntryForPeriod(entries, selectedPeriod);
}

function isAggregateTimeInStatusPeriod(period: string): boolean {
  return (
    period === "all" ||
    period === "ytd" ||
    period === "ytd-prev" ||
    period === "last-24m" ||
    period === "last-24m-prev" ||
    isRangePeriod(period)
  );
}

export function aggregateTimeInStatusEntriesForPeriod(
  entries: BottleneckEntry[],
  selectedPeriod: string,
  referenceDate: Date,
): BottleneckEntry | null {
  const matchingEntries = entries
    .filter((entry) => isMonthPeriod(entry.period) && isIsoDateInPeriod(`${entry.period}-01`, selectedPeriod, referenceDate))
    .sort((a, b) => a.period.localeCompare(b.period));

  if (matchingEntries.length === 0) {
    return null;
  }

  const byStatus = new Map<string, { name: string; weightedDays: number; sampleCount: number }>();
  matchingEntries.forEach((entry) => {
    entry.columns.forEach((column) => {
      const key = normalizeTextValue(column.name);
      if (!key || !Number.isFinite(column.avgDays) || column.avgDays < 0) {
        return;
      }

      const sampleCount = column.sampleCount && column.sampleCount > 0 ? column.sampleCount : 1;
      const current = byStatus.get(key) ?? { name: column.name, weightedDays: 0, sampleCount: 0 };
      current.weightedDays += column.avgDays * sampleCount;
      current.sampleCount += sampleCount;
      byStatus.set(key, current);
    });
  });

  const columns = Array.from(byStatus.values())
    .map((value) => ({
      name: value.name,
      avgDays: value.sampleCount > 0 ? value.weightedDays / value.sampleCount : 0,
      sampleCount: value.sampleCount,
    }))
    .filter((column) => Number.isFinite(column.avgDays) && column.avgDays >= 0);

  return columns.length > 0 ? { period: selectedPeriod, columns } : null;
}

function buildFlowEfficiencySnapshot(
  entry: BottleneckEntry | null,
  selectedPeriod: string,
  teamConfig: TeamConfig | undefined,
  wipAgingItems: AgingWipItem[],
  staleWip: StaleWipSnapshot,
  weeklyThroughputAvg: number | null,
): FlowEfficiencySnapshot {
  const period = entry?.period ?? (isMonthPeriod(selectedPeriod) ? selectedPeriod : "latest");
  const currentWipByStatus = buildCurrentWipByStatus(wipAgingItems);
  if (!entry || entry.columns.length === 0) {
    return {
      period,
      activeDays: 0,
      queueDays: 0,
      totalDays: 0,
      activeSharePct: null,
      valuePct: null,
      queueHealthPct: null,
      ageHealthPct: buildAgeHealthScore(wipAgingItems),
      freshnessHealthPct: buildFreshnessHealthScore(staleWip),
      wipHealthPct: buildWipHealthScore(currentWipByStatus, weeklyThroughputAvg),
      currentWipTotal: wipAgingItems.length,
      currentWipByStatus,
      limitingReason: "Time in Status data is missing for the selected period.",
    };
  }

  let activeDays = 0;
  let queueDays = 0;
  const queueColumns: BottleneckEntry["columns"] = [];
  const workflowMapping = adaptLegacyWorkflowConfig(teamConfig);
  const implementingStatuses = new Set((workflowMapping.implementationStatuses ?? []).map(normalizeTextValue));
  const configuredFlowStatuses = new Set(
    [
      ...(teamConfig?.bottleneckConfig?.flowStatuses ?? []),
      ...(workflowMapping.leadStatuses ?? []),
    ].map(normalizeTextValue),
  );

  entry.columns.forEach((column) => {
    if (!Number.isFinite(column.avgDays) || column.avgDays <= 0) {
      return;
    }

    const statusKey = normalizeTextValue(column.name);
    if (configuredFlowStatuses.size > 0 && !configuredFlowStatuses.has(statusKey)) {
      return;
    }

    const active = implementingStatuses.has(statusKey) || isValueAddingFlowStatus(column.name);
    if (active) {
      activeDays += column.avgDays;
    } else {
      queueDays += column.avgDays;
      queueColumns.push(column);
    }
  });

  const totalDays = activeDays + queueDays;
  const activeSharePct = totalDays <= 0 ? null : (activeDays / totalDays) * 100;
  const queueHealthPct = buildQueueHealthScore(queueColumns, totalDays);
  const ageHealthPct = buildAgeHealthScore(wipAgingItems);
  const freshnessHealthPct = buildFreshnessHealthScore(staleWip);
  const wipHealthPct = buildWipHealthScore(currentWipByStatus, weeklyThroughputAvg);
  const valuePct =
    activeSharePct === null
      ? null
      : applyFlowEfficiencyCaps(
          weightedAverage([
            { value: activeSharePct, weight: 0.25 },
            { value: queueHealthPct, weight: 0.4 },
            { value: ageHealthPct, weight: 0.15 },
            { value: freshnessHealthPct, weight: 0.1 },
            { value: wipHealthPct, weight: 0.1 },
          ]),
          {
            activeSharePct,
            queueColumns,
            wipAgingItems,
            staleWip,
            currentWipByStatus,
          },
        );

  return {
    period,
    activeDays,
    queueDays,
    totalDays,
    activeSharePct,
    valuePct,
    queueHealthPct,
    ageHealthPct,
    freshnessHealthPct,
    wipHealthPct,
    currentWipTotal: wipAgingItems.length,
    currentWipByStatus,
    limitingReason: buildFlowEfficiencyLimitingReason({
      activeSharePct,
      queueColumns,
      wipAgingItems,
      staleWip,
      currentWipByStatus,
    }),
  };
}

function buildQueueHealthScore(queueColumns: BottleneckEntry["columns"], totalDays: number): number {
  if (queueColumns.length === 0) {
    return totalDays > 0 ? 70 : 100;
  }

  const weighted = queueColumns.reduce(
    (acc, column) => {
      const score = scoreQueueDays(column.avgDays);
      const weight = Math.max(column.avgDays, 0.1);
      return {
        score: acc.score + score * weight,
        weight: acc.weight + weight,
      };
    },
    { score: 0, weight: 0 },
  );

  return weighted.weight > 0 ? weighted.score / weighted.weight : 100;
}

function scoreQueueDays(avgDays: number): number {
  if (!Number.isFinite(avgDays) || avgDays <= 0) {
    return 100;
  }

  if (avgDays <= 4) {
    return 100;
  }

  if (avgDays <= 8) {
    return interpolateScore(avgDays, 4, 8, 100, 70);
  }

  if (avgDays <= 20) {
    return interpolateScore(avgDays, 8, 20, 70, 30);
  }

  if (avgDays <= 40) {
    return interpolateScore(avgDays, 20, 40, 30, 10);
  }

  return 0;
}

function buildAgeHealthScore(wipAgingItems: AgingWipItem[]): number {
  if (wipAgingItems.length === 0) {
    return 100;
  }

  const avgAge =
    wipAgingItems.reduce((sum, item) => sum + item.workingAgeDays, 0) / wipAgingItems.length;
  const over30Pct = (wipAgingItems.filter((item) => item.workingAgeDays > 30).length / wipAgingItems.length) * 100;
  const over60Pct = (wipAgingItems.filter((item) => item.workingAgeDays > 60).length / wipAgingItems.length) * 100;
  const ageScore =
    avgAge <= 7
      ? 100
      : avgAge <= 14
        ? interpolateScore(avgAge, 7, 14, 100, 85)
        : avgAge <= 30
          ? interpolateScore(avgAge, 14, 30, 85, 60)
          : avgAge <= 60
            ? interpolateScore(avgAge, 30, 60, 60, 30)
            : interpolateScore(Math.min(avgAge, 120), 60, 120, 30, 5);

  return clampScore(Math.min(ageScore, 100 - over30Pct * 0.8 - over60Pct * 0.8));
}

function buildFreshnessHealthScore(staleWip: StaleWipSnapshot): number {
  if (staleWip.stalePct === null) {
    return 100;
  }

  if (staleWip.stalePct <= 10) {
    return 100;
  }

  if (staleWip.stalePct <= 25) {
    return interpolateScore(staleWip.stalePct, 10, 25, 100, 75);
  }

  if (staleWip.stalePct <= 50) {
    return interpolateScore(staleWip.stalePct, 25, 50, 75, 40);
  }

  return interpolateScore(Math.min(staleWip.stalePct, 100), 50, 100, 40, 10);
}

function buildWipHealthScore(currentWipByStatus: WipByStatusSnapshot[], weeklyThroughputAvg: number | null): number {
  const totalWip = currentWipByStatus.reduce((sum, item) => sum + item.count, 0);
  if (totalWip === 0) {
    return 100;
  }

  const maxColumnWip = currentWipByStatus.reduce((max, item) => Math.max(max, item.count), 0);
  const columnScore =
    maxColumnWip <= 2
      ? 100
      : maxColumnWip <= 4
        ? interpolateScore(maxColumnWip, 2, 4, 100, 85)
        : maxColumnWip <= 7
          ? interpolateScore(maxColumnWip, 4, 7, 85, 60)
          : interpolateScore(Math.min(maxColumnWip, 15), 7, 15, 60, 25);

  if (weeklyThroughputAvg === null || weeklyThroughputAvg <= 0) {
    return clampScore(totalWip <= 3 ? columnScore : Math.min(columnScore, 55));
  }

  const inventoryWeeks = totalWip / weeklyThroughputAvg;
  const systemScore =
    inventoryWeeks <= 1.5
      ? 100
      : inventoryWeeks <= 3
        ? interpolateScore(inventoryWeeks, 1.5, 3, 100, 80)
        : inventoryWeeks <= 6
          ? interpolateScore(inventoryWeeks, 3, 6, 80, 50)
          : interpolateScore(Math.min(inventoryWeeks, 12), 6, 12, 50, 20);

  return clampScore(Math.min(columnScore, systemScore));
}

function buildCurrentWipByStatus(wipAgingItems: AgingWipItem[]): WipByStatusSnapshot[] {
  const byStatus = new Map<string, { status: string; count: number; ageSum: number }>();

  wipAgingItems.forEach((item) => {
    const status = item.status.trim() || "Unknown";
    const key = normalizeTextValue(status);
    const current = byStatus.get(key) ?? { status, count: 0, ageSum: 0 };
    current.count += 1;
    current.ageSum += item.workingAgeDays;
    byStatus.set(key, current);
  });

  return Array.from(byStatus.values())
    .map((item) => ({
      status: item.status,
      count: item.count,
      avgAgeDays: item.count > 0 ? item.ageSum / item.count : null,
    }))
    .sort((a, b) => b.count - a.count || (b.avgAgeDays ?? 0) - (a.avgAgeDays ?? 0) || a.status.localeCompare(b.status));
}

function applyFlowEfficiencyCaps(
  score: number | null,
  context: {
    activeSharePct: number | null;
    queueColumns: BottleneckEntry["columns"];
    wipAgingItems: AgingWipItem[];
    staleWip: StaleWipSnapshot;
    currentWipByStatus: WipByStatusSnapshot[];
  },
): number | null {
  if (score === null) {
    return null;
  }

  let capped = score;
  const worstQueueDays = context.queueColumns.reduce((max, column) => Math.max(max, column.avgDays), 0);
  const over30Pct =
    context.wipAgingItems.length === 0
      ? 0
      : (context.wipAgingItems.filter((item) => item.workingAgeDays > 30).length / context.wipAgingItems.length) * 100;
  const maxColumnWip = context.currentWipByStatus.reduce((max, item) => Math.max(max, item.count), 0);

  if (context.queueColumns.length === 0 && (context.activeSharePct ?? 0) >= 90) {
    capped = Math.min(capped, 80);
  }
  if (worstQueueDays > 8) {
    capped = Math.min(capped, 65);
  }
  if (worstQueueDays > 20) {
    capped = Math.min(capped, 45);
  }
  if ((context.staleWip.stalePct ?? 0) > 50) {
    capped = Math.min(capped, 60);
  }
  if (over30Pct > 50) {
    capped = Math.min(capped, 55);
  }
  if (maxColumnWip >= 8) {
    capped = Math.min(capped, 70);
  }

  return clampScore(capped);
}

function buildFlowEfficiencyLimitingReason(context: {
  activeSharePct: number | null;
  queueColumns: BottleneckEntry["columns"];
  wipAgingItems: AgingWipItem[];
  staleWip: StaleWipSnapshot;
  currentWipByStatus: WipByStatusSnapshot[];
}): string | null {
  const worstQueue = context.queueColumns
    .slice()
    .sort((a, b) => b.avgDays - a.avgDays)[0];
  if (worstQueue && worstQueue.avgDays > 20) {
    return `${worstQueue.name} queue is severely aged.`;
  }
  if (worstQueue && worstQueue.avgDays > 8) {
    return `${worstQueue.name} queue is above healthy range.`;
  }

  if (context.queueColumns.length === 0 && (context.activeSharePct ?? 0) >= 90) {
    return "No queue-stage duration is available, so near-perfect flow cannot be proven.";
  }

  const stalePct = context.staleWip.stalePct ?? 0;
  if (stalePct > 50) {
    return "Most open work has not been updated recently.";
  }

  const oldWipPct =
    context.wipAgingItems.length === 0
      ? 0
      : (context.wipAgingItems.filter((item) => item.workingAgeDays > 30).length / context.wipAgingItems.length) * 100;
  if (oldWipPct > 50) {
    return "Most open work is older than 30 working days.";
  }

  const busiestStatus = context.currentWipByStatus[0] ?? null;
  if (busiestStatus && busiestStatus.count >= 8) {
    return `${busiestStatus.status} has high current WIP.`;
  }

  return null;
}

function weightedAverage(values: Array<{ value: number | null; weight: number }>): number | null {
  let totalValue = 0;
  let totalWeight = 0;

  values.forEach((item) => {
    if (item.value === null || !Number.isFinite(item.value) || item.weight <= 0) {
      return;
    }

    totalValue += item.value * item.weight;
    totalWeight += item.weight;
  });

  return totalWeight > 0 ? totalValue / totalWeight : null;
}

function interpolateScore(value: number, minValue: number, maxValue: number, minScore: number, maxScore: number): number {
  if (maxValue <= minValue) {
    return clampScore(maxScore);
  }

  const ratio = Math.max(0, Math.min(1, (value - minValue) / (maxValue - minValue)));
  return clampScore(minScore + (maxScore - minScore) * ratio);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function buildQueueTimeSnapshot(
  entry: BottleneckEntry | null,
  selectedPeriod: string,
  boardStatuses: Map<string, string>,
  teamConfig: TeamConfig | undefined,
): QueueTimeSnapshot {
  const period = entry?.period ?? (isMonthPeriod(selectedPeriod) ? selectedPeriod : "latest");
  if (!entry || entry.columns.length === 0) {
    return { period, topStatuses: [] };
  }

  const topStatuses = entry.columns
    .filter((column) => Number.isFinite(column.avgDays) && column.avgDays > 0 && normalizeTextValue(column.name).length > 0)
    .map((column) => {
      const key = normalizeTextValue(column.name);
      return {
        ...column,
        name: boardStatuses.get(key) ?? column.name,
      };
    })
    .filter((column) => isQueueTimeStatus(column.name, teamConfig))
    .slice()
    .sort((a, b) => b.avgDays - a.avgDays)
    .slice(0, 3)
    .map((column) => ({
      status: column.name,
      avgDays: column.avgDays,
    }));

  return { period, topStatuses };
}

function isQueueTimeStatus(statusName: string, teamConfig: TeamConfig | undefined): boolean {
  const normalized = normalizeTextValue(statusName);
  if (!normalized || getTimeInStatusStatusCategory(statusName) === "done") {
    return false;
  }

  const workflowMapping = adaptLegacyWorkflowConfig(teamConfig);
  const implementingStatuses = new Set((workflowMapping.implementationStatuses ?? []).map(normalizeTextValue));
  if (implementingStatuses.has(normalized)) {
    return false;
  }

  return !isValueAddingFlowStatus(statusName);
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

function isValueAddingFlowStatus(statusName: string): boolean {
  const normalized = normalizeTextValue(statusName);
  if (!normalized) {
    return false;
  }

  const queueHints = [
    "backlog",
    "funnel",
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
    "preparation",
    "release",
    "analysis",
    "analysing",
    "refinement",
    "refined",
    "triage",
  ];
  if (queueHints.some((hint) => normalized.includes(hint))) {
    return false;
  }

  const valueAddingHints = [
    "in progress",
    "progress",
    "develop",
    "development",
    "dev",
    "code",
    "review",
    "qa",
    "test",
    "validation",
    "accept",
    "implementation",
    "implementing",
    "build",
  ];

  return valueAddingHints.some((hint) => normalized.includes(hint));
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
    const dateMonth = monthKey(date);

    if (period === "all") {
      return true;
    }

    if (period === "ytd") {
      return year === currentYear && month <= cutoffMonth;
    }

    if (period === "ytd-prev") {
      return year === currentYear - 1 && month <= cutoffMonth;
    }

    const range = parseRangePeriod(period);
    if (range) {
      return dateMonth >= range.startMonth && dateMonth <= range.endMonth;
    }

    if (period === "last-24m" || period === "last-24m-prev") {
      const window = getRollingMonthWindow(period, now, 24);
      return dateMonth >= window.startMonth && dateMonth <= window.endMonth;
    }

    return true;
  };

  issues.forEach((issue) => {
    const candidates = [getIssueStartDate(issue), issue.updated];

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

function isSprintDisciplineMetric(metricId: ConfigurableMetricId): boolean {
  return metricId === "sprint-work" || metricId === "sprint-predictability";
}

function usesSprintCadence(config: TeamConfig | null | undefined): boolean {
  if (!config) {
    return false;
  }

  if (config.velocityConfig) {
    return normalizeVelocityConfig(config.velocityConfig).mode === "sprint-story-points";
  }

  return (config.sprintScopeConfig?.statuses ?? []).length > 0;
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
  team?.config.workflowConfig?.funnelStatuses?.forEach(addStatus);
  team?.config.workflowConfig?.activeStatuses?.forEach(addStatus);
  team?.config.workflowConfig?.implementingStatuses?.forEach(addStatus);
  team?.config.sprintScopeConfig?.statuses?.forEach(addStatus);
  team?.config.bottleneckConfig?.flowStatuses?.forEach(addStatus);

  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

type WorkflowStatusRole = "backlog" | "funnel" | "active" | "implementing" | "done" | "other";

interface InferredWorkflowConfig {
  backlogStatuses: string[];
  funnelStatuses: string[];
  activeStatuses: string[];
  implementingStatuses: string[];
}

export function inferWorkflowConfig(
  issues: Pick<ParsedIssue, "status">[],
  doneStatuses: string[] = [],
): InferredWorkflowConfig {
  const roles: Record<Exclude<WorkflowStatusRole, "done" | "other">, Map<string, string>> = {
    backlog: new Map(),
    funnel: new Map(),
    active: new Map(),
    implementing: new Map(),
  };

  issues.forEach((issue) => {
    const status = issue.status.trim();
    const normalized = normalizeTextValue(status);
    if (!normalized) {
      return;
    }

    const role = inferWorkflowStatusRole(status, doneStatuses);
    if (role === "done" || role === "other") {
      return;
    }

    if (!roles[role].has(normalized)) {
      roles[role].set(normalized, status);
    }
  });

  return {
    backlogStatuses: sortWorkflowStatusLabels(Array.from(roles.backlog.values())),
    funnelStatuses: sortWorkflowStatusLabels(Array.from(roles.funnel.values())),
    activeStatuses: sortWorkflowStatusLabels(Array.from(roles.active.values())),
    implementingStatuses: sortWorkflowStatusLabels(Array.from(roles.implementing.values())),
  };
}

function inferWorkflowStatusRole(statusName: string, doneStatuses: string[]): WorkflowStatusRole {
  const normalized = normalizeTextValue(statusName);
  if (!normalized) {
    return "other";
  }

  if (doneStatuses.some((status) => normalizeTextValue(status) === normalized) || isTerminalOrCancelledStatus(statusName)) {
    return "done";
  }

  if (/\b(backlog|open|selected|triage)\b/.test(normalized)) {
    return "backlog";
  }

  if (/\b(done|closed|resolved|cancelled|canceled)\b/.test(normalized)) {
    return "done";
  }

  if (
    normalized.includes("analysis") ||
    normalized.includes("refinement") ||
    normalized.includes("planning") ||
    normalized === "to do" ||
    normalized === "todo" ||
    normalized === "new" ||
    normalized.includes("investigation")
  ) {
    return "funnel";
  }

  if (
    normalized.includes("hold") ||
    normalized.includes("blocked") ||
    normalized.includes("ready for testing") ||
    normalized.includes("release") ||
    normalized.includes("preparation for production")
  ) {
    return "active";
  }

  if (
    normalized.includes("development") ||
    normalized.includes("in progress") ||
    normalized.includes("code review") ||
    normalized.includes("review") ||
    normalized.includes("testing") ||
    normalized.includes("test") ||
    normalized.includes("acceptance")
  ) {
    return "implementing";
  }

  return "other";
}

function getErrorMessage(error: unknown): string {
  return classifyOperationFailure(error, 0).message;
}
