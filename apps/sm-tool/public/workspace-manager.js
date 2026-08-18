(() => {
  const DB_NAME = "sm-tool";
  const STORE_NAME = "settings";
  const WORKSPACE_KEY = "workspace-handle-v1";
  const WORKSPACE_LIST_KEY = "workspace-handle-list-v1";
  const BUTTON_ID = "sm-workspace-manager-button";
  const MODAL_ID = "sm-workspace-manager-modal";

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open workspace database."));
    });
  }

  async function withStore(mode, action) {
    const db = await openDb();
    try {
      if (!db.objectStoreNames.contains(STORE_NAME)) return null;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let request;
        try {
          request = action(store);
        } catch (error) {
          reject(error);
          return;
        }
        if (!request) {
          tx.oncomplete = () => resolve(null);
          tx.onerror = () => reject(tx.error ?? new Error("Workspace database transaction failed."));
          return;
        }
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error ?? new Error("Workspace database request failed."));
      });
    } finally {
      db.close();
    }
  }

  async function readRecords() {
    const records = await withStore("readonly", (store) => store.get(WORKSPACE_LIST_KEY));
    return Array.isArray(records) ? records : [];
  }

  async function readCurrentHandle() {
    return await withStore("readonly", (store) => store.get(WORKSPACE_KEY));
  }

  async function saveRecords(records) {
    await withStore("readwrite", (store) => store.put(records, WORKSPACE_LIST_KEY));
  }

  async function clearCurrentHandle() {
    await withStore("readwrite", (store) => store.delete(WORKSPACE_KEY));
  }

  async function sameHandle(left, right) {
    if (!left || !right || typeof left.isSameEntry !== "function") return false;
    try {
      return await left.isSameEntry(right);
    } catch {
      return false;
    }
  }

  function ensureStyles() {
    if (document.getElementById("sm-workspace-manager-styles")) return;
    const style = document.createElement("style");
    style.id = "sm-workspace-manager-styles";
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
        border: 1px solid rgba(148,163,184,.32); border-radius: 999px;
        background: rgba(15,23,42,.94); color: #e2e8f0; padding: 9px 13px;
        font: 600 13px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,.25); cursor: pointer;
      }
      #${BUTTON_ID}:hover { background: rgba(30,41,59,.98); }
      #${MODAL_ID} {
        position: fixed; inset: 0; z-index: 2147483640; display: flex;
        align-items: center; justify-content: center; padding: 24px;
        background: rgba(2,6,23,.68); backdrop-filter: blur(4px);
        font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      #${MODAL_ID} .sm-wm-card {
        width: min(560px, 100%); max-height: min(680px, 88vh); overflow: auto;
        background: #111827; color: #f8fafc; border: 1px solid rgba(148,163,184,.28);
        border-radius: 18px; box-shadow: 0 24px 80px rgba(0,0,0,.45); padding: 20px;
      }
      #${MODAL_ID} .sm-wm-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:8px; }
      #${MODAL_ID} h2 { margin:0; font-size:20px; }
      #${MODAL_ID} .sm-wm-note { color:#94a3b8; font-size:13px; margin:0 0 16px; }
      #${MODAL_ID} .sm-wm-close { border:0; background:transparent; color:#cbd5e1; font-size:24px; cursor:pointer; }
      #${MODAL_ID} .sm-wm-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 0; border-top:1px solid rgba(148,163,184,.18); }
      #${MODAL_ID} .sm-wm-name { font-weight:650; word-break:break-word; }
      #${MODAL_ID} .sm-wm-time { color:#94a3b8; font-size:12px; margin-top:3px; }
      #${MODAL_ID} .sm-wm-forget { flex:0 0 auto; border:1px solid rgba(248,113,113,.5); color:#fecaca; background:rgba(127,29,29,.22); border-radius:9px; padding:7px 10px; cursor:pointer; font-weight:650; }
      #${MODAL_ID} .sm-wm-empty { color:#94a3b8; padding:18px 0 6px; }
    `;
    document.head.appendChild(style);
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `Last used ${date.toLocaleString()}`;
  }

  async function forgetRecord(recordId) {
    const records = await readRecords();
    const target = records.find((item) => item?.id === recordId);
    const remaining = records.filter((item) => item?.id !== recordId);
    await saveRecords(remaining);

    if (target?.handle) {
      const current = await readCurrentHandle();
      if (await sameHandle(target.handle, current)) {
        await clearCurrentHandle();
      }
    }

    return remaining;
  }

  async function renderModalList(container) {
    const records = (await readRecords()).slice().sort((a, b) => String(b?.lastUsedAt ?? "").localeCompare(String(a?.lastUsedAt ?? "")));
    container.replaceChildren();

    if (!records.length) {
      const empty = document.createElement("div");
      empty.className = "sm-wm-empty";
      empty.textContent = "No saved workspaces.";
      container.appendChild(empty);
      return;
    }

    for (const record of records) {
      const row = document.createElement("div");
      row.className = "sm-wm-row";

      const meta = document.createElement("div");
      const name = document.createElement("div");
      name.className = "sm-wm-name";
      name.textContent = record?.name || "Workspace";
      const time = document.createElement("div");
      time.className = "sm-wm-time";
      time.textContent = formatDate(record?.lastUsedAt);
      meta.append(name, time);

      const forget = document.createElement("button");
      forget.type = "button";
      forget.className = "sm-wm-forget";
      forget.textContent = "Forget";
      forget.addEventListener("click", async () => {
        forget.disabled = true;
        try {
          await forgetRecord(record.id);
          await renderModalList(container);
          await refreshManagerButton();
        } catch (error) {
          console.error("Could not forget workspace", error);
          forget.disabled = false;
        }
      });

      row.append(meta, forget);
      container.appendChild(row);
    }
  }

  async function openManager() {
    ensureStyles();
    document.getElementById(MODAL_ID)?.remove();

    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    const card = document.createElement("div");
    card.className = "sm-wm-card";
    const head = document.createElement("div");
    head.className = "sm-wm-head";
    const title = document.createElement("h2");
    title.textContent = "Saved workspaces";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "sm-wm-close";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.addEventListener("click", () => modal.remove());
    head.append(title, close);

    const note = document.createElement("p");
    note.className = "sm-wm-note";
    note.textContent = "Forget only removes the workspace from this browser. It does not delete the folder or its data from your computer.";
    const list = document.createElement("div");
    card.append(head, note, list);
    modal.appendChild(card);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
    await renderModalList(list);
  }

  async function refreshManagerButton() {
    ensureStyles();
    const records = await readRecords();
    let button = document.getElementById(BUTTON_ID);

    if (records.length <= 1) {
      button?.remove();
      return;
    }

    if (!button) {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.addEventListener("click", () => void openManager());
      document.body.appendChild(button);
    }
    button.textContent = `Manage workspaces (${records.length})`;
  }

  window.addEventListener("sm-workspace-helper-installed", () => void refreshManagerButton());
  window.addEventListener("focus", () => void refreshManagerButton());
  window.addEventListener("pageshow", () => void refreshManagerButton());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshManagerButton();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void refreshManagerButton(), { once: true });
  } else {
    void refreshManagerButton();
  }
})();