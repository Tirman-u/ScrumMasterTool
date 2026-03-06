import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TeamDetail } from "./components/TeamDetail";
import {
  DEFAULT_SLE_ISSUE_TYPES,
  buildSleValues,
  isIssueTypeIncludedInSle,
  normalizeSleIssueTypes,
} from "./lib/metrics";
import {
  addTeam,
  analyzeTeam,
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
import {
  type BottleneckEntry,
  type ImportBucket,
  type JiraQueryConfig,
  type JiraSavedQuery,
  type SleValues,
  type ParsedIssue,
  type TeamConfig,
  type VelocityConfig,
  type TeamMetrics,
  type TeamProgressSnapshot,
  type TeamRuntime,
  type WorkspaceConfig,
  type WorkspaceProfileConfig,
} from "./types/contracts";

const EMPTY_SLE: SleValues = { p50: null, p70: null, p85: null, p95: null };
const BOTTLENECK_HISTORY_START_MONTH = "2026-01";
const ALL_TEAMS_PROFILE_ID = "__all-teams__";

type Page = "workspace" | "dashboard" | "import" | "team";
type TeamTab = "overview" | "cycle";
type ImportMode = "current-month" | "root" | "custom";
type QueryTimeWindow = "none" | "current-month" | "last-month" | "ytd";
type TrendTone = "good" | "bad" | "neutral";
type HealthTone = "good" | "warn" | "bad" | "neutral";
type SleLineKey = "p50" | "p70" | "p85" | "p95";

interface TeamSnapshot {
  done: number;
  avgCycleTime: number | null;
  sle: SleValues;
  multiSprintPct: number;
  velocity: number;
}

interface ThroughputSnapshot {
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
  monthlyAvg: number | null;
  monthlyCvPct: number | null;
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
  over30: number;
  over60: number;
  over90: number;
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
  sprintPredictability: MetricHealthSignal;
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
  | "wipRiskHeatmap"
  | "agingWip"
  | "bottleneck"
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
    meaning: "Done count by Updated date in current month.",
    whyGood: "Shows current output pace and near-term delivery capacity.",
    improveTips: [
      "Reduce carry-over by finishing in-progress work first.",
      "Close completed tickets promptly so flow data stays accurate.",
      "Use daily flow review to remove blockers quickly.",
    ],
  },
  throughputLastMonth: {
    title: "Throughput (Last month)",
    meaning: "Done count by Updated date in previous month.",
    whyGood: "Good baseline to compare month-over-month change.",
    improveTips: [
      "Use it as baseline and investigate large month-over-month deltas.",
      "Stabilize team capacity and reduce ad-hoc work interruptions.",
      "Keep scope increments small for smoother completion cadence.",
    ],
  },
  throughputLast30Days: {
    title: "Throughput (Last 30 days)",
    meaning: "Rolling done count over recent 30 days.",
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
    meaning: "Newly created work compared to delivered work in same window.",
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
    meaning: "Created minus Delivered.",
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
    meaning: "Coefficient of variation (CV) for recent throughput.",
    whyGood: "Lower CV is better. It means output is more predictable.",
    improveTips: [
      "Stabilize sprint scope and reduce urgent ad-hoc interruptions.",
      "Keep work item sizes more consistent.",
      "Balance skills in the team to reduce bottleneck dependence.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: "<= 35% CV" },
      { tone: "warn", label: "Watch", range: "35.1% to 60% CV" },
      { tone: "bad", label: "Action", range: "> 60% CV" },
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
      { tone: "good", label: "Healthy", range: ">= 35%" },
      { tone: "warn", label: "Watch", range: "20% to 34.9%" },
      { tone: "bad", label: "Action", range: "< 20%" },
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
    title: "Sprint Predictability",
    meaning: "Committed vs completed ratio by sprint bucket.",
    whyGood: "Healthy range is around 85-115%. Too low means under-delivery; too high often means scope churn/unplanned work.",
    improveTips: [
      "Freeze sprint scope after planning as much as possible.",
      "Refine and estimate backlog better before sprint start.",
      "If value is above 115%, track unplanned work and scope additions.",
    ],
    healthScale: [
      { tone: "good", label: "Healthy", range: "85% to 115%" },
      { tone: "warn", label: "Watch", range: "70% to 84.9% OR 115.1% to 130%" },
      { tone: "bad", label: "Action", range: "< 70% OR > 130%" },
    ],
  },
  wipRiskHeatmap: {
    title: "WIP Risk Heatmap by Status",
    meaning: "Open WIP split by status with >30 / >60 / >90 days aging buckets.",
    whyGood: "Highlights exactly which statuses are accumulating stale work.",
    improveTips: [
      "Set aging alerts for >30 and >60 day tickets.",
      "Define weekly clean-up for statuses with oldest WIP.",
      "Close or cancel tickets that no longer have value.",
    ],
  },
  agingWip: {
    title: "Aging WIP",
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

  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");

  const [showAdvancedImport, setShowAdvancedImport] = useState(false);
  const [doneStatusesInput, setDoneStatusesInput] = useState("");
  const [bugIssueTypesInput, setBugIssueTypesInput] = useState("Bug");
  const [doneStatusDraft, setDoneStatusDraft] = useState("");
  const [bugIssueTypeDraft, setBugIssueTypeDraft] = useState("");
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

  const selectedTeamQueryConfig = useMemo(() => {
    return normalizeJiraQueryConfig(selectedImportTeam?.config.jiraQuery);
  }, [selectedImportTeam]);

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
    const values = new Set<string>();

    for (const team of filteredTeams) {
      team.metrics?.velocityMonthly.forEach((item) => values.add(item.month));
      team.metrics?.doneIssueDetails.forEach((item) => {
        if (item.resolutionDate) {
          values.add(item.resolutionDate.slice(0, 7));
        }
      });
    }

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [filteredTeams]);

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
      setSleIssueTypesDraft([...DEFAULT_SLE_ISSUE_TYPES]);
      setDoneStatusDraft("");
      setBugIssueTypeDraft("");
      setBottleneckFlowStatuses([]);
      setBottleneckFlowDraft("");
      setBottleneckRows([createEmptyBottleneckRow()]);
      setBottleneckNotesInput("");
      return;
    }

    setDraftConfig(structuredClone(selectedTeam.config));
    setDoneStatusesInput((selectedTeam.config.doneConfig.doneStatuses ?? []).join(", "));
    setBugIssueTypesInput((selectedTeam.config.bugConfig?.issueTypes ?? ["Bug"]).join(", "));
    setSleIssueTypesDraft(normalizeSleIssueTypes(selectedTeam.config.sleConfig.issueTypes));
    setDoneStatusDraft("");
    setBugIssueTypeDraft("");

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
      return;
    }

    const preferredQuery =
      selectedTeamQueryConfig.queries.find((query) => query.id === querySelectionId) ??
      selectedTeamQueryConfig.queries.find((query) => query.id === selectedTeamQueryConfig.defaultQueryId) ??
      selectedTeamQueryConfig.queries[0];

    if (!preferredQuery) {
      setQuerySelectionId("");
      setQueryDraftName("");
      setQueryDraftJql("");
      setQueryDraftNote("");
      return;
    }

    if (querySelectionId !== preferredQuery.id) {
      setQuerySelectionId(preferredQuery.id);
    }

    setQueryDraftName(preferredQuery.name);
    setQueryDraftJql(preferredQuery.jql);
    setQueryDraftNote(preferredQuery.note ?? "");
  }, [selectedImportTeam, selectedTeamQueryConfig, querySelectionId]);

  const dashboardBottleneckPeriod = useMemo(() => {
    return resolveBottleneckPeriod(periodMonth, availableMonths);
  }, [periodMonth, availableMonths]);

  const dashboardRows = useMemo(() => {
    const previousPeriod = getPreviousPeriodKey(periodMonth, availableMonths);

    return filteredTeams.map((team) => {
      const effectiveEntries = buildEffectiveBottleneckEntries(team);
      const current = computeSnapshot(team.metrics, periodMonth, team.config, team.parsedIssues);
      const previous = previousPeriod ? computeSnapshot(team.metrics, previousPeriod, team.config, team.parsedIssues) : null;
      const healthCurrent = computeTeamHealthSnapshot(
        team.parsedIssues,
        team.config,
        periodMonth,
        todayRef,
        effectiveEntries,
      );
      const healthPrevious =
        previousPeriod === null
          ? null
          : computeTeamHealthSnapshot(
              team.parsedIssues,
              team.config,
              previousPeriod,
              todayRef,
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
  }, [filteredTeams, periodMonth, availableMonths, dashboardBottleneckPeriod, todayRef]);

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
      todayRef,
      selectedTeamBottleneckEntries,
    );
  }, [selectedTeam, periodMonth, todayRef, selectedTeamBottleneckEntries]);

  const selectedTeamBoardStatuses = useMemo(() => {
    return buildBoardStatusMap(selectedTeam?.parsedIssues ?? []);
  }, [selectedTeam]);

  const selectedTeamHealthSignals = useMemo(() => {
    return buildTeamHealthSignals(selectedTeamHealth);
  }, [selectedTeamHealth]);

  const selectedTeamMetricDataIssues = useMemo(() => {
    return buildMetricDataIssues(selectedTeamHealth, selectedTeam?.config);
  }, [selectedTeamHealth, selectedTeam?.config]);

  const selectedTeamHealthCheck = useMemo(() => {
    return buildTeamHealthCheckSummary(selectedTeamHealthSignals);
  }, [selectedTeamHealthSignals]);

  const doneStatusList = useMemo(() => {
    return parseCommaSeparatedList(doneStatusesInput);
  }, [doneStatusesInput]);

  const bugIssueTypeList = useMemo(() => {
    return parseCommaSeparatedList(bugIssueTypesInput);
  }, [bugIssueTypesInput]);

  const cycleEndSourceLabel = useMemo(() => {
    return draftConfig?.cycleTimeConfig?.endDateSource === "updatedOnly"
      ? "Updated only"
      : "Resolved (fallback Updated)";
  }, [draftConfig?.cycleTimeConfig?.endDateSource]);

  const velocityCadenceLabel = useMemo(() => {
    if (draftVelocityConfig.mode === "monthly-ticket-count") {
      return "Monthly ticket count";
    }

    if (draftVelocityConfig.mode === "monthly-story-points") {
      return "Monthly story points";
    }

    if (draftVelocityConfig.mode === "weekly-ticket-count") {
      return "Weekly ticket count";
    }

    return "Sprint based story points";
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

  const periodSummary = useMemo(() => describePeriod(periodMonth, availableMonths), [periodMonth, availableMonths]);
  const previousPeriodLabel = useMemo(() => {
    const previousKey = getPreviousPeriodKey(periodMonth, availableMonths);
    return previousKey ? formatPeriodLabel(previousKey) : null;
  }, [periodMonth, availableMonths]);

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
    return composeQueryWithTimeWindow(queryDraftJql, queryTimeWindow);
  }, [queryDraftJql, queryTimeWindow]);

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

  function renderMetricDataIssue(helpKey: MetricHelpKey): JSX.Element | null {
    const issue = selectedTeamMetricDataIssues[helpKey];
    if (!issue) {
      return null;
    }

    return <small className={`metric-data-issue ${issue.tone}`}>Data check: {issue.message}</small>;
  }

  function renderFlowBalanceCard(): JSX.Element {
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
            This month Created/Delivered • Last 30 days {selectedTeamHealth.intakeThroughput.intakeLast30Days}/
            {selectedTeamHealth.intakeThroughput.throughputLast30Days}
          </small>
        </div>
        <div className="flow-balance-divider" aria-hidden="true" />
        <div className="flow-balance-block">
          {renderMetricLabel("Backlog Flow", "netFlow", selectedTeamHealthSignals.netFlow)}
          <strong>{formatSignedNumber(selectedTeamHealth.netFlow.thisMonth)}</strong>
          <small>
            This month (Created - Delivered) • Last 30 days {formatSignedNumber(selectedTeamHealth.netFlow.last30Days)}
          </small>
        </div>
      </article>
    );
  }

  function renderHealthCheckCompactCard(keyPrefix: string): JSX.Element {
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
    };

    await saveWorkspaceConfig(workspaceHandle, config);
    setWorkspaceProfiles(profiles);
    setActiveWorkspaceProfileId(nextActiveProfileId);
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
    if (normalizedVelocity.mode === "sprint-story-points" && !normalizedVelocity.sprintStartDate) {
      setStatus("Sprint start date is required when velocity cadence is Sprint Based Story Points.");
      return;
    }

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
        cycleTimeConfig: draftConfig.cycleTimeConfig ?? {
          endDateSource: "resolvedOrUpdated",
        },
        sleConfig: {
          ...draftConfig.sleConfig,
          issueTypes: normalizeSleIssueTypes(draftConfig.sleConfig.issueTypes),
        },
        velocityConfig: normalizedVelocity,
        bugConfig: {
          issueTypes: bugIssueTypesInput
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        },
        mapping: {
          ...draftConfig.mapping,
          issueType: draftConfig.mapping.issueType ?? "Issue Type",
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

  function handleSelectSavedQuery(queryId: string): void {
    setQuerySelectionId(queryId);
    const selected = selectedTeamQueryConfig.queries.find((query) => query.id === queryId);
    if (!selected) {
      return;
    }

    setQueryDraftName(selected.name);
    setQueryDraftJql(selected.jql);
    setQueryDraftNote(selected.note ?? "");
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

    const queryId = createUniqueQueryId(name, selectedTeamQueryConfig.queries);
    const nextQuery: JiraSavedQuery = {
      id: queryId,
      name,
      jql,
      note: queryDraftNote.trim() || undefined,
    };

    const nextConfig: TeamConfig = {
      ...selectedImportTeam.config,
      jiraQuery: {
        defaultQueryId:
          selectedTeamQueryConfig.defaultQueryId ?? selectedTeamQueryConfig.queries[0]?.id ?? nextQuery.id,
        queries: [...selectedTeamQueryConfig.queries, nextQuery],
      },
    };

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

    const updatedQueries = selectedTeamQueryConfig.queries.map((query) =>
      query.id === querySelectionId
        ? {
            ...query,
            name,
            jql,
            note: queryDraftNote.trim() || undefined,
          }
        : query,
    );

    const nextConfig: TeamConfig = {
      ...selectedImportTeam.config,
      jiraQuery: {
        defaultQueryId: selectedTeamQueryConfig.defaultQueryId,
        queries: updatedQueries,
      },
    };

    await persistImportTeamConfig(nextConfig, `Updated query "${name}" for ${selectedImportTeam.config.teamName}.`);
  }

  async function handleSetDefaultQuery(): Promise<void> {
    if (!selectedImportTeam || !querySelectionId) {
      setStatus("Select query first.");
      return;
    }

    const selected = selectedTeamQueryConfig.queries.find((query) => query.id === querySelectionId);
    if (!selected) {
      setStatus("Selected query not found.");
      return;
    }

    const nextConfig: TeamConfig = {
      ...selectedImportTeam.config,
      jiraQuery: {
        defaultQueryId: selected.id,
        queries: selectedTeamQueryConfig.queries,
      },
    };

    await persistImportTeamConfig(nextConfig, `Default query set to "${selected.name}".`);
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
            cycleTimeConfig: {
              endDateSource: "resolvedOrUpdated",
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
            cycleTimeConfig: {
              endDateSource: "updatedOnly",
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
    const sprintPredictabilityCurrent =
      !selectedTeamHealth.sprintPredictability.enabled
        ? "-"
        : selectedTeamHealth.sprintPredictability.latest?.predictabilityPct === null
          ? "No commitment"
          : `${formatPercentValue(selectedTeamHealth.sprintPredictability.latest.predictabilityPct)}%`;
    const sprintPredictabilityPrevious =
      previousHealth === null
        ? "-"
        : !previousHealth.sprintPredictability.enabled
          ? "-"
          : previousHealth.sprintPredictability.latest?.predictabilityPct === null
            ? "No commitment"
            : `${formatPercentValue(previousHealth.sprintPredictability.latest.predictabilityPct)}%`;

    const metricsRows: Array<[string, string, string, string, string]> = [
      ["Key Metrics Snapshot", "", "", "", periodMonth],
      [
        "Stories Done",
        String(selectedTeamRow.current.done),
        String(selectedTeamRow.previous?.done ?? "-"),
        selectedTeamRow.trends.done.label,
        periodMonth,
      ],
      [
        "Avg Cycle Time",
        formatDays(selectedTeamRow.current.avgCycleTime),
        formatDays(selectedTeamRow.previous?.avgCycleTime ?? null),
        selectedTeamRow.trends.avgCycleTime.label,
        periodMonth,
      ],
      [
        "SLE P85",
        formatDays(selectedTeamRow.current.sle.p85),
        formatDays(selectedTeamRow.previous?.sle.p85 ?? null),
        selectedTeamRow.trends.sleP85.label,
        periodMonth,
      ],
      [
        "Velocity",
        formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig),
        formatVelocityValue(selectedTeamRow.previous?.velocity ?? 0, selectedTeam.config.velocityConfig),
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
        "Throughput (This / Last month)",
        `${selectedTeamHealth.throughput.thisMonth} / ${selectedTeamHealth.throughput.lastMonth}`,
        previousHealth
          ? `${previousHealth.throughput.thisMonth} / ${previousHealth.throughput.lastMonth}`
          : "-",
        "Done by Updated date",
        periodMonth,
      ],
      [
        "Throughput (Last 30 days)",
        String(selectedTeamHealth.throughput.last30Days),
        previousHealth ? String(previousHealth.throughput.last30Days) : "-",
        "Rolling window",
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
        "Sprint Predictability",
        sprintPredictabilityCurrent,
        sprintPredictabilityPrevious,
        selectedTeamHealthSignals.sprintPredictability.label,
        periodMonth,
      ],
      ["Team Metrics", "", "", "", periodMonth],
      [
        "Done",
        String(selectedTeamRow.current.done),
        String(selectedTeamRow.previous?.done ?? "-"),
        selectedTeamRow.trends.done.label,
        periodMonth,
      ],
      [
        "Avg Cycle Time",
        formatDays(selectedTeamRow.current.avgCycleTime),
        formatDays(selectedTeamRow.previous?.avgCycleTime ?? null),
        selectedTeamRow.trends.avgCycleTime.label,
        periodMonth,
      ],
      [
        "SLE P50",
        formatDays(selectedTeamRow.current.sle.p50),
        formatDays(selectedTeamRow.previous?.sle.p50 ?? null),
        selectedTeamRow.trends.sleP50.label,
        periodMonth,
      ],
      [
        "SLE P70",
        formatDays(selectedTeamRow.current.sle.p70),
        formatDays(selectedTeamRow.previous?.sle.p70 ?? null),
        selectedTeamRow.trends.sleP70.label,
        periodMonth,
      ],
      [
        "SLE P85",
        formatDays(selectedTeamRow.current.sle.p85),
        formatDays(selectedTeamRow.previous?.sle.p85 ?? null),
        selectedTeamRow.trends.sleP85.label,
        periodMonth,
      ],
      [
        "SLE P95",
        formatDays(selectedTeamRow.current.sle.p95),
        formatDays(selectedTeamRow.previous?.sle.p95 ?? null),
        selectedTeamRow.trends.sleP95.label,
        periodMonth,
      ],
      [
        "2+ Sprint %",
        `${formatPercentValue(selectedTeamRow.current.multiSprintPct)}%`,
        `${formatPercentValue(selectedTeamRow.previous?.multiSprintPct ?? 0)}%`,
        selectedTeamRow.trends.multiSprintPct.label,
        periodMonth,
      ],
      [
        "Velocity",
        formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig),
        formatVelocityValue(selectedTeamRow.previous?.velocity ?? 0, selectedTeam.config.velocityConfig),
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

        {!workspaceHandle ? (
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
            {page === "workspace" && (
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

            {page === "dashboard" && (
              <section className="page-section dashboard-page">
                <div className="section-head">
                  <div>
                    <h1>Multi-Team Dashboard</h1>
                    <p>Compare team health metrics and identify trends.</p>
                  </div>
                  <div className="section-tools">
                    <label className="period-select">
                      <span>Period:</span>
                      <select value={periodMonth} onChange={(event) => setPeriodMonth(event.target.value)}>
                        <option value="all">All</option>
                        <option value="ytd">{formatPeriodLabel("ytd")}</option>
                        {availableMonths.map((month) => (
                          <option key={month} value={month}>
                            {formatMonthLabel(month)}
                          </option>
                        ))}
                      </select>
                    </label>
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
                          <th>Done</th>
                          <th>Avg Cycle Time</th>
                          <th>SLE P85</th>
                          <th>WIP Age Risk</th>
                          <th>Bug Ratio</th>
                          <th>Monte Carlo</th>
                          <th>2+ Sprint %</th>
                          <th>Velocity</th>
                          <th>Bottleneck</th>
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
                            <td>{renderMetricWithTrend(String(row.current.done), row.trends.done)}</td>
                            <td>{renderMetricWithTrend(formatDays(row.current.avgCycleTime), row.trends.avgCycleTime)}</td>
                            <td>{renderMetricWithTrend(formatDays(row.current.sle.p85), row.trends.sleP85)}</td>
                            <td>
                              {renderMetricWithTrend(
                                `${formatPercentValue(row.healthCurrent.wipRisk.over30Pct)}% >1 month`,
                                row.healthTrends.wipAgeRisk,
                              )}
                            </td>
                            <td>
                              {renderMetricWithTrend(
                                row.healthCurrent.bugRatio.doneBugRatio === null
                                  ? "-"
                                  : `${formatPercentValue(row.healthCurrent.bugRatio.doneBugRatio)}%`,
                                row.healthTrends.bugRatio,
                              )}
                            </td>
                            <td>
                              {renderMetricWithTrend(
                                row.healthCurrent.forecast.p85Days === null
                                  ? "-"
                                  : `P85 ${row.healthCurrent.forecast.p85Days} days`,
                                row.healthTrends.monteCarlo,
                              )}
                            </td>
                            <td>
                              {renderMetricWithTrend(
                                `${formatPercentValue(row.current.multiSprintPct)}%`,
                                row.trends.multiSprintPct,
                              )}
                            </td>
                            <td>{renderMetricWithTrend(formatVelocityValue(row.current.velocity, row.team.config.velocityConfig), row.trends.velocity)}</td>
                            <td>{row.bottleneck}</td>
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

                    <section className="table-panel compact dashboard-merged-detailed-table">
                      <div className="table-wrap">
                        <table className="metrics-table">
                          <thead>
                            <tr>
                              <th>Done</th>
                              <th>Avg Cycle Time</th>
                              <th>SLE P50</th>
                              <th>SLE P70</th>
                              <th>SLE P85</th>
                              <th>SLE P95</th>
                              <th>2+ Sprint %</th>
                              <th>Velocity ({selectedVelocityUnit})</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>{renderMetricWithTrend(String(selectedTeamRow.current.done), selectedTeamRow.trends.done)}</td>
                              <td>{renderMetricWithTrend(formatDays(selectedTeamRow.current.avgCycleTime), selectedTeamRow.trends.avgCycleTime)}</td>
                              <td>{renderMetricWithTrend(formatDays(selectedTeamRow.current.sle.p50), selectedTeamRow.trends.sleP50)}</td>
                              <td>{renderMetricWithTrend(formatDays(selectedTeamRow.current.sle.p70), selectedTeamRow.trends.sleP70)}</td>
                              <td>{renderMetricWithTrend(formatDays(selectedTeamRow.current.sle.p85), selectedTeamRow.trends.sleP85)}</td>
                              <td>{renderMetricWithTrend(formatDays(selectedTeamRow.current.sle.p95), selectedTeamRow.trends.sleP95)}</td>
                              <td>
                                {renderMetricWithTrend(
                                  `${formatPercentValue(selectedTeamRow.current.multiSprintPct)}%`,
                                  selectedTeamRow.trends.multiSprintPct,
                                )}
                              </td>
                              <td>{renderMetricWithTrend(formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig), selectedTeamRow.trends.velocity)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section className="overview-top dashboard-merged-overview">
                      <h2 className="team-section-title">Key Metrics</h2>
                      <div className="team-kpi-grid">
                        {renderHealthCheckCompactCard("dashboard")}
                        <article className="team-kpi-card flow-signal-card">
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
                        <article className="team-kpi-card flow-signal-card">
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
                        <article className="team-kpi-card">
                          {renderMetricLabel(`Velocity (${selectedVelocityUnit})`, "velocity")}
                          <strong>{formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig)}</strong>
                          <small>{previousPeriodLabel ? `Previous (${previousPeriodLabel}): ${formatVelocityValue(selectedTeamRow.previous?.velocity ?? 0, selectedTeam.config.velocityConfig)}` : "Previous: -"}</small>
                        </article>
                        <article className="team-kpi-card">
                          {renderMetricLabel("Stories Done", "storiesDone")}
                          <strong>{selectedTeamRow.current.done}</strong>
                          <small>{previousPeriodLabel ? `Previous (${previousPeriodLabel}): ${selectedTeamRow.previous?.done ?? "-"}` : "Previous: -"}</small>
                        </article>
                        <article className="team-kpi-card">
                          {renderMetricLabel("Avg Cycle Time", "avgCycleTime")}
                          <strong>{formatDays(selectedTeamRow.current.avgCycleTime)}</strong>
                          <small>{previousPeriodLabel ? `Previous (${previousPeriodLabel}): ${formatDays(selectedTeamRow.previous?.avgCycleTime ?? null)}` : "Previous: -"}</small>
                        </article>
                        <article className="team-kpi-card">
                          {renderMetricLabel("SLE P85", "sleP85")}
                          <strong>{formatDays(selectedTeamRow.current.sle.p85)}</strong>
                          <small>{previousPeriodLabel ? `Previous (${previousPeriodLabel}): ${formatDays(selectedTeamRow.previous?.sle.p85 ?? null)}` : "Previous: -"}</small>
                        </article>
                        <article className="team-kpi-card">
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
                        <article className="team-kpi-card">
                          {renderMetricLabel("Throughput (This / Last month)", "throughputThisMonth")}
                          <strong>
                            {selectedTeamHealth.throughput.thisMonth} / {selectedTeamHealth.throughput.lastMonth}
                          </strong>
                          <small>This month / Last month • Done by Updated date</small>
                        </article>
                        <article className="team-kpi-card">
                          {renderMetricLabel("Throughput (Last 30 days)", "throughputLast30Days")}
                          <strong>{selectedTeamHealth.throughput.last30Days}</strong>
                          <small>Rolling window</small>
                        </article>
                        <article className="team-kpi-card flow-signal-card">
                          {renderMetricLabel(
                            "Sprint Predictability",
                            "sprintPredictability",
                            selectedTeamHealthSignals.sprintPredictability,
                          )}
                          <strong>
                            {!selectedTeamHealth.sprintPredictability.enabled
                              ? "-"
                              : selectedTeamHealth.sprintPredictability.latest?.predictabilityPct === null
                                ? "No commitment"
                                : `${formatPercentValue(selectedTeamHealth.sprintPredictability.latest.predictabilityPct)}%`}
                          </strong>
                          <small>
                            {!selectedTeamHealth.sprintPredictability.enabled
                              ? "Enable Sprint cadence to track committed vs done."
                              : selectedTeamHealth.sprintPredictability.latest
                                ? `${formatSprintBucketLabel(selectedTeamHealth.sprintPredictability.latest.sprint)} ${selectedTeamHealth.sprintPredictability.latest.done}/${selectedTeamHealth.sprintPredictability.latest.created} • Avg last 6 ${selectedTeamHealth.sprintPredictability.avgLast6Pct === null ? "-" : `${formatPercentValue(selectedTeamHealth.sprintPredictability.avgLast6Pct)}%`}`
                                : "No sprint history yet."}
                          </small>
                          {renderMetricDataIssue("sprintPredictability")}
                        </article>
                      </section>

                      <section className="flow-signals-grid">
                        {renderFlowBalanceCard()}
                        <article className="team-kpi-card flow-signal-card">
                          {renderMetricLabel(
                            "Throughput Stability",
                            "throughputStability",
                            selectedTeamHealthSignals.throughputStability,
                          )}
                          <strong>
                            {selectedTeamHealth.throughputStability.weeklyCvPct === null
                              ? "-"
                              : `${formatPercentValue(selectedTeamHealth.throughputStability.weeklyCvPct)}% CV`}
                          </strong>
                          <small>
                            8-week avg {formatNumber(selectedTeamHealth.throughputStability.weeklyAvg, 1) || "-"} done/wk • 6-month CV{" "}
                            {selectedTeamHealth.throughputStability.monthlyCvPct === null
                              ? "-"
                              : `${formatPercentValue(selectedTeamHealth.throughputStability.monthlyCvPct)}%`}
                          </small>
                          {renderMetricDataIssue("throughputStability")}
                        </article>
                        <article className="team-kpi-card flow-signal-card">
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
                        <article className="team-kpi-card flow-signal-card">
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
                        <article className="team-kpi-card flow-signal-card">
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
                        <article className="team-kpi-card flow-signal-card">
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

                      <section className="table-panel compact wip-heatmap-panel">
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
                                  <th>&gt;30 days</th>
                                  <th>&gt;60 days</th>
                                  <th>&gt;90 days</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedTeamHealth.wipRiskHeatmap.rows.map((row) => (
                                  <tr key={`wip-heatmap-${row.status}`}>
                                    <td>{row.status}</td>
                                    <td>{row.total}</td>
                                    <td>{row.over30}</td>
                                    <td>{row.over60}</td>
                                    <td>{row.over90}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    </section>

                    <section className="overview-secondary-grid dashboard-merged-secondary">
                      <section className="aging-wip-compact-row">
                        <article className="team-kpi-card aging-wip-compact-card">
                          <div className="aging-wip-compact-head">
                            <div className="aging-wip-title-row">
                              <span>Aging WIP</span>
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

                      <section className="table-panel compact bottleneck-panel">
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
                    </section>
                  </section>
                ) : (
                  <section className="table-panel dashboard-merged-empty">
                    <p className="muted">Select a team row to open merged team details below the multi-team view.</p>
                  </section>
                )}
              </section>
            )}

            {page === "team" && (
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
                      <label className="period-select">
                        <span>Period:</span>
                        <select value={periodMonth} onChange={(event) => setPeriodMonth(event.target.value)}>
                          <option value="all">All</option>
                          <option value="ytd">{formatPeriodLabel("ytd")}</option>
                          {availableMonths.map((month) => (
                            <option key={month} value={month}>
                              {formatMonthLabel(month)}
                            </option>
                          ))}
                        </select>
                      </label>

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
                        <section className="table-panel compact">
                          <div className="table-wrap">
                            <table className="metrics-table">
                              <thead>
                                <tr>
                                  <th>Done</th>
                                  <th>Avg Cycle Time</th>
                                  <th>SLE P50</th>
                                  <th>SLE P70</th>
                                  <th>SLE P85</th>
                                  <th>SLE P95</th>
                                  <th>2+ Sprint %</th>
                                  <th>Velocity ({selectedVelocityUnit})</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td>{renderMetricWithTrend(String(selectedTeamRow.current.done), selectedTeamRow.trends.done)}</td>
                                  <td>{renderMetricWithTrend(formatDays(selectedTeamRow.current.avgCycleTime), selectedTeamRow.trends.avgCycleTime)}</td>
                                  <td>{renderMetricWithTrend(formatDays(selectedTeamRow.current.sle.p50), selectedTeamRow.trends.sleP50)}</td>
                                  <td>{renderMetricWithTrend(formatDays(selectedTeamRow.current.sle.p70), selectedTeamRow.trends.sleP70)}</td>
                                  <td>{renderMetricWithTrend(formatDays(selectedTeamRow.current.sle.p85), selectedTeamRow.trends.sleP85)}</td>
                                  <td>{renderMetricWithTrend(formatDays(selectedTeamRow.current.sle.p95), selectedTeamRow.trends.sleP95)}</td>
                                  <td>
                                    {renderMetricWithTrend(
                                      `${formatPercentValue(selectedTeamRow.current.multiSprintPct)}%`,
                                      selectedTeamRow.trends.multiSprintPct,
                                    )}
                                  </td>
                                  <td>{renderMetricWithTrend(formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig), selectedTeamRow.trends.velocity)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </section>

                        <section className="overview-top">
                          <h2 className="team-section-title">Key Metrics</h2>
                          <div className="team-kpi-grid">
                            {renderHealthCheckCompactCard("team")}
                            <article className="team-kpi-card flow-signal-card">
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
                            <article className="team-kpi-card flow-signal-card">
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
                            <article className="team-kpi-card">
                              {renderMetricLabel(`Velocity (${selectedVelocityUnit})`, "velocity")}
                              <strong>{formatVelocityValue(selectedTeamRow.current.velocity, selectedTeam.config.velocityConfig)}</strong>
                              <small>{previousPeriodLabel ? `Previous (${previousPeriodLabel}): ${formatVelocityValue(selectedTeamRow.previous?.velocity ?? 0, selectedTeam.config.velocityConfig)}` : "Previous: -"}</small>
                            </article>
                            <article className="team-kpi-card">
                              {renderMetricLabel("Stories Done", "storiesDone")}
                              <strong>{selectedTeamRow.current.done}</strong>
                              <small>{previousPeriodLabel ? `Previous (${previousPeriodLabel}): ${selectedTeamRow.previous?.done ?? "-"}` : "Previous: -"}</small>
                            </article>
                            <article className="team-kpi-card">
                              {renderMetricLabel("Avg Cycle Time", "avgCycleTime")}
                              <strong>{formatDays(selectedTeamRow.current.avgCycleTime)}</strong>
                              <small>{previousPeriodLabel ? `Previous (${previousPeriodLabel}): ${formatDays(selectedTeamRow.previous?.avgCycleTime ?? null)}` : "Previous: -"}</small>
                            </article>
                            <article className="team-kpi-card">
                              {renderMetricLabel("SLE P85", "sleP85")}
                              <strong>{formatDays(selectedTeamRow.current.sle.p85)}</strong>
                              <small>{previousPeriodLabel ? `Previous (${previousPeriodLabel}): ${formatDays(selectedTeamRow.previous?.sle.p85 ?? null)}` : "Previous: -"}</small>
                            </article>
                            <article className="team-kpi-card">
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
                            <article className="team-kpi-card">
                              {renderMetricLabel("Throughput (This / Last month)", "throughputThisMonth")}
                              <strong>
                                {selectedTeamHealth.throughput.thisMonth} / {selectedTeamHealth.throughput.lastMonth}
                              </strong>
                              <small>This month / Last month • Done by Updated date</small>
                            </article>
                            <article className="team-kpi-card">
                              {renderMetricLabel("Throughput (Last 30 days)", "throughputLast30Days")}
                              <strong>{selectedTeamHealth.throughput.last30Days}</strong>
                              <small>Rolling window</small>
                            </article>
                            <article className="team-kpi-card flow-signal-card">
                              {renderMetricLabel(
                                "Sprint Predictability",
                                "sprintPredictability",
                                selectedTeamHealthSignals.sprintPredictability,
                              )}
                              <strong>
                                {!selectedTeamHealth.sprintPredictability.enabled
                                  ? "-"
                                  : selectedTeamHealth.sprintPredictability.latest?.predictabilityPct === null
                                    ? "No commitment"
                                    : `${formatPercentValue(selectedTeamHealth.sprintPredictability.latest.predictabilityPct)}%`}
                              </strong>
                              <small>
                                {!selectedTeamHealth.sprintPredictability.enabled
                                  ? "Enable Sprint cadence to track committed vs done."
                                  : selectedTeamHealth.sprintPredictability.latest
                                    ? `${formatSprintBucketLabel(selectedTeamHealth.sprintPredictability.latest.sprint)} ${selectedTeamHealth.sprintPredictability.latest.done}/${selectedTeamHealth.sprintPredictability.latest.created} • Avg last 6 ${selectedTeamHealth.sprintPredictability.avgLast6Pct === null ? "-" : `${formatPercentValue(selectedTeamHealth.sprintPredictability.avgLast6Pct)}%`}`
                                    : "No sprint history yet."}
                              </small>
                              {renderMetricDataIssue("sprintPredictability")}
                            </article>
                          </section>

                          <section className="flow-signals-grid">
                            {renderFlowBalanceCard()}
                            <article className="team-kpi-card flow-signal-card">
                              {renderMetricLabel(
                                "Throughput Stability",
                                "throughputStability",
                                selectedTeamHealthSignals.throughputStability,
                              )}
                              <strong>
                                {selectedTeamHealth.throughputStability.weeklyCvPct === null
                                  ? "-"
                                  : `${formatPercentValue(selectedTeamHealth.throughputStability.weeklyCvPct)}% CV`}
                              </strong>
                              <small>
                                8-week avg {formatNumber(selectedTeamHealth.throughputStability.weeklyAvg, 1) || "-"} done/wk • 6-month CV{" "}
                                {selectedTeamHealth.throughputStability.monthlyCvPct === null
                                  ? "-"
                                  : `${formatPercentValue(selectedTeamHealth.throughputStability.monthlyCvPct)}%`}
                              </small>
                              {renderMetricDataIssue("throughputStability")}
                            </article>
                            <article className="team-kpi-card flow-signal-card">
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
                            <article className="team-kpi-card flow-signal-card">
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
                            <article className="team-kpi-card flow-signal-card">
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
                            <article className="team-kpi-card flow-signal-card">
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

                          <section className="table-panel compact wip-heatmap-panel">
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
                                      <th>&gt;30 days</th>
                                      <th>&gt;60 days</th>
                                      <th>&gt;90 days</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedTeamHealth.wipRiskHeatmap.rows.map((row) => (
                                      <tr key={`wip-heatmap-team-${row.status}`}>
                                        <td>{row.status}</td>
                                        <td>{row.total}</td>
                                        <td>{row.over30}</td>
                                        <td>{row.over60}</td>
                                        <td>{row.over90}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </section>
                        </section>

                        <section
                          className={`overview-secondary-grid${shouldEqualizeTeamOverviewSecondaryCards ? " is-collapsed-pair" : ""}`}
                        >
                          <section className="aging-wip-compact-row">
                            <article className="team-kpi-card aging-wip-compact-card">
                              <div className="aging-wip-compact-head">
                                <div className="aging-wip-title-row">
                                  <span>Aging WIP</span>
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

                          <section className="table-panel compact bottleneck-panel">
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
                        </section>
                        <hr className="team-divider" />
                        <section className="done-config-card">
                          <div className="done-config-head">
                            <h2 className="team-section-title">Done Definition</h2>
                            <button
                              type="button"
                              className="done-config-toggle panel-toggle"
                              aria-expanded={doneDefinitionOpen}
                              aria-controls="done-definition-content"
                              title={doneDefinitionOpen ? "Hide Done Definition" : "Show Done Definition"}
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
                                <div className="done-config-grid">
                                  <section className="done-config-panel">
                                    <div className="done-config-panel-title">Done logic</div>
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
                                      <div className="done-chip-editor-label">Done statuses</div>
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
                                    <div className="done-config-panel-title">Bug counting</div>
                                    <div className="done-chip-editor">
                                      <div className="done-chip-editor-label">Issue types counted as bug</div>
                                      <div className="done-chip-list">
                                        {bugIssueTypeList.length === 0 ? (
                                          <span className="muted">Bug only (default fallback).</span>
                                        ) : (
                                          bugIssueTypeList.map((value) => (
                                            <button
                                              key={value}
                                              type="button"
                                              className="chip-btn"
                                              onClick={() => handleRemoveBugIssueType(value)}
                                              title="Remove issue type"
                                            >
                                              {value} <span aria-hidden="true">x</span>
                                            </button>
                                          ))
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
                                          placeholder="Add type (e.g. Bug)"
                                        />
                                        <button type="button" className="soft-btn" onClick={handleAddBugIssueType}>Add</button>
                                      </div>
                                    </div>

                                    <div className="done-config-presets">
                                      <button type="button" className="soft-btn" onClick={() => setBugIssueTypesInput("Bug")}>
                                        Bug only (recommended)
                                      </button>
                                      <button type="button" className="soft-btn" onClick={() => setBugIssueTypesInput("Bug, Defect, Incident")}>
                                        Bug + Defect + Incident
                                      </button>
                                    </div>

                                    {bugIssueTypeList.some((value) => {
                                      const normalized = normalizeTextValue(value);
                                      return normalized === "task" || normalized === "sub-task" || normalized === "subtask";
                                    }) && (
                                      <p className="done-config-warning">
                                        `Task` or `Sub-task` in bug types can inflate Bug Ratio heavily.
                                      </p>
                                    )}
                                  </section>
                                </div>

                                <div className="done-config-grid done-config-grid-secondary">
                                  <label>
                                    Cycle time end date source
                                    <select
                                      value={draftConfig.cycleTimeConfig?.endDateSource ?? "resolvedOrUpdated"}
                                      onChange={(event) =>
                                        setDraftConfig((curr) =>
                                          curr
                                            ? {
                                                ...curr,
                                                cycleTimeConfig: {
                                                  endDateSource: event.target.value as "resolvedOrUpdated" | "updatedOnly",
                                                },
                                              }
                                            : curr,
                                        )
                                      }
                                    >
                                      <option value="resolvedOrUpdated">Resolved (fallback Updated)</option>
                                      <option value="updatedOnly">Updated only (for misconfigured Jira)</option>
                                    </select>
                                  </label>

                                  <label>
                                    Velocity cadence
                                    <select
                                      value={draftVelocityConfig.mode}
                                      onChange={(event) =>
                                        setDraftConfig((curr) =>
                                          curr
                                            ? {
                                                ...curr,
                                                velocityConfig:
                                                  event.target.value === "sprint-story-points"
                                                    ? {
                                                        mode: "sprint-story-points",
                                                        sprintStartDate: normalizeVelocityConfig(curr.velocityConfig).sprintStartDate,
                                                        sprintLengthWeeks: normalizeVelocityConfig(curr.velocityConfig).sprintLengthWeeks,
                                                      }
                                                    : { mode: event.target.value as VelocityConfig["mode"] },
                                              }
                                            : curr,
                                        )
                                      }
                                    >
                                      <option value="monthly-ticket-count">Monthly ticket count</option>
                                      <option value="monthly-story-points">Monthly story points</option>
                                      <option value="weekly-ticket-count">Weekly ticket count</option>
                                      <option value="sprint-story-points">Sprint based story points</option>
                                    </select>
                                  </label>
                                </div>

                                {draftVelocityConfig.mode === "sprint-story-points" && (
                                  <div className="velocity-sprint-grid">
                                    <label>
                                      Sprint start date
                                      <input
                                        type="date"
                                        value={draftVelocityConfig.sprintStartDate ?? ""}
                                        onChange={(event) =>
                                          setDraftConfig((curr) =>
                                            curr
                                              ? {
                                                  ...curr,
                                                  velocityConfig: {
                                                    ...normalizeVelocityConfig(curr.velocityConfig),
                                                    mode: "sprint-story-points",
                                                    sprintStartDate: event.target.value,
                                                  },
                                                }
                                              : curr,
                                          )
                                        }
                                      />
                                    </label>
                                    <label>
                                      Sprint length (weeks)
                                      <input
                                        type="number"
                                        min={1}
                                        max={12}
                                        step={1}
                                        value={draftVelocityConfig.sprintLengthWeeks ?? 2}
                                        onChange={(event) =>
                                          setDraftConfig((curr) =>
                                            curr
                                              ? {
                                                  ...curr,
                                                  velocityConfig: {
                                                    ...normalizeVelocityConfig(curr.velocityConfig),
                                                    mode: "sprint-story-points",
                                                    sprintLengthWeeks: Number.parseInt(event.target.value, 10) || 2,
                                                  },
                                                }
                                              : curr,
                                          )
                                        }
                                      />
                                    </label>
                                  </div>
                                )}

                                <div className="preset-row">
                                  <button type="submit" disabled={busy}>Save Done Rules</button>
                                </div>

                                <p className="guide-note">
                                  All metrics for this team use this Done definition (cycle time, SLE, velocity, 2+ sprint %).
                                </p>
                              </form>
                            ) : (
                              <div className="done-config-collapsed">
                                <div className="done-config-collapsed-row">
                                  <strong>Done statuses</strong>
                                  <span>{doneStatusList.length > 0 ? doneStatusList.join(" • ") : "-"}</span>
                                </div>
                                <div className="done-config-collapsed-row">
                                  <strong>Bug types</strong>
                                  <span>{bugIssueTypeList.length > 0 ? bugIssueTypeList.join(" • ") : "Bug (default)"}</span>
                                </div>
                                <p className="muted done-config-collapsed-hint">
                                  Cycle end: {cycleEndSourceLabel} • Velocity: {velocityCadenceLabel}
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

            {page === "import" && (
              <section className="page-section import-layout">
                <div className="import-left">
                  <section className="panel-box">
                    <div className="section-head compact-head">
                      <div>
                        <h1>Import Data</h1>
                        <p>Import Jira CSV exports to update team metrics.</p>
                      </div>
                    </div>

                    <label>
                      Select Team
                      <select value={importTeamId} onChange={(event) => setImportTeamId(event.target.value)}>
                        <option value="">Choose team...</option>
                        {filteredTeams.map((team) => (
                          <option key={team.teamId} value={team.teamId}>
                            {team.config.teamName}
                          </option>
                        ))}
                      </select>
                    </label>

                    {selectedImportTeam && (
                      <section className="query-manager">
                        <h4>Team Jira Query</h4>

                        <label>
                          Saved queries
                          <select value={querySelectionId} onChange={(event) => handleSelectSavedQuery(event.target.value)}>
                            {selectedTeamQueryConfig.queries.map((query) => (
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
                            placeholder="e.g., Team YTD"
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
                          <h4>Generated query preview</h4>
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
                    )}

                    <div className="upload-zone" onClick={() => !busy && handleImport()} role="button" tabIndex={0}>
                      <div className="upload-icon">⇪</div>
                      <div className="upload-main">Click to upload CSV files</div>
                      <div className="upload-sub">Files are stored locally in team imports folder.</div>
                    </div>

                    <details open={showAdvancedImport} onToggle={(event) => setShowAdvancedImport(event.currentTarget.open)}>
                      <summary>Advanced (optional)</summary>
                      <div className="advanced-grid">
                        <label>
                          Import folder mode
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
                          </div>
                          <button type="submit" disabled={busy || !selectedTeam}>
                            Save Advanced Config
                          </button>
                        </form>
                      )}
                    </details>

                    <button onClick={handleImport} disabled={busy || !importTeamId} className="import-btn">
                      Import Data
                    </button>
                  </section>

                  <section className="hint-box">
                    <h3>Jira Filter and Export Guide</h3>

                    <div className="guide-block">
                      <h4>Recommended team queries (JQL)</h4>
                      <pre className="guide-code">{"DONE:\nproject = \"Your Project Here\" and issuetype in (Bug, Story, Task) AND status in ( \"Done\", Canceled) and status changed DURING (startOfYear(), endOfYear())"}</pre>
                      <pre className="guide-code">{"Dont Done:\nproject = \"Your Project Here\" and issuetype in (Bug, Story, Task) AND status not in ( \"Done\", Canceled)"}</pre>
                      <p className="guide-note">
                        Import both CSV files per team refresh. The app keeps the latest row per issue key (by Updated).
                      </p>
                    </div>

                    <div className="guide-block">
                      <h4>Optional: Time in Status CSV for Bottleneck</h4>
                      <pre className="guide-code">{"project = \"Your Project Here\" and issuetype in (Bug, Story, Task) and status changed DURING (startOfYear(), endOfYear())"}</pre>
                      <p className="guide-note">
                        Export as plain CSV. Required: Resolution Date (or Resolved) and status duration columns (e.g. In Progress, Code Review, Test). Manual bottleneck overrides auto for the same month.
                      </p>
                    </div>

                    <div className="guide-block">
                      <h4>Export steps</h4>
                      <ol>
                        <li>Open Jira and go to Issues.</li>
                        <li>Apply your JQL filter (period + project/team scope).</li>
                        <li>Use Export and choose CSV (Current fields).</li>
                        <li>Upload CSV file(s) here.</li>
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
                  </section>
                </div>

                <aside className="import-right">
                  <section className="panel-box">
                    <h3>Import History</h3>
                    <p>Recent imports across all teams.</p>
                    <div className="history-list">
                      {importHistory.map((item) => (
                        <article key={`${item.teamName}:${item.relativePath}:${item.updatedAt}`}>
                          <strong>{item.name}</strong>
                          <div>{item.teamName}</div>
                          <small>
                            {item.bucket} · {item.rowCount} rows
                          </small>
                        </article>
                      ))}
                      {importHistory.length === 0 && <p className="muted">No imports yet.</p>}
                    </div>
                  </section>

                  <section className="panel-box">
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
                  </section>
                </aside>
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

function getYtdWindowLabel(): string {
  const now = new Date();
  return "Jan-" + now.toLocaleDateString(undefined, { month: "short" });
}

function formatPeriodLabel(period: string): string {
  if (period === "all") {
    return "All time";
  }

  if (period === "ytd") {
    return "YTD " + new Date().getFullYear() + " (" + getYtdWindowLabel() + ")";
  }

  if (period === "ytd-prev") {
    return "YTD " + (new Date().getFullYear() - 1) + " (" + getYtdWindowLabel() + ")";
  }

  if (isMonthPeriod(period)) {
    return formatMonthLabel(period);
  }

  return period;
}

function getPreviousPeriodKey(period: string, availableMonths: string[]): string | null {
  const sortedMonths = availableMonths.filter((value) => isMonthPeriod(value)).sort((a, b) => a.localeCompare(b));

  if (period === "all") {
    return sortedMonths[sortedMonths.length - 1] ?? null;
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

function describePeriod(period: string, availableMonths: string[]): { currentLabel: string; comparisonLabel: string } {
  const previousPeriod = getPreviousPeriodKey(period, availableMonths);

  if (period === "all") {
    return {
      currentLabel: formatPeriodLabel(period),
      comparisonLabel: previousPeriod
        ? "Previous comparison: " + formatPeriodLabel(previousPeriod) + " (latest available month)"
        : "Previous comparison: n/a",
    };
  }

  if (period === "ytd") {
    return {
      currentLabel: formatPeriodLabel(period),
      comparisonLabel: "Previous comparison: " + formatPeriodLabel("ytd-prev") + " (same " + getYtdWindowLabel() + " window)",
    };
  }

  if (isMonthPeriod(period)) {
    return {
      currentLabel: formatPeriodLabel(period),
      comparisonLabel: "Previous comparison: " + formatPeriodLabel(previousPeriod ?? getPreviousMonth(period)) + " (month-over-month)",
    };
  }

  return {
    currentLabel: period,
    comparisonLabel: previousPeriod ? "Previous comparison: " + formatPeriodLabel(previousPeriod) : "Previous comparison: n/a",
  };
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

  if (period === "ytd" || period === "ytd-prev") {
    const [yearRaw, monthRaw] = monthToken.split("-");
    const year = Number.parseInt(yearRaw, 10);
    const monthNum = Number.parseInt(monthRaw, 10);

    if (!Number.isFinite(year) || !Number.isFinite(monthNum)) {
      return false;
    }

    const now = new Date();
    const cutoffMonth = now.getMonth() + 1;
    const targetYear = period === "ytd-prev" ? now.getFullYear() - 1 : now.getFullYear();

    return year === targetYear && monthNum <= cutoffMonth;
  }

  return false;
}

function normalizeJiraQueryConfig(config: JiraQueryConfig | undefined): JiraQueryConfig {
  const fallbackQuery: JiraSavedQuery = {
    id: "default",
    name: "Team Import Query",
    jql: "project = YOURPROJECT ORDER BY updated DESC",
    note: "Edit this query for the team scope.",
  };

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

function composeQueryWithTimeWindow(baseJql: string, window: QueryTimeWindow): string {
  const trimmedBase = baseJql.trim();
  const clause = getTimeWindowClause(window);

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

function getTimeWindowClause(window: QueryTimeWindow): string {
  if (window === "current-month") {
    return "updated >= startOfMonth()";
  }

  if (window === "last-month") {
    return "updated >= startOfMonth(-1) AND updated < startOfMonth()";
  }

  if (window === "ytd") {
    return "updated >= startOfYear()";
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

  return { mode: "monthly-ticket-count" };
}

function normalizeDateOnly(value: string | undefined): string | undefined {
  const normalized = (value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return undefined;
  }

  return normalized;
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

  const details = metrics.doneIssueDetails.filter((item) => isIsoDateInPeriod(item.resolutionDate, periodMonth));
  const issueTypeByKey = new Map<string, string>();
  parsedIssues.forEach((issue) => {
    const key = normalizeTextValue(issue.issueKey);
    if (!key || issueTypeByKey.has(key)) {
      return;
    }
    issueTypeByKey.set(key, issue.issueType);
  });
  const cycleTimes = details
    .map((item) => item.cycleTimeDays)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  const sleCycleTimes = details
    .filter((item) => {
      const effectiveType =
        item.issueType && item.issueType.trim().length > 0
          ? item.issueType
          : issueTypeByKey.get(normalizeTextValue(item.issueKey)) ?? "";
      return isIssueTypeIncludedInSle(effectiveType, teamConfig.sleConfig.issueTypes);
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
  sprintPredictability: {
    label: "Sprint Predictability",
    priority: 11,
    recommendation: "Improve commitment quality and reduce mid-sprint scope changes.",
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
    snapshot.throughputStability.weeklyCvPct === null
      ? createMetricHealth("neutral", "Not enough weekly throughput samples.")
      : snapshot.throughputStability.weeklyCvPct <= 35
        ? createMetricHealth("good", "Throughput is predictable (low variation).")
        : snapshot.throughputStability.weeklyCvPct <= 60
          ? createMetricHealth("warn", "Throughput variation is moderate.")
          : createMetricHealth("bad", "Throughput variation is high; planning risk is elevated.");

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
      : snapshot.flowEfficiency.valuePct >= 35
        ? createMetricHealth("good", "Healthy active-work share.")
        : snapshot.flowEfficiency.valuePct >= 20
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

  const predictability = snapshot.sprintPredictability.latest?.predictabilityPct ?? null;
  const sprintPredictability =
    !snapshot.sprintPredictability.enabled
      ? createMetricHealth("neutral", "Enable sprint cadence to evaluate predictability.")
      : predictability === null
        ? createMetricHealth("neutral", "No sprint commitment baseline.")
        : predictability >= 85 && predictability <= 115
          ? createMetricHealth("good", "Sprint commitment vs delivery is balanced.")
          : (predictability >= 70 && predictability < 85) || (predictability > 115 && predictability <= 130)
            ? createMetricHealth("warn", "Plan-vs-delivery mismatch is visible.")
            : createMetricHealth("bad", "Large planning mismatch; inspect scope churn/commitment quality.");

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
    sprintPredictability,
  };
}

export function buildMetricDataIssues(
  snapshot: TeamHealthSnapshot,
  teamConfig: TeamConfig | undefined,
): MetricDataIssueMap {
  const issues: MetricDataIssueMap = {};
  const velocityConfig = normalizeVelocityConfig(teamConfig?.velocityConfig);

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
      message: "Weekly stability uses less than 4 non-zero weeks. CV is low-confidence.",
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

  if (velocityConfig.mode !== "sprint-story-points") {
    issues.sprintPredictability = {
      tone: "warn",
      message: "Enable 'Sprint based story points' velocity cadence to calculate predictability.",
    };
  } else if (!snapshot.sprintPredictability.latest || snapshot.sprintPredictability.rows.length === 0) {
    issues.sprintPredictability = {
      tone: "bad",
      message: "No sprint buckets matched. Check Sprint start date, length, and sprint field values.",
    };
  } else if (snapshot.sprintPredictability.latest.predictabilityPct === null) {
    issues.sprintPredictability = {
      tone: "warn",
      message: "Latest sprint has 0 commitment baseline. Predictability % cannot be computed.",
    };
  }

  return issues;
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
      avgCycleTimeDays: team.metrics?.avgCycleTimeDays ?? null,
      sleP85Days: team.metrics?.sle.values.p85 ?? null,
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

function resolveBottleneckPeriod(period: string, availableMonths: string[]): string {
  if (isMonthPeriod(period)) {
    return period;
  }

  const sorted = availableMonths.filter((month) => isMonthPeriod(month)).sort((a, b) => a.localeCompare(b));
  return sorted[sorted.length - 1] ?? monthKey(new Date());
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

  const throughputAnchor = resolveThroughputAnchor(selectedPeriod, now);
  const monthNow = throughputAnchor.month;
  const monthPrev = getPreviousMonth(monthNow);
  const anchorMs = throughputAnchor.anchorMs;
  const monthStart = startOfMonthByKey(monthNow) ?? startOfDay(new Date(anchorMs));
  const last30Start = new Date(anchorMs - 29 * 24 * 60 * 60 * 1000);
  const doneWithUpdated = includedIssues.filter((issue) => isDoneByStatus(issue) && issue.updated !== null);
  const createdWithDate = includedIssues.filter((issue) => issue.created !== null);

  const throughput = {
    thisMonth: doneWithUpdated.filter((issue) => {
      return issue.updated !== null && issue.updated.toISOString().slice(0, 7) === monthNow;
    }).length,
    lastMonth: doneWithUpdated.filter((issue) => {
      return issue.updated !== null && issue.updated.toISOString().slice(0, 7) === monthPrev;
    }).length,
    last30Days: doneWithUpdated.filter((issue) => {
      return (
        issue.updated !== null &&
        issue.updated.getTime() >= last30Start.getTime() &&
        issue.updated.getTime() <= anchorMs
      );
    }).length,
  };

  const intakeThroughput = {
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

  const throughputStability = buildThroughputStabilitySnapshot(doneWithUpdated, anchorMs, monthNow);

  const doneInPeriod = doneWithUpdated.filter((issue) => {
    return issue.updated !== null && isIsoDateInPeriod(issue.updated.toISOString(), selectedPeriod);
  });

  const doneBugCount = doneInPeriod.filter((issue) => isBug(issue)).length;
  const doneTotal = doneInPeriod.length;
  const leadTimeByType = buildLeadTimeByTypeSnapshot(doneInPeriod);

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
  const forecast = buildForecastSnapshot(doneWithUpdated, wipIssues, teamConfig, now);
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
  doneWithUpdated: ParsedIssue[],
  anchorMs: number,
  anchorMonth: string,
): ThroughputStabilitySnapshot {
  const weeklyCounts = buildRecentWeeklyCounts(doneWithUpdated, anchorMs, 8);
  const monthlyCounts = buildRecentMonthlyCounts(doneWithUpdated, anchorMonth, 6);

  return {
    weeklyAvg: computeAverage(weeklyCounts),
    weeklyCvPct: computeCoefficientOfVariationPct(weeklyCounts),
    monthlyAvg: computeAverage(monthlyCounts),
    monthlyCvPct: computeCoefficientOfVariationPct(monthlyCounts),
    weeklySamples: weeklyCounts.filter((value) => value > 0).length,
    monthlySamples: monthlyCounts.filter((value) => value > 0).length,
  };
}

function buildRecentWeeklyCounts(doneWithUpdated: ParsedIssue[], anchorMs: number, weeks: number): number[] {
  const anchorDay = startOfDay(new Date(anchorMs));
  const countsByWeek = new Map<string, number>();

  doneWithUpdated.forEach((issue) => {
    if (!issue.updated) {
      return;
    }

    const key = getIsoWeekBucketKey(issue.updated);
    countsByWeek.set(key, (countsByWeek.get(key) ?? 0) + 1);
  });

  const recentKeys: string[] = [];
  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    const bucketDate = new Date(anchorDay.getTime() - offset * 7 * 24 * 60 * 60 * 1000);
    recentKeys.push(getIsoWeekBucketKey(bucketDate));
  }

  return recentKeys.map((key) => countsByWeek.get(key) ?? 0);
}

function buildRecentMonthlyCounts(doneWithUpdated: ParsedIssue[], anchorMonth: string, months: number): number[] {
  const countsByMonth = new Map<string, number>();

  doneWithUpdated.forEach((issue) => {
    if (!issue.updated) {
      return;
    }

    const key = issue.updated.toISOString().slice(0, 7);
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
      over30: 0,
      over60: 0,
      over90: 0,
    };

    current.total += 1;
    if (item.agingDays > 30) {
      current.over30 += 1;
    }
    if (item.agingDays > 60) {
      current.over60 += 1;
    }
    if (item.agingDays > 90) {
      current.over90 += 1;
    }

    grouped.set(key, current);
  });

  const rows = Array.from(grouped.values())
    .sort((a, b) => {
      if (b.over30 !== a.over30) {
        return b.over30 - a.over30;
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
  doneWithUpdated: ParsedIssue[],
  wipIssues: ParsedIssue[],
  teamConfig: TeamConfig | undefined,
  now: Date,
): ForecastSnapshot {
  const sampleDays = 90;
  const simulations = 2000;
  const acceptedTypes = teamConfig?.sleConfig.issueTypes;
  const doneEligible = doneWithUpdated.filter((issue) => isIssueTypeIncludedInSle(issue.issueType, acceptedTypes));
  const backlogCount = wipIssues.filter((issue) => isIssueTypeIncludedInSle(issue.issueType, acceptedTypes)).length;
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

  const acceptedTypes = teamConfig?.sleConfig.issueTypes;
  const createdByBucket = new Map<string, number>();
  const doneByBucket = new Map<string, number>();

  issues.forEach((issue) => {
    if (!isIssueTypeIncludedInSle(issue.issueType, acceptedTypes)) {
      return;
    }

    if (issue.created) {
      const createdBucket = getVelocityBucketKey(issue.created, velocityConfig);
      if (createdBucket) {
        createdByBucket.set(createdBucket, (createdByBucket.get(createdBucket) ?? 0) + 1);
      }
    }

    if (isDone(issue) && issue.updated) {
      const doneBucket = getVelocityBucketKey(issue.updated, velocityConfig);
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

function buildRecentDailyThroughputCounts(doneWithUpdated: ParsedIssue[], now: Date, dayCount: number): number[] {
  const countsByDay = new Map<string, number>();
  const endDay = startOfDay(now).getTime();

  doneWithUpdated.forEach((issue) => {
    if (!issue.updated) {
      return;
    }

    const key = issue.updated.toISOString().slice(0, 10);
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

function resolveThroughputAnchor(period: string, now: Date): { month: string; anchorMs: number } {
  if (!isMonthPeriod(period)) {
    return {
      month: monthKey(now),
      anchorMs: now.getTime(),
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

function normalizeTextValue(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
