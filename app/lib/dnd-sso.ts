"use client";

import { apiFetch, apiUrl } from "./client";

/** Opens the D&D Companion ("Tavern") at `route` (e.g. `/vtt`, `/sheet`, `/bard`) using Hoffle SSO. */
export async function openDndCompanion(route = "/", serverId?: string | null): Promise<void> {
  const win = typeof window !== "undefined" ? window.open("", "_blank", "noopener,noreferrer") : null;
  try {
    const data = await apiFetch<{ url?: string }>("/api/integrations/dnd/sso", {
      method: "POST",
      body: JSON.stringify({ route, mode: "user", ...(serverId ? { serverId } : {}) }),
    });
    if (data.url) {
      if (win) win.location.href = data.url;
      else window.open(data.url, "_blank", "noopener,noreferrer");
      return;
    }
  } catch {
    // Fallback to SSO handoff page when direct mint fails.
  }
  const fallback = apiUrl(`/dnd-login?next=${encodeURIComponent(route)}`);
  if (win) win.location.href = fallback;
  else window.open(fallback, "_blank", "noopener,noreferrer");
}
