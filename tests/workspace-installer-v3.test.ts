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
    const generatorSource = readFileSync("src/generate-renew-launchers.ts", "utf8");
    const installerSource = readFileSync("apps/sm-tool/public/workspace-installer-v3.js", "utf8");
    const indexSource = readFileSync("apps/sm-tool/index.html", "utf8");
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
    expect(indexSource).toContain('/workspace-bootstrap.js?v=20260818-3');
    expect(indexSource).toContain('/workspace-installer-v3.js?v=20260818-3');
    expect(installerSource).toContain('const SOURCE_URL = "/workspace-bootstrap.js?v=20260818-3";');
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
    expect(writes.get("renew-team.ps1")).toContain('"logs") "renew-team-error.log"');
    expect(writes.get("renew-team.ps1")).toContain("launcher=renew-team.ps1 version=");
    expect(writes.get("renew-team.ps1")).toContain("exitCode=");
    expect(writes.get("renew-team.ps1")).toContain("[REDACTED]");
    expect(writes.get("renew-team.ps1")).toContain("JIRA_TOKEN");
    expect(writes.get("renew-team.ps1")).toContain("Authorization\\s*:\\s*");
    expect(writes.get("renew-team.ps1")).not.toContain("Authorization: Bearer");
    expect(writes.get("renew-team.ps1")).toContain("Press Enter to close this PowerShell window");
    expect(writes.get("renew-team.ps1")).toContain("function Fail-Renew");
    expect(writes.get("renew-team.ps1")).toContain('Fail-Renew "Node.js 18+ is required to refresh Jira data."');
    expect(writes.get("renew-team.ps1")).toContain("$TeamListExitCode = [int]$LASTEXITCODE");
    expect(writes.get("renew-team.ps1")).toContain('Fail-Renew "Could not read workspace team configuration (exit code $TeamListExitCode)." $TeamListExitCode');
    expect(writes.get("renew-team.ps1")).not.toMatch(/Write-Host "No teams folder[^\r\n]*"[\r\n]+\s+exit 1/);
    expect(writes.get("renew-team.ps1")?.match(/exit 1/g) ?? []).toHaveLength(1);
    expect(writes.get("renew-team.ps1")).toContain("$RunnerExitCode = [int]$LASTEXITCODE");
    expect(writes.get("renew-team.ps1")).toContain('Fail-Renew "Bundled Jira runner failed with exit code $RunnerExitCode." $RunnerExitCode');
    expect(writes.get("renew-team.ps1")?.indexOf("$RunnerExitCode -ne 0")).toBeLessThan(
      writes.get("renew-team.ps1")?.indexOf("Done. Open Scrum Master Tool") ?? -1,
    );
    expect(writes.get("renew-team.command")).toContain('node "$RUNNER" "$WORKSPACE_DIR" "${SELECTED_IDS[@]}"');
    expect(writes.get("renew-team.command")).toContain("SELECTED_IDS=()");
    expect(writes.get("renew-team.command")).toContain('SELECTED_IDS+=("$TEAM_ID")');
    expect(writes.get("renew-team.command")).not.toContain("SM_TOOL_REPO_DIR");
    expect(writes.get("renew-team.command")).not.toContain("npm --prefix");
    expect(writes.get("renew-team.command")).toContain("Recalculate to rebuild metrics and cache");
    expect(writes.get("renew-team.cmd")).toContain("-NoProfile -ExecutionPolicy Bypass -File");
    expect(generatorSource).toContain('powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "%~dp0renew-team.ps1" %*');
    expect(writes.get("renew-team.cmd")).toContain('powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "%~dp0renew-team.ps1" %*');
    expect(writes.get("renew-team.cmd")).toContain("renew-team.ps1");
    expect(writes.get("renew-team.cmd")).toContain('if "%EXIT_CODE%"=="0"');
    expect(writes.get("renew-team.cmd")).toContain("[OK] renew-team.ps1 completed successfully.");
    expect(writes.get("renew-team.cmd")).toContain("[ERROR] renew-team.ps1 failed with exit code %EXIT_CODE%.");
    expect(writes.get("renew-team.cmd")).toContain("pause");
    expect((writes.get("renew-team.cmd")?.match(/pause/g) ?? []).length).toBe(1);
    expect(writes.get("renew-team.cmd")).toContain("endlocal & exit /b %EXIT_CODE%");
  });
});
