"use client";

import { Calendar, MessageCircle, MoreHorizontal, Music, UserPlus } from "lucide-react";
import { Avatar } from "../avatar";
import { AvatarDecoration, ProfileEffect, ProfileFrameArt } from "../cosmetics";
import { PrideBadges } from "../pride-badges";
import { SocialPlatformIcon } from "../user-profile-card";
import { scopeProfileCss } from "@/lib/themes";
import type { PrideBadgeId, ProfileStyle, SocialLink } from "@/lib/users";
import { useRef } from "react";
import { cardThemeProps, nameStyleProps, useCardTilt } from "../../lib/profile-style";

export interface Cosmetics {
  avatarFrame: string;
  profileEffect: string;
  nameplate: string;
  profileFrame: string;
}

export interface PreviewProfile {
  displayName: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  bannerBackground: string;
  pronouns?: string;
  tagline?: string;
  customStatus?: string;
  bio?: string;
  prideBadges?: PrideBadgeId[];
  socialLinks?: SocialLink[];
  isAdmin?: boolean;
  /** Instance admin: the custom CSS is used as written (see scopeProfileCss). */
  unrestrictedCss?: boolean;
  createdAt?: string;
  song?: { title: string; artist: string; cover?: string } | null;
  profileStyle?: ProfileStyle;
}

/** The CSS background for a banner value: an image URL, a gradient, or the profile color. */
export function bannerBackground(bannerUrl: string | null, color: string) {
  if (!bannerUrl) return `linear-gradient(135deg, ${color || "#5865f2"}, color-mix(in srgb, ${color || "#5865f2"} 30%, #111214))`;
  return bannerUrl.startsWith("http") || bannerUrl.startsWith("/") || bannerUrl.startsWith("data:")
    ? `url("${bannerUrl}") center/cover no-repeat`
    : bannerUrl;
}

/**
 * A profile card as other people see it, used for the editor's live preview
 * ("lg") and inside the decoration pickers ("md").
 */
export function ProfilePreviewCard({
  profile,
  cosmetics,
  size = "md",
  customCss,
  bioLines,
}: {
  profile: PreviewProfile;
  cosmetics: Cosmetics;
  size?: "md" | "lg";
  customCss?: string;
  /** Clamp the bio to this many lines (the pickers show a short card). */
  bioLines?: number;
}) {
  const lg = size === "lg";
  const since = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const frame = cosmetics.profileFrame !== "none" ? ` profile-frame-${cosmetics.profileFrame}` : "";
  const theme = cardThemeProps(profile.profileStyle);
  const hostRef = useRef<HTMLDivElement>(null);
  useCardTilt(hostRef, lg ? profile.profileStyle?.cardMotion : "still");
  return (
    <div ref={hostRef} className={`pframe-host pv-host-${size}${lg ? ` ${theme.className.split(" ")[0]}` : ""}`}>
    {lg && <span className="pcard-glare" aria-hidden="true" />}
    <div
      className={`pv-card pv-${size} profile-card user-profile-scoped-live_preview${frame}${profile.profileStyle?.themeColors ? " pcard-themed" : ""}`}
      style={{ "--pv-accent": profile.color || "#5865f2", ...theme.style } as React.CSSProperties}
      data-has-custom-css={Boolean(customCss?.trim())}
    >
      {customCss?.trim() && <style dangerouslySetInnerHTML={{ __html: scopeProfileCss(customCss, "live_preview", profile.unrestrictedCss) }} />}
      <div className="pv-banner profile-banner" style={{ background: profile.bannerBackground }} />
      <div className="pv-head">
        <div className={`pv-avatar-wrap avatar-frame-${cosmetics.avatarFrame}`}>
          <Avatar className="pv-avatar profile-avatar" avatar={profile.avatar} avatarUrl={profile.avatarUrl} color={profile.color} />
          <AvatarDecoration id={cosmetics.avatarFrame} />
          <span className="pv-presence" />
        </div>
        {profile.customStatus?.trim() && (
          <div className="pv-bubble" title={profile.customStatus}>
            <span>{profile.customStatus}</span>
          </div>
        )}
      </div>
      <div className="pv-body">
        <h2 className="pv-name profile-name"><span {...nameStyleProps(profile.profileStyle, profile.displayName || profile.username)}>{profile.displayName || profile.username}</span></h2>
        <div className="pv-sub">
          <span className="profile-username">{profile.username}</span>
          {profile.pronouns && (
            <>
              <span className="pv-dot" aria-hidden="true">•</span>
              <span>{profile.pronouns}</span>
            </>
          )}
          {profile.prideBadges && profile.prideBadges.length > 0 && (
            <span className="pv-pride profile-badge">
              <PrideBadges badges={profile.prideBadges.slice(0, 1)} compact />
            </span>
          )}
        </div>
        {profile.tagline && <p className="pv-tagline profile-tagline">{profile.tagline}</p>}
        {(profile.isAdmin || (profile.prideBadges && profile.prideBadges.length > 1)) && (
          <div className="pv-badges">
            {profile.isAdmin && <span className="pv-badge" title="Server owner">🛡️</span>}
            {profile.prideBadges && profile.prideBadges.length > 1 && <PrideBadges badges={profile.prideBadges.slice(1)} compact />}
          </div>
        )}

        {lg ? (
          <div className="pv-actions" aria-hidden="true">
            <span className="pv-btn pv-btn-primary"><MessageCircle size={16} /> Message</span>
            <span className="pv-btn pv-btn-icon"><UserPlus size={16} /></span>
            <span className="pv-btn pv-btn-icon"><MoreHorizontal size={16} /></span>
          </div>
        ) : null}

        {profile.song && (
          <div className="pv-song">
            <span className="pv-song-art">
              {profile.song.cover ? <img src={profile.song.cover} alt="" /> : <Music size={18} />}
            </span>
            <span className="pv-song-text">
              <small>Listening to</small>
              <strong>{profile.song.title}</strong>
              <span>{profile.song.artist}</span>
            </span>
          </div>
        )}

        <div className="pv-section">
          {lg && <h3>About Me</h3>}
          <p
            className="pv-bio profile-bio"
            style={bioLines ? ({ WebkitLineClamp: bioLines, display: "-webkit-box", WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties) : undefined}
          >
            {profile.bio?.trim() || (lg ? "Nothing here yet. Write something in About." : "No bio yet.")}
          </p>
        </div>

        {lg && since && (
          <div className="pv-section">
            <h3>Member Since</h3>
            <p className="pv-since"><Calendar size={14} /> {since}</p>
          </div>
        )}

        {lg && profile.socialLinks && profile.socialLinks.length > 0 && (
          <div className="pv-section">
            <h3>Connections</h3>
            <ul className="pv-links profile-social-links">
              {profile.socialLinks.map((link, index) => (
                <li key={index}>
                  <span className="pv-link-icon"><SocialPlatformIcon platform={link.platform} /></span>
                  <span>{link.label || link.platform}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!lg && <span className="pv-example-btn">Example Button</span>}
      </div>
      <ProfileEffect id={cosmetics.profileEffect} />
    </div>
    <ProfileFrameArt id={cosmetics.profileFrame} />
    </div>
  );
}
