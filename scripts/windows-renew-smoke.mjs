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
const exitCodePath = path.join(fixtureRoot, "logs", "renew-team-exit.code");
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

async function canonicalWorkspacePath(value) {
  const raw = String(value).trim().replace(/^(["'])(.*)\1$/, "$2");
  const withoutDevicePrefix = raw.replace(/^\\\\\?\\/, "");
  const normalized = path.win32
    .normalize(path.win32.resolve(withoutDevicePrefix.replaceAll("/", "\\")))
    .replace(/[\\/]+$/, "")
    .toLowerCase();
  try {
    const realPath = await fs.realpath(normalized);
    return path.win32
      .normalize(realPath.replaceAll("/", "\\"))
      .replace(/[\\/]+$/, "")
      .toLowerCase();
  } catch {
    return normalized;
  }
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

function runLauncher(lines, env = {}, successEvidencePath = null, { sendTokenInput = true } = {}) {
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
    let tokenSendCount = 0;
    let tokenSentSource = "";
    let pauseKeyCount = 0;
    let completionReleased = false;
    const sendLine = (line) => {
      if (!child.stdin.destroyed) child.stdin.write(`${line}\r\n`);
    };
    const sendPauseKeyOnce = () => {
      if (pauseKeyCount > 0 || child.stdin.destroyed) return;
      pauseKeyCount += 1;
      child.stdin.write(" \r\n");
    };
    const sendTokenOnce = (source) => {
      if (tokenSent) return;
      tokenSent = true;
      tokenSendCount += 1;
      tokenSentSource = source;
      setTimeout(() => sendLine(lines[2] ?? ""), 0);
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
    const handleOutput = (chunk, source) => {
      output += chunk.toString();
      if (!teamSent && (output.includes("Enter one team number") || output.includes("Team number(s)"))) {
        teamSent = true;
        sendLine(lines[1] ?? "");
      }
      if (sendTokenInput && !tokenSent && (output.includes("Jira token") || output.includes("[STAGE] token-prompt"))) {
        sendTokenOnce(source);
      }
      if (output.includes("Done. Open Scrum Master Tool")) {
        void releasePowerShell(true);
      } else if (output.includes("[ERROR]")) {
        void releasePowerShell(false);
      }
      if (
        output.includes("[OK] renew-team.ps1 completed successfully.") ||
        output.includes("[ERROR] renew-team.ps1 failed with exit code")
      ) {
        sendPauseKeyOnce();
      }
    };
    child.stdout.on("data", (chunk) => handleOutput(chunk, "stdout"));
    child.stderr.on("data", (chunk) => handleOutput(chunk, "stderr"));
    child.once("error", (error) => {
      clearTimeout(timeout);
      if (child.pid) launchedProcessIds.delete(child.pid);
      reject(error);
    });
    child.once("close", (status) => {
      clearTimeout(timeout);
      if (child.pid) launchedProcessIds.delete(child.pid);
      resolve({ status: status ?? -1, output, tokenSent, tokenSendCount, tokenSentSource, pauseKeyCount });
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
  assert(wrapper.includes('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0renew-team.ps1" %*'), "wrapper quoting/PowerShell contract missing");
  assert(!wrapper.includes("-NoExit"), "wrapper must allow PowerShell to return its real exit code");
  const windowsLauncher = await fs.readFile(path.join(fixtureRoot, "renew-team.ps1"), "utf8");
  assert(windowsLauncher.includes('& node -- "$Runner" "$WorkspaceDir" @SelectedTeamIds'), "Windows runner invocation does not preserve quoted workspace arguments");
  assert(windowsLauncher.includes('$ErrorActionPreference = "Continue"'), "Windows runner failure path does not preserve native exit codes");
  assert(windowsLauncher.includes("$RunnerExitCode = [int]$LASTEXITCODE"), "Windows runner failure path does not capture LASTEXITCODE");
  assert(windowsLauncher.includes("Write-RenewExitCode $ExitCode"), "Windows failure path does not persist the native exit code");
  assert(wrapper.includes("renew-team-exit.code"), "CMD wrapper does not read the PowerShell exit-code handoff");
  assert(wrapper.includes('for /f "usebackq delims="'), "CMD wrapper does not robustly read the PowerShell exit-code handoff");
  assert(windowsLauncher.includes('Write-Host "Enter one team number'), "Windows team-selection prompt contract is missing");
  assert(windowsLauncher.includes('hasRealSavedJql(config.jiraQuery)'), "Windows launcher must derive TeamHasJql from saved JQL");
  assert(windowsLauncher.includes('$TeamHasJqlById[$TeamKey]'), "Windows launcher must retain TeamHasJql by team ID");
  assert(windowsLauncher.includes('$TeamId = ([string]@($TeamIds)[$ArrayIndex]).Trim()'), "Windows launcher must normalize the selected team ID");
  assert(windowsLauncher.includes('savedJqlFlag=$HasSavedJql'), "Windows launcher must expose sanitized saved-JQL guard diagnostics");
  assert(windowsLauncher.includes('if (-not $env:JIRA_TOKEN)'), "Windows launcher must retain the token environment guard");
  assert(windowsLauncher.includes('Read-Host "Jira token" -AsSecureString'), "Windows launcher must retain interactive secure token input");

  const success = await runLauncher(
    ["https://jira.example.test", "1", token],
    { JIRA_TOKEN: token },
    path.join(fixtureRoot, "runner-success.json"),
    { sendTokenInput: false },
  );
  assert(success.status === 0, `success launcher exited ${success.status}: ${success.output}`);
  assert((await fs.readFile(exitCodePath, "utf8")).trim() === "0", "success exit-code marker was not numeric zero");
  assert(success.output.includes("[OK] renew-team.ps1 completed successfully."), "CMD wrapper success message was not observed");
  assert(success.pauseKeyCount === 1, `CMD wrapper pause key was not sent exactly once (count=${success.pauseKeyCount})`);
  assert(success.tokenSendCount === 0, `pre-set token path unexpectedly sent stdin (count=${success.tokenSendCount})`);
  assert(success.output.includes("Renewing Jira data"), "env-token path did not reach the bundled runner");
  assert(!success.output.includes(token), "success output leaked the Jira token");
  const successMarker = JSON.parse(await fs.readFile(path.join(fixtureRoot, "runner-success.json"), "utf8"));
  assert(successMarker.teamId === "fixture-team", "runner did not receive the selected team");
  const actualWorkspacePath = String(successMarker.workspace);
  const expectedWorkspacePath = String(fixtureRoot);
  const actualCanonicalPath = await canonicalWorkspacePath(actualWorkspacePath);
  const expectedCanonicalPath = await canonicalWorkspacePath(expectedWorkspacePath);
  const pathDiagnostic = `(actual=${JSON.stringify(actualWorkspacePath)}, expected=${JSON.stringify(expectedWorkspacePath)}, actualCanonical=${JSON.stringify(actualCanonicalPath)}, expectedCanonical=${JSON.stringify(expectedCanonicalPath)})`;
  assert(fixtureRoot.includes(" "), `fixture workspace path must contain spaces ${pathDiagnostic}`);
  assert(actualWorkspacePath.includes(" "), `runner workspace path lost its spaces ${pathDiagnostic}`);
  assert(
    actualCanonicalPath === expectedCanonicalPath,
    `runner did not receive the canonical space-containing workspace path ${pathDiagnostic}`,
  );

  const failed = await runLauncher(["https://jira.example.test", "1", token], { JIRA_TOKEN: token, SM_WIN_SMOKE_MODE: "fail" }, null, { sendTokenInput: false });
  const failedExitMarker = (await fs.readFile(exitCodePath, "utf8")).trim();
  assert(failedExitMarker === "23", `PowerShell exit-code marker mismatch: actual=${JSON.stringify(failedExitMarker)} expected="23"`);
  assert(failed.status === 23, `runner exit code was not propagated: status=${failed.status} marker=${JSON.stringify(failedExitMarker)}\n${failed.output}`);
  const failedLog = await fs.readFile(logPath, "utf8");
  assert(failedLog.includes("launcher=renew-team.ps1 version=0.2.9"), "failure log metadata is missing");
  assert(failedLog.includes("exitCode=23"), "failure log exit code is missing");
  assert(failedLog.includes("[REDACTED]"), "failure log redaction marker is missing");
  assert(!failedLog.includes(token), "failure log leaked the Jira token");
  assert(!failedLog.includes("Authorization: Bearer"), "failure log leaked an Authorization header");
  assert(failed.output.includes("[ERROR]"), "failure was not visible in launcher output");
  assert(failed.output.includes("[ERROR] renew-team.ps1 failed with exit code"), "CMD wrapper failure message was not observed");
  assert(failed.pauseKeyCount === 1, `CMD wrapper failure pause key was not sent exactly once (count=${failed.pauseKeyCount})`);
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
  const missingRunner = await runLauncher(["https://jira.example.test", "exit", ""], { JIRA_TOKEN: token }, null, { sendTokenInput: false });
  assert(missingRunner.status === 1, `missing runner exit code mismatch: ${missingRunner.status}`);
  const missingRunnerLog = await fs.readFile(logPath, "utf8");
  assert(missingRunnerLog.includes("Missing bundled Jira runner"), "missing runner was not logged");
  assert(missingRunner.output.includes("[ERROR]"), "missing runner failure was not visible");
  assert(missingRunner.output.includes("[ERROR] renew-team.ps1 failed with exit code"), "missing runner wrapper error was not visible");
  assert(missingRunner.pauseKeyCount === 1, `missing runner pause key was not sent exactly once (count=${missingRunner.pauseKeyCount})`);
  assert(missingRunnerLog.includes("launcher=renew-team.ps1 version=0.2.9"), "missing runner log metadata is missing");
  assert(missingRunnerLog.includes("exitCode=1"), "missing runner log exit code is missing");
  assert(!missingRunnerLog.includes(token), "missing runner log leaked the Jira token");
  assert(!missingRunner.output.includes(token), "missing runner output leaked the Jira token");

  await fs.writeFile(runnerPath, runnerSource, "utf8");
  await fs.rm(teamsRoot, { recursive: true, force: true });
  const invalidWorkspace = await runLauncher(["https://jira.example.test", "exit", ""], { JIRA_TOKEN: token }, null, { sendTokenInput: false });
  assert(invalidWorkspace.status === 1, `invalid workspace exit code mismatch: ${invalidWorkspace.status}`);
  const invalidWorkspaceLog = await fs.readFile(logPath, "utf8");
  assert(invalidWorkspaceLog.includes("No teams folder found"), "invalid workspace was not logged");
  assert(invalidWorkspace.output.includes("[ERROR]"), "invalid workspace failure was not visible");
  assert(invalidWorkspace.output.includes("[ERROR] renew-team.ps1 failed with exit code"), "invalid workspace wrapper error was not visible");
  assert(invalidWorkspace.pauseKeyCount === 1, `invalid workspace pause key was not sent exactly once (count=${invalidWorkspace.pauseKeyCount})`);
  assert(invalidWorkspaceLog.includes("launcher=renew-team.ps1 version=0.2.9"), "invalid workspace log metadata is missing");
  assert(invalidWorkspaceLog.includes("exitCode=1"), "invalid workspace log exit code is missing");
  assert(!invalidWorkspaceLog.includes(token), "invalid workspace log leaked the Jira token");
  assert(!invalidWorkspace.output.includes(token), "invalid workspace output leaked the Jira token");

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
