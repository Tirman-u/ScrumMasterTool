import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";

const DEFAULT_JIRA_URL = "https://jira.company.net";
const DEFAULT_JIRA_AUTH = "bearer";
const DEFAULT_MAX_ISSUES = 2000;
const DEFAULT_BUCKET = "jira-api";
const MASTER_LAUNCHER_NAME = "renew-team.command";
const WINDOWS_MASTER_LAUNCHER_NAME = "renew-team.ps1";
const WINDOWS_WRAPPER_NAME = "renew-team.cmd";
const LEGACY_TEAM_LAUNCHER_NAME = "renew-data.command";
const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const workspacePath = path.resolve(process.argv[2] ?? process.cwd());
  const teamsPath = await resolveTeamsPath(workspacePath);

  const launcherPath = path.join(workspacePath, MASTER_LAUNCHER_NAME);
  await fs.writeFile(launcherPath, buildMasterLauncher(), "utf-8");
  await fs.chmod(launcherPath, 0o755);
  await clearMacQuarantine(launcherPath);

  const windowsLauncherPath = path.join(workspacePath, WINDOWS_MASTER_LAUNCHER_NAME);
  await fs.writeFile(windowsLauncherPath, buildWindowsMasterLauncher(), "utf-8");

  const windowsWrapperPath = path.join(workspacePath, WINDOWS_WRAPPER_NAME);
  await fs.writeFile(windowsWrapperPath, buildWindowsWrapper(), "utf-8");

  const removedLegacyLaunchers = await removeLegacyTeamLaunchers(teamsPath);

  console.log(`Wrote ${path.relative(process.cwd(), launcherPath) || launcherPath}.`);
  console.log(`Wrote ${path.relative(process.cwd(), windowsLauncherPath) || windowsLauncherPath}.`);
  console.log(`Wrote ${path.relative(process.cwd(), windowsWrapperPath) || windowsWrapperPath}.`);
  if (removedLegacyLaunchers > 0) {
    console.log(`Removed ${removedLegacyLaunchers} legacy per-team launcher(s).`);
  }
}

function buildMasterLauncher(): string {
  const lines = [
    "#!/bin/zsh",
    "set -euo pipefail",
    "",
    'SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"',
    'WORKSPACE_DIR="$SCRIPT_DIR"',
    'RUNNER="$SCRIPT_DIR/sm-tool/jira-pull.mjs"',
    "",
    'export JIRA_URL="${JIRA_URL:-' + DEFAULT_JIRA_URL + '}"',
    'export JIRA_AUTH="${JIRA_AUTH:-' + DEFAULT_JIRA_AUTH + '}"',
    'export JIRA_IMPORT_BUCKET="${JIRA_IMPORT_BUCKET:-' + DEFAULT_BUCKET + '}"',
    'export JIRA_MAX_ISSUES="${JIRA_MAX_ISSUES:-' + DEFAULT_MAX_ISSUES + '}"',
    "export NODE_USE_SYSTEM_CA=1",
    "",
    "setup_node_ca() {",
    '  if [[ "$(uname -s)" != "Darwin" ]] || ! command -v security >/dev/null 2>&1; then',
    "    return",
    "  fi",
    "",
    '  local ca_bundle="${TMPDIR:-/tmp}/smtool-node-ca.pem"',
    '  : > "$ca_bundle"',
    "",
    '  security find-certificate -a -p /Library/Keychains/System.keychain >> "$ca_bundle" 2>/dev/null || true',
    '  security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain >> "$ca_bundle" 2>/dev/null || true',
    '  security find-certificate -a -p "$HOME/Library/Keychains/login.keychain-db" >> "$ca_bundle" 2>/dev/null || true',
    "",
    '  if [[ -s "$ca_bundle" ]]; then',
    '    export NODE_EXTRA_CA_CERTS="$ca_bundle"',
    "  fi",
    "}",
    "",
    "setup_node_ca",
    "",
    'if ! command -v node >/dev/null 2>&1; then',
    '  echo "Node.js 18+ is required to refresh Jira data."',
    "  exit 1",
    "fi",
    "",
    'NODE_MAJOR="$(node -p \'Number(process.versions.node.split(".")[0])\')"',
    'if (( NODE_MAJOR < 18 )); then',
    '  echo "Node.js 18+ is required. Current: $(node --version)"',
    "  exit 1",
    "fi",
    "",
    'if [[ ! -f "$RUNNER" ]]; then',
    '  echo "Missing bundled Jira runner: $RUNNER"',
    '  echo "Choose this workspace again in Scrum Master Tool to restore it."',
    "  exit 1",
    "fi",
    "",
    'if [[ -d "$WORKSPACE_DIR/teams" ]]; then',
    '  TEAMS_DIR="$WORKSPACE_DIR/teams"',
    'elif [[ -d "$WORKSPACE_DIR/Teams" ]]; then',
    '  TEAMS_DIR="$WORKSPACE_DIR/Teams"',
    "else",
    '  echo "No teams folder found under: $WORKSPACE_DIR"',
    "  exit 1",
    "fi",
    "",
    'TEAM_LIST="$(node - "$TEAMS_DIR" <<\'NODE\'',
    'const fs = require("fs");',
    'const path = require("path");',
    'const teamsDir = process.argv[2];',
    'function normalize(value) { return String(value || "").trim().toLowerCase(); }',
    'function hasRealSavedJql(jiraQuery) {',
    '  const queries = [...(jiraQuery?.queries || []), ...(jiraQuery?.issueQuery?.queries || [])];',
    '  return queries.some((query) => {',
    '    const jql = normalize(query?.jql);',
    '    return jql.length > 0 && !jql.includes("yourproject");',
    '  });',
    "}",
    'for (const entry of fs.readdirSync(teamsDir, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {',
    '  const configPath = path.join(teamsDir, entry.name, "team.json");',
    '  if (!fs.existsSync(configPath)) continue;',
    '  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));',
    '  const name = String(config.teamName || entry.name).replace(/[\\t\\r\\n]+/g, " ").trim();',
    '  console.log([entry.name, name, hasRealSavedJql(config.jiraQuery) ? "1" : "0"].join("\\t"));',
    "}",
    "NODE",
    ')"',
    "",
    'if [[ -z "$TEAM_LIST" ]]; then',
    '  echo "No teams with team.json found under: $TEAMS_DIR"',
    "  exit 1",
    "fi",
    "",
    "TEAM_IDS=()",
    "TEAM_NAMES=()",
    "TEAM_HAS_JQL=()",
    "index=1",
    'echo "Select team to renew:"',
    'while IFS=$\'\\t\' read -r team_id team_name has_jql; do',
    '  [[ -z "$team_id" ]] && continue',
    '  TEAM_IDS+=("$team_id")',
    '  TEAM_NAMES+=("$team_name")',
    '  TEAM_HAS_JQL+=("$has_jql")',
    '  printf "%2d) %s (%s)\\n" "$index" "$team_name" "$team_id"',
    "  index=$((index + 1))",
    'done <<< "$TEAM_LIST"',
    "",
    'echo "Enter one team number, multiple numbers separated by comma/space, or all."',
    'echo -n "Team number(s): "',
    "read -r selection",
    "SELECTED_INDEXES=()",
    'selection_normalized="$(echo "$selection" | tr "[:upper:]" "[:lower:]" | xargs)"',
    'if [[ "$selection_normalized" == "all" ]]; then',
    '  for ((i = 1; i <= ${#TEAM_IDS[@]}; i++)); do',
    '    SELECTED_INDEXES+=("$i")',
    "  done",
    "else",
    '  selection_tokens="${selection//,/ }"',
    '  for token in ${(z)selection_tokens}; do',
    '    if ! [[ "$token" =~ ^[0-9]+$ ]] || (( token < 1 || token > ${#TEAM_IDS[@]} )); then',
    '      echo "Invalid team number: $token"',
    "      exit 1",
    "    fi",
    '    SELECTED_INDEXES+=("$token")',
    "  done",
    "fi",
    "",
    'if (( ${#SELECTED_INDEXES[@]} == 0 )); then',
    '  echo "No team selected."',
    "  exit 1",
    "fi",
    "",
    "SELECTED_IDS=()",
    'for selection_index in "${SELECTED_INDEXES[@]}"; do',
    '  TEAM_ID="${TEAM_IDS[$selection_index]}"',
    '  HAS_SAVED_JQL="${TEAM_HAS_JQL[$selection_index]}"',
    '  if [[ "$HAS_SAVED_JQL" != "1" ]]; then',
    '    echo "No real saved JQL found in teams/${TEAM_ID}/team.json."',
    '    echo "Add JQL in the app first, then run this file again."',
    "    exit 1",
    "  fi",
    '  SELECTED_IDS+=("$TEAM_ID")',
    "done",
    "",
    'if [[ -z "${JIRA_TOKEN:-}" ]]; then',
    '  echo -n "Jira token: "',
    "  read -rs JIRA_TOKEN",
    "  echo",
    "  export JIRA_TOKEN",
    "fi",
    "",
    "clear_generated_jira_exports() {",
    '  local team_id="$1"',
    '  local import_dir="$TEAMS_DIR/$team_id/imports/$JIRA_IMPORT_BUCKET"',
    '  mkdir -p "$import_dir"',
    "",
    "  # Jira API refresh is a current snapshot, not an append-only history.",
    "  # Remove only files generated by this Jira pull flow; preserve manual imports.",
    '  find "$import_dir" -maxdepth 1 -type f \\( \\',
    "    -name 'issues.csv' -o \\",
    "    -name 'issues-*.csv' -o \\",
    "    -name 'time-in-status.csv' -o \\",
    "    -name 'time-in-status-*.csv' \\",
    "  \\) -delete",
    "}",
    "",
    'for selection_index in "${SELECTED_INDEXES[@]}"; do',
    '  TEAM_ID="${TEAM_IDS[$selection_index]}"',
    '  TEAM_NAME="${TEAM_NAMES[$selection_index]}"',
    '  clear_generated_jira_exports "$TEAM_ID"',
    "done",
    "",
    'echo "Renewing Jira data for selected team(s): ${SELECTED_IDS[*]}"',
    'node "$RUNNER" "$WORKSPACE_DIR" "${SELECTED_IDS[@]}"',
    "",
    'echo "Done. Open Scrum Master Tool and select Recalculate to rebuild metrics and cache."',
    "read",
    "",
  ];

  return `${lines.join("\n")}`;
}

function buildWindowsMasterLauncher(): string {
  const lines = [
    '$ErrorActionPreference = "Stop"',
    "",
    '$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path',
    '$WorkspaceDir = $ScriptDir',
    '$Runner = Join-Path $WorkspaceDir "sm-tool\\jira-pull.mjs"',
    "",
    'if (-not $env:JIRA_URL) {',
    "  do {",
    `    $env:JIRA_URL = (Read-Host "Jira URL (for example ${DEFAULT_JIRA_URL})").Trim()`,
    "    $parsedUrl = $null",
    '    $validUrl = [Uri]::TryCreate($env:JIRA_URL, [UriKind]::Absolute, [ref]$parsedUrl) -and $parsedUrl.Scheme -in @("http", "https")',
    '    if (-not $validUrl) { Write-Host "Enter a valid Jira URL beginning with http:// or https://." }',
    "  } while (-not $validUrl)",
    "}",
    'if (-not $env:JIRA_AUTH) {',
    `  $env:JIRA_AUTH = "${DEFAULT_JIRA_AUTH}"`,
    "}",
    'if (-not $env:JIRA_IMPORT_BUCKET) {',
    `  $env:JIRA_IMPORT_BUCKET = "${DEFAULT_BUCKET}"`,
    "}",
    'if (-not $env:JIRA_MAX_ISSUES) {',
    `  $env:JIRA_MAX_ISSUES = "${DEFAULT_MAX_ISSUES}"`,
    "}",
    'if (-not $env:NODE_USE_SYSTEM_CA) {',
    '  $env:NODE_USE_SYSTEM_CA = "1"',
    "}",
    "",
    'if (-not (Get-Command node -ErrorAction SilentlyContinue)) {',
    '  Write-Host "Node.js 18+ is required to refresh Jira data."',
    "  exit 1",
    "}",
    '$NodeMajor = [int](node -p \'Number(process.versions.node.split(".")[0])\')',
    'if ($NodeMajor -lt 18) {',
    '  Write-Host "Node.js 18+ is required. Current: $(node --version)"',
    "  exit 1",
    "}",
    'if (-not (Test-Path -LiteralPath $Runner -PathType Leaf)) {',
    '  Write-Host "Missing bundled Jira runner: $Runner"',
    '  Write-Host "Choose this workspace again in Scrum Master Tool to restore it."',
    "  exit 1",
    "}",
    "",
    '$LowerTeamsDir = Join-Path $WorkspaceDir "teams"',
    '$UpperTeamsDir = Join-Path $WorkspaceDir "Teams"',
    "if (Test-Path -LiteralPath $LowerTeamsDir -PathType Container) {",
    "  $TeamsDir = $LowerTeamsDir",
    "} elseif (Test-Path -LiteralPath $UpperTeamsDir -PathType Container) {",
    "  $TeamsDir = $UpperTeamsDir",
    "} else {",
    '  Write-Host "No teams folder found under: $WorkspaceDir"',
    "  exit 1",
    "}",
    "",
    "$TeamListScript = @'",
    'const fs = require("fs");',
    'const path = require("path");',
    "const teamsDir = process.argv[2];",
    'function normalize(value) { return String(value || "").trim().toLowerCase(); }',
    "function hasRealSavedJql(jiraQuery) {",
    "  const queries = [...(jiraQuery?.queries || []), ...(jiraQuery?.issueQuery?.queries || [])];",
    "  return queries.some((query) => {",
    "    const jql = normalize(query?.jql);",
    '    return jql.length > 0 && !jql.includes("yourproject");',
    "  });",
    "}",
    'for (const entry of fs.readdirSync(teamsDir, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {',
    '  const configPath = path.join(teamsDir, entry.name, "team.json");',
    "  if (!fs.existsSync(configPath)) continue;",
    '  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));',
    '  const name = String(config.teamName || entry.name).replace(/[\\t\\r\\n]+/g, " ").trim();',
    '  console.log([entry.name, name, hasRealSavedJql(config.jiraQuery) ? "1" : "0"].join("\\t"));',
    "}",
    "'@",
    "",
    "$TeamList = $TeamListScript | node - $TeamsDir",
    "if (-not $TeamList) {",
    '  Write-Host "No teams with team.json found under: $TeamsDir"',
    "  exit 1",
    "}",
    "",
    "$TeamIds = @()",
    "$TeamNames = @()",
    "$TeamHasJql = @()",
    "$Index = 1",
    "",
    'Write-Host "Select team to renew:"',
    "foreach ($Line in $TeamList) {",
    "  if (-not $Line.Trim()) {",
    "    continue",
    "  }",
    "",
    '  $Parts = $Line -split "`t", 3',
    "  $TeamIds += $Parts[0]",
    "  $TeamNames += $Parts[1]",
    "  $TeamHasJql += $Parts[2]",
    '  Write-Host ("{0,2}) {1} ({2})" -f $Index, $Parts[1], $Parts[0])',
    "  $Index += 1",
    "}",
    "",
    'Write-Host "Enter one team number, multiple numbers separated by comma/space, or all."',
    '$Selection = Read-Host "Team number(s)"',
    "$SelectedIndexes = @()",
    "",
    'if ($Selection.Trim().ToLowerInvariant() -eq "all") {',
    "  for ($i = 1; $i -le $TeamIds.Count; $i += 1) {",
    "    $SelectedIndexes += $i",
    "  }",
    "} else {",
    '  $SelectionTokens = $Selection -split "[,\\s]+" | Where-Object { $_ }',
    "  foreach ($Token in $SelectionTokens) {",
    "    $ParsedNumber = 0",
    "    if (-not [int]::TryParse($Token, [ref]$ParsedNumber) -or $ParsedNumber -lt 1 -or $ParsedNumber -gt $TeamIds.Count) {",
    '      Write-Host "Invalid team number: $Token"',
    "      exit 1",
    "    }",
    "    $SelectedIndexes += $ParsedNumber",
    "  }",
    "}",
    "",
    "if ($SelectedIndexes.Count -eq 0) {",
    '  Write-Host "No team selected."',
    "  exit 1",
    "}",
    "",
    "$SelectedTeamIds = @()",
    "foreach ($SelectionIndex in $SelectedIndexes) {",
    "  $ArrayIndex = $SelectionIndex - 1",
    "  $TeamId = $TeamIds[$ArrayIndex]",
    "  $HasSavedJql = $TeamHasJql[$ArrayIndex]",
    '  if ($HasSavedJql -ne "1") {',
    '    Write-Host "No real saved JQL found in teams/$TeamId/team.json."',
    '    Write-Host "Add JQL in the app first, then run this file again."',
    "    exit 1",
    "  }",
    '  $SelectedTeamIds += $TeamId',
    "}",
    "",
    "if (-not $env:JIRA_TOKEN) {",
    '  $SecureToken = Read-Host "Jira token" -AsSecureString',
    "  $Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureToken)",
    "  try {",
    "    $env:JIRA_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr)",
    "  } finally {",
    "    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)",
    "  }",
    "}",
    "",
    "function Clear-GeneratedJiraExports {",
    "  param([string] $TeamId)",
    "",
    '  $ImportDir = Join-Path (Join-Path (Join-Path $TeamsDir $TeamId) "imports") $env:JIRA_IMPORT_BUCKET',
    "  New-Item -ItemType Directory -Force -Path $ImportDir | Out-Null",
    "",
    "  $GeneratedNames = @(",
    '    "issues.csv",',
    '    "issues-*.csv",',
    '    "time-in-status.csv",',
    '    "time-in-status-*.csv"',
    "  )",
    "",
    "  foreach ($Name in $GeneratedNames) {",
    "    Get-ChildItem -LiteralPath $ImportDir -File -Filter $Name -ErrorAction SilentlyContinue | Remove-Item -Force",
    "  }",
    "}",
    "",
    'Write-Host "Renewing Jira data for $($SelectedTeamIds -join ", ")"',
    'node $Runner $WorkspaceDir @SelectedTeamIds',
    "",
    'Write-Host "Done. Open Scrum Master Tool and select Recalculate to rebuild metrics and cache."',
    "Read-Host | Out-Null",
    "",
  ];

  return `${lines.join("\r\n")}`;
}

function buildWindowsWrapper(): string {
  return [
    "@echo off",
    "setlocal",
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0renew-team.ps1" %*',
    "set \"EXIT_CODE=%ERRORLEVEL%\"",
    "if not \"%EXIT_CODE%\"==\"0\" (",
    "  echo.",
    "  echo [ERROR] renew-team.ps1 failed with exit code %EXIT_CODE%.",
    "  pause",
    ")",
    "endlocal & exit /b %EXIT_CODE%",
    "",
  ].join("\r\n");
}

async function removeLegacyTeamLaunchers(teamsPath: string): Promise<number> {
  let removed = 0;
  const teamIds = await listDirectories(teamsPath);

  for (const teamId of teamIds) {
    const launcherPath = path.join(teamsPath, teamId, LEGACY_TEAM_LAUNCHER_NAME);
    if (!(await pathExists(launcherPath))) {
      continue;
    }

    await fs.rm(launcherPath, { force: true });
    removed += 1;
  }

  return removed;
}

async function clearMacQuarantine(filePath: string): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  for (const attribute of ["com.apple.quarantine", "com.apple.metadata:kMDItemWhereFroms"]) {
    try {
      await execFileAsync("xattr", ["-d", attribute, filePath]);
    } catch {
      // Attribute is absent or xattr is unavailable. The launcher is still usable.
    }
  }
}

async function resolveTeamsPath(workspacePath: string): Promise<string> {
  const candidatePaths = [path.join(workspacePath, "teams"), path.join(workspacePath, "Teams")];
  for (const candidate of candidatePaths) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No teams folder found under ${workspacePath}.`);
}

async function listDirectories(rootPath: string): Promise<string[]> {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
