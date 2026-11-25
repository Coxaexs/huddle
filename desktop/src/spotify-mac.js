"use strict";

/**
 * macOS: what Spotify plays, from the notification Spotify itself broadcasts
 * on every play, pause and track change. This replaces asking Spotify through
 * osascript every scan: an osascript that talks to another app checks in with
 * macOS as a copy of the app that started it, so every scan bounced a second
 * Hoffle icon in the Dock and filled Recent Apps with Hoffle copies.
 *
 * osascript is still used once to learn what was already playing when Hoffle
 * started, and for the listen-along controls (play, seek, pause).
 */

const EVENT = "com.spotify.client.PlaybackStateChanged";

/** { playing, trackId, song, artist, positionMs, durationMs, at } or null. */
let last = null;
let subscribed = false;
let heard = false;
let seeded = false;
const art = new Map();

const TRACK_ID = /(?:spotify:track:|\/track\/)([0-9A-Za-z]{22})/;
const trackIdOf = (value) => TRACK_ID.exec(String(value || ""))?.[1];
const num = (value) => {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

function onNotification(_event, info) {
  heard = true;
  const state = String(info?.["Player State"] || "");
  if (state === "Stopped" || !info) {
    last = null;
    return;
  }
  const trackId = trackIdOf(info["Track ID"]);
  const position = num(info["Playback Position"]);
  const duration = num(info["Duration"]);
  last = {
    playing: state === "Playing",
    trackId,
    song: String(info["Name"] || ""),
    artist: String(info["Artist"] || ""),
    positionMs: position === undefined ? undefined : Math.round(position * 1000),
    // Spotify sends milliseconds; older builds sent seconds.
    durationMs: duration === undefined ? undefined : Math.round(duration > 10_000 ? duration : duration * 1000),
    at: Date.now(),
  };
  if (trackId) void artworkFor(trackId);
}

function start(systemPreferences) {
  if (subscribed || process.platform !== "darwin" || !systemPreferences?.subscribeNotification) return subscribed;
  try {
    systemPreferences.subscribeNotification(EVENT, onNotification);
    subscribed = true;
  } catch {
    subscribed = false;
  }
  return subscribed;
}

/** The notification has no cover; Spotify's public oEmbed has it. Cached per track. */
async function artworkFor(trackId) {
  if (art.has(trackId)) return art.get(trackId);
  art.set(trackId, "");
  try {
    const res = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${trackId}`)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    const url = res.ok ? String((await res.json())?.thumbnail_url || "") : "";
    if (/^https:\/\//.test(url)) art.set(trackId, url);
  } catch {
    art.delete(trackId); // try again next time
  }
  if (art.size > 200) art.delete(art.keys().next().value);
  return art.get(trackId) || "";
}

/**
 * The first time Spotify is asked about before it has announced anything,
 * learn its state once through `seed` (an osascript query). After that only
 * the notifications count, so a paused or idle Spotify costs nothing.
 */
async function ensure(seed) {
  if (heard || seeded || !seed) return;
  seeded = true;
  const result = await seed().catch(() => null);
  if (heard || !result) return;
  const { albumArt, ...rest } = result;
  if (rest.trackId && albumArt) art.set(rest.trackId, albumArt);
  last = { ...rest, at: Date.now() };
}

function positionNow() {
  if (!last || last.positionMs === undefined) return undefined;
  const pos = last.playing ? last.positionMs + (Date.now() - last.at) : last.positionMs;
  return last.durationMs ? Math.min(pos, last.durationMs) : pos;
}

/** The profile card's song, or null when nothing plays. */
async function nowPlaying(seed) {
  await ensure(seed);
  if (!last || !last.playing || !last.song) return null;
  return {
    song: last.song,
    artist: last.artist || "Spotify",
    albumArt: (last.trackId && art.get(last.trackId)) || "",
    trackId: last.trackId,
    positionMs: positionNow(),
    durationMs: last.durationMs,
  };
}

/** Listen along: { trackId, positionMs, playing } or null. */
async function state(seed) {
  await ensure(seed);
  if (!last) return null;
  return { trackId: last.trackId || null, positionMs: positionNow() ?? null, playing: last.playing };
}

/**
 * After Hoffle itself plays, seeks or pauses, record the result right away:
 * Spotify may not announce a seek, and a stale position would make listen
 * along seek again on every tick.
 */
function applied(action, trackId, positionMs) {
  if (action === "play") {
    // Name and artist arrive with Spotify's own announcement a moment later.
    const same = last && last.trackId === trackId;
    last = { ...(same ? last : {}), playing: true, trackId, positionMs, at: Date.now() };
  } else if (action === "seek" && last) {
    last = { ...last, positionMs, at: Date.now() };
  } else if (action === "pause" && last) {
    last = { ...last, playing: false, positionMs: positionNow(), at: Date.now() };
  }
}

module.exports = { start, nowPlaying, state, applied, _onNotification: onNotification };
