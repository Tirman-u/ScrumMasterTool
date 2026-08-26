import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTeamDataStatus } from "../apps/sm-tool/src/lib/team-data-status";
import { buildRangePeriod, isMonthPeriod, parseRangePeriod } from "../apps/sm-tool/src/lib/period";
import { parseTeamRouteSearch, routeHistoryAction, serializeTeamRoute, validateTeamRoute } from "../apps/sm-tool/src/lib/team-route";
import { recalculateSelectedTeam } from "../apps/sm-tool/src/lib/team-recalculate";

const appSource = readFileSync("apps/sm-tool/src/App.tsx", "utf8");
const viewsSource = readFileSync("apps/sm-tool/src/components/ExecutiveViews.tsx", "utf8");
const stylesSource = readFileSync("apps/sm-tool/src/styles.css", "utf8");

describe("TASK 005 team route and data status", () => {
  it("uses the latest valid import timestamp and distinguishes stale data", () => {
    const stale = buildTeamDataStatus(
      [{ updatedAt: "not-a-date" }, { updatedAt: "2026-08-21T14:32:00.000Z" }, { updatedAt: "2026-08-20T10:00:00.000Z" }],
      "2026-08-21T14:30:00.000Z",
    );
    expect(stale.latestDataUpdate).toBe("2026-08-21T14:32:00.000Z");
    expect(stale.lastCalculated).toBe("2026-08-21T14:30:00.000Z");
    expect(stale.stale).toBe(true);

    const unavailable = buildTeamDataStatus([{ updatedAt: "invalid" }], "invalid");
    expect(unavailable).toEqual({ latestDataUpdate: null, lastCalculated: null, stale: false });
  });

  it("keeps active route tabs, period, local recalculate, and mode content split in source wiring", () => {
    expect(viewsSource).toContain('role="tablist" aria-label="Team detail tabs"');
    expect(viewsSource).toContain('id={overviewPanelId} role="tabpanel"');
    expect(viewsSource).toContain('id={cyclePanelId} role="tabpanel"');
    expect(viewsSource).toContain("window.requestAnimationFrame");
    expect(viewsSource).toContain("All period-sensitive metrics use this selection.");
    expect(viewsSource).toContain("<CycleTimePanel data={data} presentationMode={!diagnostic} />");
    expect(viewsSource).toContain("{mode === \"team\" ? <TeamDesignView data={data} /> : <ScrumMasterDesignView data={data} />}");
    expect(appSource).toContain("recalculateSelectedTeam(");
    expect(viewsSource).toContain("Recalculate team");
    expect(appSource).toContain("writeTeamRoute");
    expect(appSource).toContain("window.addEventListener(\"popstate\"");
    expect(appSource).not.toContain("fetch(\"/rest");
    expect(stylesSource).toContain(".exec-team-tabs");
    expect(stylesSource).toContain(".exec-data-status-panel");
  });

  it("parses, validates, serializes and histories deep links without loops", () => {
    expect(isMonthPeriod("2026-01")).toBe(true);
    expect(isMonthPeriod("2026-12")).toBe(true);
    for (const invalidMonth of ["2026-00", "2026-13", "2026-99", "2026-1", "2026-001"]) {
      expect(isMonthPeriod(invalidMonth)).toBe(false);
    }
    expect(parseRangePeriod("range:2026-01..2026-12")).toEqual({ startMonth: "2026-01", endMonth: "2026-12" });
    for (const invalidRange of [
      "range:2026-00..2026-12",
      "range:2026-01..2026-13",
      "range:2026-99..2026-12",
      "range:2026-01..2026-1",
      "range:2026-01:2026-12",
    ]) {
      expect(parseRangePeriod(invalidRange)).toBeNull();
    }

    const parsed = parseTeamRouteSearch("?page=team&team=alpha&mode=team&tab=cycle&period=2026-08", "scrum-master");
    expect(parsed).toEqual({ page: "team", teamId: "alpha", mode: "team", tab: "cycle", period: "2026-08" });
    const validated = validateTeamRoute(parsed, ["alpha", "beta"], ["2026-08", "2026-07"]);
    expect(validated).toEqual(parsed);
    expect(serializeTeamRoute(validated)).toBe("?page=team&team=alpha&mode=team&tab=cycle&period=2026-08");

    const invalid = validateTeamRoute(
      parseTeamRouteSearch("?page=team&team=missing&mode=unknown&tab=unknown&period=not-valid", "scrum-master"),
      ["alpha"],
      ["2026-08"],
    );
    expect(invalid.page).toBe("other");
    expect(invalid.teamId).toBeNull();
    expect(invalid.period).toBeNull();
    const invalidMonthRoute = validateTeamRoute(
      parseTeamRouteSearch("?page=team&team=alpha&mode=team&tab=overview&period=2026-99", "scrum-master"),
      ["alpha"],
      ["2026-08"],
    );
    expect(invalidMonthRoute.page).toBe("team");
    expect(invalidMonthRoute.period).toBeNull();

    expect(routeHistoryAction("user", "?page=team&team=alpha&mode=team&tab=overview", { ...validated, tab: "cycle" })).toBe("push");
    expect(routeHistoryAction("canonicalize", "?page=team&team=alpha", validated)).toBe("replace");
    expect(routeHistoryAction("popstate", serializeTeamRoute(validated), validated)).toBe("none");
    expect(routeHistoryAction("user", serializeTeamRoute(validated), validated)).toBe("none");

    const rangePeriod = buildRangePeriod("2026-01", "2026-03");
    expect(rangePeriod).toBe("range:2026-01..2026-03");
    const range = validateTeamRoute(
      parseTeamRouteSearch(`?page=team&team=alpha&mode=team&tab=overview&period=${encodeURIComponent(rangePeriod)}`, "scrum-master"),
      ["alpha"],
      ["2026-08"],
    );
    expect(range.page).toBe("team");
    expect(range.period).toBe(rangePeriod);
    expect(parseTeamRouteSearch(serializeTeamRoute(range), "scrum-master").period).toBe(rangePeriod);
    expect(
      validateTeamRoute(
        parseTeamRouteSearch("?page=team&team=alpha&mode=team&tab=overview&period=2026-01:2026-03", "scrum-master"),
        ["alpha"],
        ["2026-08"],
      ).period,
    ).toBeNull();

    const history = [serializeTeamRoute({ ...validated, tab: "overview" })];
    let cursor = 0;
    const cycleSearch = serializeTeamRoute(validated);
    expect(routeHistoryAction("user", history[cursor], validated)).toBe("push");
    history.push(cycleSearch);
    cursor = history.length - 1;
    const restored = validateTeamRoute(parseTeamRouteSearch(history[cursor - 1], "scrum-master"), ["alpha", "beta"], ["2026-08"]);
    expect(restored.tab).toBe("overview");
    expect(routeHistoryAction("popstate", history[cursor - 1], restored)).toBe("none");
  });

  it("recalculates only the selected team, suppresses duplicates, and preserves old data on failure", async () => {
    const analyzed: string[] = [];
    const refreshed: string[] = [];
    const selected = { id: "alpha", generatedAt: "old" };
    const result = await recalculateSelectedTeam(
      {
        selectedTeam: selected,
        workspaceAvailable: true,
        analyzeTeam: async (team) => { analyzed.push(team.id); },
        refreshTeam: async (team) => { refreshed.push(team.id); return { ...team, generatedAt: "new" }; },
        onSuccess: () => undefined,
        onError: () => undefined,
      },
      false,
    );
    expect(result).toEqual({ state: "success", team: { id: "alpha", generatedAt: "new" } });
    const routeBeforeRecalculate = serializeTeamRoute({ page: "team", teamId: "alpha", mode: "team", tab: "cycle", period: buildRangePeriod("2026-01", "2026-03") });
    expect(analyzed).toEqual(["alpha"]);
    expect(routeBeforeRecalculate).toBe("?page=team&team=alpha&mode=team&tab=cycle&period=range%3A2026-01..2026-03");
    expect(refreshed).toEqual(["alpha"]);
    expect(await recalculateSelectedTeam({ selectedTeam: selected, workspaceAvailable: true, analyzeTeam: async () => { throw new Error("must not run"); }, refreshTeam: async (team) => team, onSuccess: () => undefined, onError: () => undefined }, true)).toEqual({ state: "loading" });

    let retained = selected;
    const failed = await recalculateSelectedTeam(
      {
        selectedTeam: selected,
        workspaceAvailable: true,
        analyzeTeam: async () => { throw new Error("local analysis failed"); },
        refreshTeam: async (team) => team,
        onSuccess: (team) => { retained = team; },
        onError: () => undefined,
      },
      false,
    );
    expect(failed.state).toBe("error");
    expect(retained).toBe(selected);
  });
});
