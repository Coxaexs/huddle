/**
 * Translates Hoffle rows into the object shapes Discord clients expect.
 *
 * The rule throughout: emit every field the libraries dereference without
 * checking, even when Hoffle has no equivalent, because a missing field is a
 * TypeError inside the library rather than a graceful degradation. Fields that
 * genuinely have no meaning here (premium tiers, boosts, guild features) are
 * emitted at their "none" value rather than invented.
 */
import type { StoredMessage } from "../storage";
import { snowflakeFor, snowflakesFor, buildSnowflake } from "./snowflake";
import {
  ChannelType,
  MessageType,
  DEFAULT_PERMISSIONS,
  ALL_PERMISSIONS,
  Permission,
} from "./protocol";

export interface HoffleUserRow {
  id: string;
  username: string;
  display_name: string;
  avatar: string;
  avatar_url?: string | null;
  banner_url?: string | null;
  color: string;
  is_admin?: number;
  created_at?: string;
  status?: string | null;
  custom_status?: string | null;
  bio?: string | null;
}

export interface HoffleChannelRow {
  id: string;
  server_id: string;
  name: string;
  kind: string;
  topic?: string | null;
  position?: number;
  category_id?: string | null;
  created_at?: string;
}

export interface HoffleServerRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  created_by?: string | null;
  created_at?: string;
  banner_url?: string | null;
}

export interface HoffleRoleRow {
  id: string;
  server_id: string;
  name: string;
  color: string;
  permissions: number;
  position: number;
  created_at?: string;
}

/**
 * Discord serves avatars from a CDN keyed by a content hash. Hoffle stores a
 * URL, so the hash is derived from it: it only has to be stable for a given
 * image and change when the image does, which is what busts client caches.
 */
export function avatarHash(source?: string | null): string | null {
  if (!source) return null;
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // 32 hex chars, the shape clients expect from a Discord avatar hash.
  const base = hash.toString(16).padStart(8, "0");
  return (base + base + base + base).slice(0, 32);
}

/** `#rrggbb` to the integer Discord uses for role and embed colours. */
export function colorToInt(color?: string | null): number {
  if (!color) return 0;
  const hex = color.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return 0;
  return parseInt(hex, 16);
}

export function intToColor(value?: number | null): string {
  if (!value || !Number.isFinite(value)) return "#99aab5";
  return `#${(value & 0xffffff).toString(16).padStart(6, "0")}`;
}

/**
 * Discord retired discriminators, and clients treat "0" as "this account is on
 * the new username system" — which is the behaviour we want, since Hoffle
 * usernames are already unique on their own.
 */
const DISCRIMINATOR = "0";

export async function serializeUser(
  user: HoffleUserRow,
  options: { bot?: boolean } = {},
): Promise<Record<string, unknown>> {
  const id = await snowflakeFor("user", user.id, user.created_at);
  return {
    id,
    username: user.username,
    discriminator: DISCRIMINATOR,
    global_name: user.display_name || user.username,
    display_name: user.display_name || user.username,
    avatar: avatarHash(user.avatar_url),
    avatar_decoration_data: null,
    banner: avatarHash(user.banner_url),
    accent_color: colorToInt(user.color) || null,
    bot: Boolean(options.bot),
    system: false,
    mfa_enabled: false,
    locale: "en-US",
    verified: true,
    email: null,
    flags: 0,
    premium_type: 0,
    public_flags: 0,
  };
}

/** The bot's own account, which has no row in `users`. */
export async function serializeBotUser(bot: {
  id: string;
  name: string;
  avatar: string;
}): Promise<Record<string, unknown>> {
  const id = await snowflakeFor("user", `bot:${bot.id}`);
  return {
    id,
    username: bot.name,
    discriminator: DISCRIMINATOR,
    global_name: bot.name,
    display_name: bot.name,
    avatar: null,
    avatar_decoration_data: null,
    banner: null,
    accent_color: null,
    bot: true,
    system: false,
    mfa_enabled: false,
    locale: "en-US",
    verified: true,
    email: null,
    flags: 0,
    premium_type: 0,
    public_flags: 0,
  };
}

export async function serializeMember(
  user: HoffleUserRow,
  membership: { joined_at?: string; nick?: string | null; roles?: string[] },
  options: { includeUser?: boolean } = {},
): Promise<Record<string, unknown>> {
  const roleIds = await Promise.all(
    (membership.roles || []).map((roleId) => snowflakeFor("role", roleId)),
  );
  const member: Record<string, unknown> = {
    nick: membership.nick ?? null,
    avatar: null,
    roles: roleIds,
    joined_at: membership.joined_at || user.created_at || new Date().toISOString(),
    premium_since: null,
    deaf: false,
    mute: false,
    flags: 0,
    pending: false,
    communication_disabled_until: null,
  };
  if (options.includeUser !== false) {
    member.user = await serializeUser(user);
  }
  return member;
}

export async function serializeRole(
  role: HoffleRoleRow,
  options: { everyoneGuildId?: string } = {},
): Promise<Record<string, unknown>> {
  // The @everyone role shares the guild's id on Discord, and clients rely on
  // that to find it. Hoffle has no such row, so callers synthesize one.
  const id = options.everyoneGuildId
    ? options.everyoneGuildId
    : await snowflakeFor("role", role.id, role.created_at);
  return {
    id,
    name: role.name,
    description: null,
    color: colorToInt(role.color),
    hoist: false,
    icon: null,
    unicode_emoji: null,
    position: role.position ?? 0,
    // Hoffle stores permissions as a 32-bit int; Discord wants the bitfield as
    // a decimal string because the full set no longer fits in a double.
    permissions: BigInt(role.permissions ?? 0).toString(),
    managed: false,
    mentionable: true,
    flags: 0,
  };
}

/** The synthetic @everyone role, whose id is the guild id by definition. */
export function everyoneRole(guildId: string): Record<string, unknown> {
  return {
    id: guildId,
    name: "@everyone",
    description: null,
    color: 0,
    hoist: false,
    icon: null,
    unicode_emoji: null,
    position: 0,
    permissions: DEFAULT_PERMISSIONS.toString(),
    managed: false,
    mentionable: false,
    flags: 0,
  };
}

function channelTypeFor(kind: string): number {
  switch (kind) {
    case "voice":
      return ChannelType.GuildVoice;
    case "stage":
      return ChannelType.GuildStageVoice;
    case "category":
      return ChannelType.GuildCategory;
    case "forum":
      return ChannelType.GuildForum;
    default:
      return ChannelType.GuildText;
  }
}

export async function serializeChannel(
  channel: HoffleChannelRow,
  guildSnowflake: string,
): Promise<Record<string, unknown>> {
  const id = await snowflakeFor("channel", channel.id, channel.created_at);
  const type = channelTypeFor(channel.kind);
  const base: Record<string, unknown> = {
    id,
    type,
    guild_id: guildSnowflake,
    name: channel.name,
    position: channel.position ?? 0,
    parent_id: channel.category_id
      ? await snowflakeFor("channel", channel.category_id)
      : null,
    permission_overwrites: [],
    nsfw: false,
    flags: 0,
  };

  if (type === ChannelType.GuildVoice || type === ChannelType.GuildStageVoice) {
    return {
      ...base,
      bitrate: 64000,
      user_limit: 0,
      rtc_region: null,
      video_quality_mode: 1,
      // Voice channels accept text on Discord, and clients read these.
      last_message_id: null,
      rate_limit_per_user: 0,
    };
  }

  return {
    ...base,
    topic: channel.topic || null,
    last_message_id: null,
    last_pin_timestamp: null,
    rate_limit_per_user: 0,
    default_auto_archive_duration: 1440,
  };
}

/** A DM channel, which has recipients instead of a guild. */
export async function serializeDmChannel(
  channelId: string,
  recipients: HoffleUserRow[],
  createdAt?: string,
): Promise<Record<string, unknown>> {
  return {
    id: await snowflakeFor("channel", channelId, createdAt),
    type: recipients.length > 1 ? ChannelType.GroupDM : ChannelType.DM,
    last_message_id: null,
    recipients: await Promise.all(recipients.map((r) => serializeUser(r))),
    flags: 0,
  };
}

export async function serializeEmoji(emoji: {
  id: string;
  name: string;
  created_at?: string;
}): Promise<Record<string, unknown>> {
  return {
    id: await snowflakeFor("emoji", emoji.id, emoji.created_at),
    name: emoji.name,
    roles: [],
    user: null,
    require_colons: true,
    managed: false,
    animated: false,
    available: true,
  };
}

export async function serializeGuild(
  server: HoffleServerRow,
  parts: {
    channels?: Record<string, unknown>[];
    members?: Record<string, unknown>[];
    roles?: Record<string, unknown>[];
    emojis?: Record<string, unknown>[];
    memberCount?: number;
    ownerId?: string;
    presences?: Record<string, unknown>[];
    voiceStates?: Record<string, unknown>[];
  } = {},
): Promise<Record<string, unknown>> {
  const id = await snowflakeFor("guild", server.id, server.created_at);
  const roles = parts.roles ?? [];
  return {
    id,
    name: server.name,
    icon: avatarHash(server.icon),
    icon_hash: null,
    splash: null,
    discovery_splash: null,
    banner: avatarHash(server.banner_url),
    owner: false,
    owner_id: parts.ownerId ?? id,
    permissions: ALL_PERMISSIONS.toString(),
    afk_channel_id: null,
    afk_timeout: 300,
    widget_enabled: false,
    widget_channel_id: null,
    verification_level: 0,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    // @everyone must be present or clients cannot resolve base permissions.
    roles: roles.length ? roles : [everyoneRole(id)],
    emojis: parts.emojis ?? [],
    stickers: [],
    features: [],
    mfa_level: 0,
    application_id: null,
    system_channel_id: null,
    system_channel_flags: 0,
    rules_channel_id: null,
    max_presences: null,
    max_members: 250000,
    vanity_url_code: null,
    description: null,
    premium_tier: 0,
    premium_subscription_count: 0,
    preferred_locale: "en-US",
    public_updates_channel_id: null,
    max_video_channel_users: 25,
    nsfw_level: 0,
    premium_progress_bar_enabled: false,
    safety_alerts_channel_id: null,
    // GUILD_CREATE-only fields. Harmless on a plain guild fetch, and their
    // absence in GUILD_CREATE leaves discord.js with an empty channel cache.
    joined_at: server.created_at || new Date().toISOString(),
    large: false,
    unavailable: false,
    member_count: parts.memberCount ?? parts.members?.length ?? 0,
    voice_states: parts.voiceStates ?? [],
    members: parts.members ?? [],
    channels: parts.channels ?? [],
    threads: [],
    presences: parts.presences ?? [],
    stage_instances: [],
    guild_scheduled_events: [],
  };
}

export interface MessageContext {
  guildSnowflake?: string | null;
  channelSnowflake: string;
  /** Resolved author, when the message came from a real account. */
  author?: HoffleUserRow | null;
  /** Reactions grouped by emoji, when the caller already loaded them. */
  reactions?: Array<{ emoji: string; count: number; me: boolean }>;
  /** The message this replies to, already serialized. */
  referencedMessage?: Record<string, unknown> | null;
  mentions?: HoffleUserRow[];
  /** Origin for attachment URLs, which must be absolute for clients to fetch. */
  origin?: string;
  basePath?: string;
}

/**
 * A webhook-style author, used when a message has no Hoffle account behind it
 * (a bot post, a bridged message). Discord clients render these identically to
 * user messages as long as `bot: true` and a stable id are present.
 */
async function syntheticAuthor(
  message: StoredMessage,
): Promise<Record<string, unknown>> {
  const id = await snowflakeFor("user", `author:${message.author}`);
  return {
    id,
    username: message.author,
    discriminator: DISCRIMINATOR,
    global_name: message.author,
    display_name: message.author,
    avatar: null,
    avatar_decoration_data: null,
    bot: Boolean(message.is_bot),
    system: false,
    public_flags: 0,
    flags: 0,
    accent_color: colorToInt(message.color) || null,
    banner: null,
  };
}

function parseAttachmentKeys(message: StoredMessage): string[] {
  const keys: string[] = [];
  if (message.attachment_key) keys.push(message.attachment_key);
  if (message.attachments) {
    try {
      const extra = JSON.parse(message.attachments);
      if (Array.isArray(extra)) {
        for (const key of extra) if (typeof key === "string") keys.push(key);
      }
    } catch {
      // A malformed column should not cost the caller the whole message.
    }
  }
  return keys;
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

async function serializeAttachments(
  message: StoredMessage,
  context: MessageContext,
): Promise<Record<string, unknown>[]> {
  const origin = context.origin || "";
  const basePath = context.basePath ?? "/hangout";
  const keys = parseAttachmentKeys(message);
  return Promise.all(
    keys.map(async (key, index) => {
      // Uploads are stored as "<nonce>--<original name>".
      const filename = key.split("--").slice(1).join("--") || key;
      const url = `${origin}${basePath}/api/uploads/${encodeURIComponent(key)}`;
      const isImage = IMAGE_EXTENSIONS.test(filename);
      return {
        id: await snowflakeFor("attachment", `${message.id}:${index}`, message.created_at),
        filename,
        title: filename,
        description: null,
        content_type: contentTypeFor(filename),
        // Hoffle does not record upload sizes or image dimensions. Clients only
        // display these, so zero is inert where a missing key would not be.
        size: 0,
        url,
        proxy_url: url,
        height: isImage ? 0 : null,
        width: isImage ? 0 : null,
        ephemeral: false,
        flags: 0,
      };
    }),
  );
}

function contentTypeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",
  };
  return types[ext] || "application/octet-stream";
}

/**
 * Hoffle keeps bot embeds in the `payload` column, written there by the v1 API.
 * Anything already shaped like a Discord embed is passed through untouched.
 */
function embedsFrom(message: StoredMessage): Record<string, unknown>[] {
  if (!message.payload) return [];
  try {
    const parsed = JSON.parse(message.payload) as Record<string, unknown>;
    const embeds = parsed?.embeds;
    if (!Array.isArray(embeds)) return [];
    return embeds.map((embed) => ({
      type: "rich",
      ...(embed as Record<string, unknown>),
      color:
        typeof (embed as { color?: unknown }).color === "string"
          ? colorToInt((embed as { color: string }).color)
          : ((embed as { color?: number }).color ?? 0),
    }));
  } catch {
    return [];
  }
}

function componentsFrom(message: StoredMessage): Record<string, unknown>[] {
  if (!message.payload) return [];
  try {
    const parsed = JSON.parse(message.payload) as { components?: unknown };
    return Array.isArray(parsed?.components)
      ? (parsed.components as Record<string, unknown>[])
      : [];
  } catch {
    return [];
  }
}

export async function serializeMessage(
  message: StoredMessage,
  context: MessageContext,
): Promise<Record<string, unknown>> {
  const id = await snowflakeFor("message", message.id, message.created_at);
  const author = context.author
    ? await serializeUser(context.author, { bot: Boolean(message.is_bot) })
    : await syntheticAuthor(message);

  const mentions = await Promise.all(
    (context.mentions || []).map((user) => serializeUser(user)),
  );

  const reactions = await Promise.all(
    (context.reactions || []).map(async (reaction) => ({
      count: reaction.count,
      count_details: { burst: 0, normal: reaction.count },
      me: reaction.me,
      me_burst: false,
      burst_colors: [],
      // A custom emoji reaction is stored as its name; unicode stays as-is.
      emoji: { id: null, name: reaction.emoji },
    })),
  );

  const isReply = Boolean(message.reply_to);
  const payload: Record<string, unknown> = {
    id,
    channel_id: context.channelSnowflake,
    guild_id: context.guildSnowflake ?? undefined,
    author,
    member: undefined,
    content: message.content ?? "",
    timestamp: message.created_at,
    edited_timestamp: message.edited_at || null,
    tts: false,
    mention_everyone: (message.content || "").includes("@everyone"),
    mentions,
    mention_roles: [],
    mention_channels: [],
    attachments: await serializeAttachments(message, context),
    embeds: embedsFrom(message),
    components: componentsFrom(message),
    reactions,
    nonce: undefined,
    pinned: Boolean(message.pinned_at),
    webhook_id: undefined,
    type: message.command_text
      ? MessageType.ChatInputCommand
      : isReply
        ? MessageType.Reply
        : MessageType.Default,
    flags: 0,
    position: undefined,
  };

  if (isReply) {
    const referencedId = await snowflakeFor("message", message.reply_to!);
    payload.message_reference = {
      type: 0,
      message_id: referencedId,
      channel_id: context.channelSnowflake,
      guild_id: context.guildSnowflake ?? undefined,
    };
    // discord.js only exposes `message.fetchReference()` lazily, but
    // discord.py reads `referenced_message` straight off the payload.
    payload.referenced_message = context.referencedMessage ?? null;
  }

  return payload;
}

/** Bulk id resolution for message lists, avoiding a lookup per row. */
export async function messageSnowflakes(
  messages: StoredMessage[],
): Promise<Map<string, string>> {
  return snowflakesFor(
    "message",
    messages.map((m) => ({ id: m.id, created_at: m.created_at })),
  );
}

/** A presence, which Discord requires even for offline members. */
export async function serializePresence(
  user: HoffleUserRow,
  guildSnowflake: string,
  online: boolean,
): Promise<Record<string, unknown>> {
  const status = !online
    ? "offline"
    : user.status === "invisible"
      ? "offline"
      : user.status || "online";
  return {
    user: { id: await snowflakeFor("user", user.id, user.created_at) },
    guild_id: guildSnowflake,
    status,
    activities: user.custom_status
      ? [{ name: "Custom Status", type: 4, state: user.custom_status }]
      : [],
    client_status: status === "offline" ? {} : { desktop: status },
  };
}

/** A fresh snowflake for something Hoffle has not persisted (an interaction). */
export function transientSnowflake(): string {
  return buildSnowflake(Date.now());
}

export { Permission };
