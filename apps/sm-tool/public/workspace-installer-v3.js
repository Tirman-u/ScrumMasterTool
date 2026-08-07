(() => {
  const DB_NAME = "sm-tool";
  const DB_VERSION = 1;
  const STORE_NAME = "settings";
  const WORKSPACE_KEY = "workspace-handle-v1";
  const SOURCE_URL = "/workspace-bootstrap.js";
  const HELPER_VERSION = "v3";

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
    if (launcher.includes(`Jira helper ${HELPER_VERSION}`)) return launcher;

    const runnerMarker = 'RUNNER="$SCRIPT_DIR/sm-tool/jira-pull.mjs"\n';
    const macCaSetup = `${runnerMarker}\n` +
      `echo "Scrum Master Tool Jira helper ${HELPER_VERSION}"\n` +
      `export NODE_USE_SYSTEM_CA=1\n\n` +
      `# Node versions before native system-CA support need the trusted macOS certificates explicitly.\n` +
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
    return launcher.replace(runnerMarker, macCaSetup);
  }

  function patchRunner(runner) {
    if (runner.includes(`Jira helper ${HELPER_VERSION} diagnostic`)) return runner;

    const replacement = `main().catch(error => {\n  const cause = error?.cause;\n  const parts = [error?.message || String(error)];\n  if (cause?.code) parts.push(\`code=\${cause.code}\`);\n  if (cause?.message && cause.message !== error?.message) parts.push(cause.message);\n  console.error(\`ERROR: \${parts.join(" | ")}\`);\n  console.error("Jira helper ${HELPER_VERSION} diagnostic");\n  process.exitCode = 1;\n});`;

    const patched = runner.replace(
      /main\(\)\.catch\(error => \{[\s\S]*?process\.exitCode = 1;\s*\}\);\s*$/,
      replacement,
    );
    if (patched === runner) {
      throw new Error("Could not patch Jira runner diagnostics.");
    }
    return patched;
  }

  async function helperContents() {
    const response = await fetch(`${SOURCE_URL}?helper=${HELPER_VERSION}&t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load helper source (${response.status}).`);
    const source = await response.text();
    return {
      launcher: patchLauncher(extractStringAssignment(source, "LAUNCHER_CONTENT")),
      runner: patchRunner(extractStringAssignment(source, "RUNNER_CONTENT")),
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
    let permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") return false;

    const { launcher, runner } = await helperContents();
    const helperDir = await handle.getDirectoryHandle("sm-tool", { create: true });
    await writeTextFile(helperDir, "jira-pull.mjs", runner);
    await writeTextFile(handle, "renew-team.command", launcher);
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
    window.showDirectoryPicker = async function smV3DirectoryPicker(options) {
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
