"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Award,
  Clock,
  Copy,
  Edit,
  EyeOff,
  Forward,
  Link,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Pin,
  Reply,
  Save,
  Speaker,
  Trash2,
  ShieldAlert,
  SmilePlus,
  Languages,
} from "lucide-react";
import { useI18n } from "@/app/lib/i18n-context";
import { translateMessage } from "@/app/lib/message-translate";

interface MessageContextMenuAction {
  label: string;
  icon: typeof MoreHorizontal;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface MessageContextMenuProps {
  x: number;
  y: number;
  messageId: string | number;
  messageContent: string;
  channelId: string | null | undefined;
  isOwn: boolean;
  isBot: boolean;
  isPinned: boolean;
  isSaved: boolean;
  canPin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onReply: () => void;
  onForward: () => void;
  onThread: () => void;
  onCopyText: () => void;
  onPin: () => void;
  onBookmark: () => void;
  onReminder: () => void;
  onApps: () => void;
  onMarkUnread: () => void;
  onCopyLink: () => void;
  onSpeak: () => void;
  onDelete: () => void;
  onCopyId: () => void;
  onReport: () => void;
  onAddReaction: () => void;
}

/**
 * Right-click context menu for messages.
 * Styled like a Discord-style message actions menu.
 */
export function MessageContextMenu({
  x,
  y,
  messageId,
  messageContent,
  channelId,
  isOwn,
  isBot,
  isPinned,
  isSaved,
  canPin,
  onClose,
  onEdit,
  onReply,
  onForward,
  onThread,
  onCopyText,
  onPin,
  onBookmark,
  onReminder,
  onApps,
  onMarkUnread,
  onCopyLink,
  onSpeak,
  onDelete,
  onCopyId,
  onReport,
  onAddReaction,
}: MessageContextMenuProps) {
  const { t, locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => {
    const winW = typeof window !== "undefined" ? window.innerWidth : 1200;
    const winH = typeof window !== "undefined" ? window.innerHeight : 800;
    const estimatedWidth = 220;
    const estimatedHeight = 420;
    return {
      left: Math.max(8, Math.min(x, winW - estimatedWidth - 8)),
      top: Math.max(8, Math.min(y, winH - estimatedHeight - 8)),
    };
  });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const winW = window.innerWidth || 1200;
    const winH = window.innerHeight || 800;
    const padding = 8;

    let nextLeft = x;
    let nextTop = y;

    if (nextLeft + rect.width > winW - padding) {
      nextLeft = Math.max(padding, winW - rect.width - padding);
    }
    if (nextTop + rect.height > winH - padding) {
      nextTop = Math.max(padding, winH - rect.height - padding);
    }

    setPos({ left: nextLeft, top: nextTop });
  }, [x, y]);

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
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

  function menuItem({
    label,
    icon: Icon,
    onSelect,
    danger,
    disabled,
  }: MessageContextMenuAction) {
    return (
      <button
        type="button"
        className={`msg-ctx-item${danger ? " danger" : ""}`}
        role="menuitem"
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
          onClose();
        }}
        disabled={disabled}
      >
        <Icon size={14} className="msg-ctx-icon" aria-hidden="true" />
        <span className="msg-ctx-label">{label}</span>
      </button>
    );
  }

  function separator() {
    return (
      <div className="user-menu-divider msg-ctx-separator" role="separator" />
    );
  }

  return (
    <div
      className="user-menu msg-ctx-menu"
      ref={ref}
      style={{ left: pos.left, top: pos.top }}
      role="menu"
    >
      {/* Reaction */}
      {menuItem({
        label: t("menu.addReaction"),
        icon: SmilePlus,
        onSelect: onAddReaction,
      })}
      {isOwn ? (
        <>
          {menuItem({ label: t("menu.editMessage"), icon: Edit, onSelect: onEdit })}
          {separator()}
          {menuItem({
            label: t("menu.deleteMessage"),
            icon: Trash2,
            onSelect: onDelete,
            danger: true,
          })}
        </>
      ) : (
        <>
          {menuItem({ label: t("menu.reply"), icon: Reply, onSelect: onReply })}
          {separator()}
        </>
      )}
      {menuItem({ label: t("menu.forward"), icon: Forward, onSelect: onForward })}
      {menuItem({ label: t("menu.createThread"), icon: MessageCircle, onSelect: onThread })}
      {separator()}
      {menuItem({ label: t("menu.copyText"), icon: Copy, onSelect: onCopyText })}
      {messageContent.trim() &&
        menuItem({
          label: t("menu.translate"),
          icon: Languages,
          onSelect: () => void translateMessage(String(messageId), locale),
        })}
      {menuItem({
        label: isPinned ? t("menu.unpinMessage") : t("menu.pinMessage"),
        icon: Pin,
        onSelect: onPin,
        disabled: !canPin,
      })}
      {menuItem({
        label: isSaved ? t("menu.removeBookmark") : t("menu.bookmarkMessage"),
        icon: Save,
        onSelect: onBookmark,
      })}
      {menuItem({ label: t("menu.createReminder"), icon: Clock, onSelect: onReminder })}
      {menuItem({ label: t("menu.apps"), icon: MoreHorizontal, onSelect: onApps })}
      {separator()}
      {menuItem({ label: t("menu.markUnread"), icon: EyeOff, onSelect: onMarkUnread })}
      {menuItem({ label: t("menu.copyMessageLink"), icon: Link, onSelect: onCopyLink })}
      {menuItem({ label: t("menu.speakMessage"), icon: Speaker, onSelect: onSpeak })}
      {!isOwn && !isBot && (
        <>
          {separator()}
          {menuItem({
            label: t("menu.reportMessage"),
            icon: ShieldAlert,
            onSelect: onReport,
          })}
        </>
      )}
      {separator()}
      {menuItem({ label: t("menu.copyMessageId"), icon: Award, onSelect: onCopyId })}
    </div>
  );
}
