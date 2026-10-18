/**
 * Stream URL parsing and normalization for Living Room Watch and Voice Stage streams.
 * Supports Jellyfin items, direct video streams (.mp4, .webm), and general media URLs.
 */

export interface ParsedStream {
  url: string;
  title: string;
  isJellyfin: boolean;
  itemId?: string;
}

export function parseStreamUrl(rawUrl: string, defaultTitle?: string): ParsedStream {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { url: "", title: defaultTitle || "Stream", isJellyfin: false };
  }

  try {
    const parsed = new URL(trimmed, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    
    // Check if it's a Jellyfin URL
    // e.g. /jellyfin/Items/{id}/Download, /jellyfin/Videos/{id}/stream.mp4, or web UI /web/index.html#!/details?id={id}
    const jellyfinItemMatch = parsed.pathname.match(/\/Items\/([a-zA-Z0-9]+)(\/Download)?/i);
    const jellyfinVideoMatch = parsed.pathname.match(/\/Videos\/([a-zA-Z0-9]+)\/stream/i);
    let jellyfinId: string | undefined = undefined;

    if (jellyfinItemMatch) {
      jellyfinId = jellyfinItemMatch[1];
    } else if (jellyfinVideoMatch) {
      jellyfinId = jellyfinVideoMatch[1];
    } else if (parsed.hash && parsed.hash.includes("id=")) {
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#!?[/?]/, ""));
      jellyfinId = hashParams.get("id") || undefined;
    }

    if (jellyfinId || parsed.pathname.toLowerCase().includes("/jellyfin/")) {
      const apiKey = parsed.searchParams.get("api_key") || parsed.searchParams.get("ApiKey") || "";
      
      // If we have an itemId and it's a Jellyfin link, we can normalize to direct static stream or keep Download
      let streamUrl = trimmed;
      if (jellyfinId) {
        const basePath = parsed.pathname.split(/\/(Items|Videos|web)/i)[0];
        const baseOrigin = parsed.origin;
        // Build normalized direct streaming URL (with static=true so Jellyfin serves directly if supported)
        const params = new URLSearchParams();
        if (apiKey) params.set("api_key", apiKey);
        params.set("static", "true");
        
        // If it was already a valid stream or download URL, keep it functional
        if (parsed.pathname.includes("/Download")) {
          streamUrl = `${baseOrigin}${basePath}/Items/${jellyfinId}/Download?${params.toString()}`;
        } else {
          streamUrl = `${baseOrigin}${basePath}/Videos/${jellyfinId}/stream.mp4?${params.toString()}`;
        }
      }

      const cleanTitle = defaultTitle && defaultTitle !== "Download" && defaultTitle !== "Video"
        ? defaultTitle
        : jellyfinId
          ? `Jellyfin (${jellyfinId.slice(0, 8)})`
          : "Jellyfin Stream";

      return {
        url: streamUrl,
        title: cleanTitle,
        isJellyfin: true,
        itemId: jellyfinId,
      };
    }

    // Direct video stream / MP4 / WebM
    let cleanTitle = defaultTitle;
    if (!cleanTitle || cleanTitle === "Video") {
      const filename = parsed.pathname.split("/").pop() || "";
      cleanTitle = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Video Stream";
    }

    return {
      url: trimmed,
      title: cleanTitle,
      isJellyfin: false,
    };
  } catch {
    return {
      url: trimmed,
      title: defaultTitle || "Video Stream",
      isJellyfin: false,
    };
  }
}
