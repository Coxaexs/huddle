"use client";

import { type MouseEvent, type ReactNode } from "react";
import type { PlayerState } from "@/lib/protocol";
import { MessageAttachmentFiles } from "../../message-file-card";
import { MsnFileTransfer, fileNameFromUrl, findWink, playWink } from "../../msn-chrome";
import { GameCard } from "../../game-card";
import { type GameKind } from "@/lib/games";
import { stripTextStyle } from "@/lib/text-style";
import type { PublicChannel, PublicServer } from "@/lib/servers";
import { getMemberTagInfo } from "@/lib/permissions";
import { type Member, type PublicUser } from "@/lib/users";
import { Pin, Bookmark, BookmarkCheck, Pencil, Trash2, StickyNote, Hash, Volume2, Reply, MessageSquare, SmilePlus, Vote, UserPlus, MoreHorizontal, AtSign, ShieldAlert, Forward, LogOut } from "lucide-react";
import { Avatar } from "../../avatar";
import { DndCard } from "../../dnd-card";
import { BotEmbeds } from "../../bot-embeds";
import { LyricsNow } from "../../lyrics-now";
import { MessageBody, StyledText, type MentionChannel } from "../../message-body";
import { ServerInviteCard, type ResolvedInvite } from "../../server-invite-card";
import { PollCard } from "../../poll-card";
import type { MusicSettings } from "../../music-cards";
import { NowPlaying } from "../../now-playing";
import { OutlineEmoji } from "../../outline-emoji";
import { type Message, type DmSummary } from "../../../lib/chat/types";
import { QUICK_VOTES } from "../../../lib/chat/constants";
import { dayDividerLabel, formatClientTime, formatClientDateTime } from "../../../lib/chat/format";
import { extractInviteCodes } from "../../../lib/chat/invites";
import { MessageReactions } from "../message-reactions";
import { MessageEditor, MUSIC_CARD_KINDS, MusicPayloadCard } from "../message-parts";
import { type VoicePref } from "../../user-menu";
import { VoiceMessagePlayer } from "../../voice-message";
import { PrideBadges } from "../../pride-badges";
import { MemberTag } from "../../member-tag";
import { type ForwardMessageTarget } from "../../forward-message-dialog";
import { ForwardedMessageCard } from "../../forwarded-message-card";
import { ThemeShareCard } from "../../theme-share-card";
import { AiAnswerCard } from "../../ai-answer-card";
import { ImageGallery } from "../../image-gallery";
import { type Theme, importThemeCode } from "@/lib/themes";
import { unreadSinceLabel, withUnreadLine } from "../../../lib/chat/shell-helpers";
import type { RefObject, Dispatch, SetStateAction } from "react";
import type { ChannelKindInfo } from "@/lib/channel-kinds";
import type { HeadTrackingSource, SpatialOutput, VideoPause, RemoteVoiceStream, VoiceLatencyStats, ScreenShareQuality, RelayStatus } from "../../../hooks/use-voice";
import type { HeadTrackingStatus } from "../../../lib/head-tracking";
import type { BackgroundMode } from "../../../lib/virtual-background";
import type { MicSettings, MicTelemetry } from "../../../lib/mic-chain";
import type { ClientEvent, VoiceParticipant, RecordingState } from "@/lib/protocol";

export function MessageList({
  messagesScrollRef,
  handleMessagesScroll,
  activeChannelInfo,
  inDmHome,
  unreadBarVisible,
  unreadMarker,
  activeChannelId,
  jumpToFirstUnread,
  setUnreadBarVisible,
  msnTheme,
  hasOlder,
  loadOlder,
  isSelfDm,
  activeDm,
  channelTitle,
  activeChannel,
  messages,
  membersById,
  openUserMenu,
  jumpToMessage,
  setPinsOpen,
  user,
  canModerate,
  blockedUserIds,
  expandedBlockedMessages,
  setExpandedBlockedMessages,
  openActionsId,
  reactionPicker,
  ttsSpeakingId,
  handleMessageTouchStart,
  handleMessageTouchMove,
  handleMessageTouchEnd,
  longPressTriggeredRef,
  touchInput,
  setOpenActionsId,
  openBotMenu,
  openProfile,
  roleColorFor,
  activeServer,
  setEditHistoryId,
  voice,
  player,
  hub,
  openThread,
  setNotice,
  openProfileByHandle,
  setLightboxImage,
  emojiMap,
  runCommand,
  runMusicUiCommand,
  startGame,
  pollCounts,
  pollVoters,
  editingId,
  editDraft,
  setEditDraft,
  setEditingId,
  saveEdit,
  setPdfViewer,
  openMentionedChannel,
  pressBotComponent,
  applyTheme,
  resolvedInvites,
  servers,
  setActiveServerId,
  joinServerDirect,
  botStreaming,
  voiceChannels,
  prefFor,
  saveVoicePref,
  setLightbox,
  reactionViewer,
  toggleReaction,
  handleOpenReactionViewer,
  handleOpenReactionPicker,
  quickVoteId,
  quickReactions,
  removeQuickReaction,
  emojis,
  hiddenServerEmojiIds,
  hideServerEmoji,
  shiftPressed,
  mobileActionsMoreId,
  setReplyTarget,
  composerRef,
  setMobileActionsMoreId,
  savedIds,
  toggleSaved,
  setForwardTarget,
  setQuickVoteId,
  beginEdit,
  canPin,
  togglePin,
  deleteMessage,
  showCustomConfirm,
  messageEndRef,
}: {
  messagesScrollRef: RefObject<HTMLDivElement | null>;
  handleMessagesScroll: () => void;
  activeChannelInfo: ChannelKindInfo;
  inDmHome: boolean;
  unreadBarVisible: boolean;
  unreadMarker: { channelId: string; messageId: string; count: number; more: boolean; since: string; } | null;
  activeChannelId: string | null;
  jumpToFirstUnread: () => void;
  setUnreadBarVisible: Dispatch<SetStateAction<boolean>>;
  msnTheme: boolean;
  hasOlder: boolean;
  loadOlder: () => Promise<void>;
  isSelfDm: boolean;
  activeDm: DmSummary | null;
  channelTitle: string;
  activeChannel: PublicChannel | null;
  messages: Message[];
  membersById: Map<string, Member>;
  openUserMenu: (event: MouseEvent, member: Member, opts?: { dmChannelId?: string; dmPinned?: boolean; }) => void;
  jumpToMessage: (channelId: string, messageId: string) => void;
  setPinsOpen: Dispatch<SetStateAction<boolean>>;
  user: PublicUser;
  canModerate: boolean;
  blockedUserIds: Set<string>;
  expandedBlockedMessages: Set<string>;
  setExpandedBlockedMessages: Dispatch<SetStateAction<Set<string>>>;
  openActionsId: string | number | null;
  reactionPicker: { messageId: string | number; top: number; right: number; mode?: "react" | "addToQuickReactions"; } | null;
  ttsSpeakingId: string | null;
  handleMessageTouchStart: (messageId: string | number, e: React.TouchEvent) => void;
  handleMessageTouchMove: (e: React.TouchEvent) => void;
  handleMessageTouchEnd: () => void;
  longPressTriggeredRef: RefObject<boolean>;
  touchInput: boolean;
  setOpenActionsId: Dispatch<SetStateAction<string | number | null>>;
  openBotMenu: (event: MouseEvent, kind: "music" | "dnd") => void;
  openProfile: (member: Member, e?: React.MouseEvent) => void;
  roleColorFor: (member: Member | undefined) => string | null;
  activeServer: PublicServer | null;
  setEditHistoryId: Dispatch<SetStateAction<string | null>>;
  voice: { important: boolean; toggleImportant: () => void; tableSeatOrder: string[]; tableSeatPans: Record<string, number>; setTableSeatPans: Dispatch<SetStateAction<Record<string, number>>>; tableWidth: number; setTableWidth: Dispatch<SetStateAction<number>>; headTracking: boolean; setHeadTracking: (enabled: boolean) => void; headTrackingOffered: boolean; airpodsOffered: boolean; headTrackingSource: HeadTrackingSource; setHeadTrackingSource: (source: HeadTrackingSource) => void; spatialOutput: SpatialOutput; setSpatialOutput: (output: SpatialOutput) => void; headTrackingStatus: { status: HeadTrackingStatus; live: boolean; }; onHeadTracking: (status: HeadTrackingStatus, live: boolean) => void; recenterHead: () => void; tableMode: boolean; setTableMode: (enabled: boolean) => void; tableHostId: string; setTableHostId: Dispatch<SetStateAction<string>>; channelId: string | null; muted: boolean; forcedMute: boolean; setForcedMute: (next: boolean) => void; deafened: boolean; handRaised: boolean; toggleHand: () => void; hiddenVideo: Record<string, VideoPause>; setVideoHidden: (remoteId: string, which: keyof VideoPause, hidden: boolean) => void; setStageSpeaker: (targetConnectionId: string, allowed: boolean) => void; speaking: Set<string>; remoteStreams: RemoteVoiceStream[]; sfuMode: boolean; peerStates: Record<string, string>; screenSharing: boolean; streamViewers: string[]; signalStreamWatch: (streamerConnectionId: string, watching: boolean) => void; latency: VoiceLatencyStats; isSfu: boolean; voiceRegion: "nl" | "de" | null; switchRegion: (targetRegion?: "nl" | "de") => Promise<void>; screenShareAudio: boolean; setScreenShareAudio: (enabled: boolean) => void; hasScreenAudio: boolean; screenAudioMuted: boolean; toggleScreenAudio: () => void; screenQuality: "480p15" | "480p24" | "480p30" | "480p60" | "720p15" | "720p24" | "720p30" | "720p60" | "900p15" | "900p24" | "900p30" | "900p60" | "1080p15" | "1080p24" | "1080p30" | "1080p60"; setScreenQuality: (quality: ScreenShareQuality) => void; screenFilm: boolean; setScreenFilm: (enabled: boolean) => void; startScreenShare: (quality?: ScreenShareQuality, withAudio?: boolean, film?: boolean) => Promise<void>; stopScreenShare: () => void; cameraOn: boolean; cameraBackground: BackgroundMode; setCameraBackground: (mode: BackgroundMode) => Promise<void>; cameraBlurAmount: number; setCameraBlurAmount: (amount: number) => void; cameraBackgroundImage: string; setCameraBackgroundImage: (imageId: string) => void; startCamera: () => Promise<void>; stopCamera: () => void; switchMicrophone: () => Promise<void>; activeMicrophone: () => { deviceId: string; ended: boolean; } | null; micSettings: MicSettings; setMicSettings: (next: Partial<MicSettings>) => void; subscribeMicTelemetry: (listener: (telemetry: MicTelemetry) => void) => () => void; localVideos: { kind: "camera" | "screen"; stream: MediaStream; }[]; error: string; setError: Dispatch<SetStateAction<string>>; relay: RelayStatus; recheckRelay: () => Promise<void>; join: (nextChannelId: string, options?: { startMuted?: boolean; }) => Promise<void>; leave: () => void; toggleMute: () => void; toggleDeafen: () => void; handleSignal: (from: string, raw: unknown) => Promise<void>; takeClip: () => Promise<Blob | null>; clipSeconds: number; pushToTalk: boolean; pttKey: string; pttHeld: boolean; muteKey: string; deafenKey: string; setMuteKey: (combo: string) => void; setDeafenKey: (combo: string) => void; setPushToTalk: (enabled: boolean) => void; setPttKey: (code: string) => void; pttPress: () => void; pttRelease: () => void; speakIntoCall: (audio: Float32Array, sampleRate: number) => Promise<"sent" | "no-call" | "no-server" | "server-muted" | "busy" | "too-long">; stopSpeaking: () => void; canSpeak: () => boolean; };
  player: { position: number; blocked: boolean; unblock: () => void; prime: () => void; };
  hub: { send: (event: ClientEvent) => boolean; serverNow: () => number; connected: boolean; connectionId: string | null; session: number; online: Set<string>; voice: Record<string, VoiceParticipant[]>; players: Record<string, PlayerState>; recordings: Record<string, RecordingState>; forcedMutes: Set<string>; };
  openThread: (message: Message) => Promise<void>;
  setNotice: Dispatch<SetStateAction<string>>;
  openProfileByHandle: (handle: string) => void;
  setLightboxImage: (img: string | null) => void;
  emojiMap: Record<string, string>;
  runCommand: (raw: string) => Promise<void>;
  runMusicUiCommand: (raw: string, roomHint?: string) => Promise<MusicSettings | void>;
  startGame: (kind: GameKind, solo?: boolean) => Promise<void>;
  pollCounts: Record<string, number[]>;
  pollVoters: Record<string, { id: string; name: string; }[][]>;
  editingId: string | number | null;
  editDraft: string;
  setEditDraft: Dispatch<SetStateAction<string>>;
  setEditingId: Dispatch<SetStateAction<string | number | null>>;
  saveEdit: (message: Message) => Promise<void>;
  setPdfViewer: Dispatch<SetStateAction<{ url: string; name: string; } | null>>;
  openMentionedChannel: (target: MentionChannel) => void;
  pressBotComponent: (message: Message, customId: string, componentType: number, values?: string[]) => Promise<void>;
  applyTheme: (next: "cozy" | "legacy" | "light" | Theme) => void;
  resolvedInvites: Record<string, ResolvedInvite>;
  servers: PublicServer[];
  setActiveServerId: Dispatch<SetStateAction<string | null>>;
  joinServerDirect: (rawInput?: string) => Promise<void>;
  botStreaming: boolean;
  voiceChannels: PublicChannel[];
  prefFor: (id: string) => VoicePref;
  saveVoicePref: (targetId: string, patch: { volume?: number; muted?: boolean; serverMuted?: boolean; }) => Promise<void>;
  setLightbox: Dispatch<SetStateAction<{ images: string[]; index: number; } | null>>;
  reactionViewer: { messageId: string | number; emoji: string; top: number; left: number; } | null;
  toggleReaction: (messageId: string | number, emoji: string) => Promise<void>;
  handleOpenReactionViewer: (e: React.MouseEvent, messageId: string | number, emoji: string) => void;
  handleOpenReactionPicker: (e: React.MouseEvent, messageId: string | number, mode?: "react" | "addToQuickReactions") => void;
  quickVoteId: string | number | null;
  quickReactions: string[];
  removeQuickReaction: (emojiToRemove: string) => void;
  emojis: { id: string; serverId: string; name: string; url: string; }[];
  hiddenServerEmojiIds: string[];
  hideServerEmoji: (id: string, name: string) => void;
  shiftPressed: boolean;
  mobileActionsMoreId: string | number | null;
  setReplyTarget: Dispatch<SetStateAction<Message | null>>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  setMobileActionsMoreId: Dispatch<SetStateAction<string | number | null>>;
  savedIds: Set<string>;
  toggleSaved: (messageId: string) => Promise<void>;
  setForwardTarget: Dispatch<SetStateAction<ForwardMessageTarget | null>>;
  setQuickVoteId: Dispatch<SetStateAction<string | number | null>>;
  beginEdit: (message: Message) => void;
  canPin: boolean;
  togglePin: (message: Message) => Promise<void>;
  deleteMessage: (id: string | number) => Promise<void>;
  showCustomConfirm: (options: { title: string; message?: string; isDanger?: boolean; confirmText?: string; cancelText?: string; onConfirm: () => void; onCancel?: () => void; }) => void;
  messageEndRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
                ref={messagesScrollRef}
                onScroll={handleMessagesScroll}
                className={`messages ${activeChannelInfo.threadContainer && !inDmHome ? "forum-list-hidden" : ""}`}
                aria-live="polite"
              >
                {unreadBarVisible && unreadMarker?.channelId === activeChannelId && (
                  <div className="unread-bar" role="status">
                    <button type="button" className="unread-bar-jump" onClick={jumpToFirstUnread}>
                      {unreadMarker.count > 99 ? "99+" : unreadMarker.count}
                      {unreadMarker.more ? "+" : ""} new message{unreadMarker.count === 1 ? "" : "s"}
                      {unreadMarker.since ? ` since ${unreadSinceLabel(unreadMarker.since)}` : ""}
                    </button>
                    <button
                      type="button"
                      className="unread-bar-dismiss"
                      onClick={() => setUnreadBarVisible(false)}
                    >
                      Mark as read
                    </button>
                  </div>
                )}
                {msnTheme && (
                  <p className="msn-warning">
                    Never give out your password or credit card number in an instant message conversation.
                  </p>
                )}
                {hasOlder && (
                  <button type="button" className="load-older" onClick={() => void loadOlder()}>
                    Load earlier messages
                  </button>
                )}
                {!hasOlder && <div className="channel-intro">
                  <div className="cozy-intro-pill">
                    <span className="cozy-intro-icon">
                      {inDmHome ? (
                        isSelfDm ? (
                          <StickyNote size={13} />
                        ) : (
                          <AtSign size={13} />
                        )
                      ) : (
                        <Hash size={13} />
                      )}
                    </span>
                    <span className="cozy-intro-text">
                      {inDmHome
                        ? isSelfDm
                          ? "This is your personal space for notes, drafts, and reminders."
                          : activeDm?.group
                            ? `welcome to the beginning of ${channelTitle}`
                            : `this is the beginning of your conversation with ${channelTitle}`
                        : `welcome to #${channelTitle}${activeChannel?.topic ? ` — ${activeChannel.topic}` : ""}`}
                    </span>
                  </div>
                  <div className="legacy-intro-content">
                    <div className="intro-icon">
                      {inDmHome ? (isSelfDm ? "📝" : "@") : "#"}
                    </div>
                    <h2>{inDmHome ? channelTitle : `Welcome to #${channelTitle}`}</h2>
                    <p>
                      {inDmHome
                        ? isSelfDm
                          ? "Messages sent here are private and only visible to you. Great for jotting down thoughts, saving links, or staging drafts."
                          : activeDm?.group
                            ? "Welcome to the beginning of this group. Only its members can see it."
                            : "This conversation is only visible to the two of you."
                        : "This is the start of the channel. Be excellent to each other."}
                    </p>
                  </div>
                </div>}

                {messages.map((message, index) => withUnreadLine(
                  unreadMarker?.channelId === activeChannelId &&
                    String(message.id) === unreadMarker.messageId &&
                    index > 0,
                  message.id,
                  ((): ReactNode => {
                  const dayLabel = dayDividerLabel(message, messages[index - 1]) ?? undefined;
                  if (message.kind?.startsWith("system-")) {
                    const pinnedId =
                      message.kind === "system-pin" &&
                        message.payload &&
                        typeof (message.payload as { messageId?: unknown }).messageId === "string"
                        ? (message.payload as { messageId: string }).messageId
                        : null;
                    const actor =
                      (message.userId && membersById.get(message.userId)) ||
                      (message.userId &&
                        activeDm?.group?.members.find((m) => m.id === message.userId)) ||
                      null;
                    const actorName = actor?.displayName || message.author;
                    // The stored text starts with the name it had when posted;
                    // show the current name and keep the rest of the sentence.
                    const rest = message.text.startsWith(message.author)
                      ? message.text.slice(message.author.length)
                      : ` ${message.text}`;
                    return (
                      <div
                        key={message.id}
                        id={`msg-${message.id}`}
                        data-day={dayLabel}
                        className={`system-message system-message--${message.kind.slice(7)}`}
                      >
                        <span className="system-message-icon" aria-hidden="true">
                          {message.kind === "system-pin" ? (
                            <Pin size={15} />
                          ) : message.kind === "system-group-leave" ||
                            message.kind === "system-group-remove" ? (
                            <LogOut size={15} />
                          ) : message.kind === "system-group-rename" ? (
                            <Pencil size={15} />
                          ) : (
                            <UserPlus size={15} />
                          )}
                        </span>
                        <p>
                          <button
                            type="button"
                            className="system-message-actor"
                            onClick={(event) => {
                              if (actor) openUserMenu(event, actor as Member);
                            }}
                          >
                            {actorName}
                          </button>
                          {message.kind === "system-pin" ? (
                            <>
                              {" pinned "}
                              {pinnedId ? (
                                <button
                                  type="button"
                                  className="system-message-link"
                                  onClick={() => {
                                    if (activeChannelId) jumpToMessage(activeChannelId, pinnedId);
                                  }}
                                >
                                  a message
                                </button>
                              ) : (
                                "a message"
                              )}
                              {" to this channel. See all "}
                              <button
                                type="button"
                                className="system-message-link"
                                onClick={() => setPinsOpen(true)}
                              >
                                pinned messages
                              </button>
                              .
                            </>
                          ) : (
                            rest
                          )}
                          <time title={formatClientDateTime(message.createdAt)}>
                            {formatClientTime(message.createdAt, message.time)}
                          </time>
                        </p>
                      </div>
                    );
                  }
                  const author = message.userId
                    ? membersById.get(message.userId)
                    : undefined;
                  const canDelete =
                    message.userId === user.id ||
                    message.bot ||
                    user.isAdmin ||
                    canModerate;

                  const isBlockedUser = Boolean(
                    message.userId && blockedUserIds.has(message.userId),
                  );
                  const isBlockedExpanded = expandedBlockedMessages.has(String(message.id));

                  if (isBlockedUser && !isBlockedExpanded) {
                    return (
                      <div key={message.id} className="blocked-message-notice">
                        <div className="flex items-center gap-2">
                          <ShieldAlert size={14} className="text-rose-400 shrink-0" />
                          <span>1 Blocked message ({message.author})</span>
                        </div>
                        <button
                          type="button"
                          className="blocked-message-toggle"
                          onClick={() => {
                            setExpandedBlockedMessages((prev) =>
                              new Set(prev).add(String(message.id)),
                            );
                          }}
                        >
                          Show message
                        </button>
                      </div>
                    );
                  }

                  if (message.payload?.nudge) {
                    return (
                      <div key={message.id} id={`msg-${message.id}`} className="nudge-line">
                        <span className="nudge-line-rule" aria-hidden="true" />
                        {message.userId === user.id
                          ? "You have just sent a nudge."
                          : `${stripTextStyle(author?.displayName || message.author)} has just sent you a nudge.`}
                        <span className="nudge-line-rule" aria-hidden="true" />
                      </div>
                    );
                  }
                  const wink = findWink(message.payload?.wink);
                  if (wink) {
                    return (
                      <div key={message.id} id={`msg-${message.id}`} className="nudge-line wink-line">
                        <span className="nudge-line-rule" aria-hidden="true" />
                        <span className="wink-line-emoji" aria-hidden="true">{wink.emoji}</span>
                        {message.userId === user.id
                          ? `You have just sent a wink: ${wink.name}.`
                          : `${stripTextStyle(author?.displayName || message.author)} has just sent you a wink: ${wink.name}.`}
                        <button type="button" className="wink-replay" onClick={() => playWink(wink.id)}>
                          Play
                        </button>
                        <span className="nudge-line-rule" aria-hidden="true" />
                      </div>
                    );
                  }

                  // Collapse the avatar/name header when the same author sends a
                  // burst of messages close together — but never for replies or
                  // rich cards, which each need their own header.
                  const prev = index > 0 ? messages[index - 1] : undefined;
                  const sameAuthor =
                    !!prev &&
                    Boolean(prev.bot) === Boolean(message.bot) &&
                    (message.bot
                      ? prev.author === message.author
                      : !!prev.userId && prev.userId === message.userId);
                  const closeInTime =
                    !!prev && message.createdAt && prev.createdAt
                      ? new Date(message.createdAt).getTime() -
                      new Date(prev.createdAt).getTime() <
                      7 * 60 * 1000
                      : true;
                  const continuation =
                    !dayLabel &&
                    sameAuthor &&
                    closeInTime &&
                    !message.replyTo &&
                    // A run of command answers from the same bot groups too;
                    // each keeps its small "x used /cmd" line. MSN repeats
                    // the "says:" header on every message, so it opts out.
                    (!message.commandText || (Boolean(message.bot) && !msnTheme)) &&
                    (!message.kind || message.kind === "voice") &&
                    (!prev?.kind || prev.kind === "voice");
                  return (
                    <article
                      id={`msg-${message.id}`}
                      data-day={dayLabel}
                      className={`message ${continuation ? "continuation" : ""} ${message.pinned ? "is-pinned" : ""
                        } ${openActionsId === message.id ? "actions-open" : ""} ${reactionPicker?.messageId === message.id
                          ? "actions-open reaction-picker-active"
                          : ""
                        } ${user && message.mentions?.includes(user.id) ? "mentions-me" : ""
                        } ${ttsSpeakingId === String(message.id) ? "tts-speaking" : ""}`}
                      key={message.id}
                      onTouchStart={(e) => handleMessageTouchStart(message.id, e)}
                      onTouchMove={handleMessageTouchMove}
                      onTouchEnd={handleMessageTouchEnd}
                      onTouchCancel={handleMessageTouchEnd}
                      onContextMenu={(event) => {
                        if (longPressTriggeredRef.current || touchInput) {
                          event.preventDefault();
                          event.stopPropagation();
                          setOpenActionsId(message.id);
                          return;
                        }
                        if (message.bot) {
                          openBotMenu(
                            event,
                            message.author.toLowerCase().includes("d&d")
                              ? "dnd"
                              : "music",
                          );
                        }
                      }}
                    >
                      {isBlockedUser && (
                        <div className="col-span-full flex items-center justify-between text-[11px] text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-md mb-2">
                          <span className="flex items-center gap-1.5 font-bold">
                            <ShieldAlert size={12} /> Message from blocked user
                          </span>
                          <button
                            type="button"
                            className="text-xs font-bold underline hover:text-rose-300 cursor-pointer"
                            onClick={() => {
                              setExpandedBlockedMessages((prev) => {
                                const n = new Set(prev);
                                n.delete(String(message.id));
                                return n;
                              });
                            }}
                          >
                            Hide message
                          </button>
                        </div>
                      )}
                      {continuation ? (
                        <span className="message-gutter" aria-hidden="true">
                          <time title={formatClientDateTime(message.createdAt)}>
                            {formatClientTime(message.createdAt, message.time)}
                          </time>
                        </span>
                      ) : (
                        <Avatar
                          className={`avatar ${message.bot ? "bot-avatar" : ""}`}
                          avatar={author?.avatar || message.avatar}
                          avatarUrl={author?.avatarUrl}
                          color={author?.color || message.color}
                          onContextMenu={(event) => {
                            if (author) openUserMenu(event, author);
                          }}
                          onClick={(event) => {
                            // Same as clicking the name: show their profile card,
                            // opened beside the avatar. Right-click keeps the menu.
                            if (author) openProfile(author, event);
                          }}
                        />
                      )}
                      <div className="message-body">
                        {message.commandText && (
                          <div className="command-invocation">
                            <span className="reply-arrow">↩</span>
                            <strong>{message.commandBy || "someone"}</strong>
                            <span className="command-used">used</span>
                            <code>{message.commandText}</code>
                          </div>
                        )}
                        {message.replyTo && (
                          <button
                            type="button"
                            className="reply-preview"
                            onClick={() =>
                              document
                                .getElementById(`msg-${message.replyTo}`)
                                ?.scrollIntoView({ behavior: "smooth", block: "center" })
                            }
                          >
                            <span className="reply-arrow">↩</span>
                            <strong>{message.replyPreview?.author || "someone"}</strong>
                            <span className="reply-snippet">
                              {message.replyPreview?.text || "message"}
                            </span>
                          </button>
                        )}
                        {!continuation && (
                          <div className="message-meta">
                            <strong
                              className={author ? "clickable-name" : ""}
                              style={{ color: roleColorFor(author) || undefined }}
                              onContextMenu={(event) => {
                                if (author) openUserMenu(event, author);
                              }}
                              onClick={() => {
                                if (author) openProfile(author);
                              }}
                            >
                              <StyledText text={author?.displayName || message.author} />
                            </strong>
                            {!inDmHome && activeServer && author && (
                              <MemberTag tag={getMemberTagInfo(author, activeServer)} size="small" />
                            )}
                            {author && <PrideBadges badges={author.prideBadges} mini />}
                            {message.bot && <span className="bot-tag">BOT</span>}
                            {message.payload?.tts && (
                              <span
                                className={`tts-tag ${ttsSpeakingId === String(message.id) ? "speaking" : ""}`}
                                title="Sent with /tts: read aloud to everyone in the channel"
                              >
                                <Volume2 size={12} aria-hidden="true" /> TTS
                              </span>
                            )}
                            <time title={formatClientDateTime(message.createdAt)}>
                              {formatClientTime(message.createdAt, message.time)}
                            </time>
                            {message.editedAt && (
                              <button
                                type="button"
                                className="edited-tag"
                                title={`Edited ${formatClientDateTime(message.editedAt)} · show history`}
                                onClick={() => setEditHistoryId(String(message.id))}
                              >
                                (edited)
                              </button>
                            )}
                            {message.pinned && (
                              <span className="pin-tag flex items-center gap-1" title="Pinned">
                                <Pin size={12} />
                              </span>
                            )}
                          </div>
                        )}

                        {message.kind === "lyricsnow" && message.payload?.lines ? (
                          <LyricsNow
                            track={typeof message.payload.track === "string" ? message.payload.track : message.payload.track?.title}
                            artist={message.payload.artist}
                            lines={message.payload.lines}
                            loose={Boolean(message.payload.loose)}
                            trackKey={message.payload.trackId ? String(message.payload.trackId) : undefined}
                            positionMs={
                              message.payload.voiceChannelId === voice.channelId
                                ? player.position
                                : undefined
                            }
                            live={
                              message.payload.voiceChannelId === voice.channelId &&
                              hub.players[voice.channelId!]?.track?.id ===
                              message.payload.trackId
                            }
                          />
                        ) : message.kind === "ai" ? (
                          <AiAnswerCard
                            messageId={message.id}
                            channelId={activeChannelId}
                            question={message.payload?.question}
                            sources={message.payload?.sources}
                            threadCount={message.threadCount}
                            onOpenThread={() => void openThread(message)}
                            onError={setNotice}
                          >
                            <MessageBody
                              text={message.text}
                              selfHandle={user.username}
                              onMention={openProfileByHandle}
                              onImage={setLightboxImage}
                              emojis={emojiMap}
                            />
                          </AiAnswerCard>
                        ) : message.kind === "dnd" && message.payload ? (
                          <DndCard
                            {...message.payload}
                            onCommand={(command) => void runCommand(command)}
                          />
                        ) : MUSIC_CARD_KINDS.has(message.kind || "") && message.payload ? (
                          <MusicPayloadCard
                            kind={message.kind || ""}
                            payload={message.payload}
                            onCommand={(command) =>
                              runMusicUiCommand(
                                command,
                                message.payload?.voiceChannelId,
                              )
                            }
                          />
                        ) : message.kind === "voice" && message.audio ? (
                          <VoiceMessagePlayer
                            src={message.audio}
                            durationMs={message.payload?.voice?.durationMs}
                            waveform={message.payload?.voice?.waveform}
                          />
                        ) : message.kind === "game" && message.payload?.game ? (
                          <GameCard
                            messageId={String(message.id)}
                            game={message.payload.game}
                            userId={user.id}
                            onPlayAgain={(kind, solo) => void startGame(kind, solo)}
                          />
                        ) : message.kind === "poll" && message.payload?.pollId ? (
                          <PollCard
                            pollId={message.payload.pollId}
                            question={message.payload.question || message.text}
                            options={message.payload.options || []}
                            multi={message.payload.multi}
                            liveCounts={pollCounts[message.payload.pollId]}
                            liveVoters={pollVoters[message.payload.pollId]}
                          />
                        ) : editingId === message.id ? (
                          <MessageEditor
                            value={editDraft}
                            onChange={setEditDraft}
                            onCancel={() => setEditingId(null)}
                            onSave={() => void saveEdit(message)}
                          />
                        ) : message.payload?.forwardedFrom ? (
                          <ForwardedMessageCard
                            data={message.payload.forwardedFrom}
                            comment={message.text}
                            selfHandle={user.username}
                            emojis={emojiMap}
                            onMention={openProfileByHandle}
                            onImage={setLightboxImage}
                            onPdf={setPdfViewer}
                            formatTime={(d) => formatClientTime(d, "")}
                          />
                        ) : (
                          <MessageBody
                            text={message.text}
                            selfHandle={user.username}
                            onMention={openProfileByHandle}
                            onImage={setLightboxImage}
                            emojis={emojiMap}
                            linkPreviews
                            channels={activeServer?.channels}
                            roles={activeServer?.roles}
                            onChannel={openMentionedChannel}
                          />
                        )}

                        {!message.kind &&
                          (message.payload?.embeds?.length ||
                            message.payload?.components?.length) ? (
                          <BotEmbeds
                            embeds={message.payload.embeds}
                            components={message.payload.components}
                            selfHandle={user.username}
                            onMention={openProfileByHandle}
                            onImage={setLightboxImage}
                            emojis={emojiMap}
                            onComponent={(customId, componentType, values) =>
                              pressBotComponent(message, customId, componentType, values)
                            }
                          />
                        ) : null}

                        {message.payload?.themeShare && (
                          <ThemeShareCard
                            theme={message.payload.themeShare}
                            onApplyTheme={(th) => applyTheme(th)}
                          />
                        )}

                        {!message.payload?.themeShare && message.text?.includes("huddle-theme:v1:") && (() => {
                          const match = message.text.match(/huddle-theme:v1:[a-zA-Z0-9+/=_-]+/);
                          if (!match) return null;
                          const parsed = importThemeCode(match[0]);
                          if (!parsed) return null;
                          return (
                            <ThemeShareCard
                              theme={parsed}
                              onApplyTheme={(th) => applyTheme(th)}
                            />
                          );
                        })()}

                        {extractInviteCodes(message.text).map((code) => {
                          const inv = resolvedInvites[code];
                          if (!inv) return null;
                          const isCurrentlyMember = inv.server
                            ? servers.some((s) => s.id === inv.server?.id)
                            : false;
                          return (
                            <ServerInviteCard
                              key={code}
                              invite={inv}
                              isMember={isCurrentlyMember}
                              onJoin={() => {
                                if (isCurrentlyMember && inv.server) {
                                  setActiveServerId(inv.server.id);
                                } else {
                                  void joinServerDirect(code);
                                }
                              }}
                            />
                          );
                        })}

                        {message.kind === "nowplaying" &&
                          message.payload?.voiceChannelId && (
                            <NowPlaying
                              state={hub.players[message.payload.voiceChannelId] || null}
                              trackId={message.payload.trackId}
                              trackLabel={message.payload.label}
                              position={
                                voice.channelId === message.payload.voiceChannelId
                                  ? player.position
                                  : 0
                              }
                              controllable={
                                voice.channelId === message.payload.voiceChannelId
                              }
                              blocked={!botStreaming && player.blocked}
                              onUnblock={player.unblock}
                              voiceChannelName={
                                voiceChannels.find(
                                  (channel) =>
                                    channel.id === message.payload?.voiceChannelId,
                                )?.name
                              }
                              onSeek={(positionMs) =>
                                hub.send({
                                  t: "player",
                                  channelId: message.payload!.voiceChannelId!,
                                  action: { name: "seek", positionMs },
                                })
                              }
                              onToggle={() =>
                                hub.send({
                                  t: "player",
                                  channelId: message.payload!.voiceChannelId!,
                                  action: { name: "toggle" },
                                })
                              }
                              onSkip={() =>
                                hub.send({
                                  t: "player",
                                  channelId: message.payload!.voiceChannelId!,
                                  action: { name: "skip" },
                                })
                              }
                              volume={prefFor("bot:music").volume}
                              onVolume={(volume) =>
                                void saveVoicePref("bot:music", { volume })
                              }
                            />
                          )}

                        {message.link && (
                          <a
                            className="bot-action"
                            href={message.link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {message.actionLabel || "Open"}
                            <span aria-hidden="true">↗</span>
                          </a>
                        )}
                        {message.audio && message.kind !== "voice" && (
                          <audio
                            className="message-audio"
                            controls
                            preload="none"
                            src={message.audio}
                          />
                        )}
                        <MsnFileTransfer
                          enabled={msnTheme && !message.bot}
                          messageId={String(message.id)}
                          mine={message.userId === user.id}
                          fromName={author?.displayName || message.author}
                          createdAt={message.createdAt}
                          fileNames={[
                            ...[message.image, ...(message.images || [])]
                              .filter((img): img is string => typeof img === "string" && Boolean(img))
                              .map(fileNameFromUrl),
                            ...((message.files || (message.file ? [message.file] : [])).map((f: { name: string }) => f.name)),
                          ]}
                        >
                        {(() => {
                          const allImages = [
                            message.image,
                            ...(message.images || []),
                          ].filter((img): img is string => typeof img === "string" && Boolean(img));
                          if (allImages.length === 0) return null;
                          return (
                            <ImageGallery
                              images={allImages}
                              onOpenLightbox={(imgs, idx) =>
                                setLightbox({ images: imgs, index: idx })
                              }
                            />
                          );
                        })()}
                        <MessageAttachmentFiles
                          files={message.files || message.file}
                          onPdf={(pdf) => setPdfViewer(pdf)}
                        />
                        </MsnFileTransfer>

                        {(message.threadCount ?? 0) > 0 && message.kind !== "ai" && (
                          <button
                            type="button"
                            className="thread-link inline-flex items-center gap-1.5"
                            onClick={() => void openThread(message)}
                          >
                            <MessageSquare size={14} /> {message.threadCount}{" "}
                            {message.threadCount === 1 ? "reply" : "replies"}
                          </button>
                        )}

                        {message.reactions && message.reactions.length > 0 && (
                          <MessageReactions
                            reactions={message.reactions}
                            emojiMap={emojiMap}
                            viewerEmoji={reactionViewer?.messageId === message.id ? reactionViewer.emoji : null}
                            pickerOpen={reactionPicker?.messageId === message.id}
                            onToggle={(emoji) => void toggleReaction(message.id, emoji)}
                            onOpenViewer={(e, emoji) => handleOpenReactionViewer(e, message.id, emoji)}
                            onOpenPicker={(e, mode) => handleOpenReactionPicker(e, message.id, mode)}
                          />
                        )}

                        {quickVoteId === message.id && (
                          <div className="quick-vote">
                            <span className="quick-vote-title">Vote</span>
                            {QUICK_VOTES.map((emoji) => {
                              const reacted =
                                message.reactions?.find((r) => r.emoji === emoji)?.mine ||
                                false;
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  className={`reaction ${reacted ? "mine" : ""}`}
                                  onClick={() =>
                                    void toggleReaction(message.id, emoji)
                                  }
                                >
                                  <OutlineEmoji emoji={emoji} />
                                  <b>
                                    {message.reactions?.find((r) => r.emoji === emoji)
                                      ?.count || 0}
                                  </b>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Touch-only: reveal this message's actions on tap instead of
                  showing every message's full bar at once. */}
                      <button
                        type="button"
                        className="message-actions-toggle"
                        aria-label="Message actions"
                        onClick={() =>
                          setOpenActionsId((current) =>
                            current === message.id ? null : message.id,
                          )
                        }
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      <div className="message-actions">
                        <div className="quick-reactions">
                          {quickReactions.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className="quick-react-outline-btn"
                              title={`React ${emoji} · Shift-click to remove`}
                              onClick={(e) => {
                                if (e.shiftKey) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  removeQuickReaction(emoji);
                                  if (message.reactions?.some((r) => r.emoji === emoji && r.mine)) {
                                    void toggleReaction(message.id, emoji);
                                  }
                                  return;
                                }
                                void toggleReaction(message.id, emoji);
                                setOpenActionsId(null);
                              }}
                            >
                              {emojiMap[emoji.replace(/^:|:$/g, "")] ? (
                                <img
                                  className="custom-emoji"
                                  src={emojiMap[emoji.replace(/^:|:$/g, "")]}
                                  alt={emoji}
                                />
                              ) : (
                                <OutlineEmoji emoji={emoji} />
                              )}
                            </button>
                          ))}
                          {/* The server's own emoji, right where you react. */}
                          {emojis
                            .filter((emoji) => {
                              const code = `:${emoji.name}:`;
                              const clean = emoji.name;
                              return (
                                !hiddenServerEmojiIds.includes(emoji.id) &&
                                !hiddenServerEmojiIds.includes(clean) &&
                                !hiddenServerEmojiIds.includes(code) &&
                                !quickReactions.includes(code) &&
                                !quickReactions.includes(clean)
                              );
                            })
                            .slice(0, 4)
                            .map((emoji) => {
                              const emojiCode = `:${emoji.name}:`;
                              return (
                                <button
                                  key={emoji.id}
                                  type="button"
                                  title={`React ${emojiCode} · Shift-click to remove`}
                                  onClick={(e) => {
                                    if (e.shiftKey) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      hideServerEmoji(emoji.id, emoji.name);
                                      if (
                                        message.reactions?.some(
                                          (r) =>
                                            (r.emoji === emojiCode || r.emoji === emoji.name) &&
                                            r.mine,
                                        )
                                      ) {
                                        void toggleReaction(message.id, emojiCode);
                                      }
                                      return;
                                    }
                                    void toggleReaction(message.id, emojiCode);
                                    setOpenActionsId(null);
                                  }}
                                >
                                  <img className="custom-emoji" src={emoji.url} alt={emoji.name} />
                                </button>
                              );
                            })}
                          <button
                            type="button"
                            title="Add reaction · Shift-click to add to quick reactions"
                            className={`add-reaction-action-btn ${reactionPicker?.messageId === message.id ? "active" : ""}`}
                            onClick={(e) => {
                              if (e.shiftKey) {
                                e.preventDefault();
                                e.stopPropagation();
                                handleOpenReactionPicker(e, message.id, "addToQuickReactions");
                                return;
                              }
                              handleOpenReactionPicker(e, message.id, "react");
                            }}
                          >
                            <SmilePlus size={16} />
                          </button>
                        </div>
                        {/* Show extra actions when Shift is held on desktop or when More is tapped on mobile */}
                        {(shiftPressed || mobileActionsMoreId === message.id) && (
                          <>
                            <button
                              type="button"
                              title="Reply"
                              onClick={() => {
                                setReplyTarget(message);
                                composerRef.current?.focus();
                                setOpenActionsId(null);
                                setMobileActionsMoreId(null);
                              }}
                            >
                              <Reply size={16} />
                            </button>
                            <button
                              type="button"
                              title={savedIds.has(String(message.id)) ? "Remove from saved" : "Save for later"}
                              onClick={() => {
                                void toggleSaved(String(message.id));
                                setOpenActionsId(null);
                                setMobileActionsMoreId(null);
                              }}
                            >
                              {savedIds.has(String(message.id)) ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                            </button>
                            <button
                              type="button"
                              title="Reply in thread"
                              onClick={() => {
                                void openThread(message);
                                setOpenActionsId(null);
                                setMobileActionsMoreId(null);
                              }}
                            >
                              <MessageSquare size={16} />
                            </button>
                            <button
                              type="button"
                              title="Forward"
                              onClick={() => {
                                const chName = inDmHome
                                  ? activeDm?.user.displayName
                                  : activeChannel?.name;
                                const srvName = inDmHome ? undefined : activeServer?.name;
                                setForwardTarget({
                                  id: message.id,
                                  author: author?.displayName || message.author,
                                  avatar: author?.avatar || message.avatar,
                                  avatarUrl: author?.avatarUrl,
                                  color: author?.color || message.color,
                                  text: message.text,
                                  createdAt: message.createdAt,
                                  image: message.image,
                                  images: message.images,
                                  file: message.file,
                                  channelId: message.channelId || activeChannelId,
                                  channelName: chName,
                                  serverName: srvName,
                                });
                                setOpenActionsId(null);
                                setMobileActionsMoreId(null);
                              }}
                            >
                              <Forward size={16} />
                            </button>
                            <button
                              type="button"
                              title="Quick vote"
                              onClick={() => {
                                setQuickVoteId((current) =>
                                  current === message.id ? null : message.id,
                                );
                                setOpenActionsId(null);
                                setMobileActionsMoreId(null);
                              }}
                            >
                              <Vote size={16} />
                            </button>
                            {message.userId === user.id && !message.bot && (
                              <button
                                type="button"
                                title="Edit"
                                onClick={() => {
                                  beginEdit(message);
                                  setOpenActionsId(null);
                                  setMobileActionsMoreId(null);
                                }}
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                            {canPin && (
                              <button
                                type="button"
                                title={message.pinned ? "Unpin" : "Pin"}
                                onClick={() => {
                                  void togglePin(message);
                                  setOpenActionsId(null);
                                  setMobileActionsMoreId(null);
                                }}
                              >
                                <Pin size={16} />
                              </button>
                            )}
                          </>
                        )}

                        {/* Mobile more button to unfold secondary actions */}
                        {!shiftPressed && (
                          <button
                            type="button"
                            className={`message-action-mobile-more ${mobileActionsMoreId === message.id ? "active" : ""}`}
                            title={mobileActionsMoreId === message.id ? "Fewer actions" : "More actions (or hold Shift)"}
                            aria-label="More actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMobileActionsMoreId((curr) => (curr === message.id ? null : message.id));
                            }}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        )}

                        {/* Delete button always available */}
                        {canDelete && (
                          <button
                            type="button"
                            title="Delete (Hold Shift to skip confirmation)"
                            onClick={(event) => {
                              setOpenActionsId(null);
                              setMobileActionsMoreId(null);
                              if (event.shiftKey) {
                                void deleteMessage(message.id);
                              } else {
                                showCustomConfirm({
                                  title: "Delete Message",
                                  message:
                                    "Are you sure you want to delete this message? Pro tip: You can delete while pressing Shift to skip this confirmation.",
                                  isDanger: true,
                                  confirmText: "Delete",
                                  cancelText: "Cancel",
                                  onConfirm: () => {
                                    void deleteMessage(message.id);
                                  },
                                });
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })()))}
                <div ref={messageEndRef} />
              </div>
  );
}
