export type AppOperationPhase =
  | "Opening workspace"
  | "Restoring access"
  | "Updating local helper"
  | "Recalculating all teams"
  | "Recalculating team"
  | "Saving workspace"
  | "Saving team";

export type AppOperationState = "active" | "complete" | "error";
export type AppRecoveryAction = "retry-workspace" | "retry-recalculate-all" | "retry-recalculate-team" | "retry-team-save";

export interface AppOperation {
  operationId: number;
  phase: AppOperationPhase;
  message: string;
  state: AppOperationState;
  action?: string;
  recovery?: string;
  recoveryAction?: AppRecoveryAction;
}

export function createOperation(
  operationId: number,
  phase: AppOperationPhase,
  message: string,
  action?: string,
): AppOperation {
  return { operationId, phase, message, state: "active", action };
}

export function finishOperation(
  current: AppOperation | null,
  operationId: number,
  state: Exclude<AppOperationState, "active">,
  message: string,
  recovery?: string,
  recoveryAction?: AppRecoveryAction,
): AppOperation | null {
  if (!current || current.operationId !== operationId) return current;
  return { ...current, state, message, recovery, recoveryAction };
}
