"use client";

import { useEffect, useRef } from "react";
import { MessageSquare, AtSign, ShieldAlert, Calendar, X } from "lucide-react";
import type { Member, PresenceStatus } from "@/lib/users";
import { PRESENCE } from "@/lib/users";
import { Avatar } from "./avatar";
import type { PublicRole } from "@/lib/servers";

interface UserProfileCardProps {
  member: Member;
  roles?: PublicRole[];
  userRoles?: string[];
  position?: { x: number; y: number } | null;
  onClose: () => void;
  onDirectMessage?: (userId: string) => void;
  onMention?: (username: string) => void;
}

export function UserProfileCard({
  member,
  roles = [],
  userRoles = [],
  position,
  onClose,
  onDirectMessage,
  onMention,
}: UserProfileCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

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
        >
          <span
            className="profile-presence-dot"
            style={{ background: statusInfo.color }}
            title={statusInfo.label}
          />
        </Avatar>
      </div>

      <div className="profile-card-body">
        <div className="profile-card-header">
          <h2 className="profile-display-name">{member.displayName}</h2>
          <span className="profile-username">@{member.username}</span>
          {member.customStatus && (
            <div className="profile-custom-status">💬 {member.customStatus}</div>
          )}
        </div>

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

        <div className="profile-card-actions">
          {onDirectMessage && (
            <button
              type="button"
              className="discord-btn primary-indigo flex items-center gap-2 text-xs justify-center"
              onClick={() => {
                onDirectMessage(member.id);
                onClose();
              }}
            >
              <MessageSquare size={14} /> Send DM
            </button>
          )}
          {onMention && (
            <button
              type="button"
              className="discord-btn secondary-gray flex items-center gap-2 text-xs justify-center"
              onClick={() => {
                onMention(member.username);
                onClose();
              }}
            >
              <AtSign size={14} /> Mention
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
