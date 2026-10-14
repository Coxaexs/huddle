"use client";

import type { SpeakingStore } from "../../../lib/speaking-store";
import { useStableFns } from "../../../hooks/use-stable-fns";
import { type MouseEvent } from "react";
import type { PlayerState } from "@/lib/protocol";
import { type GameKind } from "@/lib/games";
import type { PublicChannel, PublicServer } from "@/lib/servers";
import { type Member, type PublicUser } from "@/lib/users";
import { StickyNote, Hash, AtSign } from "lucide-react";
import { type MentionChannel } from "../../message-body";
import { type ResolvedInvite } from "../../server-invite-card";
import type { MusicSettings } from "../../music-cards";
import { type Message, type DmSummary } from "../../../lib/chat/types";
import { type VoicePref } from "../../user-menu";
import { type ForwardMessageTarget } from "../../forward-message-dialog";
import { type Theme } from "@/lib/themes";
import { unreadSinceLabel, withUnreadLine } from "../../../lib/chat/shell-helpers";
import type { RefObject, Dispatch, SetStateAction } from "react";
import type { ChannelKindInfo } from "@/lib/channel-kinds";
import type { HeadTrackingSource, SpatialOutput, VideoPause, RemoteVoiceStream, VoiceLatencyStats, ScreenShareQuality, RelayStatus } from "../../../hooks/use-voice";
import type { HeadTrackingStatus } from "../../../lib/head-tracking";
import type { BackgroundMode } from "../../../lib/virtual-background";
import type { MicSettings, MicTelemetry } from "../../../lib/mic-chain";
import type { ClientEvent, VoiceParticipant, RecordingState } from "@/lib/protocol";
import { MessageRow } from "./message-row";

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
  voice: { important: boolean; toggleImportant: () => void; tableSeatOrder: string[]; tableSeatPans: Record<string, number>; setTableSeatPans: Dispatch<SetStateAction<Record<string, number>>>; tableWidth: number; setTableWidth: Dispatch<SetStateAction<number>>; headTracking: boolean; setHeadTracking: (enabled: boolean) => void; headTrackingOffered: boolean; airpodsOffered: boolean; headTrackingSource: HeadTrackingSource; setHeadTrackingSource: (source: HeadTrackingSource) => void; spatialOutput: SpatialOutput; setSpatialOutput: (output: SpatialOutput) => void; headTrackingStatus: { status: HeadTrackingStatus; live: boolean; }; onHeadTracking: (status: HeadTrackingStatus, live: boolean) => void; recenterHead: () => void; tableMode: boolean; setTableMode: (enabled: boolean) => void; tableHostId: string; setTableHostId: Dispatch<SetStateAction<string>>; channelId: string | null; muted: boolean; forcedMute: boolean; setForcedMute: (next: boolean) => void; deafened: boolean; handRaised: boolean; toggleHand: () => void; hiddenVideo: Record<string, VideoPause>; setVideoHidden: (remoteId: string, which: keyof VideoPause, hidden: boolean) => void; setStageSpeaker: (targetConnectionId: string, allowed: boolean) => void; speakingStore: SpeakingStore; remoteStreams: RemoteVoiceStream[]; sfuMode: boolean; peerStates: Record<string, string>; screenSharing: boolean; streamViewers: string[]; signalStreamWatch: (streamerConnectionId: string, watching: boolean) => void; latency: VoiceLatencyStats; isSfu: boolean; voiceRegion: "nl" | "de" | null; switchRegion: (targetRegion?: "nl" | "de") => Promise<void>; screenShareAudio: boolean; setScreenShareAudio: (enabled: boolean) => void; hasScreenAudio: boolean; screenAudioMuted: boolean; toggleScreenAudio: () => void; screenQuality: "480p15" | "480p24" | "480p30" | "480p60" | "720p15" | "720p24" | "720p30" | "720p60" | "900p15" | "900p24" | "900p30" | "900p60" | "1080p15" | "1080p24" | "1080p30" | "1080p60"; setScreenQuality: (quality: ScreenShareQuality) => void; screenFilm: boolean; setScreenFilm: (enabled: boolean) => void; startScreenShare: (quality?: ScreenShareQuality, withAudio?: boolean, film?: boolean) => Promise<void>; stopScreenShare: () => void; cameraOn: boolean; cameraBackground: BackgroundMode; setCameraBackground: (mode: BackgroundMode) => Promise<void>; cameraBlurAmount: number; setCameraBlurAmount: (amount: number) => void; cameraBackgroundImage: string; setCameraBackgroundImage: (imageId: string) => void; startCamera: () => Promise<void>; stopCamera: () => void; switchMicrophone: () => Promise<void>; activeMicrophone: () => { deviceId: string; ended: boolean; } | null; micSettings: MicSettings; setMicSettings: (next: Partial<MicSettings>) => void; subscribeMicTelemetry: (listener: (telemetry: MicTelemetry) => void) => () => void; localVideos: { kind: "camera" | "screen"; stream: MediaStream; }[]; error: string; setError: Dispatch<SetStateAction<string>>; relay: RelayStatus; recheckRelay: () => Promise<void>; join: (nextChannelId: string, options?: { startMuted?: boolean; }) => Promise<void>; leave: () => void; toggleMute: () => void; toggleDeafen: () => void; handleSignal: (from: string, raw: unknown) => Promise<void>; pushToTalk: boolean; pttKey: string; pttHeld: boolean; muteKey: string; deafenKey: string; setMuteKey: (combo: string) => void; setDeafenKey: (combo: string) => void; setPushToTalk: (enabled: boolean) => void; setPttKey: (code: string) => void; pttPress: () => void; pttRelease: () => void; speakIntoCall: (audio: Float32Array, sampleRate: number) => Promise<"sent" | "no-call" | "no-server" | "server-muted" | "busy" | "too-long">; stopSpeaking: () => void; canSpeak: () => boolean; };
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
  const rowProps = useStableFns(
    {
      membersById,
      activeDm,
      openUserMenu,
      activeChannelId,
      jumpToMessage,
      setPinsOpen,
      user,
      canModerate,
      blockedUserIds,
      expandedBlockedMessages,
      setExpandedBlockedMessages,
      msnTheme,
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
      inDmHome,
      activeServer,
      setEditHistoryId,
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
      activeChannel,
      setForwardTarget,
      setQuickVoteId,
      beginEdit,
      canPin,
      togglePin,
      deleteMessage,
      showCustomConfirm,
      hubSend: hub.send,
      hubPlayers: hub.players,
      voiceChannelId: voice.channelId,
      playerBlocked: player.blocked,
      playerUnblock: player.unblock,
    },
    ["roleColorFor", "prefFor"],
  );
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
                  <MessageRow
                    key={message.id}
                    message={message}
                    prev={messages[index - 1]}
                    // Only the card that is playing follows the 500ms position tick.
                    playerPosition={
                      message.payload?.voiceChannelId &&
                      message.payload.voiceChannelId === voice.channelId
                        ? player.position
                        : 0
                    }
                    {...rowProps}
                  />))}
                <div ref={messageEndRef} />
              </div>
  );
}
