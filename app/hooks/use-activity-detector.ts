"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch } from "../lib/client";
import type { PublicUser, SpotifyActivity } from "@/lib/users";

export interface ActivityApp {
  id: string;
  name: string;
  type: "music" | "game" | "coding" | "browser";
  details?: string;
  enabled: boolean;
}

interface UseActivityDetectorOptions {
  user: PublicUser | null;
  onUpdateSpotify?: (activity: SpotifyActivity | null) => void;
}

const SHARE_KEY = "huddle-share-listening";

/** Whether this device shares what you are listening to (Settings → Activities). */
export function activitySharingEnabled(): boolean {
  try {
    return window.localStorage.getItem(SHARE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setActivitySharing(enabled: boolean): void {
  try {
    window.localStorage.setItem(SHARE_KEY, enabled ? "on" : "off");
  } catch {
    // Session only.
  }
}

export function useActivityDetector({ user, onUpdateSpotify }: UseActivityDetectorOptions) {
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [spotifyEnabled, setSpotifyEnabled] = useState(true);
  const [appsEnabled, setAppsEnabled] = useState(true);
  const [spotifyUsername, setSpotifyUsername] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("huddle-spotify-username") || "";
  });


  // Use refs to avoid re-render loops — callbacks and user identity are stable
  const onUpdateRef = useRef(onUpdateSpotify);
  onUpdateRef.current = onUpdateSpotify;

  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  const lastActivityKeyRef = useRef<string | null>(null);
  const isSyncingRef = useRef(false);

  const saveSpotifyUsername = (username: string) => {
    setSpotifyUsername(username);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("huddle-spotify-username", username);
    }
  };

  // Stable media session check — runs on a long interval, uses refs to avoid dep churn
  useEffect(() => {
    if (!user || !masterEnabled || !spotifyEnabled) return;

    const publishSpotify = async (spotifyAct: SpotifyActivity | null) => {
      const activityKey = spotifyAct
        ? `${spotifyAct.song}\u0000${spotifyAct.artist}\u0000${spotifyAct.isPlaying !== false}`
        : "";
      // Nothing detected and nothing published by us yet: leave the profile
      // alone. Clearing here wiped a song people had set by hand, on every
      // page load, and told every client to reload.
      if (!spotifyAct && lastActivityKeyRef.current === null) return;
      if (activityKey === lastActivityKeyRef.current) return;
      lastActivityKeyRef.current = activityKey;
      onUpdateRef.current?.(spotifyAct);
      try {
        await apiFetch("/api/settings/profile", {
          method: "PATCH",
          body: JSON.stringify({ spotifyActivity: spotifyAct }),
        });
      } catch {
        // Try again on the next poll.
        lastActivityKeyRef.current = null;
      }
    };

    const checkSpotifyActivity = async () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      try {
        // Only a linked Last.fm account counts. This page's own media session
        // is Hoffle's own players (the music bot, voice messages), which used
        // to show up as "Listening to Spotify".
        const savedUsername =
          window.localStorage.getItem("huddle-spotify-username")?.trim() || "";
        if (!savedUsername || !activitySharingEnabled()) return;
        const response = await fetch(
          `/hangout/api/integrations/spotify?username=${encodeURIComponent(savedUsername)}`,
          { cache: "no-store" },
        );
        const latest = (await response.json()) as {
          song?: string | null;
          artist?: string;
          albumArt?: string;
          isPlaying?: boolean;
          error?: string;
        };
        if (response.ok && !latest.error && latest.song && latest.isPlaying) {
          await publishSpotify({
            song: latest.song,
            artist: latest.artist || "Spotify",
            albumArt: latest.albumArt || "",
            isPlaying: true,
          });
        } else if (response.ok) {
          await publishSpotify(null);
        }
      } catch {
        // Offline or the lookup failed: try again next time.
      } finally {
        isSyncingRef.current = false;
      }
    };

    const interval = window.setInterval(checkSpotifyActivity, 10_000);
    void checkSpotifyActivity();
    return () => clearInterval(interval);
    // Only re-subscribe when these booleans change — NOT on callback/user object changes
  }, [!!user, masterEnabled, spotifyEnabled]);

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
