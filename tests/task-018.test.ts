import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const app = fs.readFileSync(path.join(root, "apps/sm-tool/src/App.tsx"), "utf8");
const views = fs.readFileSync(path.join(root, "apps/sm-tool/src/components/ExecutiveViews.tsx"), "utf8");
const workspace = fs.readFileSync(path.join(root, "apps/sm-tool/src/lib/workspace.ts"), "utf8");
const styles = fs.readFileSync(path.join(root, "apps/sm-tool/src/styles.css"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "apps/sm-tool/package.json"), "utf8")) as { scripts?: Record<string, string> };

describe("TASK 018 executive UX consolidation", () => {
  it("uses authoritative observation periods and keeps capture time as provenance", () => {
    expect(app).toContain("(snapshot.metrics.asOf ?? snapshot.capturedAt).slice(0, 7)");
    expect(app).toContain("capturedAt: snapshot.capturedAt");
  });

  it("does not provide a semantics-changing legacy history fallback", () => {
    expect(views).toContain("no typed historical series is available for this metric. No legacy history fallback is used.");
    expect(views).not.toContain("legacySnapshots.map((point) => ({ ...point, value: point.cycleTime }))");
    expect(views).not.toContain("function MetricTrustPopover");
    expect(views.match(/function MetricInsightModal/g)?.length).toBe(1);
  });

  it("keeps the handed-off readable dialog layout and canonical Cycle Time entry", () => {
    expect(styles).toContain("width: min(760px, calc(100vw - 32px))");
    expect(styles).toContain(".metric-insight-main-grid");
    expect(styles).toContain("grid-template-columns: 1fr");
    expect(views).toContain('id="team-cycle-time-tab"');
    expect(views).toMatch(/id="team-cycle-time-tab"[\s\S]{0,260}>\s*Cycle Time\s*</);
  });

  it("routes imported CSV writes through the verified writer", () => {
    const importSection = workspace.slice(workspace.indexOf("export async function importCsvFiles"), workspace.indexOf("export interface CsvImportContent"));
    const contentSection = workspace.slice(workspace.indexOf("export async function importCsvContents"), workspace.indexOf("export async function analyzeTeam"));
    expect(importSection).toContain("writeVerifiedFile(destinationDir, destinationName");
    expect(contentSection).toContain("writeVerifiedFile(destinationDir, destinationName");
    expect(importSection).not.toContain("destinationHandle.createWritable");
    expect(contentSection).not.toContain("destinationHandle.createWritable");
    expect(workspace).toContain("atomic local file replacement is not supported by this browser");
  });

  it("does not mutate tracked source files during the app build", () => {
    expect(packageJson.scripts?.prebuild).toBeUndefined();
    expect(fs.existsSync(path.join(root, "apps/sm-tool/scripts/apply-metric-consistency-patch.mjs"))).toBe(false);
  });
});
