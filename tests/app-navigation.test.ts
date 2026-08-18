import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("apps/sm-tool/src/App.tsx", "utf8");

describe("primary navigation", () => {
  it("does not expose or render the removed standalone Role Workflow page", () => {
    expect(appSource).not.toContain('from "./components/RoleWorkflow"');
    expect(appSource).not.toContain("Role Workflow");
    expect(appSource).not.toContain('setPage("workflow")');
    expect(appSource).not.toContain('page === "workflow"');
    expect(appSource).not.toMatch(/type Page =[^;]*"workflow"/);
  });
});
