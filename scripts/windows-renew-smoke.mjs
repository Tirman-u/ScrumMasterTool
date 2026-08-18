import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
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
const launchedProcessIds = new Set();

const teamConfig = {
  teamName: "Fixture Team",
  jiraQuery: {
    queries: [{ id: "fixture-query", name: "Fixture query", jql: "project = FIXTURE_PROJECT ORDER BY updated DESC" }],
    defaultQueryId: "fixture-query",
    issueQuery: {
      queries: [{ id: "fixture-query", name: "Fixture query", jql: "project = FIXTURE_PROJECT ORDER BY updated DESC" }],
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

function killProcessTree(pid) {
  if (!pid || process.platform !== "win32") return;
  const commandShell = process.env.ComSpec || process.env.COMSPEC || "cmd.exe";
  spawnSync(commandShell, ["/d", "/c", "taskkill", "/PID", String(pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
}

async function waitForPath(filePath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fs.access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Timed out waiting for smoke evidence: ${filePath}`);
}

function runLauncher(lines, env = {}, successEvidencePath = null) {
  return new Promise((resolve, reject) => {
    const child = spawn("cmd.exe", ["/d", "/c", "renew-team.cmd"], {
      cwd: fixtureRoot,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    if (child.pid) launchedProcessIds.add(child.pid);

    let output = "";
    let timeout;
    let teamSent = false;
    let tokenSent = false;
    let completionReleased = false;
    const sendLine = (line) => {
      if (!child.stdin.destroyed) child.stdin.write(`${line}\r\n`);
    };
    const releasePowerShell = async (isSuccess) => {
      if (completionReleased) return;
      completionReleased = true;
      try {
        if (isSuccess && successEvidencePath) await waitForPath(successEvidencePath);
        if (isSuccess) {
          sendLine("");
          sendLine("exit");
          sendLine("");
        } else {
          sendLine("");
          sendLine("");
        }
      } catch (error) {
        reject(error);
        killProcessTree(child.pid);
      }
    };
    const handleOutput = (chunk) => {
      output += chunk.toString();
      if (!teamSent && (output.includes("Enter one team number") || output.includes("Team number(s)"))) {
        teamSent = true;
        sendLine(lines[1] ?? "");
      }
      if (!tokenSent && (output.includes("Jira token") || output.includes("[STAGE] token-prompt"))) {
        tokenSent = true;
        sendLine(lines[2] ?? "");
      }
      if (output.includes("Done. Open Scrum Master Tool")) {
        void releasePowerShell(true);
      } else if (output.includes("[ERROR]")) {
        void releasePowerShell(false);
      }
    };
    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);
    child.once("error", (error) => {
      clearTimeout(timeout);
      if (child.pid) launchedProcessIds.delete(child.pid);
      reject(error);
    });
    child.once("close", (status) => {
      clearTimeout(timeout);
      if (child.pid) launchedProcessIds.delete(child.pid);
      resolve({ status: status ?? -1, output });
    });
    timeout = setTimeout(() => killProcessTree(child.pid), 30_000);
    sendLine(lines[0] ?? "");
  });
}

async function writeFixtureWorkspace() {
  await fs.mkdir(teamRoot, { recursive: true });
  await fs.mkdir(path.dirname(runnerPath), { recursive: true });
  await fs.writeFile(path.join(fixtureRoot, "workspace.json"), JSON.stringify({ version: 1 }), "utf8");
  await fs.writeFile(path.join(teamRoot, "team.json"), JSON.stringify(teamConfig), "utf8");
  const savedConfig = JSON.parse(await fs.readFile(path.join(teamRoot, "team.json"), "utf8"));
  const savedQueries = [
    ...(savedConfig.jiraQuery?.queries ?? []),
    ...(savedConfig.jiraQuery?.issueQuery?.queries ?? []),
  ];
  assert(
    savedQueries.some((query) => typeof query.jql === "string" && query.jql.trim() && !query.jql.toLowerCase().includes("yourproject")),
    "smoke fixture must contain a realistic saved JQL",
  );
}

async function generateHelpers() {
  assert(fixtureRoot.includes("workspace with spaces"), "fixture path must contain spaces");
  const tsxCli = path.join(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const generator = path.join(repositoryRoot, "src", "generate-renew-launchers.ts");
  const result = spawnSync(process.execPath, [tsxCli, generator, fixtureRoot], {
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
  const windowsLauncher = await fs.readFile(path.join(fixtureRoot, "renew-team.ps1"), "utf8");
  assert(windowsLauncher.includes('& node -- "$Runner" "$WorkspaceDir" @SelectedTeamIds'), "Windows runner invocation does not preserve quoted workspace arguments");
  assert(windowsLauncher.includes('Write-Host "Enter one team number'), "Windows team-selection prompt contract is missing");
  assert(windowsLauncher.includes('hasRealSavedJql(config.jiraQuery)'), "Windows launcher must derive TeamHasJql from saved JQL");
  assert(windowsLauncher.includes('$TeamHasJqlById[$TeamKey]'), "Windows launcher must retain TeamHasJql by team ID");
  assert(windowsLauncher.includes('$TeamId = ([string]@($TeamIds)[$ArrayIndex]).Trim()'), "Windows launcher must normalize the selected team ID");
  assert(windowsLauncher.includes('savedJqlFlag=$HasSavedJql'), "Windows launcher must expose sanitized saved-JQL guard diagnostics");

  const success = await runLauncher(
    ["https://jira.example.test", "1", token],
    {},
    path.join(fixtureRoot, "runner-success.json"),
  );
  assert(success.status === 0, `success launcher exited ${success.status}: ${success.output}`);
  const successMarker = JSON.parse(await fs.readFile(path.join(fixtureRoot, "runner-success.json"), "utf8"));
  assert(successMarker.teamId === "fixture-team", "runner did not receive the selected team");
  assert(successMarker.workspace === fixtureRoot, "runner did not receive the space-containing workspace path");

  const failed = await runLauncher(["https://jira.example.test", "1", token], { SM_WIN_SMOKE_MODE: "fail" });
  assert(failed.status === 23, `runner exit code was not propagated: ${failed.status}\n${failed.output}`);
  const failedLog = await fs.readFile(logPath, "utf8");
  assert(failedLog.includes("launcher=renew-team.ps1 version=0.2.9"), "failure log metadata is missing");
  assert(failedLog.includes("exitCode=23"), "failure log exit code is missing");
  assert(failedLog.includes("[REDACTED]"), "failure log redaction marker is missing");
  assert(!failedLog.includes(token), "failure log leaked the Jira token");
  assert(!failedLog.includes("Authorization: Bearer"), "failure log leaked an Authorization header");
  assert(failed.output.includes("[ERROR]"), "failure was not visible in launcher output");
  assert(!failed.output.includes(token), "visible failure leaked the Jira token");
  assert(!failed.output.includes("Done. Open Scrum Master Tool"), "failure printed a false success message");

  const noJqlConfig = JSON.parse(JSON.stringify(teamConfig));
  noJqlConfig.jiraQuery.queries = [];
  noJqlConfig.jiraQuery.issueQuery.queries = [];
  await fs.writeFile(path.join(teamRoot, "team.json"), JSON.stringify(noJqlConfig), "utf8");
  const noJql = await runLauncher(["https://jira.example.test", "1", "exit", ""]);
  assert(noJql.status === 1, `no-JQL guard exit code mismatch: ${noJql.status}`);
  assert(noJql.output.includes("savedJqlFlag=0"), "no-JQL diagnostic flag was not visible");
  const noJqlLog = await fs.readFile(logPath, "utf8");
  assert(noJqlLog.includes("savedJqlFlag=0"), "no-JQL diagnostic flag was not logged");

  await fs.rm(runnerPath);
  const missingRunner = await runLauncher(["", "exit", ""]);
  assert(missingRunner.status === 1, `missing runner exit code mismatch: ${missingRunner.status}`);
  const missingRunnerLog = await fs.readFile(logPath, "utf8");
  assert(missingRunnerLog.includes("Missing bundled Jira runner"), "missing runner was not logged");

  await fs.rm(teamsRoot, { recursive: true, force: true });
  const invalidWorkspace = await runLauncher(["", "exit", ""]);
  assert(invalidWorkspace.status === 1, `invalid workspace exit code mismatch: ${invalidWorkspace.status}`);
  const invalidWorkspaceLog = await fs.readFile(logPath, "utf8");
  assert(invalidWorkspaceLog.includes("No teams folder found"), "invalid workspace was not logged");

  await writeFixtureWorkspace();
  await fs.writeFile(runnerPath, runnerSource, "utf8");
  const invalidSelection = await runLauncher(["https://jira.example.test", "99", "exit", ""]);
  assert(invalidSelection.status === 1, `invalid selection exit code mismatch: ${invalidSelection.status}`);
  const invalidSelectionLog = await fs.readFile(logPath, "utf8");
  assert(invalidSelectionLog.includes("Invalid team number"), "invalid selection was not logged");

  console.log(`Windows renew smoke test passed in ${fixtureRoot}`);
}

try {
  await main();
} finally {
  for (const pid of launchedProcessIds) killProcessTree(pid);
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
