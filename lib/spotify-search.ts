/**
 * Finds a Spotify track id from a song and artist name, for listen along when
 * the host's Spotify app only tells us the names (Windows shows "Artist - Song"
 * in its window title and nothing else).
 *
 * Uses Spotify's Web API with the app's own credentials (client credentials:
 * no user signs in, so Spotify's per-user limits on development apps don't
 * apply). Optional: without SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET it
 * returns null and those hosts just can't be followed.
 */

let token: { value: string; expiresAt: number } | null = null;

async function appToken(id: string, secret: string, fetchImpl: typeof fetch): Promise<string | null> {
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;
  const response = await fetchImpl("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  token = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return token.value;
}

function cacheKey(song: string, artist: string): string {
  return `${artist}\u0000${song}`.toLowerCase().slice(0, 300);
}

/** The best-matching track id, or null. Answers (found or not) are cached a week. */
export async function findSpotifyTrack(
  db: D1Database,
  song: string,
  artist: string,
  credentials: { id?: string; secret?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const id = credentials.id?.trim();
  const secret = credentials.secret?.trim();
  if (!id || !secret || !song.trim()) return null;
  const key = cacheKey(song, artist);
  const cached = await db
    .prepare("SELECT track_id FROM spotify_track_cache WHERE query = ? AND at > ?")
    .bind(key, Date.now() - 7 * 86_400_000)
    .first<{ track_id: string | null }>();
  if (cached) return cached.track_id;
  let trackId: string | null = null;
  try {
    const access = await appToken(id, secret, fetchImpl);
    if (!access) return null;
    const q = artist && artist !== "Spotify" ? `track:${song} artist:${artist}` : song;
    const response = await fetchImpl(
      `https://api.spotify.com/v1/search?${new URLSearchParams({ q, type: "track", limit: "1" })}`,
      { headers: { Authorization: `Bearer ${access}` } },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { tracks?: { items?: Array<{ id?: string }> } };
    const found = data.tracks?.items?.[0]?.id;
    trackId = typeof found === "string" && /^[0-9A-Za-z]{22}$/.test(found) ? found : null;
  } catch {
    return null;
  }
  await db
    .prepare("INSERT OR REPLACE INTO spotify_track_cache (query, track_id, at) VALUES (?, ?, ?)")
    .bind(key, trackId, Date.now())
    .run();
  return trackId;
}
