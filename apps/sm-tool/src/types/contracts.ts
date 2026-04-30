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
  activeStatuses?: string[];
}

export type TeamEntityType = "team" | "vde" | "art";

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
  storyPoints?: string;
  sprint?: string;
  issueType?: string;
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
  excludedIssueKeys?: string[];
  jiraQuery?: JiraQueryConfig;
  safeConfig?: SafeConfig;
}

export interface WorkspaceProfileConfig {
  id: string;
  name: string;
  teamIds: string[];
}

export type MetricScope = "team" | "value-stream" | "art";

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
  created: Date | null;
  resolutionDate: Date | null;
  updated: Date | null;
  status: string;
  resolution: string;
  issueType: string;
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
  issueType?: string;
  storyPoints: number | null;
  sprintCount: number;
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
  multiSprint: {
    count: number;
    percentage: number;
  };
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
    sleP50Days?: number | null;
    sleP70Days?: number | null;
    sleP85Days: number | null;
    sleP95Days?: number | null;
    multiSprintPct: number | null;
    velocityLatest: number | null;
    doneBugRatioPct: number | null;
    openWipCount: number;
    openWipAvgAgeDays: number | null;
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
  importBuckets: ImportBucket[];
  importFiles: ImportFileInfo[];
  progressHistory: TeamProgressSnapshot[];
}
