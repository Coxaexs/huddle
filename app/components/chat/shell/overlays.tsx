"use client";

import type { VoiceApi } from "../../../hooks/use-voice";
import { type MouseEvent } from "react";
import type { PlayerState } from "@/lib/protocol";
import { MsnSignInToasts, MsnPicturePicker, MsnSoundsDialog, MsnHoverCard } from "../../msn-chrome";
import { MsnToday } from "../../msn-today";
import { type MsnPicture } from "../../../lib/msn-pictures";
import type { PublicServer } from "@/lib/servers";
import { PRESENCE, type Member, type PresenceStatus, type PublicUser } from "@/lib/users";
import { PhoneCall, Video, X, PhoneOff } from "lucide-react";
import { Avatar } from "../../avatar";
import { OutlineEmoji } from "../../outline-emoji";
import { type Message } from "../../../lib/chat/types";
import { EmojiPicker } from "../../emoji-picker";
import { FloatingScreenPreview } from "../../floating-screen-preview";
import { apiFetch } from "../../../lib/client";
import { requestProfileEditor } from "@/lib/profile-editor-request";
import { UserProfileCard } from "../../user-profile-card";
import type { Dispatch, SetStateAction, RefObject } from "react";
import type { MsnContacts } from "@/lib/msn-contacts";
import type { WhatsNewEntry } from "../../../hooks/use-msn-extras";
import type { ClientEvent, VoiceParticipant, RecordingState } from "@/lib/protocol";

export function MsnOverlays({
  msnTheme,
  soundsOpen,
  setSoundsOpen,
  hoverCard,
  presenceOf,
  user,
  myCustomStatus,
  msnContacts,
  hoverTimer,
  queueHoverCard,
  setHoverCard,
  openDm,
  openProfile,
  pictureOpen,
  setStockPicture,
  setPictureOpen,
  setSettingsOpen,
  todayOpen,
  todayData,
  whatsNew,
  servers,
  setTodayOpen,
  setActiveServerId,
  setStageChannelId,
  setEventsOpen,
  hub,
  members,
}: {
  msnTheme: boolean;
  soundsOpen: boolean;
  setSoundsOpen: Dispatch<SetStateAction<boolean>>;
  hoverCard: { member: Member; top: number; left: number; } | null;
  presenceOf: (member: Member) => PresenceStatus | "offline";
  user: PublicUser;
  myCustomStatus: string | null;
  msnContacts: { contacts: MsnContacts; update: (change: (current: MsnContacts) => MsnContacts) => void; };
  hoverTimer: RefObject<number | null>;
  queueHoverCard: (member: Member | null, anchor?: HTMLElement) => void;
  setHoverCard: Dispatch<SetStateAction<{ member: Member; top: number; left: number; } | null>>;
  openDm: (targetId: string) => Promise<void>;
  openProfile: (member: Member, e?: React.MouseEvent) => void;
  pictureOpen: boolean;
  setStockPicture: (picture: MsnPicture) => Promise<void>;
  setPictureOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  todayOpen: boolean;
  todayData: { online: { id: string; name: string; avatar: string; avatarUrl?: string | null; color: string; }[]; waiting: { key: string; label: string; count: number; mentions: number; open: () => void; }[]; playing: { room: string; title: string; artist: string; open: () => void; }[]; channelInfo: Map<string, { serverId: string; serverName: string; name: string; }>; } | null;
  whatsNew: { feed: WhatsNewEntry[]; clear: () => void; };
  servers: PublicServer[];
  setTodayOpen: Dispatch<SetStateAction<boolean>>;
  setActiveServerId: Dispatch<SetStateAction<string | null>>;
  setStageChannelId: Dispatch<SetStateAction<string | null>>;
  setEventsOpen: Dispatch<SetStateAction<boolean>>;
  hub: { send: (event: ClientEvent) => boolean; serverNow: () => number; connected: boolean; connectionId: string | null; session: number; online: Set<string>; voice: Record<string, VoiceParticipant[]>; players: Record<string, PlayerState>; recordings: Record<string, RecordingState>; forcedMutes: Set<string>; };
  members: Member[];
}) {
  return (
    <>
      {msnTheme && (
        <>
        {soundsOpen && <MsnSoundsDialog onClose={() => setSoundsOpen(false)} />}
        {hoverCard && (
          <MsnHoverCard
            name={hoverCard.member.displayName}
            username={hoverCard.member.username}
            avatar={hoverCard.member.avatar}
            avatarUrl={hoverCard.member.avatarUrl}
            color={hoverCard.member.color}
            presence={
              PRESENCE[
                (presenceOf(hoverCard.member) === "offline"
                  ? "invisible"
                  : presenceOf(hoverCard.member)) as PresenceStatus
              ]
            }
            offline={presenceOf(hoverCard.member) === "offline"}
            personalMessage={
              hoverCard.member.id === user?.id ? myCustomStatus : hoverCard.member.customStatus
            }
            group={
              msnContacts.contacts.groups.find(
                (g) => g.id === msnContacts.contacts.placement[hoverCard.member.id],
              )?.name
            }
            style={{ top: hoverCard.top, left: hoverCard.left }}
            onEnter={() => hoverTimer.current && window.clearTimeout(hoverTimer.current)}
            onLeave={() => queueHoverCard(null)}
            onMessage={
              hoverCard.member.id === user?.id
                ? undefined
                : () => {
                    const id = hoverCard.member.id;
                    setHoverCard(null);
                    void openDm(id);
                  }
            }
            onProfile={() => {
              const member = hoverCard.member;
              setHoverCard(null);
              openProfile(member);
            }}
          />
        )}
        {pictureOpen && (
          <MsnPicturePicker
            onPick={setStockPicture}
            onBrowse={() => {
              setPictureOpen(false);
              setSettingsOpen(true);
            }}
            onClose={() => setPictureOpen(false)}
          />
        )}
        {todayOpen && todayData && user && (
          <MsnToday
            userName={user.displayName}
            online={todayData.online}
            waiting={todayData.waiting}
            playing={todayData.playing}
            whatsNew={whatsNew.feed}
            serverIds={servers.map((server) => server.id)}
            onOpenPerson={(id) => {
              setTodayOpen(false);
              void openDm(id);
            }}
            onOpenEvent={(event) => {
              setTodayOpen(false);
              setActiveServerId(event.serverId);
              setStageChannelId(null);
              setEventsOpen(true);
            }}
            onClose={() => setTodayOpen(false)}
          />
        )}
        <MsnSignInToasts
          online={hub.online}
          people={members
            .filter((m) => !msnContacts.contacts.quiet.includes(m.id))
            .map((m) => ({ ...m, name: m.displayName }))}
          selfId={user?.id ?? null}
          connected={hub.connected}
          onOpen={(id) => void openDm(id)}
        />
        </>
      )}
    </>
  );
}

export function ImageLightbox({
  lightbox,
  setLightbox,
}: {
  lightbox: { images: string[]; index: number; } | null;
  setLightbox: Dispatch<SetStateAction<{ images: string[]; index: number; } | null>>;
}) {
  return (
    <>
      {lightbox && lightbox.images[lightbox.index] && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="lightbox-close"
            aria-label="Close image"
            onClick={() => setLightbox(null)}
          >
            ×
          </button>
          {lightbox.images.length > 1 && (
            <>
              <button
                type="button"
                className="lightbox-nav lightbox-prev"
                aria-label="Previous image"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((prev) =>
                    prev
                      ? {
                          ...prev,
                          index:
                            (prev.index - 1 + prev.images.length) %
                            prev.images.length,
                        }
                      : null,
                  );
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="lightbox-nav lightbox-next"
                aria-label="Next image"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: (prev.index + 1) % prev.images.length,
                        }
                      : null,
                  );
                }}
              >
                ›
              </button>
              <div
                className="lightbox-counter"
                onClick={(e) => e.stopPropagation()}
              >
                {lightbox.index + 1} / {lightbox.images.length}
              </div>
            </>
          )}
          <img
            key={lightbox.images[lightbox.index]}
            src={lightbox.images[lightbox.index]}
            alt=""
            onClick={(event) => event.stopPropagation()}
          />
          <a
            className="lightbox-open"
            href={lightbox.images[lightbox.index]}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            Open original ↗
          </a>
        </div>
      )}
    </>
  );
}

export function ProfileCardLayer({
  profileCardTarget,
  inDmHome,
  activeServer,
  activeServerId,
  setProfileCardTarget,
  canManageServer,
  canManageRoles,
  loadMembers,
  user,
  presenceOf,
  blockedUserIds,
  setSettingsOpen,
  friendUserIds,
  incomingFriendUserIds,
  outgoingFriendUserIds,
  handleAddFriend,
  handleRemoveFriend,
  handleAcceptFriend,
  handleBlockUser,
  handleUnblockUser,
  openDm,
  setDraft,
  composerRef,
}: {
  profileCardTarget: { member: Member; pos?: { x: number; y: number; right?: number; bottom?: number; }; } | null;
  inDmHome: boolean;
  activeServer: PublicServer | null;
  activeServerId: string | null;
  setProfileCardTarget: Dispatch<SetStateAction<{ member: Member; pos?: { x: number; y: number; right?: number; bottom?: number; }; } | null>>;
  canManageServer: boolean;
  canManageRoles: boolean;
  loadMembers: () => Promise<void>;
  user: PublicUser;
  presenceOf: (member: Member) => PresenceStatus | "offline";
  blockedUserIds: Set<string>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  friendUserIds: Set<string>;
  incomingFriendUserIds: Set<string>;
  outgoingFriendUserIds: Set<string>;
  handleAddFriend: (targetUserId: string, targetUsername?: string) => Promise<void>;
  handleRemoveFriend: (targetUserId: string) => Promise<void>;
  handleAcceptFriend: (targetUserId: string) => Promise<void>;
  handleBlockUser: (targetId: string) => Promise<void>;
  handleUnblockUser: (targetId: string) => Promise<void>;
  openDm: (targetId: string) => Promise<void>;
  setDraft: (valueOrFn: string | ((prev: string) => string)) => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <>
      {profileCardTarget && (
        <UserProfileCard
          member={profileCardTarget.member}
          server={inDmHome ? null : activeServer}
          roles={activeServer?.roles || []}
          userRoles={
            profileCardTarget.member.roleIds?.[activeServerId || ""] || []
          }
          position={profileCardTarget.pos}
          onClose={() => setProfileCardTarget(null)}
          onToggleRole={
            (canManageServer || canManageRoles) && activeServer && !inDmHome
              ? async (roleId, add) => {
                const serverId = activeServer.id;
                await apiFetch("/api/roles/assign", {
                  method: "POST",
                  body: JSON.stringify({
                    serverId,
                    userId: profileCardTarget.member.id,
                    roleId,
                    add,
                  }),
                });
                void loadMembers().catch(() => undefined);
              }
              : undefined
          }
          isSelf={user?.id === profileCardTarget.member.id}
          presence={presenceOf(profileCardTarget.member)}
          isBlocked={blockedUserIds.has(profileCardTarget.member.id)}
          onEditProfile={() => {
            setProfileCardTarget(null);
            requestProfileEditor();
            setSettingsOpen(true);
          }}
          friendStatus={
            friendUserIds.has(profileCardTarget.member.id)
              ? "friend"
              : incomingFriendUserIds.has(profileCardTarget.member.id)
                ? "incoming"
                : outgoingFriendUserIds.has(profileCardTarget.member.id)
                  ? "outgoing"
                  : "none"
          }
          onAddFriend={(targetUserId, targetUsername) => {
            void handleAddFriend(targetUserId, targetUsername);
          }}
          onRemoveFriend={(targetUserId) => {
            void handleRemoveFriend(targetUserId);
          }}
          onAcceptFriend={(targetUserId) => {
            void handleAcceptFriend(targetUserId);
          }}
          onBlock={(targetUserId) => {
            void handleBlockUser(targetUserId);
          }}
          onUnblock={(targetUserId) => {
            void handleUnblockUser(targetUserId);
          }}
          onDirectMessage={(targetUserId) => {
            void openDm(targetUserId);
          }}
          onMention={(username) => {
            setDraft((curr) => curr + `@${username} `);
            composerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

export function IncomingDmCall({
  incomingDmCall,
  declineIncomingCall,
  acceptIncomingCall,
}: {
  incomingDmCall: { channelId: string; fromUserId: string; fromDisplayName: string; fromAvatar: string; fromAvatarUrl?: string | null; isVideo?: boolean; } | null;
  declineIncomingCall: () => void;
  acceptIncomingCall: () => void;
}) {
  return (
    <>
      {incomingDmCall && (
        <div className="incoming-call-overlay" role="alertdialog" aria-modal="true" aria-label="Incoming Call">
          <div className="incoming-call-card">
            <div className="incoming-call-avatar-wrapper">
              <Avatar
                avatar={incomingDmCall.fromAvatar}
                avatarUrl={incomingDmCall.fromAvatarUrl}
                color="#a78bfa"
                name={incomingDmCall.fromDisplayName}
                size={52}
              />
            </div>
            <div className="incoming-call-info">
              <span className="incoming-call-name">{incomingDmCall.fromDisplayName}</span>
              <span className="incoming-call-subtitle">
                {incomingDmCall.isVideo ? <Video size={13} /> : <PhoneCall size={13} />}
                Incoming {incomingDmCall.isVideo ? "Video" : "Voice"} Call...
              </span>
            </div>
            <div className="incoming-call-actions">
              <button
                type="button"
                className="incoming-call-btn decline"
                onClick={declineIncomingCall}
                title="Decline Call"
                aria-label="Decline Call"
              >
                <PhoneOff size={20} />
              </button>
              <button
                type="button"
                className="incoming-call-btn accept"
                onClick={acceptIncomingCall}
                title="Accept Call"
                aria-label="Accept Call"
              >
                {incomingDmCall.isVideo ? <Video size={20} /> : <PhoneCall size={20} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function MarkdownGuideModal({
  markdownModalOpen,
  setMarkdownModalOpen,
  setDraft,
  composerRef,
}: {
  markdownModalOpen: boolean;
  setMarkdownModalOpen: Dispatch<SetStateAction<boolean>>;
  setDraft: (valueOrFn: string | ((prev: string) => string)) => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <>
      {markdownModalOpen && (
        <div
          className="markdown-guide-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setMarkdownModalOpen(false)}
        >
          <div
            className="markdown-guide-modal w-full max-w-lg rounded-2xl border border-[#2e2646] bg-[#161224] p-5 shadow-2xl text-white space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[var(--ink)]">Markdown & Code Snippets</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-purple-500/40 bg-purple-500/10 text-purple-300">
                  Active
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMarkdownModalOpen(false)}
                className="popup-close-x"
                aria-label="Close markdown guide"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[#b8b0cf] leading-relaxed">
              Hoffle natively formats your messages with Discord-flavoured Markdown. Send code snippets with syntax highlighting using triple backticks.
            </p>

            <div className="space-y-2">
              <div className="text-[11px] font-bold text-[var(--lavender)] uppercase tracking-wider">
                Code Blocks (C++, Python, JS, Bash):
              </div>
              <div className="rounded-xl border border-[#28223e] bg-[#0f0d19] p-3 font-mono text-[11px] text-[var(--accent-hi)]">
                <div>```cpp</div>
                <div className="text-[var(--muted)] pl-2">#include &lt;iostream&gt;</div>
                <div className="text-[var(--muted)] pl-2">int main() &#123;</div>
                <div className="text-emerald-400 pl-4">std::cout &lt;&lt; &quot;Hello from Hoffle!&quot; &lt;&lt; std::endl;</div>
                <div className="text-[var(--muted)] pl-4">return 0;</div>
                <div className="text-[var(--muted)] pl-2">&#125;</div>
                <div>```</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-[var(--muted)]">
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <strong className="text-white">**bold**</strong> → <strong>bold</strong>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <em className="text-white">*italic*</em> → <em>italic</em>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <code className="text-purple-300">`code`</code> → <code className="text-xs">code</code>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <span className="text-white">||spoiler||</span> → spoiler
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => {
                  setDraft("```cpp\n#include <iostream>\n\nint main() {\n    std::cout << \"Hello from Hoffle!\" << std::endl;\n    return 0;\n}\n```");
                  setMarkdownModalOpen(false);
                  composerRef.current?.focus();
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent-strong)] hover:brightness-110 text-[var(--on-accent)] transition-colors cursor-pointer"
              >
                Insert C++ Code Template
              </button>
              <button
                type="button"
                onClick={() => setMarkdownModalOpen(false)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[#b8b0cf] transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ReactionPickerLayer({
  reactionPicker,
  setReactionPicker,
  inDmHome,
  activeServerId,
  canManageChannels,
  addQuickReaction,
  toggleReaction,
}: {
  reactionPicker: { messageId: string | number; top: number; right: number; mode?: "react" | "addToQuickReactions"; } | null;
  setReactionPicker: Dispatch<SetStateAction<{ messageId: string | number; top: number; right: number; mode?: "react" | "addToQuickReactions"; } | null>>;
  inDmHome: boolean;
  activeServerId: string | null;
  canManageChannels: boolean;
  addQuickReaction: (emojiToAdd: string) => void;
  toggleReaction: (messageId: string | number, emoji: string) => Promise<void>;
}) {
  return (
    <>
      {reactionPicker && (
        <div
          className="reaction-picker-overlay"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="reaction-picker-backdrop"
            onClick={() => setReactionPicker(null)}
          />
          <div
            className="reaction-picker-floating"
            style={{
              top: reactionPicker.top,
              right: reactionPicker.right,
            }}
          >
            <EmojiPicker
              className="discord-emoji-picker reaction-picker"
              serverId={inDmHome ? null : activeServerId}
              canManageEmojis={canManageChannels}
              title={
                reactionPicker.mode === "addToQuickReactions"
                  ? "Add to Quick Reactions"
                  : undefined
              }
              subtitle={
                reactionPicker.mode === "addToQuickReactions"
                  ? "Click any emoji to add to your message actions bar"
                  : undefined
              }
              onPickEmoji={(codeOrUrl, _isCustom, e) => {
                if (reactionPicker.mode === "addToQuickReactions" || e?.shiftKey) {
                  addQuickReaction(codeOrUrl);
                  setReactionPicker(null);
                  return;
                }
                void toggleReaction(reactionPicker.messageId, codeOrUrl);
                setReactionPicker(null);
              }}
              onClose={() => setReactionPicker(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}

export function ReactionViewerLayer({
  reactionViewer,
  setReactionViewer,
  messages,
  threadMessages,
  threadRoot,
  emojiMap,
  membersById,
  openProfile,
  user,
}: {
  reactionViewer: { messageId: string | number; emoji: string; top: number; left: number; } | null;
  setReactionViewer: Dispatch<SetStateAction<{ messageId: string | number; emoji: string; top: number; left: number; } | null>>;
  messages: Message[];
  threadMessages: Message[];
  threadRoot: Message | null;
  emojiMap: Record<string, string>;
  membersById: Map<string, Member>;
  openProfile: (member: Member, e?: React.MouseEvent) => void;
  user: PublicUser;
}) {
  return (
    <>
      {reactionViewer && (
        <div
          className="reaction-viewer-overlay"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="reaction-viewer-backdrop"
            onClick={() => setReactionViewer(null)}
          />
          <div
            className="reaction-viewer-floating"
            style={{
              top: reactionViewer.top,
              left: reactionViewer.left,
            }}
          >
            {(() => {
              const msg =
                messages.find((m) => m.id === reactionViewer.messageId) ||
                threadMessages.find((m) => m.id === reactionViewer.messageId) ||
                (threadRoot?.id === reactionViewer.messageId ? threadRoot : undefined);
              const reaction = msg?.reactions?.find(
                (r) => r.emoji === reactionViewer.emoji,
              );
              const users = reaction?.users || [];
              return (
                <>
                  <div className="reaction-viewer-header">
                    <span className="reaction-viewer-emoji">
                      {emojiMap[reactionViewer.emoji.replace(/^:|:$/g, "")] ? (
                        <img
                          className="custom-emoji"
                          src={
                            emojiMap[reactionViewer.emoji.replace(/^:|:$/g, "")]
                          }
                          alt={reactionViewer.emoji}
                        />
                      ) : (
                        <OutlineEmoji emoji={reactionViewer.emoji} />
                      )}
                    </span>
                    <span className="reaction-viewer-title">
                      {users.length}{" "}
                      {users.length === 1 ? "reaction" : "reactions"}
                    </span>
                    <button
                      type="button"
                      className="popup-close-x"
                      onClick={() => setReactionViewer(null)}
                      aria-label="Close reactions"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="reaction-viewer-list">
                    {users.length === 0 && (
                      <div className="reaction-viewer-empty">
                        No one has reacted yet.
                      </div>
                    )}
                    {users.map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        className="reaction-viewer-user"
                        onClick={(event) => {
                          const member = membersById.get(u.id);
                          if (member) openProfile(member, event);
                          setReactionViewer(null);
                        }}
                      >
                        <Avatar
                          name={u.displayName}
                          avatar={u.avatar}
                          avatarUrl={u.avatarUrl}
                          color={u.color}
                          size={28}
                        />
                        <span className="reaction-viewer-name">
                          {u.displayName}
                        </span>
                        <span className="reaction-viewer-username">
                          @{u.username}
                        </span>
                        {u.id === user?.id && (
                          <span className="reaction-viewer-you">You</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}

export function FloatingStreamPreview({
  floatingStream,
  pipDismissed,
  stageChannelId,
  voice,
  servers,
  voiceParticipants,
  streamPreferenceFor,
  setStreamVolume,
  toggleStreamMute,
  activeServerId,
  setActiveServerId,
  setStageChannelId,
  setPipDismissed,
}: {
  floatingStream: { stream: MediaStream; streamerName: string; kind: "screen" | "camera"; participantId: string | undefined; isSelf: boolean; } | null;
  pipDismissed: boolean;
  stageChannelId: string | null;
  voice: VoiceApi;
  servers: PublicServer[];
  voiceParticipants: VoiceParticipant[];
  streamPreferenceFor: (streamId: string, userId?: string) => { volume: number; muted: boolean; };
  setStreamVolume: (streamId: string, userId: string | undefined, volume: number) => void;
  toggleStreamMute: (streamId: string, userId: string | undefined) => void;
  activeServerId: string | null;
  setActiveServerId: Dispatch<SetStateAction<string | null>>;
  setStageChannelId: Dispatch<SetStateAction<string | null>>;
  setPipDismissed: Dispatch<SetStateAction<boolean>>;
}) {
  // Who is watching this share: the hub counts seats that tuned in.
  const streamer = floatingStream && !floatingStream.isSelf
    ? voiceParticipants.find((p) => p.id === floatingStream.participantId && p.screenStreamId)
    : null;
  const floatingViewers: string[] = !floatingStream || floatingStream.kind !== "screen"
    ? []
    : floatingStream.isSelf
      ? voice.streamViewers ?? []
      : streamer?.screenViewers ?? [];
  return (
    <>
      {floatingStream && !pipDismissed && stageChannelId !== voice.channelId && (
        <FloatingScreenPreview
          channelName={
            servers
              .flatMap((s) => s.channels)
              .find((c) => c.id === voice.channelId)?.name || "Voice Room"
          }
          stream={floatingStream.stream}
          streamerName={floatingStream.streamerName}
          streamKind={floatingStream.kind}
          viewerCount={floatingViewers.length}
          viewers={floatingViewers.map((connId) => {
            const p = voiceParticipants.find((vp) => vp.connectionId === connId);
            return {
              id: p?.id,
              displayName: p?.displayName || "Viewer",
              avatar: p?.avatar,
              avatarUrl: p?.avatarUrl,
            };
          })}
          latency={voice.latency}
          volume={streamPreferenceFor(floatingStream.stream.id, floatingStream.participantId).volume}
          muted={streamPreferenceFor(floatingStream.stream.id, floatingStream.participantId).muted}
          onVolumeChange={(vol) => setStreamVolume(floatingStream.stream.id, floatingStream.participantId, vol)}
          onToggleMute={() => toggleStreamMute(floatingStream.stream.id, floatingStream.participantId)}
          isSelf={floatingStream.isSelf}
          onMaximize={() => {
            if (voice.channelId) {
              const targetChannel = servers
                .flatMap((s) => s.channels)
                .find((c) => c.id === voice.channelId);
              if (targetChannel?.serverId && targetChannel.serverId !== activeServerId) {
                setActiveServerId(targetChannel.serverId);
              }
              setStageChannelId(voice.channelId);
              setPipDismissed(false);
            }
          }}
          onClose={() => setPipDismissed(true)}
        />
      )}
    </>
  );
}
