/**
 * Moving a server over from Discord.
 *
 * Two sources give the same shape: a server template link (Server Settings →
 * Server Template in Discord; public JSON at /guilds/templates/{code}, no bot
 * or login needed), or a bot token with the server's id. Either becomes a
 * ServerLayout: categories and channels in Discord's order, roles with their
 * permissions, and each channel's permission overwrites, translated to
 * Hoffle's bits.
 */
import { Permission as Discord } from "./discord/protocol";
import { Permission } from "./permissions";
import type { LayoutChannel, LayoutChannelKind, LayoutOverwrite, ServerLayout } from "./server-layout";

/** Discord permission bits and the Hoffle ones they become. */
const BITS: Array<[bigint, number]> = [
  [Discord.Administrator, Permission.ADMINISTRATOR],
  [Discord.ManageChannels, Permission.MANAGE_CHANNELS],
  [Discord.ManageGuild, Permission.MANAGE_SERVER],
  [Discord.KickMembers, Permission.KICK_MEMBERS],
  [Discord.BanMembers, Permission.BAN_MEMBERS],
  [Discord.CreateInstantInvite, Permission.CREATE_INVITES],
  [Discord.ViewAuditLog, Permission.VIEW_AUDIT_LOG],
  [Discord.PrioritySpeaker, Permission.PRIORITY_SPEAKER],
  [Discord.Stream, Permission.VIDEO],
  [Discord.ViewChannel, Permission.VIEW_CHANNEL],
  [Discord.SendMessages, Permission.SEND_MESSAGES],
  [Discord.ManageMessages, Permission.MANAGE_MESSAGES],
  [Discord.EmbedLinks, Permission.EMBED_LINKS],
  [Discord.AttachFiles, Permission.ATTACH_FILES],
  [Discord.ReadMessageHistory, Permission.READ_MESSAGE_HISTORY],
  [Discord.MentionEveryone, Permission.MENTION_EVERYONE],
  [Discord.UseExternalEmojis, Permission.USE_EXTERNAL_EMOJIS],
  [Discord.AddReactions, Permission.ADD_REACTIONS],
  [Discord.Connect, Permission.CONNECT],
  [Discord.Speak, Permission.SPEAK],
  [Discord.MuteMembers, Permission.MUTE_MEMBERS],
  [Discord.DeafenMembers, Permission.DEAFEN_MEMBERS],
  [Discord.MoveMembers, Permission.MOVE_MEMBERS],
  [Discord.ChangeNickname, Permission.CHANGE_NICKNAME],
  [Discord.ManageNicknames, Permission.MANAGE_NICKNAMES],
  [Discord.ManageRoles, Permission.MANAGE_ROLES],
  [Discord.ManageEmojisAndStickers, Permission.MANAGE_EMOJIS],
  [Discord.CreatePublicThreads, Permission.CREATE_PUBLIC_THREADS],
  [Discord.SendMessagesInThreads, Permission.SEND_MESSAGES_IN_THREADS],
  [Discord.ModerateMembers, Permission.MODERATE],
];

/** A Discord permission bitfield (a decimal string, as Discord sends it) in Hoffle's bits. */
export function permissionsFromDiscord(value: string | number | bigint | null | undefined): number {
  let bits: bigint;
  try {
    bits = BigInt(value ?? 0);
  } catch {
    return 0;
  }
  let out = 0;
  for (const [discord, hoffle] of BITS) if (bits & discord) out |= hoffle;
  // Discord's Manage Messages is Hoffle's moderation in a channel too (delete anyone's).
  if (out & Permission.MANAGE_MESSAGES) out |= Permission.MODERATE;
  return out;
}

/** The template code in a discord.new / discord.com/template link, or a bare code. */
export function templateCode(input: string): string | null {
  const text = (input || "").trim();
  const link = text.match(/(?:discord\.new|discord(?:app)?\.com\/template)\/([A-Za-z0-9]{2,32})/i);
  if (link) return link[1];
  return /^[A-Za-z0-9]{6,32}$/.test(text) ? text : null;
}

export function looksLikeDiscordTemplate(input: string): boolean {
  return /(?:discord\.new|discord(?:app)?\.com\/template)\//i.test(input || "");
}

interface DiscordRole {
  id: string | number;
  name: string;
  color?: number;
  permissions?: string | number;
  position?: number;
  managed?: boolean;
}

interface DiscordChannel {
  id: string | number;
  type: number;
  name: string;
  position?: number;
  topic?: string | null;
  nsfw?: boolean;
  rate_limit_per_user?: number;
  parent_id?: string | number | null;
  permission_overwrites?: Array<{ id: string | number; type: number | string; allow?: string | number; deny?: string | number }>;
}

/** Discord channel types Hoffle has a kind for (categories are handled apart). */
function kindOf(type: number): LayoutChannelKind | null {
  switch (type) {
    case 0: return "text";
    case 2: return "voice";
    case 5: return "announcement";
    case 13: return "stage";
    case 15:
    case 16: return "forum";
    default: return null;
  }
}
const voiceLike = (type: number) => type === 2 || type === 13;

export interface DiscordSummary {
  name: string;
  description: string;
  categories: number;
  channels: number;
  roles: number;
  privateChannels: string[];
  /** Threads, stores and other channel types with no Hoffle equivalent. */
  skipped: number;
}

/**
 * A Discord server's roles and channels as a layout. `everyoneId` is the id
 * Discord uses for @everyone: 0 in templates, the server's own id from the bot API.
 */
export function layoutFromDiscord(
  roles: DiscordRole[],
  channels: DiscordChannel[],
  everyoneId: string,
): { layout: ServerLayout; skipped: number } {
  const ref = (id: string | number) => String(id);
  const everyone = roles.find((r) => ref(r.id) === everyoneId);
  const memberRoles = roles
    .filter((r) => ref(r.id) !== everyoneId && !r.managed)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const overwritesOf = (channel: DiscordChannel): LayoutOverwrite[] =>
    (channel.permission_overwrites || [])
      // Member overwrites name Discord accounts, which do not exist here.
      .filter((o) => Number(o.type) === 0 || o.type === "role")
      .map((o) => {
        const target = ref(o.id) === everyoneId ? ("everyone" as const) : ("role" as const);
        return {
          target,
          ...(target === "role" ? { roleRef: ref(o.id) } : {}),
          allow: permissionsFromDiscord(o.allow),
          deny: permissionsFromDiscord(o.deny),
        };
      })
      .filter((o) => o.allow || o.deny);

  const toLayout = (channel: DiscordChannel): LayoutChannel => ({
    name: channel.name,
    kind: kindOf(channel.type) || "text",
    topic: channel.topic || "",
    slowmode: channel.rate_limit_per_user || 0,
    nsfw: Boolean(channel.nsfw),
    overwrites: overwritesOf(channel),
  });

  // Discord's own order: uncategorized first, categories by position, and in
  // each, text-like channels above voice-like ones, each by position.
  const byPosition = (a: DiscordChannel, b: DiscordChannel) =>
    (voiceLike(a.type) ? 1 : 0) - (voiceLike(b.type) ? 1 : 0) || (a.position ?? 0) - (b.position ?? 0);
  const categories = channels.filter((c) => c.type === 4).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const categoryIds = new Set(categories.map((c) => ref(c.id)));
  const usable = channels.filter((c) => kindOf(c.type));
  const skipped = channels.filter((c) => c.type !== 4 && !kindOf(c.type)).length;

  return {
    skipped,
    layout: {
      roles: memberRoles.map((r) => ({
        ref: ref(r.id),
        name: r.name,
        color: r.color ? `#${r.color.toString(16).padStart(6, "0")}` : undefined,
        permissions: permissionsFromDiscord(r.permissions),
      })),
      everyonePermissions: everyone ? permissionsFromDiscord(everyone.permissions) : undefined,
      channels: usable
        .filter((c) => c.parent_id == null || !categoryIds.has(ref(c.parent_id)))
        .sort(byPosition)
        .map(toLayout),
      categories: categories.map((category) => ({
        name: category.name,
        channels: usable
          .filter((c) => c.parent_id != null && ref(c.parent_id) === ref(category.id))
          .sort(byPosition)
          .map(toLayout),
      })),
    },
  };
}

/** Counts for the preview, without writing anything. */
export function summarize(name: string, description: string, layout: ServerLayout, skipped: number): DiscordSummary {
  const all = [...(layout.channels || []), ...(layout.categories || []).flatMap((c) => c.channels)];
  return {
    name,
    description,
    categories: (layout.categories || []).length,
    channels: all.length,
    roles: (layout.roles || []).length,
    privateChannels: all
      .filter((c) => (c.overwrites || []).some((o) => o.target === "everyone" && o.deny & Permission.VIEW_CHANNEL))
      .map((c) => c.name),
    skipped,
  };
}

export type DiscordFetch = { ok: true; name: string; description: string; layout: ServerLayout; skipped: number } | { ok: false; status: number; error: string };

const UA = "Hoffle (https://hoffle.online, 1.0)";

/** Reads a Discord server template by link or code. */
export async function fetchDiscordTemplate(input: string): Promise<DiscordFetch> {
  const code = templateCode(input);
  if (!code) {
    return { ok: false, status: 400, error: "That doesn't look like a Discord template link (discord.new/…)." };
  }
  const res = await fetch(`https://discord.com/api/v10/guilds/templates/${encodeURIComponent(code)}`, {
    headers: { "User-Agent": UA },
  }).catch(() => null);
  if (!res) return { ok: false, status: 502, error: "Couldn't reach Discord. Try again in a moment." };
  if (res.status === 404) {
    return { ok: false, status: 404, error: "Discord doesn't know that template. It may have been deleted, or the link is mistyped." };
  }
  if (res.status === 429) return { ok: false, status: 429, error: "Discord is rate limiting us. Try again in a minute." };
  if (!res.ok) return { ok: false, status: 502, error: `Discord answered ${res.status}. Try again in a moment.` };
  const data = (await res.json().catch(() => null)) as {
    name?: string;
    description?: string | null;
    serialized_source_guild?: { name?: string; description?: string | null; roles?: DiscordRole[]; channels?: DiscordChannel[] };
  } | null;
  const guild = data?.serialized_source_guild;
  if (!guild) return { ok: false, status: 502, error: "Discord sent something unexpected for that template." };
  const { layout, skipped } = layoutFromDiscord(guild.roles || [], guild.channels || [], "0");
  return {
    ok: true,
    name: (guild.name || data?.name || "Imported server").slice(0, 50),
    description: (guild.description || data?.description || "").slice(0, 240),
    layout,
    skipped,
  };
}

/** Reads a server through a bot that is in it (the older, token-based import). */
export async function fetchDiscordGuild(guildId: string, botToken: string): Promise<DiscordFetch> {
  if (!/^\d{15,22}$/.test(guildId) || !botToken) {
    return { ok: false, status: 400, error: "Provide a valid Discord Bot Token and numeric Discord Server (Guild) ID." };
  }
  const headers = { Authorization: `Bot ${botToken}`, "User-Agent": UA };
  const [guildRes, channelRes, roleRes] = await Promise.all([
    fetch(`https://discord.com/api/v10/guilds/${guildId}`, { headers }).catch(() => null),
    fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers }).catch(() => null),
    fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers }).catch(() => null),
  ]);
  if (!channelRes || !channelRes.ok) {
    return {
      ok: false,
      status: 400,
      error: `Could not fetch Discord server channels (HTTP ${channelRes?.status || "network error"}). Check that the bot is in the Discord server.`,
    };
  }
  const guild = guildRes?.ok ? ((await guildRes.json().catch(() => null)) as { name?: string; description?: string | null } | null) : null;
  const channels = ((await channelRes.json().catch(() => [])) as DiscordChannel[]) || [];
  const roles = roleRes?.ok ? (((await roleRes.json().catch(() => [])) as DiscordRole[]) || []) : [];
  const { layout, skipped } = layoutFromDiscord(roles, channels, guildId);
  return { ok: true, name: (guild?.name || "Imported server").slice(0, 50), description: (guild?.description || "").slice(0, 240), layout, skipped };
}
