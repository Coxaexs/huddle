import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Fetches real-time Spotify track info from:
 *   - Spotify URLs   → Spotify oEmbed API
 *   - Last.fm user   → Last.fm API (real key from env)
 *   - Text query     → iTunes Search API
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const track = (url.searchParams.get("track") || url.searchParams.get("url") || "").trim();
  const username = url.searchParams.get("username")?.trim();

  // ── 1. Spotify link (open.spotify.com/track/…) ──
  if (track.includes("spotify.com/") || track.includes("spotify:")) {
    try {
      let formatUrl = track;
      if (!formatUrl.startsWith("http")) {
        formatUrl = `https://${formatUrl.replace(/^spotify:/, "open.spotify.com/")}`;
      }
      const oembedRes = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(formatUrl)}`,
      );
      if (oembedRes.ok) {
        const data = (await oembedRes.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        if (data.title) {
          return Response.json({
            song: data.title,
            artist: data.author_name || "Spotify",
            albumArt: data.thumbnail_url || "",
            isPlaying: true,
          });
        }
      }
    } catch {
      // fall through to text search
    }
  }

  // ── 2. Text / song-name search via iTunes ──
  if (track && !username) {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(track)}&entity=song&limit=1`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{
            trackName?: string;
            artistName?: string;
            artworkUrl100?: string;
          }>;
        };
        if (data.results?.[0]) {
          const item = data.results[0];
          return Response.json({
            song: item.trackName || track,
            artist: item.artistName || "Unknown Artist",
            albumArt: item.artworkUrl100?.replace("100x100bb", "300x300bb") || "",
            isPlaying: true,
          });
        }
      }
    } catch {
      // fallback
    }
    return Response.json({ song: track, artist: "Spotify", albumArt: "", isPlaying: true });
  }

  // ── 3. Last.fm username → real Last.fm API ──
  if (username) {
    const apiKey = bindings().LASTFM_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Last.fm API key not configured on this server.", song: null, isPlaying: false },
      );
    }

    try {
      const lfmUrl =
        `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks` +
        `&user=${encodeURIComponent(username)}` +
        `&api_key=${apiKey}` +
        `&format=json&limit=1`;

      const res = await fetch(lfmUrl);
      const raw = await res.text();

      if (!res.ok) {
        // Last.fm returns errors like {"error":6,"message":"User not found"}
        let msg = `Last.fm returned ${res.status}`;
        try {
          const errData = JSON.parse(raw) as { message?: string };
          if (errData.message) msg = errData.message;
        } catch { /* ignore */ }
        return Response.json({ error: msg, song: null, isPlaying: false });
      }

      const data = JSON.parse(raw) as {
        recenttracks?: {
          track?: Array<{
            name: string;
            artist: { "#text": string };
            image?: Array<{ "#text": string; size: string }>;
            "@attr"?: { nowplaying?: string };
          }>;
        };
      };

      const latest = data.recenttracks?.track?.[0];
      if (latest) {
        const isNowPlaying = latest["@attr"]?.nowplaying === "true";
        const song = latest.name;
        const artist = latest.artist["#text"];
        // Get the largest image available
        const images = latest.image || [];
        const albumArt =
          images.find((i) => i.size === "extralarge")?.["#text"] ||
          images.find((i) => i.size === "large")?.["#text"] ||
          images[images.length - 1]?.["#text"] ||
          "";

        return Response.json({
          song,
          artist,
          albumArt,
          isPlaying: isNowPlaying,
        }, {
          headers: { "Cache-Control": "no-store, max-age=0" },
        });
      }

      return Response.json({
        song: null,
        isPlaying: false,
        message: `Connected to Last.fm user "${username}" — no recent tracks. Play something on Spotify!`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return Response.json({ error: `Last.fm request failed: ${msg}`, song: null, isPlaying: false });
    }
  }

  return Response.json(
    { error: "Provide a Spotify link, Last.fm username, or song search" },
    { status: 400 },
  );
}
