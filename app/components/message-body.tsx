"use client";

import type { ReactNode } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;
const IMAGE_PATTERN = /\.(gif|png|jpe?g|webp|avif)(\?|#|$)/i;

export function isImageUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value.trim())) return false;
  const url = value.trim();
  // Tenor and friends serve GIFs from paths that end in the extension.
  return IMAGE_PATTERN.test(url) || /(^|\.)media\d*\.tenor\.com\//i.test(url);
}

/**
 * Message text with links made clickable, and any image or GIF link rendered
 * as the picture itself rather than a URL.
 */
export function MessageBody({ text }: { text: string }) {
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

  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    lastIndex = index + url.length;

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
