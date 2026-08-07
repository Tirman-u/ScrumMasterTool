(() => {
  // Temporary pilot presentation bridge.
  //
  // Root cause: App.tsx currently builds executiveFlowStages with
  // isDefaultNonFlowStatus(), which is too coarse for queue-vs-active flow.
  // That makes statuses such as "Waiting for acceptance" and "Ready for test"
  // look ACTIVE and can produce impossible-looking values such as 99.9% flow
  // efficiency with a 141-day waiting stage.
  //
  // Keep this lightweight (no MutationObserver / continuous polling). Codex can
  // remove this file once Executive Flow uses the same queue classifier as the
  // Time in Status / Process Health core logic.

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
    "reopened",
  ];

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isQueueStatus(name) {
    const normalized = normalize(name);
    return Boolean(normalized) && QUEUE_HINTS.some((hint) => normalized.includes(hint));
  }

  function parseDays(value) {
    const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function setSummaryValue(pipeline, label, value) {
    const items = Array.from(pipeline.querySelectorAll(".exec-summary-kpi"));
    const item = items.find((node) => normalize(node.querySelector("div")?.textContent) === normalize(label));
    const strong = item?.querySelector("strong");
    if (strong) strong.textContent = value;
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

      const queue = isQueueStatus(name);
      const kind = card.querySelector("span");
      if (kind) {
        kind.textContent = queue ? "QUEUE" : "ACTIVE";
        kind.style.color = queue ? (days > 20 ? "#DC2626" : days > 7 ? "#D97706" : "#94A3B8") : "#16A34A";
      }

      if (queue) {
        queueDays += days;
        if (!biggestQueue || days > biggestQueue.days) biggestQueue = { name, days };

        // Queue stages should visually signal waiting risk, not healthy active work.
        const tone = days > 20
          ? { fg: "#DC2626", bg: "#FEF2F2", border: "#FECACA" }
          : days > 7
            ? { fg: "#D97706", bg: "#FFFBEB", border: "#FDE68A" }
            : { fg: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0" };
        card.style.background = tone.bg;
        card.style.borderColor = tone.border;
        if (valueNode) valueNode.style.color = tone.fg;
      } else {
        activeDays += days;
      }
    });

    const totalDays = queueDays + activeDays;
    const flowEfficiency = totalDays > 0 ? `${((activeDays / totalDays) * 100).toFixed(1)}%` : "-";

    setSummaryValue(pipeline, "Total Queue Time", `${queueDays.toFixed(1)}d`);
    setSummaryValue(pipeline, "Total Active Time", `${activeDays.toFixed(1)}d`);
    setSummaryValue(pipeline, "Flow Efficiency", flowEfficiency);
    setSummaryValue(
      pipeline,
      "Biggest Queue",
      biggestQueue ? `${biggestQueue.name} ${biggestQueue.days.toFixed(1)}d` : "-",
    );

    return true;
  }

  function schedulePatch() {
    // React navigation/rendering is asynchronous. A few finite retries are enough
    // without keeping a background observer alive.
    [0, 80, 220, 500].forEach((delay) => window.setTimeout(patchTeamFlow, delay));
  }

  window.addEventListener("DOMContentLoaded", schedulePatch, { once: true });
  window.addEventListener("pageshow", schedulePatch);
  document.addEventListener("click", schedulePatch, true);
})();
