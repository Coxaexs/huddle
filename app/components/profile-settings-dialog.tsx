"use client";

import { useRef, useState } from "react";
import { X, Upload, Music, Smile, Calendar, Check, Fish } from "lucide-react";
import {
  PRIDE_BADGES,
  type PrideBadgeId,
  type PublicUser,
  type SpotifyActivity,
} from "@/lib/users";
import { Avatar } from "./avatar";
import { PrideBadges } from "./pride-badges";
import { apiFetch } from "../lib/client";
import { PROFILE_CSS_PRESETS, scopeProfileCss } from "@/lib/themes";


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
  const [prideBadges, setPrideBadges] = useState<PrideBadgeId[]>(
    user.prideBadges || [],
  );
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [bannerUrl, setBannerUrl] = useState(user.bannerUrl || "");
  const [bannerGradient, setBannerGradient] = useState("linear-gradient(135deg, #5865f2, #1e1f22)");

  // Spotify / Music Listening Activity state
  const [hasSpotify, setHasSpotify] = useState(Boolean(user.spotifyActivity));
  const [spotifySong, setSpotifySong] = useState(user.spotifyActivity?.song || "Starboy");
  const [spotifyArtist, setSpotifyArtist] = useState(user.spotifyActivity?.artist || "The Weeknd");
  const [spotifyCover, setSpotifyCover] = useState(user.spotifyActivity?.albumArt || "");

  // Custom Profile CSS
  const [customCss, setCustomCss] = useState(user.customCss || "");
  const [showCssGuide, setShowCssGuide] = useState(false);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [spotifyQuery, setSpotifyQuery] = useState("");

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
          prideBadges,
          spotifyActivity: spotifyAct,
          customCss: customCss.trim() || null,
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

            <div className="form-group mb-4">
              <label>Pride badges <span className="profile-field-optional">Optional · choose up to 4</span></label>
              <p className="pride-choice-help">
                These are public profile decorations. Pick only the labels you want to share.
              </p>
              <div className="pride-badge-picker">
                {PRIDE_BADGES.map((badge) => {
                  const selected = prideBadges.includes(badge.id);
                  return (
                    <button
                      type="button"
                      key={badge.id}
                      className={selected ? "selected" : ""}
                      aria-pressed={selected}
                      onClick={() =>
                        setPrideBadges((current) =>
                          selected
                            ? current.filter((id) => id !== badge.id)
                            : current.length < 4
                              ? [...current, badge.id]
                              : current,
                        )
                      }
                    >
                      <span
                        className="pride-flag-swatch"
                        aria-hidden="true"
                        style={{ "--badge-stripes": badge.colors.join(", ") } as React.CSSProperties}
                      />
                      {badge.label}
                      {selected && <Check size={13} />}
                    </button>
                  );
                })}
              </div>
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
                    <label className="text-xs text-green-400 font-bold block mb-1">
                      Paste Spotify Song Link or Search Track
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="discord-text-input text-xs"
                        placeholder="Paste Spotify link (https://open.spotify.com/track/...) or song title..."
                        value={spotifyQuery}
                        onChange={(e) => setSpotifyQuery(e.target.value)}
                      />
                      <button
                        type="button"
                        className="discord-btn primary-indigo text-xs whitespace-nowrap"
                        onClick={async () => {
                          if (!spotifyQuery.trim()) return;
                          try {
                            const res = await apiFetch<{ song?: string; artist?: string; albumArt?: string }>(
                              `/api/integrations/spotify?track=${encodeURIComponent(spotifyQuery.trim())}`
                            );
                            if (res.song) {
                              setSpotifySong(res.song);
                              setSpotifyArtist(res.artist || "Spotify");
                              if (res.albumArt) setSpotifyCover(res.albumArt);
                              setNotice(`Fetched track: ${res.song} by ${res.artist}`);
                            }
                          } catch {
                            setNotice("Could not fetch Spotify link details");
                          }
                        }}
                      >
                        Fetch Track
                      </button>
                    </div>
                  </div>

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

            {/* Custom Profile CSS */}
            <div className="profile-settings-field-group border-t border-gray-800 pt-5 mt-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    Custom Profile CSS
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 font-mono px-1.5 py-0.5 rounded border border-purple-500/30">
                      Scoped
                    </span>
                  </h3>
                  <p className="text-xs text-gray-400">
                    Add custom styling to your profile card. Styles are strictly scoped to your profile.
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                  onClick={() => setShowCssGuide(!showCssGuide)}
                >
                  {showCssGuide ? "Hide Guide" : "CSS Guide"}
                </button>
              </div>

              {showCssGuide && (
                <div className="mb-3 p-3 bg-gray-900/80 rounded-lg text-xs text-gray-300 border border-gray-800 space-y-1.5">
                  <div className="font-semibold text-gray-200">Available Selectors:</div>
                  <div className="grid grid-cols-2 gap-1 font-mono text-[11px] text-purple-300">
                    <span>.profile-card</span>
                    <span>.profile-banner</span>
                    <span>.profile-card-avatar</span>
                    <span>.profile-display-name</span>
                    <span>.profile-username</span>
                    <span>.profile-bio</span>
                    <span>.profile-badge</span>
                    <span>.profile-section</span>
                  </div>
                </div>
              )}

              {/* Preset buttons */}
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                <span className="text-xs text-gray-400 self-center mr-1">Presets:</span>
                {PROFILE_CSS_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    title={p.desc}
                    className="text-xs bg-gray-800/80 hover:bg-gray-700 text-gray-200 px-2.5 py-1 rounded border border-gray-700/60 transition-colors"
                    onClick={() => setCustomCss(p.css)}
                  >
                    ✨ {p.name}
                  </button>
                ))}
                {customCss && (
                  <button
                    type="button"
                    className="text-xs bg-red-950/40 hover:bg-red-900/60 text-red-300 px-2 py-1 rounded border border-red-800/40 transition-colors"
                    onClick={() => setCustomCss("")}
                  >
                    Clear CSS
                  </button>
                )}
              </div>

              <textarea
                rows={6}
                value={customCss}
                onChange={(e) => setCustomCss(e.target.value)}
                placeholder={`.profile-card {\n  border: 1px solid #a78bfa;\n  box-shadow: 0 0 20px rgba(167, 139, 250, 0.4);\n}`}
                className="w-full font-mono text-xs bg-black/50 border border-gray-700 rounded-lg p-3 text-purple-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                spellCheck={false}
              />
            </div>

            <div className="blahaj-profile-tip" aria-label="Blåhaj profile tip">
              <span aria-hidden="true"><Fish size={22} /></span>
              <p><strong>Blåhaj says:</strong> decorate your profile in whatever way feels like you.</p>
            </div>

            <div className="profile-settings-savebar flex items-center justify-end gap-3 pt-2">
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

            <div
              className={`user-profile-card-popover profile-card shadow-2xl user-profile-scoped-${user.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
              data-user-profile={user.id}
            >
              {customCss && (
                <style
                  dangerouslySetInnerHTML={{
                    __html: scopeProfileCss(customCss, user.id),
                  }}
                />
              )}
              <div
                className="profile-card-banner profile-banner"
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
                />
                <span
                  className="profile-presence-dot"
                  style={{ background: "#3ba55d", position: "absolute" }}
                />
              </div>

              <div className="profile-card-body">
                <div className="profile-card-header">
                  <h2 className="profile-display-name">{displayName || user.displayName}</h2>
                  <span className="profile-username">@{user.username}</span>
                  {pronouns && (
                    <span className="text-xs text-indigo-300 ml-2">({pronouns})</span>
                  )}
                </div>
                <PrideBadges badges={prideBadges} compact />

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
