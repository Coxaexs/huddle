"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Globe, MessageSquare, Send, Sparkles } from "lucide-react";
import { apiFetch } from "../lib/client";
import { MessageBody } from "./message-body";

export interface AiSource {
  title: string;
  url: string;
}

interface ThreadMessage {
  id: string | number;
  author: string;
  text: string;
  bot?: boolean;
  kind?: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Numbered sources, shared by the card and its follow-up answers. */
export function AiSources({ sources }: { sources?: AiSource[] }) {
  if (!sources?.length) return null;
  return (
    <div className="ai-sources">
      <Globe size={12} aria-hidden="true" />
      {sources.map((source, index) => (
        <a
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          title={source.title}
        >
          <b>{index + 1}</b> {hostOf(source.url)}
        </a>
      ))}
    </div>
  );
}

/**
 * An answer from /ask, drawn as an embed, with a small chat underneath it.
 * Follow-ups live in the answer's thread, so the server sends that thread as
 * the model's context and everyone in the channel can read along.
 */
export function AiAnswerCard({
  messageId,
  channelId,
  question,
  sources,
  threadCount = 0,
  children,
  onOpenThread,
  onError,
}: {
  messageId: string | number;
  channelId: string | null;
  question?: string;
  sources?: AiSource[];
  threadCount?: number;
  /** The rendered answer text. */
  children: ReactNode;
  onOpenThread: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Load when opened, and again whenever someone adds to the thread.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch<{ messages: ThreadMessage[] }>(
      `/api/messages?threadId=${encodeURIComponent(String(messageId))}`,
    )
      .then((data) => {
        if (!cancelled) setThread(data.messages);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, messageId, threadCount]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [thread.length, busy]);

  async function send() {
    const question = draft.trim();
    if (!question || busy || !channelId) return;
    setBusy(true);
    setDraft("");
    try {
      const data = await apiFetch<{ message: ThreadMessage; userMessage: ThreadMessage | null }>(
        "/api/ai/ask",
        {
          method: "POST",
          body: JSON.stringify({ channelId, question, threadId: String(messageId) }),
        },
      );
      setThread((current) => {
        const next = [...current];
        for (const item of [data.userMessage, data.message]) {
          if (item && !next.some((m) => m.id === item.id)) next.push(item);
        }
        return next;
      });
    } catch (error) {
      setDraft(question);
      onError(error instanceof Error ? error.message : "The AI did not answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-card">
      <div className="ai-card-head">
        <Sparkles size={14} aria-hidden="true" />
        <span>{question ? question : "Huddle AI"}</span>
      </div>
      <div className="ai-card-body">{children}</div>
      <AiSources sources={sources} />
      <div className="ai-card-actions">
        <button type="button" onClick={() => setOpen((value) => !value)}>
          <MessageSquare size={13} aria-hidden="true" />
          {open ? "Hide chat" : threadCount > 0 ? `Continue chat (${threadCount})` : "Ask a follow-up"}
        </button>
        {threadCount > 0 && (
          <button type="button" onClick={onOpenThread}>
            Open in thread
          </button>
        )}
      </div>
      {open && (
        <div className="ai-chat">
          {(thread.length > 0 || busy) && (
            <div className="ai-chat-list" ref={listRef}>
              {thread.map((item) => (
                <div
                  key={item.id}
                  className={`ai-chat-line ${item.kind === "ai" ? "is-ai" : ""}`}
                >
                  <strong>{item.kind === "ai" ? "✦ AI" : item.author}</strong>
                  <MessageBody text={item.text} />
                </div>
              ))}
              {busy && (
                <div className="ai-chat-line is-ai ai-thinking">
                  <strong>✦ AI</strong> <span>thinking…</span>
                </div>
              )}
            </div>
          )}
          <form
            className="ai-chat-input"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask a follow-up…"
              maxLength={1000}
              disabled={busy}
              aria-label="Ask the AI a follow-up"
            />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Send">
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
