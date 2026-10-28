"use client";

import type { VoiceApi } from "../../../hooks/use-voice";
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
import { Radio, Smile, Vote, Gamepad2, Type, ChevronUp, AtSign, Send, ShieldAlert, Timer, EyeOff } from "lucide-react";
import { Avatar } from "../../avatar";
import { GifPicker } from "../../gif-picker";
import { StyledText } from "../../message-body";
import { type Message, type DmSummary, type MentionOption, type PendingFile } from "../../../lib/chat/types";
import { canShrink } from "../../../lib/shrink-image";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/big-upload-key";
import { formatClientDateTime, msnLastReceived } from "../../../lib/chat/format";
import { channelKindLabel, channelKindIcon } from "../channel-kind";
import { EmojiPicker } from "../../emoji-picker";
import { SlashMenu } from "../../slash-menu";
import { type SlashCommand } from "../../../lib/commands";
import { VoiceRecordButton, VoiceRecordingBar } from "../../voice-message";
import type { Dispatch, SetStateAction, RefObject } from "react";
import type { ClientEvent, VoiceParticipant, RecordingState } from "@/lib/protocol";
import type { PersonalEmoticon } from "@/lib/msn-contacts";
import type { RecorderState } from "../../voice-message";
import type { ChannelKindInfo } from "@/lib/channel-kinds";
import { useI18n } from "@/app/lib/i18n-context";
import { useToolbar } from "../../widgets/toolbar";

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
  showCustomPrompt,
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
  voice: VoiceApi;
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
  pendingFiles: PendingFile[];
  setPendingFiles: Dispatch<SetStateAction<PendingFile[]>>;
  showCustomPrompt: (options: { title: string; message?: string; defaultValue?: string; placeholder?: string; confirmText?: string; maxLength?: number; onConfirm: (value?: string) => void }) => void;
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
  const { t } = useI18n();
  // Customize → Buttons: which tools sit in the bar and which in the ^ menu.
  const tb = useToolbar("composer");
  const inBar = (id: string) => (tb.hidden(id) ? "" : " tb-on");
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
                                  ? t("chat.notifyEveryone")
                                  : t("chat.notifyHere")}
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
                          {item.isCustom && <span className="mention-note">{t("composer.serverEmoji")}</span>}
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
                      {t("composer.replyingTo", { author: replyTarget.author })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyTarget(null)}
                      aria-label={t("composer.cancelReply")}
                    >
                      ×
                    </button>
                  </div>
                )}

                {pendingFiles.length > 0 && (
                  <div className="attachment-row">
                    {pendingFiles.map((entry) => {
                      const isSpoiler = entry.file.name.startsWith("SPOILER_");
                      return (
                        <div
                          key={entry.id}
                          className={`attachment-preview relative group ${entry.preview ? "" : "file-preview"} ${
                            isSpoiler ? "ring-2 ring-amber-500/60" : ""
                          }`}
                        >
                          {entry.preview ? (
                            <img src={entry.preview} alt={entry.alt || entry.file.name} />
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
                          {isSpoiler && (
                            <span className="absolute bottom-1 left-1 bg-amber-500 text-black font-extrabold text-[8px] px-1 rounded uppercase tracking-wider select-none pointer-events-none">
                              {t("composer.spoiler")}
                            </span>
                          )}
                          {entry.preview && (
                            <div className="attachment-image-options">
                              <button
                                type="button"
                                className={entry.alt ? "active" : ""}
                                title={entry.alt ? t("composer.imageDescriptionTooltip", { alt: entry.alt }) : t("composer.imageDescriptionAddTooltip")}
                                aria-label={entry.alt ? t("composer.imageDescriptionEditAria") : t("composer.imageDescriptionAddAria")}
                                onClick={() =>
                                  showCustomPrompt({
                                    title: t("composer.describeImage"),
                                    message: t("composer.describeImageA11y"),
                                    defaultValue: entry.alt || "",
                                    placeholder: t("composer.imageDescriptionPlaceholder"),
                                    confirmText: t("common.save"),
                                    maxLength: 1000,
                                    onConfirm: (value) =>
                                      setPendingFiles((current) =>
                                        current.map((item) => (item.id === entry.id ? { ...item, alt: value?.trim() || undefined } : item)),
                                      ),
                                  })
                                }
                              >
                                ALT
                              </button>
                              {/* Over the picture limit the original cannot go up at all: no choice to offer. */}
                              {canShrink(entry.file) && entry.file.size <= IMAGE_UPLOAD_MAX_BYTES && (
                                <button
                                  type="button"
                                  className={entry.original ? "active" : ""}
                                  title={entry.original ? t("composer.hdOn") : t("composer.hdOff")}
                                  aria-pressed={Boolean(entry.original)}
                                  onClick={() =>
                                    setPendingFiles((current) =>
                                      current.map((item) => (item.id === entry.id ? { ...item, original: !item.original } : item)),
                                    )
                                  }
                                >
                                  HD
                                </button>
                              )}
                            </div>
                          )}
                          <div className="absolute top-1 right-1 flex items-center gap-1">
                            <button
                              type="button"
                              className={`w-5 h-5 rounded flex items-center justify-center text-xs transition-colors cursor-pointer ${
                                isSpoiler
                                  ? "bg-amber-500 text-black font-bold hover:bg-amber-400"
                                  : "bg-black/60 text-white/70 hover:text-white hover:bg-black/80"
                              }`}
                              title={isSpoiler ? t("composer.removeSpoiler") : t("composer.markSpoiler")}
                              aria-label={isSpoiler ? t("composer.removeSpoiler") : t("composer.markSpoiler")}
                              onClick={() => {
                                setPendingFiles((current) =>
                                  current.map((item) => {
                                    if (item.id !== entry.id) return item;
                                    const nextName = isSpoiler
                                      ? item.file.name.replace(/^SPOILER_/, "")
                                      : `SPOILER_${item.file.name}`;
                                    const nextFile = new File([item.file], nextName, { type: item.file.type });
                                    return { ...item, file: nextFile };
                                  }),
                                );
                              }}
                            >
                              <EyeOff size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingFiles((current) =>
                                  current.filter((item) => item.id !== entry.id),
                                )
                              }
                              aria-label={t("composer.removeAttachment", { name: entry.file.name })}
                              className="w-5 h-5 rounded bg-black/60 hover:bg-black/80 text-white/70 hover:text-white flex items-center justify-center text-xs cursor-pointer"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {myTimeoutUntil && !isDmBlocked ? (
                  <div className="dm-blocked-banner">
                    <Timer size={16} className="text-amber-400 shrink-0" />
                    <span>
                      {t("composer.timedOut", { when: formatClientDateTime(myTimeoutUntil) })}
                    </span>
                  </div>
                ) : isDmBlocked ? (
                  <div className="dm-blocked-banner">
                    <ShieldAlert size={16} className="text-rose-400 shrink-0" />
                    <span>{t("composer.blockedUser")}</span>
                    <button
                      type="button"
                      className="dm-unblock-btn"
                      onClick={() => activeDm && handleUnblockUser(activeDm.user.id)}
                    >
                      {t("composer.unblock")}
                    </button>
                  </div>
                ) : composerBlocked ? (
                  <div className="dm-blocked-banner">
                    <Radio size={16} className="text-violet-400 shrink-0" />
                    <span>
                      {activeChannelInfo.moderatorOnlyPosting
                        ? t("composer.announcementOnly")
                        : t("composer.noSendPermission")}
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
                        {t("composer.offlineNotice", { name: activeDm.user.displayName })}
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
                  <div className="composer" {...tb.bar()}>
                    {voiceRecorder.state !== "idle" ? (
                      <VoiceRecordingBar recorder={voiceRecorder} />
                    ) : (
                    <>
                    <button
                      type="button"
                      className="attach-button"
                      onClick={() => fileRef.current?.click()}
                      aria-label={t("composer.attachFiles")}
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
                            ? t("composer.notePlaceholder")
                            : activeChannelInfo.threadContainer
                              ? t("composer.threadPostPlaceholder")
                              : activeChannelInfo.moderatorOnlyPosting
                                ? t("composer.announcementPlaceholder", { channel: channelTitle })
                                : inDmHome
                                  ? t("composer.dmPlaceholder", { channel: channelTitle })
                                  : t("composer.channelPlaceholder", { channel: channelTitle })
                          : t("composer.pickChannel")
                      }
                      aria-label={
                        activeChannelInfo.threadContainer
                          ? t("composer.newPostAria", { channel: channelTitle })
                          : t("composer.messageAria", { channel: channelTitle })
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
                        {tb.hidden("emoji") && (
                          <button
                            type="button"
                            className="mobile-composer-menu-item"
                            onClick={() => {
                              setEmojiOpen((open) => !open);
                              setGifOpen(false);
                              setFormatOpen(false);
                              setMobileComposerMenuOpen(false);
                            }}
                          >
                            <Smile size={18} />
                            <span>{t("composer.openEmojiPicker")}</span>
                          </button>
                        )}
                        {tb.hidden("gif") && (
                          <button
                            type="button"
                            className="mobile-composer-menu-item"
                            onClick={() => {
                              setGifOpen((open) => !open);
                              setEmojiOpen(false);
                              setMobileComposerMenuOpen(false);
                            }}
                          >
                            <span className="inline-flex items-center justify-center w-[18px] h-[18px] font-bold text-[10px]">GIF</span>
                            <span>{t("composer.addGif")}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className={`mobile-composer-menu-item${tb.hidden("format") ? "" : " tb-in-bar"}`}
                          onClick={() => {
                            setFormatOpen((open) => !open);
                            setMobileComposerMenuOpen(false);
                            setEmojiOpen(false);
                            setGifOpen(false);
                          }}
                        >
                          <Type size={18} />
                          <span>{t("composer.textFormatting")}</span>
                        </button>
                        <button
                          type="button"
                          className={`mobile-composer-menu-item${tb.hidden("poll") ? "" : " tb-in-bar"}`}
                          onClick={() => {
                            setPollDialogOpen(true);
                            setMobileComposerMenuOpen(false);
                          }}
                        >
                          <Vote size={18} />
                          <span>{t("composer.createPoll")}</span>
                        </button>
                        <button
                          type="button"
                          className={`mobile-composer-menu-item${tb.hidden("games") ? "" : " tb-in-bar"}`}
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
                          <span>{t("composer.playGames")}</span>
                        </button>
                        <button
                          type="button"
                          className={`mobile-composer-menu-item${tb.hidden("commands") ? "" : " tb-in-bar"}`}
                          onClick={() => {
                            setDraft("/");
                            setMobileComposerMenuOpen(false);
                            composerRef.current?.focus();
                          }}
                          disabled={!activeChannelId}
                        >
                          <span className="inline-flex items-center justify-center w-[18px] h-[18px] font-mono font-bold text-[15px] text-[var(--lavender,#5865f2)]">/</span>
                          <span>{t("composer.slashCommands")}</span>
                        </button>
                      </div>
                    )}

                    {/* Mobile ^ more menu toggle button */}
                    <button
                      type="button"
                      className={`composer-emoji-btn composer-more-mobile-btn ${mobileComposerMenuOpen || formatOpen || gamesOpen ? "active" : ""}`}
                      onClick={() => {
                        setMobileComposerMenuOpen((prev) => !prev);
                        setEmojiOpen(false);
                        setGifOpen(false);
                        setFormatOpen(false);
                      }}
                      aria-label={t("composer.moreOptions")}
                      title={t("composer.moreTools")}
                    >
                      <ChevronUp size={18} className={mobileComposerMenuOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                    </button>

                    {/* Formatting button (desktop only) */}
                    <button
                      type="button"
                      {...tb.item("format", `composer-emoji-btn composer-format-btn desktop-composer-item ${formatOpen ? "active" : ""}${inBar("format")}`)}
                      onClick={() => {
                        setFormatOpen((open) => !open);
                        setEmojiOpen(false);
                        setGifOpen(false);
                      }}
                      aria-label={t("composer.textFormatting")}
                      title={t("composer.formatTooltip")}
                      aria-expanded={formatOpen}
                    >
                      <Type size={18} />
                    </button>

                    {/* Emoji button - visible on both mobile and desktop */}
                    <button
                      type="button"
                      {...tb.item("emoji", "composer-emoji-btn")}
                      onClick={() => {
                        setEmojiOpen((open) => !open);
                        setGifOpen(false);
                        setFormatOpen(false);
                        setMobileComposerMenuOpen(false);
                      }}
                      aria-label={t("composer.openEmojiPicker")}
                      title={t("composer.openEmojiPicker")}
                    >
                      <Smile size={18} />
                    </button>

                    {/* GIF button - visible on both mobile and desktop */}
                    <button
                      type="button"
                      {...tb.item("gif", "gif-button")}
                      onClick={() => {
                        setGifOpen((open) => !open);
                        setEmojiOpen(false);
                        setMobileComposerMenuOpen(false);
                      }}
                      aria-label={t("composer.addGif")}
                    >
                      GIF
                    </button>

                    {/* Poll button (desktop only) */}
                    <button
                      type="button"
                      {...tb.item("poll", `composer-emoji-btn desktop-composer-item${inBar("poll")}`)}
                      onClick={() => setPollDialogOpen(true)}
                      aria-label={t("composer.createPoll")}
                      title={t("composer.createPoll")}
                    >
                      <Vote size={18} />
                    </button>

                    {/* Games button (desktop only) */}
                    <button
                      type="button"
                      {...tb.item("games", `composer-emoji-btn composer-games-btn desktop-composer-item ${gamesOpen ? "active" : ""}${inBar("games")}`)}
                      onClick={() => {
                        setGamesOpen((open) => !open);
                        setEmojiOpen(false);
                        setGifOpen(false);
                        setFormatOpen(false);
                      }}
                      aria-label={t("composer.gamesAria")}
                      title={t("composer.playGameTooltip")}
                      aria-expanded={gamesOpen}
                      disabled={!activeChannelId}
                    >
                      <Gamepad2 size={18} />
                    </button>

                    {/* Slash command button - housed in More tools popover */}
                    <button
                      type="button"
                      {...tb.item("commands", `gif-button desktop-composer-item${inBar("commands")}`)}
                      onClick={() => {
                        setDraft("/");
                        composerRef.current?.focus();
                      }}
                      aria-label={t("composer.showCommands")}
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
                        aria-label={t("composer.sendMessage")}
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
                          ? t("composer.msnTypingOne", { name: typingNames[0] })
                          : t("composer.msnTypingMany", { names: typingNames.slice(0, 3).join(", ") })
                        : typingNames.length === 1
                        ? t("composer.typingOne", { name: typingNames[0] })
                        : typingNames.length === 2
                          ? t("composer.typingTwo", { name1: typingNames[0], name2: typingNames[1] })
                          : t("composer.typingMany", { count: typingNames.length })}
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
