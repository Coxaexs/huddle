/**
 * Gateway and REST constants for the Discord-compatible surface.
 *
 * Values come from Discord's v10 documentation and must not be renumbered:
 * every client hardcodes them. Only the subset Hoffle can actually honour is
 * listed — voice opcodes are absent because Workers cannot open UDP sockets,
 * so a voice connection can never be established.
 */

/** The API version bots ask for. v9 and v10 are close enough to share a path. */
export const SUPPORTED_API_VERSIONS = new Set(["9", "10"]);

/** Receive/send opcodes on the main gateway. */
export const GatewayOpcode = {
  Dispatch: 0,
  Heartbeat: 1,
  Identify: 2,
  PresenceUpdate: 3,
  VoiceStateUpdate: 4,
  Resume: 6,
  Reconnect: 7,
  RequestGuildMembers: 8,
  InvalidSession: 9,
  Hello: 10,
  HeartbeatAck: 11,
} as const;

/**
 * Close codes. 4000-4003 let the client retry; 4004 and 4010-4014 are fatal and
 * stop it reconnecting, which is what we want for a bad token or bad intents —
 * otherwise a misconfigured bot hammers the worker forever.
 */
export const GatewayCloseCode = {
  UnknownError: 4000,
  UnknownOpcode: 4001,
  DecodeError: 4002,
  NotAuthenticated: 4003,
  AuthenticationFailed: 4004,
  AlreadyAuthenticated: 4005,
  InvalidSequence: 4007,
  RateLimited: 4008,
  SessionTimedOut: 4009,
  InvalidShard: 4010,
  ShardingRequired: 4011,
  InvalidApiVersion: 4012,
  InvalidIntents: 4013,
  DisallowedIntents: 4014,
} as const;

/**
 * Intent bits. A bot only receives events whose intent it asked for, and
 * discord.js refuses to start if it needs one it did not declare, so honouring
 * these is what makes an off-the-shelf bot behave the way its author expects.
 */
export const GatewayIntent = {
  Guilds: 1 << 0,
  GuildMembers: 1 << 1,
  GuildModeration: 1 << 2,
  GuildEmojisAndStickers: 1 << 3,
  GuildIntegrations: 1 << 4,
  GuildWebhooks: 1 << 5,
  GuildInvites: 1 << 6,
  GuildVoiceStates: 1 << 7,
  GuildPresences: 1 << 8,
  GuildMessages: 1 << 9,
  GuildMessageReactions: 1 << 10,
  GuildMessageTyping: 1 << 11,
  DirectMessages: 1 << 12,
  DirectMessageReactions: 1 << 13,
  DirectMessageTyping: 1 << 14,
  MessageContent: 1 << 15,
  GuildScheduledEvents: 1 << 16,
  AutoModerationConfiguration: 1 << 20,
  AutoModerationExecution: 1 << 21,
  GuildMessagePolls: 1 << 24,
  DirectMessagePolls: 1 << 25,
} as const;

/**
 * Privileged intents. On Discord these need a toggle in the developer portal;
 * here a self-hosted bot owner already controls the server, so they are granted
 * rather than gated. The constant stays so the gateway can say so explicitly.
 */
export const PRIVILEGED_INTENTS =
  GatewayIntent.GuildMembers |
  GatewayIntent.GuildPresences |
  GatewayIntent.MessageContent;

export const ALL_INTENTS = Object.values(GatewayIntent).reduce(
  (all, bit) => all | bit,
  0,
);

/**
 * The widest value an IDENTIFY may carry. Unknown bits are accepted rather
 * than rejected: Discord keeps adding intents, and a client that asks for one
 * Hoffle has never heard of should lose that category of event, not the whole
 * connection. Refusing them closes 4013, which libraries treat as fatal.
 */
export const MAX_INTENTS = 0xffffffff;

/** Discord channel types. Hoffle only has a few of these to offer. */
export const ChannelType = {
  GuildText: 0,
  DM: 1,
  GuildVoice: 2,
  GroupDM: 3,
  GuildCategory: 4,
  GuildAnnouncement: 5,
  AnnouncementThread: 10,
  PublicThread: 11,
  PrivateThread: 12,
  GuildStageVoice: 13,
  GuildForum: 15,
} as const;

export const MessageType = {
  Default: 0,
  RecipientAdd: 1,
  ChannelPinnedMessage: 6,
  UserJoin: 7,
  Reply: 19,
  ChatInputCommand: 20,
  ContextMenuCommand: 23,
} as const;

export const InteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
  MessageComponent: 3,
  ApplicationCommandAutocomplete: 4,
  ModalSubmit: 5,
} as const;

export const InteractionResponseType = {
  Pong: 1,
  ChannelMessageWithSource: 4,
  DeferredChannelMessageWithSource: 5,
  DeferredUpdateMessage: 6,
  UpdateMessage: 7,
  ApplicationCommandAutocompleteResult: 8,
  Modal: 9,
} as const;

export const MessageFlags = {
  Ephemeral: 1 << 6,
  Loading: 1 << 7,
  SuppressNotifications: 1 << 12,
} as const;

/**
 * Permission bits as a bigint, because the full set overflows Number and
 * Discord serializes the bitfield as a decimal string for exactly that reason.
 */
export const Permission = {
  CreateInstantInvite: 1n << 0n,
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageGuild: 1n << 5n,
  AddReactions: 1n << 6n,
  ViewAuditLog: 1n << 7n,
  PrioritySpeaker: 1n << 8n,
  Stream: 1n << 9n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  SendTTSMessages: 1n << 12n,
  ManageMessages: 1n << 13n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  ReadMessageHistory: 1n << 16n,
  MentionEveryone: 1n << 17n,
  UseExternalEmojis: 1n << 18n,
  Connect: 1n << 20n,
  Speak: 1n << 21n,
  MuteMembers: 1n << 22n,
  DeafenMembers: 1n << 23n,
  MoveMembers: 1n << 24n,
  UseVAD: 1n << 25n,
  ChangeNickname: 1n << 26n,
  ManageNicknames: 1n << 27n,
  ManageRoles: 1n << 28n,
  ManageWebhooks: 1n << 29n,
  ManageEmojisAndStickers: 1n << 30n,
  UseApplicationCommands: 1n << 31n,
  ManageThreads: 1n << 34n,
  CreatePublicThreads: 1n << 35n,
  CreatePrivateThreads: 1n << 36n,
  SendMessagesInThreads: 1n << 38n,
  ModerateMembers: 1n << 40n,
} as const;

/** What an ordinary member can do: Discord's @everyone default, near enough. */
export const DEFAULT_PERMISSIONS =
  Permission.CreateInstantInvite |
  Permission.AddReactions |
  Permission.Stream |
  Permission.ViewChannel |
  Permission.SendMessages |
  Permission.EmbedLinks |
  Permission.AttachFiles |
  Permission.ReadMessageHistory |
  Permission.UseExternalEmojis |
  Permission.Connect |
  Permission.Speak |
  Permission.UseVAD |
  Permission.ChangeNickname |
  Permission.UseApplicationCommands;

export const ALL_PERMISSIONS = Object.values(Permission).reduce(
  (all, bit) => all | bit,
  0n,
);

/** Events the gateway can dispatch, grouped by the intent that gates them. */
export const EVENT_INTENTS: Record<string, number> = {
  READY: 0,
  RESUMED: 0,
  GUILD_CREATE: GatewayIntent.Guilds,
  GUILD_UPDATE: GatewayIntent.Guilds,
  GUILD_DELETE: GatewayIntent.Guilds,
  CHANNEL_CREATE: GatewayIntent.Guilds,
  CHANNEL_UPDATE: GatewayIntent.Guilds,
  CHANNEL_DELETE: GatewayIntent.Guilds,
  CHANNEL_PINS_UPDATE: GatewayIntent.Guilds,
  THREAD_CREATE: GatewayIntent.Guilds,
  THREAD_UPDATE: GatewayIntent.Guilds,
  THREAD_DELETE: GatewayIntent.Guilds,
  GUILD_ROLE_CREATE: GatewayIntent.Guilds,
  GUILD_ROLE_UPDATE: GatewayIntent.Guilds,
  GUILD_ROLE_DELETE: GatewayIntent.Guilds,
  GUILD_MEMBER_ADD: GatewayIntent.GuildMembers,
  GUILD_MEMBER_UPDATE: GatewayIntent.GuildMembers,
  GUILD_MEMBER_REMOVE: GatewayIntent.GuildMembers,
  GUILD_MEMBERS_CHUNK: 0,
  GUILD_BAN_ADD: GatewayIntent.GuildModeration,
  GUILD_BAN_REMOVE: GatewayIntent.GuildModeration,
  GUILD_EMOJIS_UPDATE: GatewayIntent.GuildEmojisAndStickers,
  GUILD_STICKERS_UPDATE: GatewayIntent.GuildEmojisAndStickers,
  MESSAGE_CREATE: GatewayIntent.GuildMessages,
  MESSAGE_UPDATE: GatewayIntent.GuildMessages,
  MESSAGE_DELETE: GatewayIntent.GuildMessages,
  MESSAGE_DELETE_BULK: GatewayIntent.GuildMessages,
  MESSAGE_REACTION_ADD: GatewayIntent.GuildMessageReactions,
  MESSAGE_REACTION_REMOVE: GatewayIntent.GuildMessageReactions,
  MESSAGE_REACTION_REMOVE_ALL: GatewayIntent.GuildMessageReactions,
  TYPING_START: GatewayIntent.GuildMessageTyping,
  PRESENCE_UPDATE: GatewayIntent.GuildPresences,
  VOICE_STATE_UPDATE: GatewayIntent.GuildVoiceStates,
  // Interactions are never gated: Discord always delivers them, because they
  // are a direct response to someone invoking that specific bot.
  INTERACTION_CREATE: 0,
};

/** DM variants of the message intents, for events in a DM channel. */
export const DM_EVENT_INTENTS: Record<string, number> = {
  MESSAGE_CREATE: GatewayIntent.DirectMessages,
  MESSAGE_UPDATE: GatewayIntent.DirectMessages,
  MESSAGE_DELETE: GatewayIntent.DirectMessages,
  MESSAGE_REACTION_ADD: GatewayIntent.DirectMessageReactions,
  MESSAGE_REACTION_REMOVE: GatewayIntent.DirectMessageReactions,
  TYPING_START: GatewayIntent.DirectMessageTyping,
};

/** Whether a bot with these intents should receive this event. */
export function intentAllows(
  event: string,
  intents: number,
  isDirectMessage = false,
): boolean {
  const required = isDirectMessage
    ? (DM_EVENT_INTENTS[event] ?? EVENT_INTENTS[event])
    : EVENT_INTENTS[event];
  if (required === undefined) return false;
  if (required === 0) return true;
  return (intents & required) !== 0;
}
