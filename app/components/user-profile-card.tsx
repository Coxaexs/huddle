"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  AtSign,
  ShieldAlert,
  ShieldCheck,
  Calendar,
  X,
  Music,
  UserPlus,
  UserCheck,
  UserMinus,
  Clock,
  Edit3,
  Copy,
  Globe,
} from "lucide-react";
import type { Member, PresenceStatus } from "@/lib/users";
import { PRESENCE } from "@/lib/users";
import { Avatar } from "./avatar";
import type { PublicRole } from "@/lib/servers";
import { PrideBadges } from "./pride-badges";
import { apiFetch } from "../lib/client";
import { scopeProfileCss } from "@/lib/themes";

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


interface UserProfileCardProps {
  member: Member;
  roles?: PublicRole[];
  userRoles?: string[];
  position?: { x: number; y: number } | null;
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
}

export function UserProfileCard({
  member,
  roles = [],
  userRoles = [],
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
}: UserProfileCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [currentFriendStatus, setCurrentFriendStatus] =
    useState<FriendRelationshipStatus>(friendStatus);
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendHover, setFriendHover] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

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

  const assignedRoles = roles.filter((r) => userRoles.includes(r.id));
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

  const stylePosition: React.CSSProperties = position
    ? {
        position: "fixed",
        top: Math.min(position.y, window.innerHeight - 440),
        left: Math.min(position.x, window.innerWidth - 360),
        zIndex: 9999,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 9999,
      };

  const safeScopeId = member.id.replace(/[^a-zA-Z0-9_-]/g, "_");

  const handleCopyId = () => {
    void navigator.clipboard.writeText(member.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const hasLongBio = (member.bio || "").length > 130;

  return (
    <div
      ref={cardRef}
      className={`user-profile-card-popover profile-card user-profile-scoped-${safeScopeId}`}
      data-user-profile={member.id}
      style={stylePosition}
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
      <div
        className="profile-card-banner profile-banner"
        style={{
          background: member.bannerUrl
            ? `url(${member.bannerUrl}) center/cover no-repeat`
            : `linear-gradient(135deg, ${member.color || "#5865f2"}, #1e1f22)`,
        }}
      >
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
          <span
            className="profile-presence-dot"
            style={{ background: statusInfo.color }}
            title={statusInfo.label}
          />
        </div>

        {member.customStatus && (
          <div className="profile-status-bubble" title={member.customStatus}>
            <span className="profile-status-bubble-tail" />
            <span className="profile-status-bubble-text">{member.customStatus}</span>
          </div>
        )}
      </div>

      <div className="profile-card-body">
        <div className="profile-card-header">
          <h2 className="profile-display-name">{member.displayName}</h2>
          <div className="profile-identity-sub">
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

        {member.spotifyActivity && (
          <div className="bg-green-950/40 border border-green-500/30 rounded-lg p-2.5 flex items-center gap-3 my-1">
            <div className="w-10 h-10 bg-green-900/60 rounded flex items-center justify-center text-green-400 flex-shrink-0">
              <Music size={20} className="animate-pulse" />
            </div>
            <div className="overflow-hidden text-xs">
              <div className="text-[10px] uppercase font-bold text-green-400 tracking-wider">
                LISTENING TO SPOTIFY
              </div>
              <div className="font-semibold text-white truncate">
                {member.spotifyActivity.song}
              </div>
              <div className="text-gray-400 truncate">
                by {member.spotifyActivity.artist}
              </div>
            </div>
          </div>
        )}

        <div className="profile-card-divider" />

        <div className="profile-section">
          <p className={`profile-bio ${hasLongBio && !bioExpanded ? "clamped" : ""}`}>
            {member.bio && member.bio.trim()
              ? member.bio
              : "No bio written yet."}
          </p>
          {hasLongBio && (
            <button
              type="button"
              className="profile-bio-toggle-btn"
              onClick={() => setBioExpanded(!bioExpanded)}
            >
              {bioExpanded ? "Collapse Bio" : "View Full Bio"}
            </button>
          )}
        </div>

        {assignedRoles.length > 0 && (
          <div className="profile-section">
            <h4>ROLES ({assignedRoles.length})</h4>
            <div className="profile-roles-list">
              {assignedRoles.map((role) => (
                <span
                  key={role.id}
                  className="profile-role-badge"
                  style={{ borderColor: role.color }}
                >
                  <span
                    className="role-badge-dot"
                    style={{ background: role.color }}
                  />
                  <span style={{ color: role.color }}>{role.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="profile-section flex items-center gap-2 text-xs text-gray-400 mt-2">
          <Calendar size={14} />
          <span>Member since {joinedDate}</span>
        </div>

        <div className="profile-card-actions flex flex-wrap gap-2 pt-2">
          {!isSelf && !isBlocked && (
            <>
              {currentFriendStatus === "friend" ? (
                <button
                  type="button"
                  className="discord-btn secondary-gray flex items-center gap-1.5 text-xs justify-center flex-1 text-emerald-400 hover:text-rose-400 border border-emerald-500/20 hover:border-rose-500/30 transition-colors"
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
                  title="Click to remove friend"
                >
                  {friendHover ? (
                    <>
                      <UserMinus size={14} className="text-rose-400" /> Remove Friend
                    </>
                  ) : (
                    <>
                      <UserCheck size={14} className="text-emerald-400" /> Friends
                    </>
                  )}
                </button>
              ) : currentFriendStatus === "outgoing" ? (
                <button
                  type="button"
                  className="discord-btn secondary-gray flex items-center gap-1.5 text-xs justify-center flex-1 text-indigo-300 opacity-80 cursor-default"
                  disabled
                  title="Friend request pending"
                >
                  <Clock size={14} /> Request Sent
                </button>
              ) : currentFriendStatus === "incoming" ? (
                <button
                  type="button"
                  className="discord-btn primary-indigo flex items-center gap-1.5 text-xs justify-center flex-1 !bg-emerald-600 hover:!bg-emerald-500 text-white font-semibold"
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
                  title="Accept friend request"
                >
                  <UserCheck size={14} /> {friendLoading ? "Accepting…" : "Accept Request"}
                </button>
              ) : (
                <button
                  type="button"
                  className="discord-btn primary-indigo flex items-center gap-1.5 text-xs justify-center flex-1 font-semibold"
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
                  title="Add as friend"
                >
                  <UserPlus size={14} /> {friendLoading ? "Sending…" : "Add Friend"}
                </button>
              )}
            </>
          )}

          {onDirectMessage && (!isBlocked || isSelf) && (
            <button
              type="button"
              className="discord-btn secondary-gray flex items-center gap-2 text-xs justify-center flex-1"
              onClick={() => {
                onDirectMessage(member.id);
                onClose();
              }}
            >
              <MessageSquare size={14} /> {isSelf ? "Note to Self" : "Send DM"}
            </button>
          )}
          {!isSelf && onMention && (
            <button
              type="button"
              className="discord-btn secondary-gray flex items-center gap-2 text-xs justify-center flex-1"
              onClick={() => {
                onMention(member.username);
                onClose();
              }}
            >
              <AtSign size={14} /> Mention
            </button>
          )}
          {!isSelf && (
            isBlocked ? (
              onUnblock && (
                <button
                  type="button"
                  className="discord-btn secondary-gray flex items-center gap-1.5 text-xs justify-center text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10 px-3"
                  onClick={() => {
                    onUnblock(member.id);
                  }}
                  title="Unblock this user"
                >
                  <ShieldCheck size={14} /> Unblock
                </button>
              )
            ) : (
              onBlock && (
                <button
                  type="button"
                  className="discord-btn secondary-gray flex items-center gap-1.5 text-xs justify-center text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:bg-rose-500/10 px-3"
                  onClick={() => {
                    onBlock(member.id);
                  }}
                  title="Block this user"
                >
                  <ShieldAlert size={14} /> Block
                </button>
              )
            )
          )}

          {isSelf && (
            <div className="profile-self-actions w-full flex flex-col gap-1.5">
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
                    <Edit3 size={15} className="text-gray-300" />
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

          <button
            type="button"
            className="profile-action-tile w-full"
            onClick={handleCopyId}
            title="Copy User ID to clipboard"
          >
            <div className="flex items-center gap-2.5">
              <Copy size={15} className="text-gray-300" />
              <span>{copiedId ? "Copied User ID!" : "Copy User ID"}</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
