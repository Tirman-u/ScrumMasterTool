import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildMetrics, dedupeIssuesByLatestUpdate } from "../src/domain/metrics.js";
import { loadWorkspace, writeTeamCache } from "../src/io/workspace.js";
import { normalizeTeamProgressSnapshot, writeJsonFile } from "../apps/sm-tool/src/lib/workspace";
import { workingDaysBetween } from "../apps/sm-tool/src/lib/working-days.js";

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
  it("preserves historical flow, categorical bottleneck, and snapshot metadata across reload normalization", () => {
    const raw = {
      capturedAt: "2026-03-28T12:00:00.000Z",
      importSignature: "fixture-import",
      metrics: {
        doneCount: 4,
        avgCycleTimeDays: 3,
        leadTimeDays: 8,
        activeTimeDays: 5,
        cycleTimeDays: 2,
        sleP85Days: 6,
        multiSprintPct: 0,
        velocityLatest: 4,
        doneBugRatioPct: 0,
        openWipCount: 1,
        openWipAvgAgeDays: 2,
        bottleneck: "Review",
        source: "local-import",
        asOf: "2026-03-31",
        semanticVersion: "task-017-v1",
        statusConfigVersion: "workflow-v2",
        maintenanceLifecycle: { coverageState: "partial", state: "ready-partial-unknown-types", maintenanceCount: 1, lifecycleCount: 2, unknownCount: 1, candidateCount: 4, maintenancePct: 33.3, source: "local-import", asOf: "2026-03-31", capturedAt: "2026-03-28T12:00:00.000Z" },
      },
    };
    expect(normalizeTeamProgressSnapshot(raw)?.metrics).toMatchObject({ leadTimeDays: 8, activeTimeDays: 5, cycleTimeDays: 2, bottleneck: "Review", source: "local-import", asOf: "2026-03-31", semanticVersion: "task-017-v1", statusConfigVersion: "workflow-v2" });
    expect(normalizeTeamProgressSnapshot(raw)?.metrics.maintenanceLifecycle).toMatchObject({ maintenanceCount: 1, lifecycleCount: 2, unknownCount: 1, coverageState: "partial", source: "local-import" });
  });
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
    expect(metrics.scatter[0].cycleTimeDays).toBeCloseTo(
      workingDaysBetween(deduped[0].created as Date, deduped[0].resolutionDate as Date),
      8,
    );
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
    expect(metrics.scatter[0].cycleTimeDays).toBeCloseTo(
      workingDaysBetween(deduped[0].created as Date, deduped[0].resolutionDate as Date),
      8,
    );
  });

  it("auto-detects custom field headers for story points and sprint", async () => {
    const workspacePath = await makeTempWorkspace([
      "ALPHA-8,2026-02-01,2026-02-05,2026-02-06,Done,Done,8,Sprint Z",
    ]);

    const teamPath = path.join(workspacePath, "teams", "alpha");
    await fs.writeFile(
      path.join(teamPath, "imports", "jira.csv"),
      [
        "Issue key,Created,Resolved,Updated,Status,Resolution,Custom field (Story Points),Custom field (Sprint)",
        "ALPHA-8,2026-02-01,2026-02-05,2026-02-06,Done,Done,8,Sprint Z",
      ].join("\n"),
      "utf-8",
    );

    const workspace = await loadWorkspace(workspacePath);
    const team = workspace.teams[0];
    const deduped = dedupeIssuesByLatestUpdate(team.issues);
    const metrics = buildMetrics(team.teamConfig, team.totalRows, deduped);

    expect(deduped[0].storyPoints).toBe(8);
    expect(deduped[0].sprintRaw).toBe("Sprint Z");
    expect(metrics.velocityMonthly).toEqual([{ month: "2026-02", value: 8 }]);
  });
});

describe("browser workspace JSON writes", () => {
  class FakeDirectory {
    files = new Map<string, { content: string; failClose?: boolean; failRead?: boolean }>();

    async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFile> {
      if (!this.files.has(name) && !options?.create) throw new Error("not found");
      if (!this.files.has(name)) this.files.set(name, { content: "" });
      return new FakeFile(this, name);
    }

    async removeEntry(name: string): Promise<void> {
      this.files.delete(name);
    }
  }

  class FakeFile {
    constructor(private readonly directory: FakeDirectory, public name: string) {}

    async getFile(): Promise<{ text: () => Promise<string> }> {
      const entry = this.directory.files.get(this.name);
      if (!entry || entry.failRead) throw new Error("injected read-back failure");
      return { text: async () => entry.content };
    }

    async createWritable(): Promise<{ write: (value: string) => Promise<void>; close: () => Promise<void> }> {
      const entry = this.directory.files.get(this.name);
      if (!entry) throw new Error("not found");
      let next = "";
      return {
        write: async (value: string) => { next = value; },
        close: async () => {
          if (entry.failClose) throw new Error("injected close failure");
          entry.content = next;
        },
      };
    }

    async move(nextName: string): Promise<void> {
      const entry = this.directory.files.get(this.name);
      if (!entry) throw new Error("not found");
      if (this.directory.files.has(nextName)) throw new Error("destination exists");
      this.directory.files.delete(this.name);
      this.directory.files.set(nextName, entry);
      this.name = nextName;
    }
  }

  it("keeps the previous destination when temp close/read-back verification fails", async () => {
    const directory = new FakeDirectory();
    directory.files.set("metrics.json", { content: '{"old":true}' });
    const originalGetFileHandle = directory.getFileHandle.bind(directory);
    directory.getFileHandle = async (name, options) => {
      const handle = await originalGetFileHandle(name, options);
      if (name.startsWith(".metrics.json.sm-tmp-")) {
        const entry = directory.files.get(name);
        if (entry) entry.failClose = true;
      }
      return handle;
    };

    await expect(writeJsonFile(directory as unknown as FileSystemDirectoryHandle, "metrics.json", { fresh: true })).rejects.toThrow();
    expect(directory.files.get("metrics.json")?.content).toBe('{"old":true}');
    expect([...directory.files.keys()].filter((name) => name.includes(".sm-tmp-")).length).toBe(0);
  });

  it("replaces an existing destination only after verified temp content", async () => {
    const directory = new FakeDirectory();
    directory.files.set("metrics.json", { content: '{"old":true}' });
    await writeJsonFile(directory as unknown as FileSystemDirectoryHandle, "metrics.json", { fresh: true });
    expect(directory.files.get("metrics.json")?.content).toBe(JSON.stringify({ fresh: true }, null, 2));
    expect([...directory.files.keys()].some((name) => name.includes(".sm-backup-") || name.includes(".sm-tmp-"))).toBe(false);
  });

  it("preserves the destination when stable read-back fails", async () => {
    const directory = new FakeDirectory();
    directory.files.set("metrics.json", { content: '{"old":true}' });
    const originalGetFileHandle = directory.getFileHandle.bind(directory);
    directory.getFileHandle = async (name, options) => {
      const handle = await originalGetFileHandle(name, options);
      if (name.startsWith(".metrics.json.sm-tmp-")) {
        const entry = directory.files.get(name);
        if (entry) entry.failRead = true;
      }
      return handle;
    };

    await expect(writeJsonFile(directory as unknown as FileSystemDirectoryHandle, "metrics.json", { fresh: true })).rejects.toThrow();
    expect(directory.files.get("metrics.json")?.content).toBe('{"old":true}');
  });
});
