import { afterEach, describe, expect, it, vi } from "vitest";
import { canDismissToast, classifyToastStatus, shouldClearForContextChange, startToastTimer, type ToastStatus } from "../apps/sm-tool/src/lib/status-toast";

afterEach(() => vi.useRealTimers());

describe("status toast lifecycle", () => {
  it("uses render-dismiss durations for workspace and general success", () => {
    expect(classifyToastStatus(1, "Workspace loaded: Demo.")).toMatchObject({ kind: "workspace-success", durationMs: 5000 });
    expect(classifyToastStatus(2, "Team recalculated.")).toMatchObject({ kind: "info", durationMs: 6000 });
  });

  it("keeps active/error/recovery-like messages persistent", () => {
    expect(classifyToastStatus(3, "Could not save team settings.").durationMs).toBeNull();
    expect(classifyToastStatus(4, "Workspace permission is required to continue.").durationMs).toBeNull();
    expect(classifyToastStatus(5, "File System Access API is not available in this browser.").durationMs).toBeNull();
  });

  it("uses the workspace success duration for restored workspaces", () => {
    expect(classifyToastStatus(6, "Workspace restored: Shared workspace. Found 2 teams.")).toMatchObject({
      kind: "workspace-success",
      durationMs: 5000,
    });
  });

  it("preserves same-transition workspace success but clears it on later navigation", () => {
    const toast = classifyToastStatus(7, "Workspace loaded: Shared.");
    expect(shouldClearForContextChange(toast, 2, 1)).toBe(false);
    let mountedToast: ToastStatus | null = toast;
    if (shouldClearForContextChange(mountedToast, 2, 2)) mountedToast = null;
    expect(mountedToast).toBeNull();
    expect(shouldClearForContextChange(classifyToastStatus(8, "Could not open workspace."), 3, 3)).toBe(false);
  });

  it("cannot dismiss a replaced status generation", () => {
    const toast = classifyToastStatus(5, "Team recalculated.");
    expect(canDismissToast(toast, 5)).toBe(true);
    expect(canDismissToast(toast, 6)).toBe(false);
  });

  it("starts after render, pauses on focus/hover, and resumes with remaining time", () => {
    vi.useFakeTimers();
    let currentId = 7;
    let dismissed = 0;
    const toast = classifyToastStatus(currentId, "Team recalculated.");
    const timer = startToastTimer(
      toast,
      () => currentId,
      () => dismissed += 1,
      Date.now,
      (callback, delay) => setTimeout(callback, delay) as unknown as number,
      (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
    );
    vi.advanceTimersByTime(2000);
    timer.pause();
    vi.advanceTimersByTime(10000);
    expect(dismissed).toBe(0);
    timer.resume();
    vi.advanceTimersByTime(3999);
    expect(dismissed).toBe(0);
    vi.advanceTimersByTime(1);
    expect(dismissed).toBe(1);
  });

  it("cancels on unmount/replacement and never dismisses a newer generation", () => {
    vi.useFakeTimers();
    let currentId = 8;
    let dismissed = 0;
    const timer = startToastTimer(
      classifyToastStatus(currentId, "Workspace restored: Shared."),
      () => currentId,
      () => dismissed += 1,
      Date.now,
      (callback, delay) => setTimeout(callback, delay) as unknown as number,
      (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
    );
    currentId = 9;
    vi.advanceTimersByTime(5000);
    expect(dismissed).toBe(0);
    timer.cancel();
    vi.advanceTimersByTime(5000);
    expect(dismissed).toBe(0);
  });

  it("cancels the old timer immediately when a rendered status is replaced", () => {
    vi.useFakeTimers();
    let dismissed = 0;
    const first = startToastTimer(
      classifyToastStatus(10, "Team recalculated."),
      () => 11,
      () => dismissed += 1,
      Date.now,
      (callback, delay) => setTimeout(callback, delay) as unknown as number,
      (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
    );
    first.cancel();
    const second = startToastTimer(
      classifyToastStatus(11, "Import check complete."),
      () => 11,
      () => dismissed += 1,
      Date.now,
      (callback, delay) => setTimeout(callback, delay) as unknown as number,
      (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
    );
    vi.advanceTimersByTime(5999);
    expect(dismissed).toBe(0);
    vi.advanceTimersByTime(1);
    expect(dismissed).toBe(1);
    second.cancel();
  });
});
