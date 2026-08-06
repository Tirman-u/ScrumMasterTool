export type TeamViewMode = "team" | "scrum-master";

export const TEAM_VIEW_STORAGE_KEY = "sm-tool-team-view-mode";

const TEAM_PRESENTATION_METRICS = new Set([
  "velocity",
  "lead-time",
  "active-time",
  "cycle-time",
  "sle-p85",
  "sle-risk",
  "functional-coverage",
  "unit-test-coverage",
  "technical-debt",
  "time-in-status",
]);

export function isMetricAvailableInView(metricId: string, viewMode: TeamViewMode): boolean {
  return viewMode === "scrum-master" || TEAM_PRESENTATION_METRICS.has(metricId);
}

export function normalizeTeamViewMode(value: string | null | undefined): TeamViewMode {
  return value === "team" ? "team" : "scrum-master";
}
