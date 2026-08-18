(() => {
  const DB_NAME = "sm-tool";
  const DB_VERSION = 1;
  const STORE_NAME = "settings";
  const WORKSPACE_KEY = "workspace-handle-v1";
  const SOURCE_URL = "/workspace-bootstrap.js?v=20260818-6";
  const HELPER_VERSION = "v7";
  const HARD_MAX_ISSUES = 2000;

  let installInFlight = false;

  function extractStringAssignment(source, name) {
    const marker = `const ${name} = `;
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) throw new Error(`Missing ${name}.`);
    const quoteStart = source.indexOf('"', markerIndex + marker.length);
    if (quoteStart < 0) throw new Error(`Invalid ${name}.`);
    let escaped = false;
    for (let index = quoteStart + 1; index < source.length; index += 1) {
      const char = source[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') return JSON.parse(source.slice(quoteStart, index + 1));
    }
    throw new Error(`Unterminated ${name}.`);
  }

  function patchLauncher(launcher) {
    const runnerMarker = 'RUNNER="$SCRIPT_DIR/sm-tool/jira-pull.mjs"\n';
    const macCaSetup = `${runnerMarker}\n` +
      `echo "Scrum Master Tool Jira helper ${HELPER_VERSION}"\n` +
      `export NODE_USE_SYSTEM_CA=1\n\n` +
      `if [[ "$(uname -s)" == "Darwin" ]] && command -v security >/dev/null 2>&1; then\n` +
      `  CA_BUNDLE="$SCRIPT_DIR/sm-tool/macos-ca.pem"\n` +
      `  : > "$CA_BUNDLE"\n` +
      `  security find-certificate -a -p /Library/Keychains/System.keychain >> "$CA_BUNDLE" 2>/dev/null || true\n` +
      `  security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain >> "$CA_BUNDLE" 2>/dev/null || true\n` +
      `  if [[ -s "$CA_BUNDLE" ]]; then\n` +
      `    export NODE_EXTRA_CA_CERTS="$CA_BUNDLE"\n` +
      `  fi\n` +
      `fi\n`;

    if (!launcher.includes(runnerMarker)) {
      throw new Error("Could not patch Jira launcher.");
    }

    let patched = launcher.replace(runnerMarker, macCaSetup);

    // Pilot safety: the generated launcher must not inherit a larger value
    // from the user's shell. One Jira refresh is always capped at 2000 issues.
    patched = patched.replace(
      'export JIRA_MAX_ISSUES="${JIRA_MAX_ISSUES:-2000}"',
      `export JIRA_MAX_ISSUES="${HARD_MAX_ISSUES}"`,
    );

    if (!patched.includes(`export JIRA_MAX_ISSUES="${HARD_MAX_ISSUES}"`)) {
      throw new Error("Could not apply the 2000 issue Jira safety cap to launcher.");
    }

    return patched;
  }

  function patchRunner(runner) {
    let patched = runner;

    const moveHelper = `function collectProjectMoveInfo(issue, histories) {\n  const previousIssueKeys = [];\n  const seenPreviousKeys = new Set();\n  let projectEnteredAt = null;\n  for (const history of histories) {\n    const changedAt = history?.created ? new Date(history.created) : null;\n    if (!changedAt || Number.isNaN(changedAt.getTime())) continue;\n    for (const item of Array.isArray(history?.items) ? history.items : []) {\n      const field = fieldName(item?.fieldId || item?.field);\n      const isKeyChange = field === 'key' || field === 'issuekey';\n      const isProjectChange = field === 'project';\n      if (!isKeyChange && !isProjectChange) continue;\n      if (!projectEnteredAt || changedAt.getTime() > new Date(projectEnteredAt).getTime()) {\n        projectEnteredAt = changedAt.toISOString();\n      }\n      if (isKeyChange) {\n        const previousKey = String(item?.fromString ?? item?.from ?? '').trim();\n        const normalized = previousKey.toLowerCase();\n        if (previousKey && !seenPreviousKeys.has(normalized)) {\n          seenPreviousKeys.add(normalized);\n          previousIssueKeys.push(previousKey);\n        }\n      }\n    }\n  }\n  return { previousIssueKeys, projectEnteredAt };\n}\n`;

    const replacementStatusDurations = `function statusDurations(issue, histories) {\n  const created = issue?.fields?.created;\n  if (!created) return {};\n  const moveInfo = collectProjectMoveInfo(issue, histories);\n  const flowStart = moveInfo.projectEnteredAt || created;\n  const flowStartMs = new Date(flowStart).getTime();\n  const transitions = [];\n  for (const history of histories) {\n    const at = history?.created;\n    if (!at) continue;\n    for (const item of Array.isArray(history?.items) ? history.items : []) {\n      if (fieldName(item?.field) === 'status' || fieldName(item?.fieldId) === 'status') {\n        transitions.push({ at, from: String(item?.fromString ?? ''), to: String(item?.toString ?? '') });\n      }\n    }\n  }\n  transitions.sort((a,b) => new Date(a.at) - new Date(b.at));\n  let currentStatus = transitions[0]?.from || String(getNamed(issue?.fields?.status) || '');\n  let currentAt = flowStart;\n  const durations = new Map();\n  for (const t of transitions) {\n    const transitionMs = new Date(t.at).getTime();\n    if (Number.isFinite(flowStartMs) && transitionMs <= flowStartMs) {\n      currentStatus = t.to || currentStatus;\n      continue;\n    }\n    if (currentStatus) durations.set(currentStatus, (durations.get(currentStatus) || 0) + workingDaysBetween(currentAt, t.at));\n    currentStatus = t.to || currentStatus;\n    currentAt = t.at;\n  }\n  const end = issue?.fields?.resolutiondate || issue?.fields?.updated || new Date().toISOString();\n  if (currentStatus) durations.set(currentStatus, (durations.get(currentStatus) || 0) + workingDaysBetween(currentAt, end));\n  return Object.fromEntries([...durations.entries()].filter(([,d]) => Number.isFinite(d) && d > 0));\n}\nasync function buildTimeRows`;

    const durationFormatter = `function formatDurationDays(value) {\n  const days = Number(value);\n  if (!Number.isFinite(days) || days <= 0) return '';\n  const totalMinutes = Math.max(1, Math.round(days * 1440));\n  const wholeDays = Math.floor(totalMinutes / 1440);\n  const hours = Math.floor((totalMinutes - wholeDays * 1440) / 60);\n  const minutes = totalMinutes - wholeDays * 1440 - hours * 60;\n  const parts = [];\n  if (wholeDays > 0) parts.push(\`\${wholeDays}d\`);\n  if (hours > 0) parts.push(\`\${hours}h\`);\n  if (minutes > 0) parts.push(\`\${minutes}m\`);\n  return parts.join(' ') || '1m';\n}\n`;

    const cacheHelper = `function buildAutoBottleneckEntries(timeRows, config, includeAllStatuses = false) {\n  const configuredStatuses = Array.isArray(config?.bottleneckConfig?.flowStatuses)\n    ? config.bottleneckConfig.flowStatuses.map(value => String(value).trim()).filter(Boolean)\n    : [];\n  const configuredByKey = new Map(configuredStatuses.map(value => [fieldName(value), value]));\n  const terminal = new Set(['done','closed','resolved','abandoned','cancelled','canceled',\"won't do\",'wont do']);\n  const defaultExcluded = new Set(['backlog','open','to do','todo','ready for refinement','refinement']);\n  const periodAgg = new Map();\n  for (const row of timeRows) {\n    const resolutionDate = row?.issue?.fields?.resolutiondate;\n    const resolved = resolutionDate ? new Date(resolutionDate) : null;\n    if (!resolved || Number.isNaN(resolved.getTime())) continue;\n    const period = resolved.toISOString().slice(0, 7);\n    const byStatus = periodAgg.get(period) ?? new Map();\n    for (const [rawStatus, rawDays] of Object.entries(row.durations ?? {})) {\n      const days = Number(rawDays);\n      const key = fieldName(rawStatus);\n      if (!key || !Number.isFinite(days) || days <= 0) continue;\n      if (terminal.has(key) || key.includes('cancel') || key.includes('abandon') || key.includes('duplicate')) continue;\n      if (!includeAllStatuses) {\n        if (configuredByKey.size > 0) {\n          if (!configuredByKey.has(key)) continue;\n        } else if (defaultExcluded.has(key)) {\n          continue;\n        }\n      }\n      const status = configuredByKey.get(key) ?? rawStatus.trim();\n      const current = byStatus.get(status) ?? { sumDays: 0, count: 0 };\n      current.sumDays += days;\n      current.count += 1;\n      byStatus.set(status, current);\n    }\n    if (byStatus.size > 0) periodAgg.set(period, byStatus);\n  }\n  return [...periodAgg.entries()]\n    .sort(([left], [right]) => left.localeCompare(right))\n    .map(([period, byStatus]) => ({\n      period,\n      columns: [...byStatus.entries()]\n        .map(([name, value]) => ({ name, avgDays: value.sumDays / value.count, sampleCount: value.count }))\n        .filter(column => Number.isFinite(column.avgDays) && column.avgDays > 0)\n        .sort((left, right) => right.avgDays - left.avgDays),\n    }))\n    .filter(entry => entry.columns.length > 0);\n}\n`;

    if (!patched.includes("function collectProjectMoveInfo(issue, histories)")) {
      patched = patched.replace("function statusDurations(issue, histories) {", `${moveHelper}\nfunction statusDurations(issue, histories) {`);
    }

    patched = patched.replace(
      /function statusDurations\(issue, histories\) \{[\s\S]*?\n\}\nasync function buildTimeRows/,
      replacementStatusDurations,
    );
    patched = patched.replace("rows.push({ issue, durations });", "rows.push({ issue, durations, histories });");

    if (!patched.includes("function formatDurationDays(value)")) {
      patched = patched.replace("async function writeTeamExport", `${durationFormatter}\n${cacheHelper}\nasync function writeTeamExport`);
    }

    patched = patched.replace(
      "const { rows: timeRows, statuses } = await buildTimeRows(baseUrl, issues);",
      "const { rows: timeRows, statuses } = await buildTimeRows(baseUrl, issues);\n  const timeRowByKey = new Map(timeRows.map(row => [row.issue?.key ?? '', row]));",
    );
    patched = patched.replace(
      "for (const issue of issues) {\n    const f = issue?.fields ?? {};\n    issueLines.push(csvLine([\n      issue?.key ?? '', '', '', f.summary ?? '',",
      "for (const issue of issues) {\n    const f = issue?.fields ?? {};\n    const timeRow = timeRowByKey.get(issue?.key ?? '');\n    const moveInfo = collectProjectMoveInfo(issue, timeRow?.histories ?? []);\n    issueLines.push(csvLine([\n      issue?.key ?? '', moveInfo.previousIssueKeys.join(' | '), moveInfo.projectEnteredAt ?? '', f.summary ?? '',",
    );

    patched = patched.replaceAll(
      "row.durations[s] ? row.durations[s].toFixed(4) : ''",
      "row.durations[s] ? formatDurationDays(row.durations[s]) : ''",
    );

    patched = patched.replace(
      "if (statuses.length >= 2) await fs.writeFile(path.join(importDir, `time-in-status-${stamp}.csv`), tisLines.join('\\n') + '\\n', 'utf8');\n  console.log(`  Saved to ${path.relative(process.cwd(), importDir)}`);",
      "if (statuses.length >= 2) await fs.writeFile(path.join(importDir, `time-in-status-${stamp}.csv`), tisLines.join('\\n') + '\\n', 'utf8');\n  const cacheDir = path.join(teamsRoot, teamId, 'cache');\n  await fs.mkdir(cacheDir, { recursive: true });\n  const bottleneckEntries = buildAutoBottleneckEntries(timeRows, config, false);\n  const allTimeInStatusEntries = buildAutoBottleneckEntries(timeRows, config, true);\n  await fs.writeFile(path.join(cacheDir, 'bottleneck-auto.json'), JSON.stringify(bottleneckEntries, null, 2) + '\\n', 'utf8');\n  await fs.writeFile(path.join(cacheDir, 'time-in-status-auto.json'), JSON.stringify(allTimeInStatusEntries, null, 2) + '\\n', 'utf8');\n  console.log(`  Saved to ${path.relative(process.cwd(), importDir)}`);",
    );

    const stampLine = "  const stamp = new Date().toISOString().replace(/[:.]/g, '-');\n";
    if (patched.includes(stampLine)) {
      const cleanup =
        "  for (const fileName of await fs.readdir(importDir)) {\n" +
        "    if (/^(issues|time-in-status)(?:-.*)?\\.csv$/i.test(fileName)) {\n" +
        "      await fs.rm(path.join(importDir, fileName), { force: true });\n" +
        "    }\n" +
        "  }\n";
      patched = patched.replace(stampLine, cleanup);
    }

    patched = patched.replaceAll("`issues-${stamp}.csv`", "'issues.csv'");
    patched = patched.replaceAll("`time-in-status-${stamp}.csv`", "'time-in-status.csv'");

    // Defence in depth: even if the launcher is bypassed or JIRA_MAX_ISSUES is
    // manually overridden, the Node runner itself refuses to go over 2000.
    patched = patched.replace(
      "const maxIssues = Math.max(1, Math.min(5000, Number(process.env.JIRA_MAX_ISSUES || DEFAULT_MAX_ISSUES) || DEFAULT_MAX_ISSUES));",
      `const maxIssues = Math.max(1, Math.min(${HARD_MAX_ISSUES}, Number(process.env.JIRA_MAX_ISSUES || DEFAULT_MAX_ISSUES) || DEFAULT_MAX_ISSUES));`,
    );

    const diagnosticReplacement = `main().catch(error => {\n  const cause = error?.cause;\n  const parts = [error?.message || String(error)];\n  if (cause?.code) parts.push(\`code=\${cause.code}\`);\n  if (cause?.message && cause.message !== error?.message) parts.push(cause.message);\n  console.error(\`ERROR: \${parts.join(" | ")}\`);\n  console.error("Jira helper ${HELPER_VERSION} diagnostic");\n  process.exitCode = 1;\n});`;
    patched = patched.replace(
      /main\(\)\.catch\(error => \{[\s\S]*?process\.exitCode = 1;\s*\}\);\s*$/,
      diagnosticReplacement,
    );

    if (
      !patched.includes("collectProjectMoveInfo") ||
      !patched.includes("timeRowByKey") ||
      !patched.includes("function formatDurationDays(value)") ||
      patched.includes("row.durations[s] ? row.durations[s].toFixed(4) : ''") ||
      !patched.includes("'time-in-status.csv'") ||
      !patched.includes("bottleneck-auto.json") ||
      !patched.includes(`Math.min(${HARD_MAX_ISSUES}`)
    ) {
      throw new Error(`Could not build Jira helper ${HELPER_VERSION}.`);
    }

    return patched;
  }

  function patchWindowsLauncherNodeProbe(launcher) {
    const legacyProbe = `$NodeMajor = [int](node -p 'Number(process.versions.node.split(".")[0])')`;
    const safeProbe = [
      '$NodeVersion = (node --version).Trim()',
      "$NodeMajorText = (($NodeVersion -replace '^v', '').Split('.')[0])",
      '$NodeMajor = 0',
      'if (-not [int]::TryParse($NodeMajorText, [ref]$NodeMajor)) {',
      '  Fail-Renew "Could not determine Node.js version. Current: $NodeVersion"',
      '}',
    ].join("\r\n");
    return launcher.replace(legacyProbe, safeProbe);
  }

  async function helperContents() {
    const response = await fetch(`${SOURCE_URL}?helper=${HELPER_VERSION}&t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load helper source (${response.status}).`);
    const source = await response.text();
    return {
      launcher: patchLauncher(extractStringAssignment(source, "LAUNCHER_CONTENT")),
      runner: patchRunner(extractStringAssignment(source, "RUNNER_CONTENT")),
      windowsLauncher: patchWindowsLauncherNodeProbe(extractStringAssignment(source, "WINDOWS_LAUNCHER_CONTENT")),
      windowsWrapper: extractStringAssignment(source, "WINDOWS_WRAPPER_CONTENT"),
    };
  }

  async function writeTextFile(directoryHandle, fileName, content) {
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(content);
    } finally {
      await writable.close();
    }
  }

  async function install(handle) {
    if (!handle || handle.kind !== "directory") return false;
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") return false;

    const { launcher, runner, windowsLauncher, windowsWrapper } = await helperContents();
    const helperDir = await handle.getDirectoryHandle("sm-tool", { create: true });
    await writeTextFile(helperDir, "jira-pull.mjs", runner);
    await writeTextFile(handle, "renew-team.command", launcher);
    await writeTextFile(handle, "renew-team.ps1", windowsLauncher);
    await writeTextFile(handle, "renew-team.cmd", windowsWrapper);
    console.info(`Scrum Master Tool Jira helper ${HELPER_VERSION} installed into ${handle.name}.`);
    return true;
  }

  window.__smInstallWorkspaceHelperV3 = install;

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open workspace database."));
    });
  }

  async function rememberedHandle() {
    const db = await openDb();
    try {
      if (!db.objectStoreNames.contains(STORE_NAME)) return null;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(WORKSPACE_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async function installRemembered() {
    if (installInFlight) return;
    installInFlight = true;
    try {
      const handle = await rememberedHandle();
      if (handle) await install(handle);
    } catch (error) {
      console.warn(`Jira helper ${HELPER_VERSION} remembered-workspace install skipped.`, error);
    } finally {
      installInFlight = false;
    }
  }

  const picker = typeof window.showDirectoryPicker === "function" ? window.showDirectoryPicker.bind(window) : null;
  if (picker) {
    window.showDirectoryPicker = async function smV7DirectoryPicker(options) {
      const handle = await picker(options);
      try {
        await install(handle);
      } catch (error) {
        console.error(`Could not install Jira helper ${HELPER_VERSION}.`, error);
      }
      return handle;
    };
  }

  window.addEventListener("focus", () => void installRemembered());
  void installRemembered();
})();
