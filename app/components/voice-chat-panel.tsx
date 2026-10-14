"use client";

/**
 * The side chat of a voice room, docked beside its stage the way Discord's
 * voice channels carry one: whoever is in the call can drop a link, a picture
 * or a "brb" without leaving the room for a text channel.
 *
 * It keeps its own message list rather than borrowing the shell's, because the
 * shell's list follows the selected text channel and both stay visible at once.
 * Live messages come in through `subscribe`, which the shell feeds from the hub.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { MessageCircle, Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "../lib/client";
import type { Message } from "../lib/chat/types";
import type { Member } from "@/lib/users";
import { Avatar } from "./avatar";
import { MessageBody, StyledText, proxiedImage } from "./message-body";

export type VoiceChatEvent =
  | { type: "message"; message: Message }
  | { type: "deleted"; id: string }
  | { type: "edited"; id: string; content?: string; editedAt?: string };

/** Messages from one author closer together than this share a header. */
const GROUP_GAP_MS = 7 * 60 * 1000;

function dayLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function stampLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function VoiceChatPanel({
  channelId,
  channelName,
  userId,
  selfHandle,
  canModerate,
  membersById,
  emojis,
  subscribe,
  onClose,
  onImage,
  onNotice,
}: {
  channelId: string;
  channelName: string;
  userId: string;
  selfHandle?: string;
  canModerate: boolean;
  membersById: Map<string, Member>;
  emojis?: Record<string, string>;
  /** Registers the live-event sink; returns the unsubscribe. */
  subscribe: (channelId: string, sink: (event: VoiceChatEvent) => void) => () => void;
  onClose: () => void;
  onImage?: (url: string) => void;
  onNotice?: (text: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setLoaded(false);
    stickToBottom.current = true;
    apiFetch<{ messages: Message[] }>(`/api/messages?channelId=${encodeURIComponent(channelId)}`)
      .then((data) => {
        if (!cancelled) setMessages(data.messages || []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  useEffect(
    () =>
      subscribe(channelId, (event) => {
        if (event.type === "message") {
          // Thread replies never show in the room's flow.
          if (event.message.threadId) return;
          setMessages((current) =>
            current.some((m) => String(m.id) === String(event.message.id)) ? current : [...current, event.message],
          );
        } else if (event.type === "deleted") {
          setMessages((current) => current.filter((m) => String(m.id) !== event.id));
        } else {
          setMessages((current) =>
            current.map((m) =>
              String(m.id) === event.id
                ? { ...m, text: typeof event.content === "string" ? event.content : m.text, editedAt: event.editedAt }
                : m,
            ),
          );
        }
      }),
    [channelId, subscribe],
  );

  // Follow new messages only while the reader is already at the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [channelId]);

  const send = useCallback(
    async (text: string, keys: string[] = []) => {
      if (!text.trim() && !keys.length) return;
      setSending(true);
      stickToBottom.current = true;
      try {
        await apiFetch("/api/messages", {
          method: "POST",
          body: JSON.stringify({
            channelId,
            content: text,
            attachmentKey: keys[0],
            attachmentKeys: keys.slice(1),
          }),
        });
      } catch (error) {
        onNotice?.(error instanceof Error ? error.message : "Could not send that.");
        throw error;
      } finally {
        setSending(false);
      }
    },
    [channelId, onNotice],
  );

  async function submit() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    try {
      await send(text);
    } catch {
      setDraft((current) => current || text);
    }
  }

  async function attach(files: FileList | null) {
    if (!files?.length) return;
    try {
      const keys: string[] = [];
      for (const file of Array.from(files).slice(0, 10)) {
        const form = new FormData();
        form.append("file", file);
        const upload = await apiFetch<{ key: string }>("/api/uploads", { method: "POST", body: form });
        keys.push(upload.key);
      }
      const text = draft.trim();
      setDraft("");
      await send(text, keys);
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "Could not upload that.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(message: Message) {
    try {
      await apiFetch(`/api/messages/${encodeURIComponent(String(message.id))}`, { method: "DELETE" });
      setMessages((current) => current.filter((m) => m.id !== message.id));
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "Could not delete that.");
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  const rows: React.ReactNode[] = [];
  let previous: Message | null = null;
  let previousDay = "";
  for (const message of messages) {
    const at = message.createdAt ? new Date(message.createdAt) : null;
    const day = at ? at.toDateString() : previousDay;
    if (at && day !== previousDay) {
      rows.push(
        <div key={`day-${day}`} className="voice-chat-day" role="separator">
          <span>{dayLabel(at)}</span>
        </div>,
      );
    }
    const prevAt = previous?.createdAt ? new Date(previous.createdAt).getTime() : 0;
    const grouped =
      previous !== null &&
      day === previousDay &&
      previous.userId === message.userId &&
      previous.author === message.author &&
      at !== null &&
      at.getTime() - prevAt < GROUP_GAP_MS;
    const author = message.userId ? membersById.get(message.userId) : undefined;
    const images = [message.image, ...(message.images || [])].filter((url): url is string => Boolean(url));
    const files = (message.files || []).filter((file) => !images.includes(file.url));
    const mayDelete = message.userId === userId || canModerate;
    rows.push(
      <div key={String(message.id)} className={`voice-chat-msg ${grouped ? "grouped" : ""}`}>
        {grouped ? (
          <span className="voice-chat-gutter" aria-hidden="true" />
        ) : (
          <Avatar
            className="voice-chat-avatar"
            avatar={author?.avatar || message.avatar}
            avatarUrl={author?.avatarUrl}
            color={author?.color || message.color}
            size={36}
          />
        )}
        <div className="voice-chat-content">
          {!grouped && (
            <div className="voice-chat-meta">
              <strong style={{ color: author?.color || message.color }}>
                <StyledText text={author?.displayName || message.author} />
              </strong>
              {message.bot && <span className="voice-chat-bot">BOT</span>}
              {at && <time dateTime={message.createdAt}>{stampLabel(at)}</time>}
            </div>
          )}
          {message.text && (
            <div className="voice-chat-text">
              <MessageBody text={message.text} selfHandle={selfHandle} emojis={emojis} onImage={onImage} />
              {message.editedAt && <span className="voice-chat-edited">(edited)</span>}
            </div>
          )}
          {images.map((url) => (
            <img
              key={url}
              className="voice-chat-image"
              src={proxiedImage(url)}
              alt=""
              loading="lazy"
              onClick={() => onImage?.(proxiedImage(url))}
              onLoad={() => {
                const el = scrollRef.current;
                if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
              }}
            />
          ))}
          {files.map((file) => (
            <a key={file.url} className="voice-chat-file" href={file.url} target="_blank" rel="noreferrer">
              {file.name}
            </a>
          ))}
          {message.audio && <audio className="voice-chat-audio" src={message.audio} controls preload="none" />}
        </div>
        {mayDelete && (
          <button
            type="button"
            className="voice-chat-delete"
            title="Delete message"
            aria-label="Delete message"
            onClick={() => void remove(message)}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>,
    );
    previous = message;
    previousDay = day;
  }

  return (
    <aside className="voice-chat-panel" aria-label={`${channelName} chat`}>
      <header className="voice-chat-header">
        <MessageCircle size={18} aria-hidden="true" />
        <strong className="truncate">{channelName}</strong>
        <button type="button" className="voice-chat-close" onClick={onClose} title="Close chat" aria-label="Close chat">
          <X size={18} />
        </button>
      </header>
      <div
        ref={scrollRef}
        className="voice-chat-scroll"
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {loaded && !messages.length ? (
          <div className="voice-chat-empty">
            <MessageCircle size={32} aria-hidden="true" />
            <strong>Welcome to the chat of {channelName}</strong>
            <span>Messages here stay with the voice channel, so anyone who joins later can read them.</span>
          </div>
        ) : (
          rows
        )}
      </div>
      <form
        className="voice-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <button
          type="button"
          className="voice-chat-attach"
          title="Upload a file"
          aria-label="Upload a file"
          onClick={() => fileRef.current?.click()}
        >
          <Plus size={20} />
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={(event) => void attach(event.target.files)} />
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          maxLength={4000}
          placeholder={`Message ${channelName}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            const files = event.clipboardData?.files;
            if (files?.length) {
              event.preventDefault();
              void attach(files);
            }
          }}
        />
      </form>
    </aside>
  );
}
