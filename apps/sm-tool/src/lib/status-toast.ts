export type ToastStatusKind = "workspace-success" | "info" | "persistent";

export interface ToastStatus {
  statusId: number;
  message: string;
  kind: ToastStatusKind;
  durationMs: number | null;
}

export function classifyToastStatus(statusId: number, message: string): ToastStatus {
  const normalized = message.trim().toLowerCase();
  const persistent = /^(could not|failed|error|permission|this browser cannot|this browser does not|file system access api is not available|workspace permission)/.test(normalized);
  const workspaceSuccess = normalized.startsWith("workspace loaded:") || normalized.startsWith("workspace ready") || normalized.startsWith("workspace restored:");
  return {
    statusId,
    message,
    kind: persistent ? "persistent" : workspaceSuccess ? "workspace-success" : "info",
    durationMs: persistent ? null : workspaceSuccess ? 5000 : 6000,
  };
}

export function canDismissToast(status: ToastStatus, currentStatusId: number): boolean {
  return status.statusId === currentStatusId && status.durationMs !== null;
}

export function shouldClearForContextChange(
  status: ToastStatus | null,
  statusRevision: number,
  observedStatusRevision: number,
): boolean {
  if (!status || status.durationMs === null) return false;
  return statusRevision === observedStatusRevision;
}

export interface ToastTimerController {
  pause(): void;
  resume(): void;
  cancel(): void;
}

export function startToastTimer(
  status: ToastStatus,
  getCurrentStatusId: () => number,
  onDismiss: () => void,
  now: () => number = Date.now,
  schedule: (callback: () => void, delayMs: number) => number = (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancel: (timer: number) => void = (timer) => window.clearTimeout(timer),
): ToastTimerController {
  let remainingMs = status.durationMs ?? 0;
  let startedAt = 0;
  let timer: number | null = null;
  let cancelled = false;

  const pause = (): void => {
    if (timer === null) return;
    cancel(timer);
    remainingMs = Math.max(0, remainingMs - (now() - startedAt));
    timer = null;
  };
  const resume = (): void => {
    if (cancelled || timer !== null || remainingMs <= 0 || status.durationMs === null) return;
    startedAt = now();
    timer = schedule(() => {
      timer = null;
      if (!cancelled && canDismissToast(status, getCurrentStatusId())) onDismiss();
    }, remainingMs);
  };
  const controller: ToastTimerController = {
    pause,
    resume,
    cancel: () => {
      cancelled = true;
      if (timer !== null) cancel(timer);
      timer = null;
    },
  };
  resume();
  return controller;
}
