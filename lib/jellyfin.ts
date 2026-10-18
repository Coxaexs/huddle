/**
 * Jellyfin links, read the same way by the browser and the server.
 *
 * Every Jellyfin link is shared in one canonical form,
 * `<server>/Items/<id>/Download?api_key=<key>`; see app/lib/stream-url.ts.
 */

/** The pieces of a Jellyfin link: the server (with any sub-path), the item and the key. */
export interface JellyfinLink {
  base: string;
  itemId: string;
  apiKey: string;
}

const ITEM_PATH = /^(.*?)\/(?:Items|Videos|Audio)\/([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9]{3,64})(?:\/|$)/i;

/** Reads a Jellyfin link of any kind; null when it is not one. */
export function jellyfinLink(raw: string): (JellyfinLink & { needsKey: boolean }) | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  const apiKey =
    parsed.searchParams.get("api_key") ||
    parsed.searchParams.get("ApiKey") ||
    parsed.searchParams.get("apiKey") ||
    "";
  const path = ITEM_PATH.exec(parsed.pathname);
  if (path) {
    // A bare /Items/<id> on any site is not enough; a Jellyfin link carries a key or lives under /jellyfin.
    if (!apiKey && !/\/jellyfin(\/|$)/i.test(parsed.pathname)) return null;
    return { base: parsed.origin + path[1], itemId: path[2], apiKey, needsKey: !apiKey };
  }
  // The web player: <server>/web/index.html#!/details?id=<id>&serverId=… (or #/details?id=…).
  const web = /^(.*?)\/web(?:\/(?:index\.html)?)?$/i.exec(parsed.pathname);
  if (web && parsed.hash.includes("?")) {
    const params = new URLSearchParams(parsed.hash.slice(parsed.hash.indexOf("?") + 1));
    const itemId = params.get("id");
    if (itemId && /^[0-9a-f-]{32,36}$/i.test(itemId)) {
      const key = apiKey || params.get("api_key") || params.get("ApiKey") || "";
      return { base: parsed.origin + web[1], itemId: itemId.replace(/-/g, ""), apiKey: key, needsKey: !key };
    }
  }
  return null;
}

/** The one link a Jellyfin item is shared as. */
export function canonicalJellyfinUrl(link: JellyfinLink): string {
  return `${link.base}/Items/${link.itemId}/Download?api_key=${encodeURIComponent(link.apiKey)}`;
}

