(() => {
  // GLOBAL PILOT CONSISTENCY BRIDGE — applies to every team.
  //
  // Shared KPI cards already use the same `data.kpis` in Team and Scrum Master
  // views. The remaining inconsistency is Team Flow / Where Time Is Spent:
  // ExecutiveViews currently receives a separate `flowStages` snapshot while
  // the Scrum Master Time in Status / Process Health path uses the selected
  // period's core Time in Status rows and health snapshot.
  //
  // This bridge makes the Team presentation consume those already-rendered core
  // values. It has no team-specific names/IDs and uses no MutationObserver or
  // permanent polling. Codex can remove it once the React data model exposes one
  // canonical flow-stage model directly to both views.

  const TONES = {
    good: { fg: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
    warning: { fg: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
    critical: { fg: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
    neutral: { fg: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0" },
  };

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function parseDays(value) {
    const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getToneFromLegacyCard(card) {
    if (card.classList.contains("bad")) return TONES.critical;
    if (card.classList.contains("warn")) return TONES.warning;
    if (card.classList.contains("good")) return TONES.good;
    return TONES.neutral;
  }

  function setSummaryValue(pipeline, label, value) {
    const items = Array.from(pipeline.querySelectorAll(".exec-summary-kpi"));
    const item = items.find((node) => normalize(node.querySelector("div")?.textContent) === normalize(label));
    const strong = item?.querySelector("strong");
    if (strong) strong.textContent = value;
  }

  function getLegacyRoot() {
    return document.querySelector(".legacy-team-ui");
  }

  // Read the exact selected-period Time in Status rows already produced by the
  // core React calculation. This also carries the core health tone/category.
  function readCoreTimeInStatusRows() {
    const root = getLegacyRoot();
    if (!root) return [];

    return Array.from(root.querySelectorAll(".team-time-status-summary .time-status-card"))
      .map((card) => {
        const name = card.querySelector(".time-status-name")?.textContent?.trim() || "";
        const category = normalize(card.querySelector(".time-status-kind")?.textContent);
        const days = parseDays(card.querySelector("strong")?.textContent);
        if (!name || days === null) return null;

        return {
          name,
          days,
          // Executive Time in Status treats only explicit Active rows as active;
          // Queue/Other diagnostic states are waiting time.
          active: category === "active",
          tone: getToneFromLegacyCard(card),
        };
      })
      .filter(Boolean);
  }

  function findCoreMetricValue(label) {
    const root = getLegacyRoot();
    if (!root) return null;

    const target = normalize(label);
    const cards = Array.from(root.querySelectorAll(".team-kpi-card"));
    for (const card of cards) {
      const labelNode = card.querySelector(".metric-label-row > span, .metric-label-row span");
      if (normalize(labelNode?.textContent) !== target) continue;
      const value = card.querySelector("strong")?.textContent?.trim();
      if (value) return value;
    }

    return null;
  }

  function normalizeQueueMetricValue(value) {
    if (!value) return null;
    return value.replace(/\s+days?\b/gi, "d").replace(/\s+/g, " ").trim();
  }

  function buildVisibleCard(row, templateWrapper) {
    const wrapper = templateWrapper.cloneNode(true);
    const card = wrapper.querySelector("article");
    const kind = card?.querySelector("span");
    const name = card?.querySelector("strong");
    const value = card?.querySelector("b");
    if (kind) kind.textContent = row.active ? "ACTIVE" : "QUEUE";
    if (name) name.textContent = row.name;
    if (value) value.innerHTML = `${row.days.toFixed(1)}<small>d</small>`;
    return wrapper;
  }

  function applyRowPresentation(wrapper, row, maxDays, isLast) {
    const card = wrapper.querySelector("article");
    if (!card) return;

    const kind = card.querySelector("span");
    const value = card.querySelector("b");
    const bar = card.querySelector("i > u");
    const arrow = wrapper.querySelector("em");

    if (kind) {
      kind.textContent = row.active ? "ACTIVE" : "QUEUE";
      kind.style.color = row.tone.fg;
    }
    card.style.background = row.tone.bg;
    card.style.borderColor = row.tone.border;
    if (value) {
      value.innerHTML = `${row.days.toFixed(1)}<small>d</small>`;
      value.style.color = row.tone.fg;
    }
    if (bar instanceof HTMLElement) {
      bar.style.width = `${Math.max(8, (row.days / maxDays) * 100)}%`;
      bar.style.background = row.tone.fg;
    }

    if (isLast) {
      arrow?.remove();
    } else if (!arrow) {
      const marker = document.createElement("em");
      marker.textContent = "›";
      wrapper.insertBefore(marker, wrapper.firstChild);
    }
  }

  function syncVisibleStageCards(pipeline, coreRows) {
    const rowContainer = pipeline.querySelector(".exec-flow-arrow-row");
    if (!rowContainer || coreRows.length === 0) return coreRows;

    const existingWrappers = Array.from(rowContainer.children).filter((node) => node instanceof HTMLElement);
    if (existingWrappers.length === 0) return coreRows;

    const byName = new Map();
    existingWrappers.forEach((wrapper) => {
      const name = wrapper.querySelector("article > strong")?.textContent?.trim();
      if (name) byName.set(normalize(name), wrapper);
    });

    const template = existingWrappers[0];
    const ordered = [];
    coreRows.forEach((row) => {
      const wrapper = byName.get(normalize(row.name)) || buildVisibleCard(row, template);
      const name = wrapper.querySelector("article > strong");
      if (name) name.textContent = row.name;
      ordered.push({ wrapper, row });
    });

    // Remove stale/latest-month-only cards and rebuild in the exact order of the
    // selected-period core Time in Status rows (All/YTD/range/month all work).
    rowContainer.replaceChildren(...ordered.map((item) => item.wrapper));
    const maxDays = Math.max(1, ...coreRows.map((row) => row.days));
    ordered.forEach((item, index) => applyRowPresentation(item.wrapper, item.row, maxDays, index === ordered.length - 1));

    return coreRows;
  }

  function patchTeamFlow() {
    const pipeline = document.querySelector(".exec-flow-pipeline");
    if (!pipeline) return false;

    const coreRows = readCoreTimeInStatusRows();
    if (coreRows.length === 0) return false;
    const rows = syncVisibleStageCards(pipeline, coreRows);

    let queueDays = 0;
    let activeDays = 0;
    let biggestQueue = null;

    rows.forEach((row) => {
      if (row.active) {
        activeDays += row.days;
      } else {
        queueDays += row.days;
        if (!biggestQueue || row.days > biggestQueue.days) biggestQueue = row;
      }
    });

    const totalDays = queueDays + activeDays;
    const rawActiveShare = totalDays > 0 ? `${((activeDays / totalDays) * 100).toFixed(1)}%` : "-";

    // Exact same core metric shown in Scrum Master Process Health.
    const coreFlowEfficiency = findCoreMetricValue("Flow Efficiency") || rawActiveShare;

    // Exact core queue ranking if available; otherwise use the same selected-
    // period rows shown above.
    const coreBiggestQueue = normalizeQueueMetricValue(findCoreMetricValue("Queue Time by Status"));
    const biggestQueueValue =
      coreBiggestQueue || (biggestQueue ? `${biggestQueue.name} ${biggestQueue.days.toFixed(1)}d` : "-");

    setSummaryValue(pipeline, "Total Queue Time", `${queueDays.toFixed(1)}d`);
    setSummaryValue(pipeline, "Total Active Time", `${activeDays.toFixed(1)}d`);
    setSummaryValue(pipeline, "Flow Efficiency", coreFlowEfficiency);
    setSummaryValue(pipeline, "Biggest Queue", biggestQueueValue);

    return true;
  }

  function schedulePatch() {
    // Finite retries cover asynchronous React navigation / team switches without
    // a permanent background observer.
    [0, 80, 220, 500, 900].forEach((delay) => window.setTimeout(patchTeamFlow, delay));
  }

  window.addEventListener("DOMContentLoaded", schedulePatch, { once: true });
  window.addEventListener("pageshow", schedulePatch);
  window.addEventListener("focus", schedulePatch);
  document.addEventListener("click", schedulePatch, true);
  document.addEventListener("change", schedulePatch, true);
})();
