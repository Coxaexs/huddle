"use client";

import { Activity } from "lucide-react";
import { type SpotifyActivity } from "@/lib/users";
import { setActivitySharing } from "../../hooks/use-activity-detector";
import { apiFetch } from "../../lib/client";
import { Tab } from "./types";

export function ActivitiesTab({
  tab,
  spotifyShare,
  setSpotifyShare,
  saveSpotifyActivity,
  spotifyUserInput,
  setSpotifyUserInput,
  setError,
  setStatus,
  trackSearchInput,
  setTrackSearchInput,
}: {
  tab: Tab;
  spotifyShare: boolean;
  setSpotifyShare: React.Dispatch<React.SetStateAction<boolean>>;
  saveSpotifyActivity: (activity: SpotifyActivity | null) => Promise<void>;
  spotifyUserInput: string;
  setSpotifyUserInput: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  trackSearchInput: string;
  setTrackSearchInput: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <>
      {tab === "activities" && (
            <div className="space-y-4">
              <label className="appearance-switch">
                <span>
                  <strong>Share Spotify / Music Listening</strong>
                  <small>Show live Spotify song titles, artists, and album art on your profile card automatically</small>
                </span>
                <input
                  type="checkbox"
                  checked={spotifyShare}
                  onChange={(e) => {
                    setSpotifyShare(e.target.checked);
                    setActivitySharing(e.target.checked);
                    // Turning it off takes the song off your profile now.
                    if (!e.target.checked) void saveSpotifyActivity(null).catch(() => undefined);
                  }}
                />
              </label>

              {spotifyShare && (
                <div className="bg-green-950/20 border border-green-500/30 p-3 rounded-lg space-y-3 mt-2">
                  <h4 className="text-xs font-bold text-green-400 uppercase tracking-wider flex items-center gap-2">
                    <Activity size={14} /> SPOTIFY REAL-TIME TRACK SYNC
                  </h4>

                  <div>
                    <label className="text-xs text-gray-300 block mb-1">
                      Spotify / Last.fm Account Sync (Automatic Scrobbler)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="discord-text-input text-xs"
                        placeholder="Enter Spotify / Last.fm username..."
                        value={spotifyUserInput}
                        onChange={(e) => setSpotifyUserInput(e.target.value)}
                      />
                      <button
                        type="button"
                        className="discord-btn primary-indigo text-xs whitespace-nowrap"
                        onClick={async () => {
                          if (!spotifyUserInput.trim()) return;
                          try {
                            const un = spotifyUserInput.trim();
                            if (typeof window !== "undefined") {
                              window.localStorage.setItem("huddle-spotify-username", un);
                            }
                            const resp = await fetch(`/hangout/api/integrations/spotify?username=${encodeURIComponent(un)}`);
                            const res = await resp.json() as { song?: string; artist?: string; albumArt?: string; error?: string; message?: string; isPlaying?: boolean };
                            if (res.error) {
                              setError(res.error);
                            } else if (res.song && res.isPlaying) {
                              await saveSpotifyActivity({
                                song: res.song,
                                artist: res.artist || "Spotify",
                                albumArt: res.albumArt,
                                isPlaying: true,
                              });
                              setStatus(`Now playing: ${res.song} by ${res.artist}`);
                            } else {
                              await saveSpotifyActivity(null);
                              setStatus(res.message || "Connected! Nothing is playing right now; checking every 10 seconds.");
                            }
                          } catch (err) {
                            setError(`Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`);
                          }
                        }}
                      >
                        Connect & Sync
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-300 block mb-1">
                      Paste Spotify Song Link / Search Track
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="discord-text-input text-xs"
                        placeholder="Paste Spotify link (https://open.spotify.com/track/...) or search song title..."
                        value={trackSearchInput}
                        onChange={(e) => setTrackSearchInput(e.target.value)}
                      />
                      <button
                        type="button"
                        className="discord-btn secondary-gray text-xs whitespace-nowrap"
                        onClick={async () => {
                          if (!trackSearchInput.trim()) return;
                          try {
                            const res = await apiFetch<{ song?: string; artist?: string; albumArt?: string }>(
                              `/api/integrations/spotify?track=${encodeURIComponent(trackSearchInput.trim())}`
                            );
                            if (res.song) {
                              await saveSpotifyActivity({
                                song: res.song,
                                artist: res.artist || "Spotify",
                                albumArt: res.albumArt,
                                isPlaying: true,
                              });
                              setStatus(`Now playing: ${res.song} by ${res.artist}`);
                            }
                          } catch {
                            setError("Track search failed.");
                          }
                        }}
                      >
                        Set Song
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
    </>
  );
}
