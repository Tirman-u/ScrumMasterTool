import { describe, expect, it, vi } from "vitest";
// The Worker entrypoint is intentionally plain JavaScript and has no runtime package types.
// @ts-expect-error cloudflare-worker.mjs is exercised directly by this Worker-focused test.
import worker from "../cloudflare-worker.mjs";

describe("Cloudflare entry HTML cache policy", () => {
  it.each(["/", "/index.html"])("revalidates and disables caching for %s", async (pathname) => {
    const assetResponse = new Response("<!doctype html>", {
      headers: { "cache-control": "public, max-age=3600", etag: '"old"' },
    });
    const fetch = vi.fn().mockResolvedValue(assetResponse);

    const response = await worker.fetch(new Request(`https://pilot.example${pathname}`), {
      ASSETS: { fetch },
      PILOT_ACCESS: {} as never,
    });

    expect(fetch).toHaveBeenCalledWith(expect.any(Request), {
      cf: { cacheEverything: false, cacheTtl: 0 },
    });
    expect(response.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate");
    expect(await response.text()).toBe("<!doctype html>");
  });

  it("keeps non-entry assets on the normal Assets path", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("asset"));

    const response = await worker.fetch(new Request("https://pilot.example/assets/app.js"), {
      ASSETS: { fetch },
      PILOT_ACCESS: {} as never,
    });

    expect(fetch).toHaveBeenCalledWith(expect.any(Request));
    expect(fetch.mock.calls[0]).toHaveLength(1);
    expect(await response.text()).toBe("asset");
  });

  it("fails closed for unauthenticated pilot policy writes", async () => {
    const response = await worker.fetch(new Request("https://pilot.example/api/pilot-access", {
      method: "PUT",
      body: "[]",
    }), {
      ASSETS: { fetch: vi.fn() },
      PILOT_ACCESS: { idFromName: vi.fn(), get: vi.fn() },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "Operator authorization required" });
  });
});
