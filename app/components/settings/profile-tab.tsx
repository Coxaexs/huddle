"use client";

import { Sparkles, Fish, Check, Plus, Trash2, X, Upload, Music } from "lucide-react";
import { Avatar } from "../avatar";
import { scopeProfileCss, checkProfileCss, PROFILE_CSS_PRESETS } from "@/lib/themes";
import { PRIDE_BADGES, type PublicUser, type SocialLink } from "@/lib/users";
import { PrideBadges } from "../pride-badges";
import { SocialPlatformIcon } from "../user-profile-card";
import { BANNER_PRESETS, AVATAR_FRAMES, COLOR_SWATCHES, STATUS_EMOJIS, PROFILE_CSS_SNIPPETS } from "./constants";
import { Tab } from "./types";

export function ProfileTab({
  tab,
  displayName,
  setDisplayName,
  pronouns,
  setPronouns,
  tagline,
  setTagline,
  customStatus,
  setCustomStatus,
  bannerUrl,
  color,
  bannerRef,
  setBannerUrl,
  setBannerKey,
  chooseBanner,
  avatarFrame,
  avatarUrl,
  avatar,
  pictureRef,
  setAvatarUrl,
  setAvatarKey,
  choosePicture,
  setAvatar,
  setAvatarFrame,
  setColor,
  bio,
  setBio,
  prideBadges,
  setPrideBadges,
  newPlatform,
  setNewPlatform,
  newUrl,
  setNewUrl,
  newLabel,
  setNewLabel,
  setSocialLinks,
  socialLinks,
  spotifySong,
  setSpotifySong,
  spotifyArtist,
  setSpotifyArtist,
  spotifyCover,
  setSpotifyCover,
  setShowProfileCssGuide,
  showProfileCssGuide,
  setProfileCustomCss,
  profileCustomCss,
  saveProfile,
  status,
  error,
  user,
}: {
  tab: Tab;
  displayName: string;
  setDisplayName: React.Dispatch<React.SetStateAction<string>>;
  pronouns: string;
  setPronouns: React.Dispatch<React.SetStateAction<string>>;
  tagline: string;
  setTagline: React.Dispatch<React.SetStateAction<string>>;
  customStatus: string;
  setCustomStatus: React.Dispatch<React.SetStateAction<string>>;
  bannerUrl: string | null;
  color: string;
  bannerRef: React.RefObject<HTMLInputElement | null>;
  setBannerUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setBannerKey: React.Dispatch<React.SetStateAction<string | null | undefined>>;
  chooseBanner: (file: File | undefined) => Promise<void>;
  avatarFrame: string;
  avatarUrl: string | null;
  avatar: string;
  pictureRef: React.RefObject<HTMLInputElement | null>;
  setAvatarUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setAvatarKey: React.Dispatch<React.SetStateAction<string | null | undefined>>;
  choosePicture: (file: File | undefined) => Promise<void>;
  setAvatar: React.Dispatch<React.SetStateAction<string>>;
  setAvatarFrame: React.Dispatch<React.SetStateAction<string>>;
  setColor: React.Dispatch<React.SetStateAction<string>>;
  bio: string;
  setBio: React.Dispatch<React.SetStateAction<string>>;
  prideBadges: ("trans" | "pride" | "nonbinary" | "bisexual" | "lesbian" | "gay" | "pansexual" | "asexual" | "intersex")[];
  setPrideBadges: React.Dispatch<React.SetStateAction<("trans" | "pride" | "nonbinary" | "bisexual" | "lesbian" | "gay" | "pansexual" | "asexual" | "intersex")[]>>;
  newPlatform: string;
  setNewPlatform: React.Dispatch<React.SetStateAction<string>>;
  newUrl: string;
  setNewUrl: React.Dispatch<React.SetStateAction<string>>;
  newLabel: string;
  setNewLabel: React.Dispatch<React.SetStateAction<string>>;
  setSocialLinks: React.Dispatch<React.SetStateAction<SocialLink[]>>;
  socialLinks: SocialLink[];
  spotifySong: string;
  setSpotifySong: React.Dispatch<React.SetStateAction<string>>;
  spotifyArtist: string;
  setSpotifyArtist: React.Dispatch<React.SetStateAction<string>>;
  spotifyCover: string;
  setSpotifyCover: React.Dispatch<React.SetStateAction<string>>;
  setShowProfileCssGuide: React.Dispatch<React.SetStateAction<boolean>>;
  showProfileCssGuide: boolean;
  setProfileCustomCss: React.Dispatch<React.SetStateAction<string>>;
  profileCustomCss: string;
  saveProfile: () => Promise<void>;
  status: string;
  error: string;
  user: PublicUser;
}) {
  return (
    <>
      {tab === "profile" && (
            <div className="profile-studio-layout">
              <div className="profile-studio-form">
                {/* 1. Identity & Status */}
                <div className="profile-studio-section">
                  <h3 className="profile-studio-section-title">Identity & Status</h3>
                  
                  <label htmlFor="settings-name">Display Name</label>
                  <input
                    id="settings-name"
                    value={displayName}
                    maxLength={40}
                    placeholder="How you appear to others"
                    onChange={(event) => setDisplayName(event.target.value)}
                  />

                  <label htmlFor="settings-pronouns">Pronouns</label>
                  <div className="pronouns-input-group">
                    <input
                      id="settings-pronouns"
                      value={pronouns}
                      maxLength={30}
                      placeholder="e.g. he/him, she/her, they/them"
                      onChange={(event) => setPronouns(event.target.value)}
                    />
                    <div className="quick-tags-row">
                      {["he/him", "she/her", "they/them", "any/all", "she/they", "he/they"].map((p) => (
                        <button
                          type="button"
                          key={p}
                          className={`quick-tag-chip ${pronouns === p ? "active" : ""}`}
                          onClick={() => setPronouns(p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label htmlFor="settings-tagline">
                    Tagline / Headline <small className="field-optional-note">Profile subtitle</small>
                  </label>
                  <input
                    id="settings-tagline"
                    value={tagline}
                    maxLength={80}
                    placeholder="e.g. Web Wizard, Pixel Artist, Coffee Addict"
                    onChange={(event) => setTagline(event.target.value)}
                  />

                  <label htmlFor="settings-custom-status">
                    Custom Status <small className="field-optional-note">Speech bubble over avatar</small>
                  </label>
                  <div className="status-input-wrap">
                    <input
                      id="settings-custom-status"
                      value={customStatus}
                      maxLength={100}
                      placeholder="What's on your mind? (e.g. vibing to lofi ☕)"
                      onChange={(event) => setCustomStatus(event.target.value)}
                    />
                    {customStatus && (
                      <button
                        type="button"
                        className="clear-status-btn"
                        onClick={() => setCustomStatus("")}
                        title="Clear status"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="emoji-picker-row">
                    {STATUS_EMOJIS.map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        className="emoji-quick-btn"
                        onClick={() => setCustomStatus((prev) => (prev ? `${emoji} ${prev}` : `${emoji} `))}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Banner Customization */}
                <div className="profile-studio-section">
                  <h3 className="profile-studio-section-title">Profile Banner</h3>
                  <p className="profile-studio-hint">Upload an image or GIF, enter an image URL, or choose a preset gradient.</p>
                  
                  <div
                    className="banner-preview-box"
                    style={{
                      background: bannerUrl
                        ? (bannerUrl.startsWith("http") || bannerUrl.startsWith("/") || bannerUrl.startsWith("data:")
                            ? `url(${bannerUrl}) center/cover no-repeat`
                            : bannerUrl)
                        : `linear-gradient(135deg, ${color || "#5865f2"}, #1e1f22)`,
                    }}
                  >
                    <div className="banner-preview-actions">
                      <button
                        type="button"
                        className="banner-action-btn"
                        onClick={() => bannerRef.current?.click()}
                      >
                        <Upload size={13} /> Upload Banner
                      </button>
                      {bannerUrl && (
                        <button
                          type="button"
                          className="banner-action-btn danger"
                          onClick={() => {
                            setBannerUrl(null);
                            setBannerKey(null);
                          }}
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    ref={bannerRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      void chooseBanner(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />

                  <label htmlFor="settings-banner-url" style={{ marginTop: 8 }}>Banner Image URL</label>
                  <input
                    id="settings-banner-url"
                    value={bannerUrl && (bannerUrl.startsWith("http") || bannerUrl.startsWith("/")) ? bannerUrl : ""}
                    placeholder="https://example.com/banner.gif"
                    onChange={(e) => setBannerUrl(e.target.value.trim() || null)}
                  />

                  <span className="field-label" style={{ marginTop: 10 }}>Banner Presets</span>
                  <div className="banner-presets-grid">
                    {BANNER_PRESETS.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className={`banner-preset-btn ${bannerUrl === p.css ? "chosen" : ""}`}
                        style={{ background: p.css }}
                        onClick={() => setBannerUrl(p.css)}
                        title={p.name}
                      >
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Avatar & Frame Decoration */}
                <div className="profile-studio-section">
                  <h3 className="profile-studio-section-title">Avatar & Frame Decoration</h3>

                  <span className="field-label">Profile Picture</span>
                  <div className="picture-row">
                    <span
                      className={`picture-preview avatar-frame-${avatarFrame}`}
                      style={{ background: avatarUrl ? undefined : color }}
                    >
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" />
                      ) : (
                        avatar || displayName.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <div className="picture-actions">
                      <button
                        type="button"
                        onClick={() => pictureRef.current?.click()}
                      >
                        <Upload size={13} /> Upload
                      </button>
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setAvatarUrl(null);
                            setAvatarKey(null);
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      ref={pictureRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) => {
                        void choosePicture(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "10px" }}>
                    <div>
                      <label htmlFor="settings-avatar">Avatar Letters</label>
                      <input
                        id="settings-avatar"
                        value={avatar}
                        maxLength={2}
                        onChange={(event) => setAvatar(event.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="settings-avatar-url">Image URL</label>
                      <input
                        id="settings-avatar-url"
                        value={avatarUrl || ""}
                        placeholder="https://..."
                        onChange={(event) => setAvatarUrl(event.target.value.trim() || null)}
                      />
                    </div>
                  </div>

                  <span className="field-label" style={{ marginTop: 12 }}>Avatar Frame / Aura</span>
                  <div className="avatar-frames-grid">
                    {AVATAR_FRAMES.map((f) => (
                      <button
                        type="button"
                        key={f.id}
                        className={`avatar-frame-chip ${avatarFrame === f.id ? "chosen" : ""}`}
                        onClick={() => setAvatarFrame(f.id)}
                        title={f.desc}
                      >
                        <span className="frame-name">{f.name}</span>
                        <span className="frame-desc">{f.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Profile & Accent Color */}
                <div className="profile-studio-section">
                  <h3 className="profile-studio-section-title">Profile Color & Accent</h3>
                  <p className="profile-studio-hint">Pick any hex color for your profile aura and avatar background.</p>

                  <div className="custom-color-row">
                    <label className="color-picker-label">
                      <input
                        type="color"
                        value={color.startsWith("#") && color.length === 7 ? color : "#5865f2"}
                        onChange={(e) => setColor(e.target.value)}
                        className="color-picker-native"
                      />
                      <span className="color-swatch-display" style={{ background: color }} />
                    </label>
                    <input
                      type="text"
                      value={color}
                      maxLength={9}
                      placeholder="#5865F2"
                      onChange={(e) => setColor(e.target.value)}
                      className="color-hex-input"
                    />
                  </div>

                  <span className="field-label" style={{ marginTop: 10 }}>Palette</span>
                  <div className="color-row">
                    {COLOR_SWATCHES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`color-dot ${color.toLowerCase() === option.toLowerCase() ? "chosen" : ""}`}
                        style={{ background: option }}
                        aria-label={`Use ${option}`}
                        onClick={() => setColor(option)}
                      />
                    ))}
                  </div>
                </div>

                {/* 5. About Me / Bio */}
                <div className="profile-studio-section">
                  <div className="section-label-with-count">
                    <label htmlFor="settings-bio">About Me</label>
                    <span className="char-count">{bio.length}/500</span>
                  </div>
                  <textarea
                    id="settings-bio"
                    rows={3}
                    value={bio}
                    maxLength={500}
                    placeholder="Tell everyone a bit about yourself…"
                    onChange={(event) => setBio(event.target.value)}
                  />
                </div>

                {/* 6. Pride Badges */}
                <div className="profile-studio-section">
                  <span className="field-label">Pride Badges <small className="field-optional-note">Optional · up to 4</small></span>
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
                            setPrideBadges((currentBadges) =>
                              selected
                                ? currentBadges.filter((id) => id !== badge.id)
                                : currentBadges.length < 4
                                  ? [...currentBadges, badge.id]
                                  : currentBadges,
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

                {/* 7. Social Links */}
                <div className="profile-studio-section">
                  <h3 className="profile-studio-section-title">Social Links</h3>
                  <p className="profile-studio-hint">Connect your GitHub, Twitter/X, Discord, YouTube, Steam, and websites.</p>

                  <div className="add-social-form">
                    <select
                      value={newPlatform}
                      onChange={(e) => setNewPlatform(e.target.value)}
                      className="social-select"
                    >
                      <option value="github">GitHub</option>
                      <option value="twitter">Twitter / X</option>
                      <option value="discord">Discord</option>
                      <option value="youtube">YouTube</option>
                      <option value="twitch">Twitch</option>
                      <option value="instagram">Instagram</option>
                      <option value="spotify">Spotify</option>
                      <option value="steam">Steam</option>
                      <option value="website">Website</option>
                    </select>
                    <input
                      value={newUrl}
                      placeholder="https://..."
                      onChange={(e) => setNewUrl(e.target.value)}
                      className="social-url-input"
                    />
                    <input
                      value={newLabel}
                      placeholder="Label (optional)"
                      onChange={(e) => setNewLabel(e.target.value)}
                      className="social-label-input"
                    />
                    <button
                      type="button"
                      className="add-social-btn"
                      disabled={!newUrl.trim()}
                      onClick={() => {
                        if (!newUrl.trim()) return;
                        setSocialLinks((prev) => [
                          ...prev,
                          { platform: newPlatform, url: newUrl.trim(), label: newLabel.trim() || undefined }
                        ]);
                        setNewUrl("");
                        setNewLabel("");
                      }}
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>

                  {socialLinks.length > 0 && (
                    <div className="current-socials-list">
                      {socialLinks.map((link, idx) => (
                        <div key={idx} className="current-social-item">
                          <SocialPlatformIcon platform={link.platform} />
                          <span className="social-item-name">{link.label || link.platform}</span>
                          <span className="social-item-url truncate">{link.url}</span>
                          <button
                            type="button"
                            className="social-delete-btn"
                            onClick={() => setSocialLinks((prev) => prev.filter((_, i) => i !== idx))}
                            title="Remove link"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 8. Music & Activity */}
                <div className="profile-studio-section">
                  <h3 className="profile-studio-section-title">Music & Activity</h3>
                  <p className="profile-studio-hint">Showcase your current jam or favorite track on your profile card.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <label htmlFor="spotify-song">Song Title</label>
                      <input
                        id="spotify-song"
                        value={spotifySong}
                        maxLength={60}
                        placeholder="e.g. Resonance"
                        onChange={(e) => setSpotifySong(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="spotify-artist">Artist</label>
                      <input
                        id="spotify-artist"
                        value={spotifyArtist}
                        maxLength={60}
                        placeholder="e.g. HOME"
                        onChange={(e) => setSpotifyArtist(e.target.value)}
                      />
                    </div>
                  </div>
                  <label htmlFor="spotify-cover">Album Art URL</label>
                  <input
                    id="spotify-cover"
                    value={spotifyCover}
                    placeholder="https://… (optional)"
                    onChange={(e) => setSpotifyCover(e.target.value)}
                  />
                  {spotifySong && (
                    <button
                      type="button"
                      className="clear-song-btn text-xs text-rose-400 hover:text-rose-300 mt-1"
                      onClick={() => {
                        setSpotifySong("");
                        setSpotifyArtist("");
                        setSpotifyCover("");
                      }}
                    >
                      Clear Music
                    </button>
                  )}
                </div>

                {/* 9. Custom Profile CSS Studio */}
                <div className="profile-studio-section">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold text-sm">
                      Custom Profile CSS
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 font-mono px-1.5 py-0.5 rounded border border-purple-500/30">
                        Scoped
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                      onClick={() => setShowProfileCssGuide(!showProfileCssGuide)}
                    >
                      {showProfileCssGuide ? "Hide Guide" : "CSS Guide"}
                    </button>
                  </div>

                  {showProfileCssGuide && (
                    <div style={{ padding: "10px", background: "rgba(0,0,0,0.3)", borderRadius: "8px", fontSize: "11px", margin: "8px 0", border: "1px solid var(--line)" }}>
                      <div style={{ fontWeight: 600, marginBottom: "4px" }}>Available Selectors:</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontFamily: "monospace", color: "var(--lavender)" }}>
                        <span>.profile-card</span>
                        <span>.profile-banner</span>
                        <span>.profile-avatar</span>
                        <span>.profile-name</span>
                        <span>.profile-bio</span>
                        <span>.profile-badge</span>
                        <span>.profile-tagline</span>
                        <span>.profile-social-links</span>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "8px 0", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>Themes:</span>
                    {PROFILE_CSS_PRESETS.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        title={p.desc}
                        style={{ fontSize: "11px", padding: "3px 8px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", border: "1px solid var(--line)" }}
                        onClick={() => setProfileCustomCss(p.css)}
                      >
                        ✨ {p.name}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>Snippets:</span>
                    {PROFILE_CSS_SNIPPETS.map((s) => (
                      <button
                        key={s.name}
                        type="button"
                        style={{ fontSize: "11px", padding: "3px 8px", background: "rgba(168, 85, 247, 0.12)", color: "#d8b4fe", borderRadius: "6px", border: "1px solid rgba(168, 85, 247, 0.25)" }}
                        onClick={() => setProfileCustomCss((prev) => prev + s.snippet)}
                      >
                        {s.name}
                      </button>
                    ))}
                    {profileCustomCss && (
                      <button
                        type="button"
                        style={{ fontSize: "11px", padding: "3px 8px", background: "rgba(239,68,68,0.15)", color: "#fca5a5", borderRadius: "6px", border: "1px solid rgba(239,68,68,0.3)" }}
                        onClick={() => setProfileCustomCss("")}
                      >
                        Clear CSS
                      </button>
                    )}
                  </div>

                  <textarea
                    rows={6}
                    value={profileCustomCss}
                    onChange={(e) => setProfileCustomCss(e.target.value)}
                    placeholder={`.profile-card {\n  border: 1px solid var(--lavender);\n  box-shadow: 0 0 15px rgba(167, 139, 250, 0.3);\n}`}
                    style={{
                      width: "100%",
                      fontFamily: "monospace",
                      fontSize: "12px",
                      padding: "10px",
                      background: "rgba(0,0,0,0.35)",
                      border: "1px solid var(--line)",
                      borderRadius: "8px",
                      color: "var(--ink)",
                      marginBottom: "16px",
                      resize: "vertical",
                    }}
                    spellCheck={false}
                  />
                  {profileCustomCss.trim() && (() => {
                    const checked = checkProfileCss(profileCustomCss);
                    return checked.ok ? null : (
                      <p role="alert" style={{ color: "var(--coral)", fontSize: 12, margin: "6px 0 0" }}>
                        {checked.error}
                      </p>
                    );
                  })()}
                </div>

                <div className="blahaj-profile-tip" aria-label="Blåhaj profile tip">
                  <span aria-hidden="true"><Fish size={22} /></span>
                  <p><strong>Blåhaj says:</strong> decorate your profile in whatever way feels like you.</p>
                </div>

                <div className="profile-studio-actions">
                  <button type="button" className="primary save-profile-btn" onClick={saveProfile}>
                    Save profile
                  </button>
                  {status && <span className="profile-status-message">{status}</span>}
                  {error && <span className="profile-error-message">{error}</span>}
                </div>
              </div>

              {/* Right Column: Sticky Live Preview */}
              <div className="profile-studio-preview-col">
                <div className="profile-preview-sticky">
                  <div className="profile-preview-header">
                    <Sparkles size={14} className="text-purple-400" />
                    <span>Live Profile Preview</span>
                  </div>

                  <div
                    className="user-profile-card-popover profile-card user-profile-scoped-live_preview"
                    data-has-custom-css={Boolean(profileCustomCss && profileCustomCss.trim())}
                    style={{ position: "relative", width: "100%", maxWidth: "340px", margin: "0 auto", zIndex: 1 }}
                  >
                    {profileCustomCss && (
                      <style
                        dangerouslySetInnerHTML={{
                          __html: scopeProfileCss(profileCustomCss, "live_preview"),
                        }}
                      />
                    )}
                    <div
                      className="profile-card-banner profile-banner"
                      style={{
                        background: bannerUrl
                          ? (bannerUrl.startsWith("http") || bannerUrl.startsWith("/") || bannerUrl.startsWith("data:")
                              ? `url(${bannerUrl}) center/cover no-repeat`
                              : bannerUrl)
                          : `linear-gradient(135deg, ${color || "#5865f2"}, #1e1f22)`,
                      }}
                    />
                    <div className="profile-card-avatar-row">
                      <div className={`profile-card-avatar-wrap avatar-frame-${avatarFrame || "none"}`}>
                        <Avatar
                          className="profile-card-avatar"
                          avatar={avatar}
                          avatarUrl={avatarUrl}
                          color={color}
                        />
                        <span
                          className="profile-presence-dot"
                          style={{ background: "#3ba55d" }}
                          title="Online"
                        />
                      </div>

                      {customStatus && (
                        <div className="profile-status-bubble" title={customStatus}>
                          <span className="profile-status-bubble-tail" />
                          <span className="profile-status-bubble-text">{customStatus}</span>
                        </div>
                      )}
                    </div>

                    <div className="profile-card-body">
                      <div className="profile-card-header">
                        <h2 className="profile-display-name">{displayName || user.username}</h2>
                        <div className="profile-identity-sub">
                          <span className="profile-username">@{user.username}</span>
                          {pronouns && <span className="profile-pronouns-tag">• {pronouns}</span>}
                          {prideBadges.length > 0 && (
                            <span className="profile-inline-pride">
                              <PrideBadges badges={prideBadges.slice(0, 1)} compact />
                            </span>
                          )}
                        </div>
                        {tagline && (
                          <p className="profile-tagline" title={tagline}>
                            {tagline}
                          </p>
                        )}
                      </div>

                      {/* Badges Shelf */}
                      {(user.isAdmin || prideBadges.length > 0) && (
                        <div className="profile-badges-shelf">
                          {user.isAdmin && (
                            <span className="profile-badge-item badge-owner" title="Server Owner / Admin">
                              🛡️ Owner
                            </span>
                          )}
                          {prideBadges.length > 0 && <PrideBadges badges={prideBadges} compact />}
                        </div>
                      )}

                      {/* Social Links */}
                      {socialLinks.length > 0 && (
                        <div className="profile-social-links">
                          {socialLinks.map((link, idx) => (
                            <span key={idx} className="profile-social-link-pill">
                              <SocialPlatformIcon platform={link.platform} />
                              <span>{link.label || link.platform}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Spotify Widget */}
                      {spotifySong && (
                        <div className="bg-green-950/40 border border-green-500/30 rounded-lg p-2.5 flex items-center gap-3 my-1">
                          <div className="w-10 h-10 bg-green-900/60 rounded flex items-center justify-center text-green-400 flex-shrink-0 overflow-hidden">
                            {spotifyCover.startsWith("/") ? (
                              <img src={spotifyCover} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Music size={20} className="animate-pulse" />
                            )}
                          </div>
                          <div className="overflow-hidden text-xs">
                            <div className="text-[10px] uppercase font-bold text-green-400 tracking-wider">
                              LISTENING TO SPOTIFY
                            </div>
                            <div className="font-semibold text-white truncate">{spotifySong}</div>
                            <div className="text-gray-400 truncate">by {spotifyArtist || "Artist"}</div>
                          </div>
                        </div>
                      )}

                      <div className="profile-card-divider" />

                      <div className="profile-section">
                        <p className="profile-bio">{bio || "No bio written yet."}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
    </>
  );
}
