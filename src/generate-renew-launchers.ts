import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";

const DEFAULT_JIRA_URL = "https://jira.swedbank.net";
const DEFAULT_JIRA_AUTH = "bearer";
const DEFAULT_MAX_ISSUES = 2000;
const DEFAULT_BUCKET = "jira-api";
const MASTER_LAUNCHER_NAME = "renew-team.command";
const LEGACY_TEAM_LAUNCHER_NAME = "renew-data.command";
const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const workspacePath = path.resolve(process.argv[2] ?? process.cwd());
  const teamsPath = await resolveTeamsPath(workspacePath);

  const launcherPath = path.join(workspacePath, MASTER_LAUNCHER_NAME);
  await fs.writeFile(launcherPath, buildMasterLauncher(), "utf-8");
  await fs.chmod(launcherPath, 0o755);
  await clearMacQuarantine(launcherPath);

  const removedLegacyLaunchers = await removeLegacyTeamLaunchers(teamsPath);

  console.log(`Wrote ${path.relative(process.cwd(), launcherPath) || launcherPath}.`);
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
    'REPO_DIR="${SM_TOOL_REPO_DIR:-$SCRIPT_DIR}"',
    "",
    'export JIRA_URL="${JIRA_URL:-' + DEFAULT_JIRA_URL + '}"',
    'export JIRA_AUTH="${JIRA_AUTH:-' + DEFAULT_JIRA_AUTH + '}"',
    'export JIRA_IMPORT_BUCKET="${JIRA_IMPORT_BUCKET:-' + DEFAULT_BUCKET + '}"',
    'export JIRA_MAX_ISSUES="${JIRA_MAX_ISSUES:-' + DEFAULT_MAX_ISSUES + '}"',
    "",
    'if [[ ! -f "$REPO_DIR/package.json" ]]; then',
    '  echo "ScrumMasterTool repo was not found at: $REPO_DIR"',
    '  echo "Set SM_TOOL_REPO_DIR to the local repo path and run this file again."',
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
    'for selection_index in "${SELECTED_INDEXES[@]}"; do',
    '  TEAM_ID="${TEAM_IDS[$selection_index]}"',
    '  HAS_SAVED_JQL="${TEAM_HAS_JQL[$selection_index]}"',
    '  if [[ "$HAS_SAVED_JQL" != "1" ]]; then',
    '    echo "No real saved JQL found in teams/${TEAM_ID}/team.json."',
    '    echo "Add JQL in the app first, then run this file again."',
    "    exit 1",
    "  fi",
    "done",
    "",
    'if [[ -z "${JIRA_TOKEN:-}" ]]; then',
    '  echo -n "Jira token: "',
    "  read -rs JIRA_TOKEN",
    "  echo",
    "  export JIRA_TOKEN",
    "fi",
    "",
    'for selection_index in "${SELECTED_INDEXES[@]}"; do',
    '  TEAM_ID="${TEAM_IDS[$selection_index]}"',
    '  TEAM_NAME="${TEAM_NAMES[$selection_index]}"',
    '  echo "Renewing Jira data for ${TEAM_NAME} (${TEAM_ID})"',
    '  npm --prefix "$REPO_DIR" run jira:pull -- --workspace "$WORKSPACE_DIR" --team "$TEAM_ID" --max "$JIRA_MAX_ISSUES" --bucket "$JIRA_IMPORT_BUCKET" --timestamped',
    "done",
    'npm --prefix "$REPO_DIR" run analyze -- --workspace "$WORKSPACE_DIR"',
    "",
    'echo "Done. Press Enter to close."',
    "read",
    "",
  ];

  return `${lines.join("\n")}`;
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
