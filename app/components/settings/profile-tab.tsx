"use client";

import { Check, Plus, Trash2, X, Upload, Pencil, ImagePlus, Palette, Link2, Music, Code2, UserRound, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "../avatar";
import { checkProfileCss, PROFILE_CSS_PRESETS } from "@/lib/themes";
import { PRIDE_BADGES, type PrideBadgeId, type PublicUser, type SocialLink } from "@/lib/users";
import { SocialPlatformIcon } from "../user-profile-card";
import { BANNER_PRESETS, COLOR_SWATCHES, STATUS_EMOJIS, PROFILE_CSS_SNIPPETS } from "./constants";
import { DecorationPicker, DecorationSwatch, DecoratedAvatar, cosmeticName, type DecorationKind } from "./decoration-picker";
import { ProfilePreviewCard, bannerBackground, type PreviewProfile } from "./profile-preview-card";

type DetailsTab = "identity" | "about" | "links" | "music" | "css";

const DETAILS_TABS: { id: DetailsTab; label: string; icon: typeof UserRound }[] = [
  { id: "identity", label: "Identity", icon: UserRound },
  { id: "about", label: "About", icon: Sparkles },
  { id: "links", label: "Connections", icon: Link2 },
  { id: "music", label: "Music", icon: Music },
  { id: "css", label: "CSS", icon: Code2 },
];

const PRONOUN_CHIPS = ["he/him", "she/her", "they/them", "any/all", "she/they", "he/they"];

const SOCIAL_PLATFORMS: [string, string][] = [
  ["github", "GitHub"],
  ["twitter", "Twitter / X"],
  ["discord", "Discord"],
  ["youtube", "YouTube"],
  ["twitch", "Twitch"],
  ["instagram", "Instagram"],
  ["spotify", "Spotify"],
  ["steam", "Steam"],
  ["website", "Website"],
];

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

export function ProfileTab({
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
  profileEffect,
  nameplate,
  profileFrame,
  avatarUrl,
  avatar,
  pictureRef,
  setAvatarUrl,
  setAvatarKey,
  choosePicture,
  setAvatar,
  setAvatarFrame,
  setProfileEffect,
  setNameplate,
  setProfileFrame,
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
  resetProfile,
  onClose,
  status,
  error,
  user,
}: {
  displayName: string;
  setDisplayName: SetState<string>;
  pronouns: string;
  setPronouns: SetState<string>;
  tagline: string;
  setTagline: SetState<string>;
  customStatus: string;
  setCustomStatus: SetState<string>;
  bannerUrl: string | null;
  color: string;
  bannerRef: React.RefObject<HTMLInputElement | null>;
  setBannerUrl: SetState<string | null>;
  setBannerKey: SetState<string | null | undefined>;
  chooseBanner: (file: File | undefined) => Promise<void>;
  avatarFrame: string;
  profileEffect: string;
  nameplate: string;
  profileFrame: string;
  avatarUrl: string | null;
  avatar: string;
  pictureRef: React.RefObject<HTMLInputElement | null>;
  setAvatarUrl: SetState<string | null>;
  setAvatarKey: SetState<string | null | undefined>;
  choosePicture: (file: File | undefined) => Promise<void>;
  setAvatar: SetState<string>;
  setAvatarFrame: SetState<string>;
  setProfileEffect: SetState<string>;
  setNameplate: SetState<string>;
  setProfileFrame: SetState<string>;
  setColor: SetState<string>;
  bio: string;
  setBio: SetState<string>;
  prideBadges: PrideBadgeId[];
  setPrideBadges: SetState<PrideBadgeId[]>;
  newPlatform: string;
  setNewPlatform: SetState<string>;
  newUrl: string;
  setNewUrl: SetState<string>;
  newLabel: string;
  setNewLabel: SetState<string>;
  setSocialLinks: SetState<SocialLink[]>;
  socialLinks: SocialLink[];
  spotifySong: string;
  setSpotifySong: SetState<string>;
  spotifyArtist: string;
  setSpotifyArtist: SetState<string>;
  spotifyCover: string;
  setSpotifyCover: SetState<string>;
  setShowProfileCssGuide: SetState<boolean>;
  showProfileCssGuide: boolean;
  setProfileCustomCss: SetState<string>;
  profileCustomCss: string;
  saveProfile: () => Promise<void>;
  resetProfile: () => void;
  onClose: () => void;
  status: string;
  error: string;
  user: PublicUser;
}) {
  const [picker, setPicker] = useState<DecorationKind | null>(null);
  const [panel, setPanel] = useState<"color" | "banner" | null>(null);
  const [details, setDetails] = useState<DetailsTab>("identity");
  const [saving, setSaving] = useState(false);
  // A close attempt with unsaved changes shakes the save bar; a second one discards.
  const [warned, setWarned] = useState(0);
  const warnTimer = useRef<number | undefined>(undefined);

  const cosmetics = { avatarFrame, profileEffect, nameplate, profileFrame };
  const banner = bannerBackground(bannerUrl, color);
  const profile: PreviewProfile = {
    displayName: displayName || user.username,
    username: user.username,
    avatar,
    avatarUrl,
    color,
    bannerBackground: banner,
    pronouns,
    tagline,
    customStatus,
    bio,
    prideBadges,
    socialLinks,
    isAdmin: user.isAdmin,
    unrestrictedCss: user.unrestrictedCss,
    createdAt: (user as { createdAt?: string }).createdAt,
    song: spotifySong.trim() ? { title: spotifySong, artist: spotifyArtist || "Unknown artist", cover: spotifyCover.startsWith("/") || spotifyCover.startsWith("http") ? spotifyCover : undefined } : null,
  };

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const dirty =
    displayName !== user.displayName ||
    avatar !== user.avatar ||
    color !== user.color ||
    pronouns !== (user.pronouns || "") ||
    tagline !== (user.tagline || "") ||
    customStatus !== (user.customStatus || "") ||
    bio !== (user.bio || "") ||
    avatarUrl !== (user.avatarUrl || null) ||
    bannerUrl !== (user.bannerUrl || null) ||
    avatarFrame !== (user.avatarFrame || "none") ||
    profileEffect !== (user.profileEffect || "none") ||
    nameplate !== (user.nameplate || "none") ||
    profileFrame !== (user.profileFrame || "none") ||
    profileCustomCss !== (user.customCss || "") ||
    spotifySong !== (user.spotifyActivity?.song || "") ||
    spotifyArtist !== (user.spotifyActivity?.artist || "") ||
    spotifyCover !== (user.spotifyActivity?.albumArt || "") ||
    !same(socialLinks, user.socialLinks || []) ||
    !same(prideBadges, user.prideBadges || []);

  function requestClose() {
    if (picker) return;
    if (dirty && !warned) {
      setWarned(Date.now());
      window.clearTimeout(warnTimer.current);
      warnTimer.current = window.setTimeout(() => setWarned(0), 4000);
      return;
    }
    if (dirty) resetProfile();
    onClose();
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector(".dp-modal")) return;
      event.stopPropagation();
      event.preventDefault();
      if (panel) setPanel(null);
      else requestClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  });
  useEffect(() => () => window.clearTimeout(warnTimer.current), []);

  async function save() {
    setSaving(true);
    try {
      await saveProfile();
    } finally {
      setSaving(false);
      setWarned(0);
    }
  }

  const applyPicker = (id: string) => {
    if (picker === "nameplate") setNameplate(id);
    else if (picker === "frame") setAvatarFrame(id);
    else if (picker === "pframe") setProfileFrame(id);
    else setProfileEffect(id);
  };

  const cosmeticTile = (kind: DecorationKind, id: string, label: string, wide = false) => (
    <button
      type="button"
      className={`pe-tile${wide ? " pe-tile-wide" : ""}${id === "none" ? " is-empty" : ""}`}
      onClick={() => setPicker(kind)}
      aria-label={`${label}: ${cosmeticName(kind, id)}`}
    >
      {id === "none" ? (
        <span className={`pe-empty pe-empty-${kind}`}>
          {kind === "frame" ? (
            <Avatar className="dec-avatar pe-empty-avatar" avatar={avatar} avatarUrl={avatarUrl} color={color} size={64} />
          ) : kind === "nameplate" ? (
            <>
              <span className="dp-skel-circle" />
              <span className="dp-skel" />
            </>
          ) : (
            <span className="pe-empty-card">
              <span className="dp-skel-circle" />
              <span className="dp-skel" style={{ width: "60%" }} />
              <span className="dp-skel" style={{ width: "80%" }} />
            </span>
          )}
          <span className="pe-plus"><Plus size={18} strokeWidth={2.6} /></span>
        </span>
      ) : (
        <DecorationSwatch kind={kind} id={id} profile={profile} />
      )}
      <span className="pe-tile-hover"><Pencil size={14} /> {id === "none" ? "Add" : "Change"}</span>
    </button>
  );

  return (
    <div className="pe-root" style={{ "--pe-accent": color || "#5865f2" } as React.CSSProperties}>
      <div className="pe-backdrop" style={{ background: banner }} aria-hidden="true" />

      <aside className="pe-rail" aria-label="Decorations">
        <div className="pe-rail-head">
          <h2>Main Profile</h2>
          <p>Changes show up on the right as you make them.</p>
        </div>

        <section className="pe-group">
          <h4>Nameplate</h4>
          {cosmeticTile("nameplate", nameplate, "Nameplate", true)}
        </section>

        <section className="pe-group">
          <h4>Avatar &amp; Decoration</h4>
          <div className="pe-pair">
            <div className="pe-tile pe-tile-avatar">
              <button type="button" className="pe-tile-fill" onClick={() => pictureRef.current?.click()} aria-label="Upload a new avatar">
                <DecoratedAvatar profile={profile} id="none" size={84} />
                <span className="pe-tile-hover"><Upload size={14} /> Upload</span>
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="pe-tile-remove"
                  title="Remove picture"
                  aria-label="Remove picture"
                  onClick={() => {
                    setAvatarUrl(null);
                    setAvatarKey(null);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            {cosmeticTile("frame", avatarFrame, "Avatar decoration")}
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
        </section>

        <section className="pe-group">
          <h4>Theme &amp; Banner</h4>
          <div className="pe-pair">
            <button
              type="button"
              className={`pe-tile pe-tile-theme${panel === "color" ? " open" : ""}`}
              onClick={() => setPanel(panel === "color" ? null : "color")}
              aria-expanded={panel === "color"}
              style={{ "--swatch": color || "#5865f2" } as React.CSSProperties}
            >
              <span className="pe-theme-chip" />
              <span className="pe-tile-hover"><Palette size={14} /> Color</span>
            </button>
            <button
              type="button"
              className={`pe-tile pe-tile-banner${panel === "banner" ? " open" : ""}`}
              onClick={() => setPanel(panel === "banner" ? null : "banner")}
              aria-expanded={panel === "banner"}
            >
              <span className="pe-banner-chip" style={{ background: banner }} />
              <span className="pe-tile-hover"><ImagePlus size={14} /> Banner</span>
            </button>
          </div>

          {panel === "color" && (
            <div className="pe-panel">
              <div className="pe-color-row">
                <label className="pe-color-native" style={{ background: color }}>
                  <input
                    type="color"
                    value={color.startsWith("#") && color.length === 7 ? color : "#5865f2"}
                    onChange={(event) => setColor(event.target.value)}
                    aria-label="Pick any color"
                  />
                </label>
                <input className="pe-input pe-hex" value={color} maxLength={9} placeholder="#5865F2" onChange={(event) => setColor(event.target.value)} aria-label="Hex color" />
              </div>
              <div className="pe-swatches">
                {COLOR_SWATCHES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`pe-swatch${color.toLowerCase() === option.toLowerCase() ? " chosen" : ""}`}
                    style={{ background: option }}
                    aria-label={`Use ${option}`}
                    onClick={() => setColor(option)}
                  />
                ))}
              </div>
            </div>
          )}

          {panel === "banner" && (
            <div className="pe-panel">
              <div className="pe-panel-actions">
                <button type="button" className="pe-chip-btn" onClick={() => bannerRef.current?.click()}>
                  <Upload size={13} /> Upload image
                </button>
                {bannerUrl && (
                  <button
                    type="button"
                    className="pe-chip-btn danger"
                    onClick={() => {
                      setBannerUrl(null);
                      setBannerKey(null);
                    }}
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                )}
              </div>
              <input
                className="pe-input"
                value={bannerUrl && (bannerUrl.startsWith("http") || bannerUrl.startsWith("/")) ? bannerUrl : ""}
                placeholder="…or paste an image / GIF URL"
                onChange={(event) => setBannerUrl(event.target.value.trim() || null)}
                aria-label="Banner image URL"
              />
              <div className="pe-presets">
                {BANNER_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    className={`pe-preset${bannerUrl === preset.css ? " chosen" : ""}`}
                    style={{ background: preset.css }}
                    onClick={() => setBannerUrl(preset.css)}
                    title={preset.name}
                    aria-label={preset.name}
                  />
                ))}
              </div>
            </div>
          )}
          <input
            ref={bannerRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              void chooseBanner(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </section>

        <section className="pe-group">
          <h4>Profile Effect &amp; Frame</h4>
          <div className="pe-pair">
            {cosmeticTile("effect", profileEffect, "Profile effect")}
            {cosmeticTile("pframe", profileFrame, "Profile frame")}
          </div>
        </section>
      </aside>

      <main className="pe-stage" aria-label="Live preview">
        <div className="pe-stage-inner">
          <ProfilePreviewCard profile={profile} cosmetics={cosmetics} size="lg" customCss={profileCustomCss} />
        </div>
      </main>

      <section className="pe-details" aria-label="Profile details">
        <nav className="pe-tabs" role="tablist">
          {DETAILS_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={details === item.id}
              className={details === item.id ? "active" : ""}
              onClick={() => setDetails(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="pe-details-body">
          {details === "identity" && (
            <>
              <Field label="Display Name" htmlFor="pe-name" count={`${displayName.length}/40`}>
                <input id="pe-name" className="pe-input" value={displayName} maxLength={40} placeholder={user.username} onChange={(event) => setDisplayName(event.target.value)} />
              </Field>
              <Field label="Pronouns" htmlFor="pe-pronouns">
                <input id="pe-pronouns" className="pe-input" value={pronouns} maxLength={30} placeholder="Add your pronouns" onChange={(event) => setPronouns(event.target.value)} />
                <div className="pe-chips">
                  {PRONOUN_CHIPS.map((p) => (
                    <button type="button" key={p} className={`pe-chip${pronouns === p ? " active" : ""}`} onClick={() => setPronouns(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Tagline" htmlFor="pe-tagline" hint="A short line under your name.">
                <input id="pe-tagline" className="pe-input" value={tagline} maxLength={80} placeholder="Pixel artist, coffee addict…" onChange={(event) => setTagline(event.target.value)} />
              </Field>
              <Field label="Custom Status" htmlFor="pe-status" hint="Shows as a bubble beside your avatar.">
                <div className="pe-input-wrap">
                  <input id="pe-status" className="pe-input" value={customStatus} maxLength={100} placeholder="What's on your mind?" onChange={(event) => setCustomStatus(event.target.value)} />
                  {customStatus && (
                    <button type="button" className="pe-input-clear" onClick={() => setCustomStatus("")} aria-label="Clear status">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="pe-emoji-row">
                  {STATUS_EMOJIS.map((emoji) => (
                    <button type="button" key={emoji} onClick={() => setCustomStatus((prev) => (prev ? `${emoji} ${prev}` : `${emoji} `))}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Avatar Letters" htmlFor="pe-letters" hint="Shown when you have no picture.">
                <input id="pe-letters" className="pe-input pe-input-short" value={avatar} maxLength={2} onChange={(event) => setAvatar(event.target.value)} />
              </Field>
            </>
          )}

          {details === "about" && (
            <>
              <Field label="About Me" htmlFor="pe-bio" count={`${bio.length}/500`}>
                <textarea id="pe-bio" className="pe-input pe-textarea" rows={6} value={bio} maxLength={500} placeholder="Tell everyone a bit about yourself…" onChange={(event) => setBio(event.target.value)} />
              </Field>
              <Field label="Pride Badges" hint="Optional, up to 4. These are public, so pick only what you want to share.">
                <div className="pe-pride">
                  {PRIDE_BADGES.map((badge) => {
                    const selected = prideBadges.includes(badge.id);
                    return (
                      <button
                        type="button"
                        key={badge.id}
                        className={`pe-pride-item${selected ? " selected" : ""}`}
                        aria-pressed={selected}
                        onClick={() =>
                          setPrideBadges((current) =>
                            selected ? current.filter((id) => id !== badge.id) : current.length < 4 ? [...current, badge.id] : current,
                          )
                        }
                      >
                        <span className="pride-flag-swatch" aria-hidden="true" style={{ "--badge-stripes": badge.colors.join(", ") } as React.CSSProperties} />
                        {badge.label}
                        {selected && <Check size={13} />}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </>
          )}

          {details === "links" && (
            <>
              <Field label="Add a Connection" hint="Links show at the bottom of your profile.">
                <div className="pe-link-form">
                  <select className="pe-input" value={newPlatform} onChange={(event) => setNewPlatform(event.target.value)} aria-label="Platform">
                    {SOCIAL_PLATFORMS.map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                  <input className="pe-input" value={newUrl} placeholder="https://…" onChange={(event) => setNewUrl(event.target.value)} aria-label="Link URL" />
                  <input className="pe-input" value={newLabel} placeholder="Label (optional)" onChange={(event) => setNewLabel(event.target.value)} aria-label="Label" />
                  <button
                    type="button"
                    className="pe-btn pe-btn-primary"
                    disabled={!newUrl.trim()}
                    onClick={() => {
                      if (!newUrl.trim()) return;
                      setSocialLinks((prev) => [...prev, { platform: newPlatform, url: newUrl.trim(), label: newLabel.trim() || undefined }]);
                      setNewUrl("");
                      setNewLabel("");
                    }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </Field>
              {socialLinks.length > 0 ? (
                <ul className="pe-link-list">
                  {socialLinks.map((link, index) => (
                    <li key={index}>
                      <span className="pe-link-icon"><SocialPlatformIcon platform={link.platform} /></span>
                      <span className="pe-link-text">
                        <strong>{link.label || link.platform}</strong>
                        <span>{link.url}</span>
                      </span>
                      <button type="button" className="pe-icon-btn" onClick={() => setSocialLinks((prev) => prev.filter((_, i) => i !== index))} aria-label="Remove link">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pe-empty-note">No connections yet.</p>
              )}
            </>
          )}

          {details === "music" && (
            <>
              <p className="pe-hint">Pin a song to your profile. It shows as “Listening to” on your card.</p>
              <div className="pe-two">
                <Field label="Song" htmlFor="pe-song">
                  <input id="pe-song" className="pe-input" value={spotifySong} maxLength={60} placeholder="Resonance" onChange={(event) => setSpotifySong(event.target.value)} />
                </Field>
                <Field label="Artist" htmlFor="pe-artist">
                  <input id="pe-artist" className="pe-input" value={spotifyArtist} maxLength={60} placeholder="HOME" onChange={(event) => setSpotifyArtist(event.target.value)} />
                </Field>
              </div>
              <Field label="Album Art URL" htmlFor="pe-cover" hint="Optional.">
                <input id="pe-cover" className="pe-input" value={spotifyCover} placeholder="https://…" onChange={(event) => setSpotifyCover(event.target.value)} />
              </Field>
              {spotifySong && (
                <button
                  type="button"
                  className="pe-btn pe-btn-ghost"
                  onClick={() => {
                    setSpotifySong("");
                    setSpotifyArtist("");
                    setSpotifyCover("");
                  }}
                >
                  Clear song
                </button>
              )}
            </>
          )}

          {details === "css" && (
            <>
              <p className="pe-hint">
                {user.unrestrictedCss
                  ? "Admin: no restrictions. Your CSS is used exactly as written and can restyle the whole app while your profile is open."
                  : "CSS that only applies to your own card."}{" "}
                <button type="button" className="pe-link-btn" onClick={() => setShowProfileCssGuide(!showProfileCssGuide)}>
                  {showProfileCssGuide ? "Hide selectors" : "Show selectors"}
                </button>
              </p>
              {showProfileCssGuide && (
                <div className="pe-css-guide">
                  {[".profile-card", ".profile-banner", ".profile-avatar", ".profile-name", ".profile-bio", ".profile-badge", ".profile-tagline", ".profile-social-links"].map((selector) => (
                    <code key={selector}>{selector}</code>
                  ))}
                </div>
              )}
              <Field label="Presets">
                <div className="pe-chips">
                  {PROFILE_CSS_PRESETS.map((preset) => (
                    <button key={preset.name} type="button" className="pe-chip" title={preset.desc} onClick={() => setProfileCustomCss(preset.css)}>
                      {preset.name}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Snippets">
                <div className="pe-chips">
                  {PROFILE_CSS_SNIPPETS.map((snippet) => (
                    <button key={snippet.name} type="button" className="pe-chip" onClick={() => setProfileCustomCss((prev) => prev + snippet.snippet)}>
                      + {snippet.name}
                    </button>
                  ))}
                  {profileCustomCss && (
                    <button type="button" className="pe-chip danger" onClick={() => setProfileCustomCss("")}>
                      Clear
                    </button>
                  )}
                </div>
              </Field>
              <textarea
                className="pe-input pe-textarea pe-code"
                rows={10}
                value={profileCustomCss}
                onChange={(event) => setProfileCustomCss(event.target.value)}
                placeholder={`.profile-card {\n  border: 1px solid var(--lavender);\n}`}
                spellCheck={false}
                aria-label="Custom profile CSS"
              />
              {profileCustomCss.trim() &&
                !user.unrestrictedCss &&
                (() => {
                  const checked = checkProfileCss(profileCustomCss);
                  return checked.ok ? null : <p role="alert" className="pe-error">{checked.error}</p>;
                })()}
            </>
          )}
        </div>
      </section>

      <button type="button" className="pe-close" onClick={requestClose} aria-label="Close profile editor (Esc)">
        <X size={20} />
        <span>ESC</span>
      </button>

      {(dirty || status || error) && (
        <div key={warned} className={`pe-savebar${warned ? " warn" : ""}${!dirty ? " done" : ""}`} role="status">
          <span className="pe-savebar-text">
            {error ? error : !dirty ? status || "Saved" : warned ? "Careful — you have unsaved changes! Close again to discard." : "Careful — you have unsaved changes!"}
          </span>
          {dirty && (
            <>
              <button type="button" className="pe-btn pe-btn-link" onClick={resetProfile}>
                Reset
              </button>
              <button type="button" className="pe-btn pe-btn-save" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </>
          )}
        </div>
      )}

      {picker && <DecorationPicker kind={picker} profile={profile} cosmetics={cosmetics} onApply={applyPicker} onClose={() => setPicker(null)} />}
    </div>
  );
}

function Field({ label, htmlFor, hint, count, children }: { label: string; htmlFor?: string; hint?: string; count?: string; children: React.ReactNode }) {
  return (
    <div className="pe-field">
      <div className="pe-field-head">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {count && <small>{count}</small>}
      </div>
      {children}
      {hint && <p className="pe-field-hint">{hint}</p>}
    </div>
  );
}
