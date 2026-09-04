export type RoundingMode = "ceil";

export interface DoneConfig {
  useStatusCategoryDone: boolean;
  doneStatuses?: string[];
}

export interface SleConfig {
  percentiles: number[];
  rounding: RoundingMode;
  issueTypes?: string[];
}

export interface CycleTimeConfig {
  endDateSource: "resolvedOrUpdated" | "updatedOnly";
  durationSource?: "calendar" | "timeInStatus";
}

export type VelocityMode =
  | "monthly-ticket-count"
  | "monthly-story-points"
  | "weekly-ticket-count"
  | "sprint-story-points"
  | "monthly"
  | "weekly"
  | "sprint";

export interface VelocityConfig {
  mode: VelocityMode;
  sprintStartDate?: string;
  sprintLengthWeeks?: number;
}

export interface BugConfig {
  issueTypes?: string[];
  defaultStoryPoints?: number;
}

export interface BottleneckConfig {
  flowStatuses?: string[];
}

export interface SprintScopeConfig {
  statuses?: string[];
}

export interface WorkflowConfig {
  backlogStatuses?: string[];
  funnelStatuses?: string[];
  activeStatuses?: string[];
  implementingStatuses?: string[];
  statusSets?: UnifiedFlowStatusConfig;
}

export interface UnifiedFlowStatusConfig {
  leadStatuses: string[];
  cycleStatuses: string[];
  implementationStatuses: string[];
  doneStatuses: string[];
}

export interface FlowTimingConfig {
  includeClosedTickets?: boolean;
  includeOpenTickets?: boolean;
}

export type TeamEntityType = "team" | "vde" | "art" | "portfolio";

export type SafeEntityType =
  | "team"
  | "agile-release-train"
  | "development-value-stream"
  | "operational-value-stream"
  | "solution-train"
  | "portfolio";

export type SafeMetricId =
  | "business-outcomes"
  | "flow-time"
  | "flow-velocity"
  | "flow-load"
  | "flow-efficiency"
  | "flow-predictability"
  | "flow-distribution"
  | "art-predictability"
  | "built-in-quality"
  | "competency-assessment"
  | "employee-engagement";

export interface SafeConfig {
  enabled: boolean;
  entityType: SafeEntityType;
  metricIds?: SafeMetricId[];
}

export interface CsvMapping {
  key: string;
  created: string;
  resolutionDate: string;
  updated: string;
  status: string;
  resolution: string;
  assignee?: string;
  storyPoints?: string;
  sprint?: string;
  issueType?: string;
  parent?: string;
}

export interface MaintenanceLifecycleConfig {
  maintenanceLifecycleJiraKey?: string;
  source?: "native" | "legacy";
  migrationState?: "native" | "migrated-read" | "needs-review" | "conflict";
  warning?: string;
}

export interface JiraSavedQuery {
  id: string;
  name: string;
  jql: string;
  note?: string;
}

export interface JiraQueryCollection {
  defaultQueryId?: string;
  queries: JiraSavedQuery[];
}

export interface JiraQueryConfig extends JiraQueryCollection {
  issueQuery?: JiraQueryCollection;
  timeInStatusQuery?: JiraQueryCollection;
}

export interface IssueExclusion {
  issueKey: string;
  reason: string;
  category: "data-quality";
  createdAt: string;
}

export interface EngineeringMetricsConfig {
  functionalTestCoveragePct?: number;
  unitTestCoveragePct?: number;
  technicalDebtAvgDays?: number;
  updatedAt?: string;
}

export interface TeamConfig {
  teamName: string;
  description?: string;
  entityType?: TeamEntityType;
  doneConfig: DoneConfig;
  sleConfig: SleConfig;
  cycleTimeConfig?: CycleTimeConfig;
  mapping: CsvMapping;
  velocityConfig?: VelocityConfig;
  bugConfig?: BugConfig;
  bottleneckConfig?: BottleneckConfig;
  sprintScopeConfig?: SprintScopeConfig;
  workflowConfig?: WorkflowConfig;
  flowTimingConfig?: FlowTimingConfig;
  excludedIssueKeys?: string[];
  issueExclusions?: IssueExclusion[];
  engineeringMetrics?: EngineeringMetricsConfig;
  jiraQuery?: JiraQueryConfig;
  safeConfig?: SafeConfig;
  maintenanceLifecycle?: MaintenanceLifecycleConfig;
}

export interface WorkspaceProfileConfig {
  id: string;
  name: string;
  teamIds: string[];
}

export type MetricScope = "team" | "value-stream" | "art" | "portfolio";

export interface WorkspaceMetricConfig {
  scopeVisibility?: Partial<Record<MetricScope, string[]>>;
}

export interface WorkspaceConfig {
  version?: number;
  name?: string;
  profiles?: WorkspaceProfileConfig[];
  activeProfileId?: string;
  metricConfig?: WorkspaceMetricConfig;
}

export interface ParsedIssue {
  issueKey: string;
  previousIssueKeys?: string[];
  created: Date | null;
  projectEnteredAt?: Date | null;
  resolutionDate: Date | null;
  updated: Date | null;
  status: string;
  resolution: string;
  assignee?: string;
  issueType: string;
  parentIssueKey?: string;
  storyPoints: number | null;
  sprintRaw: string;
  sourceFile: string;
  sourceRow: number;
}

export interface ScatterPoint {
  issueKey: string;
  resolutionDate: string;
  cycleTimeDays: number;
}

export interface VelocityPoint {
  month: string;
  value: number;
}

export interface SleValues {
  p50: number | null;
  p70: number | null;
  p85: number | null;
  p95: number | null;
}

export interface DoneIssueDetail {
  issueKey: string;
  resolutionDate: string;
  cycleTimeDays: number | null;
  issueType: string;
  storyPoints: number | null;
  sprintCount: number;
}

export interface FlowTimingMetric {
  count: number;
  avgDays: number | null;
  p50: number | null;
  p70: number | null;
  p85: number | null;
  p95: number | null;
}

export interface FlowTimingMetrics {
  leadTime: FlowTimingMetric;
  activeTime: FlowTimingMetric;
  cycleTime: FlowTimingMetric;
}

export interface FlowTimingIssueDetail {
  issueKey: string;
  issueType?: string;
  anchorDate: string;
  scope: "closed" | "open";
  leadTimeDays: number | null;
  activeTimeDays: number | null;
  cycleTimeDays: number | null;
}

export interface TeamMetrics {
  generatedAt: string;
  teamName: string;
  totalImportedRows: number;
  uniqueIssues: number;
  doneIssues: number;
  cycleTimeCount: number;
  cycleTimeDays: number[];
  avgCycleTimeDays: number | null;
  sle: {
    percentiles: number[];
    rounding: RoundingMode;
    values: SleValues;
  };
  scatter: ScatterPoint[];
  scatterOverlay: SleValues;
  velocityMonthly: VelocityPoint[];
  doneIssueDetails: DoneIssueDetail[];
  flowTiming: FlowTimingMetrics;
  flowTimingBasis?: "working-days";
  flowTimingDetails?: FlowTimingIssueDetail[];
  waitingTime?: WaitingTimeSnapshot;
  maintenanceLifecycle?: MaintenanceLifecycleSnapshot;
  multiSprint: {
    count: number;
    percentage: number;
  };
  multiSprintIssueKeys: string[];
}

export type MaintenanceLifecycleCoverageState = "complete" | "partial" | "unavailable" | "conflict";
export type MaintenanceLifecycleSnapshotState =
  | "not-configured"
  | "invalid-key"
  | "source-missing-parent-field"
  | "configured-not-found"
  | "ready-complete"
  | "ready-partial-unknown-types"
  | "no-recognized-completed-work"
  | "conflict"
  | "stale-last-known"
  | "error-with-retry";

export interface MaintenanceLifecycleSnapshot {
  maintenanceCount?: number;
  lifecycleCount?: number;
  unknownCount?: number;
  candidateCount?: number;
  maintenancePct?: number;
  coverageState: MaintenanceLifecycleCoverageState;
  state?: MaintenanceLifecycleSnapshotState;
  asOf?: string;
  capturedAt?: string;
  source?: "local-import" | "local-cache" | "local-recalculation";
  semanticVersion?: string;
  statusConfigVersion?: string;
  reason?: string;
}

export type WaitingTimeCoverageState = "complete" | "partial" | "unavailable" | "conflict";
export type WaitingTimeSnapshotState =
  | "complete"
  | "partial"
  | "unavailable"
  | "unavailable-no-source"
  | "conflict"
  | "stale-last-known"
  | "needs-review-config"
  | "error-with-retry";

export interface WaitingTimeSnapshot {
  waitingDurationWorkingDays?: number;
  cycleDurationWorkingDays?: number;
  waitingPct?: number;
  sampleCount?: number;
  usableCount?: number;
  unknownCount?: number;
  coverageState: WaitingTimeCoverageState;
  state?: WaitingTimeSnapshotState;
  asOf?: string;
  capturedAt?: string;
  source?: "local-import" | "local-cache" | "local-recalculation";
  semanticVersion?: string;
  statusConfigVersion?: string;
  retryAvailable?: boolean;
  reason?: string;
}

export interface ImportBucket {
  path: string;
  fileCount: number;
}

export interface ImportFileInfo {
  name: string;
  relativePath: string;
  bucket: string;
  updatedAt: string;
  rowCount: number;
}

export interface BottleneckColumn {
  name: string;
  avgDays: number;
  sampleCount?: number;
}

export interface BottleneckEntry {
  period: string;
  columns: BottleneckColumn[];
  notes?: string;
  updatedAt?: string;
}

export interface TeamProgressSnapshot {
  capturedAt: string;
  importSignature: string;
  metrics: {
    doneCount?: number | null;
    avgCycleTimeDays: number | null;
    leadTimeDays?: number | null;
    activeTimeDays?: number | null;
    cycleTimeDays?: number | null;
    sleP50Days?: number | null;
    sleP70Days?: number | null;
    sleP85Days: number | null;
    sleP95Days?: number | null;
    multiSprintPct: number | null;
    velocityLatest: number | null;
    doneBugRatioPct: number | null;
    openWipCount: number;
    openWipAvgAgeDays: number | null;
    waitingTime?: WaitingTimeSnapshot;
    maintenanceLifecycle?: MaintenanceLifecycleSnapshot;
    bottleneck?: string | null;
    source?: "local-import" | "local-cache" | "local-recalculation";
    asOf?: string;
    semanticVersion?: string;
    statusConfigVersion?: string;
    sampleCounts?: Record<string, number | null>;
    usableCounts?: Record<string, number | null>;
    unknownCounts?: Record<string, number | null>;
  };
}

export interface TeamRuntime {
  teamId: string;
  teamHandle: FileSystemDirectoryHandle;
  config: TeamConfig;
  metrics: TeamMetrics | null;
  parsedIssues: ParsedIssue[];
  manualBottleneck: BottleneckEntry[];
  autoBottleneck: BottleneckEntry[];
  autoTimeInStatus: BottleneckEntry[];
  importBuckets: ImportBucket[];
  importFiles: ImportFileInfo[];
  progressHistory: TeamProgressSnapshot[];
}
