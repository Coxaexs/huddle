"use client";

import { memo, useState } from "react";
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
import { Pin, Bookmark, BookmarkCheck, Pencil, Trash2, Volume2, Reply, MessageSquare, SmilePlus, Vote, UserPlus, MoreHorizontal, ShieldAlert, Forward, LogOut } from "lucide-react";
import { Avatar } from "../../avatar";
import { AvatarDecoration } from "../../cosmetics";
import { StyledName } from "../../profile-style-parts";
import { MessageTranslation } from "../../message-translation";
import { RoleIcon } from "../../role-icon";
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
import { DM_HOME, QUICK_VOTES } from "../../../lib/chat/constants";
import { buildMessageLink, resolveMessageLink, type MessageLinkTarget } from "../../../lib/chat/message-links";
import { apiFetch } from "../../../lib/client";
import { dayDividerLabel, formatClientTime, formatClientDateTime } from "../../../lib/chat/format";
import { extractInviteCodes } from "../../../lib/chat/invites";
import { clampTtsVoice, detectLanguage, getTtsVoice, speakableText, speakMessage } from "../../../lib/tts/client";
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
import { MessageContextMenu } from "./message-context-menu";
import { useI18n } from "@/app/lib/i18n-context";
import type { RefObject, Dispatch, SetStateAction } from "react";
import type { HeadTrackingSource, SpatialOutput, VideoPause, RemoteVoiceStream, VoiceLatencyStats, ScreenShareQuality, RelayStatus } from "../../../hooks/use-voice";
import type { HeadTrackingStatus } from "../../../lib/head-tracking";
import type { BackgroundMode } from "../../../lib/virtual-background";
import type { MicSettings, MicTelemetry } from "../../../lib/mic-chain";
import type { ClientEvent, VoiceParticipant, RecordingState } from "@/lib/protocol";

function MessageRowImpl({
  message,
  prev,
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
  setTtsSpeakingId,
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
  voiceChannelId,
  playerPosition,
  playerBlocked,
  playerUnblock,
  hubSend,
  hubPlayers,
  openThread,
  setNotice,
  openProfileByHandle,
  setLightboxImage,
  emojiMap,
  runCommand,
  pressCommandButton,
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
}: {
  message: Message;
  prev: Message | undefined;
  membersById: Map<string, Member>;
  activeDm: DmSummary | null;
  openUserMenu: (event: MouseEvent, member: Member, opts?: { dmChannelId?: string; dmPinned?: boolean; }) => void;
  activeChannelId: string | null;
  jumpToMessage: (channelId: string, messageId: string) => void;
  setPinsOpen: Dispatch<SetStateAction<boolean>>;
  user: PublicUser;
  canModerate: boolean;
  blockedUserIds: Set<string>;
  expandedBlockedMessages: Set<string>;
  setExpandedBlockedMessages: Dispatch<SetStateAction<Set<string>>>;
  msnTheme: boolean;
  openActionsId: string | number | null;
  reactionPicker: { messageId: string | number; top: number; right: number; mode?: "react" | "addToQuickReactions"; } | null;
  ttsSpeakingId: string | null;
  setTtsSpeakingId: Dispatch<SetStateAction<string | null>>;
  handleMessageTouchStart: (messageId: string | number, e: React.TouchEvent) => void;
  handleMessageTouchMove: (e: React.TouchEvent) => void;
  handleMessageTouchEnd: () => void;
  longPressTriggeredRef: RefObject<boolean>;
  touchInput: boolean;
  setOpenActionsId: Dispatch<SetStateAction<string | number | null>>;
  openBotMenu: (event: MouseEvent, kind: "music" | "dnd") => void;
  openProfile: (member: Member, e?: React.MouseEvent) => void;
  roleColorFor: (member: Member | undefined) => string | null;
  inDmHome: boolean;
  activeServer: PublicServer | null;
  setEditHistoryId: Dispatch<SetStateAction<string | null>>;
  voiceChannelId: string | null;
  /** Zero except on the now-playing card, so the 500ms tick spares other rows. */
  playerPosition: number;
  playerBlocked: boolean;
  playerUnblock: () => void;
  hubSend: (event: ClientEvent) => boolean;
  hubPlayers: Record<string, PlayerState>;
  openThread: (message: Message) => Promise<void>;
  setNotice: Dispatch<SetStateAction<string>>;
  openProfileByHandle: (handle: string) => void;
  setLightboxImage: (img: string | null) => void;
  emojiMap: Record<string, string>;
  runCommand: (raw: string) => Promise<void>;
  pressCommandButton: (command: string) => Promise<void>;
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
  activeChannel: PublicChannel | null;
  setForwardTarget: Dispatch<SetStateAction<ForwardMessageTarget | null>>;
  setQuickVoteId: Dispatch<SetStateAction<string | number | null>>;
  beginEdit: (message: Message) => void;
  canPin: boolean;
  togglePin: (message: Message) => Promise<void>;
  deleteMessage: (id: string | number) => Promise<void>;
  showCustomConfirm: (options: { title: string; message?: string; isDanger?: boolean; confirmText?: string; cancelText?: string; onConfirm: () => void; onCancel?: () => void; }) => void;
}): ReactNode {
  const { t } = useI18n();
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const closeCtxMenu = () => setCtxMenu(null);

  /** Opens a linked message: its server (or DMs), its channel, scrolled to it. */
  const openMessageLink = (target: MessageLinkTarget) => {
    void resolveMessageLink(target)
      .then(({ serverId, channelId, messageId }) => {
        setActiveServerId(serverId || DM_HOME);
        jumpToMessage(channelId, messageId);
      })
      .catch((error) =>
        setNotice(error instanceof Error ? error.message : "That message can't be opened."),
      );
  };
                  const dayLabel = dayDividerLabel(message, prev) ?? undefined;
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
                          <span>{t("message.blocked")} ({message.author})</span>
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
                          {t("message.showBlocked")}
                        </button>
                      </div>
                    );
                  }

                  if (message.payload?.nudge) {
                    return (
                      <div key={message.id} id={`msg-${message.id}`} className="nudge-line">
                        <span className="nudge-line-rule" aria-hidden="true" />
                        {message.userId === user.id
                          ? t("msn.nudged")
                          : t("msn.receivedNudge", { name: stripTextStyle(author?.displayName || message.author) })}
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
                          ? t("msn.winkSent", { name: wink.name })
                          : t("msn.winkReceived", { name: stripTextStyle(author?.displayName || message.author), wink: wink.name })}
                        <button type="button" className="wink-replay" onClick={() => playWink(wink.id)}>
                          {t("msn.winkPlay")}
                        </button>
                        <span className="nudge-line-rule" aria-hidden="true" />
                      </div>
                    );
                  }

                  // Collapse the avatar/name header when the same author sends a
                  // burst of messages close together — but never for replies or
                  // rich cards, which each need their own header.
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
                    <>
                      <article
                      id={`msg-${message.id}`}
                      data-day={dayLabel}
                      className={`message ${continuation ? "continuation" : ""} ${message.pinned ? "is-pinned" : ""
                        } ${openActionsId === message.id ? "actions-open" : ""} ${reactionPicker?.messageId === message.id
                          ? "actions-open reaction-picker-active"
                          : ""
                        } ${user && message.mentions?.includes(user.id) ? "mentions-me" : ""
                        } ${ttsSpeakingId === String(message.id) ? "tts-speaking" : ""} ${message.pending ? "is-pending" : ""}`}
                      key={message.id}
                      onTouchStart={(e) => handleMessageTouchStart(message.id, e)}
                      onTouchMove={handleMessageTouchMove}
                      onTouchEnd={handleMessageTouchEnd}
                      onTouchCancel={handleMessageTouchEnd}
                      onContextMenu={(event) => {
                        // Nothing to act on until the server has it.
                        if (message.pending) {
                          event.preventDefault();
                          return;
                        }
                        if (longPressTriggeredRef.current || touchInput) {
                          event.preventDefault();
                          event.stopPropagation();
                          setOpenActionsId(message.id);
                          return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        if (message.bot) {
                          openBotMenu(
                            event,
                            message.author.toLowerCase().includes("d&d")
                              ? "dnd"
                              : "music",
                          );
                          return;
                        }
                        setCtxMenu({ x: event.clientX, y: event.clientY });
                      }}
                    >
                      {isBlockedUser && (
                        <div className="col-span-full flex items-center justify-between text-[11px] text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-md mb-2">
                          <span className="flex items-center gap-1.5 font-bold">
                            <ShieldAlert size={12} /> {t("message.blocked")}
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
                            {t("message.hideBlocked")}
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
                        >
                          <AvatarDecoration id={author?.avatarFrame} inChat />
                        </Avatar>
                      )}
                      <div className="message-body">
                        {message.commandText && (
                          <div className="command-invocation">
                            <span className="reply-arrow">↩</span>
                            <strong>{message.commandBy || t("message.someone")}</strong>
                            <span className="command-used">{t("message.commandUsed")}</span>
                            <code>{message.commandText}</code>
                          </div>
                        )}
                        {message.replyTo && (
                          <button
                            type="button"
                            className="reply-preview"
                            onClick={() => {
                              const original = document.getElementById(`msg-${message.replyTo}`);
                              if (original) original.scrollIntoView({ behavior: "smooth", block: "center" });
                              // Not mounted (further up) or not loaded: jumping mounts or fetches it.
                              else if (activeChannelId) jumpToMessage(activeChannelId, String(message.replyTo));
                            }}
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
                              onClick={(event) => {
                                if (author) openProfile(author, event);
                              }}
                            >
                              <StyledName name={author?.displayName || message.author} style={author?.profileStyle} />
                            </strong>
                            {!inDmHome && <RoleIcon member={author} server={activeServer} />}
                            {!inDmHome && activeServer && author && (
                              <MemberTag tag={getMemberTagInfo(author, activeServer)} size="small" />
                            )}
                            {author && <PrideBadges badges={author.prideBadges} mini />}
                            {message.bot && <span className="bot-tag">BOT</span>}
                            {message.payload?.tts && (
                              <span
                                className={`tts-tag ${ttsSpeakingId === String(message.id) ? "speaking" : ""}`}
                                title={t("message.ttsNotice")}
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
                                {t("message.edited")}
                              </button>
                            )}
                            {message.pinned && (
                              <span className="pin-tag flex items-center gap-1" title={t("message.pinned")}>
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
                              message.payload.voiceChannelId === voiceChannelId
                                ? playerPosition
                                : undefined
                            }
                            live={
                              message.payload.voiceChannelId === voiceChannelId &&
                              hubPlayers[voiceChannelId!]?.track?.id ===
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
                            messageId={String(message.id)}
                            viewerId={user.id}
                            voiceChannelId={voiceChannelId}
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
                            transcript={message.payload?.voice?.transcript}
                            messageId={String(message.id)}
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
                            onMessageLink={openMessageLink}
                            onCommand={(command) => void pressCommandButton(command)}
                          />
                        )}
                        <MessageTranslation messageId={String(message.id)} />

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
                              state={hubPlayers[message.payload.voiceChannelId] || null}
                              trackId={message.payload.trackId}
                              trackLabel={message.payload.label}
                              position={
                                voiceChannelId === message.payload.voiceChannelId
                                  ? playerPosition
                                  : 0
                              }
                              controllable={
                                voiceChannelId === message.payload.voiceChannelId
                              }
                              blocked={!botStreaming && playerBlocked}
                              onUnblock={playerUnblock}
                              voiceChannelName={
                                voiceChannels.find(
                                  (channel) =>
                                    channel.id === message.payload?.voiceChannelId,
                                )?.name
                              }
                              onSeek={(positionMs) =>
                                hubSend({
                                  t: "player",
                                  channelId: message.payload!.voiceChannelId!,
                                  action: { name: "seek", positionMs },
                                })
                              }
                              onToggle={() =>
                                hubSend({
                                  t: "player",
                                  channelId: message.payload!.voiceChannelId!,
                                  action: { name: "toggle" },
                                })
                              }
                              onSkip={() =>
                                hubSend({
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
                              alts={message.imageAlts}
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
                            title={t("message.addReaction")}
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
                        <button
                          type="button"
                          title={t("message.reply")}
                          onClick={() => {
                            setReplyTarget(message);
                            composerRef.current?.focus();
                            setOpenActionsId(null);
                            setMobileActionsMoreId(null);
                          }}
                        >
                          <Reply size={16} />
                        </button>
                        {/* Show extra actions when Shift is held on desktop or when More is tapped on mobile */}
                        {(shiftPressed || mobileActionsMoreId === message.id) && (
                          <>
                            <button
                              type="button"
                              title={savedIds.has(String(message.id)) ? t("message.removeBookmark") : t("message.bookmark")}
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
                              title={t("message.replyInThread")}
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
                              title={t("message.forward")}
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
                              title={t("message.quickVote")}
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
                                title={t("message.edit")}
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
                                title={message.pinned ? t("message.unpinMessage") : t("message.pinMessage")}
                                onClick={() => {
                                  void togglePin(message);
                                  setOpenActionsId(null);
                                  setMobileActionsMoreId(null);
                                }}
                              >
                                <Pin size={16} />
                              </button>
                            )}
                            {!inDmHome && activeServer && message.userId !== user.id && !message.bot && (
                              <button
                                type="button"
                                title={t("message.report")}
                                onClick={() => {
                                  setOpenActionsId(null);
                                  setMobileActionsMoreId(null);
                                  showCustomConfirm({
                                    title: t("menu.reportMessage"),
                                    message: "Report this message to the server moderators?",
                                    isDanger: true,
                                    confirmText: t("menu.reportMessage"),
                                    cancelText: t("common.cancel"),
                                    onConfirm: () => {
                                      void apiFetch("/api/reports", {
                                        method: "POST",
                                        body: JSON.stringify({
                                          serverId: activeServer.id,
                                          channelId: activeChannelId,
                                          messageId: message.id,
                                          reason: "Reported from chat",
                                        }),
                                      })
                                        .then(() => setNotice("Message reported to moderators."))
                                        .catch((err) =>
                                          setNotice(err instanceof Error ? err.message : "Could not report message."),
                                        );
                                    },
                                  });
                                }}
                              >
                                <ShieldAlert size={16} />
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
                            title={t("message.delete")}
                            onClick={(event) => {
                              setOpenActionsId(null);
                              setMobileActionsMoreId(null);
                              if (event.shiftKey) {
                                void deleteMessage(message.id);
                              } else {
                                showCustomConfirm({
                                  title: t("message.deleteConfirmTitle"),
                                  message: t("message.deleteConfirmText"),
                                  isDanger: true,
                                  confirmText: t("common.delete"),
                                  cancelText: t("common.cancel"),
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
                    {ctxMenu && (
                      <MessageContextMenu
                        x={ctxMenu.x}
                        y={ctxMenu.y}
                        messageId={message.id}
                        messageContent={message.text}
                        channelId={message.channelId}
                        isOwn={message.userId === user.id}
                        isBot={Boolean(message.bot)}
                        isPinned={Boolean(message.pinned)}
                        isSaved={savedIds.has(String(message.id))}
                        canPin={canPin}
                        onClose={closeCtxMenu}
                        onEdit={() => {
                          closeCtxMenu();
                          beginEdit(message);
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onReply={() => {
                          closeCtxMenu();
                          setReplyTarget(message);
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onForward={() => {
                          closeCtxMenu();
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
                        onThread={() => {
                          closeCtxMenu();
                          void openThread(message);
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onCopyText={() => {
                          closeCtxMenu();
                          void navigator.clipboard.writeText(message.text);
                          setNotice("Message text copied.");
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onPin={() => {
                          closeCtxMenu();
                          void togglePin(message);
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onBookmark={() => {
                          closeCtxMenu();
                          void toggleSaved(String(message.id));
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onReminder={() => {
                          closeCtxMenu();
                          setNotice("Reminder coming soon.");
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onApps={() => {
                          closeCtxMenu();
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onMarkUnread={() => {
                          closeCtxMenu();
                          setNotice("Mark as unread coming soon.");
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onCopyLink={() => {
                          closeCtxMenu();
                          const link = buildMessageLink({
                            messageId: String(message.id),
                            channelId: message.channelId || activeChannelId || undefined,
                            serverId: inDmHome ? undefined : activeServer?.id,
                          });
                          void navigator.clipboard.writeText(link);
                          setNotice("Message link copied.");
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onSpeak={() => {
                          closeCtxMenu();
                          const text = speakableText(message.text || "");
                          if (!text) {
                            setNotice("There is nothing in that message to read aloud.");
                          } else {
                            // A /tts message keeps its sender's language and voice;
                            // anything else is guessed and read in this device's voice.
                            const tts = message.payload?.tts;
                            const spokenId = String(message.id);
                            void speakMessage(
                              text,
                              tts ? (tts.lang === "tr" ? "tr" : "en") : detectLanguage(text) ?? "en",
                              {
                                onStart: () => setTtsSpeakingId(spokenId),
                                onEnd: () => setTtsSpeakingId((current) => (current === spokenId ? null : current)),
                              },
                              tts ? clampTtsVoice(tts.voice) : getTtsVoice(),
                            ).catch(() => setNotice("Could not read that message aloud."));
                          }
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onDelete={() => {
                          closeCtxMenu();
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
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onCopyId={() => {
                          closeCtxMenu();
                          void navigator.clipboard.writeText(String(message.id));
                          setNotice("Message ID copied.");
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onReport={() => {
                          closeCtxMenu();
                          showCustomConfirm({
                            title: "Report Message",
                            message: "Report this message to the server moderators?",
                            isDanger: true,
                            confirmText: "Report",
                            cancelText: "Cancel",
                            onConfirm: () => {
                              void apiFetch("/api/reports", {
                                method: "POST",
                                body: JSON.stringify({
                                  serverId: activeServer?.id,
                                  channelId: activeChannelId,
                                  messageId: message.id,
                                  reason: "Reported from chat",
                                }),
                              })
                                .then(() => setNotice("Message reported to moderators."))
                                .catch((err) =>
                                  setNotice(err instanceof Error ? err.message : "Could not report message."),
                                );
                            },
                          });
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                        onAddReaction={() => {
                          closeCtxMenu();
                          // The picker opens beside whatever it was clicked from; here
                          // that is the message's right edge (where the hover bar's
                          // react button sits), level with the right-click.
                          const row = document.getElementById(`msg-${message.id}`)?.getBoundingClientRect();
                          const anchor = new DOMRect(
                            row ? row.right - 48 : window.innerWidth - 64,
                            ctxMenu?.y ?? row?.top ?? 0,
                            0,
                            0,
                          );
                          handleOpenReactionPicker(
                            {
                              stopPropagation: () => undefined,
                              currentTarget: { getBoundingClientRect: () => anchor },
                            } as unknown as MouseEvent,
                            message.id,
                            "react",
                          );
                          setOpenActionsId(null);
                          setMobileActionsMoreId(null);
                        }}
                      />
                    )}
                  </>
                  );
                }

export const MessageRow = memo(MessageRowImpl);
