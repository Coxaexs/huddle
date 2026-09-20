"use client";

import { useState } from "react";
import { Check, Users, Sparkles } from "lucide-react";

export interface ResolvedInvite {
  valid: boolean;
  code: string;
  error?: string;
  server?: {
    id: string;
    name: string;
    icon: string;
    color: string;
    bannerUrl?: string | null;
    memberCount: number;
    onlineCount: number;
  } | null;
  inviter?: {
    displayName: string;
    username: string;
    avatar: string;
  } | null;
  isMember?: boolean;
}

interface ServerInviteCardProps {
  invite: ResolvedInvite;
  isMember?: boolean;
  onJoin?: (code?: string, serverId?: string) => Promise<void> | void;
  onSelectServer?: (serverId: string) => void;
}

export function ServerInviteCard({
  invite,
  isMember: isMemberProp,
  onJoin,
  onSelectServer,
}: ServerInviteCardProps) {
  const isMember = isMemberProp !== undefined ? isMemberProp : Boolean(invite.isMember);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(isMember);

  if (!invite.valid || !invite.server) {
    return (
      <div className="server-invite-card invalid">
        <div className="server-invite-content">
          <div className="server-invite-invalid-inner">
            <span className="server-invite-invalid-icon">⚠️</span>
            <div>
              <strong>Invalid Invite</strong>
              <div style={{ fontSize: "11px", color: "var(--text-muted, #949ba4)" }}>
                {invite.error || "This invite may be expired or invalid."}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { server, inviter } = invite;

  const handleAction = async () => {
    if (joined || isMember) {
      if (onSelectServer && server) {
        onSelectServer(server.id);
      } else if (onJoin) {
        await onJoin(invite.code, server.id);
      }
      return;
    }
    setJoining(true);
    try {
      if (onJoin) await onJoin(invite.code, server.id);
      setJoined(true);
    } catch {
      // Handled in parent
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="server-invite-card">
      {/* Optional Server Banner */}
      {server.bannerUrl ? (
        <div
          className="server-invite-banner has-image"
          style={{ backgroundImage: `url(${server.bannerUrl})` }}
        />
      ) : (
        <div
          className="server-invite-banner"
          style={{
            background: `linear-gradient(135deg, ${server.color || "#5865F2"}44, ${server.color || "#5865F2"}11)`,
          }}
        />
      )}

      <div className="server-invite-header">
        <span className="server-invite-eyebrow">
          {inviter
            ? `${inviter.displayName} invited you to join`
            : "YOU'VE BEEN INVITED TO JOIN A SERVER"}
        </span>
      </div>

      <div className="server-invite-body">
        <div
          className="server-invite-icon"
          style={{ backgroundColor: server.color || "#5865F2" }}
        >
          {server.icon?.length <= 4 ? server.icon : server.name.charAt(0).toUpperCase()}
        </div>

        <div className="server-invite-details">
          <div className="server-invite-name" title={server.name}>
            {server.name}
          </div>
          <div className="server-invite-counts">
            <span className="count-item">
              <span className="status-indicator online" />
              <b>{server.onlineCount}</b> Online
            </span>
            <span className="count-item">
              <span className="status-indicator total" />
              <b>{server.memberCount}</b> Members
            </span>
          </div>
        </div>

        <button
          type="button"
          className={`server-invite-btn ${joined ? "joined" : ""}`}
          onClick={handleAction}
          disabled={joining}
        >
          {joining ? (
            "Joining…"
          ) : joined ? (
            <>
              <Check size={14} className="btn-icon" /> Joined
            </>
          ) : (
            "Join Server"
          )}
        </button>
      </div>
    </div>
  );
}
