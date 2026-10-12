"use client";

import { Activity, Gamepad2 } from "lucide-react";
import { useState } from "react";
import { liveActivity, type ProfileActivity, type SpotifyActivity } from "@/lib/users";
import {
  appSharingEnabled,
  desktopScanner,
  setActivitySharing,
  setAppSharing,
} from "../../hooks/use-activity-detector";
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
  activity,
  saveActivity,
  lastfmUsername,
  saveLastfm,
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
  activity: ProfileActivity | null | undefined;
  saveActivity: (activity: ProfileActivity | null) => Promise<void>;
  lastfmUsername: string | null | undefined;
  saveLastfm: (username: string | null) => Promise<void>;
}) {
  const [appShare, setAppShare] = useState(() => (typeof window === "undefined" ? true : appSharingEnabled()));
  const [manualName, setManualName] = useState("");
  const isDesktop = typeof window !== "undefined" && Boolean(desktopScanner());
  const current = liveActivity(activity);
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

              <label className="appearance-switch">
                <span>
                  <strong>Share games &amp; apps</strong>
                  <small>
                    {isDesktop
                      ? "Show the game or app you are using (\"Playing Minecraft\") on your profile, detected automatically"
                      : "Automatic detection needs the Hoffle desktop app. In the browser you can set what you are doing by hand below"}
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={appShare}
                  onChange={(e) => {
                    setAppShare(e.target.checked);
                    setAppSharing(e.target.checked);
                    if (!e.target.checked && current && !current.manual) void saveActivity(null).catch(() => undefined);
                  }}
                />
              </label>

              <div className="bg-indigo-950/20 border border-indigo-400/30 p-3 rounded-lg space-y-2">
                <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                  <Gamepad2 size={14} /> WHAT YOU ARE DOING
                </h4>
                {current ? (
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-200">
                    <span>
                      {current.manual ? "Set by you" : "Detected"}: <strong>{current.name}</strong>
                    </span>
                    <button
                      type="button"
                      className="discord-btn secondary-gray text-xs"
                      onClick={() => void saveActivity(null).catch(() => setError("Could not clear that."))}
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Nothing right now.</p>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="discord-text-input text-xs"
                    placeholder="Playing… (game or app name)"
                    maxLength={80}
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="discord-btn primary-indigo text-xs whitespace-nowrap"
                    onClick={async () => {
                      const name = manualName.trim();
                      if (!name) return;
                      try {
                        const now = Date.now();
                        await saveActivity({ kind: "playing", name, startedAt: now, updatedAt: now, manual: true });
                        setManualName("");
                        setStatus(`Now showing: Playing ${name}`);
                      } catch {
                        setError("Could not set that.");
                      }
                    }}
                  >
                    Set
                  </button>
                </div>
              </div>

              {spotifyShare && (
                <div className="bg-green-950/20 border border-green-500/30 p-3 rounded-lg space-y-3 mt-2">
                  <h4 className="text-xs font-bold text-green-400 uppercase tracking-wider flex items-center gap-2">
                    <Activity size={14} /> SPOTIFY REAL-TIME TRACK SYNC
                  </h4>

                  <div>
                    <label className="text-xs text-gray-300 block mb-1">
                      Last.fm username{lastfmUsername ? ` (linked: ${lastfmUsername}, follows your account)` : ""}
                    </label>
                    <p className="text-[11px] text-gray-400 mb-1">
                      {isDesktop
                        ? "The Spotify desktop app is picked up automatically. Add Last.fm to also cover your phone and the web player."
                        : "Link Spotify to Last.fm (last.fm/settings/applications), then enter your Last.fm username. Updates arrive within about 15 seconds."}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="discord-text-input text-xs"
                        placeholder="Your Last.fm username"
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
                            await saveLastfm(un);
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
                        {lastfmUsername ? "Update & Sync" : "Connect & Sync"}
                      </button>
                      {lastfmUsername && (
                        <button
                          type="button"
                          className="discord-btn secondary-gray text-xs whitespace-nowrap"
                          onClick={() => {
                            setSpotifyUserInput("");
                            void saveLastfm(null)
                              .then(() => saveSpotifyActivity(null))
                              .then(() => setStatus("Last.fm disconnected."))
                              .catch(() => setError("Could not disconnect."));
                          }}
                        >
                          Disconnect
                        </button>
                      )}
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
