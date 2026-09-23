import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { MessageBody } from "./message-body";

/**
 * Discord-shaped embeds and message components, as bots running against
 * Hoffle's Discord gateway send them (discord.py, discord.js).
 *
 * The shapes are Discord's own, stored verbatim in the message payload, so
 * this renders what the bot author sees in Discord's docs: a colour bar,
 * title, description, a grid of inline fields, and rows of buttons.
 */
export interface BotEmbedData {
  title?: string;
  description?: string;
  url?: string;
  color?: number | string;
  timestamp?: string;
  author?: { name?: string; url?: string; icon_url?: string };
  footer?: { text?: string; icon_url?: string };
  thumbnail?: { url?: string };
  image?: { url?: string };
  fields?: Array<{ name?: string; value?: string; inline?: boolean }>;
}

export interface BotComponent {
  type: number;
  style?: number;
  label?: string;
  emoji?: { name?: string; id?: string | null } | null;
  custom_id?: string;
  url?: string;
  disabled?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string; description?: string; default?: boolean }>;
  min_values?: number;
  max_values?: number;
}

export interface BotComponentRow {
  type: number;
  components?: BotComponent[];
}

const BUTTON = 2;
const STRING_SELECT = 3;
const LINK_STYLE = 5;

function colorOf(color: BotEmbedData["color"]): string | undefined {
  if (typeof color === "number" && color > 0) {
    return `#${color.toString(16).padStart(6, "0")}`;
  }
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) return color;
  return undefined;
}

/** Only web links and Hoffle's own paths; `attachment://` has no file here. */
function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

export function BotEmbeds({
  embeds = [],
  components = [],
  onComponent,
  selfHandle,
  onMention,
  onImage,
  emojis,
}: {
  embeds?: BotEmbedData[];
  components?: BotComponentRow[];
  /** A press or a select: resolves when the bot has been told. */
  onComponent?: (customId: string, componentType: number, values?: string[]) => Promise<void>;
  selfHandle?: string;
  onMention?: (handle: string) => void;
  onImage?: (url: string) => void;
  emojis?: Record<string, string>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const body = (text: string) => (
    <MessageBody
      text={text}
      selfHandle={selfHandle}
      onMention={onMention}
      onImage={onImage}
      emojis={emojis}
    />
  );

  const press = async (customId: string, type: number, values?: string[]) => {
    if (!onComponent || pending) return;
    setPending(customId);
    try {
      await onComponent(customId, type, values);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="bot-embeds">
      {embeds.slice(0, 10).map((embed, index) => {
        const thumbnail = safeUrl(embed.thumbnail?.url);
        const image = safeUrl(embed.image?.url);
        const titleUrl = safeUrl(embed.url);
        const fields = (embed.fields || []).filter((field) => field.name || field.value);
        return (
          <article
            key={index}
            className="bot-embed"
            style={{ borderLeftColor: colorOf(embed.color) }}
          >
            <div className="bot-embed-main">
              {embed.author?.name && (
                <div className="bot-embed-author">
                  {safeUrl(embed.author.icon_url) && (
                    <img src={safeUrl(embed.author.icon_url)} alt="" />
                  )}
                  <span>{embed.author.name}</span>
                </div>
              )}
              {embed.title && (
                <h4 className="bot-embed-title">
                  {titleUrl ? (
                    <a href={titleUrl} target="_blank" rel="noreferrer">
                      {embed.title}
                    </a>
                  ) : (
                    embed.title
                  )}
                </h4>
              )}
              {embed.description && (
                <div className="bot-embed-description">{body(embed.description)}</div>
              )}
              {fields.length > 0 && (
                <div className="bot-embed-fields">
                  {fields.map((field, fieldIndex) => (
                    <div
                      key={fieldIndex}
                      className={`bot-embed-field${field.inline ? "" : " full"}`}
                    >
                      {field.name && <div className="bot-embed-field-name">{field.name}</div>}
                      {field.value && (
                        <div className="bot-embed-field-value">{body(field.value)}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {image && (
                <button
                  type="button"
                  className="bot-embed-image"
                  onClick={() => onImage?.(image)}
                >
                  <img src={image} alt="" loading="lazy" />
                </button>
              )}
              {(embed.footer?.text || embed.timestamp) && (
                <div className="bot-embed-footer">
                  {embed.footer?.text}
                  {embed.footer?.text && embed.timestamp ? " • " : ""}
                  {embed.timestamp ? new Date(embed.timestamp).toLocaleString() : ""}
                </div>
              )}
            </div>
            {thumbnail && <img className="bot-embed-thumb" src={thumbnail} alt="" loading="lazy" />}
          </article>
        );
      })}

      {components.slice(0, 5).map((row, rowIndex) => (
        <div key={rowIndex} className="bot-components">
          {(row.components || []).slice(0, 5).map((component, index) => {
            if (component.type === BUTTON) {
              const label = [component.emoji?.name, component.label].filter(Boolean).join(" ");
              if (component.style === LINK_STYLE) {
                const href = safeUrl(component.url);
                return (
                  <a
                    key={index}
                    className="bot-button style-link"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={component.disabled || !href}
                  >
                    {label || "Open"} <ExternalLink size={12} aria-hidden="true" />
                  </a>
                );
              }
              const id = component.custom_id || "";
              return (
                <button
                  key={index}
                  type="button"
                  className={`bot-button style-${component.style || 2}`}
                  disabled={component.disabled || !onComponent || !id || pending !== null}
                  aria-busy={pending === id}
                  onClick={() => void press(id, BUTTON)}
                >
                  {label || "…"}
                </button>
              );
            }
            if (component.type === STRING_SELECT && component.options?.length) {
              const id = component.custom_id || "";
              return (
                <select
                  key={index}
                  className="bot-select"
                  disabled={component.disabled || !onComponent || pending !== null}
                  defaultValue=""
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value) void press(id, STRING_SELECT, [value]);
                  }}
                >
                  <option value="" disabled>
                    {component.placeholder || "Choose…"}
                  </option>
                  {component.options.map((option) => (
                    <option key={option.value} value={option.value} title={option.description}>
                      {option.label}
                    </option>
                  ))}
                </select>
              );
            }
            return null;
          })}
        </div>
      ))}
    </div>
  );
}
