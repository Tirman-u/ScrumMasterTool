(() => {
  const STORAGE_KEY = "sm-tool-pilot-access-v1";
  const API_URL = "/api/pilot-access";
  const originalSetItem = Storage.prototype.setItem;

  let hydrated = false;
  let suppressRemoteWrite = false;
  let persistTimer = null;
  let latestRawValue = null;
  let hydrationInFlight = null;

  function isPilotStorage(storage, key) {
    return storage === window.localStorage && key === STORAGE_KEY;
  }

  async function persistLatest() {
    persistTimer = null;
    const rawValue = latestRawValue;
    latestRawValue = null;
    if (!rawValue) return;

    try {
      const pins = JSON.parse(rawValue);
      const response = await fetch(API_URL, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify(pins),
      });
      if (!response.ok) {
        console.warn("Pilot access sync failed:", response.status);
      }
    } catch (error) {
      console.warn("Pilot access sync failed:", error);
    }
  }

  function queuePersist(rawValue) {
    latestRawValue = rawValue;
    if (persistTimer !== null) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => void persistLatest(), 120);
  }

  // The existing pilot UI intentionally remains unchanged for the temporary pilot.
  // We intercept only its localStorage persistence key and mirror it to the Worker.
  // Writes before the initial server hydration are ignored so stale browser state can
  // never overwrite the shared server copy during page startup.
  Storage.prototype.setItem = function patchedSetItem(key, value) {
    originalSetItem.call(this, key, value);
    if (hydrated && !suppressRemoteWrite && isPilotStorage(this, key)) {
      queuePersist(String(value));
    }
  };

  async function hydrateFromServer() {
    if (hydrationInFlight) return hydrationInFlight;

    hydrationInFlight = (async () => {
      try {
        const response = await fetch(API_URL, {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) {
          console.warn("Pilot access hydration failed:", response.status);
          hydrated = true;
          return;
        }

        const pins = await response.json();
        const remoteRaw = JSON.stringify(pins);
        const localRaw = window.localStorage.getItem(STORAGE_KEY);

        if (localRaw !== remoteRaw) {
          suppressRemoteWrite = true;
          originalSetItem.call(window.localStorage, STORAGE_KEY, remoteRaw);
          suppressRemoteWrite = false;

          // App.tsx reads the PIN list synchronously during initial render. Reload once
          // after replacing stale local data so React starts from the shared server copy.
          window.location.reload();
          return;
        }

        hydrated = true;
      } catch (error) {
        console.warn("Pilot access hydration failed:", error);
        hydrated = true;
      } finally {
        hydrationInFlight = null;
      }
    })();

    return hydrationInFlight;
  }

  void hydrateFromServer();

  // Pick up admin changes made in another browser when this tab becomes active again.
  window.addEventListener("focus", () => void hydrateFromServer());
})();
