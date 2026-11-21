"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Hash, Send } from "lucide-react";
import { apiFetch, basePath } from "../../lib/client";
import { MessageBody } from "../message-body";

/** The time in the viewer's own zone; the server formats `time` in UTC. */
function localTime(m: { createdAt?: string; time: string }): string {
  const at = m.createdAt ? new Date(m.createdAt) : null;
  return at && !Number.isNaN(at.getTime()) ? at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : m.time;
}

export interface SimpleChatMessage {
  id: string;
  channelId: string | null;
  userId: string | null;
  author: string;
  avatar: string;
  color: string;
  text: string;
  bot?: boolean;
  time: string;
  createdAt: string;
  editedAt?: string;
  image?: string;
}

export interface ChatPaneLiveSignal {
  seq: number;
  kind: "message" | "edited" | "deleted";
  channelId: string;
  message?: SimpleChatMessage;
  messageId?: string;
  content?: string;
  editedAt?: string;
}

export function ChatPane({
  channelId,
  channelName,
  pairToken,
  pairedReadOnly,
  liveSignal,
}: {
  channelId: string | null;
  channelName: string | null;
  pairToken: string;
  pairedReadOnly: boolean;
  liveSignal: ChatPaneLiveSignal | null;
}) {
  const [messages, setMessages] = useState<SimpleChatMessage[]>([]);
  const [resolvedName, setResolvedName] = useState<string | null>(channelName);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickBottomRef = useRef(true);

  const loadMessages = useCallback(async () => {
    if (!channelId && !pairedReadOnly) {
      setMessages([]);
      return;
    }
    try {
      if (pairedReadOnly) {
        const res = await apiFetch<{
          messages: SimpleChatMessage[];
          channelName?: string | null;
        }>(
          `/api/second-screen/feed?pair=${encodeURIComponent(pairToken)}&kind=messages`,
        );
        setMessages(res.messages || []);
        if (res.channelName !== undefined) setResolvedName(res.channelName);
      } else if (channelId) {
        const res = await apiFetch<{ messages: SimpleChatMessage[] }>(
          `/api/messages?channelId=${encodeURIComponent(channelId)}`,
        );
        setMessages((res.messages || []).slice(-80));
        setResolvedName(channelName);
      }
    } catch {
      /* ignore transient fetch failure */
    }
  }, [channelId, channelName, pairToken, pairedReadOnly]);

  useEffect(() => {
    setResolvedName(channelName);
  }, [channelName]);

  useEffect(() => {
    stickBottomRef.current = true;
    setLoading(true);
    void loadMessages().finally(() => setLoading(false));
  }, [loadMessages]);

  // Paired read-only devices poll gently every 3s for new messages
  useEffect(() => {
    if (!pairedReadOnly) return;
    const id = window.setInterval(() => {
      void loadMessages();
    }, 3000);
    return () => window.clearInterval(id);
  }, [pairedReadOnly, loadMessages]);

  // Signed-in devices receive instant WebSocket updates from parent
  useEffect(() => {
    if (!liveSignal || !channelId || liveSignal.channelId !== channelId) return;
    if (liveSignal.kind === "message" && liveSignal.message) {
      const incoming = liveSignal.message;
      setMessages((prev) =>
        prev.some((m) => m.id === incoming.id) ? prev : [...prev.slice(-79), incoming],
      );
    } else if (liveSignal.kind === "deleted" && liveSignal.messageId) {
      setMessages((prev) => prev.filter((m) => m.id !== liveSignal.messageId));
    } else if (liveSignal.kind === "edited" && liveSignal.messageId) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === liveSignal.messageId
            ? { ...m, text: liveSignal.content ?? m.text, editedAt: liveSignal.editedAt }
            : m,
        ),
      );
    }
  }, [liveSignal, channelId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !channelId || pairedReadOnly || sending) return;
    setSending(true);
    try {
      await apiFetch("/api/messages", {
        method: "POST",
        body: JSON.stringify({ channelId, content }),
      });
      setDraft("");
      stickBottomRef.current = true;
      await loadMessages();
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="s2-pane">
      <div className="s2-pane-head">
        <div className="s2-bar-group">
          <Hash size={14} style={{ color: "var(--lavender, #8b5cf6)" }} />
          <strong style={{ fontSize: 13 }}>
            {resolvedName || (channelId ? "Live Chat" : "Select a channel")}
          </strong>
        </div>
        {pairedReadOnly && (
          <a
            href={`${basePath}/screen`}
            style={{ fontSize: 11, color: "var(--lavender, #8b5cf6)", textDecoration: "none" }}
          >
            Sign in to reply
          </a>
        )}
      </div>
      <div className="s2-pane-body">
        {!channelId ? (
          <div className="s2-empty">
            <Hash size={28} style={{ opacity: 0.5 }} />
            <p style={{ margin: 0 }}>Pick a channel in the top bar or from your main Hoffle window.</p>
          </div>
        ) : loading && messages.length === 0 ? (
          <div className="s2-empty">Loading channel messages…</div>
        ) : messages.length === 0 ? (
          <div className="s2-empty">No messages in #{resolvedName || "channel"} yet.</div>
        ) : (
          <div className="s2-chat-list" ref={listRef} onScroll={handleScroll}>
            {messages.map((m) => (
              <div key={m.id} className="s2-chat-row">
                <div
                  className="s2-chat-avatar"
                  style={{ background: m.color || "#8b5cf6" }}
                  aria-hidden="true"
                >
                  {(m.avatar || m.author?.[0] || "?").slice(0, 2)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>{m.author}</strong>
                    <span style={{ fontSize: 11, opacity: 0.55 }}>{localTime(m)}</span>
                    {m.editedAt && (
                      <span style={{ fontSize: 10, opacity: 0.45 }}>(edited)</span>
                    )}
                  </div>
                  {m.text && (
                    <div
                      style={{
                        fontSize: 14,
                        lineHeight: 1.4,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      <MessageBody text={m.text} />
                    </div>
                  )}
                  {m.image && (
                    <img src={m.image} alt="Attachment" className="s2-chat-img" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!pairedReadOnly && channelId && (
          <form className="s2-chat-compose" onSubmit={(e) => void send(e)}>
            <input
              type="text"
              className="s2-chat-input"
              placeholder={`Message #${resolvedName || "channel"}…`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="submit"
              className="s2-pill-btn active"
              style={{ height: 38, padding: "0 14px", borderRadius: 10 }}
              disabled={!draft.trim() || sending}
              aria-label="Send message"
            >
              <Send size={14} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
