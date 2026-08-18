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
    expect(writes.has("sm-tool/jira-pull.mjs")).toBe(true);
    expect(writes.get("renew-team.ps1")).toContain("npm --prefix $RepoDir run jira:pull");
  });
});
