"use client";

import { useState, type ReactNode } from "react";
import { highlight } from "../lib/highlight";

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

/**
 * Inline tokens: links, @mentions, and the Discord-flavoured emphasis markers.
 * Order matters — the first alternative that matches at a position wins, so
 * the longer fences (**, ~~, ||, __) are listed before the single-character one.
 */
const INLINE_PATTERN =
  /(https?:\/\/[^\s<>"']+)|(@[a-zA-Z0-9._-]{2,24})|(`[^`\n]+`)|(\|\|[\s\S]+?\|\|)|(\*\*[\s\S]+?\*\*)|(__[\s\S]+?__)|(~~[\s\S]+?~~)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

interface RenderOptions {
  selfHandle?: string;
  onMention?: (handle: string) => void;
  onImage?: (url: string) => void;
}

/** Hidden until clicked, like Discord's ||spoiler||. */
function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      className={`spoiler ${revealed ? "revealed" : ""}`}
      onClick={(event) => {
        if (revealed) return;
        event.stopPropagation();
        setRevealed(true);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") setRevealed(true);
      }}
    >
      {children}
    </span>
  );
}

/** Renders one line of inline markup into React nodes. */
function renderInline(
  text: string,
  options: RenderOptions,
  images: string[],
  keyPrefix: string,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    lastIndex = index + token.length;
    const key = `${keyPrefix}-${index}`;

    // 1: url, 2: mention, 3: code, 4: spoiler, 5: **, 6: __, 7: ~~, 8: *, 9: _
    if (match[1]) {
      if (isImageUrl(token)) {
        images.push(token);
        continue;
      }
      parts.push(
        <a key={key} href={token} target="_blank" rel="noreferrer">
          {token}
        </a>,
      );
    } else if (match[2]) {
      const handle = token.slice(1);
      const isSelf =
        options.selfHandle &&
        handle.toLowerCase() === options.selfHandle.toLowerCase();
      parts.push(
        <button
          type="button"
          key={key}
          className={`mention ${isSelf ? "mention-self" : ""}`}
          onClick={() => options.onMention?.(handle)}
        >
          {token}
        </button>,
      );
    } else if (match[3]) {
      parts.push(
        <code key={key} className="inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (match[4]) {
      parts.push(
        <Spoiler key={key}>
          {renderInline(token.slice(2, -2), options, images, `${key}s`)}
        </Spoiler>,
      );
    } else if (match[5]) {
      parts.push(
        <strong key={key}>
          {renderInline(token.slice(2, -2), options, images, `${key}b`)}
        </strong>,
      );
    } else if (match[6]) {
      parts.push(
        <u key={key}>
          {renderInline(token.slice(2, -2), options, images, `${key}u`)}
        </u>,
      );
    } else if (match[7]) {
      parts.push(
        <s key={key}>
          {renderInline(token.slice(2, -2), options, images, `${key}s`)}
        </s>,
      );
    } else if (match[8] || match[9]) {
      parts.push(
        <em key={key}>
          {renderInline(token.slice(1, -1), options, images, `${key}i`)}
        </em>,
      );
    }
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/** A fenced code block with a language label and light highlighting. */
function CodeBlock({ code, language }: { code: string; language: string }) {
  const tokens = highlight(code, language);
  return (
    <pre className="code-block">
      {language && <span className="code-lang">{language}</span>}
      <code>
        {tokens.map((token, index) =>
          token.kind === "plain" ? (
            token.text
          ) : (
            <span key={index} className={`tok-${token.kind}`}>
              {token.text}
            </span>
          ),
        )}
      </code>
    </pre>
  );
}

/**
 * Message text with Discord-flavoured markdown: **bold**, *italic*,
 * __underline__, ~~strike~~, `code`, ```blocks```, > quotes, ||spoilers||,
 * plus clickable links and @mentions. Everything becomes React nodes — no HTML
 * is ever injected — and bare image links render as the picture itself.
 */
export function MessageBody({
  text,
  selfHandle,
  onMention,
  onImage,
}: {
  text: string;
  /** The viewer's username, so a mention of them stands out more. */
  selfHandle?: string;
  /** Called with the handle (no @) when a mention is clicked. */
  onMention?: (handle: string) => void;
  /** Called with an image URL when one is clicked (opens the lightbox). */
  onImage?: (url: string) => void;
}) {
  const options: RenderOptions = { selfHandle, onMention, onImage };
  const trimmed = text.trim();

  // A message that is nothing but an image link renders as just the image.
  if (isImageUrl(trimmed) && !/\s/.test(trimmed)) {
    return (
      <img
        className="message-image message-gif"
        src={trimmed}
        alt=""
        onClick={() => onImage?.(trimmed)}
      />
    );
  }

  const images: string[] = [];
  const blocks: ReactNode[] = [];
  // Split on fenced code blocks first; everything else is line-based.
  const segments = text.split(/```/);

  segments.forEach((segment, segmentIndex) => {
    // Odd segments are inside fences.
    if (segmentIndex % 2 === 1) {
      const newline = segment.indexOf("\n");
      const firstLine = newline >= 0 ? segment.slice(0, newline) : "";
      const language = /^[a-zA-Z0-9+#-]{1,15}$/.test(firstLine.trim())
        ? firstLine.trim()
        : "";
      const code = language || newline >= 0 ? segment.slice(newline + 1) : segment;
      blocks.push(
        <CodeBlock
          key={`c${segmentIndex}`}
          code={code.replace(/\n$/, "")}
          language={language}
        />,
      );
      return;
    }

    const lines = segment.split("\n");
    let paragraph: ReactNode[] = [];
    const flush = (key: string) => {
      if (!paragraph.length) return;
      blocks.push(<p key={key}>{paragraph}</p>);
      paragraph = [];
    };

    lines.forEach((line, lineIndex) => {
      const key = `${segmentIndex}-${lineIndex}`;
      if (/^>\s?/.test(line)) {
        flush(`p${key}`);
        blocks.push(
          <blockquote key={`q${key}`}>
            {renderInline(line.replace(/^>\s?/, ""), options, images, key)}
          </blockquote>,
        );
        return;
      }
      if (!line.trim()) {
        flush(`p${key}`);
        return;
      }
      if (paragraph.length) paragraph.push(<br key={`br${key}`} />);
      paragraph.push(...renderInline(line, options, images, key));
    });
    flush(`p${segmentIndex}-end`);
  });

  return (
    <>
      {blocks}
      {images.map((url) => (
        <img
          key={url}
          className="message-image message-gif"
          src={url}
          alt=""
          onClick={() => onImage?.(url)}
        />
      ))}
    </>
  );
}
