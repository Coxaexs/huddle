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

export function useActivityDetector(user: PublicUser | null) {
  const [activeAppId, setActiveAppId] = useState<string>("spotify");
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [spotifyEnabled, setSpotifyEnabled] = useState(true);
  const [appsEnabled, setAppsEnabled] = useState(true);

  const [detectedApps, setDetectedApps] = useState<ActivityApp[]>([
    { id: "spotify", name: "Spotify", type: "music", details: "Listening to Spotify", enabled: true },
    { id: "vscode", name: "Visual Studio Code", type: "coding", details: "Editing Huddle codebase", enabled: true },
    { id: "minecraft", name: "Minecraft", type: "game", details: "Playing Survival Mode", enabled: true },
  ]);

  // Automatic Web Media Session API listener for Spotify / browser music
  useEffect(() => {
    if (!user || !masterEnabled || !spotifyEnabled) return;

    let lastSong = "";
    const checkMediaSession = async () => {
      if ("mediaSession" in navigator && navigator.mediaSession.metadata) {
        const meta = navigator.mediaSession.metadata;
        const song = meta.title || "Currently Playing";
        const artist = meta.artist || "Spotify";
        const albumArt = meta.artwork?.[0]?.src || "";

        if (song !== lastSong) {
          lastSong = song;
          const spotifyAct: SpotifyActivity = {
            song,
            artist,
            albumArt,
            isPlaying: true,
          };

          try {
            await apiFetch("/api/settings/profile", {
              method: "PATCH",
              body: JSON.stringify({ spotifyActivity: spotifyAct }),
            });
          } catch {
            // ignore silent sync errors
          }
        }
      }
    };

    const interval = setInterval(checkMediaSession, 5000);
    checkMediaSession();
    return () => clearInterval(interval);
  }, [user, masterEnabled, spotifyEnabled]);

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
