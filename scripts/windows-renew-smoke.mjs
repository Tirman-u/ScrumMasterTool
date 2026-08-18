import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("Windows renew smoke test skipped: this test requires Windows PowerShell and cmd.exe.");
  process.exit(0);
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sm-tool-windows-renew-"));
const fixtureRoot = path.join(temporaryRoot, "workspace with spaces");
const teamsRoot = path.join(fixtureRoot, "Teams");
const teamRoot = path.join(teamsRoot, "fixture-team");
const runnerPath = path.join(fixtureRoot, "sm-tool", "jira-pull.mjs");
const logPath = path.join(fixtureRoot, "logs", "renew-team-error.log");
const token = "fixture-token-never-log-this";

const teamConfig = {
  teamName: "Fixture Team",
  jiraQuery: {
    issueQuery: {
      queries: [{ id: "fixture-query", name: "Fixture query", jql: "project = YOUR_PROJECT_KEY" }],
      defaultQueryId: "fixture-query",
    },
  },
};

const runnerSource = `import { promises as fs } from "node:fs";
import path from "node:path";

const [workspace, teamId] = process.argv.slice(2);
if (!workspace || !teamId || !path.isAbsolute(workspace) || teamId !== "fixture-team") {
  console.error("invalid runner arguments");
  process.exit(31);
}

if (process.env.SM_WIN_SMOKE_MODE === "fail") {
  console.error(\`runner failure token=\${process.env.JIRA_TOKEN} Authorization: Bearer \${process.env.JIRA_TOKEN}\`);
  process.exit(23);
}

await fs.writeFile(path.join(workspace, "runner-success.json"), JSON.stringify({ workspace, teamId }));
`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runLauncher(lines, env = {}) {
  const result = spawnSync("cmd.exe", ["/d", "/c", "renew-team.cmd"], {
    cwd: fixtureRoot,
    env: { ...process.env, ...env },
    input: `${lines.join("\r\n")}\r\n`,
    encoding: "utf8",
    timeout: 30_000,
  });

  if (result.error) throw result.error;
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

async function writeFixtureWorkspace() {
  await fs.mkdir(teamRoot, { recursive: true });
  await fs.mkdir(path.dirname(runnerPath), { recursive: true });
  await fs.writeFile(path.join(fixtureRoot, "workspace.json"), JSON.stringify({ version: 1 }), "utf8");
  await fs.writeFile(path.join(teamRoot, "team.json"), JSON.stringify(teamConfig), "utf8");
}

async function generateHelpers() {
  const result = spawnSync("npm.cmd", ["run", "generate:renew-launchers", "--", fixtureRoot], {
    cwd: repositoryRoot,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  assert(result.status === 0, `launcher generation failed: ${result.stdout}\n${result.stderr}`);
  await fs.writeFile(runnerPath, runnerSource, "utf8");
}

async function main() {
  await writeFixtureWorkspace();
  await generateHelpers();

  const wrapper = await fs.readFile(path.join(fixtureRoot, "renew-team.cmd"), "utf8");
  assert(wrapper.includes('powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "%~dp0renew-team.ps1" %*'), "wrapper quoting/NoExit contract missing");

  const success = runLauncher(["https://jira.example.test", "1", token, "", "exit", ""]);
  assert(success.status === 0, `success launcher exited ${success.status}: ${success.output}`);
  const successMarker = JSON.parse(await fs.readFile(path.join(fixtureRoot, "runner-success.json"), "utf8"));
  assert(successMarker.teamId === "fixture-team", "runner did not receive the selected team");
  assert(successMarker.workspace === fixtureRoot, "runner did not receive the space-containing workspace path");

  const failed = runLauncher(["https://jira.example.test", "1", token, "", "exit", ""], { SM_WIN_SMOKE_MODE: "fail" });
  assert(failed.status === 23, `runner exit code was not propagated: ${failed.status}\n${failed.output}`);
  const failedLog = await fs.readFile(logPath, "utf8");
  assert(failedLog.includes("launcher=renew-team.ps1 version=0.2.4"), "failure log metadata is missing");
  assert(failedLog.includes("exitCode=23"), "failure log exit code is missing");
  assert(failedLog.includes("[REDACTED]"), "failure log redaction marker is missing");
  assert(!failedLog.includes(token), "failure log leaked the Jira token");
  assert(!failedLog.includes("Authorization: Bearer"), "failure log leaked an Authorization header");
  assert(failed.output.includes("[ERROR]"), "failure was not visible in launcher output");
  assert(!failed.output.includes(token), "visible failure leaked the Jira token");
  assert(!failed.output.includes("Done. Open Scrum Master Tool"), "failure printed a false success message");

  await fs.rm(runnerPath);
  const missingRunner = runLauncher(["", "exit", ""]);
  assert(missingRunner.status === 1, `missing runner exit code mismatch: ${missingRunner.status}`);
  const missingRunnerLog = await fs.readFile(logPath, "utf8");
  assert(missingRunnerLog.includes("Missing bundled Jira runner"), "missing runner was not logged");

  await fs.rm(teamsRoot, { recursive: true, force: true });
  const invalidWorkspace = runLauncher(["", "exit", ""]);
  assert(invalidWorkspace.status === 1, `invalid workspace exit code mismatch: ${invalidWorkspace.status}`);
  const invalidWorkspaceLog = await fs.readFile(logPath, "utf8");
  assert(invalidWorkspaceLog.includes("No teams folder found"), "invalid workspace was not logged");

  await writeFixtureWorkspace();
  await fs.writeFile(runnerPath, runnerSource, "utf8");
  const invalidSelection = runLauncher(["https://jira.example.test", "99", "exit", ""]);
  assert(invalidSelection.status === 1, `invalid selection exit code mismatch: ${invalidSelection.status}`);
  const invalidSelectionLog = await fs.readFile(logPath, "utf8");
  assert(invalidSelectionLog.includes("Invalid team number"), "invalid selection was not logged");

  console.log(`Windows renew smoke test passed in ${fixtureRoot}`);
}

try {
  await main();
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
