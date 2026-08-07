(() => {
  const DB_NAME = "sm-tool";
  const DB_VERSION = 1;
  const STORE_NAME = "settings";
  const WORKSPACE_KEY = "workspace-handle-v1";

  const EXCLUDED_EXACT = new Set([
    "done",
    "closed",
    "resolved",
    "abandoned",
    "cancelled",
    "canceled",
    "won't do",
    "wont do",
    "backlog",
    "open",
    "to do",
    "todo",
    "ready for refinement",
    "refinement",
  ]);

  let running = false;

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isFlowStatus(value) {
    const key = normalize(value);
    if (!key || EXCLUDED_EXACT.has(key)) return false;
    return !["cancel", "abandon", "duplicate", "obsolete", "discard", "out of scope"].some((hint) => key.includes(hint));
  }

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

  async function readJson(directoryHandle, fileName) {
    const fileHandle = await directoryHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text());
  }

  async function writeJson(directoryHandle, fileName, value) {
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(`${JSON.stringify(value, null, 2)}\n`);
    } finally {
      await writable.close();
    }
  }

  async function resolveTeamsRoot(workspaceHandle) {
    try {
      return await workspaceHandle.getDirectoryHandle("teams");
    } catch {
      try {
        return await workspaceHandle.getDirectoryHandle("Teams");
      } catch {
        return null;
      }
    }
  }

  async function migrateTeam(teamHandle) {
    let config;
    try {
      config = await readJson(teamHandle, "team.json");
    } catch {
      return false;
    }

    const existing = Array.isArray(config?.bottleneckConfig?.flowStatuses)
      ? config.bottleneckConfig.flowStatuses.map((value) => String(value).trim()).filter(Boolean)
      : [];
    if (existing.length > 0) return false;

    let entries;
    try {
      const cacheHandle = await teamHandle.getDirectoryHandle("cache");
      entries = await readJson(cacheHandle, "time-in-status-auto.json");
    } catch {
      return false;
    }

    if (!Array.isArray(entries)) return false;

    const byKey = new Map();
    for (const entry of entries) {
      for (const column of Array.isArray(entry?.columns) ? entry.columns : []) {
        const name = String(column?.name || "").trim();
        const key = normalize(name);
        if (name && key && isFlowStatus(name) && !byKey.has(key)) {
          byKey.set(key, name);
        }
      }
    }

    const flowStatuses = [...byKey.values()];
    if (flowStatuses.length === 0) return false;

    config.bottleneckConfig = {
      ...(config.bottleneckConfig || {}),
      flowStatuses,
    };
    await writeJson(teamHandle, "team.json", config);
    console.info(`Scrum Master Tool: detected Process Health flow statuses for ${config.teamName || teamHandle.name}:`, flowStatuses);
    return true;
  }

  async function migrateWorkspace() {
    if (running) return;
    running = true;
    try {
      const workspaceHandle = await rememberedHandle();
      if (!workspaceHandle || workspaceHandle.kind !== "directory") return;
      const permission = await workspaceHandle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") return;

      const teamsRoot = await resolveTeamsRoot(workspaceHandle);
      if (!teamsRoot) return;

      let changed = 0;
      for await (const [, handle] of teamsRoot.entries()) {
        if (handle.kind !== "directory") continue;
        if (await migrateTeam(handle)) changed += 1;
      }
      if (changed > 0) {
        console.info(`Scrum Master Tool: Process Health configuration repaired for ${changed} team(s). Recalculate metrics to apply.`);
      }
    } catch (error) {
      console.warn("Scrum Master Tool Process Health migration skipped.", error);
    } finally {
      running = false;
    }
  }

  const schedule = (delay = 1200) => window.setTimeout(() => void migrateWorkspace(), delay);
  window.addEventListener("focus", () => schedule(1200));
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => schedule(1800), { once: true });
  } else {
    schedule(1800);
  }
})();
