"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/client";
import {
  ACTIVITY_HEARTBEAT_MS,
  type ProfileActivity,
  type PublicUser,
  type SpotifyActivity,
} from "@/lib/users";

interface UseActivityDetectorOptions {
  user: PublicUser | null;
  onUpdateSpotify?: (activity: SpotifyActivity | null) => void;
  onUpdateActivity?: (activity: ProfileActivity | null) => void;
}

interface DesktopScan {
  activity: { name: string; kind: ProfileActivity["kind"] } | null;
  music: { song: string; artist: string; albumArt?: string; url?: string } | null;
}

type DesktopShell = { scanActivity?: () => Promise<DesktopScan | null> };

const SHARE_KEY = "huddle-share-listening";
const SHARE_APPS_KEY = "huddle-share-apps";
const LASTFM_KEY = "huddle-spotify-username";
const POLL_MS = 15_000;
// Every open tab runs this detector. One Last.fm check per browser per round is
// enough: a tab skips its check when another one made it this recently.
const LASTFM_POLLED_KEY = "huddle-lastfm-polled-at";
const LASTFM_SHARE_MS = 12_000;

/** Claims this round's Last.fm check; false when another tab just made it. */
export function claimLastFmPoll(now = Date.now()): boolean {
  try {
    const last = Number(window.localStorage.getItem(LASTFM_POLLED_KEY) || 0);
    if (last <= now && now - last < LASTFM_SHARE_MS) return false;
    window.localStorage.setItem(LASTFM_POLLED_KEY, String(now));
  } catch {
    // No storage: every tab checks for itself, as before.
  }
  return true;
}

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
}

function writeFlag(key: string, enabled: boolean): void {
  try {
    window.localStorage.setItem(key, enabled ? "on" : "off");
  } catch {
    // Session only.
  }
}

/** Whether this device shares what you are listening to (Settings → Activities). */
export function activitySharingEnabled(): boolean {
  return readFlag(SHARE_KEY);
}

export function setActivitySharing(enabled: boolean): void {
  writeFlag(SHARE_KEY, enabled);
}

/** Whether this device shares the game/app it detects running. */
export function appSharingEnabled(): boolean {
  return readFlag(SHARE_APPS_KEY);
}

export function setAppSharing(enabled: boolean): void {
  writeFlag(SHARE_APPS_KEY, enabled);
}

/** The desktop shell's scanner, if this is the desktop app. */
export function desktopScanner(): (() => Promise<DesktopScan | null>) | null {
  if (typeof window === "undefined") return null;
  const shell = (window as unknown as { huddle?: DesktopShell }).huddle;
  return shell?.scanActivity ? shell.scanActivity : null;
}

async function lastFmNowPlaying(username: string): Promise<SpotifyActivity | null | undefined> {
  const response = await fetch(
    `/hangout/api/integrations/spotify?username=${encodeURIComponent(username)}`,
    { cache: "no-store" },
  );
  const latest = (await response.json()) as {
    song?: string | null;
    artist?: string;
    albumArt?: string;
    isPlaying?: boolean;
    error?: string;
  };
  // Last.fm hiccups (rate limit, 5xx, "user not found") say nothing about the
  // music: undefined keeps whatever is already shown.
  if (!response.ok || latest.error) return undefined;
  if (latest.song && latest.isPlaying) {
    return {
      song: latest.song,
      artist: latest.artist || "Spotify",
      albumArt: latest.albumArt || "",
      isPlaying: true,
    };
  }
  return null;
}

export function useActivityDetector({
  user,
  onUpdateSpotify,
  onUpdateActivity,
}: UseActivityDetectorOptions) {
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [spotifyEnabled, setSpotifyEnabled] = useState(true);
  const [appsEnabled, setAppsEnabled] = useState(true);
  const [spotifyUsername, setSpotifyUsername] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(LASTFM_KEY) || "";
    } catch {
      return "";
    }
  });

  // Callbacks go through refs so a new closure never restarts the poll.
  const onSpotifyRef = useRef(onUpdateSpotify);
  onSpotifyRef.current = onUpdateSpotify;
  const onActivityRef = useRef(onUpdateActivity);
  onActivityRef.current = onUpdateActivity;

  // The username lives on the account so it follows you across devices; the
  // localStorage copy is only what older versions saved, moved up once below.
  const accountLastfm = user?.lastfmUsername || "";
  const lastfmRef = useRef("");
  lastfmRef.current = accountLastfm || spotifyUsername.trim();

  const saveSpotifyUsername = (username: string) => {
    setSpotifyUsername(username);
    try {
      if (username) window.localStorage.setItem(LASTFM_KEY, username);
      else window.localStorage.removeItem(LASTFM_KEY);
    } catch {
      // Session only.
    }
  };

  useEffect(() => {
    if (!user || accountLastfm || !spotifyUsername.trim()) return;
    apiFetch("/api/settings/profile", {
      method: "PATCH",
      body: JSON.stringify({ lastfmUsername: spotifyUsername.trim() }),
    }).catch(() => undefined);
  }, [user?.id, accountLastfm, spotifyUsername]);

  useEffect(() => {
    if (!user || !masterEnabled) return;

    // What we last told the server, so unchanged results only send a
    // heartbeat now and then instead of a profile write every poll.
    const sent = {
      spotifyKey: null as string | null,
      spotifyAt: 0,
      activityKey: null as string | null,
      activityAt: 0,
      activityStartedAt: 0,
    };
    let running = false;
    let cancelled = false;

    const publishSpotify = async (song: SpotifyActivity | null) => {
      const key = song ? `${song.song}\u0000${song.artist}` : "";
      // Nothing detected and nothing published by us: leave a hand-set song alone.
      if (!song && sent.spotifyKey === null) return;
      const fresh = Date.now() - sent.spotifyAt < ACTIVITY_HEARTBEAT_MS;
      if (key === sent.spotifyKey && fresh) return;
      const previous = sent.spotifyKey;
      const previousAt = sent.spotifyAt;
      sent.spotifyKey = key;
      sent.spotifyAt = Date.now();
      if (key !== previous) onSpotifyRef.current?.(song);
      try {
        await apiFetch("/api/settings/profile", {
          method: "PATCH",
          body: JSON.stringify({ spotifyActivity: song }),
        });
      } catch {
        sent.spotifyKey = previous;
        sent.spotifyAt = previousAt;
      }
    };

    const publishActivity = async (
      found: { name: string; kind: ProfileActivity["kind"] } | null,
    ) => {
      const key = found ? `${found.kind}\u0000${found.name}` : "";
      if (!found && sent.activityKey === null) return;
      const fresh = Date.now() - sent.activityAt < ACTIVITY_HEARTBEAT_MS;
      if (key === sent.activityKey && fresh) return;
      const previous = sent.activityKey;
      const previousAt = sent.activityAt;
      if (key !== previous) sent.activityStartedAt = Date.now();
      sent.activityKey = key;
      sent.activityAt = Date.now();
      const payload: ProfileActivity | null = found
        ? {
            kind: found.kind,
            name: found.name,
            startedAt: sent.activityStartedAt,
            updatedAt: Date.now(),
          }
        : null;
      if (key !== previous) onActivityRef.current?.(payload);
      try {
        await apiFetch("/api/settings/profile", {
          method: "PATCH",
          body: JSON.stringify({ activity: payload }),
        });
      } catch {
        sent.activityKey = previous;
        sent.activityAt = previousAt;
      }
    };

    const tick = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const scan = desktopScanner();
        const desktop = scan ? await scan().catch(() => null) : null;

        if (spotifyEnabled && activitySharingEnabled()) {
          // The Spotify app itself beats a Last.fm account: it is instant and
          // needs no setup. Last.fm covers phones, the web player and other
          // computers.
          let song: SpotifyActivity | null | undefined;
          if (desktop?.music) {
            song = { ...desktop.music, isPlaying: true };
          } else {
            const username = lastfmRef.current;
            if (username) {
              // Skipped: another tab has just checked and published it.
              song = claimLastFmPoll()
                ? await lastFmNowPlaying(username).catch(() => undefined)
                : undefined;
            } else if (scan) {
              song = null;
            }
          }
          if (song !== undefined) await publishSpotify(song);
        } else {
          await publishSpotify(null);
        }

        // Games and apps need the desktop shell to see them; the web app has
        // no way to know what else is running.
        if (scan) {
          if (appsEnabled && appSharingEnabled()) {
            await publishActivity(desktop?.activity ?? null);
          } else {
            await publishActivity(null);
          }
        }
      } finally {
        running = false;
      }
    };

    // Closing the window should not leave a song or game on your profile
    // until it times out. keepalive lets the request outlive the page.
    const clearOnExit = () => {
      const body: Record<string, null> = {};
      if (sent.spotifyKey) body.spotifyActivity = null;
      if (sent.activityKey) body.activity = null;
      if (!Object.keys(body).length) return;
      try {
        void fetch("/hangout/api/settings/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
          keepalive: true,
        });
      } catch {
        // The server-side stale timeout covers it.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };

    const interval = window.setInterval(() => void tick(), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", clearOnExit);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", clearOnExit);
    };
    // Only restart when the switches change, not on callback or user object churn.
  }, [!!user, masterEnabled, spotifyEnabled, appsEnabled]);

  return {
    masterEnabled,
    setMasterEnabled,
    spotifyEnabled,
    setSpotifyEnabled,
    appsEnabled,
    setAppsEnabled,
    spotifyUsername,
    saveSpotifyUsername,
  };
}
