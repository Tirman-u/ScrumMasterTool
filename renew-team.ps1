$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceDir = $ScriptDir
$RepoDir = if ($env:SM_TOOL_REPO_DIR) { $env:SM_TOOL_REPO_DIR } else { $ScriptDir }

if (-not $env:JIRA_URL) {
  $env:JIRA_URL = "https://jira.company.net"
}
if (-not $env:JIRA_AUTH) {
  $env:JIRA_AUTH = "bearer"
}
if (-not $env:JIRA_IMPORT_BUCKET) {
  $env:JIRA_IMPORT_BUCKET = "jira-api"
}
if (-not $env:JIRA_MAX_ISSUES) {
  $env:JIRA_MAX_ISSUES = "2000"
}
if (-not $env:NODE_USE_SYSTEM_CA) {
  $env:NODE_USE_SYSTEM_CA = "1"
}

if (-not (Test-Path -LiteralPath (Join-Path $RepoDir "package.json"))) {
  Write-Host "ScrumMasterTool repo was not found at: $RepoDir"
  Write-Host "Set SM_TOOL_REPO_DIR to the local repo path and run this file again."
  exit 1
}

$LowerTeamsDir = Join-Path $WorkspaceDir "teams"
$UpperTeamsDir = Join-Path $WorkspaceDir "Teams"
if (Test-Path -LiteralPath $LowerTeamsDir -PathType Container) {
  $TeamsDir = $LowerTeamsDir
} elseif (Test-Path -LiteralPath $UpperTeamsDir -PathType Container) {
  $TeamsDir = $UpperTeamsDir
} else {
  Write-Host "No teams folder found under: $WorkspaceDir"
  exit 1
}

$TeamListScript = @'
const fs = require("fs");
const path = require("path");
const teamsDir = process.argv[2];
function normalize(value) { return String(value || "").trim().toLowerCase(); }
function hasRealSavedJql(jiraQuery) {
  const queries = [...(jiraQuery?.queries || []), ...(jiraQuery?.issueQuery?.queries || [])];
  return queries.some((query) => {
    const jql = normalize(query?.jql);
    return jql.length > 0 && !jql.includes("yourproject");
  });
}
for (const entry of fs.readdirSync(teamsDir, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const configPath = path.join(teamsDir, entry.name, "team.json");
  if (!fs.existsSync(configPath)) continue;
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const name = String(config.teamName || entry.name).replace(/[\t\r\n]+/g, " ").trim();
  console.log([entry.name, name, hasRealSavedJql(config.jiraQuery) ? "1" : "0"].join("\t"));
}
'@

$TeamList = $TeamListScript | node - $TeamsDir
if (-not $TeamList) {
  Write-Host "No teams with team.json found under: $TeamsDir"
  exit 1
}

$TeamIds = @()
$TeamNames = @()
$TeamHasJql = @()
$Index = 1

Write-Host "Select team to renew:"
foreach ($Line in $TeamList) {
  if (-not $Line.Trim()) {
    continue
  }

  $Parts = $Line -split "`t", 3
  $TeamIds += $Parts[0]
  $TeamNames += $Parts[1]
  $TeamHasJql += $Parts[2]
  Write-Host ("{0,2}) {1} ({2})" -f $Index, $Parts[1], $Parts[0])
  $Index += 1
}

Write-Host "Enter one team number, multiple numbers separated by comma/space, or all."
$Selection = Read-Host "Team number(s)"
$SelectedIndexes = @()

if ($Selection.Trim().ToLowerInvariant() -eq "all") {
  for ($i = 1; $i -le $TeamIds.Count; $i += 1) {
    $SelectedIndexes += $i
  }
} else {
  $SelectionTokens = $Selection -split "[,\s]+" | Where-Object { $_ }
  foreach ($Token in $SelectionTokens) {
    $ParsedNumber = 0
    if (-not [int]::TryParse($Token, [ref]$ParsedNumber) -or $ParsedNumber -lt 1 -or $ParsedNumber -gt $TeamIds.Count) {
      Write-Host "Invalid team number: $Token"
      exit 1
    }
    $SelectedIndexes += $ParsedNumber
  }
}

if ($SelectedIndexes.Count -eq 0) {
  Write-Host "No team selected."
  exit 1
}

foreach ($SelectionIndex in $SelectedIndexes) {
  $ArrayIndex = $SelectionIndex - 1
  $TeamId = $TeamIds[$ArrayIndex]
  $HasSavedJql = $TeamHasJql[$ArrayIndex]
  if ($HasSavedJql -ne "1") {
    Write-Host "No real saved JQL found in teams/$TeamId/team.json."
    Write-Host "Add JQL in the app first, then run this file again."
    exit 1
  }
}

if (-not $env:JIRA_TOKEN) {
  $SecureToken = Read-Host "Jira token" -AsSecureString
  $Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureToken)
  try {
    $env:JIRA_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)
  }
}

function Clear-GeneratedJiraExports {
  param([string] $TeamId)

  $ImportDir = Join-Path (Join-Path (Join-Path $TeamsDir $TeamId) "imports") $env:JIRA_IMPORT_BUCKET
  New-Item -ItemType Directory -Force -Path $ImportDir | Out-Null

  $GeneratedNames = @(
    "issues.csv",
    "issues-*.csv",
    "time-in-status.csv",
    "time-in-status-*.csv"
  )

  foreach ($Name in $GeneratedNames) {
    Get-ChildItem -LiteralPath $ImportDir -File -Filter $Name -ErrorAction SilentlyContinue | Remove-Item -Force
  }
}

foreach ($SelectionIndex in $SelectedIndexes) {
  $ArrayIndex = $SelectionIndex - 1
  $TeamId = $TeamIds[$ArrayIndex]
  $TeamName = $TeamNames[$ArrayIndex]
  Write-Host "Renewing Jira data for $TeamName ($TeamId)"

  Clear-GeneratedJiraExports -TeamId $TeamId

  npm --prefix $RepoDir run jira:pull -- `
    --workspace $WorkspaceDir `
    --team $TeamId `
    --max $env:JIRA_MAX_ISSUES `
    --bucket $env:JIRA_IMPORT_BUCKET
}

npm --prefix $RepoDir run analyze -- --workspace $WorkspaceDir

Write-Host "Done. Press Enter to close."
Read-Host | Out-Null
