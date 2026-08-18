(() => {
  const DB_NAME = "sm-tool";
  const DB_VERSION = 1;
  const STORE_NAME = "settings";
  const WORKSPACE_KEY = "workspace-handle-v1";
  const BOOTSTRAP_SOURCE_URL = "/workspace-bootstrap.js?v=20260818-5";

  let helperContentsPromise = null;
  let installInFlight = false;
  let installSucceeded = false;

  function extractStringAssignment(source, name) {
    const marker = `const ${name} = `;
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) {
      throw new Error(`Missing ${name} in workspace bootstrap source.`);
    }

    const quoteStart = source.indexOf('"', markerIndex + marker.length);
    if (quoteStart < 0) {
      throw new Error(`Invalid ${name} assignment.`);
    }

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
      if (char === '"') {
        return JSON.parse(source.slice(quoteStart, index + 1));
      }
    }

    throw new Error(`Unterminated ${name} assignment.`);
  }

  function patchLauncher(launcher) {
    const marker = "set -euo pipefail\n";
    if (!launcher.includes(marker) || launcher.includes("NODE_USE_SYSTEM_CA")) {
      return launcher;
    }

    return launcher.replace(
      marker,
      `${marker}\n# Prefer certificates trusted by the operating system (important for corporate Jira/VPN environments).\nexport NODE_USE_SYSTEM_CA=1\n`,
    );
  }

  function patchRunner(runner) {
    const original = "console.error(`ERROR: ${error?.message || error}`);";
    if (!runner.includes(original) || runner.includes("Jira connection detail")) {
      return runner;
    }

    const replacement = `const cause = error?.cause;\n  const details = [error?.message || String(error), cause?.code, cause?.message].filter(Boolean);\n  console.error(\`ERROR: \${details.join(\" | \")}\`);\n  if (cause?.code) console.error(\`Jira connection detail: \${cause.code}\`);\n  if ([\"UNABLE_TO_VERIFY_LEAF_SIGNATURE\", \"SELF_SIGNED_CERT_IN_CHAIN\", \"DEPTH_ZERO_SELF_SIGNED_CERT\", \"UNABLE_TO_GET_ISSUER_CERT_LOCALLY\"].includes(cause?.code)) {\n    console.error(\"The Jira TLS certificate is not trusted by Node. Check corporate VPN/certificate installation.\");\n  }`;

    return runner.replace(original, replacement);
  }

  async function loadHelperContents() {
    if (!helperContentsPromise) {
      helperContentsPromise = fetch(BOOTSTRAP_SOURCE_URL, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Could not load workspace helper source (${response.status}).`);
          }
          return response.text();
        })
        .then((source) => ({
          runner: patchRunner(extractStringAssignment(source, "RUNNER_CONTENT")),
          launcher: patchLauncher(extractStringAssignment(source, "LAUNCHER_CONTENT")),
          windowsLauncher: extractStringAssignment(source, "WINDOWS_LAUNCHER_CONTENT"),
          windowsWrapper: extractStringAssignment(source, "WINDOWS_WRAPPER_CONTENT"),
        }));
    }
    return helperContentsPromise;
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

  async function installWorkspaceHelper(handle) {
    if (!handle || handle.kind !== "directory") {
      return false;
    }

    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      return false;
    }

    const { runner, launcher, windowsLauncher, windowsWrapper } = await loadHelperContents();
    await handle.getDirectoryHandle("teams", { create: true });
    const helperDir = await handle.getDirectoryHandle("sm-tool", { create: true });
    await writeTextFile(helperDir, "jira-pull.mjs", runner);
    await writeTextFile(handle, "renew-team.command", launcher);
    await writeTextFile(handle, "renew-team.ps1", windowsLauncher);
    await writeTextFile(handle, "renew-team.cmd", windowsWrapper);

    installSucceeded = true;
    console.info("Scrum Master Tool workspace helper installed.");
    window.dispatchEvent(new CustomEvent("sm-workspace-helper-installed", {
      detail: { workspaceName: handle.name },
    }));
    return true;
  }

  window.__smInstallWorkspaceHelper = installWorkspaceHelper;

  function openSettingsDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open workspace settings database."));
    });
  }

  async function readRememberedWorkspaceHandle() {
    const db = await openSettingsDb();
    try {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        return null;
      }
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(WORKSPACE_KEY);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error ?? new Error("Could not read remembered workspace."));
      });
    } finally {
      db.close();
    }
  }

  async function installRememberedWorkspace() {
    if (installInFlight || installSucceeded) {
      return;
    }
    installInFlight = true;
    try {
      const handle = await readRememberedWorkspaceHandle();
      if (handle) {
        await installWorkspaceHelper(handle);
      }
    } catch (error) {
      console.warn("Scrum Master Tool workspace helper fallback is waiting for a writable workspace.", error);
    } finally {
      installInFlight = false;
    }
  }

  const currentPicker = typeof window.showDirectoryPicker === "function"
    ? window.showDirectoryPicker.bind(window)
    : null;

  if (currentPicker) {
    try {
      window.showDirectoryPicker = async function smInstallerDirectoryPicker(options) {
        const handle = await currentPicker(options);
        try {
          await installWorkspaceHelper(handle);
        } catch (error) {
          console.error("Scrum Master Tool could not install the workspace helper.", error);
        }
        return handle;
      };
    } catch (error) {
      console.warn("Scrum Master Tool could not hook the directory picker; using remembered-workspace fallback.", error);
    }
  }

  window.addEventListener("focus", () => void installRememberedWorkspace());
  window.addEventListener("pageshow", () => void installRememberedWorkspace());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void installRememberedWorkspace();
    }
  });

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    void installRememberedWorkspace();
    if (installSucceeded || attempts >= 30) {
      window.clearInterval(timer);
    }
  }, 1000);

  void installRememberedWorkspace();
})();
