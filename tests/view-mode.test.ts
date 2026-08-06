import { describe, expect, it } from "vitest";
import {
  isMetricAvailableInView,
  normalizeTeamViewMode,
} from "../apps/sm-tool/src/lib/view-mode.js";

describe("team presentation view", () => {
  it("keeps core flow metrics and hides technical diagnostics", () => {
    expect(isMetricAvailableInView("lead-time", "team")).toBe(true);
    expect(isMetricAvailableInView("active-time", "team")).toBe(true);
    expect(isMetricAvailableInView("cycle-time", "team")).toBe(true);
    expect(isMetricAvailableInView("sle-p85", "team")).toBe(true);
    expect(isMetricAvailableInView("functional-coverage", "team")).toBe(true);
    expect(isMetricAvailableInView("unit-test-coverage", "team")).toBe(true);
    expect(isMetricAvailableInView("technical-debt", "team")).toBe(true);
    expect(isMetricAvailableInView("forecast", "team")).toBe(false);
    expect(isMetricAvailableInView("data-monitor", "team")).toBe(false);
    expect(isMetricAvailableInView("forecast", "scrum-master")).toBe(true);
  });

  it("defaults unknown stored values to Scrum Master view", () => {
    expect(normalizeTeamViewMode("team")).toBe("team");
    expect(normalizeTeamViewMode("unexpected")).toBe("scrum-master");
    expect(normalizeTeamViewMode(null)).toBe("scrum-master");
  });
});
