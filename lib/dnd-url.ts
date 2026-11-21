import { bindings } from "./storage";

/** Resolves the internal base URL for the D&D companion / compendium service. */
export function dndBaseUrl(fallback = "http://127.0.0.1:8732"): URL {
  const configured = bindings().DND_BASE_URL?.trim() || fallback;
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported D&D server URL.");
  }
  return url;
}

/** Resolves the browser-facing public URL for the D&D companion, if configured or defaulted. */
export function dndPublicUrl(fallback?: string): URL | null {
  const configured =
    bindings().DND_PUBLIC_URL?.trim() ||
    bindings().DND_BASE_URL?.trim() ||
    fallback?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}
