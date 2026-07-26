"use client";

import type { ReactNode } from "react";

const IMAGE_PATTERN = /\.(gif|png|jpe?g|webp|avif)(\?|#|$)/i;

export function isImageUrl(value: string): boolean {
  const url = value.trim();
  // Custom stickers are served from our own uploads under a relative path.
  if (/^\/hangout\/api\/uploads\//i.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  // Klipy and friends serve GIFs and stickers from paths that end in the
  // extension (.gif, .webp, …).
  return IMAGE_PATTERN.test(url);
}

// Matches a URL or an @mention token, so both can be rendered specially.
const TOKEN_PATTERN = /(https?:\/\/[^\s<>"']+)|(@[a-zA-Z0-9._-]{2,24})/g;

/**
 * Message text with links made clickable, @mentions highlighted, and any image
 * or GIF link rendered as the picture itself rather than a URL.
 */
export function MessageBody({
  text,
  selfHandle,
  onMention,
}: {
  text: string;
  /** The viewer's username, so a mention of them stands out more. */
  selfHandle?: string;
  /** Called with the handle (no @) when a mention is clicked. */
  onMention?: (handle: string) => void;
}) {
  const trimmed = text.trim();

  if (isImageUrl(trimmed) && !/\s/.test(trimmed)) {
    return (
      <a href={trimmed} target="_blank" rel="noreferrer" className="embed-link">
        <img className="message-image message-gif" src={trimmed} alt="" />
      </a>
    );
  }

  const parts: ReactNode[] = [];
  const images: string[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    lastIndex = index + token.length;

    if (match[2]) {
      // @mention
      const handle = token.slice(1);
      const isSelf =
        selfHandle && handle.toLowerCase() === selfHandle.toLowerCase();
      parts.push(
        <button
          type="button"
          key={`m-${index}`}
          className={`mention ${isSelf ? "mention-self" : ""}`}
          onClick={() => onMention?.(handle)}
        >
          {token}
        </button>,
      );
      continue;
    }

    const url = token;
    if (isImageUrl(url)) {
      images.push(url);
      continue;
    }
    parts.push(
      <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer">
        {url}
      </a>,
    );
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return (
    <>
      {parts.length > 0 && <p>{parts}</p>}
      {images.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="embed-link">
          <img className="message-image message-gif" src={url} alt="" />
        </a>
      ))}
    </>
  );
}
