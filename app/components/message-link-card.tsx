"use client";

import { useEffect, useState } from "react";
import { MessageSquareQuote } from "lucide-react";
import { apiFetch } from "../lib/client";
import { formatClientDateTime } from "../lib/chat/format";
import type { MessageLinkTarget } from "../lib/chat/message-links";

interface LinkedMessage {
  message: {
    id: string;
    author: string;
    color: string;
    text: string;
    createdAt: string;
    image?: string;
    images?: string[];
    files?: Array<{ name: string }>;
  };
  serverId: string | null;
  channelId: string | null;
  channelName: string | null;
}

/** One request per message per page load, shared by every card that links it. */
const linkedCache = new Map<string, Promise<LinkedMessage | null>>();

function loadLinked(messageId: string): Promise<LinkedMessage | null> {
  let pending = linkedCache.get(messageId);
  if (!pending) {
    pending = apiFetch<LinkedMessage>(`/api/messages/${encodeURIComponent(messageId)}`).catch(() => null);
    linkedCache.set(messageId, pending);
  }
  return pending;
}

/**
 * The embed under a copied message link: who said it, where and what, like
 * Discord's. Clicking it opens the message. A message the viewer cannot read
 * (or one since deleted) gets a plain "unavailable" card that says nothing
 * about it.
 */
export function MessageLinkCard({
  target,
  onOpen,
}: {
  target: MessageLinkTarget;
  onOpen?: (target: MessageLinkTarget) => void;
}) {
  const [linked, setLinked] = useState<LinkedMessage | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void loadLinked(target.messageId).then((result) => {
      if (live) setLinked(result);
    });
    return () => {
      live = false;
    };
  }, [target.messageId]);

  if (linked === undefined) return null;
  if (!linked) {
    return (
      <div className="link-preview message-link-card is-missing">
        <div className="link-preview-text">
          <span className="link-preview-site">
            <MessageSquareQuote size={13} aria-hidden="true" /> Message
          </span>
          <p className="link-preview-description">This message is unavailable or you can't see it.</p>
        </div>
      </div>
    );
  }

  const { message } = linked;
  const where = linked.serverId ? `#${linked.channelName || "channel"}` : "Direct message";
  const attachment = message.image || message.images?.length
    ? "🖼️ Image"
    : message.files?.length
      ? `📎 ${message.files[0].name}`
      : "";
  const open = () =>
    onOpen?.({
      messageId: message.id,
      channelId: linked.channelId || target.channelId,
      serverId: linked.serverId || undefined,
    });

  return (
    <div
      className="link-preview message-link-card"
      role="button"
      tabIndex={0}
      title="Jump to message"
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
    >
      <div className="link-preview-text">
        <span className="link-preview-site">
          <MessageSquareQuote size={13} aria-hidden="true" /> {where}
        </span>
        <span className="message-link-card-head">
          <strong style={{ color: message.color || undefined }}>{message.author}</strong>
          <time dateTime={message.createdAt}>{formatClientDateTime(message.createdAt)}</time>
        </span>
        {message.text ? (
          <p className="link-preview-description message-link-card-text">{message.text}</p>
        ) : attachment ? (
          <p className="link-preview-description">{attachment}</p>
        ) : null}
      </div>
    </div>
  );
}
