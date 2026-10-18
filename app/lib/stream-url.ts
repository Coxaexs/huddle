/**
 * Video links for Watch Together: Jellyfin links (a stream or download link,
 * or the web player's page for a film) and plain video files.
 *
 * Every Jellyfin link is stored in one canonical form,
 * `<server>/Items/<id>/Download?api_key=<key>`, so everyone in the room shares
 * the same thing; each player then decides for itself whether it can play the
 * file as it is or needs Jellyfin to convert it (see watch-source.ts).
 */

import { canonicalJellyfinUrl, jellyfinLink, type JellyfinLink } from "@/lib/jellyfin";

export { canonicalJellyfinUrl, jellyfinLink, type JellyfinLink };

export interface ParsedStream {
  url: string;
  title: string;
  isJellyfin: boolean;
  itemId?: string;
  /** A Jellyfin link without an access key: nobody else could play it. */
  needsKey?: boolean;
}

export function parseStreamUrl(rawUrl: string, defaultTitle?: string): ParsedStream {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { url: "", title: defaultTitle || "Video", isJellyfin: false };
  }

  const jelly = jellyfinLink(trimmed);
  if (jelly) {
    return {
      url: jelly.needsKey ? trimmed : canonicalJellyfinUrl(jelly),
      title: defaultTitle || `Jellyfin (${jelly.itemId.slice(0, 8)})`,
      isJellyfin: true,
      itemId: jelly.itemId,
      needsKey: jelly.needsKey,
    };
  }

  let title = defaultTitle;
  if (!title) {
    try {
      const parsed = new URL(trimmed, "http://localhost");
      const filename = decodeURIComponent(parsed.pathname.split("/").pop() || "");
      title = filename.replace(/\.[^.]+$/, "").replace(/[_.-]+/g, " ").trim() || "Video";
    } catch {
      title = "Video";
    }
  }
  return { url: trimmed, title, isJellyfin: false };
}

/** What to say when a Jellyfin link has no key. */
export const JELLYFIN_NEEDS_KEY =
  "That Jellyfin link has no access key, so nobody else could play it. In Jellyfin, open the film's ⋯ menu, choose Copy Stream URL, and paste that.";

/**
 * Looks up a Jellyfin item's proper name ("Brooklyn Nine-Nine S1E20 · Fancy
 * Brudgom"). Null when the server cannot be reached; the caller keeps its own.
 */
export async function jellyfinTitle(link: JellyfinLink): Promise<string | null> {
  try {
    const response = await fetch(
      `${link.base}/Items?ids=${encodeURIComponent(link.itemId)}&api_key=${encodeURIComponent(link.apiKey)}`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      Items?: Array<{ Name?: string; SeriesName?: string; ParentIndexNumber?: number; IndexNumber?: number; ProductionYear?: number; Type?: string }>;
    };
    const item = data.Items?.[0];
    if (!item?.Name) return null;
    if (item.Type === "Episode" && item.SeriesName) {
      const number = item.ParentIndexNumber != null && item.IndexNumber != null
        ? ` S${item.ParentIndexNumber}E${item.IndexNumber}`
        : "";
      return `${item.SeriesName}${number} · ${item.Name}`.slice(0, 100);
    }
    return (item.ProductionYear ? `${item.Name} (${item.ProductionYear})` : item.Name).slice(0, 100);
  } catch {
    return null;
  }
}
