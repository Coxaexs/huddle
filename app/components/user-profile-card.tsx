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
} from "lucide-react";
import type { Member, PresenceStatus } from "@/lib/users";
import { PRESENCE } from "@/lib/users";
import { Avatar } from "./avatar";
import type { PublicRole } from "@/lib/servers";
import { PrideBadges } from "./pride-badges";
import { apiFetch } from "../lib/client";

export type FriendRelationshipStatus = "none" | "friend" | "incoming" | "outgoing";

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
}: UserProfileCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [currentFriendStatus, setCurrentFriendStatus] =
    useState<FriendRelationshipStatus>(friendStatus);
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendHover, setFriendHover] = useState(false);

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
  const statusInfo = PRESENCE[member.status || "online"];

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
        top: Math.min(position.y, window.innerHeight - 420),
        left: Math.min(position.x, window.innerWidth - 340),
        zIndex: 9999,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 9999,
      };

  return (
    <div
      ref={cardRef}
      className="user-profile-card-popover"
      style={stylePosition}
      role="dialog"
      aria-label={`${member.displayName}'s Profile`}
    >
      <div
        className="profile-card-banner"
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

      <div className="profile-card-avatar-wrap">
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

      <div className="profile-card-body">
        <div className="profile-card-header">
          <h2 className="profile-display-name">{member.displayName}</h2>
          <span className="profile-username">@{member.username}</span>
          {member.pronouns && (
            <span className="text-xs text-indigo-300 ml-2">({member.pronouns})</span>
          )}
          {member.customStatus && (
            <div className="profile-custom-status flex items-center gap-1.5"><MessageSquare size={12} /> {member.customStatus}</div>
          )}
        </div>
        <PrideBadges badges={member.prideBadges} compact />

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
          <h4>ABOUT ME</h4>
          <p className="profile-bio">
            {member.bio && member.bio.trim()
              ? member.bio
              : "No bio written yet."}
          </p>
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

          {!isSelf && onDirectMessage && !isBlocked && (
            <button
              type="button"
              className="discord-btn secondary-gray flex items-center gap-2 text-xs justify-center flex-1"
              onClick={() => {
                onDirectMessage(member.id);
                onClose();
              }}
            >
              <MessageSquare size={14} /> Send DM
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
        </div>
      </div>
    </div>
  );
}
