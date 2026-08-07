import { describe, expect, it } from "vitest";
import { buildExecutiveFlowSummary } from "./metric-consistency";

describe("buildExecutiveFlowSummary", () => {
  it("calculates one deterministic flow summary for all views", () => {
    const summary = buildExecutiveFlowSummary([
      { name: "Open", days: 19.5, type: "queue" },
      { name: "Investigation", days: 47.1, type: "queue" },
      { name: "Ready for Refinement", days: 6.5, type: "queue" },
      { name: "Reopened", days: 11.0, type: "queue" },
      { name: "Refined", days: 8.1, type: "queue" },
      { name: "Ready for test", days: 21.4, type: "queue" },
      { name: "In Development", days: 12.0, type: "active" },
      { name: "In Testing", days: 14.0, type: "active" },
    ]);

    expect(summary.queueDays).toBeCloseTo(113.6, 5);
    expect(summary.activeDays).toBeCloseTo(26.0, 5);
    expect(summary.totalDays).toBeCloseTo(139.6, 5);
    expect(summary.flowEfficiencyPct).toBeCloseTo(18.6246, 3);
    expect(summary.biggestQueueName).toBe("Investigation");
    expect(summary.biggestQueueDays).toBeCloseTo(47.1, 5);
  });

  it("uses the largest queue stage as the same bottleneck source", () => {
    const summary = buildExecutiveFlowSummary([
      { name: "In Development", days: 38.5, type: "active" },
      { name: "Waiting for acceptance", days: 141.2, type: "queue" },
      { name: "Ready for test", days: 37.3, type: "queue" },
    ]);

    expect(summary.biggestQueueName).toBe("Waiting for acceptance");
    expect(summary.biggestQueueDays).toBeCloseTo(141.2, 5);
  });
});
