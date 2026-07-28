import { currentUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Fetches real-time currently playing Spotify / Last.fm track info for a user.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const username = url.searchParams.get("username")?.trim();
  const track = url.searchParams.get("track")?.trim();

  if (track) {
    // Quick Spotify search lookup via iTunes/Spotify public API
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

  if (!username) {
    return Response.json(
      { error: "Provide a Last.fm / Spotify username or track search" },
      { status: 400 },
    );
  }

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
        isPlaying: isNowPlaying,
      });
    }
  } catch (err) {
    return Response.json(
      { error: "Could not fetch Spotify track" },
      { status: 500 },
    );
  }

  return Response.json({ song: null, isPlaying: false });
}
