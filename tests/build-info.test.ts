import rootPackage from "../package.json";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("build marker", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_BUILD_SHA", "");
  });

  it("uses the root package version and a local build fallback", async () => {
    const { APP_VERSION, BUILD_IDENTIFIER, BUILD_MARKER_LABEL } = await import(
      "../apps/sm-tool/src/lib/build-info"
    );

    expect(APP_VERSION).toBe(rootPackage.version);
    expect(BUILD_IDENTIFIER).toBe("local");
    expect(BUILD_MARKER_LABEL).toBe(`v${rootPackage.version} · build local`);
  });
});
