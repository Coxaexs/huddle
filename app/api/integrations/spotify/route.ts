import { currentUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Fetches real-time Spotify track info from Spotify URLs, Last.fm scrobblers, or track queries.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const track = (url.searchParams.get("track") || url.searchParams.get("url") || "").trim();
  const username = url.searchParams.get("username")?.trim();

  // 1. If user provided a Spotify link (e.g. https://open.spotify.com/track/... or spotify:track:...)
  if (track.includes("spotify.com/") || track.includes("spotify:")) {
    try {
      let formatUrl = track;
      if (!formatUrl.startsWith("http")) {
        formatUrl = `https://${formatUrl.replace(/^spotify:/, "open.spotify.com/")}`;
      }
      const oembedRes = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(formatUrl)}`,
      );
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
    } catch {
      // fallback to search
    }
  }

  // 2. If text query provided (e.g. "Blinding Lights - The Weeknd")
  if (track) {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(track)}&entity=song&limit=1`,
      );
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
    } catch {
      // fallback
    }
    return Response.json({
      song: track,
      artist: "Spotify",
      isPlaying: true,
    });
  }

  // 3. Last.fm / Spotify username scrobbler lookup
  if (username) {
    try {
      const res = await fetch(
        `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(
          username,
        )}&api_key=94c8e7e17c093a19ebbc6f2bd7c25c7c&format=json&limit=1`,
      );
      const data = (await res.json()) as {
        recenttracks?: {
          track?: Array<{
            name: string;
            artist: { "#text": string };
            image?: Array<{ "#text": string }>;
            "@attr"?: { nowplaying?: string };
          }>;
        };
      };

      const latest = data.recenttracks?.track?.[0];
      if (latest) {
        const isNowPlaying = latest["@attr"]?.nowplaying === "true";
        const song = latest.name;
        const artist = latest.artist["#text"];
        const albumArt =
          latest.image?.[latest.image.length - 1]?.["#text"] || "";

        return Response.json({
          song,
          artist,
          albumArt,
          isPlaying: isNowPlaying || true,
        });
      }
    } catch {
      // catch silent error
    }
  }

  return Response.json(
    { error: "Provide a Spotify link, Last.fm username, or song search" },
    { status: 400 },
  );
}
