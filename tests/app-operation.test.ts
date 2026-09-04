import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyOperationFailure, createOperation, finishOperation } from "../apps/sm-tool/src/lib/app-operation";
import { nextRetryCount } from "../apps/sm-tool/src/lib/app-operation";

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

  it("classifies recovery failures without exposing raw diagnostics", () => {
    const cases = [
      ["NotAllowedError: permission denied", "permission-denied", "recheck-permission"],
      ["read-only corporate policy", "read-only-policy", "choose-workspace"],
      ["workspace directory missing", "directory-missing", "choose-workspace"],
      ["file locked during sync", "locked-sync", "retry-workspace"],
      ["File System Access API unavailable", "unsupported-browser", "manual-import"],
      ["QuotaExceededError", "quota-resource", "retry-workspace"],
      ["could not serialize JSON", "serialization-validation", "retry-team-save"],
      ["unexpected internal detail at /private/customer.csv", "unknown", "retry-workspace"],
    ] as const;
    for (const [raw, errorKind, recoveryAction] of cases) {
      const failure = classifyOperationFailure(new Error(raw), 42);
      expect(failure.errorKind).toBe(errorKind);
      expect(failure.recoveryAction).toBe(recoveryAction);
      expect(failure.message).not.toContain(raw);
      expect(failure.message).not.toContain("customer.csv");
      expect(failure.diagnosticRef).toBe("op-42");
    }
  });

  it("keeps retry metadata monotonic and enumerates mutating App entry points", () => {
    expect(nextRetryCount(undefined)).toBe(1);
    expect(nextRetryCount(2)).toBe(3);
    const appSource = readFileSync(new URL("../apps/sm-tool/src/App.tsx", import.meta.url), "utf8");
    expect(appSource).not.toContain("setBusy(");
    expect(appSource).toContain("if (operationRef.current?.state === \"active\") return null;");
    expect(appSource).toContain("retryCountRef.current = nextRetryCount(operation.retryCount);");

    const directOperationEntries = [
      "handleCreateTeam",
      "handleUpdateTeamEntityType",
      "handleSaveBugMetricConfig",
      "persistImportTeamConfig",
      "handleSaveBottleneckEntry",
      "handleDeleteBottleneckEntry",
      "handleSaveFlowTemplate",
      "handleSaveFlowFromRows",
      "handleExcludeIssuesFromMetrics",
      "handleRestoreExcludedIssue",
      "handleRestoreAllExcludedIssues",
      "handleApplySleIssueTypes",
    ];
    for (const name of directOperationEntries) {
      const start = appSource.indexOf(`async function ${name}`);
      expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
      const end = appSource.indexOf("\n  async function ", start + 1);
      const body = appSource.slice(start, end < 0 ? undefined : end);
      expect(body, `${name} must enter the structured coordinator`).toContain("beginOperation(");
    }
    expect(appSource.slice(appSource.indexOf("async function handleExcludeIssueFromMetrics"), appSource.indexOf("\n  async function handleRestoreExcludedIssue")))
      .toContain("handleExcludeIssuesFromMetrics(");
    for (const name of ["handleCreateWorkspaceProfile", "handleDeleteActiveWorkspaceProfile", "handleToggleTeamInWorkspaceProfile"]) {
      const start = appSource.indexOf(`async function ${name}`);
      const end = appSource.indexOf("\n  async function ", start + 1);
      expect(appSource.slice(start, end < 0 ? undefined : end)).toContain("persistWorkspaceProfiles(");
    }
    const profilePersistence = appSource.slice(appSource.indexOf("async function persistWorkspaceProfiles"), appSource.indexOf("\n  async function persistWorkspaceMetricConfig"));
    expect(profilePersistence).toContain("beginOperation(\"Saving workspace\"");
    const metricPersistence = appSource.slice(appSource.indexOf("async function persistWorkspaceMetricConfig"), appSource.indexOf("\n  async function refreshRememberedWorkspaces"));
    expect(metricPersistence).toContain("beginOperation(\"Saving workspace\"");
    expect(metricPersistence).toContain("Writing local data");
    expect(metricPersistence).toContain("Reading back local data");
    const picker = appSource.slice(appSource.indexOf("async function handlePickWorkspace"), appSource.indexOf("\n  async function handleOpenRememberedWorkspace"));
    expect(picker).toContain("Workspace selection was not completed. Choose Workspace again.");
    expect(picker).toContain('recoveryAction = failure.errorKind === "unsupported-browser" ? "manual-import" : "choose-workspace"');
    const recovery = appSource.slice(appSource.indexOf("function handleOperationRecovery"), appSource.indexOf("\n  async function handleSelectWorkspaceProfile"));
    expect(recovery).toContain("if (recoveryWorkspaceId)");
    expect(recovery).toContain("void handlePickWorkspace();");
  });

  it("does not ship the removed unauthenticated pilot sync asset", () => {
    expect(existsSync(new URL("../apps/sm-tool/public/pilot-access-sync.js", import.meta.url))).toBe(false);
    const index = readFileSync(new URL("../apps/sm-tool/index.html", import.meta.url), "utf8");
    expect(index).not.toContain("pilot-access-sync");
    const appSource = readFileSync(new URL("../apps/sm-tool/src/App.tsx", import.meta.url), "utf8");
    expect(appSource).not.toContain("canManagePilotAccess");
    expect(appSource).not.toContain("renderMasterAdminPage");
    expect(appSource).not.toContain("pilot:manage");
  });

  it("routes unsupported atomic file replacement to manual recovery", () => {
    const failure = classifyOperationFailure(new Error("atomic local file replacement is not supported by this browser"), 9);
    expect(failure).toMatchObject({ errorKind: "unsupported-browser", recoveryAction: "manual-import" });
  });
});
