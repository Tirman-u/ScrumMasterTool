import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface MockDirectory {
  kind: "directory";
  queryPermission: (options: { mode: string }) => Promise<string>;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<MockDirectory>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{
      write: (content: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

function createMockDirectory(writes: Map<string, string>, prefix = ""): MockDirectory {
  return {
    kind: "directory",
    queryPermission: async () => "granted",
    getDirectoryHandle: async (name) => createMockDirectory(writes, `${prefix}${name}/`),
    getFileHandle: async (name) => ({
      createWritable: async () => ({
        write: async (content) => {
          writes.set(`${prefix}${name}`, content);
        },
        close: async () => undefined,
      }),
    }),
  };
}

describe("workspace installer v3", () => {
  it("writes macOS, Windows, and runner helpers during install", async () => {
    const bootstrapSource = readFileSync("apps/sm-tool/public/workspace-bootstrap.js", "utf8");
    const installerSource = readFileSync("apps/sm-tool/public/workspace-installer-v3.js", "utf8");
    const writes = new Map<string, string>();
    const window = {
      addEventListener: () => undefined,
    } as Record<string, unknown> & { __smInstallWorkspaceHelperV3?: (handle: MockDirectory) => Promise<boolean> };

    const context = {
      console,
      Date,
      Set,
      Map,
      Promise,
      window,
      indexedDB: { open: () => ({}) },
      fetch: async () => ({ ok: true, text: async () => bootstrapSource }),
    };

    runInNewContext(installerSource, context);

    const install = window.__smInstallWorkspaceHelperV3;
    expect(install).toBeTypeOf("function");

    const installed = await install?.(createMockDirectory(writes));

    expect(installed).toBe(true);
    expect(writes.has("renew-team.command")).toBe(true);
    expect(writes.has("renew-team.ps1")).toBe(true);
    expect(writes.has("renew-team.cmd")).toBe(true);
    expect(writes.has("sm-tool/jira-pull.mjs")).toBe(true);
    expect(writes.get("renew-team.ps1")).toContain('Read-Host "Jira URL');
    expect(writes.get("renew-team.ps1")).toContain('$Runner = Join-Path $WorkspaceDir "sm-tool\\jira-pull.mjs"');
    expect(writes.get("renew-team.ps1")).toContain("node $Runner $WorkspaceDir @SelectedTeamIds");
    expect(writes.get("renew-team.ps1")).not.toContain("SM_TOOL_REPO_DIR");
    expect(writes.get("renew-team.ps1")).not.toContain("npm --prefix");
    expect(writes.get("renew-team.ps1")).toContain("Read-Host \"Jira token\" -AsSecureString");
    expect(writes.get("renew-team.ps1")).toContain("Recalculate to rebuild metrics and cache");
    expect(writes.get("renew-team.command")).toContain('node "$RUNNER" "$WORKSPACE_DIR" "${SELECTED_IDS[@]}"');
    expect(writes.get("renew-team.command")).toContain("SELECTED_IDS=()");
    expect(writes.get("renew-team.command")).toContain('SELECTED_IDS+=("$TEAM_ID")');
    expect(writes.get("renew-team.command")).not.toContain("SM_TOOL_REPO_DIR");
    expect(writes.get("renew-team.command")).not.toContain("npm --prefix");
    expect(writes.get("renew-team.command")).toContain("Recalculate to rebuild metrics and cache");
    expect(writes.get("renew-team.cmd")).toContain("-NoProfile -ExecutionPolicy Bypass -File");
    expect(writes.get("renew-team.cmd")).toContain("renew-team.ps1");
    expect(writes.get("renew-team.cmd")).toContain('if not "%EXIT_CODE%"=="0"');
    expect(writes.get("renew-team.cmd")).toContain("[ERROR] renew-team.ps1 failed with exit code %EXIT_CODE%.");
    expect(writes.get("renew-team.cmd")).toContain("pause");
    expect(writes.get("renew-team.cmd")).toContain("endlocal & exit /b %EXIT_CODE%");
  });
});
