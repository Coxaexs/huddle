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

  const lastSongRef = useRef("");
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

    const checkMediaSession = async () => {
      // Prevent overlapping syncs
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
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

        // Only sync if the song actually changed
        if (song && song !== lastSongRef.current) {
          lastSongRef.current = song;
          const spotifyAct: SpotifyActivity = { song, artist, albumArt, isPlaying: true };

          // Fire callback via ref (no re-render dependency)
          onUpdateRef.current?.(spotifyAct);

          try {
            await apiFetch("/api/settings/profile", {
              method: "PATCH",
              body: JSON.stringify({ spotifyActivity: spotifyAct }),
            });
          } catch {
            // ignore
          }
        }
      } finally {
        isSyncingRef.current = false;
      }
    };

    // Poll every 15 seconds (not 4!) to avoid resource exhaustion
    const interval = setInterval(checkMediaSession, 15_000);
    void checkMediaSession();
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
