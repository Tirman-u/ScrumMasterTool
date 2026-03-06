import path from "node:path";
import { buildMetrics, dedupeIssuesByLatestUpdate } from "./domain/metrics.js";
import { loadWorkspace, writeTeamCache } from "./io/workspace.js";

async function main(): Promise<void> {
  const workspaceArg = getArgValue("--workspace");
  const workspacePath = workspaceArg ? path.resolve(workspaceArg) : process.cwd();

  const workspace = await loadWorkspace(workspacePath);

  if (workspace.teams.length === 0) {
    console.log("No teams found.");
    return;
  }

  for (const team of workspace.teams) {
    const deduped = dedupeIssuesByLatestUpdate(team.issues);
    const metrics = buildMetrics(team.teamConfig, team.totalRows, deduped);

    await writeTeamCache(team.teamPath, deduped, metrics);

    console.log(
      [
        `Team: ${team.teamConfig.teamName} (${team.teamId})`,
        `Rows: ${team.totalRows}`,
        `Unique: ${metrics.uniqueIssues}`,
        `Done: ${metrics.doneIssues}`,
        `SLE P70: ${metrics.sle.values.p70 ?? "n/a"}`,
      ].join(" | "),
    );
  }
}

function getArgValue(flag: string): string | null {
  const index = process.argv.findIndex((value) => value === flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
