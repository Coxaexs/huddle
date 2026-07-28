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

  const [detectedApps, setDetectedApps] = useState<ActivityApp[]>([
    { id: "spotify", name: "Spotify", type: "music", details: "Listening to Spotify", enabled: true },
    { id: "vscode", name: "Visual Studio Code", type: "coding", details: "Editing Huddle codebase", enabled: true },
    { id: "minecraft", name: "Minecraft", type: "game", details: "Playing Survival Mode", enabled: true },
  ]);

  // Automatic Web Media Session API & browser media detector for Spotify / music
  useEffect(() => {
    if (!user || !masterEnabled || !spotifyEnabled) return;

    let lastSong = "";

    const checkMediaSession = async () => {
      let song = "";
      let artist = "";
      let albumArt = "";

      // 1. Check navigator.mediaSession metadata
      if ("mediaSession" in navigator && navigator.mediaSession.metadata) {
        const meta = navigator.mediaSession.metadata;
        if (meta.title) {
          song = meta.title;
          artist = meta.artist || "Spotify";
          albumArt = meta.artwork?.[0]?.src || "";
        }
      }

      // 2. If activeAppId is spotify and no mediaSession found, set active Spotify status
      if (!song && activeAppId === "spotify") {
        song = "Listening to Spotify";
        artist = "Spotify Desktop / Web Player";
      }

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
          // ignore silent sync errors
        }
      }
    };

    const interval = setInterval(checkMediaSession, 4000);
    void checkMediaSession();
    return () => clearInterval(interval);
  }, [user, masterEnabled, spotifyEnabled, activeAppId, onUpdateSpotify]);

  return {
    masterEnabled,
    setMasterEnabled,
    spotifyEnabled,
    setSpotifyEnabled,
    appsEnabled,
    setAppsEnabled,
    detectedApps,
    setDetectedApps,
    activeAppId,
    setActiveAppId,
  };
}
