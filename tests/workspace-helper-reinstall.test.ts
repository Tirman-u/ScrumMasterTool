import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ensureWorkspaceWritePermission } from "../apps/sm-tool/src/lib/workspace";

function mockHandle(permission: PermissionState, requested: PermissionState): FileSystemDirectoryHandle {
  return {
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => requested),
  } as unknown as FileSystemDirectoryHandle;
}

describe("workspace helper reinstall flow", () => {
  it("requests write permission only when the user flow needs it", async () => {
    const alreadyGranted = mockHandle("granted", "denied");
    expect(await ensureWorkspaceWritePermission(alreadyGranted)).toBe(true);
    expect(alreadyGranted.requestPermission).not.toHaveBeenCalled();

    const newlyGranted = mockHandle("prompt", "granted");
    expect(await ensureWorkspaceWritePermission(newlyGranted)).toBe(true);
    expect(newlyGranted.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });

    const denied = mockHandle("prompt", "denied");
    expect(await ensureWorkspaceWritePermission(denied)).toBe(false);
  });

  it("keeps helper reinstall in explicit pick/open flows, not background restore", () => {
    const appSource = readFileSync("apps/sm-tool/src/App.tsx", "utf8");
    const restoreStart = appSource.indexOf("const restoreWorkspace = async");
    const restoreEnd = appSource.indexOf("void restoreWorkspace();", restoreStart);
    const backgroundRestoreSource = appSource.slice(restoreStart, restoreEnd);

    expect(appSource).toContain("window.__smInstallWorkspaceHelperV3");
    expect(appSource).toContain("Jira helpers updated.");
    expect(appSource).toContain("Jira helper update skipped: write permission was denied.");
    expect(appSource).toContain("const helperResult = await reinstallWorkspaceHelper(handle);");
    expect(backgroundRestoreSource).not.toContain("reinstallWorkspaceHelper");
  });
});
