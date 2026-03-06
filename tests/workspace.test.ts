import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildMetrics, dedupeIssuesByLatestUpdate } from "../src/domain/metrics.js";
import { loadWorkspace, writeTeamCache } from "../src/io/workspace.js";

const HEADER = "Issue key,Created,Resolved,Updated,Status,Resolution,Story points,Sprint,Sprint";

async function makeTempWorkspace(csvRows: string[]): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sm-tool-test-"));
  await fs.mkdir(path.join(root, "teams", "alpha", "imports"), { recursive: true });

  await fs.writeFile(path.join(root, "workspace.json"), JSON.stringify({ version: 1 }, null, 2), "utf-8");

  const teamConfig = {
    teamName: "Alpha",
    doneConfig: {
      useStatusCategoryDone: false,
      doneStatuses: ["Done"],
    },
    sleConfig: {
      percentiles: [50, 70, 85, 95],
      rounding: "ceil",
    },
    mapping: {
      key: "Issue key",
      created: "Created",
      resolutionDate: "Resolved",
      updated: "Updated",
      status: "Status",
      resolution: "Resolution",
      storyPoints: "Story points",
      sprint: "Sprint",
    },
  };

  await fs.writeFile(path.join(root, "teams", "alpha", "team.json"), JSON.stringify(teamConfig, null, 2), "utf-8");

  const csv = [HEADER, ...csvRows].join("\n");

  await fs.writeFile(path.join(root, "teams", "alpha", "imports", "jira.csv"), csv, "utf-8");

  return root;
}

describe("workspace pipeline", () => {
  it("loads, dedupes and writes local cache files", async () => {
    const workspacePath = await makeTempWorkspace([
      "ALPHA-1,2026-01-01,2026-01-03,2026-01-04,Done,Done,3,Sprint A,",
      "ALPHA-1,2026-01-01,2026-01-05,2026-01-06,Done,Done,5,Sprint A,Sprint B",
      "ALPHA-2,2026-01-02,2026-01-04,2026-01-05,Done,Done,,Sprint A,",
    ]);

    const workspace = await loadWorkspace(workspacePath);
    expect(workspace.teams).toHaveLength(1);

    const team = workspace.teams[0];
    expect(team.totalRows).toBe(3);

    const deduped = dedupeIssuesByLatestUpdate(team.issues);
    expect(deduped).toHaveLength(2);

    const metrics = buildMetrics(team.teamConfig, team.totalRows, deduped);
    expect(metrics.velocityMonthly).toEqual([{ month: "2026-01", value: 6 }]);
    expect(metrics.multiSprintIssueKeys).toEqual(["ALPHA-1"]);

    await writeTeamCache(team.teamPath, deduped, metrics);

    const parsedJson = JSON.parse(await fs.readFile(path.join(team.teamPath, "cache", "parsed.json"), "utf-8"));
    const metricsJson = JSON.parse(await fs.readFile(path.join(team.teamPath, "cache", "metrics.json"), "utf-8"));

    expect(parsedJson).toHaveLength(2);
    expect(metricsJson.uniqueIssues).toBe(2);
    expect(metricsJson.doneIssueDetails).toHaveLength(2);
    expect(metricsJson.multiSprint).toEqual({
      count: 1,
      percentage: 50,
    });
  });

  it("falls back to updated date when resolved is empty", async () => {
    const workspacePath = await makeTempWorkspace([
      "ALPHA-9,2026-01-01,,2026-01-04,Done,Done,2,Sprint X,",
    ]);

    const workspace = await loadWorkspace(workspacePath);
    const team = workspace.teams[0];
    const deduped = dedupeIssuesByLatestUpdate(team.issues);

    const metrics = buildMetrics(team.teamConfig, team.totalRows, deduped);

    expect(metrics.cycleTimeCount).toBe(1);
    expect(metrics.scatter[0].cycleTimeDays).toBe(3);
    expect(metrics.velocityMonthly).toEqual([{ month: "2026-01", value: 2 }]);
  });

  it("loads CSV files recursively from imports subfolders", async () => {
    const workspacePath = await makeTempWorkspace([
      "ALPHA-1,2026-01-01,2026-01-03,2026-01-04,Done,Done,1,Sprint A,",
    ]);

    const nestedDir = path.join(workspacePath, "teams", "alpha", "imports", "2026-02");
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(
      path.join(nestedDir, "feb.csv"),
      [HEADER, "ALPHA-2,2026-02-01,2026-02-05,2026-02-05,Done,Done,2,Sprint B,Sprint C"].join("\n"),
      "utf-8",
    );

    const workspace = await loadWorkspace(workspacePath);
    const team = workspace.teams[0];

    expect(team.totalRows).toBe(2);
    expect(team.issues.map((issue) => issue.sourceFile).sort()).toEqual(["2026-02/feb.csv", "jira.csv"]);
  });

  it("uses updated date when cycle end source is updatedOnly and maps issue type", async () => {
    const workspacePath = await makeTempWorkspace([
      "ALPHA-7,2026-01-01,2026-01-03,2026-01-10,Done,Done,3,Sprint A,,Bug",
    ]);

    const teamPath = path.join(workspacePath, "teams", "alpha");
    await fs.writeFile(
      path.join(teamPath, "imports", "jira.csv"),
      [
        "Issue key,Created,Resolved,Updated,Status,Resolution,Story points,Sprint,Sprint,Issue Type",
        "ALPHA-7,2026-01-01,2026-01-03,2026-01-10,Done,Done,3,Sprint A,,Bug",
      ].join("\n"),
      "utf-8",
    );

    const teamConfigPath = path.join(teamPath, "team.json");
    const teamConfig = JSON.parse(await fs.readFile(teamConfigPath, "utf-8")) as Record<string, unknown>;
    teamConfig.cycleTimeConfig = { endDateSource: "updatedOnly" };
    const mapping = teamConfig.mapping as Record<string, string>;
    mapping.issueType = "Issue Type";
    await fs.writeFile(teamConfigPath, JSON.stringify(teamConfig, null, 2), "utf-8");

    const workspace = await loadWorkspace(workspacePath);
    const team = workspace.teams[0];
    const deduped = dedupeIssuesByLatestUpdate(team.issues);
    const metrics = buildMetrics(team.teamConfig, team.totalRows, deduped);

    expect(deduped[0].issueType).toBe("Bug");
    expect(metrics.scatter[0].cycleTimeDays).toBe(9);
  });
});
