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
}

export interface BottleneckConfig {
  flowStatuses?: string[];
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

export interface JiraQueryConfig {
  defaultQueryId?: string;
  queries: JiraSavedQuery[];
}

export interface TeamConfig {
  teamName: string;
  description?: string;
  doneConfig: DoneConfig;
  sleConfig: SleConfig;
  cycleTimeConfig?: CycleTimeConfig;
  mapping: CsvMapping;
  velocityConfig?: VelocityConfig;
  bugConfig?: BugConfig;
  bottleneckConfig?: BottleneckConfig;
  excludedIssueKeys?: string[];
  jiraQuery?: JiraQueryConfig;
}

export interface WorkspaceProfileConfig {
  id: string;
  name: string;
  teamIds: string[];
}

export interface WorkspaceConfig {
  version?: number;
  name?: string;
  profiles?: WorkspaceProfileConfig[];
  activeProfileId?: string;
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
    avgCycleTimeDays: number | null;
    sleP85Days: number | null;
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
