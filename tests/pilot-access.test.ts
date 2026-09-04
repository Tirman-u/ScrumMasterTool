import { describe, expect, it, vi } from "vitest";
import { requestPilotSession } from "../apps/sm-tool/src/lib/pilot-access";
import { readFileSync } from "node:fs";

describe("server-side pilot access boundary", () => {
  it("accepts only a server-issued session and never persists the PIN", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      sessionId: "session-1",
      label: "Pilot",
      role: "user",
      capabilities: ["workspace:recalculate"],
      expiresAt: "2026-12-31T00:00:00.000Z",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(requestPilotSession("12345")).resolves.toMatchObject({ sessionId: "session-1", role: "user" });
    expect(fetchMock).toHaveBeenCalledWith("/api/pilot-access", expect.objectContaining({ method: "POST", body: JSON.stringify({ pin: "12345" }) }));
    expect(readFileSync("apps/sm-tool/src/App.tsx", "utf8")).not.toContain("PILOT_ACCESS_STORAGE_KEY");
    expect(readFileSync("apps/sm-tool/src/App.tsx", "utf8")).not.toContain("PILOT_SESSION_STORAGE_KEY");
    fetchMock.mockRestore();
  });

  it("fails closed when the server denies the request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{\"error\":\"Access denied\"}", { status: 403 }));
    await expect(requestPilotSession("12345")).resolves.toBeNull();
    vi.restoreAllMocks();
  });
});
