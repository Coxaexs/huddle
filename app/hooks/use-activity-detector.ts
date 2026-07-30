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

export function useActivityDetector({ user, onUpdateSpotify }: UseActivityDetectorOptions) {
  const [activeAppId, setActiveAppId] = useState<string>("spotify");
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [spotifyEnabled, setSpotifyEnabled] = useState(true);
  const [appsEnabled, setAppsEnabled] = useState(true);
  const [spotifyUsername, setSpotifyUsername] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("huddle-spotify-username") || "";
  });

  const [detectedApps, setDetectedApps] = useState<ActivityApp[]>([
    { id: "spotify", name: "Spotify", type: "music", details: "Listening to Spotify", enabled: true },
    { id: "vscode", name: "Visual Studio Code", type: "coding", details: "Editing Huddle codebase", enabled: true },
    { id: "minecraft", name: "Minecraft", type: "game", details: "Playing Survival Mode", enabled: true },
  ]);

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
      if (activityKey === lastActivityKeyRef.current) return;
      lastActivityKeyRef.current = activityKey;
      onUpdateRef.current?.(spotifyAct);
      try {
        await apiFetch("/api/settings/profile", {
          method: "PATCH",
          body: JSON.stringify({ spotifyActivity: spotifyAct }),
        });
      } catch {
        // A later poll will retry if the published state changes again.
      }
    };

    const checkSpotifyActivity = async () => {
      // Prevent overlapping syncs
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
        const savedUsername =
          window.localStorage.getItem("huddle-spotify-username")?.trim() || "";

        if (savedUsername) {
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
          } else if (response.ok && !latest.error) {
            await publishSpotify(null);
          }
          return;
        }

        let song = "";
        let artist = "";
        let albumArt = "";

        // Check navigator.mediaSession metadata (works for Spotify Web Player, YouTube Music, etc.)
        if ("mediaSession" in navigator && navigator.mediaSession.metadata) {
          const meta = navigator.mediaSession.metadata;
          if (meta.title && meta.title.trim()) {
            song = meta.title.trim();
            artist = meta.artist ? meta.artist.trim() : "Spotify";
            albumArt = meta.artwork?.[0]?.src || "";
          }
        }

        await publishSpotify(
          song ? { song, artist, albumArt, isPlaying: true } : null,
        );
      } finally {
        isSyncingRef.current = false;
      }
    };

    // Last.fm and local media metadata are refreshed on the same bounded loop.
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
    detectedApps,
    setDetectedApps,
    activeAppId,
    setActiveAppId,
  };
}
