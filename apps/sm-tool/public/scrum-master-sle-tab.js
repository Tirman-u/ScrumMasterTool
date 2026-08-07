(() => {
  const STORAGE_KEY = "sm-tool-team-view-mode";

  function syncCycleTabLabel() {
    const scrumMasterView = window.localStorage.getItem(STORAGE_KEY) !== "team";
    document.querySelectorAll(".team-tabs button").forEach((button) => {
      const text = (button.textContent || "").trim();
      const isCycleTab = button.dataset.smCycleTab === "1" || text === "Cycle Time" || text === "SLE Cycle Time";
      if (!isCycleTab) return;

      button.dataset.smCycleTab = "1";
      button.textContent = scrumMasterView ? "SLE Cycle Time" : "Cycle Time";
      if (scrumMasterView) {
        button.title = "Open the SLE Cycle Time scatterplot";
      } else {
        button.removeAttribute("title");
      }
    });
  }

  const observer = new MutationObserver(syncCycleTabLabel);
  const start = () => {
    const root = document.getElementById("root");
    if (!root) return;
    observer.observe(root, { childList: true, subtree: true });
    syncCycleTabLabel();
  };

  document.addEventListener("click", () => window.setTimeout(syncCycleTabLabel, 0), true);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
