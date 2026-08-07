(() => {
  // PILOT COMPATIBILITY PATCH
  //
  // Root cause in App.tsx:
  // - Executive Summary used bottleneckTrend.dominantStatus (historical mode),
  // - Process Health value used selectedBottleneckFlowTimes[0] (flow order),
  // - Process Health summary used getMaxBottleneckColumnForBoard() (actual
  //   selected-period max average Time in Status).
  //
  // The third value is the correct definition for the current Bottleneck.
  // Keep the two visible current-value fields aligned with that summary until
  // the App.tsx data model is consolidated by Codex. This deliberately avoids
  // MutationObserver: it only runs after normal UI interactions and a few
  // initial render retries, so it cannot create a React mutation loop.

  let syncTimer = null;

  function parseCurrentBottleneck(summary) {
    if (!summary) return null;
    // Examples:
    // Period Aug 2026: Waiting for acceptance (141.2 days).
    // Period Aug 2026: Waiting for acceptance (141.2 days, from Jul 2026).
    const match = summary.match(/^Period\s+.+?:\s+(.+?)\s+\(([0-9.]+)\s+days(?:,\s+from\s+.+?)?\)\.?$/i);
    if (!match) return null;
    return { name: match[1].trim(), summary };
  }

  function findProcessHealthBottleneckRow() {
    return Array.from(document.querySelectorAll(".exec-metric-row")).find((row) => {
      const label = row.querySelector(":scope > div:first-child > strong");
      return label?.textContent?.trim() === "Bottleneck";
    }) ?? null;
  }

  function findExecutiveBottleneckCard() {
    return Array.from(document.querySelectorAll(".exec-kpi-card")).find((card) => {
      const label = card.querySelector(".exec-kpi-top > span");
      return label?.textContent?.trim() === "Bottleneck";
    }) ?? null;
  }

  function syncBottleneckDisplay() {
    const row = findProcessHealthBottleneckRow();
    if (!row) return;

    const summaryNode = row.querySelector(":scope > div:first-child > span");
    const parsed = parseCurrentBottleneck(summaryNode?.textContent?.trim() ?? "");
    if (!parsed) return;

    const processValue = row.querySelector(":scope > div:last-child > b");
    if (processValue && processValue.textContent?.trim() !== parsed.name) {
      processValue.textContent = parsed.name;
    }

    const card = findExecutiveBottleneckCard();
    if (!card) return;

    const cardValue = card.querySelector(".exec-kpi-value > strong");
    if (cardValue && cardValue.textContent?.trim() !== parsed.name) {
      cardValue.textContent = parsed.name;
    }

    // Do not label the historical longest/dominant status as "prev".
    // Show the selected-period source text instead so the card is auditable.
    const cardSub = card.querySelector(".exec-kpi-sub > span");
    if (cardSub && cardSub.textContent?.trim() !== parsed.summary) {
      cardSub.textContent = parsed.summary;
    }
  }

  function scheduleSync(delay = 80) {
    if (syncTimer !== null) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      syncBottleneckDisplay();
    }, delay);
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, .nav-link")) {
      scheduleSync();
    }
  }, true);

  document.addEventListener("change", () => scheduleSync(), true);
  window.addEventListener("popstate", () => scheduleSync());
  window.addEventListener("focus", () => scheduleSync());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      scheduleSync(100);
      window.setTimeout(syncBottleneckDisplay, 700);
      window.setTimeout(syncBottleneckDisplay, 1800);
    }, { once: true });
  } else {
    scheduleSync(100);
    window.setTimeout(syncBottleneckDisplay, 700);
    window.setTimeout(syncBottleneckDisplay, 1800);
  }
})();