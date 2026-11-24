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
import { useI18n } from "../../lib/i18n-context";
import { Tab } from "./types";
import { SteamLinkSection } from "./steam-link";
import { OverlaySettings } from "./overlay-settings";

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
  const { t } = useI18n();
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
                  <strong>{t("settings.activities.spotifyShare")}</strong>
                  <small>{t("settings.activities.spotifyShareDesc")}</small>
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
                  <strong>{t("settings.activities.gamesShare")}</strong>
                  <small>
                    {isDesktop
                      ? t("settings.activities.gamesShareDesktop")
                      : t("settings.activities.gamesShareWeb")}
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
                  <Gamepad2 size={14} /> {t("settings.activities.whatDoing")}
                </h4>
                {current ? (
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-200">
                    <span>
                      {current.manual ? t("settings.activities.setByYou") : t("settings.activities.detected")}: <strong>{current.name}</strong>
                    </span>
                    <button
                      type="button"
                      className="discord-btn secondary-gray text-xs"
                      onClick={() => void saveActivity(null).catch(() => setError(t("settings.activities.clearError")))}
                    >
                      {t("settings.activities.clear")}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">{t("settings.activities.nothing")}</p>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="discord-text-input text-xs"
                    placeholder={t("settings.activities.placeholder")}
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
                        setStatus(t("settings.activities.nowShowing", { name }));
                      } catch {
                        setError(t("settings.activities.setError"));
                      }
                    }}
                  >
                    {t("settings.activities.set")}
                  </button>
                </div>
              </div>

              <SteamLinkSection />

              <OverlaySettings />

              {spotifyShare && (
                <div className="bg-green-950/20 border border-green-500/30 p-3 rounded-lg space-y-3 mt-2">
                  <h4 className="text-xs font-bold text-green-400 uppercase tracking-wider flex items-center gap-2">
                    <Activity size={14} /> {t("settings.activities.spotifySyncTitle")}
                  </h4>

                  <div>
                    <label className="text-xs text-gray-300 block mb-1">
                      {t("settings.activities.lastfmLabel")}
                      {lastfmUsername ? t("settings.activities.lastfmLinked", { name: lastfmUsername }) : ""}
                    </label>
                    <p className="text-[11px] text-gray-400 mb-1">
                      {isDesktop
                        ? t("settings.activities.lastfmDesktopHint")
                        : t("settings.activities.lastfmWebHint")}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="discord-text-input text-xs"
                        placeholder={t("settings.activities.lastfmPlaceholder")}
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
                              setStatus(t("settings.activities.nowPlaying", { song: res.song, artist: res.artist || "Spotify" }));
                            } else {
                              await saveSpotifyActivity(null);
                              setStatus(res.message || t("settings.activities.connectedChecking"));
                            }
                          } catch (err) {
                            setError(t("settings.activities.connectionFailed", { error: err instanceof Error ? err.message : t("settings.activities.unknownError") }));
                          }
                        }}
                      >
                        {lastfmUsername ? t("settings.activities.updateSync") : t("settings.activities.connectSync")}
                      </button>
                      {lastfmUsername && (
                        <button
                          type="button"
                          className="discord-btn secondary-gray text-xs whitespace-nowrap"
                          onClick={() => {
                            setSpotifyUserInput("");
                            void saveLastfm(null)
                              .then(() => saveSpotifyActivity(null))
                              .then(() => setStatus(t("settings.activities.lastfmDisconnected")))
                              .catch(() => setError(t("settings.activities.disconnectError")));
                          }}
                        >
                          {t("settings.activities.disconnect")}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-300 block mb-1">
                      {t("settings.activities.trackSearchLabel")}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="discord-text-input text-xs"
                        placeholder={t("settings.activities.trackSearchPlaceholder")}
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
                              setStatus(t("settings.activities.nowPlaying", { song: res.song, artist: res.artist || "Spotify" }));
                            }
                          } catch {
                            setError(t("settings.activities.trackSearchFailed"));
                          }
                        }}
                      >
                        {t("settings.activities.setSong")}
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
