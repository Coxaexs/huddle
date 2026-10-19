"use client";

import { getAchievement } from "@/lib/achievement-defs";
import { openAchievements } from "../lib/achievement-client";
import { AchievementMedal } from "./achievement-medal";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/app/lib/i18n-context";
import {
  MessageSquare,
  AtSign,
  ShieldAlert,
  ShieldCheck,
  Calendar,
  X,
  Music,
  Gamepad2,
  UserPlus,
  UserCheck,
  UserMinus,
  Clock,
  Edit3,
  Copy,
  Check,
  Globe,
  Plus,
} from "lucide-react";
import type { Member, PresenceStatus } from "@/lib/users";
import {
  PRESENCE,
  activityElapsed,
  activityLabel,
  bannerBackground,
  lastSeenLabel,
  liveActivity,
  liveSpotify,
} from "@/lib/users";
import { Avatar } from "./avatar";
import type { PublicRole, PublicServer } from "@/lib/servers";
import { PrideBadges } from "./pride-badges";
import { getMemberTagInfo } from "@/lib/permissions";
import { MemberTag } from "./member-tag";
import { apiFetch } from "../lib/client";
import { scopeProfileCss } from "@/lib/themes";
import { StyledText } from "./message-body";
import { AvatarDecoration, ProfileEffect, ProfileFrameArt } from "./cosmetics";
import { stripTextStyle } from "@/lib/text-style";
import { cardLook, useCardPointer } from "../lib/profile-look";
import { CardBackdrop, CardChrome, StyledName } from "./profile-style-parts";

const CARD_WIDTH = 300;
const CARD_GAP = 14;

export type FriendRelationshipStatus = "none" | "friend" | "incoming" | "outgoing";

export function SocialPlatformIcon({ platform }: { platform: string }) {
  const p = platform.toLowerCase().trim();
  if (p === "github") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
    );
  }
  if (p === "twitter" || p === "x") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  if (p === "discord") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.893.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    );
  }
  if (p === "youtube") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    );
  }
  if (p === "twitch") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2.149 0L.537 4.119v16.836h5.373V24h3.224l3.045-3.045h4.657l6.627-6.627V0H2.149zm19.343 13.075l-3.582 3.582H13.25l-3.045 3.045v-3.045H6.448V2.149h15.044v10.926zM17.343 5.373h-2.149v6.448h2.149V5.373zm-5.373 0H9.821v6.448h2.149V5.373z" />
      </svg>
    );
  }
  if (p === "instagram") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    );
  }
  if (p === "spotify") {
    return <Music size={14} />;
  }
  if (p === "steam") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.029 4.524 4.524s-2.03 4.524-4.524 4.524h-.105l-4.076 2.911c0 .052.005.105.005.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.723L.436 15.08C1.71 20.302 6.397 24 11.979 24c6.627 0 12-5.373 12-12s-5.373-12-12-12z" />
      </svg>
    );
  }
  return <Globe size={14} />;
}


interface Mutuals {
  servers: Array<{ id: string; name: string; icon: string; iconUrl: string | null; color: string }>;
  friends: Array<{
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    avatarUrl: string | null;
    color: string;
  }>;
}

interface UserProfileCardProps {
  member: Member;
  server?: PublicServer | null;
  roles?: PublicRole[];
  userRoles?: string[];
  /** The clicked element: x/y is its top-left, right/bottom its far corner (or just the click point). */
  position?: { x: number; y: number; right?: number; bottom?: number } | null;
  onClose: () => void;
  onDirectMessage?: (userId: string) => void;
  onMention?: (username: string) => void;
  isSelf?: boolean;
  isBlocked?: boolean;
  onBlock?: (userId: string) => void;
  onUnblock?: (userId: string) => void;
  friendStatus?: FriendRelationshipStatus;
  onAddFriend?: (userId: string, username?: string) => void | Promise<void>;
  onRemoveFriend?: (userId: string) => void | Promise<void>;
  onAcceptFriend?: (userId: string) => void | Promise<void>;
  onEditProfile?: () => void;
  /** Live presence (from the socket), overriding the member's saved status. */
  presence?: PresenceStatus | "offline";
  /** Give or take a role; only passed when the viewer may manage roles. */
  onToggleRole?: (roleId: string, add: boolean) => Promise<void>;
}

export function UserProfileCard({
  member,
  server = null,
  roles = [],
  userRoles: initialUserRoles = [],
  position,
  onClose,
  onDirectMessage,
  onMention,
  isSelf = false,
  isBlocked = false,
  onBlock,
  onUnblock,
  friendStatus = "none",
  onAddFriend,
  onRemoveFriend,
  onAcceptFriend,
  onEditProfile,
  presence,
  onToggleRole,
}: UserProfileCardProps) {
  const { t } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const look = cardLook(member.profileStyle, member.color);
  useCardPointer(hostRef, member.profileStyle?.motion || (look.themed ? "tilt" : "still"));
  const [currentFriendStatus, setCurrentFriendStatus] =
    useState<FriendRelationshipStatus>(friendStatus);
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendHover, setFriendHover] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [mutuals, setMutuals] = useState<Mutuals | null>(null);
  /** Your private note about this person; `null` until it has loaded. */
  const [note, setNote] = useState<string | null>(null);
  const savedNoteRef = useRef("");
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    savedNoteRef.current = "";
    apiFetch<{ note: string }>(`/api/users/${encodeURIComponent(member.id)}/note`)
      .then((data) => {
        if (cancelled) return;
        savedNoteRef.current = data.note;
        setNote(data.note);
      })
      .catch(() => {
        if (!cancelled) setNote("");
      });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  async function saveNote() {
    if (note === null || note.trim() === savedNoteRef.current) return;
    setNoteStatus("saving");
    try {
      const data = await apiFetch<{ note: string }>(
        `/api/users/${encodeURIComponent(member.id)}/note`,
        { method: "PUT", body: JSON.stringify({ note }) },
      );
      savedNoteRef.current = data.note;
      setNoteStatus("idle");
    } catch {
      setNoteStatus("error");
    }
  }

  useEffect(() => {
    if (isSelf) return;
    let cancelled = false;
    setMutuals(null);
    apiFetch<Mutuals>(`/api/users/${encodeURIComponent(member.id)}/mutuals`)
      .then((data) => {
        if (!cancelled) setMutuals(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [member.id, isSelf]);

  useEffect(() => {
    setCurrentFriendStatus(friendStatus);
  }, [friendStatus]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  // Kept locally so a role given or taken here shows at once.
  const [userRoles, setUserRoles] = useState<string[]>(initialUserRoles);
  const initialRolesKey = initialUserRoles.join(",");
  useEffect(() => {
    setUserRoles(initialRolesKey ? initialRolesKey.split(",") : []);
  }, [initialRolesKey]);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  async function toggleRole(roleId: string, add: boolean) {
    if (!onToggleRole) return;
    const before = userRoles;
    setRoleError(null);
    setUserRoles(add ? [...before, roleId] : before.filter((id) => id !== roleId));
    try {
      await onToggleRole(roleId, add);
    } catch (error) {
      setUserRoles(before);
      setRoleError(error instanceof Error ? error.message : "Could not change roles.");
    }
  }

  const assignedRoles = roles.filter((r) => userRoles.includes(r.id));
  const givableRoles = roles.filter((r) => !userRoles.includes(r.id));
  const statusInfo =
    presence === "offline"
      ? { label: "Offline", color: PRESENCE.invisible.color }
      : PRESENCE[presence || member.status || "online"];

  // Format created date
  const joinedDate = member.createdAt
    ? new Date(member.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Jun 2026";

  // The card's real height (it grows with roles, mutuals and the note), so it
  // can be kept fully on screen instead of assuming a fixed size.
  const [cardHeight, setCardHeight] = useState(380);
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => setCardHeight(card.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  // Opens beside the clicked element, like Discord: on whichever side has
  // room (left for the member list, right for message avatars), lined up with
  // its top, and clamped so no part of the card leaves the window.
  const cardWidth = Math.min(CARD_WIDTH, window.innerWidth - 24);
  const framed = Boolean(member.profileFrame && member.profileFrame !== "none");
  let stylePosition: React.CSSProperties;
  if (position) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const right = position.right ?? position.x;
    const roomLeft = position.x - CARD_GAP - 12;
    const roomRight = vw - right - CARD_GAP - 12;
    const placeLeft = roomLeft >= cardWidth || (roomRight < cardWidth && roomLeft > roomRight);
    const rawLeft = placeLeft ? position.x - CARD_GAP - cardWidth : right + CARD_GAP;
    stylePosition = {
      position: "fixed",
      // Frames draw art above and below the card, so leave room for it.
      top: Math.max(framed ? 64 : 12, Math.min(position.y, vh - cardHeight - (framed ? 40 : 12))),
      left: Math.max(12, Math.min(rawLeft, vw - cardWidth - 12)),
      zIndex: 9999,
    };
  } else {
    stylePosition = {
      position: "fixed",
      top: "50%",
      left: "50%",
      // `translate`, not `transform`: the card's tilt and entrance use transform.
      translate: "-50% -50%",
      zIndex: 9999,
    };
  }

  const safeScopeId = member.id.replace(/[^a-zA-Z0-9_-]/g, "_");

  const handleCopyId = () => {
    void navigator.clipboard.writeText(member.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const hasLongBio = (member.bio || "").length > 130;

  return (
    <div ref={hostRef} className={`pframe-host profile-popover-host ${look.host}`} style={{ ...stylePosition, ...look.style }}>
    <div
      ref={cardRef}
      className={`user-profile-card-popover profile-card user-profile-scoped-${safeScopeId}${member.profileFrame && member.profileFrame !== "none" ? ` profile-frame-${member.profileFrame}` : ""}${look.card ? ` ${look.card}` : ""}`}
      data-user-profile={member.id}
      data-has-custom-css={Boolean(member.customCss && member.customCss.trim())}
      style={{
        position: "relative",
        ...(member.color ? { ["--profile-accent" as string]: member.color } : null),
      }}
      role="dialog"
      aria-label={`${member.displayName}'s Profile`}
    >
      {member.customCss && (
        <style
          dangerouslySetInnerHTML={{
            __html: scopeProfileCss(member.customCss, member.id),
          }}
        />
      )}
      <CardBackdrop themed={look.themed} />
      <ProfileEffect id={member.profileEffect} />
      <div
        className="profile-card-banner profile-banner"
        style={{
          background: bannerBackground(
            member.bannerUrl,
            `linear-gradient(135deg, ${member.color || "#5865f2"}, #1e1f22)`,
          ),
        }}
      >
        <button
          type="button"
          className="profile-card-close profile-card-copy"
          onClick={handleCopyId}
          aria-label="Copy user ID"
          title={copiedId ? "Copied!" : "Copy User ID"}
        >
          {copiedId ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button
          type="button"
          className="profile-card-close"
          onClick={onClose}
          aria-label="Close profile"
        >
          <X size={16} />
        </button>
      </div>

      <div className="profile-card-avatar-row">
        <div className={`profile-card-avatar-wrap avatar-frame-${member.avatarFrame || "none"}`}>
          <Avatar
            className="profile-card-avatar"
            avatar={member.avatar}
            avatarUrl={member.avatarUrl}
            color={member.color}
          />
          <AvatarDecoration id={member.avatarFrame} />
          <span
            className="profile-presence-dot"
            style={{ background: statusInfo.color }}
            title={statusInfo.label}
          />
        </div>

        {member.customStatus && (
          <div className="profile-status-bubble" title={stripTextStyle(member.customStatus)}>
            <span className="profile-status-bubble-tail" />
            <span className="profile-status-bubble-text"><StyledText text={member.customStatus} /></span>
          </div>
        )}
      </div>

      <div className="profile-card-body">
        <div className="profile-card-header">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="profile-display-name"><StyledName name={member.displayName} style={member.profileStyle} live /></h2>
            {server && <MemberTag tag={getMemberTagInfo(member, server)} />}
          </div>
          <div className="profile-identity-sub">
            {member.nickname && member.globalName && member.globalName !== member.nickname && (
              <span className="profile-global-name" title="Account display name">
                {member.globalName} ·
              </span>
            )}
            <span className="profile-username">@{member.username}</span>
            {member.pronouns && (
              <span className="profile-pronouns-tag">• {member.pronouns}</span>
            )}
            {member.prideBadges && member.prideBadges.length > 0 && (
              <span className="profile-inline-pride">
                <PrideBadges badges={member.prideBadges.slice(0, 1)} compact />
              </span>
            )}
          </div>
          {member.tagline && (
            <p className="profile-tagline" title={member.tagline}>
              {member.tagline}
            </p>
          )}
        </div>

        {/* Badges Shelf (Only rendered when user actually has badges) */}
        {Boolean(member.isAdmin || (member.prideBadges && member.prideBadges.length > 0)) && (
          <div className="profile-badges-shelf">
            {member.isAdmin && (
              <span className="profile-badge-item badge-owner" title="Server Owner / Admin">
                🛡️ Owner
              </span>
            )}
            {member.prideBadges && member.prideBadges.length > 0 && (
              <PrideBadges badges={member.prideBadges} compact />
            )}
          </div>
        )}

        {member.achievementShowcase && member.achievementShowcase.length > 0 && (
          <div className="profile-achievements-shelf">
            <div className="profile-achievements-head">
              <span>Achievements</span>
              <button
                type="button"
                onClick={() => openAchievements({ userId: member.id, name: member.displayName })}
              >
                See all
              </button>
            </div>
            <div className="profile-achievements-row">
              {member.achievementShowcase.map((id) => {
                const def = getAchievement(id);
                if (!def) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className="profile-achievement"
                    title={`${def.label}: ${def.description}`}
                    onClick={() => openAchievements({ userId: member.id, name: member.displayName })}
                  >
                    <AchievementMedal def={def} size={34} />
                    <span>{def.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Social Links Shelf */}
        {Boolean(member.socialLinks && member.socialLinks.length > 0) && (
          <div className="profile-social-links">
            {member.socialLinks!.map((link, idx) => (
              <a
                key={idx}
                href={link.url.startsWith("http") ? link.url : `https://${link.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="profile-social-link-pill"
                title={`${link.label || link.platform}: ${link.url}`}
              >
                <SocialPlatformIcon platform={link.platform} />
                <span>{link.label || link.platform}</span>
              </a>
            ))}
          </div>
        )}

        {(() => {
          const song = liveSpotify(member.spotifyActivity);
          if (!song) return null;
          const body = (
            <>
              <div className="w-10 h-10 bg-green-900/60 rounded flex items-center justify-center text-green-400 flex-shrink-0 overflow-hidden">
                {song.albumArt ? (
                  <img src={song.albumArt} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music size={20} className="animate-pulse" />
                )}
              </div>
              <div className="overflow-hidden text-xs">
                <div className="text-[10px] uppercase font-bold text-green-400 tracking-wider">
                  {t("profile.spotifyListening")}
                </div>
                <div className="font-semibold text-white truncate">{song.song}</div>
                <div className="text-gray-400 truncate">{t("profile.byArtist", { artist: song.artist })}</div>
              </div>
            </>
          );
          const cls = "bg-green-950/40 border border-green-500/30 rounded-lg p-2.5 flex items-center gap-3 my-1";
          return song.url ? (
            <a href={song.url} target="_blank" rel="noopener noreferrer" className={`${cls} no-underline`}>
              {body}
            </a>
          ) : (
            <div className={cls}>{body}</div>
          );
        })()}

        {(() => {
          const activity = liveActivity(member.activity);
          if (!activity) return null;
          const elapsed = activityElapsed(activity, undefined, t);
          return (
            <div className="bg-indigo-950/40 border border-indigo-400/30 rounded-lg p-2.5 flex items-center gap-3 my-1">
              <div className="w-10 h-10 bg-indigo-900/60 rounded flex items-center justify-center text-indigo-300 flex-shrink-0">
                <Gamepad2 size={20} />
              </div>
              <div className="overflow-hidden text-xs">
                <div className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider">
                  {activity.kind === "playing" ? t("profile.playing") : activity.kind === "coding" ? t("profile.coding") : activity.kind === "streaming" ? t("profile.streaming") : t("profile.activeIn")}
                </div>
                <div className="font-semibold text-white truncate">{activity.name}</div>
                {(activity.details || elapsed) && (
                  <div className="text-gray-400 truncate">
                    {[activity.details, elapsed].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        <div className="profile-card-panel">
        <div className="profile-section">
          <p className={`profile-bio ${hasLongBio && !bioExpanded ? "clamped" : ""}`}>
            {member.bio && member.bio.trim()
              ? member.bio
              : t("profile.noBio")}
          </p>
          {hasLongBio && (
            <button
              type="button"
              className="profile-bio-toggle-btn"
              onClick={() => setBioExpanded(!bioExpanded)}
            >
              {bioExpanded ? t("profile.collapseBio") : t("profile.viewFullBio")}
            </button>
          )}
        </div>

        {(assignedRoles.length > 0 || (onToggleRole && roles.length > 0)) && (
          <div className="profile-section">
            <h4>{assignedRoles.length ? `ROLES (${assignedRoles.length})` : "ROLES"}</h4>
            <div className="profile-roles-list">
              {assignedRoles.map((role) => (
                <span
                  key={role.id}
                  className={`profile-role-badge ${onToggleRole ? "is-removable" : ""}`}
                  style={{ borderColor: role.color }}
                >
                  {onToggleRole ? (
                    <button
                      type="button"
                      className="role-badge-remove"
                      style={{ ["--role-color" as string]: role.color }}
                      aria-label={t("profile.removeRole", { name: role.name })}
                      title={t("profile.removeRole", { name: role.name })}
                      onClick={() => void toggleRole(role.id, false)}
                    >
                      <X size={10} strokeWidth={3} />
                    </button>
                  ) : (
                    <span
                      className="role-badge-dot"
                      style={{ background: role.color }}
                    />
                  )}
                  <span style={{ color: role.color }}>{role.name}</span>
                </span>
              ))}
              {onToggleRole && givableRoles.length > 0 && (
                <span className="profile-role-add-wrap">
                  <button
                    type="button"
                    className="profile-role-add"
                    aria-label={t("profile.addRole")}
                    title={t("profile.addRole")}
                    aria-expanded={rolePickerOpen}
                    onClick={() => setRolePickerOpen((open) => !open)}
                  >
                    <Plus size={12} strokeWidth={3} />
                  </button>
                  {rolePickerOpen && (
                    <div className="profile-role-picker" role="menu">
                      {givableRoles.map((role) => (
                        <button
                          key={role.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setRolePickerOpen(false);
                            void toggleRole(role.id, true);
                          }}
                        >
                          <span
                            className="role-badge-dot"
                            style={{ background: role.color }}
                          />
                          <span>{role.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </span>
              )}
            </div>
            {roleError && <p className="profile-note-status is-error">{roleError}</p>}
          </div>
        )}

        {mutuals && mutuals.servers.length > 0 && (
          <div className="profile-section">
            <h4>MUTUAL SERVERS ({mutuals.servers.length})</h4>
            <div className="profile-mutual-list">
              {mutuals.servers.map((server) => (
                <span key={server.id} className="profile-mutual-chip" title={server.name}>
                  <span className="profile-mutual-icon" style={{ background: server.color }}>
                    {server.iconUrl ? <img src={server.iconUrl} alt="" /> : server.icon}
                  </span>
                  <span className="profile-mutual-name">{server.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {mutuals && mutuals.friends.length > 0 && (
          <div className="profile-section">
            <h4>MUTUAL FRIENDS ({mutuals.friends.length})</h4>
            <div className="profile-mutual-list">
              {mutuals.friends.map((friend) => (
                <span
                  key={friend.id}
                  className="profile-mutual-chip"
                  title={`${friend.displayName} (@${friend.username})`}
                >
                  <Avatar
                    avatar={friend.avatar}
                    avatarUrl={friend.avatarUrl}
                    color={friend.color}
                    size={18}
                  />
                  <span className="profile-mutual-name">{friend.displayName}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="profile-section profile-note">
          <h4>
            {t("profile.note")}
            {noteStatus === "saving" && <span className="profile-note-status"> · {t("profile.saving")}</span>}
            {noteStatus === "error" && (
              <span className="profile-note-status is-error"> · {t("profile.couldntSave")}</span>
            )}
          </h4>
          <textarea
            className="profile-note-input"
            placeholder={note === null ? t("common.loading") : t("profile.addNotePlaceholder")}
            aria-label={t("profile.privateNoteAria", { name: member.displayName })}
            title={t("profile.privateNoteTitle")}
            maxLength={256}
            rows={1}
            disabled={note === null}
            value={note ?? ""}
            onChange={(event) => {
              setNote(event.target.value);
              // Grow with the text instead of scrolling inside a one-line box.
              event.target.style.height = "auto";
              event.target.style.height = `${event.target.scrollHeight}px`;
            }}
            onBlur={() => void saveNote()}
            onKeyDown={(event) => {
              // Enter saves, like Discord; Shift+Enter adds a line.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.blur();
              }
              // Escape should leave the note, not close the whole card.
              if (event.key === "Escape") event.stopPropagation();
            }}
          />
        </div>

        <div className="profile-section profile-since">
          <Calendar size={13} className="shrink-0" />
          <span>{t("profile.memberSince", { date: joinedDate })}</span>
          {!isSelf && presence === "offline" && lastSeenLabel(member.lastSeenAt, undefined, t) && (
            <span>· {lastSeenLabel(member.lastSeenAt, undefined, t)}</span>
          )}
        </div>
        </div>

        <div className="profile-card-actions flex flex-wrap gap-2 pt-2">
          {!isSelf && !isBlocked && (
            <>
              {currentFriendStatus === "friend" ? (
                <button
                  type="button"
                  className="discord-btn secondary-gray flex items-center gap-1.5 text-xs justify-center flex-1 h-8 min-h-[32px] whitespace-nowrap text-emerald-400 hover:text-rose-400 border border-emerald-500/20 hover:border-rose-500/30 transition-colors"
                  disabled={friendLoading}
                  onMouseEnter={() => setFriendHover(true)}
                  onMouseLeave={() => setFriendHover(false)}
                  onClick={async () => {
                    setFriendLoading(true);
                    try {
                      if (onRemoveFriend) {
                        await onRemoveFriend(member.id);
                      } else {
                        await apiFetch(`/api/friends?id=${encodeURIComponent(member.id)}`, {
                          method: "DELETE",
                        });
                      }
                      setCurrentFriendStatus("none");
                    } catch (err) {
                      console.error("Failed to remove friend:", err);
                    } finally {
                      setFriendLoading(false);
                    }
                  }}
                  title={t("profile.removeFriend")}
                >
                  {friendHover ? (
                    <>
                      <UserMinus size={14} className="text-rose-400 shrink-0" /> {t("profile.removeFriend")}
                    </>
                  ) : (
                    <>
                      <UserCheck size={14} className="text-emerald-400 shrink-0" /> {t("sidebar.friends")}
                    </>
                  )}
                </button>
              ) : currentFriendStatus === "outgoing" ? (
                <button
                  type="button"
                  className="discord-btn secondary-gray flex items-center gap-1.5 text-xs justify-center flex-1 h-8 min-h-[32px] whitespace-nowrap text-[var(--lavender,#818cf8)] opacity-90 cursor-default"
                  disabled
                  title={t("friends.outgoingRequest")}
                >
                  <Clock size={14} className="shrink-0" /> {t("friends.outgoingRequest")}
                </button>
              ) : currentFriendStatus === "incoming" ? (
                <button
                  type="button"
                  className="discord-btn primary-indigo flex items-center gap-1.5 text-xs justify-center flex-1 h-8 min-h-[32px] whitespace-nowrap !bg-emerald-600 hover:!bg-emerald-500 text-white font-semibold"
                  disabled={friendLoading}
                  onClick={async () => {
                    setFriendLoading(true);
                    try {
                      if (onAcceptFriend) {
                        await onAcceptFriend(member.id);
                      } else {
                        await apiFetch("/api/friends/accept", {
                          method: "POST",
                          body: JSON.stringify({ requesterId: member.id }),
                        });
                      }
                      setCurrentFriendStatus("friend");
                    } catch (err) {
                      console.error("Failed to accept friend request:", err);
                    } finally {
                      setFriendLoading(false);
                    }
                  }}
                  title={t("profile.acceptRequest")}
                >
                  <UserCheck size={14} className="shrink-0" /> {friendLoading ? t("friends.sending") : t("profile.acceptRequest")}
                </button>
              ) : (
                <button
                  type="button"
                  className="discord-btn primary-indigo flex items-center gap-1.5 text-xs justify-center flex-1 h-8 min-h-[32px] whitespace-nowrap font-semibold"
                  disabled={friendLoading}
                  onClick={async () => {
                    setFriendLoading(true);
                    try {
                      if (onAddFriend) {
                        await onAddFriend(member.id, member.username);
                      } else {
                        await apiFetch("/api/friends", {
                          method: "POST",
                          body: JSON.stringify({ userId: member.id, username: member.username }),
                        });
                      }
                      setCurrentFriendStatus("outgoing");
                    } catch (err) {
                      console.error("Failed to send friend request:", err);
                    } finally {
                      setFriendLoading(false);
                    }
                  }}
                  title={t("friends.tab.add")}
                >
                  <UserPlus size={14} className="shrink-0" /> {friendLoading ? t("friends.sending") : t("profile.sendFriendRequest")}
                </button>
              )}
            </>
          )}

          {onDirectMessage && (!isBlocked || isSelf) && (
            <button
              type="button"
              className="discord-btn secondary-gray flex items-center gap-2 text-xs justify-center flex-1 h-8 min-h-[32px] whitespace-nowrap"
              onClick={() => {
                onDirectMessage(member.id);
                onClose();
              }}
            >
              <MessageSquare size={14} className="shrink-0" /> {isSelf ? "Note to Self" : "Send DM"}
            </button>
          )}
          {!isSelf && onMention && (
            <button
              type="button"
              className="discord-btn secondary-gray flex items-center gap-2 text-xs justify-center flex-1 h-8 min-h-[32px] whitespace-nowrap"
              onClick={() => {
                onMention(member.username);
                onClose();
              }}
            >
              <AtSign size={14} className="shrink-0" /> Mention
            </button>
          )}
          {!isSelf && (
            isBlocked ? (
              onUnblock && (
                <button
                  type="button"
                  className="discord-btn secondary-gray flex items-center gap-1.5 text-xs justify-center flex-1 h-8 min-h-[32px] whitespace-nowrap text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10 px-3"
                  onClick={() => {
                    onUnblock(member.id);
                  }}
                  title="Unblock this user"
                >
                  <ShieldCheck size={14} className="shrink-0" /> Unblock
                </button>
              )
            ) : (
              onBlock && (
                <button
                  type="button"
                  className="discord-btn secondary-gray flex items-center gap-1.5 text-xs justify-center flex-1 h-8 min-h-[32px] whitespace-nowrap text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:bg-rose-500/10 px-3"
                  onClick={() => {
                    onBlock(member.id);
                  }}
                  title="Block this user"
                >
                  <ShieldAlert size={14} className="shrink-0" /> Block
                </button>
              )
            )
          )}

          {isSelf && (
            <div className="profile-self-actions w-full flex gap-1.5">
              {onEditProfile && (
                <button
                  type="button"
                  className="profile-action-tile"
                  onClick={() => {
                    onEditProfile();
                    onClose();
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <Edit3 size={15} className="text-[var(--muted)]" />
                    <span>Edit Profile</span>
                  </div>
                </button>
              )}
              <div className="profile-action-tile">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: statusInfo.color }}
                  />
                  <span>{statusInfo.label}</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
    <ProfileFrameArt id={member.profileFrame} />
    <CardChrome themed={look.themed} />
    </div>
  );
}
