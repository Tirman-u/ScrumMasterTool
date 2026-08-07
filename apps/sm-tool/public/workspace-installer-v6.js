(() => {
  const DB_NAME = "sm-tool";
  const DB_VERSION = 1;
  const STORE_NAME = "settings";
  const WORKSPACE_KEY = "workspace-handle-v1";
  const HELPER_VERSION = "v6";

  let patchInFlight = false;

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
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
        const request = tx.objectStore(STORE_NAME).get(WORKSPACE_KEY);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function readTextFile(directoryHandle, fileName) {
    const fileHandle = await directoryHandle.getFileHandle(fileName);
    return await (await fileHandle.getFile()).text();
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

  function patchRunnerSource(source) {
    let patched = source;

    const durationFormatter = `function formatDurationDays(value) {\n  const days = Number(value);\n  if (!Number.isFinite(days) || days <= 0) return '';\n  const totalMinutes = Math.max(1, Math.round(days * 1440));\n  const wholeDays = Math.floor(totalMinutes / 1440);\n  const hours = Math.floor((totalMinutes - wholeDays * 1440) / 60);\n  const minutes = totalMinutes - wholeDays * 1440 - hours * 60;\n  const parts = [];\n  if (wholeDays > 0) parts.push(\`${wholeDays}d\`);\n  if (hours > 0) parts.push(\`${hours}h\`);\n  if (minutes > 0) parts.push(\`${minutes}m\`);\n  return parts.join(' ') || '1m';\n}\n`;

    if (!patched.includes("function formatDurationDays(value)")) {
      patched = patched.replace(
        "async function writeTeamExport",
        `${durationFormatter}\nasync function writeTeamExport`,
      );
    }

    patched = patched.replaceAll(
      "row.durations[s] ? row.durations[s].toFixed(4) : ''",
      "row.durations[s] ? formatDurationDays(row.durations[s]) : ''",
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
    patched = patched.replaceAll("Jira helper v5 diagnostic", `Jira helper ${HELPER_VERSION} diagnostic`);

    if (
      !patched.includes("function formatDurationDays(value)") ||
      patched.includes("row.durations[s] ? row.durations[s].toFixed(4) : ''") ||
      !patched.includes("'time-in-status.csv'")
    ) {
      throw new Error("Could not align Jira helper Time in Status output with the web parser.");
    }

    return patched;
  }

  async function patchWorkspace(handle) {
    if (!handle || handle.kind !== "directory") return false;
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") return false;

    const helperDir = await handle.getDirectoryHandle("sm-tool", { create: true });
    let runner;
    try {
      runner = await readTextFile(helperDir, "jira-pull.mjs");
    } catch {
      return false;
    }

    const patchedRunner = patchRunnerSource(runner);
    if (patchedRunner !== runner) {
      await writeTextFile(helperDir, "jira-pull.mjs", patchedRunner);
    }

    try {
      const launcher = await readTextFile(handle, "renew-team.command");
      const patchedLauncher = launcher.replaceAll("Jira helper v5", `Jira helper ${HELPER_VERSION}`);
      if (patchedLauncher !== launcher) {
        await writeTextFile(handle, "renew-team.command", patchedLauncher);
      }
    } catch {
      // The runner is sufficient; launcher version text is cosmetic.
    }

    console.info(`Scrum Master Tool Jira helper ${HELPER_VERSION} ready in ${handle.name}.`);
    return true;
  }

  async function patchRememberedAfterInstaller() {
    if (patchInFlight) return;
    patchInFlight = true;
    try {
      // v3 may still be rewriting the helper on focus; wait for it to finish first.
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      const handle = await rememberedHandle();
      if (handle) await patchWorkspace(handle);
    } catch (error) {
      console.warn(`Jira helper ${HELPER_VERSION} patch skipped.`, error);
    } finally {
      patchInFlight = false;
    }
  }

  const previousPicker =
    typeof window.showDirectoryPicker === "function" ? window.showDirectoryPicker.bind(window) : null;
  if (previousPicker) {
    window.showDirectoryPicker = async function smV6DirectoryPicker(options) {
      const handle = await previousPicker(options);
      try {
        await patchWorkspace(handle);
      } catch (error) {
        console.error(`Could not update Jira helper ${HELPER_VERSION}.`, error);
      }
      return handle;
    };
  }

  window.addEventListener("focus", () => void patchRememberedAfterInstaller());
  void patchRememberedAfterInstaller();
})();
