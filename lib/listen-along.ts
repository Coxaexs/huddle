/**
 * Listen along, Discord-style: follow what a friend plays on Spotify in your
 * own Spotify app.
 *
 * Spotify's Web API can't do this for us any more (since 2026 a development
 * app only gets a handful of users), so it works through the desktop apps:
 * the host's app reads the track id and position from their Spotify app and
 * puts them on their profile (SpotifyActivity), and the listener's app tells
 * their own Spotify app to play that track at that point, again whenever the
 * host changes song, pauses or skips around.
 *
 * Everything here is pure; app/components/listen-along.tsx runs the loop.
 */

/** A Spotify track id: 22 base-62 characters. */
const TRACK_ID = /^[0-9A-Za-z]{22}$/;

/**
 * The track id in whatever form a source gives it: "spotify:track:ID",
 * "https://open.spotify.com/track/ID?si=…", MPRIS's "/com/spotify/track/ID",
 * or the bare id.
 */
export function spotifyTrackId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  const match =
    /^spotify:track:([0-9A-Za-z]{22})$/.exec(v) ||
    /^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([0-9A-Za-z]{22})(?:[?#].*)?$/.exec(v) ||
    /^\/com\/spotify\/track\/([0-9A-Za-z]{22})$/.exec(v);
  if (match) return match[1];
  return TRACK_ID.test(v) ? v : null;
}

export function spotifyTrackUri(trackId: string): string {
  return `spotify:track:${trackId}`;
}

export function spotifyTrackUrl(trackId: string): string {
  return `https://open.spotify.com/track/${trackId}`;
}

/** The part of a host's SpotifyActivity that listening along needs. */
export interface HostTrack {
  trackId?: string;
  /** Where the host was in the song when the server stamped it. */
  positionMs?: number;
  /** Server time (ms epoch) of that position. */
  positionAt?: number;
  durationMs?: number;
  isPlaying?: boolean;
}

/**
 * Where the host is now: their last position plus the time since, capped at
 * the song's length. `serverNow` is the server's clock as the listener sees
 * it, so neither side's clock has to be right.
 */
export function expectedPositionMs(track: HostTrack, serverNow: number): number {
  const base = Math.max(0, Number(track.positionMs) || 0);
  const at = Number(track.positionAt) || 0;
  const elapsed = track.isPlaying === false || !at ? 0 : Math.max(0, serverNow - at);
  const position = base + elapsed;
  const duration = Number(track.durationMs) || 0;
  return duration > 0 ? Math.min(position, duration) : position;
}

/** What the listener's own Spotify app is doing; null when the app can't tell (Windows). */
export interface LocalSpotify {
  trackId: string | null;
  positionMs: number | null;
  playing: boolean;
}

export interface ListenState {
  /** The track we last told Spotify to play. */
  applied: string | null;
  /** We paused it because the host paused. */
  pausedByUs: boolean;
}

export type ListenStep =
  | { do: "play"; trackId: string; positionMs: number }
  | { do: "seek"; positionMs: number }
  | { do: "pause" }
  | { do: "stop"; reason: "took-over" }
  | { do: "none" };

/** Further apart than this, the listener is moved to the host's position. */
export const DRIFT_MS = 4000;

/**
 * One step of following the host. `host` is null while they aren't playing
 * anything (paused or stopped).
 */
export function nextListenStep(
  host: HostTrack | null,
  local: LocalSpotify | null,
  state: ListenState,
  serverNow: number,
): ListenStep {
  const playing = Boolean(host && host.trackId && host.isPlaying !== false);
  if (!playing) {
    // The host paused or stopped: pause along, once, if it's still our song.
    if (local?.playing && state.applied && local.trackId === state.applied) return { do: "pause" };
    return { do: "none" };
  }
  const trackId = host!.trackId as string;
  const position = expectedPositionMs(host!, serverNow);
  if (state.applied && local?.trackId && local.trackId !== state.applied && local.trackId !== trackId) {
    // You put on something else yourself: you've stopped listening along.
    return { do: "stop", reason: "took-over" };
  }
  if (trackId !== state.applied) return { do: "play", trackId, positionMs: position };
  if (!local || local.trackId !== trackId) return { do: "none" };
  if (!local.playing) {
    // We paused for the host and they're back: carry on. You paused it: you left.
    return state.pausedByUs ? { do: "play", trackId, positionMs: position } : { do: "stop", reason: "took-over" };
  }
  if (local.positionMs !== null && Math.abs(local.positionMs - position) > DRIFT_MS) {
    return { do: "seek", positionMs: position };
  }
  return { do: "none" };
}
