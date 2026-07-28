"use client";

import { useEffect, useState } from "react";
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

  const saveSpotifyUsername = (username: string) => {
    setSpotifyUsername(username);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("huddle-spotify-username", username);
    }
  };

  const syncSpotifyTrack = async (trackQuery?: string) => {
    if (!user) return;
    try {
      let endpoint = "";
      if (trackQuery) {
        endpoint = `/api/integrations/spotify?track=${encodeURIComponent(trackQuery)}`;
      } else if (spotifyUsername) {
        endpoint = `/api/integrations/spotify?username=${encodeURIComponent(spotifyUsername)}`;
      }

      if (!endpoint) return;

      const data = await apiFetch<{
        song?: string;
        artist?: string;
        albumArt?: string;
        isPlaying?: boolean;
      }>(endpoint);

      if (data.song) {
        const spotifyAct: SpotifyActivity = {
          song: data.song,
          artist: data.artist || "Spotify",
          albumArt: data.albumArt || undefined,
          isPlaying: data.isPlaying ?? true,
        };

        onUpdateSpotify?.(spotifyAct);

        await apiFetch("/api/settings/profile", {
          method: "PATCH",
          body: JSON.stringify({ spotifyActivity: spotifyAct }),
        });
      }
    } catch {
      // silent catch
    }
  };

  // Automatic Web Media Session API & Spotify sync loop
  useEffect(() => {
    if (!user || !masterEnabled || !spotifyEnabled) return;

    let lastSong = "";

    const checkMediaSession = async () => {
      let song = "";
      let artist = "";
      let albumArt = "";

      // 1. Read navigator.mediaSession metadata
      if ("mediaSession" in navigator && navigator.mediaSession.metadata) {
        const meta = navigator.mediaSession.metadata;
        if (meta.title && meta.title.trim()) {
          song = meta.title.trim();
          artist = meta.artist ? meta.artist.trim() : "Spotify";
          albumArt = meta.artwork?.[0]?.src || "";
        }
      }

      // 2. If mediaSession metadata found
      if (song && song !== lastSong) {
        lastSong = song;
        const spotifyAct: SpotifyActivity = {
          song,
          artist,
          albumArt,
          isPlaying: true,
        };

        onUpdateSpotify?.(spotifyAct);

        try {
          await apiFetch("/api/settings/profile", {
            method: "PATCH",
            body: JSON.stringify({ spotifyActivity: spotifyAct }),
          });
        } catch {
          // ignore
        }
      } else if (!song && spotifyUsername) {
        // 3. Sync via Spotify / Last.fm account API
        void syncSpotifyTrack();
      }
    };

    const interval = setInterval(checkMediaSession, 4000);
    void checkMediaSession();
    return () => clearInterval(interval);
  }, [user, masterEnabled, spotifyEnabled, spotifyUsername, onUpdateSpotify]);

  return {
    masterEnabled,
    setMasterEnabled,
    spotifyEnabled,
    setSpotifyEnabled,
    appsEnabled,
    setAppsEnabled,
    spotifyUsername,
    saveSpotifyUsername,
    syncSpotifyTrack,
    detectedApps,
    setDetectedApps,
    activeAppId,
    setActiveAppId,
  };
}
