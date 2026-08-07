(() => {
  // GLOBAL PILOT CONSISTENCY BRIDGE — applies to every team.
  //
  // The React data model already shares the same `data.kpis` between Team and
  // Scrum Master views. The remaining inconsistency is the Team Flow pipeline:
  // it independently classifies statuses and independently recalculates Flow
  // Efficiency / Biggest Queue. That can disagree with Process Health.
  //
  // Until Codex consolidates this directly in ExecutiveViews/App.tsx, keep the
  // visible Team Flow presentation aligned with the existing core calculations.
  // No team IDs/names are hard-coded and no MutationObserver/polling loop is used.

  const QUEUE_HINTS = [
    "backlog",
    "funnel",
    "to do",
    "todo",
    "selected for",
    "open",
    "queue",
    "ready",
    "pending",
    "blocked",
    "wait",
    "waiting",
    "on hold",
    "hold",
    "preparation",
    "release",
    "analysis",
    "analysing",
    "refinement",
    "refined",
    "triage",
  ];

  const ACTIVE_HINTS = [
    "in progress",
    "progress",
    "develop",
    "development",
    "dev",
    "code",
    "review",
    "qa",
    "test",
    "validation",
    "accept",
    "implementation",
    "implementing",
    "build",
  ];

  const SEVERE_QUEUE_HINTS = ["blocked", "wait", "waiting", "on hold", "hold", "pending"];

  const TONES = {
    good: { fg: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
    warning: { fg: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
    critical: { fg: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
    neutral: { fg: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0" },
  };

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  // Mirrors App.tsx semantics: queue hints win first; only known value-adding
  // hints are ACTIVE. Unknown/non-value-adding states default to QUEUE.
  function isActiveStatus(name) {
    const normalized = normalize(name);
    if (!normalized) return false;
    if (QUEUE_HINTS.some((hint) => normalized.includes(hint))) return false;
    return ACTIVE_HINTS.some((hint) => normalized.includes(hint));
  }

  function parseDays(value) {
    const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // Same thresholds as App.tsx getTimeInStatusTone(). This fixes the previous
  // presentation bug where every ACTIVE status was painted green regardless of
  // whether it had been sitting there for 30, 50 or 100+ days.
  function getStatusTone(name, days, active) {
    if (!Number.isFinite(days) || days <= 0) return TONES.neutral;

    if (active) {
      return days <= 7 ? TONES.good : days <= 14 ? TONES.warning : TONES.critical;
    }

    const normalized = normalize(name);
    const severeQueue = SEVERE_QUEUE_HINTS.some((hint) => normalized.includes(hint));
    if (severeQueue) {
      return days <= 2 ? TONES.good : days <= 5 ? TONES.warning : TONES.critical;
    }

    return days <= 4 ? TONES.good : days <= 8 ? TONES.warning : TONES.critical;
  }

  function setSummaryValue(pipeline, label, value) {
    const items = Array.from(pipeline.querySelectorAll(".exec-summary-kpi"));
    const item = items.find((node) => normalize(node.querySelector("div")?.textContent) === normalize(label));
    const strong = item?.querySelector("strong");
    if (strong) strong.textContent = value;
  }

  // Executive view and the hidden legacy view are rendered from the same
  // selectedTeamHealth snapshot. Reading the hidden core metric here prevents
  // Team Flow from inventing a second definition for a metric with the same name.
  function findCoreMetricValue(label) {
    const legacyRoot = document.querySelector(".legacy-team-ui");
    if (!legacyRoot) return null;

    const target = normalize(label);
    const cards = Array.from(legacyRoot.querySelectorAll(".team-kpi-card"));
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

  function patchTeamFlow() {
    const pipeline = document.querySelector(".exec-flow-pipeline");
    if (!pipeline) return false;

    const cards = Array.from(pipeline.querySelectorAll(".exec-flow-arrow-row article"));
    if (cards.length === 0) return false;

    let queueDays = 0;
    let activeDays = 0;
    let biggestQueue = null;

    cards.forEach((card) => {
      const name = card.querySelector("strong")?.textContent?.trim() || "";
      const valueNode = card.querySelector("b");
      const days = parseDays(valueNode?.textContent);
      if (days === null) return;

      const active = isActiveStatus(name);
      const queue = !active;
      const tone = getStatusTone(name, days, active);
      const kind = card.querySelector("span");

      if (kind) {
        kind.textContent = active ? "ACTIVE" : "QUEUE";
        kind.style.color = tone.fg;
      }

      card.style.background = tone.bg;
      card.style.borderColor = tone.border;
      if (valueNode) valueNode.style.color = tone.fg;

      const bar = card.querySelector("i > u");
      if (bar instanceof HTMLElement) bar.style.background = tone.fg;

      if (queue) {
        queueDays += days;
        if (!biggestQueue || days > biggestQueue.days) biggestQueue = { name, days };
      } else {
        activeDays += days;
      }
    });

    const totalDays = queueDays + activeDays;
    const rawActiveShare = totalDays > 0 ? `${((activeDays / totalDays) * 100).toFixed(1)}%` : "-";

    // Use the exact same core Flow Efficiency shown in Scrum Master Process
    // Health. Do not recompute a second metric with the same label in Team view.
    const coreFlowEfficiency = findCoreMetricValue("Flow Efficiency") || rawActiveShare;

    // Queue Time by Status is the core queue ranking. Prefer it for Biggest Queue
    // so Team and Scrum Master diagnostics identify the same waiting stage.
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
    // React navigation/rendering is asynchronous. Finite retries cover team
    // switches and Team/Scrum Master toggles without a permanent DOM observer.
    [0, 80, 220, 500, 900].forEach((delay) => window.setTimeout(patchTeamFlow, delay));
  }

  window.addEventListener("DOMContentLoaded", schedulePatch, { once: true });
  window.addEventListener("pageshow", schedulePatch);
  window.addEventListener("focus", schedulePatch);
  document.addEventListener("click", schedulePatch, true);
  document.addEventListener("change", schedulePatch, true);
})();
