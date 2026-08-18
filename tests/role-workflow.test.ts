import { describe, expect, it } from "vitest";
import {
  applyQaVerdict,
  canAdvance,
  nextRole,
  prepareRemediationHandoff,
  type WorkflowTask,
} from "../apps/sm-tool/src/lib/role-workflow";

const TASK: WorkflowTask = {
  id: "task-1",
  number: 1,
  title: "Test task",
  scope: "Test scope",
  needsDesign: false,
  status: "in-progress",
  currentRole: "qa",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("local role workflow transitions", () => {
  it("returns completed QA verdicts to Main", () => {
    const next = applyQaVerdict(TASK, "PASS", "2026-01-02T00:00:00.000Z");
    expect(next.currentRole).toBe("main");
    expect(next.status).toBe("passed");
    expect(next.verdict).toBe("PASS");
  });

  it("routes FAIL to Developer remediation while preserving the blocking verdict", () => {
    const next = applyQaVerdict(TASK, "FAIL", "2026-01-02T00:00:00.000Z");
    expect(next.currentRole).toBe("developer");
    expect(next.status).toBe("blocked");
    expect(canAdvance(next)).toBe(true);

    const qaReview = prepareRemediationHandoff(next, "2026-01-03T00:00:00.000Z");
    expect(qaReview.currentRole).toBe("qa");
    expect(qaReview.status).toBe("in-progress");
    expect(qaReview.verdict).toBeUndefined();
  });

  it("inserts Designer only for UI tasks and routes Developer to QA", () => {
    expect(nextRole({ ...TASK, currentRole: "architect", needsDesign: true }, "architect")).toBe("designer");
    expect(nextRole({ ...TASK, currentRole: "architect", needsDesign: false }, "architect")).toBe("developer");
    expect(nextRole({ ...TASK, currentRole: "developer" }, "developer")).toBe("qa");
  });
});
