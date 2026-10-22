"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Copy, Check, Volume2, Dices, Coins, Sparkles, BookOpen } from "lucide-react";
import { highlight } from "../lib/highlight";
import { LinkPreviewCard } from "./link-preview";
import { MessageLinkCard } from "./message-link-card";
import { parseMessageLink, type MessageLinkTarget } from "../lib/chat/message-links";
import { extractInviteCodes } from "../lib/chat/invites";
import { resolveEmojiShortcode } from "@/lib/emoji-shortcodes";
import { handleMatchesName } from "@/lib/mention-handles";
import { TAG_PATTERN, TAG_SOURCE, describeTag, PER_LETTER_EFFECTS } from "@/lib/text-style";
import {
  BUTTON_COOLDOWN_MS,
  COMMAND_BUTTON_SOURCE,
  MAX_BUTTONS_PER_MESSAGE,
  readCommandButton,
  type CommandButton,
} from "@/lib/command-buttons";
import { useI18n } from "@/app/lib/i18n-context";

/** At most this many preview cards under one message. */
const MAX_PREVIEWS = 3;

const IMAGE_PATTERN = /\.(gif|png|jpe?g|webp|avif)(\?|#|$)/i;

/**
 * Outside images load through our proxy, so posting an image link cannot
 * collect the IP address of everyone who reads the channel. Our own uploads
 * load directly.
 */
export function proxiedImage(url: string): string {
  if (!/^https?:\/\//i.test(url)) return url;
  return `/hangout/api/unfurl/image?url=${encodeURIComponent(url)}`;
}

export function isImageUrl(value: string): boolean {
  const url = value.trim();
  // Custom stickers are served from our own uploads under a relative path.
  if (/^\/hangout\/api\/uploads\//i.test(url)) return true;
  // The Hoffy sticker pack ships with the app (app/lib/hoffy-stickers.ts).
  if (/^\/hangout\/stickers\/hoffy\/[a-z-]+\.svg$/i.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  // Klipy and friends serve GIFs and stickers from paths that end in the
  // extension (.gif, .webp, …).
  return IMAGE_PATTERN.test(url);
}

/**
 * Inline tokens: links, @mentions, #channels and the Discord-flavoured
 * emphasis markers.
 * Order matters — the first alternative that matches at a position wins, so
 * the longer fences (**, ~~, ||, __) are listed before the single-character one.
 * Messenger Plus!-style `[tag]…[/tag]` decorations come last (named groups).
 */
const MARKDOWN_PATTERN =
  /(https?:\/\/[^\s<>"']+)|(@[a-zA-Z0-9._-]{2,32})|(`[^`\n]+`)|(\|\|[\s\S]+?\|\|)|(\*\*[\s\S]+?\*\*)|(__[\s\S]+?__)|(~~[\s\S]+?~~)|(\*[^*\n]+\*)|(_[^_\n]+_)|(:[a-z0-9_]{1,32}:)|((?<![\w#/&])#[a-zA-Z0-9._-]{1,32})/;

const INLINE_PATTERN = new RegExp(
  MARKDOWN_PATTERN.source +
    // 12+: [c=red]…[/c], [font=comic]…[/font], [rainbow]…[/rainbow] (lib/text-style.ts)
    `|(?:${TAG_SOURCE})` +
    // A personal emoticon (lib/msn-contacts.ts): [emo:<upload key>|(cat)]
    `|(?:\\[emo:(?<emokey>[A-Za-z0-9._-]{1,160})\\|(?<emoname>[^\\]\\s|]{1,12})\\])` +
    // A command button (lib/command-buttons.ts): <button label="…">/roll 1d20</button>
    `|(?:${COMMAND_BUTTON_SOURCE})`,
  "gi",
);

/** A channel a `#name` token can link to. */
export interface MentionChannel {
  id: string;
  name: string;
  kind: string;
}

/** A role an `@name` token can refer to (rendered in the role's colour). */
export interface MentionRole {
  name: string;
  color: string;
}

interface RenderOptions {
  selfHandle?: string;
  onMention?: (handle: string) => void;
  onImage?: (url: string) => void;
  /** Custom emoji by name, so `:name:` can render as the image. */
  emojis?: Record<string, string>;
  /** Collects links that should get a preview card (absent: don't collect). */
  links?: string[];
  channels?: MentionChannel[];
  roles?: MentionRole[];
  onChannel?: (channel: MentionChannel) => void;
  /** Called when a link to a message here is clicked (opens it in-app). */
  onMessageLink?: (target: MessageLinkTarget) => void;
  /**
   * Command buttons rendered so far in this message, and who runs them.
   * Absent where buttons stay text (quotes); no `run` draws them inert.
   */
  buttons?: { count: number; run?: (command: string) => void };
}

const BUTTON_ICONS: Record<string, typeof Dices> = {
  flip: Coins,
  coinflip: Coins,
  spell: BookOpen,
  monster: BookOpen,
  item: BookOpen,
  feat: BookOpen,
  race: BookOpen,
  class: BookOpen,
  subclass: BookOpen,
  "8ball": Sparkles,
  choose: Sparkles,
  rps: Sparkles,
};

/**
 * A `<button>/roll 1d20</button>` in a message. Pressing it runs the command
 * as the viewer; the command is always on the button, never hidden.
 */
function CommandButtonChip({ button, run }: { button: CommandButton; run?: (command: string) => void }) {
  const { t } = useI18n();
  const [cooling, setCooling] = useState(false);
  useEffect(() => {
    if (!cooling) return;
    const timer = window.setTimeout(() => setCooling(false), BUTTON_COOLDOWN_MS);
    return () => window.clearTimeout(timer);
  }, [cooling]);
  const Icon = BUTTON_ICONS[button.name] ?? Dices;
  return (
    <button
      type="button"
      className={`cmd-button${run ? "" : " is-inert"}${cooling ? " is-cooling" : ""}`}
      title={t(run ? "commandButton.title" : "commandButton.inert", { command: button.command })}
      disabled={!run || cooling}
      onClick={(event) => {
        event.stopPropagation();
        if (!run || cooling) return;
        setCooling(true);
        run(button.command);
      }}
    >
      <Icon size={14} aria-hidden className="cmd-button-icon" />
      <span className="cmd-button-text">
        {button.label ? (
          <>
            <span className="cmd-button-label">{button.label}</span>
            <span className="cmd-button-cmd">{button.command}</span>
          </>
        ) : (
          <span className="cmd-button-label cmd-button-mono">{button.command}</span>
        )}
      </span>
    </button>
  );
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

/**
 * Gives every letter of the plain-text parts its own span, so wave / bounce /
 * shake can stagger them. Nested elements (mentions, emoji) move as one.
 */
function splitLetters(nodes: ReactNode[], keyPrefix: string): ReactNode[] {
  let index = 0;
  return nodes.flatMap((node, n): ReactNode[] => {
    if (typeof node !== "string") return [node];
    return Array.from(node).map((char, c) =>
      char.trim() ? (
        <span
          key={`${keyPrefix}-l${n}-${c}`}
          className="fx-letter"
          style={{ "--fx-i": index++ } as CSSProperties}
        >
          {char}
        </span>
      ) : (
        char
      ),
    );
  });
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

    // 1: url, 2: mention, 3: code, 4: spoiler, 5: **, 6: __, 7: ~~, 8: *, 9: _,
    // 10: :emoji:, 11: #channel
    if (match[1]) {
      if (isImageUrl(token)) {
        images.push(token);
        continue;
      }
      // <https://…> suppresses the preview, like Discord.
      const suppressed = text[index - 1] === "<" && text[index + token.length] === ">";
      if (!suppressed && options.links && !options.links.includes(token)) {
        options.links.push(token);
      }
      // A link to a message here opens it in this tab instead of a new one.
      const messageLink = options.onMessageLink ? parseMessageLink(token) : null;
      parts.push(
        messageLink ? (
          <a
            key={key}
            href={token}
            onClick={(event) => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              options.onMessageLink?.(messageLink);
            }}
          >
            {token}
          </a>
        ) : (
          <a key={key} href={token} target="_blank" rel="noreferrer">
            {token}
          </a>
        ),
      );
    } else if (match[2]) {
      const handle = token.slice(1);
      if (handle === "everyone" || handle === "here") {
        parts.push(
          <span key={key} className="mention mention-everyone">
            {token}
          </span>,
        );
        continue;
      }
      const role = options.roles?.find((r) => handleMatchesName(handle, r.name));
      if (role) {
        parts.push(
          <span
            key={key}
            className="mention mention-role"
            style={{ color: role.color, background: `color-mix(in srgb, ${role.color} 18%, transparent)` }}
          >
            @{role.name}
          </span>,
        );
        continue;
      }
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
          {renderInline(token.slice(2, -2), { ...options, links: undefined }, images, `${key}s`)}
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
    } else if (match[10]) {
      // :custom_emoji: or standard shortcode like :tada:, :smiley:, :thumbsup:
      const name = token.slice(1, -1);
      const url = options.emojis?.[name];
      if (url) {
        parts.push(
          <img key={key} className="custom-emoji" src={url} alt={token} title={token} />
        );
      } else {
        const standardEmoji = resolveEmojiShortcode(name);
        if (standardEmoji) {
          parts.push(
            <span key={key} className="emoji-char" title={token}>
              {standardEmoji}
            </span>
          );
        } else {
          parts.push(token);
        }
      }
    } else if (match[11]) {
      const channel = options.channels?.find((c) => handleMatchesName(token.slice(1), c.name));
      if (!channel) {
        parts.push(token);
        continue;
      }
      parts.push(
        <button
          type="button"
          key={key}
          className="mention mention-channel"
          onClick={() => options.onChannel?.(channel)}
          title={channel.kind === "voice" ? "Join voice channel" : "Open channel"}
        >
          {channel.kind === "voice" ? <Volume2 size={13} aria-hidden /> : "#"}
          {channel.name}
        </button>,
      );
    } else if (match.groups?.emokey) {
      const { emokey, emoname } = match.groups;
      parts.push(
        <img
          key={key}
          className="custom-emoji personal-emoticon"
          src={`/hangout/api/uploads/${encodeURIComponent(emokey)}`}
          alt={emoname}
          title={emoname}
        />,
      );
    } else if (match.groups?.btncmd) {
      const { buttons } = options;
      const button =
        buttons && buttons.count < MAX_BUTTONS_PER_MESSAGE
          ? readCommandButton(match.groups.btnlabel, match.groups.btncmd)
          : null;
      if (!buttons || !button) {
        // In a quote, past the cap, or not an allowed command: exactly what was typed.
        parts.push(token);
        continue;
      }
      buttons.count += 1;
      parts.push(<CommandButtonChip key={key} button={button} run={buttons.run} />);
    } else if (match.groups?.tag) {
      const { tag, arg, body = "", end } = match.groups;
      const styled = describeTag(tag, arg, end);
      if (!styled) {
        // Unknown colour/font: show exactly what was typed, markup inside and all.
        parts.push(token);
        continue;
      }
      let inner = renderInline(body, options, images, `${key}t`);
      if (PER_LETTER_EFFECTS.has(styled.tag)) inner = splitLetters(inner, key);
      const Tag =
        styled.tag === "b" ? "strong"
        : styled.tag === "i" ? "em"
        : styled.tag === "u" ? "u"
        : styled.tag === "s" ? "s"
        : styled.tag === "sup" ? "sup"
        : styled.tag === "sub" ? "sub"
        : "span";
      parts.push(
        <Tag
          key={key}
          className={styled.className || undefined}
          style={styled.style}
        >
          {inner}
        </Tag>,
      );
    }
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/** Tags that would break a one-line name or status: they render as plain text there. */
const BLOCKED_IN_LINES = new Set(["size", "sup", "sub"]);

function renderStyledLine(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0;
    const { tag = "", arg, body = "", end } = match.groups ?? {};
    const styled = BLOCKED_IN_LINES.has(tag.toLowerCase()) ? null : describeTag(tag, arg, end);
    if (!styled) continue;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    lastIndex = index + match[0].length;
    const key = `${keyPrefix}-${index}`;
    let inner = renderStyledLine(body, `${key}t`);
    if (PER_LETTER_EFFECTS.has(styled.tag)) inner = splitLetters(inner, key);
    const Tag =
      styled.tag === "b" ? "strong" : styled.tag === "i" ? "em" : styled.tag === "u" ? "u" : styled.tag === "s" ? "s" : "span";
    parts.push(
      <Tag key={key} className={styled.className || undefined} style={styled.style}>
        {inner}
      </Tag>,
    );
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/**
 * A display name or status line with Messenger Plus!-style decorations
 * (`[c=red]Ana[/c]`, `[rainbow]…[/rainbow]`) and nothing else: no links,
 * mentions or markdown, and no size changes.
 */
export function StyledText({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  if (!text.includes("[")) return className ? <span className={className}>{text}</span> : <>{text}</>;
  return <span className={`styled-text ${className ?? ""}`.trim()}>{renderStyledLine(text, "st")}</span>;
}

/** A fenced code block with a language label, copy button, and syntax highlighting. */
function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const tokens = highlight(code, language);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <pre className="code-block group relative">
      <div className="code-block-header flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-white/[0.06] text-[10px] font-mono select-none">
        <span className="code-lang text-[var(--lavender)] font-semibold uppercase tracking-wider">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="copy-code-btn inline-flex items-center gap-1 text-[#8b82a8] hover:text-white transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
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
 * -# subtext, plus [c=red]colour[/c], [f=comic]fonts[/f] and [wave]effects[/wave]
 * (lib/text-style.ts), clickable links and @mentions. Everything becomes React nodes — no HTML
 * is ever injected — and bare image links render as the picture itself.
 */
export function MessageBody({
  text,
  selfHandle,
  onMention,
  onImage,
  emojis,
  linkPreviews = false,
  channels,
  roles,
  onChannel,
  onMessageLink,
  onCommand,
}: {
  text: string;
  /** The viewer's username, so a mention of them stands out more. */
  selfHandle?: string;
  /** Called with the handle (no @) when a mention is clicked. */
  onMention?: (handle: string) => void;
  /** Called with an image URL when one is clicked (opens the lightbox). */
  onImage?: (url: string) => void;
  /** Custom emoji by name for `:name:`. */
  emojis?: Record<string, string>;
  /** Show embed cards for links in the text. */
  linkPreviews?: boolean;
  /** Channels `#name` can link to; unknown names stay plain text. */
  channels?: MentionChannel[];
  /** Roles, so `@role` renders as a coloured role pill. */
  roles?: MentionRole[];
  /** Called when a #channel link is clicked. */
  onChannel?: (channel: MentionChannel) => void;
  /** Called when a link to a message (or its preview card) is clicked. */
  onMessageLink?: (target: MessageLinkTarget) => void;
  /**
   * Runs a command button's command as the viewer (lib/command-buttons.ts).
   * Without it, buttons show but cannot be pressed.
   */
  onCommand?: (command: string) => void;
}) {
  const links: string[] = [];
  const options: RenderOptions = {
    selfHandle,
    onMention,
    onImage,
    emojis,
    links: linkPreviews ? links : undefined,
    channels,
    roles,
    onChannel,
    onMessageLink,
    buttons: { count: 0, run: onCommand },
  };
  const trimmed = text.trim();

  // A message that is nothing but an image link renders as just the image.
  if (isImageUrl(trimmed) && !/\s/.test(trimmed)) {
    return (
      <img
        className="message-image message-gif"
        src={proxiedImage(trimmed)}
        alt=""
        onClick={() => onImage?.(proxiedImage(trimmed))}
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
      // # / ## / ### headings (a space after the hashes is required, so a bare
      // "#channel" is left alone).
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flush(`p${key}`);
        const level = heading[1].length;
        const Tag = (`h${level}` as "h1" | "h2" | "h3");
        blocks.push(
          <Tag key={`h${key}`} className={`message-heading h${level}`}>
            {renderInline(heading[2], options, images, key)}
          </Tag>,
        );
        return;
      }
      // -# small print, like Discord's subtext.
      const subtext = line.match(/^-#\s+(.+)$/);
      if (subtext) {
        flush(`p${key}`);
        blocks.push(
          <small key={`st${key}`} className="message-subtext">
            {renderInline(subtext[1], options, images, key)}
          </small>,
        );
        return;
      }
      if (/^>\s?/.test(line)) {
        flush(`p${key}`);
        blocks.push(
          <blockquote key={`q${key}`}>
            {renderInline(line.replace(/^>\s?/, ""), { ...options, buttons: undefined }, images, key)}
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
          src={proxiedImage(url)}
          alt=""
          onClick={() => onImage?.(proxiedImage(url))}
        />
      ))}
      {links
        .filter((url) => extractInviteCodes(url).length === 0)
        .slice(0, MAX_PREVIEWS)
        .map((url) => {
          const target = parseMessageLink(url);
          return target ? (
            <MessageLinkCard key={url} target={target} onOpen={onMessageLink} />
          ) : (
            <LinkPreviewCard key={url} url={url} />
          );
        })}
    </>
  );
}
