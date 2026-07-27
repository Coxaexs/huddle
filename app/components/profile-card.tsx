"use client";

import { useEffect } from "react";
import type { PublicRole } from "@/lib/servers";
import type { Member } from "@/lib/users";
import { Avatar } from "./avatar";

interface ProfileCardProps {
  member: Member;
  online: boolean;
  /** Roles the member holds on the active server, highest first. */
  roles: PublicRole[];
  isSelf: boolean;
  onMessage: () => void;
  onClose: () => void;
}

function memberSince(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** A Discord-style profile: avatar, name, status, roles, and a message button. */
export function ProfileCard({
  member,
  online,
  roles,
  isSelf,
  onMessage,
  onClose,
}: ProfileCardProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nameColor = roles[0]?.color;
  const since = memberSince(member.createdAt);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="profile-card" onClick={(event) => event.stopPropagation()}>
        <div className="profile-banner" style={{ background: nameColor || undefined }} />
        <button
          type="button"
          className="profile-close"
          onClick={onClose}
          aria-label="Close profile"
        >
          ×
        </button>

        <Avatar
          className="profile-avatar"
          avatar={member.avatar}
          avatarUrl={member.avatarUrl}
          color={member.color}
        />

        <div className="profile-body">
          <div className="profile-name">
            <strong style={{ color: nameColor || undefined }}>
              {member.displayName}
            </strong>
            {member.isAdmin && <span className="profile-badge owner">OWNER</span>}
            <span className={`profile-status ${online ? "online" : ""}`}>
              {online ? "Online" : "Offline"}
            </span>
          </div>
          <div className="profile-handle">@{member.username}</div>
          {member.customStatus && (
            <div className="profile-custom-status">{member.customStatus}</div>
          )}

          {roles.length > 0 && (
            <div className="profile-section">
              <span className="profile-label">Roles</span>
              <div className="profile-roles">
                {roles.map((role) => (
                  <span
                    key={role.id}
                    className="profile-role"
                    style={{
                      borderColor: role.color,
                      color: role.color,
                    }}
                  >
                    <span
                      className="profile-role-dot"
                      style={{ background: role.color }}
                    />
                    {role.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {since && (
            <div className="profile-section">
              <span className="profile-label">Member since</span>
              <div>{since}</div>
            </div>
          )}

          {!isSelf && (
            <button type="button" className="profile-message" onClick={onMessage}>
              Message
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
