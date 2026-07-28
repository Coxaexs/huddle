"use client";

import { useRef, useState } from "react";
import { X, Upload, Music, Smile, Calendar, Check } from "lucide-react";
import type { PublicUser, SpotifyActivity } from "@/lib/users";
import { Avatar } from "./avatar";
import { apiFetch } from "../lib/client";

interface ProfileSettingsDialogProps {
  user: PublicUser;
  onClose: () => void;
  onProfileUpdated: (updatedUser: PublicUser) => void;
}

export function ProfileSettingsDialog({
  user,
  onClose,
  onProfileUpdated,
}: ProfileSettingsDialogProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [pronouns, setPronouns] = useState(user.pronouns || "");
  const [bio, setBio] = useState(user.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [bannerUrl, setBannerUrl] = useState(user.bannerUrl || "");
  const [bannerGradient, setBannerGradient] = useState("linear-gradient(135deg, #5865f2, #1e1f22)");

  // Spotify / Music Listening Activity state
  const [hasSpotify, setHasSpotify] = useState(Boolean(user.spotifyActivity));
  const [spotifySong, setSpotifySong] = useState(user.spotifyActivity?.song || "Starboy");
  const [spotifyArtist, setSpotifyArtist] = useState(user.spotifyActivity?.artist || "The Weeknd");
  const [spotifyCover, setSpotifyCover] = useState(user.spotifyActivity?.albumArt || "");

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch<{ key: string; url: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      setAvatarUrl(res.url);
      setNotice("Avatar uploaded!");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to upload avatar");
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch<{ key: string; url: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      setBannerUrl(res.url);
      setNotice("Banner uploaded!");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to upload banner");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const spotifyAct: SpotifyActivity | null = hasSpotify
        ? {
            song: spotifySong.trim() || "Currently Listening",
            artist: spotifyArtist.trim() || "Spotify",
            albumArt: spotifyCover.trim() || undefined,
            isPlaying: true,
          }
        : null;

      const res = await apiFetch<{ user: PublicUser }>("/api/settings/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: displayName.trim(),
          avatarUrl: avatarUrl || null,
          bannerUrl: bannerUrl || null,
          bio: bio.trim(),
          pronouns: pronouns.trim(),
          spotifyActivity: spotifyAct,
        }),
      });

      onProfileUpdated(res.user);
      onClose();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="discord-server-settings-fullscreen">
      <button
        type="button"
        className="discord-esc-button"
        onClick={onClose}
        title="Close (ESC)"
      >
        <span className="esc-circle">×</span>
        <span className="esc-label">ESC</span>
      </button>

      <div className="profile-settings-dialog-container">
        <form onSubmit={handleSave} className="profile-settings-form-layout">
          {/* Left Form Column */}
          <div className="profile-settings-left-col">
            <h2 className="text-xl font-bold text-white mb-1">User Profile Settings</h2>
            <p className="text-sm text-gray-400 mb-6">Customize how you look across all Huddle servers!</p>

            {notice && (
              <div className="bg-indigo-600/20 border border-indigo-500/40 text-indigo-200 px-3 py-2 rounded-lg text-xs mb-4">
                {notice}
              </div>
            )}

            <div className="form-group mb-4">
              <label>Display Name</label>
              <input
                type="text"
                className="discord-text-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={40}
                required
              />
            </div>

            <div className="form-group mb-4">
              <label>Pronouns</label>
              <input
                type="text"
                className="discord-text-input"
                placeholder="e.g. he/him, she/her, they/them"
                value={pronouns}
                onChange={(e) => setPronouns(e.target.value)}
                maxLength={30}
              />
            </div>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBannerUpload}
            />

            <div className="form-group mb-4">
              <label>Avatar Photo</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="discord-btn primary-indigo"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Upload size={14} className="inline mr-1.5" /> Upload Avatar
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    className="discord-btn secondary-gray"
                    onClick={() => setAvatarUrl("")}
                  >
                    Remove Avatar
                  </button>
                )}
              </div>
            </div>

            <div className="form-group mb-4">
              <label>Profile Banner Photo</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="discord-btn primary-indigo"
                  onClick={() => bannerInputRef.current?.click()}
                >
                  <Upload size={14} className="inline mr-1.5" /> Upload Banner
                </button>
                {bannerUrl && (
                  <button
                    type="button"
                    className="discord-btn secondary-gray"
                    onClick={() => setBannerUrl("")}
                  >
                    Remove Banner
                  </button>
                )}
              </div>
            </div>

            <div className="form-group mb-4">
              <label>About Me (Bio)</label>
              <textarea
                className="discord-text-input"
                rows={3}
                placeholder="Tell everyone a bit about yourself..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={400}
              />
            </div>

            <div className="form-group mb-6 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-200">
                  <Music size={16} className="text-green-400" />
                  Spotify / Listening Activity
                </label>
                <input
                  type="checkbox"
                  checked={hasSpotify}
                  onChange={(e) => setHasSpotify(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
              </div>

              {hasSpotify && (
                <div className="bg-black/30 p-3 rounded-lg border border-white/10 space-y-3 mt-2">
                  <div>
                    <label className="text-xs text-gray-400">Song Name</label>
                    <input
                      type="text"
                      className="discord-text-input text-xs"
                      placeholder="e.g. Blinding Lights"
                      value={spotifySong}
                      onChange={(e) => setSpotifySong(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Artist Name</label>
                    <input
                      type="text"
                      className="discord-text-input text-xs"
                      placeholder="e.g. The Weeknd"
                      value={spotifyArtist}
                      onChange={(e) => setSpotifyArtist(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                className="discord-btn secondary-gray"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="discord-btn primary-indigo"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>

          {/* Right Live Preview Card Column */}
          <div className="profile-settings-right-col">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              PREVIEW
            </h3>

            <div className="user-profile-card-popover shadow-2xl">
              <div
                className="profile-card-banner"
                style={{
                  background: bannerUrl
                    ? `url(${bannerUrl}) center/cover no-repeat`
                    : `linear-gradient(135deg, ${user.color || "#5865f2"}, #1e1f22)`,
                }}
              />

              <div className="profile-card-avatar-wrap">
                <Avatar
                  className="profile-card-avatar"
                  avatar={user.avatar}
                  avatarUrl={avatarUrl || user.avatarUrl}
                  color={user.color}
                >
                  <span
                    className="profile-presence-dot"
                    style={{ background: "#3ba55d" }}
                  />
                </Avatar>
              </div>

              <div className="profile-card-body">
                <div className="profile-card-header">
                  <h2 className="profile-display-name">{displayName || user.displayName}</h2>
                  <span className="profile-username">@{user.username}</span>
                  {pronouns && (
                    <span className="text-xs text-indigo-300 ml-2">({pronouns})</span>
                  )}
                </div>

                {hasSpotify && (
                  <div className="bg-green-950/30 border border-green-500/30 rounded-lg p-2.5 flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-900/60 rounded flex items-center justify-center text-green-400 flex-shrink-0">
                      <Music size={20} className="animate-pulse" />
                    </div>
                    <div className="overflow-hidden text-xs">
                      <div className="text-[10px] uppercase font-bold text-green-400 tracking-wider">
                        LISTENING TO SPOTIFY
                      </div>
                      <div className="font-semibold text-white truncate">
                        {spotifySong || "Starboy"}
                      </div>
                      <div className="text-gray-400 truncate">
                        by {spotifyArtist || "The Weeknd"}
                      </div>
                    </div>
                  </div>
                )}

                <div className="profile-card-divider" />

                <div className="profile-section">
                  <h4>ABOUT ME</h4>
                  <p className="profile-bio">
                    {bio && bio.trim() ? bio : "No bio written yet."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
