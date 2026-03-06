import { describe, expect, it } from "vitest";
import { buildUniqueImportFileName } from "../apps/sm-tool/src/lib/workspace";

describe("buildUniqueImportFileName", () => {
  it("returns original name when free", () => {
    const existing = new Set<string>(["other.csv"]);
    expect(buildUniqueImportFileName(existing, "jira.csv")).toBe("jira.csv");
  });

  it("appends numeric suffix when file name already exists", () => {
    const existing = new Set<string>(["jira.csv", "jira-2.csv"].map((name) => name.toLowerCase()));
    expect(buildUniqueImportFileName(existing, "jira.csv")).toBe("jira-3.csv");
  });

  it("handles files without extension", () => {
    const existing = new Set<string>(["jira", "jira-2"].map((name) => name.toLowerCase()));
    expect(buildUniqueImportFileName(existing, "jira")).toBe("jira-3");
  });
});
