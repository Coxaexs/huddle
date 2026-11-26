/**
 * Core types, defaults, sanitizers, XP math, and template helpers for
 * Hoffle's built-in MEE6-style Community Bot.
 */

export type LevelAnnounceMode = "current" | "channel" | "dm" | "off";

export interface RoleReward {
  level: number;
  roleId: string;
}

export interface LevelsPluginConfig {
  enabled: boolean;
  minXp: number;
  maxXp: number;
  cooldownSec: number;
  multiplier: number;
  announceMode: LevelAnnounceMode;
  announceChannelId: string | null;
  levelUpMessage: string;
  ignoredChannelIds: string[];
  ignoredRoleIds: string[];
  stackRoleRewards: boolean;
  voiceXpEnabled: boolean;
  voiceXpPerMin: number;
  roleRewards: RoleReward[];
  rankCardColor: string;
}

export interface WelcomePluginConfig {
  enabled: boolean;
  joinChannelId: string | null;
  joinMessage: string;
  joinUseEmbed: boolean;
  joinEmbedColor: string;
  joinBannerText: string;
  dmEnabled: boolean;
  dmMessage: string;
  autoRoleIds: string[];
  leaveEnabled: boolean;
  leaveChannelId: string | null;
  leaveMessage: string;
}

export interface ReactionRolesPluginConfig {
  enabled: boolean;
}

export type EscalationAction = "timeout" | "kick" | "ban";

export interface WarnEscalationRule {
  warns: number;
  action: EscalationAction;
  /** Duration in minutes for "timeout" escalations. */
  durationMin?: number;
}

export interface ModerationPluginConfig {
  enabled: boolean;
  modLogChannelId: string | null;
  warnDmEnabled: boolean;
  escalations: WarnEscalationRule[];
}

export interface CustomCommandsPluginConfig {
  enabled: boolean;
  prefix: string;
}

export interface SimpleTogglePluginConfig {
  enabled: boolean;
}

export interface StarboardPluginConfig {
  enabled: boolean;
  channelId: string | null;
  emoji: string;
  threshold: number;
  allowSelfStar: boolean;
  ignoredChannelIds: string[];
}

export interface LogsPluginConfig {
  enabled: boolean;
  channelId: string | null;
  logMessageDelete: boolean;
  logMessageEdit: boolean;
  logMemberJoin: boolean;
  logMemberLeave: boolean;
  logModActions: boolean;
}

export interface EconomyPluginConfig {
  enabled: boolean;
  currencyName: string;
  currencyEmoji: string;
  startingBalance: number;
  dailyAmount: number;
  workMin: number;
  workMax: number;
  workCooldownMin: number;
}

export interface BirthdaysPluginConfig {
  enabled: boolean;
  channelId: string | null;
  message: string;
  birthdayRoleId: string | null;
}

export interface TempVoicePluginConfig {
  enabled: boolean;
  creatorChannelId: string | null;
  nameTemplate: string;
}

export interface ServerStatsPluginConfig {
  enabled: boolean;
  memberCountChannelId: string | null;
  memberCountTemplate: string;
  onlineCountChannelId: string | null;
  onlineCountTemplate: string;
  channelCountChannelId: string | null;
  channelCountTemplate: string;
}

export interface CommunityBotPlugins {
  levels: LevelsPluginConfig;
  welcome: WelcomePluginConfig;
  reactionRoles: ReactionRolesPluginConfig;
  moderation: ModerationPluginConfig;
  customCommands: CustomCommandsPluginConfig;
  embeds: SimpleTogglePluginConfig;
  timers: SimpleTogglePluginConfig;
  giveaways: SimpleTogglePluginConfig;
  starboard: StarboardPluginConfig;
  ticketing: SimpleTogglePluginConfig;
  logs: LogsPluginConfig;
  economy: EconomyPluginConfig;
  birthdays: BirthdaysPluginConfig;
  tempVoice: TempVoicePluginConfig;
  serverStats: ServerStatsPluginConfig;
}

export interface ShopItem {
  id: string;
  serverId: string;
  name: string;
  description: string;
  emoji: string;
  price: number;
  roleId: string | null;
  createdAt: string;
}

export interface BirthdayEntry {
  serverId: string;
  userId: string;
  username?: string;
  displayName?: string;
  month: number;
  day: number;
}

export interface CustomCommand {
  id: string;
  serverId: string;
  trigger: string;
  response: string;
  useEmbed: boolean;
  embedTitle: string | null;
  embedColor: string;
  grantRoleId: string | null;
  removeRoleId: string | null;
  cooldownSec: number;
  enabled: boolean;
  uses: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmbedFieldInput {
  name: string;
  value: string;
  inline?: boolean;
}

export interface SavedEmbedData {
  title?: string;
  description?: string;
  url?: string;
  color?: string;
  authorName?: string;
  authorIconUrl?: string;
  footerText?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  includeTimestamp?: boolean;
  fields?: EmbedFieldInput[];
}

export interface SavedEmbed {
  id: string;
  serverId: string;
  channelId: string;
  messageId: string | null;
  name: string;
  content: string;
  embed: SavedEmbedData;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringTimer {
  id: string;
  serverId: string;
  channelId: string;
  name: string;
  message: string;
  useEmbed: boolean;
  embedColor: string;
  intervalMin: number;
  enabled: boolean;
  nextRunAt: number;
  lastRunAt: number | null;
  createdAt: string;
}

export interface Giveaway {
  id: string;
  serverId: string;
  channelId: string;
  messageId: string | null;
  prize: string;
  description: string;
  winnerCount: number;
  requiredRoleId: string | null;
  hostId: string;
  endsAt: number;
  ended: boolean;
  winnerIds: string[];
  entryCount: number;
  createdAt: string;
}

export interface TicketPanel {
  id: string;
  serverId: string;
  channelId: string;
  messageId: string | null;
  title: string;
  description: string;
  buttonLabel: string;
  buttonEmoji: string;
  color: string;
  welcomeMessage: string;
  supportRoleId: string | null;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  serverId: string;
  panelId: string | null;
  channelId: string;
  threadId: string | null;
  openerId: string;
  openerName?: string;
  claimerId: string | null;
  claimerName?: string;
  status: "open" | "closed";
  subject: string;
  createdAt: string;
  closedAt: string | null;
}

export interface CommunityBotConfig {
  serverId: string;
  enabled: boolean;
  botName: string;
  botAvatar: string;
  botColor: string;
  plugins: CommunityBotPlugins;
  updatedAt: string;
}

export type ReactionPanelMode = "normal" | "unique" | "reverse" | "drop";
export type ReactionPanelStyle = "buttons" | "reactions";

export interface ReactionPanelItem {
  id: string;
  roleId: string;
  label: string;
  emoji: string;
  /** Discord button style: 1=Primary, 2=Secondary, 3=Success, 4=Danger */
  buttonStyle: 1 | 2 | 3 | 4;
}

export interface ReactionRolePanel {
  id: string;
  serverId: string;
  channelId: string;
  messageId: string | null;
  title: string;
  description: string;
  color: string;
  mode: ReactionPanelMode;
  style: ReactionPanelStyle;
  items: ReactionPanelItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CommunityWarning {
  id: string;
  serverId: string;
  userId: string;
  username?: string;
  displayName?: string;
  moderatorId: string;
  moderatorName?: string;
  reason: string;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  xp: number;
  level: number;
  messages: number;
  voiceMinutes: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPct: number;
}

export function defaultPlugins(): CommunityBotPlugins {
  return {
    levels: {
      enabled: true,
      minXp: 15,
      maxXp: 25,
      cooldownSec: 60,
      multiplier: 1,
      announceMode: "current",
      announceChannelId: null,
      levelUpMessage: "GG {user}, you just advanced to **Level {level}**!",
      ignoredChannelIds: [],
      ignoredRoleIds: [],
      stackRoleRewards: true,
      voiceXpEnabled: false,
      voiceXpPerMin: 10,
      roleRewards: [],
      rankCardColor: "#6366f1",
    },
    welcome: {
      enabled: false,
      joinChannelId: null,
      joinMessage: "Welcome to **{server}**, {user}! You are member #{memberCount}.",
      joinUseEmbed: true,
      joinEmbedColor: "#6366f1",
      joinBannerText: "WELCOME TO THE SERVER",
      dmEnabled: false,
      dmMessage: "Welcome to **{server}**! Check out the rules and say hi.",
      autoRoleIds: [],
      leaveEnabled: false,
      leaveChannelId: null,
      leaveMessage: "**{username}** just left {server}. Farewell!",
    },
    reactionRoles: {
      enabled: true,
    },
    moderation: {
      enabled: true,
      modLogChannelId: null,
      warnDmEnabled: true,
      escalations: [
        { warns: 3, action: "timeout", durationMin: 30 },
        { warns: 5, action: "kick" },
      ],
    },
    customCommands: {
      enabled: true,
      prefix: "!",
    },
    embeds: {
      enabled: true,
    },
    timers: {
      enabled: true,
    },
    giveaways: {
      enabled: true,
    },
    starboard: {
      enabled: false,
      channelId: null,
      emoji: "⭐",
      threshold: 3,
      allowSelfStar: false,
      ignoredChannelIds: [],
    },
    ticketing: {
      enabled: true,
    },
    logs: {
      enabled: false,
      channelId: null,
      logMessageDelete: true,
      logMessageEdit: true,
      logMemberJoin: true,
      logMemberLeave: true,
      logModActions: true,
    },
    economy: {
      enabled: false,
      currencyName: "Coins",
      currencyEmoji: "🪙",
      startingBalance: 100,
      dailyAmount: 250,
      workMin: 40,
      workMax: 120,
      workCooldownMin: 30,
    },
    birthdays: {
      enabled: false,
      channelId: null,
      message: "🎂 Happy Birthday, {user}! Hope you have an amazing day in **{server}**! 🎉",
      birthdayRoleId: null,
    },
    tempVoice: {
      enabled: false,
      creatorChannelId: null,
      nameTemplate: "🎙️ {username}'s Room",
    },
    serverStats: {
      enabled: false,
      memberCountChannelId: null,
      memberCountTemplate: "👥 Members: {count}",
      onlineCountChannelId: null,
      onlineCountTemplate: "🟢 Online: {count}",
      channelCountChannelId: null,
      channelCountTemplate: "💬 Channels: {count}",
    },
  };
}

export function defaultConfig(serverId: string): CommunityBotConfig {
  return {
    serverId,
    enabled: false,
    botName: "HoffBot",
    botAvatar: "🤖",
    botColor: "#6366f1",
    plugins: defaultPlugins(),
    updatedAt: new Date(0).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// MEE6-compatible XP & Level Math
// ---------------------------------------------------------------------------

/** XP needed to advance from `level` to `level + 1` (MEE6 formula). */
export function xpNeededForNextLevel(level: number): number {
  const l = Math.max(0, Math.floor(level));
  return 5 * l * l + 50 * l + 100;
}

/** Cumulative total XP required to reach `level`. */
export function totalXpForLevel(level: number): number {
  const l = Math.max(0, Math.floor(level));
  let total = 0;
  for (let i = 0; i < l; i++) {
    total += xpNeededForNextLevel(i);
  }
  return total;
}

/** Computes level and in-level progress from cumulative `xp`. */
export function levelFromXp(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPct: number;
} {
  let remaining = Math.max(0, Math.floor(xp));
  let level = 0;
  while (level < 500) {
    const needed = xpNeededForNextLevel(level);
    if (remaining < needed) {
      return {
        level,
        currentLevelXp: remaining,
        nextLevelXp: needed,
        progressPct: Math.min(100, Math.round((remaining / needed) * 100)),
      };
    }
    remaining -= needed;
    level++;
  }
  const needed = xpNeededForNextLevel(level);
  return { level, currentLevelXp: remaining, nextLevelXp: needed, progressPct: 100 };
}

/** Renders a progress bar string for embeds (e.g. `██████░░░░ 62%`). */
export function renderProgressBar(pct: number, width = 14): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${clamped}%`;
}

// ---------------------------------------------------------------------------
// Template variable interpolation
// ---------------------------------------------------------------------------

export interface TemplateVars {
  user?: string;
  username?: string;
  server?: string;
  level?: number | string;
  xp?: number | string;
  memberCount?: number | string;
  reason?: string;
  warns?: number | string;
  args?: string;
}

/** Replaces `{user}`, `{username}`, `{server}`, `{level}`, etc. safely. */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, key: string) => {
    const k = key as keyof TemplateVars;
    const val = vars[k];
    return val === undefined || val === null ? match : String(val);
  });
}

// ---------------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function sanitizeHexColor(raw: unknown, fallback = "#6366f1"): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return HEX_COLOR.test(s) ? s.toLowerCase() : fallback;
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampFloat(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 100) / 100));
}

function sanitizeIdList(raw: unknown, limit = 50): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= limit) break;
    const id = typeof item === "string" ? item.trim().slice(0, 64) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function sanitizePlugins(raw: unknown): CommunityBotPlugins {
  const def = defaultPlugins();
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  // Levels
  const lv = obj.levels && typeof obj.levels === "object" ? (obj.levels as Record<string, unknown>) : {};
  const minXp = clampInt(lv.minXp, 1, 500, def.levels.minXp);
  const maxXp = Math.max(minXp, clampInt(lv.maxXp, 1, 1000, def.levels.maxXp));
  const announceModes: LevelAnnounceMode[] = ["current", "channel", "dm", "off"];
  const announceMode = announceModes.includes(lv.announceMode as LevelAnnounceMode)
    ? (lv.announceMode as LevelAnnounceMode)
    : def.levels.announceMode;
  const roleRewards: RoleReward[] = [];
  if (Array.isArray(lv.roleRewards)) {
    const seen = new Set<string>();
    for (const item of lv.roleRewards) {
      if (roleRewards.length >= 40) break;
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const level = clampInt(r.level, 1, 500, 0);
      const roleId = typeof r.roleId === "string" ? r.roleId.trim().slice(0, 64) : "";
      if (!level || !roleId) continue;
      const key = `${level}:${roleId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      roleRewards.push({ level, roleId });
    }
    roleRewards.sort((a, b) => a.level - b.level);
  }

  // Welcome
  const wl = obj.welcome && typeof obj.welcome === "object" ? (obj.welcome as Record<string, unknown>) : {};

  // Reaction Roles
  const rr = obj.reactionRoles && typeof obj.reactionRoles === "object" ? (obj.reactionRoles as Record<string, unknown>) : {};

  // Moderation
  const md = obj.moderation && typeof obj.moderation === "object" ? (obj.moderation as Record<string, unknown>) : {};
  const cc = obj.customCommands && typeof obj.customCommands === "object" ? (obj.customCommands as Record<string, unknown>) : {};
  const em = obj.embeds && typeof obj.embeds === "object" ? (obj.embeds as Record<string, unknown>) : {};
  const tm = obj.timers && typeof obj.timers === "object" ? (obj.timers as Record<string, unknown>) : {};
  const gw = obj.giveaways && typeof obj.giveaways === "object" ? (obj.giveaways as Record<string, unknown>) : {};
  const sb = obj.starboard && typeof obj.starboard === "object" ? (obj.starboard as Record<string, unknown>) : {};
  const tk = obj.ticketing && typeof obj.ticketing === "object" ? (obj.ticketing as Record<string, unknown>) : {};
  const lg = obj.logs && typeof obj.logs === "object" ? (obj.logs as Record<string, unknown>) : {};
  const ec = obj.economy && typeof obj.economy === "object" ? (obj.economy as Record<string, unknown>) : {};
  const bd = obj.birthdays && typeof obj.birthdays === "object" ? (obj.birthdays as Record<string, unknown>) : {};
  const tv = obj.tempVoice && typeof obj.tempVoice === "object" ? (obj.tempVoice as Record<string, unknown>) : {};
  const ss = obj.serverStats && typeof obj.serverStats === "object" ? (obj.serverStats as Record<string, unknown>) : {};
  const workMin = clampInt(ec.workMin, 1, 100_000, def.economy.workMin);
  const workMax = Math.max(workMin, clampInt(ec.workMax, 1, 100_000, def.economy.workMax));
  const validActions: EscalationAction[] = ["timeout", "kick", "ban"];
  const escalations: WarnEscalationRule[] = [];
  if (Array.isArray(md.escalations)) {
    const seenWarns = new Set<number>();
    for (const item of md.escalations) {
      if (escalations.length >= 10) break;
      if (!item || typeof item !== "object") continue;
      const e = item as Record<string, unknown>;
      const warns = clampInt(e.warns, 1, 50, 0);
      const action = validActions.includes(e.action as EscalationAction)
        ? (e.action as EscalationAction)
        : null;
      if (!warns || !action || seenWarns.has(warns)) continue;
      seenWarns.add(warns);
      escalations.push({
        warns,
        action,
        durationMin: action === "timeout" ? clampInt(e.durationMin, 1, 40320, 30) : undefined,
      });
    }
    escalations.sort((a, b) => a.warns - b.warns);
  } else if (md.escalations === undefined) {
    escalations.push(...def.moderation.escalations);
  }

  return {
    levels: {
      enabled: lv.enabled === undefined ? def.levels.enabled : Boolean(lv.enabled),
      minXp,
      maxXp,
      cooldownSec: clampInt(lv.cooldownSec, 5, 600, def.levels.cooldownSec),
      multiplier: clampFloat(lv.multiplier, 0.25, 5, def.levels.multiplier),
      announceMode,
      announceChannelId: typeof lv.announceChannelId === "string" && lv.announceChannelId.trim()
        ? lv.announceChannelId.trim().slice(0, 64)
        : null,
      levelUpMessage: typeof lv.levelUpMessage === "string" && lv.levelUpMessage.trim()
        ? lv.levelUpMessage.trim().slice(0, 500)
        : def.levels.levelUpMessage,
      ignoredChannelIds: sanitizeIdList(lv.ignoredChannelIds),
      ignoredRoleIds: sanitizeIdList(lv.ignoredRoleIds),
      stackRoleRewards: lv.stackRoleRewards === undefined ? def.levels.stackRoleRewards : Boolean(lv.stackRoleRewards),
      voiceXpEnabled: Boolean(lv.voiceXpEnabled),
      voiceXpPerMin: clampInt(lv.voiceXpPerMin, 1, 200, def.levels.voiceXpPerMin),
      roleRewards,
      rankCardColor: sanitizeHexColor(lv.rankCardColor, def.levels.rankCardColor),
    },
    welcome: {
      enabled: Boolean(wl.enabled),
      joinChannelId: typeof wl.joinChannelId === "string" && wl.joinChannelId.trim()
        ? wl.joinChannelId.trim().slice(0, 64)
        : null,
      joinMessage: typeof wl.joinMessage === "string" && wl.joinMessage.trim()
        ? wl.joinMessage.trim().slice(0, 1000)
        : def.welcome.joinMessage,
      joinUseEmbed: wl.joinUseEmbed === undefined ? def.welcome.joinUseEmbed : Boolean(wl.joinUseEmbed),
      joinEmbedColor: sanitizeHexColor(wl.joinEmbedColor, def.welcome.joinEmbedColor),
      joinBannerText: typeof wl.joinBannerText === "string"
        ? wl.joinBannerText.trim().slice(0, 80)
        : def.welcome.joinBannerText,
      dmEnabled: Boolean(wl.dmEnabled),
      dmMessage: typeof wl.dmMessage === "string" && wl.dmMessage.trim()
        ? wl.dmMessage.trim().slice(0, 1000)
        : def.welcome.dmMessage,
      autoRoleIds: sanitizeIdList(wl.autoRoleIds, 15),
      leaveEnabled: Boolean(wl.leaveEnabled),
      leaveChannelId: typeof wl.leaveChannelId === "string" && wl.leaveChannelId.trim()
        ? wl.leaveChannelId.trim().slice(0, 64)
        : null,
      leaveMessage: typeof wl.leaveMessage === "string" && wl.leaveMessage.trim()
        ? wl.leaveMessage.trim().slice(0, 1000)
        : def.welcome.leaveMessage,
    },
    reactionRoles: {
      enabled: rr.enabled === undefined ? def.reactionRoles.enabled : Boolean(rr.enabled),
    },
    moderation: {
      enabled: md.enabled === undefined ? def.moderation.enabled : Boolean(md.enabled),
      modLogChannelId: typeof md.modLogChannelId === "string" && md.modLogChannelId.trim()
        ? md.modLogChannelId.trim().slice(0, 64)
        : null,
      warnDmEnabled: md.warnDmEnabled === undefined ? def.moderation.warnDmEnabled : Boolean(md.warnDmEnabled),
      escalations,
    },
    customCommands: {
      enabled: cc.enabled === undefined ? def.customCommands.enabled : Boolean(cc.enabled),
      prefix:
        typeof cc.prefix === "string" && cc.prefix.trim()
          ? cc.prefix.trim().slice(0, 4)
          : def.customCommands.prefix,
    },
    embeds: {
      enabled: em.enabled === undefined ? def.embeds.enabled : Boolean(em.enabled),
    },
    timers: {
      enabled: tm.enabled === undefined ? def.timers.enabled : Boolean(tm.enabled),
    },
    giveaways: {
      enabled: gw.enabled === undefined ? def.giveaways.enabled : Boolean(gw.enabled),
    },
    starboard: {
      enabled: Boolean(sb.enabled),
      channelId:
        typeof sb.channelId === "string" && sb.channelId.trim()
          ? sb.channelId.trim().slice(0, 64)
          : null,
      emoji:
        typeof sb.emoji === "string" && sb.emoji.trim()
          ? sb.emoji.trim().slice(0, 24)
          : def.starboard.emoji,
      threshold: clampInt(sb.threshold, 1, 100, def.starboard.threshold),
      allowSelfStar: Boolean(sb.allowSelfStar),
      ignoredChannelIds: sanitizeIdList(sb.ignoredChannelIds),
    },
    ticketing: {
      enabled: tk.enabled === undefined ? def.ticketing.enabled : Boolean(tk.enabled),
    },
    logs: {
      enabled: Boolean(lg.enabled),
      channelId:
        typeof lg.channelId === "string" && lg.channelId.trim()
          ? lg.channelId.trim().slice(0, 64)
          : null,
      logMessageDelete: lg.logMessageDelete === undefined ? def.logs.logMessageDelete : Boolean(lg.logMessageDelete),
      logMessageEdit: lg.logMessageEdit === undefined ? def.logs.logMessageEdit : Boolean(lg.logMessageEdit),
      logMemberJoin: lg.logMemberJoin === undefined ? def.logs.logMemberJoin : Boolean(lg.logMemberJoin),
      logMemberLeave: lg.logMemberLeave === undefined ? def.logs.logMemberLeave : Boolean(lg.logMemberLeave),
      logModActions: lg.logModActions === undefined ? def.logs.logModActions : Boolean(lg.logModActions),
    },
    economy: {
      enabled: Boolean(ec.enabled),
      currencyName:
        typeof ec.currencyName === "string" && ec.currencyName.trim()
          ? ec.currencyName.trim().slice(0, 24)
          : def.economy.currencyName,
      currencyEmoji:
        typeof ec.currencyEmoji === "string" && ec.currencyEmoji.trim()
          ? ec.currencyEmoji.trim().slice(0, 12)
          : def.economy.currencyEmoji,
      startingBalance: clampInt(ec.startingBalance, 0, 1_000_000, def.economy.startingBalance),
      dailyAmount: clampInt(ec.dailyAmount, 1, 1_000_000, def.economy.dailyAmount),
      workMin,
      workMax,
      workCooldownMin: clampInt(ec.workCooldownMin, 1, 1440, def.economy.workCooldownMin),
    },
    birthdays: {
      enabled: Boolean(bd.enabled),
      channelId:
        typeof bd.channelId === "string" && bd.channelId.trim()
          ? bd.channelId.trim().slice(0, 64)
          : null,
      message:
        typeof bd.message === "string" && bd.message.trim()
          ? bd.message.trim().slice(0, 500)
          : def.birthdays.message,
      birthdayRoleId:
        typeof bd.birthdayRoleId === "string" && bd.birthdayRoleId.trim()
          ? bd.birthdayRoleId.trim().slice(0, 64)
          : null,
    },
    tempVoice: {
      enabled: Boolean(tv.enabled),
      creatorChannelId:
        typeof tv.creatorChannelId === "string" && tv.creatorChannelId.trim()
          ? tv.creatorChannelId.trim().slice(0, 64)
          : null,
      nameTemplate:
        typeof tv.nameTemplate === "string" && tv.nameTemplate.trim()
          ? tv.nameTemplate.trim().slice(0, 60)
          : def.tempVoice.nameTemplate,
    },
    serverStats: {
      enabled: Boolean(ss.enabled),
      memberCountChannelId:
        typeof ss.memberCountChannelId === "string" && ss.memberCountChannelId.trim()
          ? ss.memberCountChannelId.trim().slice(0, 64)
          : null,
      memberCountTemplate:
        typeof ss.memberCountTemplate === "string" && ss.memberCountTemplate.trim()
          ? ss.memberCountTemplate.trim().slice(0, 60)
          : def.serverStats.memberCountTemplate,
      onlineCountChannelId:
        typeof ss.onlineCountChannelId === "string" && ss.onlineCountChannelId.trim()
          ? ss.onlineCountChannelId.trim().slice(0, 64)
          : null,
      onlineCountTemplate:
        typeof ss.onlineCountTemplate === "string" && ss.onlineCountTemplate.trim()
          ? ss.onlineCountTemplate.trim().slice(0, 60)
          : def.serverStats.onlineCountTemplate,
      channelCountChannelId:
        typeof ss.channelCountChannelId === "string" && ss.channelCountChannelId.trim()
          ? ss.channelCountChannelId.trim().slice(0, 64)
          : null,
      channelCountTemplate:
        typeof ss.channelCountTemplate === "string" && ss.channelCountTemplate.trim()
          ? ss.channelCountTemplate.trim().slice(0, 60)
          : def.serverStats.channelCountTemplate,
    },
  };
}

export function sanitizePanelItems(raw: unknown): ReactionPanelItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ReactionPanelItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (items.length >= 25) break;
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const roleId = typeof o.roleId === "string" ? o.roleId.trim().slice(0, 64) : "";
    if (!roleId) continue;
    let id = typeof o.id === "string" ? o.id.replace(/[^a-z0-9_-]/gi, "").slice(0, 24) : "";
    if (!id || seen.has(id)) id = `rr_${items.length}_${Math.random().toString(36).slice(2, 7)}`;
    seen.add(id);
    const label = typeof o.label === "string" && o.label.trim() ? o.label.trim().slice(0, 60) : "Role";
    const emoji = typeof o.emoji === "string" ? o.emoji.trim().slice(0, 24) : "";
    const bs = Number(o.buttonStyle);
    const buttonStyle: 1 | 2 | 3 | 4 = bs === 1 || bs === 2 || bs === 3 || bs === 4 ? bs : 2;
    items.push({ id, roleId, label, emoji, buttonStyle });
  }
  return items;
}
