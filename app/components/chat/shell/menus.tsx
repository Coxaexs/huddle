"use client";

import type { PlayerState } from "@/lib/protocol";
import type { PublicChannel, PublicServer } from "@/lib/servers";
import { channelKindInfo, convertibleKinds, type ChannelKind } from "@/lib/channel-kinds";
import { clampVoiceBitrate } from "@/lib/voice-quality";
import { hasPermission, Permission } from "@/lib/permissions";
import { type Member, type PublicUser } from "@/lib/users";
import { activeUntil } from "@/lib/timeouts";
import { removeFromFolders, type ServerFolder } from "@/lib/server-folders";
import { type DmSummary } from "../../../lib/chat/types";
import { withArticle } from "../../../lib/chat/format";
import { channelKindLabel, channelKindIcon } from "../channel-kind";
import { UserMenu, type UserMenuTarget, type VoicePref } from "../../user-menu";
import { apiFetch } from "../../../lib/client";
import type { MsnContacts } from "@/lib/msn-contacts";
import type { Dispatch, SetStateAction } from "react";
import type { ClientEvent, VoiceParticipant, RecordingState } from "@/lib/protocol";

// Keeps a fixed-position menu fully on screen: flips upward near the bottom edge.
function clampToViewport(el: HTMLDivElement | null) {
  if (!el) return;
  const margin = 12;
  const { width, height, left, top } = el.getBoundingClientRect();
  const maxLeft = window.innerWidth - width - margin;
  const maxTop = window.innerHeight - height - margin;
  el.style.left = `${Math.max(margin, Math.min(left, maxLeft))}px`;
  el.style.top = `${Math.max(margin, top > maxTop ? Math.min(top - height, maxTop) : top)}px`;
}

export function UserMenuLayer({
  userMenu,
  user,
  msnTheme,
  msnContacts,
  placeContact,
  setUserMenu,
  createContactGroup,
  toggleSignInAlert,
  setMembers,
  prefFor,
  hub,
  blockedUserIds,
  handleBlockUser,
  handleUnblockUser,
  openDm,
  saveVoicePref,
  togglePinDm,
  canModerate,
  canManageServer,
  inDmHome,
  activeDm,
  removeFromGroupDm,
  moderateMember,
  bannedIds,
  voiceChannels,
  voiceRooms,
  userMenuVoiceJoinedAt,
  moveMember,
  membersById,
  activeServer,
  myPermissions,
  timeoutMember,
  canManageNicknames,
  editNickname,
}: {
  userMenu: UserMenuTarget | null;
  user: PublicUser;
  msnTheme: boolean;
  msnContacts: { contacts: MsnContacts; update: (change: (current: MsnContacts) => MsnContacts) => void; };
  placeContact: (userId: string, groupId: string | null) => void;
  setUserMenu: Dispatch<SetStateAction<UserMenuTarget | null>>;
  createContactGroup: (thenPlace?: string) => void;
  toggleSignInAlert: (userId: string) => void;
  setMembers: Dispatch<SetStateAction<Member[]>>;
  prefFor: (id: string) => VoicePref;
  hub: { send: (event: ClientEvent) => boolean; serverNow: () => number; connected: boolean; connectionId: string | null; session: number; online: Set<string>; voice: Record<string, VoiceParticipant[]>; players: Record<string, PlayerState>; recordings: Record<string, RecordingState>; forcedMutes: Set<string>; };
  blockedUserIds: Set<string>;
  handleBlockUser: (targetId: string) => Promise<void>;
  handleUnblockUser: (targetId: string) => Promise<void>;
  openDm: (targetId: string) => Promise<void>;
  saveVoicePref: (targetId: string, patch: { volume?: number; muted?: boolean; serverMuted?: boolean; }) => Promise<void>;
  togglePinDm: (channelId: string, pinned: boolean) => Promise<void>;
  canModerate: boolean;
  canManageServer: boolean;
  inDmHome: boolean;
  activeDm: DmSummary | null;
  removeFromGroupDm: (dm: DmSummary, member: { id: string; displayName: string; }) => void;
  moderateMember: (userId: string, action: "kick" | "ban" | "unban") => Promise<void>;
  bannedIds: Set<string>;
  voiceChannels: PublicChannel[];
  voiceRooms: Record<string, VoiceParticipant[]>;
  userMenuVoiceJoinedAt: number | null;
  moveMember: (userId: string, channelId: string) => Promise<void>;
  membersById: Map<string, Member>;
  activeServer: PublicServer | null;
  myPermissions: number;
  timeoutMember: (userId: string, minutes: number) => Promise<void>;
  canManageNicknames: boolean;
  editNickname: (userId: string) => void;
}) {
  return (
    <>
      {userMenu && (
        <UserMenu
          target={userMenu}
          isSelf={userMenu.member.id === user.id}
          extra={
            msnTheme && userMenu.member.id !== user.id ? (
              <div className="msn-menu-extra">
                <div className="user-menu-divider" />
                <p className="user-menu-note">Contact group</p>
                {msnContacts.contacts.groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={msnContacts.contacts.placement[userMenu.member.id] === group.id}
                    className={msnContacts.contacts.placement[userMenu.member.id] === group.id ? "active" : ""}
                    onClick={() => {
                      placeContact(userMenu.member.id, group.id);
                      setUserMenu(null);
                    }}
                  >
                    {msnContacts.contacts.placement[userMenu.member.id] === group.id ? "✓ " : ""}
                    {group.name}
                  </button>
                ))}
                {msnContacts.contacts.placement[userMenu.member.id] && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      placeContact(userMenu.member.id, null);
                      setUserMenu(null);
                    }}
                  >
                    Remove from group
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const id = userMenu.member.id;
                    setUserMenu(null);
                    createContactGroup(id);
                  }}
                >
                  New group…
                </button>
                <div className="user-menu-divider" />
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={!msnContacts.contacts.quiet.includes(userMenu.member.id)}
                  onClick={() => {
                    toggleSignInAlert(userMenu.member.id);
                    setUserMenu(null);
                  }}
                >
                  {msnContacts.contacts.quiet.includes(userMenu.member.id) ? "" : "✓ "}
                  Alert me when they sign in
                </button>
              </div>
            ) : undefined
          }
          isOwner={Boolean(user.isAdmin)}
          onToggleInvitePermission={
            user.isAdmin && !userMenu.member.isAdmin && userMenu.member.id !== user.id
              ? async () => {
                const targetMember = userMenu.member;
                const newCanInvite = !targetMember.canInvite;
                setUserMenu(null);
                try {
                  await apiFetch("/api/invites/permissions", {
                    method: "POST",
                    body: JSON.stringify({
                      userId: targetMember.id,
                      canInvite: newCanInvite,
                    }),
                  });
                  setMembers((prev) =>
                    prev.map((m) =>
                      m.id === targetMember.id
                        ? { ...m, canInvite: newCanInvite }
                        : m,
                    ),
                  );
                } catch (err) {
                  console.error("Failed to update invite permission:", err);
                }
              }
              : undefined
          }
          pref={prefFor(userMenu.member.id)}
          serverMuted={hub.forcedMutes.has(userMenu.member.id)}
          isBlocked={blockedUserIds.has(userMenu.member.id)}
          onBlock={() => {
            void handleBlockUser(userMenu.member.id);
          }}
          onUnblock={() => {
            void handleUnblockUser(userMenu.member.id);
          }}
          onClose={() => setUserMenu(null)}
          onMessage={() => {
            const id = userMenu.member.id;
            setUserMenu(null);
            void openDm(id);
          }}
          onLocalMute={(muted) => {
            void saveVoicePref(userMenu.member.id, { muted });
          }}
          onVolume={(volume) => {
            void saveVoicePref(userMenu.member.id, { volume });
          }}
          onServerMute={(muted) => {
            void saveVoicePref(userMenu.member.id, { serverMuted: muted });
            setUserMenu(null);
          }}
          onTogglePinDm={
            userMenu.dmChannelId
              ? () => {
                  void togglePinDm(userMenu.dmChannelId!, !userMenu.dmPinned);
                }
              : undefined
          }
          dmPinned={userMenu.dmPinned}
          canModerate={canModerate}
          canManage={canManageServer && !inDmHome}
          onRemoveFromGroup={
            inDmHome &&
              activeDm?.group &&
              activeDm.group.ownerId === user.id &&
              userMenu.member.id !== user.id &&
              activeDm.group.members.some((m) => m.id === userMenu.member.id)
              ? () => {
                removeFromGroupDm(activeDm, userMenu.member);
                setUserMenu(null);
              }
              : undefined
          }
          onKick={() => {
            void moderateMember(userMenu.member.id, "kick");
            setUserMenu(null);
          }}
          onBan={() => {
            void moderateMember(userMenu.member.id, "ban");
            setUserMenu(null);
          }}
          banned={bannedIds.has(userMenu.member.id)}
          onUnban={() => {
            void moderateMember(userMenu.member.id, "unban");
            setUserMenu(null);
          }}
          voiceChannels={
            canModerate && !inDmHome
              ? voiceChannels.map((channel) => ({
                id: channel.id,
                name: channel.name,
              }))
              : []
          }
          targetVoiceChannelId={
            voiceChannels.find((channel) =>
              (voiceRooms[channel.id] || []).some(
                (person) => person.id === userMenu.member.id,
              ),
            )?.id || null
          }
          voiceJoinedAt={userMenuVoiceJoinedAt}
          serverNow={hub.serverNow}
          onMove={(channelId) => {
            void moveMember(userMenu.member.id, channelId);
            setUserMenu(null);
          }}
          timeoutUntil={activeUntil(membersById.get(userMenu.member.id)?.timeoutUntil)}
          onTimeout={
            !inDmHome &&
            userMenu.member.id !== user.id &&
            membersById.has(userMenu.member.id) &&
            !membersById.get(userMenu.member.id)?.isAdmin &&
            activeServer?.ownerId !== userMenu.member.id &&
            (canModerate ||
              canManageServer ||
              hasPermission(myPermissions, Permission.KICK_MEMBERS))
              ? (minutes) => {
                  const id = userMenu.member.id;
                  setUserMenu(null);
                  void timeoutMember(id, minutes);
                }
              : undefined
          }
          onNickname={
            !inDmHome &&
            membersById.has(userMenu.member.id) &&
            (userMenu.member.id === user.id ||
              (canManageNicknames &&
                !membersById.get(userMenu.member.id)?.isAdmin &&
                activeServer?.ownerId !== userMenu.member.id))
              ? () => {
                  const id = userMenu.member.id;
                  setUserMenu(null);
                  editNickname(id);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

export function RailMenuLayer({
  railMenu,
  setRailMenu,
  unread,
  markServerRead,
  folderIdOf,
  saveServerFolders,
  serverFolders,
  channelPrefs,
  setNotifyLevel,
}: {
  railMenu: { server: PublicServer; x: number; y: number; } | null;
  setRailMenu: Dispatch<SetStateAction<{ server: PublicServer; x: number; y: number; } | null>>;
  unread: Record<string, { unread: boolean; count: number; mentions: number; }>;
  markServerRead: (server: PublicServer) => void;
  folderIdOf: (serverId: string) => string | null;
  saveServerFolders: (next: ServerFolder[]) => void;
  serverFolders: ServerFolder[];
  channelPrefs: Record<string, string>;
  setNotifyLevel: (key: string, level: string, durationMs?: number) => void;
}) {
  return (
    <>
      {railMenu && (
        <>
          <div
            className="menu-shade"
            onClick={() => setRailMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setRailMenu(null);
            }}
          />
          <div
            className="user-menu"
            ref={clampToViewport}
            role="menu"
            style={{
              left: Math.min(railMenu.x, (globalThis.innerWidth || 1200) - 240),
              top: Math.min(railMenu.y, (globalThis.innerHeight || 800) - 260),
            }}
          >
            <div className="user-menu-head">
              <strong>{railMenu.server.name}</strong>
            </div>
            <button
              type="button"
              role="menuitem"
              disabled={!railMenu.server.channels.some((c) => unread[c.id])}
              onClick={() => {
                markServerRead(railMenu.server);
                setRailMenu(null);
              }}
            >
              Mark as read
            </button>
            {folderIdOf(railMenu.server.id) && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  saveServerFolders(removeFromFolders(serverFolders, railMenu.server.id));
                  setRailMenu(null);
                }}
              >
                Remove from folder
              </button>
            )}
            <div className="user-menu-divider" />
            <div className="user-menu-head">
              <span>Notifications</span>
            </div>
            {(
              [
                ["all", "All messages"],
                ["mentions", "Only @mentions"],
                ["nothing", "Nothing"],
              ] as const
            ).map(([level, label]) => {
              const key = `server:${railMenu.server.id}`;
              const current = channelPrefs[key] || "all";
              return (
                <div key={level} className="flex flex-col">
                  <button
                    type="button"
                    role="menuitem"
                    className={current === level ? "active" : ""}
                    onClick={() => {
                      setNotifyLevel(key, level);
                      if (level !== "nothing") setRailMenu(null);
                    }}
                  >
                    {current === level ? "● " : "○ "}
                    {label}
                  </button>
                  {level === "nothing" && current === "nothing" && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-black/25 text-[11px] text-white/70">
                      <span className="text-[10px] text-white/40 uppercase">For:</span>
                      {(
                        [
                          ["15m", 15 * 60 * 1000],
                          ["1h", 60 * 60 * 1000],
                          ["8h", 8 * 60 * 60 * 1000],
                          ["24h", 24 * 60 * 60 * 1000],
                          ["∞", undefined],
                        ] as const
                      ).map(([lbl, ms]) => (
                        <button
                          key={lbl}
                          type="button"
                          className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNotifyLevel(key, "nothing", ms);
                            setRailMenu(null);
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

export function FolderMenuLayer({
  folderMenu,
  setFolderMenu,
  servers,
  markServerRead,
  showCustomPrompt,
  saveServerFolders,
  serverFolders,
}: {
  folderMenu: { folder: ServerFolder; x: number; y: number; } | null;
  setFolderMenu: Dispatch<SetStateAction<{ folder: ServerFolder; x: number; y: number; } | null>>;
  servers: PublicServer[];
  markServerRead: (server: PublicServer) => void;
  showCustomPrompt: (options: { title: string; message?: string; defaultValue?: string; placeholder?: string; confirmText?: string; maxLength?: number; onConfirm: (val?: string) => void; }) => void;
  saveServerFolders: (next: ServerFolder[]) => void;
  serverFolders: ServerFolder[];
}) {
  return (
    <>
      {folderMenu && (
        <>
          <div
            className="menu-shade"
            onClick={() => setFolderMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setFolderMenu(null);
            }}
          />
          <div
            className="user-menu"
            ref={clampToViewport}
            role="menu"
            style={{
              left: Math.min(folderMenu.x, (globalThis.innerWidth || 1200) - 240),
              top: Math.min(folderMenu.y, (globalThis.innerHeight || 800) - 260),
            }}
          >
            <div className="user-menu-head">
              <strong>{folderMenu.folder.name || "Server folder"}</strong>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                for (const server of servers) {
                  if (folderMenu.folder.serverIds.includes(server.id)) markServerRead(server);
                }
                setFolderMenu(null);
              }}
            >
              Mark folder as read
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const target = folderMenu.folder;
                setFolderMenu(null);
                showCustomPrompt({
                  title: "Folder name",
                  message: "Leave it empty to show the servers' names.",
                  defaultValue: target.name,
                  placeholder: "Games, Friends, Work…",
                  confirmText: "Save",
                  maxLength: 40,
                  onConfirm: (value) =>
                    saveServerFolders(
                      serverFolders.map((folder) =>
                        folder.id === target.id
                          ? { ...folder, name: (value || "").trim() }
                          : folder,
                      ),
                    ),
                });
              }}
            >
              Rename folder
            </button>
            <div className="user-menu-divider" />
            <div className="user-menu-head">
              <span>Colour</span>
            </div>
            <div className="rail-folder-colors">
              {["#5865f2", "#3ba55c", "#faa61a", "#ed4245", "#eb459e", "#9b59b6", "#1abc9c", "#747f8d"].map(
                (color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Colour ${color}`}
                    className={folderMenu.folder.color === color ? "is-current" : ""}
                    style={{ background: color }}
                    onClick={() => {
                      saveServerFolders(
                        serverFolders.map((folder) =>
                          folder.id === folderMenu.folder.id ? { ...folder, color } : folder,
                        ),
                      );
                      setFolderMenu(null);
                    }}
                  />
                ),
              )}
            </div>
            <div className="user-menu-divider" />
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                saveServerFolders(
                  serverFolders.filter((folder) => folder.id !== folderMenu.folder.id),
                );
                setFolderMenu(null);
              }}
            >
              Ungroup servers
            </button>
          </div>
        </>
      )}
    </>
  );
}

export function ChannelMenuLayer({
  channelMenu,
  setChannelMenu,
  channelPrefs,
  setNotifyLevel,
  canManageChannels,
  renameChannel,
  editChannelTopic,
  editChannelSlowmode,
  editChannelBitrate,
  toggleChannelSoundboard,
  editChannelRegion,
  changeChannelKind,
  deleteChannel,
}: {
  channelMenu: { channel: PublicChannel; x: number; y: number; } | null;
  setChannelMenu: Dispatch<SetStateAction<{ channel: PublicChannel; x: number; y: number; } | null>>;
  channelPrefs: Record<string, string>;
  setNotifyLevel: (key: string, level: string, durationMs?: number) => void;
  canManageChannels: boolean;
  renameChannel: (channel: PublicChannel) => Promise<void>;
  editChannelTopic: (channel: PublicChannel) => Promise<void>;
  editChannelSlowmode: (channel: PublicChannel) => Promise<void>;
  editChannelBitrate: (channel: PublicChannel) => Promise<void>;
  toggleChannelSoundboard: (channel: PublicChannel) => Promise<void>;
  editChannelRegion: (channel: PublicChannel) => Promise<void>;
  changeChannelKind: (channel: { id: string; name: string; }, kind: ChannelKind) => Promise<void>;
  deleteChannel: (channel: PublicChannel) => Promise<void>;
}) {
  return (
    <>
      {channelMenu && (
        <>
          <div
            className="menu-shade"
            onClick={() => setChannelMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setChannelMenu(null);
            }}
          />
          <div
            className="user-menu"
            ref={clampToViewport}
            role="menu"
            style={{
              left: Math.min(channelMenu.x, (globalThis.innerWidth || 1200) - 240),
              top: Math.min(channelMenu.y, (globalThis.innerHeight || 800) - 280),
            }}
          >
            <div className="user-menu-head">
              <strong>
                {channelKindIcon(channelMenu.channel.kind)}
                {" "}
                {channelMenu.channel.name}
              </strong>
              <span>Notifications</span>
            </div>
            {(
              [
                ["all", "All messages"],
                ["mentions", "Only @mentions"],
                ["nothing", "Nothing"],
              ] as const
            ).map(([level, label]) => {
              const current = channelPrefs[channelMenu.channel.id] || "all";
              return (
                <div key={level} className="flex flex-col">
                  <button
                    type="button"
                    role="menuitem"
                    className={current === level ? "active" : ""}
                    onClick={() => {
                      setNotifyLevel(channelMenu.channel.id, level);
                      if (level !== "nothing") setChannelMenu(null);
                    }}
                  >
                    {current === level ? "● " : "○ "}
                    {label}
                  </button>
                  {level === "nothing" && current === "nothing" && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-black/25 text-[11px] text-white/70">
                      <span className="text-[10px] text-white/40 uppercase">For:</span>
                      {(
                        [
                          ["15m", 15 * 60 * 1000],
                          ["1h", 60 * 60 * 1000],
                          ["8h", 8 * 60 * 60 * 1000],
                          ["24h", 24 * 60 * 60 * 1000],
                          ["∞", undefined],
                        ] as const
                      ).map(([lbl, ms]) => (
                        <button
                          key={lbl}
                          type="button"
                          className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNotifyLevel(channelMenu.channel.id, "nothing", ms);
                            setChannelMenu(null);
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {canManageChannels && (
              <>
                <div className="user-menu-divider" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const channel = channelMenu.channel;
                    setChannelMenu(null);
                    void renameChannel(channel);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const channel = channelMenu.channel;
                    setChannelMenu(null);
                    void editChannelTopic(channel);
                  }}
                >
                  Edit Topic
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const channel = channelMenu.channel;
                    setChannelMenu(null);
                    void editChannelSlowmode(channel);
                  }}
                >
                  Set Slowmode
                </button>
                {channelKindInfo(channelMenu.channel.kind).voice && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const channel = channelMenu.channel;
                      setChannelMenu(null);
                      void editChannelBitrate(channel);
                    }}
                  >
                    Voice Bitrate ({Math.round(clampVoiceBitrate(channelMenu.channel.bitrate) / 1000)} kbps)
                  </button>
                )}
                {channelKindInfo(channelMenu.channel.kind).voice && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const channel = channelMenu.channel;
                      setChannelMenu(null);
                      void toggleChannelSoundboard(channel);
                    }}
                  >
                    {channelMenu.channel.soundboard === false ? "Turn soundboard on" : "Turn soundboard off"}
                  </button>
                )}
                {channelKindInfo(channelMenu.channel.kind).voice && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const channel = channelMenu.channel;
                      setChannelMenu(null);
                      void editChannelRegion(channel);
                    }}
                  >
                    Region Override ({channelMenu.channel.rtcRegion === "de" ? "Germany" : channelMenu.channel.rtcRegion === "nl" ? "Netherlands" : "Automatic"})
                  </button>
                )}
                {convertibleKinds(channelMenu.channel.kind).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const channel = channelMenu.channel;
                      setChannelMenu(null);
                      void changeChannelKind(channel, kind);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      {channelKindIcon(kind)} Make it {withArticle(channelKindLabel(kind))}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    const channel = channelMenu.channel;
                    setChannelMenu(null);
                    void deleteChannel(channel);
                  }}
                >
                  Delete channel
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
