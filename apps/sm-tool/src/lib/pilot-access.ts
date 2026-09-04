export type PilotAccessRole = "admin" | "user";

export interface ServerPilotSession {
  sessionId: string;
  label: string;
  role: PilotAccessRole;
  capabilities: string[];
  expiresAt: string | null;
}

export async function requestPilotSession(pin: string): Promise<ServerPilotSession | null> {
  const response = await fetch("/api/pilot-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!response.ok) return null;
  const value = await response.json() as Partial<ServerPilotSession>;
  if (typeof value.sessionId !== "string" || typeof value.label !== "string" || (value.role !== "admin" && value.role !== "user")) return null;
  return {
    sessionId: value.sessionId,
    label: value.label,
    role: value.role,
    capabilities: Array.isArray(value.capabilities) ? value.capabilities.filter((item): item is string => typeof item === "string") : [],
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null,
  };
}
