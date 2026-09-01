import { describe, expect, it } from "vitest";
import { createOperation, finishOperation } from "../apps/sm-tool/src/lib/app-operation";

describe("structured application operations", () => {
  it("keeps phase and active state explicit", () => {
    expect(createOperation(1, "Opening workspace", "Loading workspace and teams…")).toMatchObject({
      operationId: 1,
      phase: "Opening workspace",
      state: "active",
    });
  });

  it("ignores stale completion and allows the current operation to finish", () => {
    const current = createOperation(2, "Recalculating team", "Recalculating this team locally…");
    expect(finishOperation(current, 1, "complete", "Old operation finished.")).toBe(current);
    expect(finishOperation(current, 2, "error", "Could not complete.", "Try again", "retry-recalculate-team")).toMatchObject({
      operationId: 2,
      state: "error",
      recovery: "Try again",
      recoveryAction: "retry-recalculate-team",
    });
  });

  it("maps only actionable recovery copy to a keyboard-operable action", () => {
    const workspaceError = finishOperation(
      createOperation(3, "Opening workspace", "Loading workspace and teams…"),
      3,
      "error",
      "Permission was not granted.",
      "Choose Workspace",
      "retry-workspace",
    );
    expect(workspaceError?.recoveryAction).toBe("retry-workspace");
    const informational = finishOperation(
      createOperation(4, "Saving team", "Saving settings…"),
      4,
      "complete",
      "Settings saved.",
      "Previous data remains available.",
    );
    expect(informational?.recoveryAction).toBeUndefined();
    expect(finishOperation(
      createOperation(5, "Saving team", "Saving settings…"),
      5,
      "error",
      "Save failed.",
      "Try again",
      "retry-team-save",
    )?.recoveryAction).toBe("retry-team-save");
  });
});
