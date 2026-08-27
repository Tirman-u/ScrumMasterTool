export type ImportManifestEntryStatus = "ready" | "unstable" | "unavailable";

export interface ImportManifestEntry {
  relativePath: string;
  size: number | null;
  modifiedAt: number | null;
  digest: string | null;
  status: ImportManifestEntryStatus;
}

export interface ImportManifest {
  entries: Readonly<Record<string, ImportManifestEntry>>;
  fingerprint: string;
  observedAt: number;
  hasUnusableEntries: boolean;
}

export interface ImportChangeSummary {
  added: number;
  changed: number;
  removed: number;
  meaningful: boolean;
}

export type ImportMonitorPhase = "baseline" | "watching" | "detecting" | "stability-wait" | "ready";

export interface ImportMonitorState {
  baseline: ImportManifest | null;
  candidateFingerprint: string | null;
  stableScans: number;
  stableSince: number | null;
  phase: ImportMonitorPhase;
  lastChange: ImportChangeSummary;
}

export interface ImportMonitorObservation {
  state: ImportMonitorState;
  change: ImportChangeSummary;
  shouldRecalculate: boolean;
}

export interface ImportMonitorPresentationInput {
  error: "permission" | "unsupported" | "error" | null;
  scanning: boolean;
  recalculating: boolean;
  recalculateFailed: boolean;
  recalculatedSuccessfully: boolean;
  paused: boolean;
  hasUsableImports: boolean;
  hasMetrics: boolean;
  state: ImportMonitorState;
}

export interface ImportMonitorPresentation {
  status: string;
  detail: string | null;
  needsRetry: boolean;
}

const EMPTY_CHANGE: ImportChangeSummary = { added: 0, changed: 0, removed: 0, meaningful: false };
const STABILITY_DEBOUNCE_MS = 1_000;

export function createImportManifest(entries: ImportManifestEntry[], observedAt = Date.now()): ImportManifest {
  const normalizedEntries = entries
    .map((entry) => ({
      ...entry,
      relativePath: normalizeRelativePath(entry.relativePath),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const record = Object.fromEntries(normalizedEntries.map((entry) => [entry.relativePath, entry]));
  const fingerprint = normalizedEntries
    .map((entry) => [entry.relativePath, entry.size, entry.modifiedAt, entry.digest, entry.status].join("\u001f"))
    .join("\u001e");

  return {
    entries: record,
    fingerprint,
    observedAt,
    hasUnusableEntries: normalizedEntries.some((entry) => entry.status !== "ready"),
  };
}

export function createImportMonitorState(): ImportMonitorState {
  return {
    baseline: null,
    candidateFingerprint: null,
    stableScans: 0,
    stableSince: null,
    phase: "baseline",
    lastChange: EMPTY_CHANGE,
  };
}

export function compareImportManifests(
  baseline: ImportManifest | null,
  current: ImportManifest,
): ImportChangeSummary {
  if (!baseline) {
    return EMPTY_CHANGE;
  }

  const baselinePaths = new Set(Object.keys(baseline.entries));
  const currentPaths = new Set(Object.keys(current.entries));
  let added = 0;
  let changed = 0;
  let removed = 0;

  currentPaths.forEach((path) => {
    if (!baselinePaths.has(path)) {
      added += 1;
      return;
    }

    const before = baseline.entries[path];
    const after = current.entries[path];
    if (
      before.size !== after.size ||
      before.modifiedAt !== after.modifiedAt ||
      before.digest !== after.digest ||
      before.status !== after.status
    ) {
      changed += 1;
    }
  });

  baselinePaths.forEach((path) => {
    if (!currentPaths.has(path)) {
      removed += 1;
    }
  });

  return { added, changed, removed, meaningful: added > 0 || changed > 0 || removed > 0 };
}

export function observeImportManifest(
  state: ImportMonitorState,
  current: ImportManifest,
): ImportMonitorObservation {
  if (!state.baseline) {
    return {
      state: {
        ...state,
        baseline: current,
        candidateFingerprint: null,
        stableScans: 0,
        stableSince: null,
        phase: "watching",
        lastChange: EMPTY_CHANGE,
      },
      change: EMPTY_CHANGE,
      shouldRecalculate: false,
    };
  }

  const change = compareImportManifests(state.baseline, current);
  if (!change.meaningful) {
    return {
      state: { ...state, candidateFingerprint: null, stableScans: 0, stableSince: null, phase: "watching", lastChange: EMPTY_CHANGE },
      change,
      shouldRecalculate: false,
    };
  }

  if (current.hasUnusableEntries) {
    return {
      state: { ...state, candidateFingerprint: null, stableScans: 0, stableSince: null, phase: "stability-wait", lastChange: change },
      change,
      shouldRecalculate: false,
    };
  }

  const sameCandidate = state.candidateFingerprint === current.fingerprint;
  const stableScans = sameCandidate ? state.stableScans + 1 : 1;
  const stableSince = sameCandidate ? state.stableSince : current.observedAt;
  const ready = stableScans >= 2 && stableSince !== null && current.observedAt - stableSince >= STABILITY_DEBOUNCE_MS;
  return {
    state: {
      ...state,
      candidateFingerprint: current.fingerprint,
      stableScans,
      stableSince,
      phase: ready ? "ready" : "stability-wait",
      lastChange: change,
    },
    change,
    shouldRecalculate: ready,
  };
}

export function commitImportMonitorBaseline(state: ImportMonitorState, manifest: ImportManifest): ImportMonitorState {
  return {
    ...state,
    baseline: manifest,
    candidateFingerprint: null,
    stableScans: 0,
    stableSince: null,
    phase: "watching",
    lastChange: EMPTY_CHANGE,
  };
}

export function buildImportMonitorPresentation(input: ImportMonitorPresentationInput): ImportMonitorPresentation {
  const change = input.state.lastChange;
  if (input.error === "permission") {
    return { status: "Cannot check for import changes. Workspace permission is required.", detail: "The browser denied access to the selected imports folder.", needsRetry: true };
  }
  if (input.error === "unsupported") {
    return { status: "Automatic change detection is not available in this browser. Use Recalculate team to update metrics.", detail: "Manual recalculation is available.", needsRetry: true };
  }
  if (input.error === "error") {
    return { status: "Could not check for import changes. Existing metrics are unchanged.", detail: null, needsRetry: true };
  }
  if (input.scanning) {
    return { status: "Checking for import changes…", detail: "Comparing the selected team’s import manifest.", needsRetry: false };
  }
  if (input.recalculating) {
    return { status: "Recalculating this team…", detail: "Local analysis in progress.", needsRetry: false };
  }
  if (input.paused) {
    return { status: "Auto-update paused for this session.", detail: null, needsRetry: false };
  }
  if (!input.hasUsableImports) {
    return { status: "No CSV imports found for this team. Auto-update is waiting for the first import.", detail: null, needsRetry: false };
  }
  if (!input.hasMetrics) {
    return { status: "No calculated metrics yet. Recalculate team after imports are available.", detail: null, needsRetry: false };
  }
  if (input.recalculateFailed) {
    return { status: "Auto-update could not recalculate. Existing metrics are unchanged.", detail: "Try again to recalculate this team.", needsRetry: true };
  }
  if (change.meaningful && input.state.phase === "stability-wait") {
    return {
      status: "Waiting for files to finish syncing…",
      detail: input.state.stableScans > 0 ? `Waiting for a second stable scan (${Math.min(input.state.stableScans, 1)} of 2).` : "The import may still be syncing.",
      needsRetry: false,
    };
  }
  if (input.recalculatedSuccessfully) {
    return { status: "Auto-update complete · metrics recalculated just now", detail: null, needsRetry: false };
  }
  return { status: "Auto-update on · Watching this team’s imports", detail: null, needsRetry: false };
}

function normalizeRelativePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}
