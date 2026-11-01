/**
 * Pure translations between Discord's and Hoffle's message conventions.
 * Nothing here talks to a network, so all of it is unit tested.
 */

/** Discord and Hoffle both cap a message at 2000 characters. */
export const MESSAGE_LIMIT = 2000;

/**
 * Discord's markup for people, roles, channels, emoji and timestamps turned
 * into text a Hoffle reader understands. `ctx` resolves ids to names.
 *
 * @param {string} content
 * @param {{ user?: (id: string) => string | undefined, role?: (id: string) => string | undefined,
 *   channel?: (id: string) => string | undefined }} ctx
 */
export function discordToHoffle(content, ctx = {}) {
  if (!content) return "";
  return (
    content
      // <@123> and the old nickname form <@!123>
      .replace(/<@!?(\d{5,25})>/g, (_, id) => `@${ctx.user?.(id) || "someone"}`)
      .replace(/<@&(\d{5,25})>/g, (_, id) => `@${ctx.role?.(id) || "role"}`)
      .replace(/<#(\d{5,25})>/g, (_, id) => `#${ctx.channel?.(id) || "channel"}`)
      // </command:id> and </command sub:id>
      .replace(/<\/([\w-]+(?: [\w-]+){0,2}):\d{5,25}>/g, (_, name) => `/${name}`)
      // Custom emoji <:name:id> and animated <a:name:id> become :name:, which is
      // how Hoffle writes a server emoji (shown as the image if one has that name).
      .replace(/<a?:([\w~-]{1,32}):\d{5,25}>/g, (_, name) => `:${name}:`)
      .replace(/<t:(-?\d{1,13})(?::([tTdDfFR]))?>/g, (_, seconds, style) => formatTimestamp(Number(seconds), style))
      // Never let a bridged message ping a whole Hoffle server.
      .replace(/@(everyone|here)\b/g, "@​$1")
  );
}

/**
 * Hoffle text on its way to Discord. Hoffle mentions are plain "@name" text
 * already; server emoji written :name: become the Discord server's emoji of
 * the same name when it has one.
 *
 * @param {string} content
 * @param {{ emoji?: (name: string) => string | undefined }} ctx
 */
export function hoffleToDiscord(content, ctx = {}) {
  if (!content) return "";
  return content.replace(/(^|[^\w<]):([\w~-]{2,32}):(?!\d)/g, (whole, before, name) => {
    const found = ctx.emoji?.(name);
    return found ? `${before}${found}` : whole;
  });
}

/** Discord's timestamp styles, rendered once in UTC (Hoffle has no live clocks). */
export function formatTimestamp(seconds, style = "f") {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const options = {
    t: { hour: "2-digit", minute: "2-digit" },
    T: { hour: "2-digit", minute: "2-digit", second: "2-digit" },
    d: { year: "numeric", month: "2-digit", day: "2-digit" },
    D: { year: "numeric", month: "long", day: "numeric" },
    f: { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" },
    F: { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" },
  }[style === "R" ? "f" : style] || { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" };
  const text = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC", hour12: false }).format(date);
  return /[tTfF]/.test(style) || style === "R" ? `${text} UTC` : text;
}

/**
 * Splits text into Discord-sized pieces, preferring line breaks, then spaces.
 * @returns {string[]}
 */
export function splitText(text, limit = MESSAGE_LIMIT) {
  const out = [];
  let rest = text || "";
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest.trim() || !out.length) out.push(rest);
  return out;
}

/**
 * A webhook name Discord accepts: 1–80 characters, and never containing
 * "discord" or "clyde" (Discord refuses those outright).
 */
export function webhookName(raw) {
  let name = String(raw || "").replace(/\s+/g, " ").trim();
  name = name.replace(/discord/gi, (m) => `${m.slice(0, 4)}​${m.slice(4)}`);
  name = name.replace(/clyde/gi, (m) => `${m.slice(0, 2)}​${m.slice(2)}`);
  if (/^(everyone|here)$/i.test(name)) name = `${name}.`;
  name = [...name].slice(0, 80).join("");
  return name || "Hoffle user";
}

/** One short quote line for a reply Discord's webhooks cannot make natively. */
export function replyQuote(author, text, link) {
  const flat = String(text || "")
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/\s+/g, " ")
    .replace(/[*_~`|>]/g, "")
    .trim();
  const snippet = flat.length > 90 ? `${flat.slice(0, 89)}…` : flat || "a message";
  const who = String(author || "someone").replace(/[*_~`|]/g, "");
  return `> ↪ **${who}**: ${snippet}${link ? ` [↗](<${link}>)` : ""}`;
}

/**
 * twemoji's file name for an emoji: its code points in hex, without the
 * variation selector unless the emoji is a ZWJ sequence.
 */
export function twemojiCode(emoji) {
  const points = [...emoji].map((ch) => ch.codePointAt(0).toString(16));
  const zwj = points.includes("200d");
  return points.filter((p) => zwj || p !== "fe0f").join("-");
}

const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})/u;

/**
 * A picture Discord can fetch for a Hoffle person: their uploaded avatar on
 * the public site, an outside URL as is, or their emoji avatar as a twemoji PNG.
 *
 * @param {{ hoffle_avatar_url?: string | null, hoffle_avatar?: string | null }} author
 * @param {string} publicUrl e.g. https://hoffle.online
 */
export function avatarForDiscord(author, publicUrl) {
  const url = author?.hoffle_avatar_url;
  if (url) {
    if (/^https:\/\//i.test(url)) return url;
    if (url.startsWith("/") && publicUrl) return `${publicUrl.replace(/\/+$/, "")}${url}`;
  }
  const emoji = author?.hoffle_avatar;
  if (emoji && EMOJI_RE.test(emoji)) {
    return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/${twemojiCode(emoji)}.png`;
  }
  return undefined;
}

/** Discord's upload ceiling per message by boost level. */
export function discordUploadLimit(premiumTier = 0) {
  if (premiumTier >= 3) return 100 * 1024 * 1024;
  if (premiumTier === 2) return 50 * 1024 * 1024;
  return 10 * 1024 * 1024;
}

/**
 * Hoffle's reaction emoji in a Discord reaction path: unicode as is; a Hoffle
 * server emoji (dispatched by bare name) only when Discord has one by that name.
 *
 * @param {string} name
 * @param {(name: string) => { id: string, name: string } | undefined} findEmoji
 * @returns {string | null} the path segment (unencoded), or null to skip
 */
export function reactionForDiscord(name, findEmoji) {
  if (!name) return null;
  const bare = name.replace(/^:(.+):$/, "$1");
  if (/^[\w~-]+$/.test(bare)) {
    const found = findEmoji?.(bare);
    return found ? `${found.name}:${found.id}` : null;
  }
  return name;
}

/** Discord's reaction emoji in a Hoffle reaction path ("name:id" for custom). */
export function reactionForHoffle(emoji) {
  if (!emoji) return null;
  if (emoji.id) return `${emoji.name || "emoji"}:${emoji.id}`;
  return emoji.name || null;
}

/** Bigger-than-snowflake comparison without losing precision. */
export function snowflakeAfter(a, b) {
  if (!b) return true;
  if (!a) return false;
  try {
    return BigInt(a) > BigInt(b);
  } catch {
    return a > b;
  }
}

/** Human file size. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** A short, stable fingerprint of what a message shows, to skip no-op edits. */
export function contentHash(content, embeds) {
  const text = `${content || ""}\u0000${JSON.stringify(embeds || [])}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
