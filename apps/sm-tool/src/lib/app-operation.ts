export type AppOperationPhase =
  | "Opening workspace"
  | "Restoring access"
  | "Updating local helper"
  | "Recalculating all teams"
  | "Recalculating team"
  | "Saving workspace"
  | "Saving team"
  | "Checking workspace"
  | "Waiting for stable files"
  | "Writing local data"
  | "Reading back local data"
  | "Paused";

export type AppOperationState = "active" | "complete" | "error";
export type AppRecoveryAction =
  | "retry-workspace"
  | "retry-recalculate-all"
  | "retry-recalculate-team"
  | "retry-team-save"
  | "recheck-permission"
  | "choose-workspace"
  | "manual-import";
export type AppOperationErrorKind =
  | "permission-denied"
  | "permission-expired"
  | "read-only-policy"
  | "directory-missing"
  | "locked-sync"
  | "unsupported-browser"
  | "quota-resource"
  | "serialization-validation"
  | "unknown";

export interface AppOperation {
  operationId: number;
  phase: AppOperationPhase;
  message: string;
  state: AppOperationState;
  action?: string;
  recovery?: string;
  recoveryAction?: AppRecoveryAction;
  errorKind?: AppOperationErrorKind;
  retryCount?: number;
  lastKnownAvailable?: boolean;
  stale?: boolean;
  diagnosticRef?: string;
  recoveryWorkspaceId?: string;
  busy: boolean;
}

export interface OperationFailure {
  errorKind: AppOperationErrorKind;
  message: string;
  recovery: string;
  recoveryAction: AppRecoveryAction;
}

export function classifyOperationFailure(error: unknown, operationId: number, lastKnownAvailable = true): OperationFailure & { diagnosticRef: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.toLowerCase();
  const diagnosticRef = `op-${operationId}`;
  if (normalized.includes("notallowed") || normalized.includes("permission") || normalized.includes("denied") || normalized.includes("security")) {
    return { errorKind: normalized.includes("expired") ? "permission-expired" : "permission-denied", message: "Workspace permission is required. Choose Workspace to continue.", recovery: "Re-check permission", recoveryAction: "recheck-permission", diagnosticRef };
  }
  if (normalized.includes("readonly") || normalized.includes("read-only") || normalized.includes("policy") || normalized.includes("eacces")) {
    return { errorKind: "read-only-policy", message: "Workspace is read-only. Changes were not saved.", recovery: "Choose Workspace", recoveryAction: "choose-workspace", diagnosticRef };
  }
  if (normalized.includes("not found") || normalized.includes("missing") || normalized.includes("moved") || normalized.includes("directory")) {
    return { errorKind: "directory-missing", message: "Workspace folder could not be found. Choose Workspace again.", recovery: "Choose Workspace", recoveryAction: "choose-workspace", diagnosticRef };
  }
  if (normalized.includes("locked") || normalized.includes("busy") || normalized.includes("sync") || normalized.includes("partial")) {
    return { errorKind: "locked-sync", message: "Workspace files are unavailable while syncing. Try again.", recovery: "Try again", recoveryAction: "retry-workspace", diagnosticRef };
  }
  if (normalized.includes("file system access") || normalized.includes("showdirectorypicker") || normalized.includes("unsupported") || normalized.includes("not supported")) {
    return { errorKind: "unsupported-browser", message: "This browser cannot access local folders. Use manual import.", recovery: "Manual import", recoveryAction: "manual-import", diagnosticRef };
  }
  if (normalized.includes("quota") || normalized.includes("storage") || normalized.includes("disk")) {
    return { errorKind: "quota-resource", message: "Could not save local settings. Local storage is full.", recovery: "Retry", recoveryAction: "retry-workspace", diagnosticRef };
  }
  if (normalized.includes("json") || normalized.includes("serialize") || normalized.includes("validation")) {
    return { errorKind: "serialization-validation", message: "Could not save settings. Your previous configuration is unchanged.", recovery: "Retry", recoveryAction: "retry-team-save", diagnosticRef };
  }
  return {
    errorKind: "unknown",
    message: lastKnownAvailable ? "Something went wrong. Existing data is unchanged." : "Something went wrong. No current data is available.",
    recovery: "Retry",
    recoveryAction: "retry-workspace",
    diagnosticRef,
  };
}

export function createOperation(
  operationId: number,
  phase: AppOperationPhase,
  message: string,
  action?: string,
): AppOperation {
  return { operationId, phase, message, state: "active", action, busy: true, lastKnownAvailable: true };
}

export function nextRetryCount(current: number | null | undefined): number {
  return Math.max(0, Math.trunc(current ?? 0)) + 1;
}

export function finishOperation(
  current: AppOperation | null,
  operationId: number,
  state: Exclude<AppOperationState, "active">,
  message: string,
  recovery?: string,
  recoveryAction?: AppRecoveryAction,
  details?: Pick<AppOperation, "errorKind" | "lastKnownAvailable" | "stale" | "diagnosticRef" | "retryCount">,
): AppOperation | null {
  if (!current || current.operationId !== operationId) return current;
  return { ...current, state, message, recovery, recoveryAction, busy: false, ...details };
}
