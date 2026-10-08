"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { Folder, Volume2 } from "lucide-react";
import { channelKindInfo } from "@/lib/channel-kinds";
import type { VoiceParticipant } from "@/lib/protocol";
import type { ServerFolder } from "@/lib/server-folders";
import type { PublicServer } from "@/lib/servers";
import type { PresenceStatus } from "@/lib/users";
import { Avatar } from "../avatar";
import type { DmSummary } from "../../lib/chat/types";

/** Unread state by channel id, as the shell keeps it. */
export type UnreadMap = Record<string, { unread: boolean; count: number; mentions: number }>;

/** Who is in each voice room, by channel id. */
export type VoiceRooms = Record<string, VoiceParticipant[]>;

/** One server icon on the rail (loose, or inside an open folder). */
export function RailServer({
  server,
  isActive,
  unread,
  voiceRooms,
  dragging,
  dropMode,
  dragProps,
  onOpen,
  onMenu,
}: {
  server: PublicServer;
  isActive: boolean;
  unread: UnreadMap;
  voiceRooms: VoiceRooms;
  /** This icon is the one being dragged. */
  dragging: boolean;
  /** Where a dragged server would land on this one, if it is the target. */
  dropMode: "before" | "merge" | null;
  /** The shell's drag-and-drop handlers for this server. */
  dragProps: HTMLAttributes<HTMLDivElement>;
  onOpen: () => void;
  /** Right-click: open the server's menu at this point. */
  onMenu: (x: number, y: number) => void;
}) {
  const initials =
    server.name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "SV";
  const hasUnread =
    !isActive && server.channels.some((c) => unread[c.id]?.unread);
  const mentionTotal = server.channels.reduce(
    (sum, c) => sum + (unread[c.id]?.mentions || 0),
    0,
  );
  const occupiedRooms = server.channels.filter(
    (c) => channelKindInfo(c.kind).appearsAsVoice && (voiceRooms[c.id]?.length || 0) > 0,
  );
  const voiceActive = occupiedRooms.length > 0;
  const voiceTitle = occupiedRooms
    .map(
      (c) =>
        `🔊 ${c.name}: ${voiceRooms[c.id].map((p) => p.displayName).join(", ")}`,
    )
    .join("\n");
  return (
    <div
      className={`rail-item ${dragging ? "dragging" : ""} ${dropMode ? `drop-${dropMode}` : ""
      }`}
      {...dragProps}
    >
      {isActive ? (
        <span className="rail-active-pill" />
      ) : (
        hasUnread && <span className="rail-unread-pill" />
      )}
      <button
        className={`space-mark ${isActive ? "active-space" : ""}`}
        style={
          isActive ? { background: server.color || "var(--lavender)" } : undefined
        }
        aria-label={server.name}
        title={server.name}
        onClick={onOpen}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu(event.clientX, event.clientY);
        }}
      >
        {server.iconUrl ? (
          <img
            src={server.iconUrl}
            alt={server.name}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "14px",
              objectFit: "cover",
            }}
          />
        ) : (
          server.icon || initials
        )}
        {mentionTotal > 0 && (
          <span className="rail-badge">{mentionTotal}</span>
        )}
        {voiceActive && (
          <span className="rail-voice-badge" title={voiceTitle}>
            <Volume2 size={11} />
          </span>
        )}
      </button>
    </div>
  );
}

/** A folder on the rail: a mini grid when closed, its servers when open. */
export function RailFolder({
  folder,
  folderServers,
  open,
  activeServerId,
  unread,
  dropMerge,
  dropProps,
  onToggle,
  onMenu,
  renderServer,
}: {
  folder: ServerFolder;
  folderServers: PublicServer[];
  open: boolean;
  activeServerId: string | null;
  unread: UnreadMap;
  /** A dragged server is hovering to merge into this folder. */
  dropMerge: boolean;
  /** The shell's drop handlers for this folder. */
  dropProps: HTMLAttributes<HTMLDivElement>;
  onToggle: () => void;
  onMenu: (x: number, y: number) => void;
  /** Draws one server of an open folder. */
  renderServer: (server: PublicServer) => ReactNode;
}) {
  const containsActive = folderServers.some((server) => server.id === activeServerId);
  const hasUnread = folderServers.some(
    (server) => server.id !== activeServerId && server.channels.some((c) => unread[c.id]?.unread),
  );
  const mentionTotal = folderServers.reduce(
    (sum, server) =>
      sum + server.channels.reduce((n, c) => n + (unread[c.id]?.mentions || 0), 0),
    0,
  );
  const label = folder.name || folderServers.map((server) => server.name).join(", ");
  return (
    <div
      className={`rail-folder ${open ? "is-open" : ""}`}
      style={{ ["--folder-color" as string]: folder.color }}
    >
      <div
        className={`rail-item ${dropMerge ? "drop-merge" : ""}`}
        {...dropProps}
      >
        {!open && containsActive ? (
          <span className="rail-active-pill" />
        ) : (
          !open && hasUnread && <span className="rail-unread-pill" />
        )}
        <button
          type="button"
          className="rail-folder-mark"
          aria-label={`${label} folder, ${open ? "open" : "closed"}`}
          aria-expanded={open}
          title={label}
          onClick={onToggle}
          onContextMenu={(event) => {
            event.preventDefault();
            onMenu(event.clientX, event.clientY);
          }}
        >
          {open ? (
            <Folder size={20} fill="currentColor" />
          ) : (
            <span className="rail-folder-grid">
              {folderServers.slice(0, 4).map((server) => (
                <span
                  key={server.id}
                  style={{ background: server.color || "var(--lavender)" }}
                >
                  {server.iconUrl ? (
                    <img src={server.iconUrl} alt="" />
                  ) : (
                    server.icon || server.name.slice(0, 1).toUpperCase()
                  )}
                </span>
              ))}
            </span>
          )}
          {!open && mentionTotal > 0 && <span className="rail-badge">{mentionTotal}</span>}
        </button>
      </div>
      {open && folderServers.map((server) => renderServer(server))}
    </div>
  );
}

/** The first few DMs, as avatars on the rail under the servers. */
export function RailQuickDms({
  dms,
  inDmHome,
  activeChannelId,
  unread,
  voiceRooms,
  presenceOf,
  onOpen,
}: {
  dms: DmSummary[];
  inDmHome: boolean;
  activeChannelId: string | null;
  unread: UnreadMap;
  voiceRooms: VoiceRooms;
  presenceOf: (member: DmSummary["user"]) => PresenceStatus | "offline";
  onOpen: (channelId: string) => void;
}) {
  return (
    <>
      {dms.slice(0, 4).map((dm) => {
        const isActive = inDmHome && activeChannelId === dm.channelId;
        const count = unread[dm.channelId]?.count || 0;
        const presence = presenceOf(dm.user);
        return (
          <div key={dm.channelId} className="rail-item">
            {isActive && (
              <span className="rail-active-pill" />
            )}
            <button
              className={`rail-dm ${isActive ? "active-space" : ""}`}
              title={`${dm.user.displayName}${count > 0 ? ` · ${count} new` : ""}`}
              aria-label={`${dm.user.displayName}, ${count} unread`}
              onClick={() => onOpen(dm.channelId)}
            >
              <div className="relative flex-shrink-0">
                <Avatar
                  className="rail-dm-avatar"
                  avatar={dm.user.avatar}
                  avatarUrl={dm.user.avatarUrl}
                  color={dm.user.color}
                />
                {!dm.group && (
                  <span
                    className={`rail-dm-online-dot is-${presence === "invisible" ? "offline" : presence}`}
                  />
                )}
                {voiceRooms[dm.channelId]?.length > 0 && (
                  <span className="dm-call-active-indicator" title="Active voice call" />
                )}
              </div>
              {count > 0 && <span className="rail-badge">{count}</span>}
            </button>
          </div>
        );
      })}
    </>
  );
}
