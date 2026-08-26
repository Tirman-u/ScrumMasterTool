export type TeamRecalculateState = "idle" | "loading" | "success" | "error" | "unavailable";

export interface TeamRecalculateInput<Team> {
  selectedTeam: Team | null;
  workspaceAvailable: boolean;
  analyzeTeam: (team: Team) => Promise<unknown>;
  refreshTeam: (team: Team) => Promise<Team>;
  onSuccess: (team: Team) => void;
  onError: (error: unknown) => void;
}

export interface TeamRecalculateResult<Team> {
  state: TeamRecalculateState;
  team?: Team;
  error?: unknown;
}

export async function recalculateSelectedTeam<Team>(
  input: TeamRecalculateInput<Team>,
  isRunning: boolean,
): Promise<TeamRecalculateResult<Team>> {
  if (isRunning) return { state: "loading" };
  if (!input.workspaceAvailable || input.selectedTeam === null) return { state: "unavailable" };
  try {
    await input.analyzeTeam(input.selectedTeam);
    const refreshed = await input.refreshTeam(input.selectedTeam);
    input.onSuccess(refreshed);
    return { state: "success", team: refreshed };
  } catch (error) {
    input.onError(error);
    return { state: "error", error };
  }
}
