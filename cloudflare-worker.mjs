const PILOT_ACCESS_KEY = "pins";
const HTML_ENTRY_PATHS = new Set(["/", "/index.html"]);

function defaultPins() {
  return [];
}

function normalizePins(value) {
  if (!Array.isArray(value)) return defaultPins();

  const pins = value
    .slice(0, 100)
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : crypto.randomUUID(),
      pin: typeof item.pin === "string" ? item.pin.trim() : "",
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim().slice(0, 120) : "Pilot User",
      role: item.role === "admin" ? "admin" : "user",
      active: item.active !== false,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      ...(typeof item.expiresAt === "string" ? { expiresAt: item.expiresAt } : {}),
      capabilities: Array.isArray(item.capabilities) ? item.capabilities.filter((capability) => typeof capability === "string").slice(0, 20) : [],
      ...(typeof item.lastUsedAt === "string" ? { lastUsedAt: item.lastUsedAt } : {}),
    }))
    .filter((item) => /^\d{5}$/.test(item.pin));

  return pins;
}

function json(value, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(value), { ...init, headers });
}

async function fetchHtmlEntry(request, assets) {
  const response = await assets.fetch(request, {
    cf: {
      cacheEverything: false,
      cacheTtl: 0,
    },
  });
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, no-cache, must-revalidate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export class PilotAccessStore {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method === "GET") {
      let pins = await this.state.storage.get(PILOT_ACCESS_KEY);
      if (!pins) {
        pins = defaultPins();
        await this.state.storage.put(PILOT_ACCESS_KEY, pins);
      }
      return json(normalizePins(pins));
    }

    if (request.method === "PUT") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, { status: 400 });
      }

      const pins = normalizePins(body);
      await this.state.storage.put(PILOT_ACCESS_KEY, pins);
      return json(pins);
    }

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, { status: 400 });
      }
      const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
      const match = normalizePins(await this.state.storage.get(PILOT_ACCESS_KEY)).find((item) => item.pin === pin && item.active && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()));
      if (!match) return json({ error: "Access denied" }, { status: 403 });
      const lastUsedAt = new Date().toISOString();
      await this.state.storage.put(PILOT_ACCESS_KEY, normalizePins(await this.state.storage.get(PILOT_ACCESS_KEY)).map((item) => item.id === match.id ? { ...item, lastUsedAt } : item));
      return json({ sessionId: crypto.randomUUID(), label: match.label, role: match.role, capabilities: match.capabilities, expiresAt: match.expiresAt ?? null });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/pilot-access") {
      if (request.method === "PUT") {
        const operatorToken = env.PILOT_OPERATOR_TOKEN;
        if (!operatorToken || request.headers.get("authorization") !== `Bearer ${operatorToken}`) {
          return json({ error: "Operator authorization required" }, { status: 403 });
        }
      }
      const id = env.PILOT_ACCESS.idFromName("global-pilot-access");
      return env.PILOT_ACCESS.get(id).fetch(request);
    }

    if (HTML_ENTRY_PATHS.has(url.pathname)) {
      return fetchHtmlEntry(request, env.ASSETS);
    }

    return env.ASSETS.fetch(request);
  },
};
