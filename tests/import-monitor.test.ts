import { describe, expect, it } from "vitest";
import {
  commitImportMonitorBaseline,
  compareImportManifests,
  createImportManifest,
  createImportMonitorState,
  buildImportMonitorPresentation,
  observeImportManifest,
} from "../apps/sm-tool/src/lib/import-monitor";

function manifest(entries: Array<{ path: string; size: number; digest: string; status?: "ready" | "unstable" | "unavailable" }>, observedAt = 100) {
  return createImportManifest(
    entries.map((entry) => ({
      relativePath: entry.path,
      size: entry.size,
      modifiedAt: 100,
      digest: entry.digest,
      status: entry.status ?? "ready",
    })),
    observedAt,
  );
}

describe("selected-team import monitor", () => {
  it("provides explicit lifecycle copy for empty, watching, stability, permission, and failure states", () => {
    const state = createImportMonitorState();
    expect(buildImportMonitorPresentation({ error: null, scanning: false, recalculating: false, recalculateFailed: false, recalculatedSuccessfully: false, paused: false, hasUsableImports: false, hasMetrics: false, state }).status).toContain("No CSV imports");
    expect(buildImportMonitorPresentation({ error: null, scanning: false, recalculating: false, recalculateFailed: false, recalculatedSuccessfully: false, paused: false, hasUsableImports: true, hasMetrics: true, state }).status).toContain("Auto-update on");
    expect(buildImportMonitorPresentation({ error: "permission", scanning: false, recalculating: false, recalculateFailed: false, recalculatedSuccessfully: false, paused: false, hasUsableImports: true, hasMetrics: true, state }).needsRetry).toBe(true);
    expect(buildImportMonitorPresentation({ error: null, scanning: false, recalculating: false, recalculateFailed: true, recalculatedSuccessfully: false, paused: false, hasUsableImports: true, hasMetrics: true, state }).status).toContain("Existing metrics are unchanged");
  });

  it("establishes a baseline without recalculating and detects normalized file changes", () => {
    const baseline = manifest([{ path: "2026\\08\\issues.csv", size: 10, digest: "a" }], 100);
    const initial = observeImportManifest(createImportMonitorState(), baseline);
    expect(initial.shouldRecalculate).toBe(false);
    expect(Object.keys(initial.state.baseline?.entries ?? {})).toEqual(["2026/08/issues.csv"]);

    const changed = manifest([{ path: "2026/08/issues.csv", size: 11, digest: "b" }], 200);
    expect(compareImportManifests(initial.state.baseline, changed)).toMatchObject({ changed: 1, meaningful: true });
    const firstStableScan = observeImportManifest(initial.state, changed);
    expect(firstStableScan.shouldRecalculate).toBe(false);
    expect(firstStableScan.state.phase).toBe("stability-wait");
    const secondStableScan = observeImportManifest(firstStableScan.state, manifest([{ path: "2026/08/issues.csv", size: 11, digest: "b" }], 1300));
    expect(secondStableScan.shouldRecalculate).toBe(true);
    expect(secondStableScan.state.stableScans).toBe(2);
  });

  it("defers unusable files and includes additions, removals, and renames in aggregate changes", () => {
    const baseline = manifest([
      { path: "old.csv", size: 10, digest: "a" },
      { path: "removed.csv", size: 10, digest: "b" },
    ], 100);
    const initial = observeImportManifest(createImportMonitorState(), baseline);
    const unstable = manifest([
      { path: "renamed.csv", size: 0, digest: "", status: "unstable" },
      { path: "removed.csv", size: 10, digest: "b" },
    ], 200);
    const waiting = observeImportManifest(initial.state, unstable);
    expect(waiting.shouldRecalculate).toBe(false);
    expect(waiting.state.phase).toBe("stability-wait");
    expect(waiting.change).toMatchObject({ added: 1, changed: 0, removed: 1 });

    const ready = manifest([{ path: "renamed.csv", size: 12, digest: "c" }], 300);
    const readyFirst = observeImportManifest(waiting.state, ready);
    expect(readyFirst.shouldRecalculate).toBe(false);
    const readySecond = observeImportManifest(readyFirst.state, manifest([{ path: "renamed.csv", size: 12, digest: "c" }], 1400));
    expect(readySecond.shouldRecalculate).toBe(true);
    const committed = commitImportMonitorBaseline(readySecond.state, ready);
    expect(observeImportManifest(committed, ready).shouldRecalculate).toBe(false);
  });
});
