"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Member } from "@/lib/users";
import { PrideBadges } from "./pride-badges";
import { VoiceDuration } from "./voice-duration";
import { TIMEOUT_CHOICES } from "@/lib/timeouts";
import { useI18n } from "@/app/lib/i18n-context";

export interface UserMenuTarget {
  member: Pick<Member, "id" | "displayName" | "username" | "prideBadges"> & {
    canInvite?: boolean;
    isAdmin?: boolean;
  };
  x: number;
  y: number;
  dmChannelId?: string;
  dmPinned?: boolean;
}

export interface VoicePref {
  volume: number;
  muted: boolean;
}

interface UserMenuProps {
  target: UserMenuTarget;
  isSelf: boolean;
  pref: VoicePref;
  serverMuted: boolean;
  onClose: () => void;
  onMessage: () => void;
  onLocalMute: (muted: boolean) => void;
  onVolume: (volume: number) => void;
  onServerMute: (muted: boolean) => void;
  /** Moderation affordances, shown only when the viewer has the permission. */
  canModerate?: boolean;
  canManage?: boolean;
  onKick?: () => void;
  onBan?: () => void;
  /** Shown instead of Ban when this person is already banned. */
  banned?: boolean;
  onUnban?: () => void;
  /** Voice channels this person can be moved into (moderators only). */
  voiceChannels?: Array<{ id: string; name: string }>;
  /** The voice channel this person is currently sitting in, if any. */
  targetVoiceChannelId?: string | null;
  onMove?: (channelId: string) => void;
  /** Hub-clock ms when this person's current voice seat started, if any. */
  voiceJoinedAt?: number | null;
  /** The hub's clock, so the "in voice for" timer agrees with everyone else's. */
  serverNow?: () => number;
  /** Whether viewer is instance owner */
  isOwner?: boolean;
  onToggleInvitePermission?: () => void;
  /** Blocking */
  isBlocked?: boolean;
  onBlock?: () => void;
  onUnblock?: () => void;
  /** Change this person's nickname in the current server, when allowed. */
  onNickname?: () => void;
  /** Pick your own picture for the current server. */
  onServerAvatar?: () => void;
  /** Go back to the account picture here (yours, or theirs as a moderator). */
  onRemoveServerAvatar?: () => void;
  /** Time this person out (minutes; 0 lifts it), shown to moderators. */
  onTimeout?: (minutes: number) => void;
  /** When their current timeout ends, if they have one. */
  timeoutUntil?: string | null;
  /** Shown to a group DM's owner on its other members. */
  onRemoveFromGroup?: () => void;
  /** Theme extras appended at the bottom (the MSN theme's groups and alerts). */
  extra?: React.ReactNode;
  /** Pin or unpin this direct message conversation */
  onTogglePinDm?: () => void;
  dmPinned?: boolean;
}

/**
 * Right-click menu for a person: message them, change how you hear them, or
 * mute them for the whole Huddle.
 */
export function UserMenu({
  target,
  isSelf,
  pref,
  serverMuted,
  onClose,
  onMessage,
  onLocalMute,
  onVolume,
  onServerMute,
  canModerate = false,
  canManage = false,
  onKick,
  onRemoveFromGroup,
  onBan,
  banned = false,
  onUnban,
  voiceChannels = [],
  targetVoiceChannelId = null,
  onMove,
  voiceJoinedAt = null,
  serverNow,
  isOwner = false,
  onToggleInvitePermission,
  isBlocked = false,
  onBlock,
  onUnblock,
  onNickname,
  onServerAvatar,
  onRemoveServerAvatar,
  onTimeout,
  timeoutUntil = null,
  extra,
  onTogglePinDm,
  dmPinned = false,
}: UserMenuProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // A frame's delay, or the click that opened the menu closes it again.
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", dismiss);
      window.addEventListener("contextmenu", dismiss);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", dismiss);
      window.removeEventListener("contextmenu", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Keep the menu on screen when the click was near an edge. The height
  // depends on which actions you have, so measure it after rendering.
  const [pos, setPos] = useState({ left: target.x, top: target.y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 12;
    const { width, height } = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - margin;
    const maxTop = window.innerHeight - height - margin;
    setPos({
      left: Math.max(margin, Math.min(target.x, maxLeft)),
      // Near the bottom, open upward from the cursor like native menus do.
      top: Math.max(margin, target.y > maxTop ? Math.min(target.y - height, maxTop) : target.y),
    });
  }, [target.x, target.y, target.member.id]);
  const style = pos;

  return (
    <div className="user-menu" ref={ref} style={style} role="menu">
      <div className="user-menu-head">
        <strong>{target.member.displayName}</strong>
        <PrideBadges badges={target.member.prideBadges} mini />
        <span>@{target.member.username}</span>
        {serverNow && voiceJoinedAt ? (
          <span className="user-menu-voice-time">
            <VoiceDuration joinedAt={voiceJoinedAt} serverNow={serverNow} />
          </span>
        ) : null}
      </div>

      {onNickname && (
        <button type="button" role="menuitem" onClick={onNickname}>
          {isSelf ? "Change nickname" : "Edit nickname"}
        </button>
      )}
      {onServerAvatar && (
        <button type="button" role="menuitem" onClick={onServerAvatar}>
          {t("serverAvatar.change")}
        </button>
      )}
      {onRemoveServerAvatar && (
        <button type="button" role="menuitem" onClick={onRemoveServerAvatar}>
          {t("serverAvatar.remove")}
        </button>
      )}

      {!isSelf && (
        <>
          {!isBlocked && (
            <button type="button" role="menuitem" onClick={onMessage}>
              {t("userMenu.message")}
            </button>
          )}
          {onTogglePinDm && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onTogglePinDm();
                onClose();
              }}
            >
              {dmPinned ? t("userMenu.unpinConversation") : t("userMenu.pinConversation")}
            </button>
          )}
          {isBlocked ? (
            onUnblock && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onUnblock();
                  onClose();
                }}
              >
                {t("userMenu.unblock")}
              </button>
            )
          ) : (
            onBlock && (
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  onBlock();
                  onClose();
                }}
              >
                {t("userMenu.block")}
              </button>
            )
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => onLocalMute(!pref.muted)}
          >
            {pref.muted ? t("userMenu.unmuteForMe") : t("userMenu.muteForMe")}
          </button>

          <label className="user-menu-volume">
            <span>{t("userMenu.volumeLabel", { volume: pref.volume })}</span>
            <input
              type="range"
              min={0}
              max={200}
              step={1}
              value={pref.volume}
              onChange={(event) => onVolume(Number(event.target.value))}
            />
          </label>

          {(canModerate || canManage) && <div className="user-menu-divider" />}
          {canModerate && (
            <>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => onServerMute(!serverMuted)}
              >
                {serverMuted ? t("userMenu.unmuteOnServer") : t("userMenu.muteOnServer")}
              </button>
              <p className="user-menu-note">
                {t("userMenu.serverMuteNote")}
              </p>
            </>
          )}
          {canModerate && onMove && targetVoiceChannelId && (
            <div className="user-menu-move">
              <span className="user-menu-move-label">{t("userMenu.moveToVoice")}</span>
              {voiceChannels
                .filter((channel) => channel.id !== targetVoiceChannelId)
                .map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    role="menuitem"
                    onClick={() => onMove(channel.id)}
                  >
                    ◖)) {channel.name}
                  </button>
                ))}
              {voiceChannels.filter(
                (channel) => channel.id !== targetVoiceChannelId,
              ).length === 0 && (
                <p className="user-menu-note">{t("userMenu.noOtherVoiceChannels")}</p>
              )}
            </div>
          )}
          {onTimeout && (
            <div className="user-menu-move">
              <span className="user-menu-move-label">
                {timeoutUntil
                  ? t("userMenu.timedOutUntil", {
                      when: new Date(timeoutUntil).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }),
                    })
                  : t("userMenu.timeout")}
              </span>
              {timeoutUntil ? (
                <button type="button" role="menuitem" onClick={() => onTimeout(0)}>
                  {t("userMenu.removeTimeout")}
                </button>
              ) : (
                <div className="user-menu-chip-row">
                  {TIMEOUT_CHOICES.map((choice) => (
                    <button
                      key={choice.minutes}
                      type="button"
                      role="menuitem"
                      className="user-menu-chip"
                      onClick={() => onTimeout(choice.minutes)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {onRemoveFromGroup && (
            <button type="button" role="menuitem" className="danger" onClick={onRemoveFromGroup}>
              {t("userMenu.removeFromGroup")}
            </button>
          )}
          {canManage && onKick && (
            <button type="button" role="menuitem" className="danger" onClick={onKick}>
              {t("userMenu.kickFromServer")}
            </button>
          )}
          {canManage &&
            (banned
              ? onUnban && (
                  <button type="button" role="menuitem" onClick={onUnban}>
                    {t("userMenu.unbanFromServer")}
                  </button>
                )
              : onBan && (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={onBan}
                  >
                    {t("userMenu.banFromServer")}
                  </button>
                ))}

          {isOwner && !target.member.isAdmin && onToggleInvitePermission && (
            <>
              <div className="user-menu-divider" />
              <button
                type="button"
                role="menuitem"
                onClick={onToggleInvitePermission}
              >
                {target.member.canInvite
                  ? t("userMenu.revokeInvites")
                  : t("userMenu.allowInvites")}
              </button>
            </>
          )}
        </>
      )}

      {isSelf && (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onMessage();
              onClose();
            }}
          >
            {t("userMenu.noteToSelf")}
          </button>
          {onTogglePinDm && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onTogglePinDm();
                onClose();
              }}
            >
              {dmPinned ? t("userMenu.unpinConversation") : t("userMenu.pinConversation")}
            </button>
          )}
          <p className="user-menu-note">{t("userMenu.thisIsYou")}</p>
        </>
      )}
      {extra}
    </div>
  );
}
