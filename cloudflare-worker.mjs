const PILOT_ACCESS_KEY = "pins";
const MASTER_ADMIN_PIN = "24680";
const HTML_ENTRY_PATHS = new Set(["/", "/index.html"]);

function defaultPins() {
  return [
    {
      id: "master-admin",
      pin: MASTER_ADMIN_PIN,
      label: "Master Admin",
      role: "admin",
      active: true,
      createdAt: new Date().toISOString(),
    },
  ];
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
      ...(typeof item.lastUsedAt === "string" ? { lastUsedAt: item.lastUsedAt } : {}),
    }))
    .filter((item) => /^\d{5}$/.test(item.pin));

  // Keep the temporary recovery admin available during the pilot. The final SaaS
  // authentication layer must replace this hard-coded recovery path entirely.
  if (!pins.some((item) => item.id === "master-admin")) {
    pins.unshift(defaultPins()[0]);
  }

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

    return json({ error: "Method not allowed" }, { status: 405 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/pilot-access") {
      const id = env.PILOT_ACCESS.idFromName("global-pilot-access");
      return env.PILOT_ACCESS.get(id).fetch(request);
    }

    if (HTML_ENTRY_PATHS.has(url.pathname)) {
      return fetchHtmlEntry(request, env.ASSETS);
    }

    return env.ASSETS.fetch(request);
  },
};
