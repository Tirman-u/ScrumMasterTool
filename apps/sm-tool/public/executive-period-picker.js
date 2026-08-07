(() => {
  /**
   * Executive period picker compatibility bridge.
   *
   * The application already owns the canonical period state in App.tsx and the
   * legacy period picker still drives all metric calculations. The new executive
   * dashboard initially rendered only a static period badge, so this bridge makes
   * that badge interactive without duplicating metric/date filtering logic.
   *
   * There is deliberately no MutationObserver or polling loop here. The bridge
   * uses event delegation and forwards a user selection to the existing React
   * period controls. This keeps the change small and avoids the performance issue
   * caused by earlier DOM-observer experiments. A future React refactor can lift
   * the period state into a shared component and remove this file cleanly.
   */

  const MENU_ID = "sm-executive-period-menu";
  let anchorButton = null;

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function findLegacyPicker() {
    const pickers = Array.from(document.querySelectorAll(".period-picker"));
    return pickers.find((picker) => picker.querySelector('[aria-label="Period start month"]')) || pickers[0] || null;
  }

  function findLegacyPresetButton(kind) {
    const picker = findLegacyPicker();
    if (!picker) return null;

    const buttons = Array.from(picker.querySelectorAll("button"));
    if (kind === "all") {
      return buttons.find((button) => normalize(button.textContent) === "all") || null;
    }
    if (kind === "ytd") {
      return buttons.find((button) => normalize(button.textContent).startsWith("ytd")) || null;
    }
    if (kind === "last-24m") {
      return buttons.find((button) => normalize(button.textContent).includes("last 24")) || null;
    }
    return null;
  }

  function getRangeSelects() {
    const picker = findLegacyPicker();
    if (!picker) return null;

    const start = picker.querySelector('[aria-label="Period start month"]');
    const end = picker.querySelector('[aria-label="Period end month"]');
    return start instanceof HTMLSelectElement && end instanceof HTMLSelectElement ? { start, end } : null;
  }

  function getLatestAvailableMonth() {
    const selects = getRangeSelects();
    if (!selects) return "";
    const values = Array.from(selects.end.options)
      .map((option) => option.value)
      .filter((value) => /^\d{4}-\d{2}$/.test(value))
      .sort();
    return values.at(-1) || "";
  }

  function shiftMonth(monthKey, delta) {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return "";
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function ensureSelectOption(select, value) {
    if (Array.from(select.options).some((option) => option.value === value)) return;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.dataset.executivePeriodTemporary = "true";
    select.append(option);
  }

  function dispatchSelect(select, value) {
    ensureSelectOption(select, value);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applyRange(startMonth, endMonth) {
    if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) return false;

    const orderedStart = startMonth <= endMonth ? startMonth : endMonth;
    const orderedEnd = startMonth <= endMonth ? endMonth : startMonth;
    const selects = getRangeSelects();
    if (!selects) return false;

    // React batches state updates. Send the end month on the next task so the
    // second change handler sees the newly selected start month.
    dispatchSelect(selects.start, orderedStart);
    window.setTimeout(() => {
      const fresh = getRangeSelects();
      if (!fresh) return;
      dispatchSelect(fresh.end, orderedEnd);
    }, 0);
    return true;
  }

  function applyRollingMonths(monthCount) {
    const end = getLatestAvailableMonth();
    if (!end) return false;
    const start = shiftMonth(end, -(Math.max(1, monthCount) - 1));
    return applyRange(start, end);
  }

  function applyPreset(kind) {
    if (kind === "last-12m") return applyRollingMonths(12);
    if (kind === "last-1m") return applyRollingMonths(1);

    const button = findLegacyPresetButton(kind);
    if (!button) return false;
    button.click();
    return true;
  }

  function closeMenu() {
    document.getElementById(MENU_ID)?.remove();
    anchorButton = null;
  }

  function positionMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = `${Math.min(window.innerHeight - 300, rect.bottom + 8)}px`;
    menu.style.left = `${Math.max(12, Math.min(window.innerWidth - 270, rect.left))}px`;
    menu.style.zIndex = "2147483646";
  }

  function makePresetButton(label, kind) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.periodKind = kind;
    Object.assign(button.style, {
      width: "100%",
      border: "0",
      borderRadius: "6px",
      background: "transparent",
      padding: "9px 10px",
      textAlign: "left",
      font: "inherit",
      fontSize: "13px",
      fontWeight: "600",
      color: "#0f172a",
      cursor: "pointer",
    });
    button.addEventListener("mouseenter", () => { button.style.background = "#f1f5f9"; });
    button.addEventListener("mouseleave", () => { button.style.background = "transparent"; });
    return button;
  }

  function showCustomFields(menu) {
    const existing = menu.querySelector("[data-custom-period-fields]");
    if (existing) {
      existing.remove();
      return;
    }

    const latest = getLatestAvailableMonth();
    const wrapper = document.createElement("div");
    wrapper.dataset.customPeriodFields = "true";
    Object.assign(wrapper.style, {
      borderTop: "1px solid #e2e8f0",
      marginTop: "6px",
      paddingTop: "10px",
      display: "grid",
      gap: "8px",
    });

    const start = document.createElement("input");
    start.type = "month";
    start.value = latest ? shiftMonth(latest, -1) : "";
    start.setAttribute("aria-label", "Custom period start month");

    const end = document.createElement("input");
    end.type = "month";
    end.value = latest;
    end.setAttribute("aria-label", "Custom period end month");

    [start, end].forEach((input) => {
      Object.assign(input.style, {
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #cbd5e1",
        borderRadius: "6px",
        padding: "7px 8px",
        font: "inherit",
        color: "#0f172a",
        background: "#fff",
      });
    });

    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Apply custom range";
    Object.assign(apply.style, {
      border: "0",
      borderRadius: "6px",
      padding: "8px 10px",
      background: "#4f46e5",
      color: "#fff",
      font: "inherit",
      fontSize: "12px",
      fontWeight: "700",
      cursor: "pointer",
    });
    apply.addEventListener("click", () => {
      if (applyRange(start.value, end.value)) {
        closeMenu();
      }
    });

    const note = document.createElement("small");
    note.textContent = "Metrics are filtered by calendar month.";
    Object.assign(note.style, { color: "#64748b", fontSize: "11px" });

    wrapper.append(start, end, apply, note);
    menu.append(wrapper);
  }

  function openMenu(anchor) {
    closeMenu();
    anchorButton = anchor;

    const menu = document.createElement("div");
    menu.id = MENU_ID;
    Object.assign(menu.style, {
      width: "240px",
      padding: "8px",
      border: "1px solid #dbe3ee",
      borderRadius: "9px",
      background: "#fff",
      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
    });

    [
      ["All time", "all"],
      ["24 months", "last-24m"],
      ["12 months", "last-12m"],
      ["1 month", "last-1m"],
      ["YTD", "ytd"],
    ].forEach(([label, kind]) => {
      const button = makePresetButton(label, kind);
      button.addEventListener("click", () => {
        if (applyPreset(kind)) closeMenu();
      });
      menu.append(button);
    });

    const custom = makePresetButton("Custom…", "custom");
    custom.addEventListener("click", () => showCustomFields(menu));
    menu.append(custom);

    document.body.append(menu);
    positionMenu(menu, anchor);
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const periodChip = target.closest(".exec-period-chip");
    if (periodChip instanceof HTMLButtonElement) {
      event.preventDefault();
      event.stopPropagation();
      if (anchorButton === periodChip && document.getElementById(MENU_ID)) {
        closeMenu();
      } else {
        openMenu(periodChip);
      }
      return;
    }

    const menu = document.getElementById(MENU_ID);
    if (menu && !menu.contains(target)) closeMenu();
  }, true);

  window.addEventListener("resize", closeMenu);
  window.addEventListener("scroll", closeMenu, true);
})();
