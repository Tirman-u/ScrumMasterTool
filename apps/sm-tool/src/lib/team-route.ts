import { parseRangePeriod } from "./period";

export type TeamRouteMode = "team" | "scrum-master";
export type TeamRouteTab = "overview" | "cycle";

export interface TeamRouteState {
  page: "team" | "other";
  teamId: string | null;
  mode: TeamRouteMode;
  tab: TeamRouteTab;
  period: string | null;
}

export type TeamRouteHistorySource = "user" | "initial" | "canonicalize" | "popstate";

export function parseTeamRouteSearch(search: string, fallbackMode: TeamRouteMode): TeamRouteState {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  return {
    page: params.get("page") === "team" ? "team" : "other",
    teamId: params.get("team"),
    mode: mode === "team" || mode === "scrum-master" ? mode : fallbackMode,
    tab: params.get("tab") === "cycle" ? "cycle" : "overview",
    period: params.get("period"),
  };
}

export function validateTeamRoute(
  route: TeamRouteState,
  teamIds: readonly string[],
  validPeriods: readonly string[],
): TeamRouteState {
  const validTeam = route.page === "team" && route.teamId !== null && teamIds.includes(route.teamId);
  const validPeriod =
    route.period === null ||
    route.period === "all" ||
    validPeriods.includes(route.period) ||
    parseRangePeriod(route.period) !== null;
  return {
    page: validTeam ? "team" : "other",
    teamId: validTeam ? route.teamId : null,
    mode: route.mode,
    tab: route.tab,
    period: validPeriod ? route.period : null,
  };
}

export function serializeTeamRoute(state: TeamRouteState, currentSearch = ""): string {
  const params = new URLSearchParams(currentSearch);
  if (state.page !== "team" || !state.teamId) {
    params.delete("page");
    params.delete("team");
    params.delete("mode");
    params.delete("tab");
    params.delete("period");
    const query = params.toString();
    return query ? `?${query}` : "";
  }
  params.set("page", "team");
  params.set("team", state.teamId);
  params.set("mode", state.mode);
  params.set("tab", state.tab);
  if (state.period && state.period !== "all") params.set("period", state.period);
  else params.delete("period");
  return `?${params.toString()}`;
}

export function routeHistoryAction(
  source: TeamRouteHistorySource,
  currentSearch: string,
  nextState: TeamRouteState,
): "push" | "replace" | "none" {
  const nextSearch = serializeTeamRoute(nextState, currentSearch);
  if (nextSearch === (currentSearch || "")) return "none";
  return source === "user" ? "push" : source === "canonicalize" || source === "initial" ? "replace" : "none";
}
