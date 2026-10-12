"use client";

import { DraftTextarea } from "../../draft-textarea";
import { type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import type { PlayerState } from "@/lib/protocol";
import { formatFileSize, getFileBadgeColor, getFileExtensionBadge } from "@/lib/upload-sniff";
import { MsnFormatToolbar, messageFontStyle } from "../../msn-chrome";
import { TextStyleMenu } from "../../text-style-menu";
import { GamesPicker } from "../../game-card";
import { type GameKind } from "@/lib/games";
import { saveMessageFont, type MessageFont } from "@/lib/text-style";
import { type Member, type PublicUser } from "@/lib/users";
import { Radio, Smile, Vote, Gamepad2, Type, ChevronUp, AtSign, Send, ShieldAlert, Timer } from "lucide-react";
import { Avatar } from "../../avatar";
import { GifPicker } from "../../gif-picker";
import { StyledText } from "../../message-body";
import { type Message, type DmSummary, type MentionOption } from "../../../lib/chat/types";
import { formatClientDateTime, msnLastReceived } from "../../../lib/chat/format";
import { channelKindLabel, channelKindIcon } from "../channel-kind";
import { EmojiPicker } from "../../emoji-picker";
import { SlashMenu } from "../../slash-menu";
import { type SlashCommand } from "../../../lib/commands";
import { VoiceRecordButton, VoiceRecordingBar } from "../../voice-message";
import type { Dispatch, SetStateAction, RefObject } from "react";
import type { HeadTrackingSource, SpatialOutput, VideoPause, RemoteVoiceStream, VoiceLatencyStats, ScreenShareQuality, RelayStatus } from "../../../hooks/use-voice";
import type { HeadTrackingStatus } from "../../../lib/head-tracking";
import type { BackgroundMode } from "../../../lib/virtual-background";
import type { MicSettings, MicTelemetry } from "../../../lib/mic-chain";
import type { ClientEvent, VoiceParticipant, RecordingState } from "@/lib/protocol";
import type { PersonalEmoticon } from "@/lib/msn-contacts";
import type { RecorderState } from "../../voice-message";
import type { ChannelKindInfo } from "@/lib/channel-kinds";

export function Composer({
  sendMessage,
  activeSlashCommand,
  draft,
  slashActive,
  slashIndex,
  setSlashIndex,
  pickCommand,
  slashMatches,
  voice,
  mentionActive,
  tagQuery,
  mentionMatches,
  pickMention,
  roleColorFor,
  emojiActive,
  emojiShortcodeMatch,
  emojiMatches,
  emojiIndex,
  setEmojiIndex,
  pickEmojiShortcode,
  gifOpen,
  setGifOpen,
  inDmHome,
  activeServerId,
  canManageChannels,
  sendText,
  setDraft,
  composerRef,
  loadEmojis,
  gamesOpen,
  msnTheme,
  setGamesOpen,
  startGame,
  setStageChannelId,
  formatOpen,
  wrapSelection,
  setFormatOpen,
  emojiOpen,
  setEmojiOpen,
  replyTarget,
  setReplyTarget,
  pendingFiles,
  setPendingFiles,
  myTimeoutUntil,
  isDmBlocked,
  activeDm,
  handleUnblockUser,
  composerBlocked,
  isSelfDm,
  hub,
  messageFont,
  setMessageFont,
  sendWink,
  personalEmoticons,
  voiceRecorder,
  acceptAttachment,
  activeChannelId,
  sendNudge,
  nudgeCooling,
  fileRef,
  chooseAttachment,
  setComposerCaret,
  noteTyping,
  onComposerKeyDown,
  activeChannelInfo,
  channelTitle,
  mobileComposerMenuOpen,
  setMobileComposerMenuOpen,
  setPollDialogOpen,
  typingNames,
  messages,
  user,
}: {
  sendMessage: (event?: FormEvent) => Promise<void>;
  activeSlashCommand: SlashCommand | undefined;
  draft: string;
  slashActive: boolean;
  slashIndex: number;
  setSlashIndex: Dispatch<SetStateAction<number>>;
  pickCommand: (index: number, fromKeyboard?: boolean) => void;
  slashMatches: SlashCommand[];
  voice: { important: boolean; toggleImportant: () => void; tableSeatOrder: string[]; tableSeatPans: Record<string, number>; setTableSeatPans: Dispatch<SetStateAction<Record<string, number>>>; tableWidth: number; setTableWidth: Dispatch<SetStateAction<number>>; headTracking: boolean; setHeadTracking: (enabled: boolean) => void; headTrackingOffered: boolean; airpodsOffered: boolean; headTrackingSource: HeadTrackingSource; setHeadTrackingSource: (source: HeadTrackingSource) => void; spatialOutput: SpatialOutput; setSpatialOutput: (output: SpatialOutput) => void; headTrackingStatus: { status: HeadTrackingStatus; live: boolean; }; onHeadTracking: (status: HeadTrackingStatus, live: boolean) => void; recenterHead: () => void; tableMode: boolean; setTableMode: (enabled: boolean) => void; tableHostId: string; setTableHostId: Dispatch<SetStateAction<string>>; channelId: string | null; muted: boolean; forcedMute: boolean; setForcedMute: (next: boolean) => void; deafened: boolean; handRaised: boolean; toggleHand: () => void; hiddenVideo: Record<string, VideoPause>; setVideoHidden: (remoteId: string, which: keyof VideoPause, hidden: boolean) => void; setStageSpeaker: (targetConnectionId: string, allowed: boolean) => void; speaking: Set<string>; remoteStreams: RemoteVoiceStream[]; sfuMode: boolean; peerStates: Record<string, string>; screenSharing: boolean; streamViewers: string[]; signalStreamWatch: (streamerConnectionId: string, watching: boolean) => void; latency: VoiceLatencyStats; isSfu: boolean; voiceRegion: "nl" | "de" | null; switchRegion: (targetRegion?: "nl" | "de") => Promise<void>; screenShareAudio: boolean; setScreenShareAudio: (enabled: boolean) => void; hasScreenAudio: boolean; screenAudioMuted: boolean; toggleScreenAudio: () => void; screenQuality: "480p15" | "480p24" | "480p30" | "480p60" | "720p15" | "720p24" | "720p30" | "720p60" | "900p15" | "900p24" | "900p30" | "900p60" | "1080p15" | "1080p24" | "1080p30" | "1080p60"; setScreenQuality: (quality: ScreenShareQuality) => void; screenFilm: boolean; setScreenFilm: (enabled: boolean) => void; startScreenShare: (quality?: ScreenShareQuality, withAudio?: boolean, film?: boolean) => Promise<void>; stopScreenShare: () => void; cameraOn: boolean; cameraBackground: BackgroundMode; setCameraBackground: (mode: BackgroundMode) => Promise<void>; cameraBlurAmount: number; setCameraBlurAmount: (amount: number) => void; cameraBackgroundImage: string; setCameraBackgroundImage: (imageId: string) => void; startCamera: () => Promise<void>; stopCamera: () => void; switchMicrophone: () => Promise<void>; activeMicrophone: () => { deviceId: string; ended: boolean; } | null; micSettings: MicSettings; setMicSettings: (next: Partial<MicSettings>) => void; subscribeMicTelemetry: (listener: (telemetry: MicTelemetry) => void) => () => void; localVideos: { kind: "camera" | "screen"; stream: MediaStream; }[]; error: string; setError: Dispatch<SetStateAction<string>>; relay: RelayStatus; recheckRelay: () => Promise<void>; join: (nextChannelId: string, options?: { startMuted?: boolean; }) => Promise<void>; leave: () => void; toggleMute: () => void; toggleDeafen: () => void; handleSignal: (from: string, raw: unknown) => Promise<void>; takeClip: () => Promise<Blob | null>; clipSeconds: number; pushToTalk: boolean; pttKey: string; pttHeld: boolean; muteKey: string; deafenKey: string; setMuteKey: (combo: string) => void; setDeafenKey: (combo: string) => void; setPushToTalk: (enabled: boolean) => void; setPttKey: (code: string) => void; pttPress: () => void; pttRelease: () => void; speakIntoCall: (audio: Float32Array, sampleRate: number) => Promise<"sent" | "no-call" | "no-server" | "server-muted" | "busy" | "too-long">; stopSpeaking: () => void; canSpeak: () => boolean; };
  mentionActive: boolean;
  tagQuery: { trigger: "@" | "#"; query: string; start: number; } | null;
  mentionMatches: MentionOption[];
  pickMention: (option: MentionOption) => void;
  roleColorFor: (member: Member | undefined) => string | null;
  emojiActive: boolean;
  emojiShortcodeMatch: { prefix: string; query: string; } | null;
  emojiMatches: { name: string; symbol: string; isCustom?: boolean; url?: string; }[];
  emojiIndex: number;
  setEmojiIndex: Dispatch<SetStateAction<number>>;
  pickEmojiShortcode: (item: { name: string; symbol: string; isCustom?: boolean; url?: string; }) => void;
  gifOpen: boolean;
  setGifOpen: Dispatch<SetStateAction<boolean>>;
  inDmHome: boolean;
  activeServerId: string | null;
  canManageChannels: boolean;
  sendText: (text: string, attachmentKeys?: string | string[]) => Promise<void>;
  setDraft: (valueOrFn: string | ((prev: string) => string)) => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  loadEmojis: () => Promise<void>;
  gamesOpen: boolean;
  msnTheme: boolean;
  setGamesOpen: Dispatch<SetStateAction<boolean>>;
  startGame: (kind: GameKind, solo?: boolean) => Promise<void>;
  setStageChannelId: Dispatch<SetStateAction<string | null>>;
  formatOpen: boolean;
  wrapSelection: (open: string, close: string) => void;
  setFormatOpen: Dispatch<SetStateAction<boolean>>;
  emojiOpen: boolean;
  setEmojiOpen: Dispatch<SetStateAction<boolean>>;
  replyTarget: Message | null;
  setReplyTarget: Dispatch<SetStateAction<Message | null>>;
  pendingFiles: { id: string; file: File; preview: string | null; }[];
  setPendingFiles: Dispatch<SetStateAction<{ id: string; file: File; preview: string | null; }[]>>;
  myTimeoutUntil: string | null;
  isDmBlocked: boolean;
  activeDm: DmSummary | null;
  handleUnblockUser: (targetId: string) => Promise<void>;
  composerBlocked: boolean;
  isSelfDm: boolean;
  hub: { send: (event: ClientEvent) => boolean; serverNow: () => number; connected: boolean; connectionId: string | null; session: number; online: Set<string>; voice: Record<string, VoiceParticipant[]>; players: Record<string, PlayerState>; recordings: Record<string, RecordingState>; forcedMutes: Set<string>; };
  messageFont: MessageFont | null;
  setMessageFont: Dispatch<SetStateAction<MessageFont | null>>;
  sendWink: (id: string) => Promise<void>;
  personalEmoticons: { emoticons: PersonalEmoticon[]; add: (file: File, shortcut: string) => Promise<void>; remove: (shortcut: string) => Promise<void>; };
  voiceRecorder: { state: RecorderState; elapsedMs: number; levels: number[]; error: string; clearError: () => void; start: () => undefined; togglePause: () => void; send: () => void; cancel: () => void; };
  acceptAttachment: (files: FileList | File[] | undefined | null) => void;
  activeChannelId: string | null;
  sendNudge: () => Promise<void>;
  nudgeCooling: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  chooseAttachment: (event: ChangeEvent<HTMLInputElement>) => void;
  setComposerCaret: Dispatch<SetStateAction<number>>;
  noteTyping: () => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  activeChannelInfo: ChannelKindInfo;
  channelTitle: string;
  mobileComposerMenuOpen: boolean;
  setMobileComposerMenuOpen: Dispatch<SetStateAction<boolean>>;
  setPollDialogOpen: Dispatch<SetStateAction<boolean>>;
  typingNames: string[];
  messages: Message[];
  user: PublicUser;
}) {
  return (
    <form className="composer-wrap" onSubmit={sendMessage}>
                {activeSlashCommand && draft.startsWith("/") && (
                  <div className="active-command-helper">
                    <span className="command-title">/{activeSlashCommand.name}</span>
                    {activeSlashCommand.args && (
                      <span className="command-args">{activeSlashCommand.args}</span>
                    )}
                    <span className="command-desc">— {activeSlashCommand.description}</span>
                  </div>
                )}

                {slashActive && (
                  <SlashMenu
                    query={draft.split(/\s+/)[0]}
                    highlighted={slashIndex}
                    onHighlight={setSlashIndex}
                    onPick={(command) =>
                      pickCommand(
                        slashMatches.findIndex((item) => item.name === command.name),
                      )
                    }
                    inVoice={Boolean(voice.channelId)}
                  />
                )}

                {mentionActive && (
                  <div className="mention-menu" role="listbox" aria-label={tagQuery?.trigger === "#" ? "Channels" : "Mentions"}>
                    {mentionMatches.map((option, index) => {
                      const active = index === slashIndex % mentionMatches.length;
                      // Section headers, printed when the kind changes.
                      const previous = mentionMatches[index - 1];
                      const header =
                        !previous || previous.kind !== option.kind ? (
                          <div className="mention-section" key={`h:${option.kind}`}>
                            {option.kind === "user"
                              ? "MEMBERS"
                              : option.kind === "role"
                                ? "ROLES"
                                : option.kind === "broadcast"
                                  ? "NOTIFY"
                                  : "CHANNELS"}
                          </div>
                        ) : null;

                      if (option.kind === "channel") {
                        const channel = option.channel;
                        return (
                          <div key={`channel:${channel.id}`}>
                            {header}
                            <button
                              type="button"
                              role="option"
                              aria-selected={active}
                              className={`mention-item ${active ? "active" : ""}`}
                              onMouseEnter={() => setSlashIndex(index)}
                              onClick={() => pickMention(option)}
                            >
                              {channelKindIcon(channel.kind, 16, "mention-channel-icon")}
                              <span className="mention-primary">{channel.name}</span>
                              <span className="mention-note">
                                {channel.topic || channelKindLabel(channel.kind)}
                              </span>
                            </button>
                          </div>
                        );
                      }

                      if (option.kind === "broadcast") {
                        return (
                          <div key={`broadcast:${option.name}`}>
                            {header}
                            <button
                              type="button"
                              role="option"
                              aria-selected={active}
                              className={`mention-item ${active ? "active" : ""}`}
                              onMouseEnter={() => setSlashIndex(index)}
                              onClick={() => pickMention(option)}
                            >
                              <AtSign size={16} className="mention-channel-icon" />
                              <span className="mention-primary">@{option.name}</span>
                              <span className="mention-note">
                                {option.name === "everyone"
                                  ? "Notify every member of this server"
                                  : "Notify everyone who is online"}
                              </span>
                            </button>
                          </div>
                        );
                      }

                      if (option.kind === "role") {
                        return (
                          <div key={`role:${option.role.id}`}>
                            {header}
                            <button
                              type="button"
                              role="option"
                              aria-selected={active}
                              className={`mention-item ${active ? "active" : ""}`}
                              onMouseEnter={() => setSlashIndex(index)}
                              onClick={() => pickMention(option)}
                            >
                              <span
                                className="mention-role-dot"
                                style={{ background: option.role.color }}
                              />
                              <span
                                className="mention-primary"
                                style={{ color: option.role.color }}
                              >
                                @{option.role.name}
                              </span>
                              <span className="mention-note">
                                Notify everyone with this role
                              </span>
                            </button>
                          </div>
                        );
                      }

                      const member = option.member;
                      return (
                        <div key={`user:${member.id}`}>
                          {header}
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={`mention-item ${active ? "active" : ""}`}
                            onMouseEnter={() => setSlashIndex(index)}
                            onClick={() => pickMention(option)}
                          >
                            <Avatar
                              className="tiny-avatar"
                              avatar={member.avatar}
                              avatarUrl={member.avatarUrl}
                              color={member.color}
                            />
                            <span
                              className="mention-primary"
                              style={{ color: roleColorFor(member) || undefined }}
                            >
                              <StyledText text={member.displayName} />
                            </span>
                            <span className="mention-note">
                              {member.globalName && member.globalName !== member.displayName
                                ? `${member.globalName} · `
                                : ""}
                              @{member.username}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {emojiActive && (
                  <div className="mention-menu">
                    <div className="mention-section">
                      {emojiShortcodeMatch?.prefix.includes("+")
                        ? "REACT TO LAST MESSAGE"
                        : "EMOJI SHORTCODES"}
                    </div>
                    {emojiMatches.map((item, index) => {
                      const active = index === emojiIndex % emojiMatches.length;
                      return (
                        <button
                          key={item.name}
                          type="button"
                          className={`mention-item ${active ? "active" : ""}`}
                          onMouseEnter={() => setEmojiIndex(index)}
                          onClick={() => pickEmojiShortcode(item)}
                        >
                          <span className="text-base shrink-0 mr-2 flex items-center justify-center w-5 h-5">
                            {item.url ? (
                              <img src={item.url} alt={item.name} className="w-4 h-4 object-contain" />
                            ) : (
                              item.symbol
                            )}
                          </span>
                          <span className="mention-primary">
                            {emojiShortcodeMatch?.prefix.includes("+")
                              ? `:+${item.name}:`
                              : `:${item.name}:`}
                          </span>
                          {item.isCustom && <span className="mention-note">Server Emoji</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {gifOpen && (
                  <GifPicker
                    onClose={() => setGifOpen(false)}
                    serverId={inDmHome ? null : activeServerId}
                    canManageStickers={canManageChannels}
                    onPick={(url) => {
                      setGifOpen(false);
                      void sendText(url);
                    }}
                    onInsert={(text) => {
                      setDraft((current) => current + text);
                      composerRef.current?.focus();
                    }}
                    onEmojiChange={() => void loadEmojis().catch(() => undefined)}
                  />
                )}

                {gamesOpen && !msnTheme && (
                  <GamesPicker
                    inVoice={Boolean(voice.channelId)}
                    onClose={() => setGamesOpen(false)}
                    onStart={(kind, solo) => {
                      setGamesOpen(false);
                      void startGame(kind, solo);
                    }}
                    onActivities={() => {
                      setGamesOpen(false);
                      if (!voice.channelId) return;
                      setStageChannelId(voice.channelId);
                      window.setTimeout(() => window.dispatchEvent(new Event("huddle:open-activities")), 150);
                    }}
                  />
                )}

                {formatOpen && !msnTheme && (
                  <TextStyleMenu
                    onWrap={(open, close) => {
                      wrapSelection(open, close);
                      setFormatOpen(false);
                    }}
                  />
                )}

                {emojiOpen && (
                  <EmojiPicker
                    serverId={inDmHome ? null : activeServerId}
                    canManageEmojis={canManageChannels}
                    onPickEmoji={(codeOrUrl) => {
                      setEmojiOpen(false);
                      setDraft((current) => current + codeOrUrl + " ");
                      composerRef.current?.focus();
                    }}
                    onClose={() => setEmojiOpen(false)}
                  />
                )}

                {replyTarget && (
                  <div className="reply-bar">
                    <span>
                      Replying to <strong>{replyTarget.author}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyTarget(null)}
                      aria-label="Cancel reply"
                    >
                      ×
                    </button>
                  </div>
                )}

                {pendingFiles.length > 0 && (
                  <div className="attachment-row">
                    {pendingFiles.map((entry) => (
                      <div
                        key={entry.id}
                        className={`attachment-preview ${entry.preview ? "" : "file-preview"}`}
                      >
                        {entry.preview ? (
                          <img src={entry.preview} alt={entry.file.name} />
                        ) : (
                          <>
                            <span className={`message-file-icon file-badge-${getFileBadgeColor(entry.file.name)}`}>
                              {getFileExtensionBadge(entry.file.name)}
                            </span>
                            <span>
                              <strong>{entry.file.name}</strong>
                              <small>
                                {formatFileSize(entry.file.size)}
                              </small>
                            </span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setPendingFiles((current) =>
                              current.filter((item) => item.id !== entry.id),
                            )
                          }
                          aria-label={`Remove ${entry.file.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {myTimeoutUntil && !isDmBlocked ? (
                  <div className="dm-blocked-banner">
                    <Timer size={16} className="text-amber-400 shrink-0" />
                    <span>
                      You are timed out in this server until{" "}
                      {formatClientDateTime(myTimeoutUntil)}. You can still read along.
                    </span>
                  </div>
                ) : isDmBlocked ? (
                  <div className="dm-blocked-banner">
                    <ShieldAlert size={16} className="text-rose-400 shrink-0" />
                    <span>You have blocked this user. Unblock them to send messages.</span>
                    <button
                      type="button"
                      className="dm-unblock-btn"
                      onClick={() => activeDm && handleUnblockUser(activeDm.user.id)}
                    >
                      Unblock
                    </button>
                  </div>
                ) : composerBlocked ? (
                  <div className="dm-blocked-banner">
                    <Radio size={16} className="text-violet-400 shrink-0" />
                    <span>
                      This is an announcement channel, so only moderators can post here.
                    </span>
                  </div>
                ) : (
                  <>
                  {msnTheme &&
                    inDmHome &&
                    activeDm &&
                    !activeDm.group &&
                    !isSelfDm &&
                    hub.connected &&
                    !hub.online.has(activeDm.user.id) && (
                      <p className="msn-offline-note">
                        <span aria-hidden="true">ⓘ</span>
                        <StyledText text={activeDm.user.displayName} /> appears to be offline. Messages you
                        send will be delivered when they sign in.
                      </p>
                    )}
                  {msnTheme && (
                    <MsnFormatToolbar
                      messageFont={messageFont}
                      onMessageFont={(font) => {
                        setMessageFont(font);
                        saveMessageFont(font);
                        composerRef.current?.focus();
                      }}
                      onWrap={wrapSelection}
                      onEmoticons={() => {
                        setEmojiOpen((open) => !open);
                        setGifOpen(false);
                      }}
                      onWinks={() => {
                        setGifOpen((open) => !open);
                        setEmojiOpen(false);
                      }}
                      onSendWink={(id) => void sendWink(id)}
                      onStartGame={(kind, solo) => void startGame(kind, solo)}
                      personalEmoticons={personalEmoticons.emoticons}
                      onAddEmoticon={personalEmoticons.add}
                      onRemoveEmoticon={(shortcut) => void personalEmoticons.remove(shortcut).catch(() => undefined)}
                      inVoice={Boolean(voice.channelId)}
                      onActivities={() => {
                        if (!voice.channelId) return;
                        setStageChannelId(voice.channelId);
                        // The stage mounts first, then opens its panel.
                        window.setTimeout(() => window.dispatchEvent(new Event("huddle:open-activities")), 150);
                      }}
                      onVoiceClip={voiceRecorder.start}
                      onHandwriting={(file) => {
                        acceptAttachment([file]);
                        composerRef.current?.focus();
                      }}
                      channelId={activeChannelId}
                      onNudge={() => void sendNudge()}
                      nudgeCooling={nudgeCooling || !activeChannelId}
                    />
                  )}
                  <div className="composer">
                    {voiceRecorder.state !== "idle" ? (
                      <VoiceRecordingBar recorder={voiceRecorder} />
                    ) : (
                    <>
                    <button
                      type="button"
                      className="attach-button"
                      onClick={() => fileRef.current?.click()}
                      aria-label="Attach files or media"
                    >
                      +
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      hidden
                      onChange={chooseAttachment}
                    />
                    <DraftTextarea
                      ref={composerRef}
                      value={draft}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        setComposerCaret(event.target.selectionStart ?? event.target.value.length);
                        if (event.target.value.trim()) noteTyping();
                      }}
                      onSelect={(event) =>
                        setComposerCaret(event.currentTarget.selectionStart ?? 0)
                      }
                      onKeyDown={onComposerKeyDown}
                      onPaste={(event) => {
                        // Pasting a screenshot attaches it instead of doing nothing.
                        const files = Array.from(event.clipboardData.files || []);
                        if (files.length) {
                          event.preventDefault();
                          acceptAttachment(files);
                        }
                      }}
                      placeholder={
                        activeChannelId
                          ? isSelfDm
                            ? "Jot down a note or link to yourself..."
                            : activeChannelInfo.threadContainer
                              ? "Start a new post…"
                              : activeChannelInfo.moderatorOnlyPosting
                                ? `Post an announcement in #${channelTitle}`
                                : `Message ${inDmHome ? "" : "#"}${channelTitle}`
                          : "Pick a channel first"
                      }
                      aria-label={
                        activeChannelInfo.threadContainer
                          ? `New post in ${channelTitle}`
                          : `Message ${channelTitle}`
                      }
                      rows={1}
                      disabled={!activeChannelId}
                      style={msnTheme ? messageFontStyle(messageFont) : undefined}
                    />
                    {/* Mobile ^ more menu popover */}
                    {mobileComposerMenuOpen && (
                      <div
                        className="mobile-composer-menu-popover animate-in fade-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="mobile-composer-menu-item"
                          onClick={() => {
                            setFormatOpen((open) => !open);
                            setMobileComposerMenuOpen(false);
                            setEmojiOpen(false);
                            setGifOpen(false);
                          }}
                        >
                          <Type size={18} />
                          <span>Text Formatting</span>
                        </button>
                        <button
                          type="button"
                          className="mobile-composer-menu-item"
                          onClick={() => {
                            setPollDialogOpen(true);
                            setMobileComposerMenuOpen(false);
                          }}
                        >
                          <Vote size={18} />
                          <span>Create Poll</span>
                        </button>
                        <button
                          type="button"
                          className="mobile-composer-menu-item"
                          onClick={() => {
                            setGamesOpen((open) => !open);
                            setMobileComposerMenuOpen(false);
                            setEmojiOpen(false);
                            setGifOpen(false);
                            setFormatOpen(false);
                          }}
                          disabled={!activeChannelId}
                        >
                          <Gamepad2 size={18} />
                          <span>Play Games</span>
                        </button>
                      </div>
                    )}

                    {/* Mobile ^ more menu toggle button */}
                    <button
                      type="button"
                      className={`composer-emoji-btn composer-more-mobile-btn ${mobileComposerMenuOpen ? "active" : ""}`}
                      onClick={() => {
                        setMobileComposerMenuOpen((prev) => !prev);
                        setEmojiOpen(false);
                        setGifOpen(false);
                        setFormatOpen(false);
                      }}
                      aria-label="More options"
                      title="More tools"
                    >
                      <ChevronUp size={18} className={mobileComposerMenuOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                    </button>

                    {/* Formatting button (desktop only) */}
                    <button
                      type="button"
                      className={`composer-emoji-btn composer-format-btn desktop-composer-item ${formatOpen ? "active" : ""}`}
                      onClick={() => {
                        setFormatOpen((open) => !open);
                        setEmojiOpen(false);
                        setGifOpen(false);
                      }}
                      aria-label="Text formatting"
                      title="Colours, fonts and effects"
                      aria-expanded={formatOpen}
                    >
                      <Type size={18} />
                    </button>

                    {/* Emoji button - visible on both mobile and desktop */}
                    <button
                      type="button"
                      className="composer-emoji-btn"
                      onClick={() => {
                        setEmojiOpen((open) => !open);
                        setGifOpen(false);
                        setFormatOpen(false);
                        setMobileComposerMenuOpen(false);
                      }}
                      aria-label="Open Emoji Picker"
                      title="Open Emoji Picker"
                    >
                      <Smile size={18} />
                    </button>

                    {/* GIF button - visible on both mobile and desktop */}
                    <button
                      type="button"
                      className="gif-button"
                      onClick={() => {
                        setGifOpen((open) => !open);
                        setEmojiOpen(false);
                        setMobileComposerMenuOpen(false);
                      }}
                      aria-label="Add a GIF"
                    >
                      GIF
                    </button>

                    {/* Poll button (desktop only) */}
                    <button
                      type="button"
                      className="composer-emoji-btn desktop-composer-item"
                      onClick={() => setPollDialogOpen(true)}
                      aria-label="Create a Poll"
                      title="Create a Poll"
                    >
                      <Vote size={18} />
                    </button>

                    {/* Games button (desktop only) */}
                    <button
                      type="button"
                      className={`composer-emoji-btn composer-games-btn desktop-composer-item ${gamesOpen ? "active" : ""}`}
                      onClick={() => {
                        setGamesOpen((open) => !open);
                        setEmojiOpen(false);
                        setGifOpen(false);
                        setFormatOpen(false);
                      }}
                      aria-label="Games"
                      title="Play a game"
                      aria-expanded={gamesOpen}
                      disabled={!activeChannelId}
                    >
                      <Gamepad2 size={18} />
                    </button>

                    {/* Slash command button - visible on both mobile and desktop */}
                    <button
                      type="button"
                      className="gif-button"
                      onClick={() => {
                        setDraft("/");
                        composerRef.current?.focus();
                      }}
                      aria-label="Show commands"
                    >
                      /
                    </button>
                    {!draft.trim() && pendingFiles.length === 0 ? (
                      <VoiceRecordButton
                        recorder={voiceRecorder}
                        disabled={!activeChannelId}
                      />
                    ) : (
                      <button
                        className="send-button"
                        type="submit"
                        aria-label="Send message"
                      >
                        <Send size={15} />
                      </button>
                    )}
                    </>
                    )}
                  </div>
                  </>
                )}

                <div className="composer-hint">
                  {typingNames.length > 0 ? (
                    <span className="typing-line">
                      <span className="typing-dots">
                        <i />
                        <i />
                        <i />
                      </span>
                      {msnTheme
                        ? typingNames.length === 1
                          ? `${typingNames[0]} is writing a message...`
                          : `${typingNames.slice(0, 3).join(", ")} are writing messages...`
                        : typingNames.length === 1
                        ? `${typingNames[0]} is typing…`
                        : typingNames.length === 2
                          ? `${typingNames[0]} and ${typingNames[1]} are typing…`
                          : `${typingNames.length} people are typing…`}
                    </span>
                  ) : msnTheme ? (
                    <span className="msn-status-bar">{msnLastReceived(messages, user?.id)}</span>
                  ) : (
                    <span className="composer-hint-keys">
                      <kbd>Enter</kbd> send · <kbd>Shift+Enter</kbd> new line · <kbd>/</kbd> commands
                    </span>
                  )}
                </div>
              </form>
  );
}
